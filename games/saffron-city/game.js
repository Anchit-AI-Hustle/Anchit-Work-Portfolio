/*
 * Saffron City: an original top-down open-world city sandbox.
 * Invented coastal megacity, family friendly: no weapons, trouble comes from
 * reckless driving and borrowing cars. Everything is drawn in code.
 */
(function () {
  'use strict';

  const TAU = Math.PI * 2, PI = Math.PI;
  const W = 5120, CELL = 16, GW = 320, TILE = 512, TN = 10;
  const clamp = Arcade.clamp, lerp = Arcade.lerp;
  const wrapA = (a) => { a = (a + PI) % TAU; if (a < 0) a += TAU; return a - PI; };
  const sm = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const rr = Math.random;
  const pick = (arr) => arr[(rr() * arr.length) | 0];
  const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const hyp = Math.hypot;

  /* ---------------------------------------------------------------- colour */
  const hex2rgb = (h) => {
    h = h.replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const rgb = (r, g, b) => 'rgb(' + (r | 0) + ',' + (g | 0) + ',' + (b | 0) + ')';
  const shade = (h, f) => { const c = hex2rgb(h); return rgb(c[0] * f, c[1] * f, c[2] * f); };
  const rgba = (h, a) => { const c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  const mixHex = (a, b, t) => { const p = hex2rgb(a), q = hex2rgb(b); return rgb(lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)); };
  const hash2 = (a, b, s) => {
    let h = (a * 374761393 + b * 668265263 + (s || 0) * 2147483647) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };

  /* ---------------------------------------------------------------- vehicles */
  const VT = {
    hatch:  { name: 'Hatchback', L: 44, Wd: 23, vmax: 330, acc: 250, brake: 540, grip: 7.5, steer: 2.7, mass: 1, hp: 100, circ: [-12, 0, 12], r: 11.5, cols: ['#e8e2d4', '#c0392b', '#2f6fb0', '#e1a41a', '#3c8d5a', '#8a8f96', '#d9772b'] },
    coupe:  { name: 'Sports coupe', L: 48, Wd: 22, vmax: 470, acc: 390, brake: 620, grip: 6.2, steer: 2.9, mass: 0.9, hp: 90, circ: [-14, 0, 14], r: 11, cols: ['#d4263a', '#1f6dd4', '#f0a81b', '#1c1c1f', '#7d4e9d'] },
    auto:   { name: 'Auto-rickshaw', L: 32, Wd: 20, vmax: 235, acc: 190, brake: 430, grip: 5.2, steer: 3.3, mass: 0.6, hp: 70, circ: [-7, 7], r: 9.5, cols: ['#f1c232', '#f1c232', '#3c8d5a'] },
    van:    { name: 'Delivery van', L: 58, Wd: 27, vmax: 290, acc: 170, brake: 430, grip: 6.2, steer: 2.0, mass: 1.7, hp: 140, circ: [-18, 0, 18], r: 13.5, cols: ['#f2f0ea', '#2f6fb0', '#c0392b', '#e8e2d4'] },
    bike:   { name: 'Scooter', L: 24, Wd: 10, vmax: 370, acc: 310, brake: 560, grip: 8.5, steer: 3.8, mass: 0.35, hp: 50, circ: [-5, 5], r: 5.5, cols: ['#d9772b', '#2e8ea8', '#c0392b', '#e8e2d4'] },
    police: { name: 'Police cruiser', L: 48, Wd: 24, vmax: 430, acc: 340, brake: 600, grip: 6.6, steer: 2.8, mass: 1.1, hp: 120, circ: [-14, 0, 14], r: 12, cols: ['#f2f2f2'] },
  };

  /* ---------------------------------------------------------------- road network */
  // Left-hand traffic, as in the city this is invented from.
  const XC = [760, 1060, 1320, 1660, 2180, 2460, 2780, 3080, 3440, 3720, 4050, 4350, 4600, 4880];
  const YC = [160, 440, 740, 1220, 1480, 1810, 2100, 2400, 2750, 3020, 3340, 3640, 3980, 4260, 4560, 4880];
  const NX = XC.length, NY = YC.length;
  const XBL = [0, 7], YBL = [6, 12];
  const XR = XC.map((c, i) => { const b = XBL.indexOf(i) >= 0; return { c, blvd: b, hw: b ? 70 : 42, lanes: b ? 2 : 1 }; });
  const YR = YC.map((c, j) => { const b = YBL.indexOf(j) >= 0; return { c, blvd: b, hw: b ? 70 : 42, lanes: b ? 2 : 1 }; });
  const laneOff = (R, k) => (R.blvd ? 21 + 30 * k : 15);
  const shore = (y) => 500 + 36 * Math.sin(y / 330) + 24 * Math.sin(y / 110 + 1.3);
  const SAND = 54;

  const DISTRICTS = [
    { id: 'docks', name: 'Bandar Docks', test: (x, y) => y > 3700 && x < 2300 },
    { id: 'marine', name: 'Marine Parade', test: (x) => x < 1010 },
    { id: 'fort', name: 'Qila Quarter', test: (x, y) => x > 1420 && x < 2420 && y > 380 && y < 1560 },
    { id: 'bazaar', name: 'Chowk Bazaar', test: (x, y) => x > 2250 && x < 3600 && y > 1500 && y < 2950 },
    { id: 'heights', name: 'Malabar Heights', test: (x, y) => x > 3500 && y < 2500 },
    { id: 'biz', name: 'Navi Business Park', test: (x, y) => x > 3300 && y > 2950 },
    { id: 'res', name: 'Lakshmi Nagar', test: () => true },
  ];
  const districtAt = (x, y) => { for (let i = 0; i < DISTRICTS.length; i++) if (DISTRICTS[i].test(x, y)) return DISTRICTS[i]; return DISTRICTS[DISTRICTS.length - 1]; };

  const DP = {
    res:     { sw: 16, gap: 4, lotMax: 104, lotMin: 50, hmin: 22, hmax: 46, emptyP: 0.07, parkP: 0.12, treeP: 0.6, walk: '#bdb6a6', yard: '#8f897c',
               roofs: ['#d9a37a', '#c47a5c', '#e3c9a2', '#b8b2a6', '#9fb7c9', '#e8b4a0', '#c9b28c', '#8fae9c'] },
    bazaar:  { sw: 14, gap: 3, lotMax: 70, lotMin: 34, hmin: 14, hmax: 30, emptyP: 0.04, parkP: 0, treeP: 0.18, walk: '#b9a98f', yard: '#857a67',
               roofs: ['#e0584b', '#e8a33a', '#3aa6b5', '#5b7fd1', '#c9477f', '#7bb35a', '#f0c14b', '#d97b3a'] },
    fort:    { sw: 16, gap: 4, lotMax: 84, lotMin: 44, hmin: 18, hmax: 36, emptyP: 0.06, parkP: 0.05, treeP: 0.45, walk: '#c9b48e', yard: '#9c8a68',
               roofs: ['#c9955f', '#bf8450', '#d9ab72', '#b97a4a', '#cfa070'] },
    heights: { sw: 14, gap: 4, lotMax: 168, lotMin: 100, hmin: 14, hmax: 28, emptyP: 0, parkP: 0.1, treeP: 0.8, walk: '#c4bfae', yard: '#7aa05a',
               roofs: ['#f0e6d6', '#c46a4a', '#e7dcc8', '#d8cdb8', '#b86a50'] },
    biz:     { sw: 34, gap: 6, lotMax: 150, lotMin: 90, hmin: 60, hmax: 100, emptyP: 0.0, parkP: 0.12, treeP: 0.7, walk: '#c8c8c4', yard: '#9a9c9c',
               roofs: ['#2e5f78', '#335b6b', '#3b6e88', '#294a63', '#4a7a8c'] },
    docks:   { sw: 14, gap: 4, lotMax: 190, lotMin: 110, hmin: 16, hmax: 26, emptyP: 0.04, parkP: 0, treeP: 0.05, walk: '#a9a8a0', yard: '#7d7c76',
               roofs: ['#7d8791', '#8a7f72', '#6f7b86', '#9a9084'] },
    marine:  { sw: 24, gap: 4, lotMax: 110, lotMin: 60, hmin: 34, hmax: 62, emptyP: 0.03, parkP: 0.08, treeP: 0.7, walk: '#d0c9b8', yard: '#9a9484',
               roofs: ['#f3eadb', '#e6d3b4', '#dbe6e8', '#f0c9b0', '#d9e3c7'] },
  };

  /* ---------------------------------------------------------------- city storage */
  const SOLID = new Uint8Array(GW * GW);
  const BK = [];
  for (let i = 0; i < TN * TN; i++) BK.push({ g: [], f: [], b: [], t: [], l: [] });
  const BLD = [];          // every building, for the minimap
  const LAMPS = [];        // street lamps
  const PARKS = [];        // park rects for the minimap
  const MMOPS = [];        // extra minimap fills
  const SAFE = [];         // safehouses
  const BLOCKS = [];

  function put(cat, obj, x0, y0, x1, y1) {
    const a = clamp(Math.floor(x0 / TILE), 0, TN - 1), b = clamp(Math.floor(x1 / TILE), 0, TN - 1);
    const c = clamp(Math.floor(y0 / TILE), 0, TN - 1), d = clamp(Math.floor(y1 / TILE), 0, TN - 1);
    for (let ty = c; ty <= d; ty++) for (let tx = a; tx <= b; tx++) BK[ty * TN + tx][cat].push(obj);
  }
  const putFn = (cat, x0, y0, x1, y1, fn) => put(cat, { fn }, x0, y0, x1, y1);

  function solidRect(x0, y0, x1, y1, pad) {
    pad = pad == null ? 4 : pad;
    const i0 = Math.max(0, Math.floor((x0 - pad) / CELL)), i1 = Math.min(GW - 1, Math.floor((x1 + pad) / CELL));
    const j0 = Math.max(0, Math.floor((y0 - pad) / CELL)), j1 = Math.min(GW - 1, Math.floor((y1 + pad) / CELL));
    for (let j = j0; j <= j1; j++) {
      const cy = (j + 0.5) * CELL; if (cy < y0 - pad || cy > y1 + pad) continue;
      for (let i = i0; i <= i1; i++) { const cx = (i + 0.5) * CELL; if (cx >= x0 - pad && cx <= x1 + pad) SOLID[j * GW + i] = 1; }
    }
  }
  function clearRect(x0, y0, x1, y1) {
    const i0 = Math.max(0, Math.floor(x0 / CELL)), i1 = Math.min(GW - 1, Math.floor(x1 / CELL));
    const j0 = Math.max(0, Math.floor(y0 / CELL)), j1 = Math.min(GW - 1, Math.floor(y1 / CELL));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) SOLID[j * GW + i] = 0;
  }
  const solidAt = (x, y) => { const i = (x / CELL) | 0, j = (y / CELL) | 0; return i < 0 || j < 0 || i >= GW || j >= GW || SOLID[j * GW + i] === 1; };

  /* ---------------------------------------------------------------- generation helpers */
  const cr = Arcade.rng(20261102);
  const crp = (a) => a[(cr() * a.length) | 0];
  const crr = (a, b) => a + cr() * (b - a);

  function addBuilding(o) {
    // o: x y w d h rc kind dec
    o.k = o.k || 'bld';
    if (!o.rc) o.rc = '#b8b2a6';
    o.wl = o.wl || shade(o.rc, 0.62);
    o.we = o.we || shade(o.rc, 0.46);
    o.rt = o.rt || shade(o.rc, 1.08);
    o.seed = (cr() * 1e6) | 0;
    const ox = -o.h * 0.12, oy = -o.h * 0.30;
    const sx = o.h * 0.36, sy = o.h * 0.28;
    o.x0 = Math.min(o.x, o.x + ox) - 2; o.y0 = Math.min(o.y, o.y + oy) - 2;
    o.x1 = o.x + o.w + sx + 2; o.y1 = o.y + o.d + sy + 2;
    if (o.solid !== false) solidRect(o.x, o.y, o.x + o.w, o.y + o.d);
    BLD.push(o);
    return o;
  }
  function addTree(x, y, r, kind, solid) {
    const pals = [['#2f6b35', '#3f8a44', '#58a653'], ['#2a5f3a', '#3a7d4b', '#4f9a5f'], ['#3b6e2e', '#52903d', '#74b04e']];
    const p = kind === 'flower' ? [['#b8452a', '#d9622f', '#f08a3c'], ['#c79a22', '#e0b83a', '#f3d765']][(cr() * 2) | 0] : crp(pals);
    const t = { x, y, r, c0: p[0], c1: p[1], c2: p[2], k: kind || 'tree', rot: cr() * TAU };
    put('t', t, x - r - 6, y - r - 6, x + r + 10, y + r + 10);
    if (solid) solidRect(x - 3, y - 3, x + 3, y + 3, 5);
    return t;
  }
  function addLamp(x, y, ang) {
    const l = { x, y, a: ang };
    LAMPS.push(l);
    put('l', l, x - 12, y - 12, x + 12, y + 12);
  }

  // Recursive lot subdivision (a binary space partition of the block interior).
  function subdivide(x, y, w, h, mx, mn, out, dep) {
    if ((w <= mx && h <= mx) || dep > 5) { out.push({ x, y, w, d: h }); return; }
    const horiz = w > h, len = horiz ? w : h;
    if (len < mn * 2) { out.push({ x, y, w, d: h }); return; }
    const a = clamp(Math.round(len * (0.4 + cr() * 0.2)), mn, len - mn);
    if (horiz) { subdivide(x, y, a, h, mx, mn, out, dep + 1); subdivide(x + a, y, w - a, h, mx, mn, out, dep + 1); }
    else { subdivide(x, y, w, a, mx, mn, out, dep + 1); subdivide(x, y + a, w, h - a, mx, mn, out, dep + 1); }
  }

  function roofDeco(b, d) {
    const dec = [];
    const n = b.w * b.d > 3000 ? 3 : b.w * b.d > 1400 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const r = cr();
      const px = 6 + cr() * Math.max(2, b.w - 22), py = 6 + cr() * Math.max(2, b.d - 22);
      if (d.id === 'biz') { if (i === 0 && cr() < 0.35) dec.push({ t: 'heli', px: b.w / 2, py: b.d / 2 }); else dec.push({ t: 'box', px, py, w: 14, h: 12 }); }
      else if (r < 0.28) dec.push({ t: 'tank', px: px + 5, py: py + 5, r: 5 });
      else if (r < 0.55) dec.push({ t: 'ac', px, py });
      else if (r < 0.7) dec.push({ t: 'solar', px, py, w: 18, h: 10 });
      else if (r < 0.85) dec.push({ t: 'box', px, py, w: 11, h: 9 });
      else dec.push({ t: 'tank', px: px + 5, py: py + 5, r: 4 });
    }
    return dec;
  }

  function genLots(ix, iy, iw, ih, d) {
    const P = DP[d.id];
    const lots = []; subdivide(ix, iy, iw, ih, P.lotMax, P.lotMin, lots, 0);
    for (const L of lots) {
      const g = P.gap;
      const bx = L.x + g, by = L.y + g, bw = L.w - 2 * g, bd = L.d - 2 * g;
      if (bw < 16 || bd < 16) continue;
      if (cr() < P.emptyP) {
        const tx = bx + bw / 2, ty = by + bd / 2;
        for (let k = 0; k < 2; k++) addTree(tx + crr(-bw / 3, bw / 3), ty + crr(-bd / 3, bd / 3), crr(8, 12), 'tree', false);
        continue;
      }
      let h = crr(P.hmin, P.hmax);
      const rc = crp(P.roofs);
      const b = addBuilding({ x: bx, y: by, w: bw, d: bd, h, rc, ds: d.id });
      b.dec = roofDeco(b, d);
      if (d.id === 'bazaar') {
        b.awn = crp(['#e0584b', '#e8a33a', '#3aa6b5', '#c9477f', '#7bb35a']);
        if (cr() < 0.5) b.neon = crp(['#ff3b8a', '#35e0ff', '#ffd23b', '#7dff6b']);
      }
      if (d.id === 'biz') { b.glass = true; if (cr() < 0.55) b.beacon = true; }
      if (d.id === 'marine' && cr() < 0.4) b.neon = crp(['#ff9a3b', '#ff3b8a', '#35e0ff']);
      if (d.id === 'fort' && cr() < 0.22) b.dome = { px: bw / 2, py: bd / 2, r: Math.min(bw, bd) * 0.28, c: crp(['#e8dcc0', '#c9a24a', '#3aa6b5']) };
      if (d.id === 'docks') { b.ribs = true; }
    }
  }

  function streetTreesAndLamps(x0, y0, x1, y1, d, sw) {
    const P = DP[d.id];
    const e = Math.min(sw / 2, 9);
    const edges = [
      { ax: 'x', a: x0 + 28, b: x1 - 28, fix: y0 + e, ang: PI / 2 },
      { ax: 'x', a: x0 + 28, b: x1 - 28, fix: y1 - e, ang: -PI / 2 },
      { ax: 'y', a: y0 + 28, b: y1 - 28, fix: x0 + e, ang: 0 },
      { ax: 'y', a: y0 + 28, b: y1 - 28, fix: x1 - e, ang: PI },
    ];
    for (const E of edges) {
      let n = 0;
      for (let p = E.a + crr(0, 20); p < E.b; p += 52, n++) {
        const px = E.ax === 'x' ? p : E.fix, py = E.ax === 'x' ? E.fix : p;
        if (n % 3 === 0) addLamp(px, py, E.ang);
        else if (cr() < P.treeP) addTree(px, py, crr(6.5, 9), d.id === 'res' && cr() < 0.2 ? 'flower' : 'tree', false);
      }
    }
  }

  /* ---- special blocks */
  function genPark(x0, y0, x1, y1, d) {
    const w = x1 - x0, h = y1 - y0;
    const v = (cr() * 3) | 0;
    PARKS.push([x0, y0, w, h]);
    putFn('g', x0, y0, x1, y1, (c) => {
      c.fillStyle = '#5f9a4e'; c.fillRect(x0, y0, w, h);
      c.fillStyle = 'rgba(255,255,255,.07)';
      for (let i = 0; i < 14; i++) { const hx = x0 + hash2(i, x0, 3) * w, hy = y0 + hash2(i, y0, 4) * h; c.beginPath(); c.ellipse(hx, hy, 26 + hash2(i, 5, 6) * 30, 14 + hash2(i, 7, 8) * 20, hash2(i, 9, 1) * PI, 0, TAU); c.fill(); }
    });
    const cx = x0 + w / 2, cy = y0 + h / 2;
    if (v === 0) { // pond garden
      putFn('f', x0, y0, x1, y1, (c) => {
        c.strokeStyle = '#d9cdb0'; c.lineWidth = 7; c.lineCap = 'round';
        c.beginPath(); c.moveTo(x0 + 10, cy); c.lineTo(x1 - 10, cy); c.moveTo(cx, y0 + 10); c.lineTo(cx, y1 - 10); c.stroke();
        c.fillStyle = '#d9cdb0'; c.beginPath(); c.ellipse(cx, cy, 38, 30, 0, 0, TAU); c.fill();
        const gr = c.createRadialGradient(cx, cy, 4, cx, cy, 32); gr.addColorStop(0, '#5fb6c9'); gr.addColorStop(1, '#2f7f98');
        c.fillStyle = gr; c.beginPath(); c.ellipse(cx, cy, 32, 25, 0, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(cx, cy, 20, 14, 0, 0, TAU); c.stroke();
      });
      solidRect(cx - 30, cy - 24, cx + 30, cy + 24);
    } else if (v === 1) { // sports ground
      putFn('f', x0, y0, x1, y1, (c) => {
        const rw = Math.min(w - 30, 170), rh = Math.min(h - 30, 120);
        c.fillStyle = '#4f8c42'; c.beginPath(); c.ellipse(cx, cy, rw / 2 + 6, rh / 2 + 6, 0, 0, TAU); c.fill();
        c.fillStyle = '#7ab55a'; c.beginPath(); c.ellipse(cx, cy, rw / 2, rh / 2, 0, 0, TAU); c.fill();
        c.fillStyle = '#d8c9a0'; c.fillRect(cx - 5, cy - 22, 10, 44);
        c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(cx, cy, rw / 2 - 4, rh / 2 - 4, 0, 0, TAU); c.stroke();
      });
    } else { // playground
      putFn('f', x0, y0, x1, y1, (c) => {
        c.fillStyle = '#d9b56a'; c.fillRect(cx - 50, cy - 36, 100, 72);
        const cols = ['#e0584b', '#3aa6b5', '#f0c14b', '#5b7fd1'];
        for (let i = 0; i < 4; i++) { c.fillStyle = cols[i]; c.beginPath(); c.arc(cx - 30 + i * 20, cy + (i % 2 ? 8 : -8), 7, 0, TAU); c.fill(); }
        c.strokeStyle = '#e8e2d4'; c.lineWidth = 2; c.strokeRect(cx - 50, cy - 36, 100, 72);
      });
    }
    for (let i = 0; i < 20; i++) {
      const tx = x0 + 14 + cr() * (w - 28), ty = y0 + 14 + cr() * (h - 28);
      if (Math.abs(tx - cx) < 46 && Math.abs(ty - cy) < 36) continue;
      addTree(tx, ty, crr(9, 15), cr() < 0.12 ? 'flower' : 'tree', false);
    }
  }

  function genFort(x0, y0, x1, y1) {
    const w = x1 - x0, h = y1 - y0;
    const wx0 = x0 + 22, wy0 = y0 + 22, wx1 = x1 - 22, wy1 = y1 - 22, T = 16;
    putFn('g', x0, y0, x1, y1, (c) => {
      c.fillStyle = '#b8a67e'; c.fillRect(x0, y0, w, h);
      c.fillStyle = '#d6c4a0'; c.fillRect(wx0, wy0, wx1 - wx0, wy1 - wy0);
      c.strokeStyle = 'rgba(120,96,60,.18)'; c.lineWidth = 1;
      for (let x = wx0; x < wx1; x += 20) { c.beginPath(); c.moveTo(x, wy0); c.lineTo(x, wy1); c.stroke(); }
      for (let y = wy0; y < wy1; y += 20) { c.beginPath(); c.moveTo(wx0, y); c.lineTo(wx1, y); c.stroke(); }
    });
    const mx = (wx0 + wx1) / 2, my = (wy0 + wy1) / 2, gate = 32;
    const wallC = '#caa56d';
    const seg = (a, b, c2, d2) => addBuilding({ x: a, y: b, w: c2 - a, d: d2 - b, h: 15, rc: wallC, k: 'wall' });
    seg(wx0, wy0, wx1, wy0 + T);                       // north wall
    seg(wx0, wy1 - T, mx - gate, wy1); seg(mx + gate, wy1 - T, wx1, wy1);   // south wall with gate
    seg(wx0, wy0 + T, wx0 + T, my - gate); seg(wx0, my + gate, wx0 + T, wy1 - T);   // west wall with gate
    seg(wx1 - T, wy0 + T, wx1, wy1 - T);               // east wall
    const bast = [[wx0, wy0], [wx1, wy0], [wx0, wy1], [wx1, wy1], [mx, wy0], [wx1, my]];
    for (const bp of bast) addBuilding({ x: bp[0] - 17, y: bp[1] - 17, w: 34, d: 34, h: 24, rc: '#d2ad74', k: 'round' });
    // palace
    const pw = 150, pd = 92, px = mx - pw / 2, py = my - pd / 2 - 20;
    const pal = addBuilding({ x: px, y: py, w: pw, d: pd, h: 40, rc: '#e8d3a8', ds: 'fort' });
    pal.dec = []; pal.dome = { px: pw / 2, py: pd / 2, r: 24, c: '#f0e6c8' }; pal.chhatri = true; pal.neon = null;
    addBuilding({ x: px - 70, y: py + 26, w: 46, d: 40, h: 22, rc: '#d9ab72', ds: 'fort' }).dec = [];
    addBuilding({ x: px + pw + 24, y: py + 26, w: 46, d: 40, h: 22, rc: '#d9ab72', ds: 'fort' }).dec = [];
    putFn('f', x0, y0, x1, y1, (c) => {
      c.fillStyle = '#6b9a4c'; c.fillRect(mx - 120, my + 52, 76, 44); c.fillRect(mx + 44, my + 52, 76, 44);
      c.strokeStyle = '#e8d9b0'; c.lineWidth = 2; c.strokeRect(mx - 120, my + 52, 76, 44); c.strokeRect(mx + 44, my + 52, 76, 44);
      c.fillStyle = '#e8d9b0'; c.beginPath(); c.arc(mx, my + 74, 16, 0, TAU); c.fill();
      c.fillStyle = '#4f9fb0'; c.beginPath(); c.arc(mx, my + 74, 11, 0, TAU); c.fill();
    });
    solidRect(mx - 11, my + 63, mx + 11, my + 85);
    for (const tp of [[mx - 100, my + 62], [mx - 60, my + 86], [mx + 60, my + 62], [mx + 100, my + 86]]) addTree(tp[0], tp[1], 9, 'tree', false);
  }

  function genChowk(x0, y0, x1, y1) {
    const w = x1 - x0, h = y1 - y0, cx = x0 + w / 2, cy = y0 + h / 2;
    putFn('g', x0, y0, x1, y1, (c) => {
      c.fillStyle = '#c9a77a'; c.fillRect(x0, y0, w, h);
      c.strokeStyle = 'rgba(90,60,30,.16)'; c.lineWidth = 1;
      for (let x = x0; x <= x1; x += 18) { c.beginPath(); c.moveTo(x, y0); c.lineTo(x, y1); c.stroke(); }
      for (let y = y0; y <= y1; y += 18) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); }
      c.strokeStyle = 'rgba(224,88,75,.25)'; c.lineWidth = 6;
      c.beginPath(); c.arc(cx, cy, 52, 0, TAU); c.stroke();
    });
    const tw = addBuilding({ x: cx - 13, y: cy - 13, w: 26, d: 26, h: 78, rc: '#e8d9b8', k: 'round' });
    tw.clock = true;
    // stalls: low colourful awnings round the edge, walkable
    const awn = ['#e0584b', '#e8a33a', '#3aa6b5', '#c9477f', '#7bb35a', '#5b7fd1'];
    const stalls = [];
    for (let x = x0 + 14; x < x1 - 30; x += 34) { stalls.push([x, y0 + 12]); stalls.push([x, y1 - 30]); }
    for (let y = y0 + 52; y < y1 - 52; y += 30) { stalls.push([x0 + 12, y]); stalls.push([x1 - 32, y]); }
    stalls.forEach((s, i) => {
      const col = awn[(i * 7 + 3) % awn.length];
      put('b', { k: 'stall', x: s[0], y: s[1], w: 22, d: 16, h: 6, col, x0: s[0] - 2, y0: s[1] - 4, x1: s[0] + 30, y1: s[1] + 26, solid: false }, s[0] - 2, s[1] - 4, s[0] + 30, s[1] + 26);
    });
    for (const s of stalls) solidRect(s[0] + 3, s[1] + 3, s[0] + 19, s[1] + 13, 0);
  }

  function genDockYard(x0, y0, x1, y1) {
    const w = x1 - x0, h = y1 - y0;
    putFn('g', x0, y0, x1, y1, (c) => { c.fillStyle = '#8d8d86'; c.fillRect(x0, y0, w, h); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 2; c.setLineDash([10, 8]); for (let y = y0 + 12; y < y1; y += 48) { c.beginPath(); c.moveTo(x0, y); c.lineTo(x1, y); c.stroke(); } c.setLineDash([]); });
    const cols = ['#c0392b', '#2e7d9a', '#e1a41a', '#3c8d5a', '#7d4e9d', '#d9772b', '#8a8f96', '#2f5fa8'];
    let row = 0;
    for (let y = y0 + 16; y + 18 < y1 - 12; y += 26, row++) {
      if (row % 4 === 3) continue;
      let col = 0;
      for (let x = x0 + 14; x + 42 < x1 - 12; x += 48, col++) {
        if (col % 4 === 3) continue;
        if (cr() < 0.12) continue;
        const lv = 1 + ((cr() * 3) | 0);
        addBuilding({ x, y, w: 40, d: 16, h: 6 + lv * 5, rc: cols[(cr() * cols.length) | 0], k: 'container' });
      }
    }
  }

  function genVillas(ix, iy, iw, ih, d) {
    const lots = []; subdivide(ix, iy, iw, ih, DP.heights.lotMax, DP.heights.lotMin, lots, 0);
    for (const L of lots) {
      const x = L.x + 2, y = L.y + 2, w = L.w - 4, h = L.d - 4;
      if (w < 40 || h < 40) continue;
      putFn('g', x, y, x + w, y + h, (c) => {
        c.fillStyle = '#6f9f50'; c.fillRect(x, y, w, h);
        c.strokeStyle = 'rgba(240,235,220,.55)'; c.lineWidth = 2; c.strokeRect(x + 1, y + 1, w - 2, h - 2);
      });
      const bw = w * crr(0.42, 0.55), bd = h * crr(0.38, 0.5);
      const bx = x + (w - bw) * crr(0.25, 0.75), by = y + h * 0.28 + (h * 0.5 - bd) * cr();
      const rc = crp(DP.heights.roofs);
      const b = addBuilding({ x: bx, y: by, w: bw, d: bd, h: crr(14, 26), rc, ds: 'heights' });
      b.dec = [{ t: 'ac', px: 6, py: 6 }]; b.tiles = rc === '#c46a4a' || rc === '#b86a50';
      if (cr() < 0.45) {
        const px = x + 8 + cr() * (w - 70), py = (by + bd + 10 < y + h - 28) ? by + bd + 10 : y + 6;
        putFn('f', px, py, px + 50, py + 26, (c) => { c.fillStyle = '#e8e2d4'; c.fillRect(px - 2, py - 2, 54, 30); const g = c.createLinearGradient(px, py, px + 50, py + 26); g.addColorStop(0, '#6fd0e6'); g.addColorStop(1, '#2f9fc0'); c.fillStyle = g; c.fillRect(px, py, 50, 26); });
      }
      for (let k = 0; k < 6; k++) addTree(x + 8 + cr() * (w - 16), y + 8 + cr() * (h - 16), crr(7, 11), cr() < 0.15 ? 'flower' : 'tree', false);
    }
  }

  /* ---------------------------------------------------------------- build the city */
  function buildCity() {
    // Boundary and sea
    for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) {
      const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL;
      if (i < 2 || j < 2 || i >= GW - 2 || j >= GW - 2 || cx < shore(cy) + 8) SOLID[j * GW + i] = 1;
    }
    // Block grid
    for (let bj = 0; bj < NY - 1; bj++) for (let bi = 0; bi < NX - 1; bi++) {
      const x0 = XC[bi] + XR[bi].hw, x1 = XC[bi + 1] - XR[bi + 1].hw;
      const y0 = YC[bj] + YR[bj].hw, y1 = YC[bj + 1] - YR[bj + 1].hw;
      const d = districtAt((x0 + x1) / 2, (y0 + y1) / 2);
      const P = DP[d.id];
      BLOCKS.push([x0, y0, x1, y1, d.id]);
      putFn('g', x0, y0, x1, y1, (c) => { c.fillStyle = P.walk; c.fillRect(x0, y0, x1 - x0, y1 - y0); });
      const sw = P.sw, ix = x0 + sw, iy = y0 + sw, iw = x1 - x0 - 2 * sw, ih = y1 - y0 - 2 * sw;
      if (iw < 30 || ih < 30) continue;
      let special = null;
      if (bi === 3 && bj === 2) special = 'fort';
      else if (bi === 5 && bj === 6) special = 'chowk';
      else if (d.id === 'docks' && bj >= 12 && (bi === 1 || bi === 2)) special = 'yard';
      else if (d.id === 'heights') special = cr() < 0.12 ? 'park' : 'villas';
      else if (P.parkP && cr() < P.parkP) special = 'park';
      if (special === 'fort') { genFort(x0, y0, x1, y1); }
      else if (special === 'chowk') { genChowk(x0, y0, x1, y1); }
      else if (special === 'yard') { genDockYard(x0, y0, x1, y1); }
      else if (special === 'park') { genPark(ix, iy, ix + iw, iy + ih, d); }
      else {
        putFn('g', ix, iy, ix + iw, iy + ih, (c) => { c.fillStyle = P.yard; c.fillRect(ix, iy, iw, ih); });
        if (special === 'villas') genVillas(ix, iy, iw, ih, d); else genLots(ix, iy, iw, ih, d);
      }
      streetTreesAndLamps(x0, y0, x1, y1, d, sw);
    }
    // Promenade, beach, palms, benches
    for (let y = 40; y < W - 40; y += 66) {
      const s = shore(y) + SAND, px = s + (690 - s) * 0.38;
      addTree(px, y, 13, 'palm', false);
      if ((y / 66 | 0) % 2 === 0) put('f', { fn: (c) => { c.fillStyle = '#6a4a2e'; c.fillRect(px + 26, y - 6, 8, 18); c.fillStyle = '#8a6540'; c.fillRect(px + 27, y - 5, 6, 16); } }, px + 20, y - 10, px + 40, y + 20);
      if ((y / 66 | 0) % 3 === 1) addLamp(s + (690 - s) * 0.72, y, 0);
    }
    // North / south / east margins: dense trees
    for (let k = 0; k < 160; k++) {
      const side = k % 3; let x, y;
      if (side === 0) { x = 700 + cr() * (W - 700); y = 20 + cr() * 90; }
      else if (side === 1) { x = 700 + cr() * (W - 700); y = YC[NY - 1] + 62 + cr() * 130; }
      else { x = XC[NX - 1] + 62 + cr() * 150; y = 120 + cr() * (YC[NY - 1] - 100); }
      addTree(x, y, crr(11, 18), cr() < 0.1 ? 'flower' : 'tree', false);
    }
    // Docks: concrete apron, fingers, ship, cranes, bollards
    const apron = [440, 3960, 690, 4520], f1 = [300, 4030, 440, 4082], f2 = [300, 4420, 440, 4472];
    clearRect(apron[0], apron[1], apron[2], apron[3]); clearRect(f1[0], f1[1], f1[2], f1[3]); clearRect(f2[0], f2[1], f2[2], f2[3]);
    const pier = (r) => putFn('g', r[0], r[1], r[2], r[3], (c) => {
      c.fillStyle = '#8f9196'; c.fillRect(r[0], r[1], r[2] - r[0], r[3] - r[1]);
      c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 1;
      for (let x = r[0]; x < r[2]; x += 24) { c.beginPath(); c.moveTo(x, r[1]); c.lineTo(x, r[3]); c.stroke(); }
      c.strokeStyle = '#e1b83b'; c.lineWidth = 2; c.setLineDash([8, 6]); c.strokeRect(r[0] + 3, r[1] + 3, r[2] - r[0] - 6, r[3] - r[1] - 6); c.setLineDash([]);
    });
    pier(apron); pier(f1); pier(f2);
    addBuilding({ x: 226, y: 4140, w: 214, d: 205, h: 18, rc: '#2f4f6e', k: 'ship', wl: '#233a52', we: '#1b2d41', solid: true });
    // cranes: decor
    for (const cy of [4090, 4390]) put('b', { k: 'crane', x: 452, y: cy, w: 200, d: 10, h: 40, x0: 440, y0: cy - 30, x1: 680, y1: cy + 50, solid: false }, 440, cy - 30, 680, cy + 50);
    // Hill shading
    putFn('f', 3000, 0, W, 2400, (c) => {
      for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(255,250,200,.045)'; c.beginPath(); c.ellipse(4300, 880, 1050 - i * 190, 720 - i * 130, 0, 0, TAU); c.fill(); }
    });
    for (const b of BLD) put('b', b, b.x0, b.y0, b.x1, b.y1);
    // Sort every bucket by bottom edge (painter's order)
    for (const bk of BK) bk.b.sort((p, q) => (p.y + p.d) - (q.y + q.d));
  }
  buildCity();

  /* safehouses sit on sidewalk corners */
  const corner = (i, j, sx, sy) => ({ x: XC[i] + (sx ? 1 : -1) * (XR[i].hw + 9), y: YC[j] + (sy ? 1 : -1) * (YR[j].hw + 9) });
  const SAFE_DEFS = [[0, 5, 1, 1, 'Marine Parade flat'], [5, 6, 0, 1, 'Bazaar loft'], [10, 3, 1, 1, 'Hilltop villa'], [2, 12, 1, 0, 'Dockside shed'], [9, 10, 0, 1, 'Tower suite']];
  SAFE_DEFS.forEach((s) => { const p = corner(s[0], s[1], s[2], s[3]); SAFE.push({ x: p.x, y: p.y, i: s[0], j: s[1], sx: s[2], sy: s[3], name: s[4] }); });

  /* ================================================================ static map: tiles */
  const newCv = (w, h) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; };

  function drawSea(c, x0, y0, x1, y1) {
    if (x0 > 700) return;
    const ya = y0 - 10, yb = y1 + 10;
    const g = c.createLinearGradient(0, 0, 580, 0);
    g.addColorStop(0, '#0e4468'); g.addColorStop(0.7, '#1f7a9c'); g.addColorStop(1, '#3fb0bf');
    c.fillStyle = g;
    c.beginPath(); c.moveTo(x0 - 4, ya);
    for (let y = ya; y <= yb; y += 8) c.lineTo(shore(y), y);
    c.lineTo(x0 - 4, yb); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.07)'; c.lineWidth = 2;
    for (let y = Math.floor(ya / 26) * 26; y < yb; y += 26) {
      for (let k = 0; k < 3; k++) {
        const wy = y + hash2(y, k, 1) * 22, wx = hash2(y, k, 2) * (shore(wy) - 40);
        c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx + 22 + hash2(y, k, 3) * 40, wy + 1); c.stroke();
      }
    }
    // sand
    c.fillStyle = '#e2cc92';
    c.beginPath(); for (let y = ya; y <= yb; y += 8) c.lineTo(shore(y) - 1, y);
    for (let y = yb; y >= ya; y -= 8) c.lineTo(shore(y) + SAND, y); c.closePath(); c.fill();
    c.fillStyle = 'rgba(140,110,60,.30)';
    c.beginPath(); for (let y = ya; y <= yb; y += 8) c.lineTo(shore(y) - 1, y);
    for (let y = yb; y >= ya; y -= 8) c.lineTo(shore(y) + 11, y); c.closePath(); c.fill();
    c.fillStyle = 'rgba(120,95,50,.22)';
    for (let y = Math.floor(ya / 14) * 14; y < yb; y += 14) { const px = shore(y) + 14 + hash2(y, 4, 5) * 36; c.fillRect(px, y + hash2(y, 6, 7) * 10, 2, 2); }
    // foam
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 3.5;
    c.beginPath(); for (let y = ya; y <= yb; y += 8) { const sx = shore(y) - 1; if (y === ya) c.moveTo(sx, y); else c.lineTo(sx, y); } c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.32)'; c.lineWidth = 2.5;
    c.beginPath(); for (let y = ya; y <= yb; y += 8) { const sx = shore(y) - 9 + Math.sin(y / 17) * 2; if (y === ya) c.moveTo(sx, y); else c.lineTo(sx, y); } c.stroke();
    // promenade paving
    c.fillStyle = '#bab3a3';
    c.beginPath(); for (let y = ya; y <= yb; y += 8) c.lineTo(shore(y) + SAND, y);
    c.lineTo(692, yb); c.lineTo(692, ya); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(70,55,40,.10)'; c.lineWidth = 1;
    for (let y = Math.floor(ya / 22) * 22; y < yb; y += 22) { c.beginPath(); c.moveTo(Math.max(shore(y) + SAND, 0), y); c.lineTo(692, y); c.stroke(); }
    c.strokeStyle = '#ece5d4'; c.lineWidth = 4;
    c.beginPath(); for (let y = ya; y <= yb; y += 8) { const sx = shore(y) + SAND; if (y === ya) c.moveTo(sx, y); else c.lineTo(sx, y); } c.stroke();
  }

  const ASPH = '#3a3d43';
  function drawSeg(c, R, a, b, vertical) {
    if (b - a < 40) return;
    c.save();
    if (!vertical) c.transform(0, 1, 1, 0, 0, 0);
    const cx = R.c, hw = R.hw, sg = vertical ? 1 : -1;
    // curbs
    c.strokeStyle = 'rgba(0,0,0,.30)'; c.lineWidth = 3;
    c.beginPath(); c.moveTo(cx - hw - 1.5, a); c.lineTo(cx - hw - 1.5, b); c.moveTo(cx + hw + 1.5, a); c.lineTo(cx + hw + 1.5, b); c.stroke();
    c.strokeStyle = 'rgba(222,216,198,.55)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(cx - hw + 0.5, a); c.lineTo(cx - hw + 0.5, b); c.moveTo(cx + hw - 0.5, a); c.lineTo(cx + hw - 0.5, b); c.stroke();
    // wear and manhole
    c.fillStyle = 'rgba(0,0,0,.07)'; c.fillRect(cx - hw + 6, a + 30, 7, b - a - 60); c.fillRect(cx + hw - 13, a + 30, 7, b - a - 60);
    const mh = (a * 7 + cx) % 5;
    c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.arc(cx + (mh < 2.5 ? -1 : 1) * (R.blvd ? 40 : 15), a + (b - a) * 0.4, 4, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.1)'; c.beginPath(); c.arc(cx + (mh < 2.5 ? -1 : 1) * (R.blvd ? 40 : 15), a + (b - a) * 0.4, 2.2, 0, TAU); c.fill();
    c.fillStyle = 'rgba(255,255,255,.85)';
    // zebra
    for (let u = cx - hw + 7; u < cx + hw - 9; u += 11) { c.fillRect(u, a + 2, 6, 15); c.fillRect(u, b - 17, 6, 15); }
    // stop lines on the approach lanes (left hand traffic)
    const ext = R.blvd ? 66 : 30, inner = R.blvd ? 8 : 3;
    const side = (s, y) => { const u0 = s > 0 ? cx + inner : cx - ext; c.fillRect(u0, y, ext - inner, 3); };
    side(-sg, a + 21); side(sg, b - 24);
    c.fillStyle = 'rgba(255,255,255,.9)';
    c.strokeStyle = 'rgba(255,255,255,.88)';
    if (R.blvd) {
      c.fillStyle = '#cfc8b6'; c.fillRect(cx - 8, a + 20, 16, b - a - 40);
      c.fillStyle = '#5a8a48'; c.fillRect(cx - 6, a + 22, 12, b - a - 44);
      c.fillStyle = '#3f7a3d';
      for (let p = a + 30; p < b - 24; p += 22) { c.beginPath(); c.arc(cx, p, 4.5, 0, TAU); c.fill(); }
      c.lineWidth = 2; c.setLineDash([14, 14]); c.strokeStyle = 'rgba(255,255,255,.7)';
      c.beginPath(); c.moveTo(cx - 36, a + 30); c.lineTo(cx - 36, b - 30); c.moveTo(cx + 36, a + 30); c.lineTo(cx + 36, b - 30); c.stroke();
      c.setLineDash([]); c.lineWidth = 2; c.strokeStyle = 'rgba(255,255,255,.8)';
      c.beginPath(); c.moveTo(cx - 66, a + 20); c.lineTo(cx - 66, b - 20); c.moveTo(cx + 66, a + 20); c.lineTo(cx + 66, b - 20); c.stroke();
    } else {
      c.lineWidth = 2.5; c.setLineDash([16, 14]); c.strokeStyle = 'rgba(255,255,255,.82)';
      c.beginPath(); c.moveTo(cx, a + 30); c.lineTo(cx, b - 30); c.stroke(); c.setLineDash([]);
      c.lineWidth = 1.5; c.strokeStyle = 'rgba(255,255,255,.32)';
      c.beginPath(); c.moveTo(cx - 30, a + 20); c.lineTo(cx - 30, b - 20); c.moveTo(cx + 30, a + 20); c.lineTo(cx + 30, b - 20); c.stroke();
    }
    c.restore();
  }
  function drawRoads(c, x0, y0, x1, y1) {
    const vt = YC[0] - YR[0].hw, vb = YC[NY - 1] + YR[NY - 1].hw, hl = XC[0] - XR[0].hw, hr = XC[NX - 1] + XR[NX - 1].hw;
    c.fillStyle = ASPH;
    for (const R of XR) if (R.c + R.hw >= x0 && R.c - R.hw <= x1) c.fillRect(R.c - R.hw, vt, R.hw * 2, vb - vt);
    for (const R of YR) if (R.c + R.hw >= y0 && R.c - R.hw <= y1) c.fillRect(hl, R.c - R.hw, hr - hl, R.hw * 2);
    for (let i = 0; i < NX; i++) {
      const R = XR[i]; if (R.c + R.hw + 4 < x0 || R.c - R.hw - 4 > x1) continue;
      for (let j = 0; j < NY - 1; j++) {
        const a = YC[j] + YR[j].hw, b = YC[j + 1] - YR[j + 1].hw;
        if (b < y0 - 4 || a > y1 + 4) continue;
        drawSeg(c, R, a, b, true);
      }
    }
    for (let j = 0; j < NY; j++) {
      const R = YR[j]; if (R.c + R.hw + 4 < y0 || R.c - R.hw - 4 > y1) continue;
      for (let i = 0; i < NX - 1; i++) {
        const a = XC[i] + XR[i].hw, b = XC[i + 1] - XR[i + 1].hw;
        if (b < x0 - 4 || a > x1 + 4) continue;
        drawSeg(c, R, a, b, false);
      }
    }
  }

  function drawTree(c, t) {
    if (t.k === 'palm') {
      c.fillStyle = 'rgba(10,20,5,.25)';
      for (let i = 0; i < 8; i++) { const a = t.rot + i * TAU / 8; c.beginPath(); c.moveTo(t.x + 3, t.y + 4); c.lineTo(t.x + 3 + Math.cos(a) * t.r, t.y + 4 + Math.sin(a) * t.r); c.lineWidth = 3; c.strokeStyle = 'rgba(10,20,5,.22)'; c.stroke(); }
      for (let i = 0; i < 8; i++) { const a = t.rot + i * TAU / 8; c.beginPath(); c.moveTo(t.x, t.y); c.lineTo(t.x + Math.cos(a) * t.r, t.y + Math.sin(a) * t.r); c.lineWidth = 3.2; c.strokeStyle = i % 2 ? '#2f7a3a' : '#44963f'; c.stroke(); }
      c.fillStyle = '#6a4a2e'; c.beginPath(); c.arc(t.x, t.y, 2.4, 0, TAU); c.fill();
      return;
    }
    const r = t.r;
    c.fillStyle = 'rgba(8,18,6,.30)'; c.beginPath(); c.ellipse(t.x + r * 0.35, t.y + r * 0.45, r * 1.02, r * 0.92, 0, 0, TAU); c.fill();
    c.fillStyle = t.c0; c.beginPath(); c.arc(t.x, t.y, r, 0, TAU); c.fill();
    c.fillStyle = t.c1;
    for (let i = 0; i < 4; i++) { const a = t.rot + i * 1.6; c.beginPath(); c.arc(t.x + Math.cos(a) * r * 0.38, t.y + Math.sin(a) * r * 0.38, r * 0.55, 0, TAU); c.fill(); }
    c.fillStyle = t.c2; c.beginPath(); c.arc(t.x - r * 0.28, t.y - r * 0.3, r * 0.4, 0, TAU); c.fill();
  }

  function drawLamp(c, l) {
    const ex = l.x + Math.cos(l.a) * 7, ey = l.y + Math.sin(l.a) * 7;
    c.strokeStyle = '#505357'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(l.x, l.y); c.lineTo(ex, ey); c.stroke();
    c.fillStyle = '#3d3f43'; c.beginPath(); c.arc(l.x, l.y, 2.4, 0, TAU); c.fill();
    c.fillStyle = '#f6e7b4'; c.beginPath(); c.arc(ex, ey, 2.4, 0, TAU); c.fill();
  }

  function polyFill(c, pts, col) { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); c.fill(); }

  function drawShadow(c, b) {
    if (b.k === 'crane') {
      c.fillStyle = 'rgba(15,12,8,.22)'; c.fillRect(b.x - 168, b.y + 8, 230, 8); c.fillRect(b.x + 2, b.y - 6, 16, 44); return;
    }
    if (b.k === 'stall') { c.fillStyle = 'rgba(15,12,8,.24)'; c.fillRect(b.x + 3, b.y + 6, b.w, b.d); return; }
    const sx = b.h * 0.36, sy = b.h * 0.28, x = b.x, y = b.y, w = b.w, d = b.d;
    if (b.k === 'ship') { c.fillStyle = 'rgba(0,10,24,.35)'; c.fillRect(x + 6, y + 8, w, d); return; }
    c.fillStyle = 'rgba(18,14,8,.30)';
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.lineTo(x + w + sx, y + sy); c.lineTo(x + w + sx, y + d + sy); c.lineTo(x + sx, y + d + sy); c.lineTo(x, y + d); c.closePath(); c.fill();
  }

  function windowsOn(c, gc, b, rx, ry) {
    const h = b.h, wh = h * 0.30;
    if (wh < 9 || b.k === 'wall' || b.k === 'container') return;
    const rows = Math.floor((wh - 2) / 8), cols = Math.floor((b.w - 6) / 9);
    for (let r = 0; r < rows; r++) {
      const t = (r + 0.5) / rows, xl = rx + (b.x - rx) * t, yl = ry + b.d + wh * t;
      for (let k = 0; k < cols; k++) {
        const wx = xl + 4 + k * 9, wy = yl - 2.5;
        const hv = hash2(k + r * 31, b.seed, 5);
        c.fillStyle = b.glass ? '#7fb0c8' : '#3a4a5c'; c.fillRect(wx, wy, 4.4, 4.4);
        if (gc && hv < 0.5) { gc.fillStyle = hv < 0.04 ? 'rgba(170,205,255,.95)' : 'rgba(255,214,130,.96)'; gc.fillRect(wx - 0.5, wy - 0.5, 5.4, 5.4); }
      }
    }
  }

  function drawDeco(c, b, rx, ry) {
    if (!b.dec) return;
    for (const e of b.dec) {
      const x = rx + e.px, y = ry + e.py;
      if (e.t === 'tank') { c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(x + 2, y + 2.5, e.r, 0, TAU); c.fill(); c.fillStyle = '#d9d5ca'; c.beginPath(); c.arc(x, y, e.r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(x - 1.2, y - 1.2, e.r * 0.45, 0, TAU); c.fill(); }
      else if (e.t === 'ac') { c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x + 1.5, y + 2, 9, 7); c.fillStyle = '#c8cbcf'; c.fillRect(x, y, 9, 7); c.fillStyle = '#7d8289'; c.beginPath(); c.arc(x + 4.5, y + 3.5, 2.6, 0, TAU); c.fill(); }
      else if (e.t === 'solar') { c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x + 2, y + 2, e.w, e.h); c.fillStyle = '#26456b'; c.fillRect(x, y, e.w, e.h); c.strokeStyle = 'rgba(150,190,230,.55)'; c.lineWidth = 0.8; c.beginPath(); for (let u = 6; u < e.w; u += 6) { c.moveTo(x + u, y); c.lineTo(x + u, y + e.h); } c.moveTo(x, y + e.h / 2); c.lineTo(x + e.w, y + e.h / 2); c.stroke(); }
      else if (e.t === 'box') { c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x + 2, y + 3, e.w, e.h); c.fillStyle = shade(b.rc, 0.7); c.fillRect(x, y - 3, e.w, e.h + 3); c.fillStyle = shade(b.rc, 1.18); c.fillRect(x - 1.5, y - 5, e.w, e.h); }
      else if (e.t === 'heli') { c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 14, 0, TAU); c.stroke(); c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(x - 5, y - 6, 2.5, 12); c.fillRect(x + 2.5, y - 6, 2.5, 12); c.fillRect(x - 5, y - 1.2, 10, 2.4); }
    }
  }

  function drawBld(c, gc, b) {
    const k = b.k, x = b.x, y = b.y, w = b.w, d = b.d, h = b.h;
    if (k === 'stall') {
      c.fillStyle = '#6b4a2e'; c.fillRect(x + 1, y + 2, w - 2, d - 2);
      const n = 6, sw = w / n;
      for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? '#f4efe2' : b.col; c.fillRect(x - 1 + i * sw, y - 4, sw + 0.6, d); }
      c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x - 1, y + d - 5, w + 2, 2);
      c.fillStyle = shade(b.col, 0.7); c.beginPath(); for (let i = 0; i < n; i++) { c.moveTo(x - 1 + i * sw, y + d - 4); c.lineTo(x - 1 + (i + 1) * sw, y + d - 4); c.lineTo(x - 1 + (i + 0.5) * sw, y + d - 1); } c.fill();
      return;
    }
    if (k === 'crane') {
      c.fillStyle = '#3c3f44'; c.fillRect(x + 2, y - 4, 16, 6); c.fillRect(x + 2, y + 18, 16, 6);
      c.fillStyle = '#c9402c'; c.fillRect(x - 170, y - 6, 232, 9);
      c.fillStyle = '#e8c33a'; c.fillRect(x - 100, y - 8, 14, 13);
      c.fillStyle = '#9b2f20'; c.fillRect(x - 170, y - 6, 232, 2);
      c.fillStyle = '#4a4d52'; c.fillRect(x - 2, y - 10, 24, 30); c.fillStyle = '#e8c33a'; c.fillRect(x + 2, y - 8, 16, 7);
      return;
    }
    if (k === 'ship') {
      c.fillStyle = '#1b2d41';
      c.beginPath(); c.moveTo(x, y + d / 2); c.lineTo(x + 50, y - 2); c.lineTo(x + w, y - 2); c.lineTo(x + w, y + d + 2); c.lineTo(x + 50, y + d + 2); c.closePath(); c.fill();
      c.fillStyle = '#b13a2c';
      c.beginPath(); c.moveTo(x + 6, y + d / 2); c.lineTo(x + 52, y + 2); c.lineTo(x + w - 2, y + 2); c.lineTo(x + w - 2, y + d - 2); c.lineTo(x + 52, y + d - 2); c.closePath(); c.fill();
      c.fillStyle = '#5b6b7a';
      c.beginPath(); c.moveTo(x + 18, y + d / 2); c.lineTo(x + 56, y + 8); c.lineTo(x + w - 6, y + 8); c.lineTo(x + w - 6, y + d - 8); c.lineTo(x + 56, y + d - 8); c.closePath(); c.fill();
      const cols = ['#c0392b', '#2e7d9a', '#e1a41a', '#3c8d5a', '#7d4e9d', '#d9772b'];
      for (let r = 0; r < 6; r++) for (let q = 0; q < 6; q++) { c.fillStyle = cols[(r * 3 + q * 5 + 1) % cols.length]; c.fillRect(x + 64 + q * 20, y + 14 + r * 28, 17, 24); c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(x + 64 + q * 20, y + 14 + r * 28 + 22, 17, 2); }
      c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x + w - 40, y + 14, 38, d - 24);
      c.fillStyle = '#e9eaec'; c.fillRect(x + w - 44, y + 10, 38, d - 24);
      c.fillStyle = '#cfd2d6'; c.fillRect(x + w - 44, y + 10, 38, 4);
      c.fillStyle = '#2a3b4d'; c.fillRect(x + w - 40, y + 20, 5, d - 44);
      c.fillStyle = '#c9402c'; c.beginPath(); c.arc(x + w - 24, y + d / 2, 9, 0, TAU); c.fill(); c.fillStyle = '#2b2b2b'; c.beginPath(); c.arc(x + w - 24, y + d / 2, 5, 0, TAU); c.fill();
      return;
    }
    const ox = -h * 0.12, oy = -h * 0.30, rx = x + ox, ry = y + oy;
    if (k === 'round') {
      const cx = x + w / 2, cy = y + d / 2, ex = w / 2, ey = d / 2;
      c.fillStyle = b.we; c.beginPath(); c.ellipse(cx, cy, ex, ey, 0, 0, TAU); c.fill();
      c.fillStyle = b.wl; c.beginPath(); c.moveTo(cx - ex, cy); c.lineTo(cx + ox - ex, cy + oy); c.lineTo(cx + ox + ex, cy + oy); c.lineTo(cx + ex, cy); c.closePath(); c.fill();
      c.fillStyle = b.rc; c.beginPath(); c.ellipse(cx + ox, cy + oy, ex, ey, 0, 0, TAU); c.fill();
      c.fillStyle = b.rt; c.beginPath(); c.ellipse(cx + ox, cy + oy, ex * 0.72, ey * 0.72, 0, 0, TAU); c.fill();
      if (b.clock) {
        c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(cx + ox, cy + oy, 8.5, 0, TAU); c.fill();
        c.strokeStyle = '#2b2b2b'; c.lineWidth = 1.4; c.beginPath(); c.arc(cx + ox, cy + oy, 8.5, 0, TAU); c.moveTo(cx + ox, cy + oy); c.lineTo(cx + ox, cy + oy - 6); c.moveTo(cx + ox, cy + oy); c.lineTo(cx + ox + 4, cy + oy + 1); c.stroke();
        c.fillStyle = '#c9402c'; c.beginPath(); c.arc(cx + ox, cy + oy - 11, 3, 0, TAU); c.fill();
      } else { c.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 8; i++) { const a = i * TAU / 8; c.fillRect(cx + ox + Math.cos(a) * (ex - 3) - 1.5, cy + oy + Math.sin(a) * (ey - 3) - 1.5, 3, 3); } }
      return;
    }
    // south and east walls
    polyFill(c, [rx, ry + d, rx + w, ry + d, x + w, y + d, x, y + d], b.wl);
    polyFill(c, [rx + w, ry, x + w, y, x + w, y + d, rx + w, ry + d], b.we);
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(x, y + d - 1.5, w, 1.5);
    if (k !== 'container') windowsOn(c, gc, b, rx, ry);
    // roof
    c.fillStyle = b.rc; c.fillRect(rx, ry, w, d);
    c.fillStyle = b.rt; c.fillRect(rx + 2, ry + 2, w - 4, d - 4);
    c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(rx, ry, w, 1.5); c.fillRect(rx, ry, 1.5, d);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(rx, ry + d - 1.5, w, 1.5); c.fillRect(rx + w - 1.5, ry, 1.5, d);
    if (k === 'container') {
      c.strokeStyle = 'rgba(0,0,0,.28)'; c.lineWidth = 1; c.beginPath();
      for (let u = 4; u < w - 2; u += 4) { c.moveTo(rx + u, ry + 1); c.lineTo(rx + u, ry + d - 1); }
      c.stroke(); c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(rx + w - 3, ry, 3, d);
      return;
    }
    if (k === 'wall') {
      c.fillStyle = 'rgba(80,55,25,.5)';
      if (w >= d) for (let u = 0; u < w; u += 8) c.fillRect(rx + u, ry, 4, 3); else for (let u = 0; u < d; u += 8) c.fillRect(rx, ry + u, 3, 4);
      return;
    }
    if (b.glass) {
      c.strokeStyle = 'rgba(190,230,245,.22)'; c.lineWidth = 1; c.beginPath();
      for (let u = 10; u < w - 4; u += 10) { c.moveTo(rx + u, ry + 2); c.lineTo(rx + u, ry + d - 2); }
      for (let u = 10; u < d - 4; u += 10) { c.moveTo(rx + 2, ry + u); c.lineTo(rx + w - 2, ry + u); }
      c.stroke();
      c.strokeStyle = 'rgba(255,255,255,.25)'; c.strokeRect(rx + 3.5, ry + 3.5, w - 7, d - 7);
    }
    if (b.tiles) { c.strokeStyle = 'rgba(0,0,0,.14)'; c.lineWidth = 1; c.beginPath(); for (let u = 4; u < d; u += 4) { c.moveTo(rx + 2, ry + u); c.lineTo(rx + w - 2, ry + u); } c.stroke(); }
    if (b.ribs) { c.strokeStyle = 'rgba(0,0,0,.14)'; c.lineWidth = 1; c.beginPath(); for (let u = 6; u < w; u += 6) { c.moveTo(rx + u, ry + 2); c.lineTo(rx + u, ry + d - 2); } c.stroke(); }
    if (b.awn) {
      const n = Math.max(3, Math.floor(w / 9)), sw = (w - 4) / n;
      for (let i = 0; i < n; i++) { c.fillStyle = i % 2 ? '#f4efe2' : b.awn; c.fillRect(x + 2 + i * sw, y + d - 0.5, sw + 0.4, 6); }
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x + 2, y + d + 5.5, w - 4, 2);
    }
    if (b.neon) {
      c.fillStyle = b.neon; c.globalAlpha = 0.5; c.fillRect(rx + 6, ry + d + 1.5, w - 12, 2); c.globalAlpha = 1;
      if (gc) { gc.fillStyle = b.neon; gc.globalAlpha = 0.28; gc.fillRect(rx + 3, ry + d - 1, w - 6, 8); gc.globalAlpha = 1; gc.fillRect(rx + 6, ry + d + 1.5, w - 12, 2.4); }
    }
    drawDeco(c, b, rx, ry);
    if (b.dome) {
      const dx = rx + b.dome.px, dy = ry + b.dome.py, r = b.dome.r;
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(dx + r * 0.3, dy + r * 0.35, r, 0, TAU); c.fill();
      const g = c.createRadialGradient(dx - r * 0.35, dy - r * 0.35, 1, dx, dy, r);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, b.dome.c); g.addColorStop(1, shade(b.dome.c.length === 7 ? b.dome.c : '#c9a24a', 0.62));
      c.fillStyle = g; c.beginPath(); c.arc(dx, dy, r, 0, TAU); c.fill();
      c.fillStyle = '#c9a24a'; c.beginPath(); c.arc(dx, dy, 2, 0, TAU); c.fill();
    }
    if (b.chhatri) {
      for (const q of [[6, 6], [w - 6, 6], [6, d - 6], [w - 6, d - 6]]) { c.fillStyle = 'rgba(0,0,0,.22)'; c.beginPath(); c.arc(rx + q[0] + 2, ry + q[1] + 2, 6, 0, TAU); c.fill(); c.fillStyle = '#efe5c8'; c.beginPath(); c.arc(rx + q[0], ry + q[1], 6, 0, TAU); c.fill(); c.fillStyle = '#c9a24a'; c.beginPath(); c.arc(rx + q[0], ry + q[1], 1.6, 0, TAU); c.fill(); }
    }
    if (b.beacon) { c.fillStyle = '#d33'; c.beginPath(); c.arc(rx + 5, ry + 5, 2.2, 0, TAU); c.fill(); if (gc) { gc.fillStyle = 'rgba(255,60,50,.28)'; gc.beginPath(); gc.arc(rx + 5, ry + 5, 9, 0, TAU); gc.fill(); gc.fillStyle = 'rgba(255,90,80,.95)'; gc.beginPath(); gc.arc(rx + 5, ry + 5, 2.6, 0, TAU); gc.fill(); } }
  }

  /* tile cache */
  const tiles = new Array(TN * TN).fill(null);
  const spare = [];
  let tileClock = 1, tileCount = 0, builtThisFrame = 0;
  const MAXT = 60;

  function renderTile(t, tx, ty) {
    const c = t.c, gc = t.gc, x0 = tx * TILE, y0 = ty * TILE, x1 = x0 + TILE, y1 = y0 + TILE;
    c.setTransform(1, 0, 0, 1, -x0, -y0);
    gc.setTransform(1, 0, 0, 1, 0, 0); gc.clearRect(0, 0, TILE / 2, TILE / 2); gc.setTransform(0.5, 0, 0, 0.5, -x0 * 0.5, -y0 * 0.5);
    c.fillStyle = '#6b6a5e'; c.fillRect(x0, y0, TILE, TILE);
    drawSea(c, x0, y0, x1, y1);
    const bk = BK[ty * TN + tx];
    for (let i = 0; i < bk.g.length; i++) bk.g[i].fn(c);
    drawRoads(c, x0, y0, x1, y1);
    for (let i = 0; i < bk.f.length; i++) bk.f[i].fn(c);
    for (let i = 0; i < bk.b.length; i++) drawShadow(c, bk.b[i]);
    for (let i = 0; i < bk.b.length; i++) drawBld(c, gc, bk.b[i]);
    for (let i = 0; i < bk.t.length; i++) drawTree(c, bk.t[i]);
    for (let i = 0; i < bk.l.length; i++) drawLamp(c, bk.l[i]);
    c.setLineDash([]);
  }
  function getTile(tx, ty, allow) {
    const i = ty * TN + tx, t = tiles[i];
    if (t) { t.last = tileClock; return t; }
    if (!allow) return null;
    let n = spare.pop();
    if (!n) { const cv = newCv(TILE, TILE), gcv = newCv(TILE / 2, TILE / 2); n = { cv, gcv, c: cv.getContext('2d'), gc: gcv.getContext('2d'), idx: 0, last: 0 }; }
    n.idx = i; n.last = tileClock; renderTile(n, tx, ty); tiles[i] = n; tileCount++; builtThisFrame++;
    return n;
  }
  function trimTiles() {
    if (tileCount <= MAXT) return;
    let guard = 0;
    while (tileCount > MAXT && guard++ < 20) {
      let old = null;
      for (let i = 0; i < tiles.length; i++) { const t = tiles[i]; if (t && t.last < tileClock - 2 && (!old || t.last < old.last)) old = t; }
      if (!old) break;
      tiles[old.idx] = null; tileCount--; spare.push(old);
    }
  }

  /* ---- minimap image: roads, water, parks, buildings at 1/4 scale */
  const MMK = 4, MMS = W / MMK;
  const mmCv = newCv(MMS, MMS);
  (function buildMini() {
    const c = mmCv.getContext('2d'); c.scale(1 / MMK, 1 / MMK);
    c.fillStyle = '#26324a'; c.fillRect(0, 0, W, W);
    c.fillStyle = '#143f5e'; c.beginPath(); c.moveTo(0, 0); for (let y = 0; y <= W; y += 16) c.lineTo(shore(y), y); c.lineTo(0, W); c.closePath(); c.fill();
    c.fillStyle = '#6b6252'; c.beginPath(); for (let y = 0; y <= W; y += 16) c.lineTo(shore(y), y); for (let y = W; y >= 0; y -= 16) c.lineTo(shore(y) + SAND, y); c.closePath(); c.fill();
    c.fillStyle = '#394563';
    for (const b of BLD) { if (b.k === 'container') c.fillStyle = '#4a5878'; else c.fillStyle = b.k === 'ship' ? '#6a7a96' : '#3d4a6a'; c.fillRect(b.x, b.y, b.w, b.d); }
    c.fillStyle = '#2f6b4a'; for (const p of PARKS) c.fillRect(p[0], p[1], p[2], p[3]);
    c.fillStyle = '#8a96b0';
    const vt = YC[0] - YR[0].hw, vb = YC[NY - 1] + YR[NY - 1].hw, hl = XC[0] - XR[0].hw, hr = XC[NX - 1] + XR[NX - 1].hw;
    for (const R of XR) { c.fillStyle = R.blvd ? '#c3cde0' : '#8d99b2'; c.fillRect(R.c - R.hw * 0.5, vt, R.hw, vb - vt); }
    for (const R of YR) { c.fillStyle = R.blvd ? '#c3cde0' : '#8d99b2'; c.fillRect(hl, R.c - R.hw * 0.5, hr - hl, R.hw); }
  })();

  /* ---- light sprites */
  function radial(size, stops) {
    const cv = newCv(size, size), c = cv.getContext('2d'), g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    stops.forEach((s) => g.addColorStop(s[0], s[1]));
    c.fillStyle = g; c.fillRect(0, 0, size, size); return cv;
  }
  const LS_SOFT = radial(128, [[0, 'rgba(255,255,255,1)'], [0.45, 'rgba(255,255,255,.6)'], [1, 'rgba(255,255,255,0)']]);
  const LS_WARM = radial(128, [[0, 'rgba(255,208,130,.6)'], [0.4, 'rgba(255,170,80,.22)'], [1, 'rgba(255,150,60,0)']]);
  const LS_RED = radial(64, [[0, 'rgba(255,70,55,.95)'], [0.4, 'rgba(255,50,40,.4)'], [1, 'rgba(255,40,30,0)']]);
  const LS_BLUE = radial(64, [[0, 'rgba(80,150,255,.95)'], [0.4, 'rgba(60,120,255,.4)'], [1, 'rgba(50,100,255,0)']]);
  const LS_GREEN = radial(64, [[0, 'rgba(90,255,150,.95)'], [0.4, 'rgba(60,230,120,.4)'], [1, 'rgba(50,220,100,0)']]);
  const LS_AMBER = radial(64, [[0, 'rgba(255,190,60,.95)'], [0.4, 'rgba(255,170,40,.4)'], [1, 'rgba(255,160,30,0)']]);
  const LS_CONE = (function () {
    const cv = newCv(256, 128), c = cv.getContext('2d');
    for (let k = 0; k < 4; k++) {
      const hh = 18 + k * 14, g = c.createLinearGradient(0, 0, 256, 0);
      g.addColorStop(0, 'rgba(255,255,255,.62)'); g.addColorStop(0.35, 'rgba(255,255,255,.34)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 64); c.lineTo(256, 64 - hh); c.lineTo(256, 64 + hh); c.closePath(); c.fill();
    }
    return cv;
  })();

  /* ================================================================ game state */
  const G = {
    phase: 'attract', mode: 'free', diff: 'normal', time: 0, hour: 18.2, cash: 0, heat: 0, unseen: 0, spotted: false,
    chain: 0, chainT: 0, job: null, offers: [], hustleLeft: 600, mapOpen: false, caught: null, bank: 0,
    district: null, camX: 0, camY: 0, zoom: 1, shakeT: 0, shake: 0, lookX: 0, lookY: 0, banner: null, floaters: [],
    nearVeh: null, prompt: '', stats: { jobs: 0, crashes: 0 }, hornCd: 0, sirenCd: 0, spawnCd: 0, popCd: 0, copCd: 0,
    attractT: 0, attX: 900, attY: 2076, fx: 900, fy: 2076, vw: 1200, vh: 800, mmA: 0, arrest: 0, safeNear: null, bfs: new Int16Array(NX * NY), bfsT: 0, sfxCd: 0, quiet: 0,
  };
  const DIFF = {
    easy:   { police: 0.9, count: -1, gain: 0.8, decay: 5, time: 1.3, traffic: 0.9, rival: 0.82 },
    normal: { police: 1.0, count: 0, gain: 1.0, decay: 7, time: 1.0, traffic: 1.0, rival: 0.9 },
    hard:   { police: 1.1, count: 1, gain: 1.25, decay: 9, time: 0.85, traffic: 1.1, rival: 0.98 },
  };
  const V = [], PD = [];
  let vid = 0;
  const pl = { x: 0, y: 0, vx: 0, vy: 0, a: 0, hp: 100, inv: 0, step: 0, veh: null, moving: false, hit: 0, face: 0 };
  let arcRef = null;
  const touchish = () => !!(arcRef && arcRef.touchMode);

  /* ---------------------------------------------------------------- particles and skids */
  const PART = [];
  for (let i = 0; i < 380; i++) PART.push({ on: false, k: '', x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, size: 1, col: '#fff', g: 0 });
  let pIdx = 0;
  function emit(k, x, y, vx, vy, life, size, col, g) {
    const p = PART[pIdx]; pIdx = (pIdx + 1) % PART.length;
    p.on = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.col = col || '#fff'; p.g = g || 0;
  }
  function updateParts(dt) {
    for (let i = 0; i < PART.length; i++) {
      const p = PART[i]; if (!p.on) continue;
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const dr = p.k === 'smoke' || p.k === 'dust' ? 0.9 : 0.995;
      p.vx *= Math.pow(dr, dt * 60); p.vy *= Math.pow(dr, dt * 60);
      if (p.k === 'fire') p.vy -= 60 * dt;
      if (p.k === 'smoke') p.vy -= 12 * dt;
      if (p.k === 'cash') p.vy += p.g * dt;
    }
  }
  const SKN = 800;
  const SK = { x1: new Float32Array(SKN), y1: new Float32Array(SKN), x2: new Float32Array(SKN), y2: new Float32Array(SKN), t: new Float32Array(SKN), n: 0 };
  function addSkid(x1, y1, x2, y2) {
    const i = SK.n % SKN; SK.n++;
    SK.x1[i] = x1; SK.y1[i] = y1; SK.x2[i] = x2; SK.y2[i] = y2; SK.t[i] = G.time;
  }

  /* ---------------------------------------------------------------- vehicle sprites */
  const SPR = 2, sprCache = {};
  function rrect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function bodyGrad(c, col, W2) {
    const g = c.createLinearGradient(0, -W2, 0, W2);
    g.addColorStop(0, shade(col, 1.22)); g.addColorStop(0.5, col); g.addColorStop(1, shade(col, 0.72));
    return g;
  }
  function drawVehArt(c, type, col) {
    const T = VT[type], L = T.L, Wd = T.Wd, hl = L / 2, hw = Wd / 2;
    const wheel = (x, y, w, h) => { c.fillStyle = '#141519'; rrect(c, x - w / 2, y - h / 2, w, h, 1.3); c.fill(); };
    const lights = (fx, bx, y, fh) => {
      c.fillStyle = '#fff4c4'; rrect(c, fx - 2.4, -y - fh / 2, 2.8, fh, 1); c.fill(); rrect(c, fx - 2.4, y - fh / 2, 2.8, fh, 1); c.fill();
      c.fillStyle = '#c8281f'; rrect(c, bx - 0.4, -y - fh / 2, 2.4, fh, 1); c.fill(); rrect(c, bx - 0.4, y - fh / 2, 2.4, fh, 1); c.fill();
    };
    if (type === 'hatch' || type === 'police' || type === 'coupe') {
      const xf = hl * 0.62, yw = hw - 0.4;
      wheel(xf, -yw, 8.5, 4.4); wheel(xf, yw, 8.5, 4.4); wheel(-xf, -yw, 8.5, 4.4); wheel(-xf, yw, 8.5, 4.4);
      c.fillStyle = bodyGrad(c, col, hw);
      if (type === 'coupe') { c.beginPath(); c.moveTo(-hl, -hw + 3); c.quadraticCurveTo(-hl, -hw, -hl + 6, -hw); c.lineTo(hl - 12, -hw + 0.6); c.quadraticCurveTo(hl, -hw + 3, hl, 0); c.quadraticCurveTo(hl, hw - 3, hl - 12, hw - 0.6); c.lineTo(-hl + 6, hw); c.quadraticCurveTo(-hl, hw, -hl, hw - 3); c.closePath(); c.fill(); }
      else { rrect(c, -hl, -hw + 0.6, L, Wd - 1.2, 6); c.fill(); }
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.7; c.stroke();
      if (type === 'police') {
        c.fillStyle = '#1f4aa8'; c.fillRect(-hl + 5, -hw + 3.4, L - 15, 2.6); c.fillRect(-hl + 5, hw - 6, L - 15, 2.6);
        c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(hl - 15, -hw + 2, 9, Wd - 4);
      }
      if (type === 'coupe') { c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-hl + 4, -2.2, L - 12, 1.7); c.fillRect(-hl + 4, 0.7, L - 12, 1.7); c.fillStyle = '#16171b'; c.fillRect(-hl - 0.8, -hw + 1.4, 3.4, Wd - 2.8); }
      // cabin
      const cx0 = type === 'coupe' ? -11 : -9.5, cw = type === 'coupe' ? 18 : 20;
      c.fillStyle = '#1b2a38'; rrect(c, cx0, -hw + 2.2, cw, Wd - 4.4, 4); c.fill();
      c.fillStyle = type === 'police' ? '#e9eaee' : shade(col, 1.12); rrect(c, cx0 + 3.6, -hw + 3.7, cw - 8, Wd - 7.4, 3); c.fill();
      c.fillStyle = 'rgba(160,200,230,.35)'; c.beginPath(); c.moveTo(cx0 + cw - 1.5, -hw + 3); c.lineTo(cx0 + cw + 1.8, -hw + 4.4); c.lineTo(cx0 + cw + 1.8, hw - 4.4); c.lineTo(cx0 + cw - 1.5, hw - 3); c.closePath(); c.fill();
      if (type === 'police') { c.fillStyle = '#2a2d33'; c.fillRect(cx0 + 6.5, -hw + 2.6, 5, Wd - 5.2); }
      c.fillStyle = shade(col, 0.55); c.fillRect(hl - 17, -0.5, 9, 1); // hood seam
      c.fillStyle = shade(col, 0.6); c.fillRect(xf - 1, -hw - 0.6, 3.2, 1.4); c.fillRect(xf - 1, hw - 0.8, 3.2, 1.4);
      lights(hl - 0.4, -hl, hw - 4.4, 4.4);
      return;
    }
    if (type === 'auto') {
      wheel(hl - 4, 0, 7, 3.6); wheel(-hl + 8, -hw + 0.6, 7.5, 3.8); wheel(-hl + 8, hw - 0.6, 7.5, 3.8);
      c.fillStyle = bodyGrad(c, col, hw); rrect(c, -hl + 3, -hw + 2, L - 7, Wd - 4, 4.5); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.7; c.stroke();
      c.fillStyle = bodyGrad(c, col, 5); rrect(c, hl - 10, -5.5, 11, 11, 5); c.fill();
      c.fillStyle = '#1b1c20'; rrect(c, -hl + 2, -hw + 0.4, 20, Wd - 0.8, 4); c.fill();
      c.fillStyle = '#2a2c31'; rrect(c, -hl + 4, -hw + 2, 15, Wd - 4, 3); c.fill();
      c.fillStyle = col; c.fillRect(-hl + 4, -0.9, 15, 1.8);
      c.fillStyle = '#223142'; c.fillRect(hl - 12, -4.6, 2.6, 9.2);
      c.fillStyle = '#fff4c4'; c.beginPath(); c.arc(hl - 0.8, 0, 2, 0, TAU); c.fill();
      c.fillStyle = '#c8281f'; c.fillRect(-hl + 1.6, -hw + 3, 1.6, 3); c.fillRect(-hl + 1.6, hw - 6, 1.6, 3);
      return;
    }
    if (type === 'van') {
      wheel(hl - 12, -hw + 0.4, 9, 4.8); wheel(hl - 12, hw - 0.4, 9, 4.8); wheel(-hl + 12, -hw + 0.4, 9, 4.8); wheel(-hl + 12, hw - 0.4, 9, 4.8);
      c.fillStyle = bodyGrad(c, col, hw); rrect(c, -hl, -hw + 0.8, L, Wd - 1.6, 5); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 0.7; c.stroke();
      c.fillStyle = shade(col, 1.1); rrect(c, -hl + 2.5, -hw + 3, L - 22, Wd - 6, 3); c.fill();
      c.strokeStyle = 'rgba(0,0,0,.14)'; c.lineWidth = 0.8; c.beginPath(); for (let u = -hl + 8; u < hl - 20; u += 8) { c.moveTo(u, -hw + 3.5); c.lineTo(u, hw - 3.5); } c.stroke();
      c.fillStyle = '#e8801f'; c.fillRect(-hl + 6, -2.4, L - 30, 4.8); c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(-hl + 8, -0.8, L - 34, 1.6);
      c.fillStyle = '#1b2a38'; rrect(c, hl - 18, -hw + 2.4, 13, Wd - 4.8, 3); c.fill();
      c.fillStyle = 'rgba(160,200,230,.35)'; c.fillRect(hl - 7, -hw + 3.4, 2.8, Wd - 6.8);
      lights(hl - 0.4, -hl, hw - 4.4, 5);
      return;
    }
    // scooter with rider
    wheel(hl - 3.5, 0, 6.5, 2.6); wheel(-hl + 3.5, 0, 6.5, 2.8);
    c.fillStyle = bodyGrad(c, col, 3.6); rrect(c, -hl + 4, -3.4, L - 9, 6.8, 3); c.fill();
    c.fillStyle = '#141519'; c.fillRect(hl - 8, -4.8, 2.2, 9.6);
    c.fillStyle = '#fff4c4'; c.beginPath(); c.arc(hl - 0.6, 0, 1.6, 0, TAU); c.fill();
    c.fillStyle = '#c8281f'; c.fillRect(-hl + 1, -1.4, 1.6, 2.8);
    c.strokeStyle = '#d5a77a'; c.lineWidth = 1.7; c.beginPath(); c.moveTo(-1, -3.2); c.lineTo(hl - 8, -4.4); c.moveTo(-1, 3.2); c.lineTo(hl - 8, 4.4); c.stroke();
    c.fillStyle = '#2f5fa8'; c.beginPath(); c.ellipse(-1.5, 0, 3.8, 5.2, 0, 0, TAU); c.fill();
    c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(-0.6, 0, 3.3, 0, TAU); c.fill();
    c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.arc(0.4, 0, 1.6, 0, TAU); c.fill();
  }
  function vehSprite(type, col) {
    const key = type + col;
    let s = sprCache[key]; if (s) return s;
    const T = VT[type], pad = 6;
    const cv = newCv(Math.ceil((T.L + pad * 2) * SPR), Math.ceil((T.Wd + pad * 2) * SPR));
    const c = cv.getContext('2d'); c.scale(SPR, SPR); c.translate(cv.width / SPR / 2, cv.height / SPR / 2);
    drawVehArt(c, type, col);
    s = { cv, w: cv.width / SPR, h: cv.height / SPR }; sprCache[key] = s; return s;
  }

  /* ---------------------------------------------------------------- vehicle creation and physics */
  function mkVeh(type, x, y, a, o) {
    o = o || {};
    const T = VT[type];
    const v = {
      id: ++vid, type, T, x, y, a, vx: 0, vy: 0, hp: T.hp, maxhp: T.hp, col: o.col || pick(T.cols),
      c: { thr: 0, brk: 0, str: 0, hb: false }, ai: null, parked: !!o.parked, player: false, police: type === 'police',
      siren: false, wreck: false, wreckT: 0, burnt: false, smoke: 0, sk: [0, 0, 0, 0, 0], skid: false, horn: 0,
      brakeL: false, stuck: 0, blocked: 0, f: 0, l: 0, age: 0, crashCd: 0, fireT: 0, vmul: 1, accMul: 1, driver: !o.parked, lastHit: 0, fleeT: 0, rev: 0, role: 0,
      hum: null, steerVis: 0, mine: false, race: false,
    };
    V.push(v);
    return v;
  }
  const heading = (v) => ({ x: Math.cos(v.a), y: Math.sin(v.a) });
  const vSpeed = (v) => hyp(v.vx, v.vy);

  function stepVeh(v, dt) {
    const T = v.T, c = v.c, ca = Math.cos(v.a), sa = Math.sin(v.a);
    let f = v.vx * ca + v.vy * sa, l = -v.vx * sa + v.vy * ca;
    const hpf = v.hp / v.maxhp;
    const dead = v.wreck;
    const vmax = T.vmax * v.vmul * (hpf < 0.3 ? 0.8 : 1);
    v.brakeL = false;
    if (!dead) {
      if (c.thr > 0) {
        const k = 1 - Math.pow(clamp(f / vmax, 0, 1.2), 2);
        f += T.acc * v.accMul * c.thr * Math.max(0.04, k) * dt;
        if (f < -5) { f += T.brake * c.thr * dt; v.brakeL = true; }
      }
      if (c.brk > 0) {
        if (f > 12) { f = Math.max(0, f - T.brake * c.brk * dt); v.brakeL = true; }
        else { f = Math.max(-vmax * 0.32, f - T.acc * 0.7 * c.brk * dt); v.brakeL = f > -8; }
      }
    }
    if (c.thr <= 0 && c.brk <= 0 || dead) {
      f -= f * 0.5 * dt;
      f -= Math.sign(f) * Math.min(Math.abs(f), (dead ? 120 : 40) * dt);
    } else f -= f * 0.1 * dt;
    if (c.hb) { f -= Math.sign(f) * Math.min(Math.abs(f), 240 * dt); v.brakeL = true; }
    const spd = Math.abs(f);
    let grip = T.grip;
    if (c.hb && spd > 55) grip = 1.1;
    else if (spd > vmax * 0.8 && Math.abs(c.str) > 0.7) grip *= 0.7;
    const l0 = l;
    l *= Math.exp(-grip * dt);
    if (spd > 4) f += Math.sign(f) * (Math.abs(l0) - Math.abs(l)) * 0.5;
    const sf = clamp(spd / 55, 0, 1);
    let rate = T.steer * (1 - 0.42 * clamp(spd / T.vmax, 0, 1));
    if (c.hb && spd > 50) rate *= 1.55;
    const yaw = dead ? 0 : c.str * rate * sf * (f >= -2 ? 1 : -1);
    v.a += yaw * dt; v.steerVis = lerp(v.steerVis, c.str, Math.min(1, dt * 10));
    v.vx = ca * f - sa * l; v.vy = sa * f + ca * l;
    v.f = f; v.l = l0;
    v.x += v.vx * dt; v.y += v.vy * dt;
    // skid marks from the rear axle
    const sk = Math.abs(l0) > 38 || (c.hb && spd > 70) || (c.brk > 0.6 && f > 170 && !dead);
    v.skid = sk && !dead;
    const rx = Math.cos(v.a), ry = Math.sin(v.a), bx = v.x - rx * T.L * 0.3, by = v.y - ry * T.L * 0.3, px = -ry * T.Wd * 0.38, py = rx * T.Wd * 0.38;
    if (v.skid) {
      if (v.sk[4]) { addSkid(v.sk[0], v.sk[1], bx + px, by + py); addSkid(v.sk[2], v.sk[3], bx - px, by - py); }
      v.sk[0] = bx + px; v.sk[1] = by + py; v.sk[2] = bx - px; v.sk[3] = by - py; v.sk[4] = 1;
      if (rr() < dt * 22) emit('dust', bx, by, (rr() - 0.5) * 14, (rr() - 0.5) * 14, 0.7, 5 + rr() * 5, 'rgba(225,225,225,.5)');
      if (v.player && rr() < dt * 3) arcRef.sfx.noise(0.18, { freq: 2600, filter: 'bandpass', vol: 0.07 });
    } else v.sk[4] = 0;
    v.age += dt;
    if (v.crashCd > 0) v.crashCd -= dt;
  }

  // Circle against the solid grid. Returns the deepest penetration.
  const hit = { nx: 0, ny: 0, pen: 0, x: 0, y: 0 };
  function circleSolid(cx, cy, r) {
    const i0 = Math.floor((cx - r) / CELL), i1 = Math.floor((cx + r) / CELL), j0 = Math.floor((cy - r) / CELL), j1 = Math.floor((cy + r) / CELL);
    let best = 0, bx = 0, by = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (i >= 0 && j >= 0 && i < GW && j < GW && SOLID[j * GW + i] !== 1) continue;
      const x0 = i * CELL, y0 = j * CELL;
      const px = clamp(cx, x0, x0 + CELL), py = clamp(cy, y0, y0 + CELL);
      let dx = cx - px, dy = cy - py; const d2 = dx * dx + dy * dy;
      if (d2 >= r * r) continue;
      let d = Math.sqrt(d2), pen;
      if (d < 0.001) { dx = cx - (x0 + CELL / 2); dy = cy - (y0 + CELL / 2); d = hyp(dx, dy) || 1; pen = r + CELL / 2; dx /= d; dy /= d; }
      else { pen = r - d; dx /= d; dy /= d; }
      if (pen > best) { best = pen; bx = dx; by = dy; hit.x = px; hit.y = py; }
    }
    hit.pen = best; hit.nx = bx; hit.ny = by;
    return best > 0;
  }

  function damage(v, amt) {
    if (amt <= 0 || v.wreck) return;
    v.hp -= amt;
    if (v.hp <= 0) wreckVeh(v);
  }
  function wreckVeh(v) {
    v.hp = 0; v.wreck = true; v.wreckT = 0; v.ai = null; v.c.thr = v.c.brk = v.c.str = 0; v.siren = false;
    if (v.player) { banner('Car wrecked', 'Get out before it burns. Press F', 3000, '#FF8A3D'); arcRef.sfx.tone(120, 0.6, { type: 'sawtooth', slide: 50, vol: 0.2 }); }
    for (let i = 0; i < 12; i++) emit('smoke', v.x, v.y, (rr() - 0.5) * 60, (rr() - 0.5) * 60, 1.4, 10 + rr() * 8, 'rgba(60,60,60,.55)');
  }

  function crashFx(v, spd, px, py) {
    const n = Math.min(10, 3 + (spd / 30) | 0);
    for (let i = 0; i < n; i++) { const a = rr() * TAU; emit('spark', px, py, Math.cos(a) * (90 + rr() * 150), Math.sin(a) * (90 + rr() * 150), 0.28 + rr() * 0.25, 1.6 + rr() * 1.4, '#ffcf6b'); }
    if (v.player) {
      arcRef.sfx.noise(0.26, { freq: 650 + rr() * 300, vol: clamp(spd / 340, 0.1, 0.4) });
      arcRef.sfx.tone(90 + rr() * 30, 0.2, { type: 'square', slide: 45, vol: clamp(spd / 500, 0.08, 0.28) });
      if (!arcRef.reducedMotion) G.shake = Math.max(G.shake, clamp(spd / 40, 2, 11));
    } else if (vDist(v) < 380) arcRef.sfx.noise(0.16, { freq: 700, vol: clamp(spd / 700, 0.04, 0.16) });
  }
  const vDist = (o) => hyp(o.x - G.fx, o.y - G.fy);

  function collideWorld(v) {
    const T = v.T;
    for (let iter = 0; iter < 2; iter++) {
      const ca = Math.cos(v.a), sa = Math.sin(v.a);
      let found = false, bpen = 0, bnx = 0, bny = 0, hx = 0, hy = 0;
      for (let k = 0; k < T.circ.length; k++) {
        const o = T.circ[k];
        if (circleSolid(v.x + ca * o, v.y + sa * o, T.r) && hit.pen > bpen) { bpen = hit.pen; bnx = hit.nx; bny = hit.ny; hx = hit.x; hy = hit.y; found = true; }
      }
      if (!found) return;
      v.x += bnx * bpen; v.y += bny * bpen;
      const vn = v.vx * bnx + v.vy * bny;
      if (vn < 0) {
        v.vx -= 1.32 * vn * bnx; v.vy -= 1.32 * vn * bny;
        v.vx *= 0.985; v.vy *= 0.985;
        const sp = -vn;
        if (sp > 45) {
          if (v.crashCd <= 0) { crashFx(v, sp, hx, hy); v.crashCd = 0.12; }
          damage(v, Math.max(0, sp - 52) * 0.16 / Math.sqrt(T.mass));
          if (v.ai && v.ai.kind === 'traffic' && sp > 70) v.ai.bump = 1.5;
        }
      }
    }
  }
  function collideVeh(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, rad = (a.T.L + b.T.L) / 2 + 4;
    if (dx * dx + dy * dy > rad * rad) return;
    const ca = Math.cos(a.a), sa = Math.sin(a.a), cb = Math.cos(b.a), sb = Math.sin(b.a);
    let bp = 0, nx = 0, ny = 0, hx = 0, hy = 0;
    for (let i = 0; i < a.T.circ.length; i++) {
      const ax = a.x + ca * a.T.circ[i], ay = a.y + sa * a.T.circ[i];
      for (let j = 0; j < b.T.circ.length; j++) {
        const bx = b.x + cb * b.T.circ[j], by = b.y + sb * b.T.circ[j];
        const ddx = bx - ax, ddy = by - ay, rs = a.T.r + b.T.r, d2 = ddx * ddx + ddy * ddy;
        if (d2 < rs * rs) { const d = Math.sqrt(d2) || 0.01, pen = rs - d; if (pen > bp) { bp = pen; nx = ddx / d; ny = ddy / d; hx = (ax + bx) / 2; hy = (ay + by) / 2; } }
      }
    }
    if (bp <= 0) return;
    const mA = a.T.mass * (a.driver || a.player ? 1 : 1.3), mB = b.T.mass * (b.driver || b.player ? 1 : 1.3);
    const wa = mB / (mA + mB), wb = mA / (mA + mB);
    a.x -= nx * bp * wa; a.y -= ny * bp * wa; b.x += nx * bp * wb; b.y += ny * bp * wb;
    const rvx = b.vx - a.vx, rvy = b.vy - a.vy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const j = -(1.4) * vn / (1 / mA + 1 / mB);
      a.vx -= j * nx / mA; a.vy -= j * ny / mA; b.vx += j * nx / mB; b.vy += j * ny / mB;
      const sp = -vn;
      if (sp > 38) {
        if (a.crashCd <= 0 || b.crashCd <= 0) {
          crashFx(a.player || b.player ? (a.player ? a : b) : a, sp, hx, hy);
          onCarCrash(a, b, sp);
        }
        a.crashCd = b.crashCd = 0.2;
        damage(a, Math.max(0, sp - 36) * 0.12 * wb * 2);
        damage(b, Math.max(0, sp - 36) * 0.12 * wa * 2);
        if (a.ai && a.ai.kind === 'traffic') a.ai.bump = 1.2;
        if (b.ai && b.ai.kind === 'traffic') b.ai.bump = 1.2;
      }
    }
  }

  /* ---------------------------------------------------------------- pedestrians */
  const SHIRTS = ['#d9534f', '#e8a33a', '#3aa6b5', '#5b7fd1', '#c9477f', '#7bb35a', '#f0e6d0', '#8a5ad0', '#e07a3a', '#3c8d5a'];
  const SKINS = ['#e0b08a', '#c68a5e', '#a96f45', '#8a5a38', '#d9a27a'];
  function mkPed(cn) {
    const p = {
      x: 0, y: 0, vx: 0, vy: 0, a: 0, c: cn, prev: null, tx: 0, ty: 0, state: 'walk', t: 0, sp: 24 + rr() * 8, shirt: pick(SHIRTS), skin: pick(SKINS), hair: pick(['#1a1410', '#2b1d12', '#3a2a1a', '#101010', '#6b6b6b']),
      anim: rr() * 10, cool: 0, fx: 0, fy: 0, dive: 0, bag: rr() < 0.25, dupatta: rr() < 0.2, scared: 0, pause: 0,
    };
    const q = cornerPos(cn);
    p.x = q.x + (rr() - 0.5) * 6; p.y = q.y + (rr() - 0.5) * 6;
    pedPick(p);
    PD.push(p);
    return p;
  }
  const cornerPos = (c) => corner(c.i, c.j, c.sx, c.sy);
  function pedPick(p) {
    const c = p.c, opts = [];
    const nj = c.j + (c.sy ? 1 : -1), ni = c.i + (c.sx ? 1 : -1);
    if (nj >= 0 && nj < NY) opts.push({ c: { i: c.i, j: nj, sx: c.sx, sy: c.sy ? 0 : 1 }, w: 3 });
    if (ni >= 0 && ni < NX) opts.push({ c: { i: ni, j: c.j, sx: c.sx ? 0 : 1, sy: c.sy }, w: 3 });
    opts.push({ c: { i: c.i, j: c.j, sx: 1 - c.sx, sy: c.sy }, w: 1.1, cross: true });
    opts.push({ c: { i: c.i, j: c.j, sx: c.sx, sy: 1 - c.sy }, w: 1.1, cross: true });
    let tot = 0;
    for (const o of opts) { if (p.prev && o.c.i === p.prev.i && o.c.j === p.prev.j && o.c.sx === p.prev.sx && o.c.sy === p.prev.sy) o.w = 0.15; tot += o.w; }
    let r = rr() * tot, ch = opts[0];
    for (const o of opts) { r -= o.w; if (r <= 0) { ch = o; break; } }
    p.prev = c; p.c = ch.c;
    const q = cornerPos(p.c);
    p.tx = q.x + (rr() - 0.5) * 6; p.ty = q.y + (rr() - 0.5) * 6;
  }

  function updatePed(p, dt) {
    p.anim += dt * (p.state === 'flee' ? 14 : 8);
    if (p.cool > 0) p.cool -= dt;
    // threats: moving vehicles
    let threat = false;
    for (let i = 0; i < V.length; i++) {
      const v = V[i]; if (v.parked && vSpeed(v) < 20) continue;
      const dx = p.x - v.x, dy = p.y - v.y; if (dx * dx + dy * dy > 150 * 150) continue;
      const sp = vSpeed(v); if (sp < 30) continue;
      const ux = v.vx / sp, uy = v.vy / sp, s = dx * ux + dy * uy, lat = -dx * uy + dy * ux;
      if (s > -14 && s < 40 + sp * 0.5 && Math.abs(lat) < 28) {
        threat = true;
        if (p.state !== 'dive') {
          const sgn = lat >= 0 ? 1 : -1;
          p.fx = -uy * sgn; p.fy = ux * sgn;
          if (p.state !== 'flee') p.state = 'flee';
          p.t = 1.4;
        }
        let hitC = false;
        for (let k = 0; k < v.T.circ.length; k++) { const o = v.T.circ[k]; const ccx = v.x + Math.cos(v.a) * o - p.x, ccy = v.y + Math.sin(v.a) * o - p.y; if (ccx * ccx + ccy * ccy < (v.T.r + 4) * (v.T.r + 4)) { hitC = true; break; } }
        if (hitC && sp > 34 && p.state !== 'dive') {
          p.state = 'dive'; p.t = 0.55; p.vx = p.fx * 170 + v.vx * 0.18; p.vy = p.fy * 170 + v.vy * 0.18;
          for (let q = 0; q < 4; q++) emit('dust', p.x, p.y, (rr() - 0.5) * 40, (rr() - 0.5) * 40, 0.5, 4, 'rgba(230,220,200,.5)');
          if (v.player && p.cool <= 0) { p.cool = 3; addHeat(0.13, 'dive'); popText('Whoa!', p.x, p.y - 12, '#FFB736'); arcRef.sfx.tone(520, 0.1, { type: 'triangle', slide: 760, vol: 0.1 }); }
        }
      }
    }
    if (p.state === 'dive') {
      p.t -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.pow(0.04, dt); p.vy *= Math.pow(0.04, dt);
      if (p.t <= 0) { p.state = 'flee'; p.t = 1.2; }
      return;
    }
    if (p.state === 'flee') {
      p.t -= dt;
      const sp = 105;
      p.x += p.fx * sp * dt; p.y += p.fy * sp * dt; p.a = Math.atan2(p.fy, p.fx);
      if (p.t <= 0 && !threat) { p.state = 'walk'; p.scared = 2; const q = cornerPos(p.c); p.tx = q.x; p.ty = q.y; }
      if (solidAt(p.x, p.y)) { p.x -= p.fx * sp * dt; p.y -= p.fy * sp * dt; const t0 = p.fx; p.fx = -p.fy; p.fy = t0; }
      return;
    }
    if (p.pause > 0) { p.pause -= dt; return; }
    const dx = p.tx - p.x, dy = p.ty - p.y, d = hyp(dx, dy);
    if (d < 4) { if (rr() < 0.12) p.pause = 0.6 + rr() * 2; pedPick(p); return; }
    const sp = p.sp * (p.scared > 0 ? 1.6 : 1);
    if (p.scared > 0) p.scared -= dt;
    p.x += dx / d * sp * dt; p.y += dy / d * sp * dt; p.a = Math.atan2(dy, dx);
  }

  /* ================================================================ roads, traffic AI */
  const CRUISE = { hatch: 150, coupe: 185, auto: 118, van: 124, bike: 165, police: 155 };
  function laneCoord(axis, idx, dir, lane) {
    const R = axis === 'h' ? YR[idx] : XR[idx], off = laneOff(R, lane);
    return axis === 'h' ? YC[idx] - dir * off : XC[idx] + dir * off;
  }
  function nextNodeIdx(axis, idx, pos, dir) {
    const C = axis === 'h' ? XC : YC, R = axis === 'h' ? XR : YR;
    if (dir > 0) { for (let n = 0; n < C.length; n++) if (C[n] - pos > R[n].hw + 14) return n; }
    else { for (let n = C.length - 1; n >= 0; n--) if (pos - C[n] > R[n].hw + 14) return n; }
    return -1;
  }
  const headingOf = (axis, dir) => (axis === 'h' ? (dir > 0 ? 0 : PI) : (dir > 0 ? PI / 2 : -PI / 2));
  function sigState(i, j, axis) {
    const t = (G.time + ((i * 5 + j * 3) % 22)) % 22;
    if (axis === 'h') return t < 8 ? 'g' : t < 10 ? 'y' : 'r';
    return t < 11 ? 'r' : t < 19 ? 'g' : t < 21 ? 'y' : 'r';
  }
  function nearestNode(x, y) {
    let bi = 0, bj = 0, bd = 1e9;
    for (let i = 0; i < NX; i++) { const d = Math.abs(x - XC[i]); if (d < bd) { bd = d; bi = i; } }
    bd = 1e9;
    for (let j = 0; j < NY; j++) { const d = Math.abs(y - YC[j]); if (d < bd) { bd = d; bj = j; } }
    return { i: bi, j: bj };
  }
  function clearLine(x0, y0, x1, y1) {
    const d = hyp(x1 - x0, y1 - y0), n = Math.ceil(d / 14);
    for (let k = 1; k < n; k++) { const t = k / n; if (solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t)) return false; }
    return true;
  }
  function whisker(v, off, len) {
    const a = v.a + off, c = Math.cos(a), s = Math.sin(a);
    return solidAt(v.x + c * len * 0.55, v.y + s * len * 0.55) || solidAt(v.x + c * len, v.y + s * len);
  }

  function planTurn(v) {
    const ai = v.ai, axis = ai.axis, idx = ai.idx, dir = ai.dir, n = ai.node;
    if (n < 0) { v.remove = true; return; }
    const isH = axis === 'h';
    const i = isH ? n : idx, j = isH ? idx : n;
    const hwc = isH ? XR[i].hw : YR[j].hw, hwr = isH ? YR[j].hw : XR[i].hw;
    const cin = laneCoord(axis, idx, dir, ai.lane);
    const along = isH ? XC[i] : YC[j];
    const pin = isH ? { x: along - dir * (hwc + 6), y: cin, entry: true } : { x: cin, y: along - dir * (hwc + 6), entry: true };
    const opts = [];
    const ns = n + dir;
    if (ns >= 0 && ns < (isH ? NX : NY)) opts.push(['s', ai.cop ? 0.7 : 0.6]);
    const turns = [['l', isH ? -dir : dir], ['r', isH ? dir : -dir]];
    for (const t of turns) { const nn = (isH ? j : i) + t[1]; if (nn >= 0 && nn < (isH ? NY : NX)) opts.push([t[0], 0.2, t[1]]); }
    let tot = 0; for (const o of opts) tot += o[1];
    let r = rr() * tot, ch = opts[0];
    for (const o of opts) { r -= o[1]; if (r <= 0) { ch = o; break; } }
    ai.sig = { h: isH, i, j, dir, stop: along - dir * (hwc + 28 + v.T.L / 2) };
    if (ch[0] === 's') {
      const pout = isH ? { x: along + dir * (hwc + 6), y: cin } : { x: cin, y: along + dir * (hwc + 6) };
      ai.wps = [pin, pout]; ai.node = n + dir;
    } else {
      const d2 = ch[2], axis2 = isH ? 'v' : 'h', idx2 = isH ? i : j;
      const R2 = axis2 === 'h' ? YR[idx2] : XR[idx2];
      const lane2 = ch[0] === 'l' ? R2.lanes - 1 : 0;
      const cout = laneCoord(axis2, idx2, d2, lane2);
      const C = isH ? { x: cout, y: cin } : { x: cin, y: cout };
      const pout = isH ? { x: cout, y: YC[j] + d2 * (hwr + 6) } : { x: XC[i] + d2 * (hwr + 6), y: cout };
      ai.wps = [pin];
      for (let k = 1; k <= 3; k++) {
        const t = k / 4, u = 1 - t;
        ai.wps.push({ x: u * u * pin.x + 2 * u * t * C.x + t * t * pout.x, y: u * u * pin.y + 2 * u * t * C.y + t * t * pout.y, turn: true });
      }
      ai.wps.push(pout);
      ai.axis = axis2; ai.idx = idx2; ai.dir = d2; ai.lane = lane2; ai.node = (isH ? j : i) + d2;
    }
  }

  function initTraffic(v, axis, idx, dir, lane) {
    const pos = axis === 'h' ? v.x : v.y;
    v.ai = { kind: 'traffic', axis, idx, dir, lane, wps: [], cruise: (CRUISE[v.type] || 140) * (0.85 + rr() * 0.3), node: nextNodeIdx(axis, idx, pos, dir), sig: null, bump: 0, rev: 0, blk: 0, cop: v.police };
    if (v.ai.node < 0) { v.ai.dir = -dir; v.ai.node = nextNodeIdx(axis, idx, pos, -dir); }
    planTurn(v);
  }

  function aiTraffic(v, dt) {
    const ai = v.ai, c = v.c, ca = Math.cos(v.a), sa = Math.sin(v.a), f = v.f;
    if (!ai.wps.length) { planTurn(v); if (v.remove) return; }
    let wp = ai.wps[0];
    while (wp && hyp(wp.x - v.x, wp.y - v.y) < 22) {
      if (wp.entry) ai.sig = null;
      ai.wps.shift(); if (!ai.wps.length) { planTurn(v); if (v.remove) return; }
      wp = ai.wps[0];
    }
    if (ai.bump > 0) ai.bump -= dt;
    const err = wrapA(Math.atan2(wp.y - v.y, wp.x - v.x) - v.a);
    let str = clamp(err * 2.3, -1, 1);
    let target = ai.cruise;
    if (wp.turn || (ai.wps[1] && ai.wps[1].turn && hyp(wp.x - v.x, wp.y - v.y) < 100)) target = Math.min(target, 92);
    if (ai.sig) {
      const s = ai.sig, pos = s.h ? v.x : v.y, dist = (s.stop - pos) * s.dir;
      const st = sigState(s.i, s.j, s.h ? 'h' : 'v');
      if (dist > -12 && (st === 'r' || (st === 'y' && dist > 40))) target = Math.min(target, Math.sqrt(2 * 190 * Math.max(0, dist - 2)));
    }
    const reach = 50 + Math.max(0, f) * 0.8;
    let gapMin = 1e9;
    for (let i = 0; i < V.length; i++) {
      const o = V[i]; if (o === v) continue;
      const dx = o.x - v.x, dy = o.y - v.y; if (Math.abs(dx) + Math.abs(dy) > 260) continue;
      const fx = dx * ca + dy * sa; if (fx <= 0 || fx > reach + o.T.L) continue;
      const lx = -dx * sa + dy * ca, half = o.parked && !o.player ? 17 : o.T.Wd / 2 + v.T.Wd / 2 + 3;
      if (Math.abs(lx) >= half) continue;
      const gap = fx - (v.T.L + o.T.L) / 2, ovf = o.vx * ca + o.vy * sa;
      target = Math.min(target, Math.max(0, gap - 9) * 1.9 + Math.max(0, ovf) * (gap > 0 ? 0.9 : 0));
      if (gap < gapMin) gapMin = gap;
    }
    const peds = (p) => {
      const dx = p.x - v.x, dy = p.y - v.y; if (Math.abs(dx) + Math.abs(dy) > 160) return;
      const fx = dx * ca + dy * sa; if (fx <= 0 || fx > reach * 1.2) return;
      const lx = -dx * sa + dy * ca; if (Math.abs(lx) > 15) return;
      target = Math.min(target, Math.max(0, fx - v.T.L / 2 - 14) * 2.2);
    };
    for (let i = 0; i < PD.length; i++) peds(PD[i]);
    if (!pl.veh) peds(pl);
    const dv = target - f;
    if (dv > 8) { c.thr = clamp(dv / 55, 0.2, 1); c.brk = 0; }
    else if (dv < -16) { c.thr = 0; c.brk = clamp(-dv / 70, 0.25, 1); }
    else { c.thr = f < target ? 0.12 : 0; c.brk = 0; }
    c.hb = false; c.str = str;
    if (Math.abs(f) < 6 && target > 15) v.stuck += dt; else v.stuck = Math.max(0, v.stuck - dt * 2);
    if (v.stuck > 1.6 && ai.rev <= 0) { ai.rev = 0.9; v.stuck = 0; }
    if (ai.rev > 0) { ai.rev -= dt; c.thr = 0; c.brk = 1; c.str = -str; }
    if (gapMin < 16 && Math.abs(f) < 8) { ai.blk += dt; if (ai.blk > 3 && rr() < dt * 0.6) honk(v); } else ai.blk = 0;
    v.blocked = ai.blk;
  }

  /* ---- pursuit AI (police) and the street race rival */
  function aiChase(v, dt) {
    const ai = v.ai, c = v.c, f = v.f;
    const pv = pl.veh, px = pl.x, py = pl.y, pvx = pv ? pv.vx : pl.vx, pvy = pv ? pv.vy : pl.vy, pspd = hyp(pvx, pvy);
    const dx = px - v.x, dy = py - v.y, d = hyp(dx, dy);
    let tx = px + pvx * 0.45, ty = py + pvy * 0.45;
    if (ai.role === 1 && pspd > 70 && d > 110) { tx = px + pvx / pspd * 120; ty = py + pvy / pspd * 120; }
    else if (ai.role === 2 && d < 300 && pspd > 40) { const sg = ai.side || 1; tx = px - pvy / pspd * 46 * sg; ty = py + pvx / pspd * 46 * sg; }
    let direct = d < 130 || (d < 520 && clearLine(v.x, v.y, tx, ty));
    if (!direct) {
      const n0 = nearestNode(v.x, v.y);
      let bi = n0.i, bj = n0.j, bd = G.bfs[bi + bj * NX];
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const q of nb) {
        const ni = n0.i + q[0], nj = n0.j + q[1]; if (ni < 0 || nj < 0 || ni >= NX || nj >= NY) continue;
        const dd = G.bfs[ni + nj * NX]; if (dd < bd) { bd = dd; bi = ni; bj = nj; }
      }
      if (bd === 0 && bi === n0.i && bj === n0.j && G.bfs[bi + bj * NX] === 0) direct = true;
      else { tx = XC[bi]; ty = YC[bj]; }
    }
    const err = wrapA(Math.atan2(ty - v.y, tx - v.x) - v.a);
    let str = clamp(err * 2.6, -1, 1);
    const wl = whisker(v, -0.6, 62), wr = whisker(v, 0.6, 62), wc = whisker(v, 0, 70);
    if (wr) str -= 0.9; if (wl) str += 0.9;
    if (wc) str += (wr && !wl ? -1 : 1) * 0.9;
    str = clamp(str, -1, 1);
    let target = v.T.vmax * ai.mul;
    if (d < 140 && pspd < 40) { target = 0; }
    else if (d < 150 && ai.role > 0) target = Math.max(70, pspd * 0.96);
    if (Math.abs(err) > 1.1 && f > 140) target = Math.min(target, 150);
    if (wc && f > 90) target = Math.min(target, 90);
    const dv = target - f;
    if (dv > 8) { c.thr = clamp(dv / 40, 0.3, 1); c.brk = 0; } else if (dv < -25) { c.thr = 0; c.brk = clamp(-dv / 90, 0.2, 1); } else { c.thr = 0.1; c.brk = 0; }
    c.hb = d < 70 && pspd < 40;
    c.str = str;
    if (Math.abs(err) > 2.4 && d < 220 && f < 120) { c.thr = 0.7; c.str = err > 0 ? 1 : -1; }
    if (Math.abs(f) < 10 && target > 40) v.stuck += dt; else v.stuck = Math.max(0, v.stuck - dt * 2);
    if (v.stuck > 1.1 && ai.rev <= 0) { ai.rev = 0.9; v.stuck = 0; }
    if (ai.rev > 0) { ai.rev -= dt; c.thr = 0; c.brk = 1; c.str = -str; c.hb = false; }
  }

  function aiRival(v, dt) {
    const ai = v.ai, c = v.c, f = v.f;
    if (!ai.go) { c.thr = 0; c.brk = 0; c.hb = true; return; }
    c.hb = false;
    if (ai.k >= ai.route.length) { c.thr = 0; c.brk = 0.5; ai.done = true; return; }
    let wp = ai.route[ai.k];
    if (hyp(wp.x - v.x, wp.y - v.y) < 64) {
      if (wp.cp != null) ai.cp = wp.cp + 1;
      ai.k++;
      if (ai.k >= ai.route.length) { ai.done = true; return; }
      wp = ai.route[ai.k];
    }
    const d = hyp(wp.x - v.x, wp.y - v.y);
    const err = wrapA(Math.atan2(wp.y - v.y, wp.x - v.x) - v.a);
    let str = clamp(err * 2.6, -1, 1);
    const wl = whisker(v, -0.6, 62), wr = whisker(v, 0.6, 62);
    if (wr) str -= 0.9; if (wl) str += 0.9;
    str = clamp(str, -1, 1);
    const job = G.job;
    let mul = ai.mul;
    if (job && job.type === 'race') { const ahead = ai.cp - job.cp; if (ahead >= 2) mul *= 0.78; else if (ahead <= -2) mul *= 1.1; }
    let target = v.T.vmax * mul;
    const nxt = ai.route[ai.k + 1];
    if (nxt) {
      const turnA = Math.abs(wrapA(Math.atan2(nxt.y - wp.y, nxt.x - wp.x) - Math.atan2(wp.y - v.y, wp.x - v.x)));
      if (turnA > 0.7 && d < 190) target = Math.min(target, 205);
    }
    if (Math.abs(err) > 0.9) target = Math.min(target, 170);
    const dv = target - f;
    if (dv > 8) { c.thr = clamp(dv / 40, 0.3, 1); c.brk = 0; } else if (dv < -25) { c.thr = 0; c.brk = clamp(-dv / 90, 0.2, 1); } else { c.thr = 0.1; c.brk = 0; }
    c.str = str;
    if (Math.abs(f) < 10) v.stuck += dt; else v.stuck = Math.max(0, v.stuck - dt * 2);
    if (v.stuck > 1.2 && ai.rev <= 0) { ai.rev = 0.9; v.stuck = 0; }
    if (ai.rev > 0) { ai.rev -= dt; c.thr = 0; c.brk = 1; c.str = -str; }
  }

  function bfsField(tx, ty) {
    const n0 = nearestNode(tx, ty), F = G.bfs;
    F.fill(9999);
    const q = [n0.i + n0.j * NX]; F[q[0]] = 0;
    for (let h = 0; h < q.length; h++) {
      const id = q[h], i = id % NX, j = (id / NX) | 0, d = F[id] + 1;
      if (i > 0 && F[id - 1] > d) { F[id - 1] = d; q.push(id - 1); }
      if (i < NX - 1 && F[id + 1] > d) { F[id + 1] = d; q.push(id + 1); }
      if (j > 0 && F[id - NX] > d) { F[id - NX] = d; q.push(id - NX); }
      if (j < NY - 1 && F[id + NX] > d) { F[id + NX] = d; q.push(id + NX); }
    }
  }

  function honk(v) {
    v.horn = 0.35;
    if (vDist(v) < 600) { const k = clamp(1 - vDist(v) / 600, 0.05, 1) * 0.14; arcRef.sfx.tone(380 + (v.id % 5) * 18, 0.22, { type: 'square', vol: k }); }
  }

  /* ---- placing vehicles on roads */
  function roadPoint(cx, cy, rmin, rmax) {
    for (let tries = 0; tries < 10; tries++) {
      const a = rr() * TAU, d = rmin + rr() * (rmax - rmin);
      const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
      let bi = 0, bj = 0, bd = 1e9;
      for (let i = 0; i < NX; i++) { const q = Math.abs(px - XC[i]); if (q < bd) { bd = q; bi = i; } }
      let bd2 = 1e9;
      for (let j = 0; j < NY; j++) { const q = Math.abs(py - YC[j]); if (q < bd2) { bd2 = q; bj = j; } }
      const axis = bd < bd2 ? 'v' : 'h', idx = axis === 'v' ? bi : bj;
      let pos = axis === 'v' ? py : px;
      const C = axis === 'v' ? YC : XC, R = axis === 'v' ? YR : XR;
      pos = clamp(pos, C[0] + 60, C[C.length - 1] - 60);
      let ok = true;
      for (let n = 0; n < C.length; n++) if (Math.abs(pos - C[n]) < R[n].hw + 76) { ok = false; break; }
      if (!ok) continue;
      return { axis, idx, pos };
    }
    return null;
  }
  const inView = (x, y, m) => Math.abs(x - G.camX) < G.vw / 2 + m && Math.abs(y - G.camY) < G.vh / 2 + m;
  function freeSpot(x, y, rad) {
    if (solidAt(x, y)) return false;
    for (let i = 0; i < V.length; i++) { const o = V[i]; if (Math.abs(o.x - x) < rad && Math.abs(o.y - y) < rad) return false; }
    return true;
  }
  function spawnTraffic(type, rmin, rmax) {
    const rp = roadPoint(G.fx, G.fy, rmin, rmax); if (!rp) return null;
    const dir = rr() < 0.5 ? 1 : -1, R = rp.axis === 'h' ? YR[rp.idx] : XR[rp.idx], lane = (rr() * R.lanes) | 0;
    const c = laneCoord(rp.axis, rp.idx, dir, lane);
    const x = rp.axis === 'h' ? rp.pos : c, y = rp.axis === 'h' ? c : rp.pos;
    if ((!G.initial && inView(x, y, 90)) || !freeSpot(x, y, 70)) return null;
    const v = mkVeh(type, x, y, headingOf(rp.axis, dir));
    initTraffic(v, rp.axis, rp.idx, dir, lane);
    const sp = v.ai.cruise * 0.8; v.vx = Math.cos(v.a) * sp; v.vy = Math.sin(v.a) * sp; v.f = sp;
    return v;
  }
  function parkSpot(rp, sideSign, off) {
    // Left hand traffic: a car parked on a given side faces the way that side's traffic flows.
    const dir = sideSign > 0 ? (rp.axis === 'h' ? -1 : 1) : (rp.axis === 'h' ? 1 : -1);
    const R = rp.axis === 'h' ? YR[rp.idx] : XR[rp.idx];
    const o = off || (R.blvd ? 76 : 41);
    const c = (rp.axis === 'h' ? YC[rp.idx] : XC[rp.idx]) + sideSign * o;
    return { x: rp.axis === 'h' ? rp.pos : c, y: rp.axis === 'h' ? c : rp.pos, a: headingOf(rp.axis, dir) };
  }
  function spawnParked(type, rmin, rmax, force) {
    const rp = roadPoint(G.fx, G.fy, rmin, rmax); if (!rp) return null;
    const sp = parkSpot(rp, rr() < 0.5 ? 1 : -1);
    if ((!force && !G.initial && inView(sp.x, sp.y, 60)) || !freeSpot(sp.x, sp.y, 56)) return null;
    const v = mkVeh(type, sp.x, sp.y, sp.a, { parked: true });
    v.c.hb = true; v.driver = false;
    return v;
  }
  function pickTrafficType() {
    const r = rr();
    return r < 0.34 ? 'hatch' : r < 0.5 ? 'auto' : r < 0.6 ? 'van' : r < 0.74 ? 'bike' : r < 0.82 ? 'coupe' : 'hatch';
  }
  function pickParkedType() { const r = rr(); return r < 0.45 ? 'hatch' : r < 0.58 ? 'coupe' : r < 0.74 ? 'auto' : r < 0.86 ? 'van' : 'bike'; }

  function spawnPedAt(ringMin, ringMax) {
    for (let t = 0; t < 8; t++) {
      const a = rr() * TAU, d = ringMin + rr() * (ringMax - ringMin);
      const n = nearestNode(G.fx + Math.cos(a) * d, G.fy + Math.sin(a) * d);
      const cn = { i: n.i, j: n.j, sx: rr() < 0.5 ? 1 : 0, sy: rr() < 0.5 ? 1 : 0 };
      const q = cornerPos(cn);
      if ((!G.initial && inView(q.x, q.y, 20)) || hyp(q.x - G.fx, q.y - G.fy) < ringMin * 0.8) continue;
      return mkPed(cn);
    }
    return null;
  }

  function spawnCop(near) {
    const rp = roadPoint(G.fx, G.fy, 620, 960); if (!rp) return null;
    const dir = rr() < 0.5 ? 1 : -1, R = rp.axis === 'h' ? YR[rp.idx] : XR[rp.idx], lane = (rr() * R.lanes) | 0;
    const c = laneCoord(rp.axis, rp.idx, dir, lane);
    const x = rp.axis === 'h' ? rp.pos : c, y = rp.axis === 'h' ? c : rp.pos;
    if (inView(x, y, 90) || !freeSpot(x, y, 60)) return null;
    const v = mkVeh('police', x, y, headingOf(rp.axis, dir));
    startChase(v);
    return v;
  }
  function startChase(v) {
    const n = V.filter((o) => o.ai && o.ai.kind === 'chase').length;
    v.ai = { kind: 'chase', role: n % 3, side: n % 2 ? 1 : -1, mul: 0.9, rev: 0 };
    v.siren = true; v.driver = true; v.parked = false; v.c.hb = false;
  }
  function releaseCop(v) {
    v.siren = false;
    const rp = (() => {
      const n = nearestNode(v.x, v.y);
      const dv = Math.abs(v.x - XC[n.i]), dh = Math.abs(v.y - YC[n.j]);
      return dv < dh ? { axis: 'v', idx: n.i } : { axis: 'h', idx: n.j };
    })();
    const ca = Math.cos(v.a), sa = Math.sin(v.a);
    const dir = rp.axis === 'h' ? (ca >= 0 ? 1 : -1) : (sa >= 0 ? 1 : -1);
    const R = rp.axis === 'h' ? YR[rp.idx] : XR[rp.idx];
    initTraffic(v, rp.axis, rp.idx, dir, (rr() * R.lanes) | 0);
  }

  /* ================================================================ heat, jobs, pickups, player */
  function banner(title, sub, ms, col) { G.banner = { title, sub: sub || '', t: 0, max: (ms || 2200) / 1000, col: col || '#FFB736' }; }
  function popText(text, x, y, col) { if (G.floaters.length > 14) G.floaters.shift(); G.floaters.push({ text, x, y, t: 0, col: col || '#fff' }); }
  const sfxCash = () => { const s = arcRef.sfx; s.tone(880, 0.08, { type: 'triangle', vol: 0.16 }); s.tone(1320, 0.14, { type: 'triangle', vol: 0.16, delay: 0.07 }); };
  const stars = () => Math.floor(G.heat + 1e-6);

  function copDist() {
    let m = 1e9;
    for (let i = 0; i < V.length; i++) { const v = V[i]; if (v.police && !v.wreck && !v.player) { const d = hyp(v.x - pl.x, v.y - pl.y); if (d < m) m = d; } }
    return m;
  }
  function addHeat(amt, why) {
    if (G.phase !== 'play' || G.caught || amt <= 0) return;
    let m = DIFF[G.diff].gain;
    if (G.copDist < 450) m *= 1.8;
    const before = stars();
    G.heat = Math.min(5, G.heat + amt * m);
    G.unseen = 0;
    if (stars() > before) {
      banner(stars() + (stars() === 1 ? ' star' : ' stars'), why === 'jack' ? 'Carjacking: the police are on the way' : 'The police are after you', 2200, '#FF5252');
      arcRef.sfx.tone(660, 0.18, { type: 'square', vol: 0.12 }); arcRef.sfx.tone(880, 0.22, { type: 'square', vol: 0.12, delay: 0.16 });
    }
  }
  function onCarCrash(a, b, sp) {
    const pv = a.player ? a : b.player ? b : null; if (!pv) return;
    const o = pv === a ? b : a;
    if (vSpeed(pv) < 55 && !o.police) return;
    G.stats.crashes++;
    if (G.job && G.job.type === 'fare') { G.job.crashes++; popText('Ouch!', pv.x, pv.y - 18, '#FF8A3D'); }
    if (o.police) addHeat(clamp(sp / 260, 0.1, 0.5), 'ram');
    else addHeat(clamp(sp / 420, 0.07, 0.33) * (o.parked ? 0.6 : 1), 'crash');
  }

  /* ---- arrest and respawn */
  function nearestSafe(x, y) { let b = SAFE[0], bd = 1e9; for (const s of SAFE) { const d = hyp(s.x - x, s.y - y); if (d < bd) { bd = d; b = s; } } return b; }
  function startCaught(reason) {
    if (G.caught || G.phase !== 'play') return;
    const lose = reason === 'ko' ? Math.min(G.cash, Math.round(G.cash * 0.1)) : Math.min(G.cash, Math.max(40, Math.round(G.cash * 0.2)));
    G.cash -= lose;
    G.caught = { t: 0, reason, lose };
    if (G.job) failJob(reason === 'ko' ? 'Knocked out' : 'Caught by the police', true);
    arcRef.sfx.tone(300, 0.5, { type: 'sawtooth', slide: 90, vol: 0.2 });
    if (pl.veh) leaveCar(true);
  }
  function respawnAtSafe() {
    const s = nearestSafe(pl.x, pl.y);
    pl.x = s.x; pl.y = s.y; pl.vx = pl.vy = 0; pl.hp = 100; pl.inv = 2; G.heat = 0; G.arrest = 0; G.unseen = 0;
    for (const v of V) if (v.ai && v.ai.kind === 'chase') releaseCop(v);
    let have = false;
    for (const v of V) if (hyp(v.x - s.x, v.y - s.y) < 170 && !v.wreck && v.type !== 'police') have = true;
    if (!have) starterCar(s);
    G.camX = pl.x; G.camY = pl.y;
    banner('Safehouse', s.name, 2000, '#38D6B8');
  }
  function starterCar(s) {
    const R = YR[s.j], off = R.blvd ? 76 : 41;
    const x = XC[s.i] + (s.sx ? 1 : -1) * (XR[s.i].hw + 84), y = YC[s.j] + (s.sy ? 1 : -1) * off;
    const v = mkVeh('hatch', x, y, s.sy ? PI : 0, { parked: true, col: '#e1a41a' });
    v.c.hb = true; v.driver = false; v.mine = true;
    return v;
  }

  /* ---- vehicles in and out */
  function startHum(v) {
    stopHum();
    pl.hum = arcRef.sfx.hum(v.type === 'coupe' ? 'sawtooth' : v.type === 'bike' || v.type === 'auto' ? 'square' : 'sawtooth');
  }
  function stopHum() { if (pl.hum) { pl.hum.stop(); pl.hum = null; } }
  function spawnRunner(v) {
    const ca = Math.cos(v.a), sa = Math.sin(v.a);
    const n = nearestNode(v.x, v.y), p = mkPed({ i: n.i, j: n.j, sx: rr() < 0.5 ? 1 : 0, sy: rr() < 0.5 ? 1 : 0 });
    p.x = v.x - sa * (v.T.Wd / 2 + 10); p.y = v.y + ca * (v.T.Wd / 2 + 10);
    p.state = 'flee'; p.t = 2.4; p.fx = -sa; p.fy = ca; p.scared = 5;
  }
  function tryEnter() {
    let best = null, bd = 1e9;
    for (const v of V) {
      if (v.burnt || (v.wreck && v.wreckT > 1.2) || v.race || v.player) continue;
      const d = hyp(v.x - pl.x, v.y - pl.y);
      if (d < v.T.L / 2 + 20 && d < bd && vSpeed(v) < 170) { bd = d; best = v; }
    }
    if (!best) { arcRef.toast('No car close enough', '', 900); return; }
    const v = best;
    const occupied = v.driver && !v.player && !v.parked;
    if (occupied) {
      spawnRunner(v);
      addHeat(v.police ? 2 : 1.25, 'jack');
      popText(v.police ? 'Police car taken!' : 'Carjacked!', v.x, v.y - 20, '#FF8A3D');
    } else if (G.copDist < 330 && !v.mine) addHeat(0.4, 'borrow');
    pl.veh = v; v.player = true; v.parked = false; v.driver = true; v.ai = null; v.mine = true; v.c.hb = false; v.siren = false; v.c.thr = v.c.brk = v.c.str = 0;
    pl.x = v.x; pl.y = v.y;
    startHum(v);
    arcRef.sfx.tone(260, 0.08, { type: 'square', vol: 0.1 }); arcRef.sfx.tone(200, 0.1, { type: 'square', vol: 0.1, delay: 0.07 });
    G.nearVeh = null;
  }
  function leaveCar(force) {
    const v = pl.veh; if (!v) return;
    const ca = Math.cos(v.a), sa = Math.sin(v.a);
    let ok = false;
    for (const s of [-1, 1]) {
      const d = v.T.Wd / 2 + 11;
      const x = v.x + sa * d * s, y = v.y - ca * d * s;
      if (!solidAt(x, y)) { pl.x = x; pl.y = y; ok = true; break; }
    }
    if (!ok) { pl.x = v.x; pl.y = v.y; }
    const sp = vSpeed(v);
    pl.vx = v.vx * 0.25; pl.vy = v.vy * 0.25;
    if (sp > 150 && !force) { pl.hp = Math.max(1, pl.hp - Math.min(25, (sp - 140) * 0.1)); pl.inv = 0.8; popText('Rolled out', pl.x, pl.y - 14, '#FF8A3D'); }
    v.player = false; v.c.thr = v.c.brk = 0; v.c.str = 0; v.c.hb = true; v.driver = false; v.parked = true; v.race = false;
    pl.veh = null; stopHum();
    arcRef.sfx.tone(200, 0.08, { type: 'square', vol: 0.09 });
  }

  /* ---- jobs */
  const JT = {
    courier: { name: 'Courier', col: '#FFB736', letter: 'C' },
    fare: { name: 'Fare', col: '#38D6B8', letter: 'F' },
    race: { name: 'Street race', col: '#FF5EA8', letter: 'R' },
    getaway: { name: 'Getaway', col: '#FF5252', letter: 'G' },
  };
  function placeOffer(o, rx, ry, dmin, dmax) {
    for (let t = 0; t < 60; t++) {
      const i = (rr() * NX) | 0, j = (rr() * NY) | 0, q = corner(i, j, rr() < 0.5 ? 1 : 0, rr() < 0.5 ? 1 : 0);
      const d = hyp(q.x - rx, q.y - ry); if (d < dmin || d > dmax) continue;
      let bad = false;
      for (const k of G.offers) if (k !== o && hyp(k.x - q.x, k.y - q.y) < 220) bad = true;
      for (const s of SAFE) if (hyp(s.x - q.x, s.y - q.y) < 100) bad = true;
      if (bad) continue;
      o.x = q.x; o.y = q.y; return;
    }
    const q = corner((rr() * NX) | 0, (rr() * NY) | 0, 1, 1); o.x = q.x; o.y = q.y;
  }
  function pickTarget(x, y, dmin, dmax) {
    const od = districtAt(x, y).id;
    for (let t = 0; t < 80; t++) {
      const q = corner((rr() * NX) | 0, (rr() * NY) | 0, rr() < 0.5 ? 1 : 0, rr() < 0.5 ? 1 : 0), d = hyp(q.x - x, q.y - y);
      if (d < dmin || d > dmax) continue;
      if (t < 50 && districtAt(q.x, q.y).id === od) continue;
      return q;
    }
    return corner(7, 7, 1, 1);
  }
  const jobMult = () => 1 + 0.2 * Math.min(G.chain, 5);

  function startJob(o) {
    if (G.job || G.caught) return;
    const type = o.type, need = type !== 'courier';
    const ok = pl.veh && !pl.veh.wreck && (type !== 'fare' || pl.veh.type !== 'bike');
    if (need && !ok) {
      if (G.time - (G.needCarT || -9) > 2.5) { G.needCarT = G.time; banner(type === 'fare' ? 'Fares need a car' : 'Get a vehicle first', type === 'fare' ? 'A scooter will not do. Take a car or rickshaw.' : 'Press F beside a car, then drive into the marker', 2200, JT[type].col); }
      return;
    }
    const D = DIFF[G.diff], j = { type, name: JT[type].name, col: JT[type].col, t: 0, o, crashes: 0, noCar: 0, needCar: need, stage: 'go' };
    if (type === 'courier') {
      const q = pickTarget(o.x, o.y, 900, 2000), dist = hyp(q.x - o.x, q.y - o.y);
      Object.assign(j, { tx: q.x, ty: q.y, tl: (dist / 100 + 24) * D.time, base: Math.round(90 + dist * 0.12), label: 'Deliver the parcel to ' + districtAt(q.x, q.y).name });
      j.tmax = j.tl;
      banner('Parcel picked up', j.label, 2400, j.col);
    } else if (type === 'fare') {
      const q = pickTarget(o.x, o.y, 1000, 2200), dist = hyp(q.x - o.x, q.y - o.y);
      Object.assign(j, { tx: q.x, ty: q.y, tl: (dist / 125 + 24) * D.time, base: Math.round(70 + dist * 0.07), label: 'Drive the passenger to ' + districtAt(q.x, q.y).name });
      j.tmax = j.tl;
      banner('Passenger aboard', 'Smooth and quick earns a tip', 2400, j.col);
    } else if (type === 'getaway') {
      G.heat = Math.max(G.heat, 3.2); G.unseen = 0;
      Object.assign(j, { tx: null, ty: null, base: 420, label: 'Shake the police: break their sight and stay hidden' });
      banner('Getaway', 'Three stars. Lose them!', 2400, j.col);
      arcRef.sfx.tone(660, 0.2, { type: 'square', vol: 0.12 });
    } else if (type === 'race') {
      // route of checkpoints along the road grid
      const n0 = nearestNode(o.x, o.y), cps = [];
      let ci = n0.i, cj = n0.j;
      for (let k = 0; k < 6; k++) {
        for (let t = 0; t < 30; t++) {
          const ni = clamp(ci + ((rr() * 7) | 0) - 3, 0, NX - 1), nj = clamp(cj + ((rr() * 7) | 0) - 3, 0, NY - 1);
          const dd = Math.abs(ni - ci) + Math.abs(nj - cj);
          if (dd >= 2 && dd <= 5 && !cps.some((c) => c.i === ni && c.j === nj) && !(ni === n0.i && nj === n0.j)) { ci = ni; cj = nj; break; }
        }
        cps.push({ i: ci, j: cj, x: XC[ci], y: YC[cj] });
      }
      // rival route: manhattan walk through each checkpoint
      const route = []; let ri = n0.i, rj = n0.j;
      cps.forEach((c, k) => {
        while (ri !== c.i || rj !== c.j) {
          if (ri !== c.i && (rj === c.j || rr() < 0.5)) ri += ri < c.i ? 1 : -1; else rj += rj < c.j ? 1 : -1;
          route.push({ x: XC[ri], y: YC[rj], cp: ri === c.i && rj === c.j ? k : null });
        }
      });
      const start = { x: XC[n0.i], y: YC[n0.j] };
      Object.assign(j, { cps, cp: 0, stage: 'count', cdt: 3.4, base: 350, label: 'Race the rival through 6 checkpoints', tx: cps[0].x, ty: cps[0].y });
      const first = route[0] || cps[0];
      const ang = Math.atan2(first.y - start.y, first.x - start.x);
      const ax = Math.abs(Math.cos(ang)) > Math.abs(Math.sin(ang)), dir = ax ? (Math.cos(ang) >= 0 ? 1 : -1) : (Math.sin(ang) >= 0 ? 1 : -1);
      const lane = ax ? laneCoord('h', n0.j, dir, 0) : laneCoord('v', n0.i, dir, 0);
      const rv = mkVeh('coupe', ax ? start.x - dir * 90 : lane, ax ? lane : start.y - dir * 90, ax ? (dir > 0 ? 0 : PI) : (dir > 0 ? PI / 2 : -PI / 2), { col: '#ff3b8a' });
      rv.race = true; rv.driver = true; rv.vmul = 1;
      rv.ai = { kind: 'rival', route, k: 0, cp: 0, go: false, mul: D.rival, rev: 0, done: false };
      j.rival = rv;
      banner('Street race', 'Get ready', 1800, j.col);
    }
    G.job = j; o.cd = 9999; o.hidden = true;
  }
  function endJobCleanup(j) {
    if (j.rival) { j.rival.race = false; j.rival.ai = null; j.rival.driver = false; j.rival.parked = true; j.rival.c.hb = true; j.rival.removeLater = true; }
    if (j.o) { j.o.hidden = false; j.o.cd = 25; placeOffer(j.o, pl.x, pl.y, 700, 2600); }
  }
  function payOut(base, bonus) {
    const mult = jobMult(), total = Math.round((base + bonus) * mult);
    G.cash += total; G.stats.jobs++;
    return { total, mult };
  }
  function completeJob(msg, sub, base, bonus) {
    const j = G.job; if (!j) return;
    const r = payOut(base, bonus);
    G.chain++; G.chainT = 100;
    banner(msg, money(r.total) + (r.mult > 1 ? '  chain x' + r.mult.toFixed(1) : '') + (sub ? '  ' + sub : ''), 3000, '#38D6B8');
    popText('+' + money(r.total), pl.x, pl.y - 22, '#7dff9b');
    sfxCash();
    for (let i = 0; i < 24; i++) { const a = rr() * TAU, s = 60 + rr() * 140; emit('cash', pl.x, pl.y, Math.cos(a) * s, Math.sin(a) * s - 40, 0.9 + rr() * 0.5, 2 + rr() * 2, rr() < 0.5 ? '#7dff9b' : '#FFB736', 220); }
    endJobCleanup(j); G.job = null;
  }
  function failJob(why, quiet) {
    const j = G.job; if (!j) return;
    G.chain = 0; G.chainT = 0;
    if (!quiet) banner('Job failed', why, 2600, '#FF5252');
    arcRef.sfx.tone(240, 0.3, { type: 'sawtooth', slide: 110, vol: 0.16 });
    endJobCleanup(j); G.job = null;
  }

  function updateJob(dt) {
    const j = G.job; if (!j) return;
    j.t += dt;
    if (j.needCar) {
      if (pl.veh && !pl.veh.wreck) j.noCar = 0; else { j.noCar += dt; if (j.noCar > 12) { failJob('You left the car behind'); return; } }
    }
    const dTarget = j.tx != null ? hyp(pl.x - j.tx, pl.y - j.ty) : 1e9;
    if (j.type === 'courier') {
      j.tl -= dt; if (j.tl <= 0) { failJob('Out of time'); return; }
      if (dTarget < 42) { const f = j.tl / j.tmax; completeJob('Parcel delivered', f > 0.4 ? 'fast!' : '', j.base, Math.round(j.base * 0.45 * f)); }
    } else if (j.type === 'fare') {
      j.tl -= dt; if (j.tl <= 0) { failJob('The passenger got out'); return; }
      if (dTarget < 44 && pl.veh) {
        const f = j.tl / j.tmax, comfort = Math.max(0, 1 - 0.28 * j.crashes);
        const tip = Math.round(j.base * 0.7 * f * comfort);
        completeJob('Passenger dropped off', tip > 0 ? 'tip ' + money(tip) : 'no tip', j.base, tip);
      }
    } else if (j.type === 'getaway') {
      if (j.t > 4 && G.heat < 0.7 && G.copDist > 340) completeJob('Lost them', '', j.base, Math.round(j.t < 60 ? 80 : 0));
    } else if (j.type === 'race') {
      const rv = j.rival;
      if (j.stage === 'count') {
        j.cdt -= dt;
        const n = Math.ceil(j.cdt);
        if (n !== j.lastN && n > 0) { j.lastN = n; arcRef.sfx.tone(520, 0.12, { type: 'square', vol: 0.14 }); banner(String(n), 'Race starts', 900, j.col); }
        if (j.cdt <= 0) { j.stage = 'race'; if (rv && rv.ai) rv.ai.go = true; banner('GO!', '', 900, '#38D6B8'); arcRef.sfx.tone(880, 0.3, { type: 'square', vol: 0.16 }); }
      } else {
        const cp = j.cps[j.cp];
        if (cp && hyp(pl.x - cp.x, pl.y - cp.y) < 56) {
          j.cp++; arcRef.sfx.tone(700 + j.cp * 60, 0.12, { type: 'triangle', vol: 0.15 });
          if (j.cp >= j.cps.length) { completeJob('You won the race', '', j.base, 60); return; }
          j.tx = j.cps[j.cp].x; j.ty = j.cps[j.cp].y; popText('Checkpoint ' + j.cp, pl.x, pl.y - 20, '#FF5EA8');
        }
        if (rv && rv.ai && rv.ai.done) { failJob('The rival got there first'); return; }
        if (rv && rv.stuck > 3.2 && rv.ai) { const a = rv.ai, wp = a.route[Math.min(a.k, a.route.length - 1)]; if (wp) { rv.x = wp.x - Math.cos(rv.a) * 30; rv.y = wp.y - Math.sin(rv.a) * 30; rv.vx = rv.vy = 0; rv.stuck = 0; } }
        j.tx = j.cps[Math.min(j.cp, j.cps.length - 1)].x; j.ty = j.cps[Math.min(j.cp, j.cps.length - 1)].y;
      }
    }
  }

  /* ---- pickups */
  const PK = [];
  function managePickups() {
    for (let i = PK.length - 1; i >= 0; i--) if (hyp(PK[i].x - G.fx, PK[i].y - G.fy) > 1300) PK.splice(i, 1);
    if (PK.length >= 8) return;
    for (let t = 0; t < 6; t++) {
      const a = rr() * TAU, d = 220 + rr() * 800, n = nearestNode(G.fx + Math.cos(a) * d, G.fy + Math.sin(a) * d);
      const q = corner(n.i, n.j, rr() < 0.5 ? 1 : 0, rr() < 0.5 ? 1 : 0);
      if (solidAt(q.x, q.y) || inView(q.x, q.y, 0)) continue;
      PK.push({ x: q.x, y: q.y, v: 15 + ((rr() * 6) | 0) * 7, s: rr() * 6 }); return;
    }
  }

  /* ---- heat, police, arrest */
  function updateHeat(dt) {
    G.copDist = copDist();
    const prev = stars();
    if (G.heat > 0) {
      if (G.copDist < 440) G.unseen = 0; else G.unseen += dt;
      const need = G.heat < 1 ? 3 : DIFF[G.diff].decay;
      if (G.unseen > need) G.heat -= (G.heat < 1 ? 0.35 : 0.2) * dt;
      if (G.heat < 0.02) G.heat = 0;
    }
    if (stars() < prev && G.heat >= 0) { if (G.heat === 0 || stars() < prev) banner(stars() === 0 ? 'Heat is off' : stars() + (stars() === 1 ? ' star' : ' stars'), 'You slipped away', 1600, '#38D6B8'); }
    const st = stars(), D = DIFF[G.diff];
    G.bfsT -= dt;
    if (st >= 1 && G.bfsT <= 0) { bfsField(pl.x, pl.y); G.bfsT = 0.5; }
    let chasers = 0;
    for (let i = 0; i < V.length; i++) {
      const v = V[i]; if (!v.police || v.wreck || v.player) continue;
      const d = hyp(v.x - pl.x, v.y - pl.y);
      if (st >= 1) {
        if ((!v.ai || v.ai.kind !== 'chase') && d < 1100 && !v.race) startChase(v);
        if (v.ai && v.ai.kind === 'chase') { v.ai.mul = (0.9 + 0.045 * st) * D.police; chasers++; if (d > 1500) v.remove = true; }
      } else if (v.ai && v.ai.kind === 'chase') releaseCop(v);
    }
    const target = st >= 1 ? clamp([0, 2, 3, 4, 6, 8][st] + D.count, 1, 9) : 0;
    G.copCd -= dt;
    if (chasers < target && G.copCd <= 0) { if (spawnCop()) G.copCd = Math.max(0.5, 1.8 - 0.25 * st); else G.copCd = 0.3; }
    // arrest
    if (G.caught) return;
    let nearC = 0, nearAny = 1e9;
    for (let i = 0; i < V.length; i++) { const v = V[i]; if (v.police && !v.wreck && !v.player && v.ai && v.ai.kind === 'chase') { const d = hyp(v.x - pl.x, v.y - pl.y); if (d < nearAny) nearAny = d; if (d < 56) nearC++; } }
    const pv = pl.veh, psp = pv ? vSpeed(pv) : hyp(pl.vx, pl.vy);
    let cond = false;
    if (st >= 1) {
      if (!pv && nearAny < 46) cond = true;
      else if (pv && pv.wreck && nearAny < 62) cond = true;
      else if (pv && psp < 38 && nearC >= 2) cond = true;
    }
    G.arrest = cond ? G.arrest + dt / 1.15 : Math.max(0, G.arrest - dt * 1.6);
    if (G.arrest >= 1) startCaught('busted');
  }

  /* ---- the player */
  function updatePlayer(dt) {
    const inp = arcRef.input;
    if (pl.inv > 0) pl.inv -= dt;
    if (G.caught) return;
    if (inp.hit('KeyF')) { if (pl.veh) leaveCar(false); else tryEnter(); }
    const horn = inp.down('KeyH');
    G.hornCd -= dt;
    if (horn && G.hornCd <= 0) {
      G.hornCd = 0.27; const s = arcRef.sfx;
      s.tone(392, 0.24, { type: 'square', vol: 0.13 }); s.tone(494, 0.24, { type: 'square', vol: 0.1 });
      if (pl.veh) pl.veh.horn = 0.25;
      for (const p of PD) if (hyp(p.x - pl.x, p.y - pl.y) < 150 && p.state === 'walk') { p.state = 'flee'; p.t = 1.1; const d = hyp(p.x - pl.x, p.y - pl.y) || 1; p.fx = (p.x - pl.x) / d; p.fy = (p.y - pl.y) / d; }
    }
    if (pl.veh) {
      const v = pl.veh, ax = inp.axis(), c = v.c;
      c.thr = Math.max(0, -ax.y); c.brk = Math.max(0, ax.y);
      c.str = lerp(c.str, ax.x, Math.min(1, dt * 9));
      c.hb = inp.down('Space');
      pl.x = v.x; pl.y = v.y; pl.a = v.a;
      if (pl.hum) {
        const sp = vSpeed(v), base = v.type === 'bike' ? 70 : v.type === 'coupe' ? 62 : v.type === 'van' ? 42 : v.type === 'auto' ? 52 : 50;
        pl.hum.set(base + sp * (v.type === 'coupe' ? 0.28 : 0.2) + c.thr * 14, v.wreck ? 0 : 0.045 + 0.05 * Math.max(c.thr, sp / v.T.vmax * 0.6));
      }
      if (v.wreck && v.wreckT > 5.4) { leaveCar(true); pl.hp = Math.max(1, pl.hp - 25); }
      else if (v.wreck && v.wreckT > 1.5 && !v.burnt) { pl.hp -= 9 * dt; if (pl.hp <= 0) { pl.hp = 1; startCaught('ko'); } }
    } else {
      const ax = inp.axis(), sprint = inp.down('ShiftLeft', 'ShiftRight', 'Space');
      const sp = sprint ? 165 : 98, m = hyp(ax.x, ax.y);
      pl.vx = lerp(pl.vx, ax.x * sp, Math.min(1, dt * 12)); pl.vy = lerp(pl.vy, ax.y * sp, Math.min(1, dt * 12));
      pl.moving = m > 0.1;
      if (pl.moving) { pl.a = Math.atan2(ax.y, ax.x); pl.step += dt * (sprint ? 16 : 10); }
      pl.x += pl.vx * dt; pl.y += pl.vy * dt;
      for (let it = 0; it < 2; it++) if (circleSolid(pl.x, pl.y, 5.5)) { pl.x += hit.nx * hit.pen; pl.y += hit.ny * hit.pen; }
      // cars as obstacles, and as danger
      for (let i = 0; i < V.length; i++) {
        const v = V[i]; if (Math.abs(v.x - pl.x) > 60 || Math.abs(v.y - pl.y) > 60) continue;
        const ca = Math.cos(v.a), sa = Math.sin(v.a), spd = vSpeed(v);
        for (let k = 0; k < v.T.circ.length; k++) {
          const o = v.T.circ[k], cx = v.x + ca * o, cy = v.y + sa * o, dx = pl.x - cx, dy = pl.y - cy, rs = v.T.r + 5.5, d2 = dx * dx + dy * dy;
          if (d2 < rs * rs) {
            const d = Math.sqrt(d2) || 0.1;
            pl.x += dx / d * (rs - d); pl.y += dy / d * (rs - d);
            if (spd > 55 && pl.inv <= 0) {
              const dmg = Math.min(32, spd * 0.09); pl.hp -= dmg; pl.inv = 1.2; pl.vx += v.vx * 0.5; pl.vy += v.vy * 0.5;
              popText('Ow!', pl.x, pl.y - 14, '#FF8A3D'); arcRef.sfx.tone(180, 0.12, { type: 'triangle', slide: 90, vol: 0.18 });
              if (!arcRef.reducedMotion) G.shake = Math.max(G.shake, 5);
              if (v.player) addHeat(0.1, 'hit');
              if (pl.hp <= 0) { pl.hp = 1; startCaught('ko'); }
            }
          }
        }
      }
      pl.x = clamp(pl.x, 30, W - 30); pl.y = clamp(pl.y, 30, W - 30);
      if (pl.hp < 100 && !G.caught) pl.hp = Math.min(100, pl.hp + 2.5 * dt);
    }
    // cash pickups
    for (let i = PK.length - 1; i >= 0; i--) {
      const k = PK[i];
      if (hyp(k.x - pl.x, k.y - pl.y) < (pl.veh ? 28 : 20)) {
        PK.splice(i, 1); G.cash += k.v; popText('+' + money(k.v), k.x, k.y - 8, '#7dff9b'); sfxCash();
        for (let q = 0; q < 8; q++) emit('cash', k.x, k.y, (rr() - 0.5) * 120, -rr() * 90, 0.7, 2.4, '#7dff9b', 220);
      }
    }
    // markers
    for (const o of G.offers) {
      if (o.hidden) continue;
      if (o.cd > 0) { o.cd -= dt; continue; }
      if (hyp(pl.x - o.x, pl.y - o.y) < 34) startJob(o);
    }
    // near car prompt
    G.nearVeh = null;
    if (!pl.veh) {
      let bd = 1e9;
      for (const v of V) { if (v.burnt || v.player || v.race || (v.wreck && v.wreckT > 1.2)) continue; const d = hyp(v.x - pl.x, v.y - pl.y); if (d < v.T.L / 2 + 20 && d < bd && vSpeed(v) < 170) { bd = d; G.nearVeh = v; } }
    }
  }

  /* ---- ambient world: fire, smoke, peds, spawns */
  function updateVehFx(v, dt) {
    if (v.horn > 0) v.horn -= dt;
    if (v.wreck) {
      v.wreckT += dt;
      if (v.wreckT > 1.4 && !v.burnt) {
        if (rr() < dt * 26) emit('fire', v.x + (rr() - 0.5) * v.T.L * 0.6, v.y + (rr() - 0.5) * v.T.Wd * 0.6, (rr() - 0.5) * 20, -20, 0.5 + rr() * 0.3, 5 + rr() * 5, 'rgba(255,150,40,1)');
        if (rr() < dt * 14) emit('smoke', v.x, v.y, (rr() - 0.5) * 30, -30, 1.6, 9 + rr() * 8, 'rgba(40,40,40,.55)');
      }
      if (v.wreckT > 5 && !v.burnt) { v.burnt = true; for (let i = 0; i < 14; i++) emit('smoke', v.x, v.y, (rr() - 0.5) * 80, (rr() - 0.5) * 80, 1.6, 12, 'rgba(30,30,30,.6)'); }
      v.c.hb = true;
    } else if (v.hp < v.maxhp * 0.5) {
      v.smoke -= dt;
      if (v.smoke <= 0) {
        v.smoke = v.hp < v.maxhp * 0.25 ? 0.07 : 0.16;
        const ca = Math.cos(v.a), sa = Math.sin(v.a);
        emit('smoke', v.x + ca * v.T.L * 0.32, v.y + sa * v.T.L * 0.32, (rr() - 0.5) * 16 - v.vx * 0.1, (rr() - 0.5) * 16 - v.vy * 0.1, 1.1, 5 + rr() * 5, v.hp < v.maxhp * 0.25 ? 'rgba(30,30,30,.6)' : 'rgba(150,150,150,.5)');
      }
    }
  }

  function manageSpawns() {
    const D = DIFF[G.diff], touch = touchish();
    const tTraffic = Math.round(24 * D.traffic * (touch ? 0.72 : 1)), tParked = touch ? 14 : 18, tPed = touch ? 26 : 38;
    let nT = 0, nP = 0, nPol = 0;
    for (let i = V.length - 1; i >= 0; i--) {
      const v = V[i], d = hyp(v.x - G.fx, v.y - G.fy), vis = inView(v.x, v.y, 80);
      if (v.player || (G.job && G.job.rival === v)) { continue; }
      let rm = false;
      if (v.remove) rm = true;
      else if (v.removeLater) rm = !vis;
      else if (v.burnt || v.wreck) rm = d > 1000 || (!vis && d > 700 && v.wreckT > 12);
      else if (v.mine) rm = d > 2300;
      else if (v.parked) rm = d > 1500 || (!vis && d > 1050 && rr() < 0.3);
      else if (v.ai && v.ai.kind === 'chase') rm = d > 1600;
      else rm = d > 1300 || (!vis && v.stuck > 5 && v.blocked > 5) || (!vis && d > 900 && rr() < 0.15);
      if (rm) { V.splice(i, 1); continue; }
      if (v.ai && v.ai.kind === 'traffic') { if (v.police) nPol++; else nT++; } else if (v.parked && !v.mine) nP++;
    }
    for (let i = PD.length - 1; i >= 0; i--) { const p = PD[i], d = hyp(p.x - G.fx, p.y - G.fy); if (d > 1250 || (d > 800 && !inView(p.x, p.y, 40) && rr() < 0.1)) PD.splice(i, 1); }
    if (nT < tTraffic) spawnTraffic(pickTrafficType(), 560, 1050);
    if (nP < tParked) spawnParked(pickParkedType(), 300, 1050);
    if (nPol < 2 && G.phase === 'play' && stars() === 0 && rr() < 0.2) spawnTraffic('police', 700, 1100);
    if (PD.length < tPed) { spawnPedAt(330, 950); }
    managePickups();
  }
  function populate() {
    G.initial = true;
    const touch = touchish(), D = DIFF[G.diff];
    for (let i = 0; i < 160 && V.filter((v) => v.ai && v.ai.kind === 'traffic' && !v.police).length < Math.round(24 * D.traffic * (touch ? 0.72 : 1)); i++) spawnTraffic(pickTrafficType(), 60, 1000);
    for (let i = 0; i < 120 && V.filter((v) => v.parked && !v.mine).length < (touch ? 14 : 18); i++) spawnParked(pickParkedType(), 120, 1000);
    for (let i = 0; i < 80 && PD.length < (touch ? 26 : 38); i++) spawnPedAt(60, 900);
    for (let i = 0; i < 2; i++) spawnTraffic('police', 300, 1000);
    G.initial = false;
  }

  /* ================================================================ world update, camera */
  const nightOf = (h) => { const s = Math.sin(PI * (h - 6) / 12); return clamp((0.18 - s) / 0.5, 0, 1); };
  const duskOf = (h) => { const s = Math.sin(PI * (h - 6) / 12); return Math.max(0, 1 - Math.abs(s - 0.03) / 0.3); };
  const hourText = (h) => { const hh = Math.floor(h) % 24, mm = Math.floor((h % 1) * 60), ap = hh >= 12 ? 'PM' : 'AM', h12 = hh % 12 === 0 ? 12 : hh % 12; return h12 + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap; };
  const RANKS = [[0, 'Pavement Rookie'], [500, 'Rickshaw Runner'], [1500, 'Street Hustler'], [3000, 'Saffron Boss'], [6000, 'City Legend']];
  const rankOf = (cash) => { let r = RANKS[0]; for (const k of RANKS) if (cash >= k[0]) r = k; return r[1]; };
  const nextRank = (cash) => { for (const k of RANKS) if (cash < k[0]) return k; return null; };

  function updateCamera(dt, playing) {
    const arc = arcRef, short = Math.min(arc.w, arc.h);
    const span = 330 + (clamp(short, 390, 900) - 390) * 0.8;
    let base = short / span;
    const veh = playing ? pl.veh : null;
    if (playing && !veh) base *= 1.12;
    const sp = veh ? vSpeed(veh) : 0;
    const zt = base * (1 - 0.36 * clamp(sp / 430, 0, 1));
    const k = arc.reducedMotion ? 1.2 : 2.2;
    G.zoom = lerp(G.zoom, zt, 1 - Math.exp(-dt * k));
    let tx, ty, lvx = 0, lvy = 0;
    if (playing) { tx = pl.x; ty = pl.y; lvx = veh ? veh.vx : pl.vx; lvy = veh ? veh.vy : pl.vy; } else { tx = G.attX; ty = G.attY; lvx = 70; lvy = 0; }
    const la = arc.reducedMotion ? 0.18 : 0.4;
    G.lookX = lerp(G.lookX, clamp(lvx * la, -190, 190), 1 - Math.exp(-dt * 2.6));
    G.lookY = lerp(G.lookY, clamp(lvy * la, -190, 190), 1 - Math.exp(-dt * 2.6));
    const gx = tx + G.lookX, gy = ty + G.lookY, f = 1 - Math.exp(-dt * (arc.reducedMotion ? 3 : 6));
    G.camX = lerp(G.camX, gx, f); G.camY = lerp(G.camY, gy, f);
    G.camX = clamp(G.camX, 40, W - 40); G.camY = clamp(G.camY, 40, W - 40);
    G.vw = arc.w / G.zoom; G.vh = arc.h / G.zoom;
    G.shake *= Math.exp(-dt * 9);
  }

  function updateWorld(dt, playing) {
    G.time += dt; G.hour = (G.hour + dt / 15) % 24;
    if (playing) { G.fx = pl.x; G.fy = pl.y; } else {
      G.attractT += dt;
      const L = 3300, t = (G.attractT * 62) % (L * 2), u = t < L ? t : L * 2 - t;
      G.attX = 900 + u; G.attY = YC[6] - 24 + Math.sin(G.attractT * 0.2) * 26; G.fx = G.camX; G.fy = G.camY;
    }
    G.popCd -= dt;
    if (G.popCd <= 0) { G.popCd = 0.25; manageSpawns(); }
    for (let i = 0; i < V.length; i++) {
      const v = V[i];
      if (v.ai) { const k = v.ai.kind; if (k === 'traffic') aiTraffic(v, dt); else if (k === 'chase') aiChase(v, dt); else if (k === 'rival') aiRival(v, dt); }
      if (v.remove) continue;
      const moving = v.player || !v.parked || v.vx * v.vx + v.vy * v.vy > 0.25;
      if (!moving) { v.f = 0; v.l = 0; updateVehFx(v, dt); continue; }
      stepVeh(v, dt);
      collideWorld(v);
      v.x = clamp(v.x, 24, W - 24); v.y = clamp(v.y, 24, W - 24);
      updateVehFx(v, dt);
    }
    for (let i = 0; i < V.length; i++) {
      const a = V[i];
      for (let j = i + 1; j < V.length; j++) {
        const b = V[j];
        if (Math.abs(a.x - b.x) > 80 || Math.abs(a.y - b.y) > 80) continue;
        if (!a.player && !b.player && a.parked && b.parked && a.vx * a.vx + a.vy * a.vy < 1 && b.vx * b.vx + b.vy * b.vy < 1) continue;
        collideVeh(a, b);
      }
    }
    for (let i = 0; i < PD.length; i++) updatePed(PD[i], dt);
    updateParts(dt);
    for (let i = G.floaters.length - 1; i >= 0; i--) { const f = G.floaters[i]; f.t += dt; f.y -= 22 * dt; if (f.t > 1.4) G.floaters.splice(i, 1); }
    if (G.banner) { G.banner.t += dt; if (G.banner.t > G.banner.max) G.banner = null; }
  }

  function updatePlay(dt) {
    const arc = arcRef;
    if (arc.input.hit('KeyM')) { G.mapOpen = !G.mapOpen; arc.sfx.tone(G.mapOpen ? 520 : 400, 0.06, { type: 'triangle', vol: 0.1 }); }
    if (G.mapOpen) { updateCamera(dt, true); return; }
    if (G.caught) {
      G.caught.t += dt;
      if (G.caught.t > 2.6 && !G.caught.done) { G.caught.done = true; respawnAtSafe(); }
      if (G.caught.t > 3.4) G.caught = null;
    }
    updatePlayer(dt);
    updateWorld(dt, true);
    if (!G.caught) { updateJob(dt); updateHeat(dt); }
    if (G.chainT > 0) { G.chainT -= dt; if (G.chainT <= 0) G.chain = 0; }
    if (G.mode === 'hustle') {
      G.hustleLeft -= dt;
      if (G.hustleLeft <= 0) { endHustle(); return; }
      if (!G.warned && G.hustleLeft < 30) { G.warned = true; banner('30 seconds left', 'Cash in what you can', 2200, '#FFB736'); }
    }
    // sirens
    let cd = 1e9;
    for (const v of V) if (v.siren && !v.wreck) { const d = hyp(v.x - pl.x, v.y - pl.y); if (d < cd) cd = d; }
    G.sirenCd -= dt;
    if (cd < 800 && G.sirenCd <= 0) {
      G.sirenT = !G.sirenT; G.sirenCd = 0.38;
      const vol = clamp(1 - cd / 800, 0.02, 1) * 0.1;
      arc.sfx.tone(G.sirenT ? 650 : 900, 0.4, { type: 'sine', slide: G.sirenT ? 900 : 650, vol });
    }
    // district toast
    const d = districtAt(pl.x, pl.y);
    if (G.district !== d) { const first = !G.district; G.district = d; if (!first || true) arc.toast(d.name, 'Entering', 1700); }
    // prompt
    const t = arc.touchMode, key = t ? 'Tap Car' : 'Press F';
    G.prompt = '';
    if (!G.caught) {
      if (!pl.veh && G.nearVeh) { const nv = G.nearVeh; G.prompt = key + ': ' + (nv.driver && !nv.parked ? 'carjack the ' : 'take the ') + nv.T.name.toLowerCase(); }
      else if (pl.veh && vSpeed(pl.veh) < 40 && !pl.veh.wreck) G.prompt = key + ': get out';
      else if (pl.veh && pl.veh.wreck) G.prompt = key + ': get out now';
    }
    updateCamera(dt, true);
  }

  function endHustle() {
    if (G.phase !== 'play') return;
    G.phase = 'over'; G.active = false;
    stopHum();
    const arc = arcRef;
    arc.sfx.tone(520, 0.2, { type: 'triangle', vol: 0.15 }); arc.sfx.tone(780, 0.3, { type: 'triangle', vol: 0.15, delay: 0.18 });
    arc.over({
      score: Math.round(G.cash), scoreLabel: 'Cash', eyebrow: 'Time up', title: 'Ten minute hustle',
      html: '<p>' + esc(rankOf(G.cash)) + '. ' + G.stats.jobs + (G.stats.jobs === 1 ? ' job' : ' jobs') + ' done, ' + G.stats.crashes + ' crashes.</p>',
      again: 'Hustle again',
    });
  }
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function resetGame() {
    V.length = 0; PD.length = 0; PK.length = 0; for (const p of PART) p.on = false; SK.n = 0; stopHum();
    G.phase = 'play'; G.cash = 0; G.heat = 0; G.unseen = 0; G.arrest = 0; G.chain = 0; G.chainT = 0; G.job = null; G.caught = null; G.mapOpen = false;
    G.banner = null; G.floaters.length = 0; G.stats = { jobs: 0, crashes: 0 }; G.hustleLeft = 600; G.warned = false; G.district = null; G.copDist = 1e9; G.copCd = 0;
    G.hour = 18.2; G.offers = []; G.prompt = ''; G.nearVeh = null;
    pl.hp = 100; pl.inv = 0; pl.veh = null; pl.vx = pl.vy = 0; pl.a = 0.3;
    const s = SAFE[0]; pl.x = s.x + 30; pl.y = s.y + 6;
    G.fx = pl.x; G.fy = pl.y; G.camX = pl.x; G.camY = pl.y; G.lookX = G.lookY = 0; G.zoom = 1.3;
    starterCar(s);
    populate();
    const types = ['courier', 'courier', 'courier', 'fare', 'fare', 'race', 'race', 'getaway', 'getaway'];
    types.forEach((t, i) => { const o = { type: t, x: 0, y: 0, cd: 0, hidden: false }; G.offers.push(o); placeOffer(o, pl.x, pl.y, i < 4 ? 260 : 500, i < 4 ? 1100 : 2400); });
    for (let i = 0; i < 6; i++) managePickups();
    banner('Saffron City', arcRef.touchMode ? 'Walk to the car and tap Car. Drive into a glowing marker for a job.' : 'Walk to the yellow car and press F. Drive into a glowing marker for a job.', 5200, '#FFB736');
    arcRef.toast('Marine Parade', 'Entering', 1800);
    G.district = districtAt(pl.x, pl.y);
  }

  /* ================================================================ rendering the world */
  let lightCv = null, lc = null, lw = 0, lh = 0;
  function ensureLight(w, h) {
    const nw = Math.ceil(w / 2), nh = Math.ceil(h / 2);
    if (!lightCv) { lightCv = newCv(nw, nh); lc = lightCv.getContext('2d'); } else if (lightCv.width !== nw || lightCv.height !== nh) { lightCv.width = nw; lightCv.height = nh; }
    lw = nw; lh = nh;
  }
  const glowCache = {};
  function glowFor(col) {
    if (glowCache[col]) return glowCache[col];
    const c = hex2rgb(col);
    return (glowCache[col] = radial(64, [[0, 'rgba(' + c.join(',') + ',.9)'], [0.4, 'rgba(' + c.join(',') + ',.35)'], [1, 'rgba(' + c.join(',') + ',0)']]));
  }

  let tr = [0, 0, 0, 0];
  function drawTiles(ctx, w, h, cx, cy, z) {
    tileClock++; builtThisFrame = 0;
    const x0 = cx - w / 2 / z, y0 = cy - h / 2 / z, x1 = cx + w / 2 / z, y1 = cy + h / 2 / z;
    const ta = clamp(Math.floor(x0 / TILE), 0, TN - 1), tb = clamp(Math.floor(x1 / TILE), 0, TN - 1);
    const tc = clamp(Math.floor(y0 / TILE), 0, TN - 1), td = clamp(Math.floor(y1 / TILE), 0, TN - 1);
    tr = [ta, tb, tc, td];
    const allow = G.preload ? 99 : 4;
    ctx.fillStyle = '#1b1f27'; ctx.fillRect(0, 0, w, h);
    for (let ty = tc; ty <= td; ty++) for (let tx = ta; tx <= tb; tx++) {
      const t = getTile(tx, ty, builtThisFrame < allow);
      const sx0 = Math.round((tx * TILE - cx) * z + w / 2), sy0 = Math.round((ty * TILE - cy) * z + h / 2);
      const sx1 = Math.round(((tx + 1) * TILE - cx) * z + w / 2), sy1 = Math.round(((ty + 1) * TILE - cy) * z + h / 2);
      if (t) ctx.drawImage(t.cv, sx0, sy0, sx1 - sx0 + 1, sy1 - sy0 + 1);
      else { ctx.fillStyle = '#4a4a43'; ctx.fillRect(sx0, sy0, sx1 - sx0 + 1, sy1 - sy0 + 1); }
    }
    G.preload = false;
    if (builtThisFrame < 2) {
      for (let ty = tc - 1; ty <= td + 1 && builtThisFrame < 2; ty++) for (let tx = ta - 1; tx <= tb + 1 && builtThisFrame < 2; tx++) {
        if (tx < 0 || ty < 0 || tx >= TN || ty >= TN) continue;
        if (tx >= ta && tx <= tb && ty >= tc && ty <= td) continue;
        getTile(tx, ty, true);
      }
    }
    trimTiles();
  }

  function drawSkids(ctx, cx, cy, z, w, h) {
    const n = Math.min(SK.n, SKN), x0 = cx - w / 2 / z - 10, x1 = cx + w / 2 / z + 10, y0 = cy - h / 2 / z - 10, y1 = cy + h / 2 / z + 10;
    ctx.lineCap = 'round'; ctx.lineWidth = 2.6;
    for (let lvl = 0; lvl < 4; lvl++) {
      ctx.beginPath(); let any = false;
      for (let i = 0; i < n; i++) {
        const age = G.time - SK.t[i]; if (age > 24 || age < 0) continue;
        const l = age < 6 ? 0 : age < 12 ? 1 : age < 18 ? 2 : 3; if (l !== lvl) continue;
        const ax = SK.x1[i], ay = SK.y1[i]; if (ax < x0 || ax > x1 || ay < y0 || ay > y1) continue;
        ctx.moveTo(ax, ay); ctx.lineTo(SK.x2[i], SK.y2[i]); any = true;
      }
      if (any) { ctx.strokeStyle = 'rgba(12,10,10,' + [0.42, 0.32, 0.2, 0.1][lvl] + ')'; ctx.stroke(); }
    }
  }

  function ringAt(ctx, x, y, r, col, pulse, label, big) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = rgba(col, 0.14 + 0.1 * pulse); ctx.beginPath(); ctx.arc(0, 0, r + 4, 0, TAU); ctx.fill();
    ctx.strokeStyle = col; ctx.lineWidth = big ? 4 : 3; ctx.beginPath(); ctx.arc(0, 0, r + 2 * pulse, 0, TAU); ctx.stroke();
    ctx.setLineDash([6, 8]); ctx.lineDashOffset = -G.time * 22; ctx.lineWidth = 2; ctx.strokeStyle = rgba(col, 0.8);
    ctx.beginPath(); ctx.arc(0, 0, r + 9, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill();
    ctx.fillStyle = '#16130e'; ctx.font = '700 14px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, 0, 1);
    for (let i = 0; i < 3; i++) { const a = G.time * 1.3 + i * TAU / 3, rr2 = r + 14; ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.beginPath(); ctx.arc(Math.cos(a) * rr2, Math.sin(a) * rr2, 1.8, 0, TAU); ctx.fill(); }
    ctx.restore();
  }

  function drawMarkers(ctx) {
    const t = G.time;
    for (const s of SAFE) {
      if (!inView(s.x, s.y, 50)) continue;
      ctx.save(); ctx.translate(s.x, s.y);
      ctx.fillStyle = 'rgba(56,214,184,.2)'; ctx.beginPath(); ctx.arc(0, 0, 16, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#38D6B8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.stroke();
      ctx.fillStyle = '#38D6B8'; ctx.beginPath(); ctx.moveTo(-8, 1); ctx.lineTo(0, -8); ctx.lineTo(8, 1); ctx.closePath(); ctx.fill(); ctx.fillRect(-5.5, 1, 11, 7);
      ctx.fillStyle = '#16130e'; ctx.fillRect(-1.6, 3.5, 3.2, 4.5);
      ctx.restore();
    }
    for (const o of G.offers) {
      if (o.hidden || o.cd > 0 || !inView(o.x, o.y, 70)) continue;
      ringAt(ctx, o.x, o.y, 24, JT[o.type].col, 0.5 + 0.5 * Math.sin(t * 3 + o.x), JT[o.type].letter, false);
    }
    const j = G.job;
    if (j) {
      if (j.type === 'race' && j.cps) {
        for (let k = j.cps.length - 1; k >= j.cp; k--) {
          const c = j.cps[k]; if (!inView(c.x, c.y, 80)) continue;
          const next = k === j.cp;
          ringAt(ctx, c.x, c.y, next ? 36 : 24, next ? '#FF5EA8' : '#b4446f', 0.5 + 0.5 * Math.sin(t * 4), String(k + 1), next);
        }
      } else if (j.tx != null && inView(j.tx, j.ty, 80)) {
        ringAt(ctx, j.tx, j.ty, 36, j.col, 0.5 + 0.5 * Math.sin(t * 4), j.type === 'fare' ? 'F' : 'D', true);
      }
    }
  }

  function drawPickups(ctx) {
    for (const k of PK) {
      if (!inView(k.x, k.y, 30)) continue;
      const s = 1 + 0.12 * Math.sin(G.time * 5 + k.s);
      ctx.save(); ctx.translate(k.x, k.y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-6, -3, 14, 9);
      ctx.fillStyle = '#2f8f4e'; ctx.fillRect(-7, -5, 14, 9);
      ctx.fillStyle = '#7dff9b'; ctx.fillRect(-6, -4, 12, 7);
      ctx.fillStyle = '#FFB736'; ctx.beginPath(); ctx.arc(0, -0.5, 2.8, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function drawVeh(ctx, v) {
    const T = v.T, spr = vehSprite(v.type, v.col), hl = T.L / 2, hw = T.Wd / 2;
    ctx.save(); ctx.translate(v.x, v.y);
    ctx.save(); ctx.translate(3.5, 4.5); ctx.rotate(v.a); ctx.fillStyle = 'rgba(0,0,0,.30)'; rrect(ctx, -hl, -hw, T.L, T.Wd, 6); ctx.fill(); ctx.restore();
    ctx.rotate(v.a);
    ctx.drawImage(spr.cv, -spr.w / 2, -spr.h / 2, spr.w, spr.h);
    const dmg = 1 - v.hp / v.maxhp;
    if (dmg > 0.35 || v.burnt) {
      ctx.fillStyle = 'rgba(25,14,8,' + (v.burnt ? 0.72 : 0.12 + dmg * 0.4) + ')'; rrect(ctx, -hl, -hw, T.L, T.Wd, 6); ctx.fill();
      if (!v.burnt) { ctx.strokeStyle = 'rgba(20,12,8,.5)'; ctx.lineWidth = 0.9; ctx.beginPath(); const s0 = v.id * 7; ctx.moveTo(-hl + 6 + (s0 % 9), -hw + 2); ctx.lineTo(-hl + 11 + (s0 % 9), 1); ctx.lineTo(-hl + 7 + (s0 % 9), hw - 2); ctx.moveTo(hl - 12 - (s0 % 5), -hw + 3); ctx.lineTo(hl - 8, 2); ctx.stroke(); }
    }
    if (v.brakeL && !v.wreck) { ctx.fillStyle = 'rgba(255,70,50,.95)'; if (v.type === 'bike') ctx.fillRect(-hl - 0.4, -1.6, 2, 3.2); else { ctx.fillRect(-hl - 0.4, -hw + 2.4, 2.6, 4.6); ctx.fillRect(-hl - 0.4, hw - 7, 2.6, 4.6); } }
    if (v.type === 'police' && !v.wreck) {
      const ph = v.siren && !arcRef.reducedMotion ? (Math.floor(G.time * 7 + v.id) % 2) : 0;
      ctx.fillStyle = '#23262c'; ctx.fillRect(-3.4, -hw + 2.4, 6.8, T.Wd - 4.8);
      ctx.fillStyle = v.siren ? (ph ? '#ff3a3a' : '#7a1a1a') : '#7a1a1a'; ctx.fillRect(-2.6, -hw + 3, 5.2, (T.Wd - 6) / 2);
      ctx.fillStyle = v.siren ? (ph ? '#27408f' : '#4b8bff') : '#27408f'; ctx.fillRect(-2.6, 0, 5.2, (T.Wd - 6) / 2);
    }
    ctx.restore();
  }

  function drawPedFigure(ctx, p, isPlayer) {
    const run = p.state === 'flee' || p.state === 'dive';
    const sw = Math.sin(isPlayer ? pl.step : p.anim) * (run || (isPlayer && arcRef.input.down('ShiftLeft', 'ShiftRight', 'Space')) ? 3 : 2.1);
    ctx.save(); ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(1.5, 2.2, 5.2, 3.6, 0, 0, TAU); ctx.fill();
    ctx.rotate(p.a);
    if (p.state === 'dive') ctx.rotate(Math.sin(G.time * 30) * 0.5);
    ctx.fillStyle = '#26211c';
    ctx.beginPath(); ctx.ellipse(sw, -1.9, 2.3, 1.5, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(-sw, 1.9, 2.3, 1.5, 0, 0, TAU); ctx.fill();
    const shirt = isPlayer ? '#FF6940' : p.shirt;
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(-sw * 0.8, -4.6, 1.5, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(sw * 0.8, 4.6, 1.5, 0, TAU); ctx.fill();
    ctx.fillStyle = shirt; ctx.beginPath(); ctx.ellipse(0, 0, 3.2, 5, 0, 0, TAU); ctx.fill();
    if (isPlayer) { ctx.fillStyle = '#FFB736'; ctx.fillRect(-1, -4.5, 2, 9); }
    if (!isPlayer && p.bag) { ctx.fillStyle = '#6b4a2e'; ctx.fillRect(-4.6, 3.2, 3.4, 3); }
    if (!isPlayer && p.dupatta) { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-2.5, -4.6, 2.2, 9.2); }
    ctx.fillStyle = p.skin; ctx.beginPath(); ctx.arc(0.6, 0, 2.7, 0, TAU); ctx.fill();
    ctx.fillStyle = isPlayer ? '#2b1d12' : p.hair; ctx.beginPath(); ctx.arc(-0.2, 0, 2.7, PI * 0.45, PI * 1.55); ctx.fill();
    ctx.restore();
  }

  function drawParts(ctx) {
    ctx.save();
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (let i = 0; i < PART.length; i++) {
        const p = PART[i]; if (!p.on) continue;
        const add = p.k === 'spark' || p.k === 'fire'; if ((pass === 1) !== add) continue;
        if (!inView(p.x, p.y, 20)) continue;
        const a = clamp(p.life / p.max, 0, 1);
        if (p.k === 'smoke' || p.k === 'dust') { ctx.globalAlpha = a * 0.9; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1 + (1 - a) * 1.6), 0, TAU); ctx.fill(); }
        else if (p.k === 'spark') { ctx.globalAlpha = a; ctx.fillStyle = p.col; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
        else if (p.k === 'fire') { ctx.globalAlpha = a * 0.8; ctx.fillStyle = a > 0.5 ? 'rgb(255,190,60)' : 'rgb(255,90,30)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + a * 0.7), 0, TAU); ctx.fill(); }
        else if (p.k === 'cash') { ctx.globalAlpha = Math.min(1, a * 1.6); ctx.fillStyle = p.col; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.life * 9); ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); ctx.restore(); }
      }
    }
    ctx.restore();
  }

  function drawObjective(ctx) {
    const j = G.job; if (!j || j.tx == null || G.caught) return;
    const dx = j.tx - pl.x, dy = j.ty - pl.y, d = hyp(dx, dy);
    if (d < 80) return;
    const a = Math.atan2(dy, dx), r = pl.veh ? 54 : 40;
    const x = pl.x + Math.cos(a) * r, y = pl.y + Math.sin(a) * r;
    ctx.save(); ctx.translate(x, y); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.moveTo(15, 1.5); ctx.lineTo(-7, 11); ctx.lineTo(-3, 1.5); ctx.lineTo(-7, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = j.col; ctx.strokeStyle = '#16130e'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, 10); ctx.lineTo(-4, 0); ctx.lineTo(-8, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.font = '700 11px "JetBrains Mono", monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const txt = Math.round(d / 10) + ' m', ty = y + (Math.sin(a) > 0.4 ? 20 : -18);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,8,5,.85)'; ctx.strokeText(txt, x, ty); ctx.fillStyle = '#fff'; ctx.fillText(txt, x, ty);
  }

  function drawSignals(ctx, x0, y0, x1, y1) {
    const i0 = Math.max(0, XC.findIndex((c) => c > x0 - 120)), j0 = Math.max(0, YC.findIndex((c) => c > y0 - 120));
    for (let j = j0; j < NY && YC[j] < y1 + 120; j++) for (let i = i0; i < NX && XC[i] < x1 + 120; i++) {
      const sh = sigState(i, j, 'h'), sv = sigState(i, j, 'v');
      const hx = XR[i].hw + 6, hy = YR[j].hw + 6;
      const pts = [[XC[i] - hx, YC[j] - hy, sh, 'h'], [XC[i] + hx, YC[j] + hy, sh, 'h'], [XC[i] + hx, YC[j] - hy, sv, 'v'], [XC[i] - hx, YC[j] + hy, sv, 'v']];
      for (const p of pts) {
        ctx.fillStyle = '#23262b'; rrect(ctx, p[0] - 3.4, p[1] - 3.4, 6.8, 6.8, 2); ctx.fill();
        ctx.fillStyle = p[2] === 'g' ? '#46e07a' : p[2] === 'y' ? '#ffc241' : '#ff4a3d';
        ctx.beginPath(); ctx.arc(p[0], p[1], 2.2, 0, TAU); ctx.fill();
      }
    }
  }

  function drawWorld(ctx, arc) {
    const w = arc.w, h = arc.h, z = G.zoom;
    let sx = 0, sy = 0;
    if (G.shake > 0.2 && !arc.reducedMotion) { sx = (rr() - 0.5) * G.shake; sy = (rr() - 0.5) * G.shake; }
    const cx = G.camX + sx, cy = G.camY + sy;
    drawTiles(ctx, w, h, cx, cy, z);
    ctx.save();
    ctx.translate(w / 2 - cx * z, h / 2 - cy * z); ctx.scale(z, z);
    const x0 = cx - w / 2 / z, y0 = cy - h / 2 / z, x1 = cx + w / 2 / z, y1 = cy + h / 2 / z;
    drawSkids(ctx, cx, cy, z, w, h);
    drawSignals(ctx, x0, y0, x1, y1);
    drawMarkers(ctx);
    drawPickups(ctx);
    const playing = G.phase === 'play' || G.phase === 'over';
    for (const v of V) if (!v.player && inView(v.x, v.y, 60)) drawVeh(ctx, v);
    for (const p of PD) if (p.x > x0 - 20 && p.x < x1 + 20 && p.y > y0 - 20 && p.y < y1 + 20) drawPedFigure(ctx, p, false);
    if (playing) {
      if (pl.veh) drawVeh(ctx, pl.veh);
      else {
        ctx.strokeStyle = 'rgba(255,183,54,' + (0.35 + 0.2 * Math.sin(G.time * 5)) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(pl.x, pl.y, 10 + Math.sin(G.time * 5) * 1, 0, TAU); ctx.stroke();
        if (pl.inv > 0 && Math.floor(G.time * 14) % 2 === 0) ctx.globalAlpha = 0.5;
        drawPedFigure(ctx, { x: pl.x, y: pl.y, a: pl.a, state: 'walk', anim: 0, skin: '#d9a27a', hair: '#2b1d12' }, true);
        ctx.globalAlpha = 1;
        if (G.nearVeh) { const nv = G.nearVeh; ctx.strokeStyle = 'rgba(255,183,54,.9)'; ctx.setLineDash([5, 5]); ctx.lineWidth = 2; ctx.save(); ctx.translate(nv.x, nv.y); ctx.rotate(nv.a); rrect(ctx, -nv.T.L / 2 - 3, -nv.T.Wd / 2 - 3, nv.T.L + 6, nv.T.Wd + 6, 8); ctx.stroke(); ctx.restore(); ctx.setLineDash([]); }
      }
      drawObjective(ctx);
    }
    drawParts(ctx);
    ctx.font = '700 14px Inter, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const f of G.floaters) {
      const a = clamp(1.4 - f.t, 0, 1);
      ctx.globalAlpha = Math.min(1, a * 1.6); ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,8,5,.9)'; ctx.strokeText(f.text, f.x, f.y); ctx.fillStyle = f.col; ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
    return { cx, cy, z };
  }

  /* ---- night: a dark layer with light cut out of it, then additive glow on top */
  function drawLighting(ctx, arc, cam) {
    const w = arc.w, h = arc.h, z = cam.z, cx = cam.cx, cy = cam.cy, night = nightOf(G.hour), dusk = duskOf(G.hour);
    if (dusk > 0.02) {
      ctx.save(); ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = 'rgba(255,' + Math.round(200 - 40 * dusk) + ',' + Math.round(170 - 30 * dusk) + ',' + (0.55 * dusk * (1 - night * 0.6)) + ')'; ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    if (night < 0.02) return;
    ensureLight(w, h);
    const k = z * 0.5, ox = lw / 2 - cx * k, oy = lh / 2 - cy * k;
    lc.setTransform(1, 0, 0, 1, 0, 0); lc.globalCompositeOperation = 'source-over'; lc.globalAlpha = 1;
    lc.fillStyle = 'rgba(7,10,32,' + (0.8 * night).toFixed(3) + ')'; lc.fillRect(0, 0, lw, lh);
    lc.globalCompositeOperation = 'destination-out';
    const x0 = cx - w / 2 / z - 130, y0 = cy - h / 2 / z - 130, x1 = cx + w / 2 / z + 130, y1 = cy + h / 2 / z + 130;
    const hole = (img, wx, wy, rad, a) => { const s = rad * 2 * k; lc.globalAlpha = a; lc.drawImage(img, wx * k + ox - s / 2, wy * k + oy - s / 2, s, s); };
    const lampsDone = new Set();
    for (let ty = tr[2]; ty <= tr[3]; ty++) for (let tx = tr[0]; tx <= tr[1]; tx++) {
      for (const l of BK[ty * TN + tx].l) { if (lampsDone.has(l) || l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue; lampsDone.add(l); hole(LS_SOFT, l.x + Math.cos(l.a) * 7, l.y + Math.sin(l.a) * 7, 118, 0.9); }
    }
    for (const v of V) {
      if (v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1) continue;
      const on = v.player || (!v.parked && !v.wreck) || v.siren;
      if (v.burnt) continue;
      if (v.wreck && v.wreckT > 1.4) hole(LS_SOFT, v.x, v.y, 95 + Math.sin(G.time * 18) * 6, 0.75);
      if (!on) continue;
      const ca = Math.cos(v.a), sa = Math.sin(v.a), L = v.T.L / 2;
      hole(LS_SOFT, v.x, v.y, 42, 0.7);
      lc.save(); lc.globalAlpha = v.type === 'bike' ? 0.75 : 0.95;
      lc.translate((v.x + ca * L) * k + ox, (v.y + sa * L) * k + oy); lc.rotate(v.a);
      const len = (v.type === 'bike' ? 190 : 250) * k, hh = len / 2;
      lc.drawImage(LS_CONE, 0, -hh * 0.5 * (v.type === 'bike' ? 0.7 : 1), len, hh * (v.type === 'bike' ? 0.7 : 1));
      lc.restore();
      if (v.siren) hole(LS_SOFT, v.x, v.y, 90, 0.5);
    }
    if (G.phase === 'play' && !pl.veh) hole(LS_SOFT, pl.x, pl.y, 78, 0.8);
    for (const o of G.offers) if (!o.hidden && o.cd <= 0) hole(LS_SOFT, o.x, o.y, 78, 0.7);
    for (const s of SAFE) hole(LS_SOFT, s.x, s.y, 56, 0.7);
    if (G.job && G.job.tx != null) hole(LS_SOFT, G.job.tx, G.job.ty, 90, 0.8);
    if (G.job && G.job.cps) for (let q = G.job.cp; q < G.job.cps.length; q++) hole(LS_SOFT, G.job.cps[q].x, G.job.cps[q].y, 70, 0.7);
    for (const p of PART) if (p.on && (p.k === 'fire' || p.k === 'spark') && p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1) hole(LS_SOFT, p.x, p.y, p.k === 'fire' ? 36 : 14, 0.35);
    for (const q of PK) hole(LS_SOFT, q.x, q.y, 36, 0.6);
    lc.globalAlpha = 1; lc.globalCompositeOperation = 'source-over';
    ctx.drawImage(lightCv, 0, 0, lw, lh, 0, 0, w, h);

    // additive glow
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = night * 0.95;
    for (let ty = tr[2]; ty <= tr[3]; ty++) for (let tx = tr[0]; tx <= tr[1]; tx++) {
      const t = tiles[ty * TN + tx]; if (!t) continue;
      const sx0 = Math.round((tx * TILE - cx) * z + w / 2), sy0 = Math.round((ty * TILE - cy) * z + h / 2), sx1 = Math.round(((tx + 1) * TILE - cx) * z + w / 2), sy1 = Math.round(((ty + 1) * TILE - cy) * z + h / 2);
      ctx.drawImage(t.gcv, sx0, sy0, sx1 - sx0 + 1, sy1 - sy0 + 1);
    }
    const S = (wx) => (wx - cx) * z + w / 2, T = (wy) => (wy - cy) * z + h / 2;
    const glow = (img, wx, wy, rad, a) => { const s = rad * 2 * z; ctx.globalAlpha = a; ctx.drawImage(img, S(wx) - s / 2, T(wy) - s / 2, s, s); };
    for (const l of lampsDone) glow(LS_WARM, l.x + Math.cos(l.a) * 7, l.y + Math.sin(l.a) * 7, 82, night * 0.8);
    for (const v of V) {
      if (v.x < x0 || v.x > x1 || v.y < y0 || v.y > y1 || v.burnt) continue;
      const ca = Math.cos(v.a), sa = Math.sin(v.a), L = v.T.L / 2, Wd = v.T.Wd / 2 - 3;
      const on = v.player || (!v.parked && !v.wreck) || v.siren;
      if (on) { glow(LS_SOFT, v.x + ca * (L + 3) - sa * Wd, v.y + sa * (L + 3) + ca * Wd, 12, night * 0.7); if (v.type !== 'bike') glow(LS_SOFT, v.x + ca * (L + 3) + sa * Wd, v.y + sa * (L + 3) - ca * Wd, 12, night * 0.7); }
      if (!v.wreck) { const a = v.brakeL ? 1 : on ? 0.45 : 0; if (a) { glow(LS_RED, v.x - ca * (L + 1) - sa * Wd, v.y - sa * (L + 1) + ca * Wd, 12, a * night); if (v.type !== 'bike') glow(LS_RED, v.x - ca * (L + 1) + sa * Wd, v.y - sa * (L + 1) - ca * Wd, 12, a * night); } }
      if (v.siren) { const ph = arc.reducedMotion ? 0 : Math.floor(G.time * 7 + v.id) % 2; glow(ph ? LS_RED : LS_BLUE, v.x - sa * 5, v.y + ca * 5, 62, 0.95); glow(ph ? LS_BLUE : LS_RED, v.x + sa * 5, v.y - ca * 5, 62, 0.55); }
      if (v.wreck && v.wreckT > 1.4) glow(LS_AMBER, v.x, v.y, 70 + Math.sin(G.time * 17) * 8, 0.8);
    }
    for (const o of G.offers) if (!o.hidden && o.cd <= 0 && inView(o.x, o.y, 90)) glow(glowFor(JT[o.type].col), o.x, o.y, 54, 0.8);
    if (G.job && G.job.tx != null) glow(glowFor(G.job.col), G.job.tx, G.job.ty, 70, 0.9);
    if (G.job && G.job.cps) for (let q = G.job.cp; q < G.job.cps.length; q++) glow(glowFor('#FF5EA8'), G.job.cps[q].x, G.job.cps[q].y, q === G.job.cp ? 66 : 40, 0.8);
    for (const s of SAFE) if (inView(s.x, s.y, 80)) glow(glowFor('#38D6B8'), s.x, s.y, 36, 0.7);
    for (const q of PK) if (inView(q.x, q.y, 40)) glow(LS_GREEN, q.x, q.y, 18, 0.8);
    // signals
    const i0 = Math.max(0, XC.findIndex((c2) => c2 > x0)), j0 = Math.max(0, YC.findIndex((c2) => c2 > y0));
    for (let j = j0; j < NY && YC[j] < y1; j++) for (let i = i0; i < NX && XC[i] < x1; i++) {
      const sh = sigState(i, j, 'h'), sv = sigState(i, j, 'v'), hx = XR[i].hw + 6, hy = YR[j].hw + 6;
      const g = (st) => (st === 'g' ? LS_GREEN : st === 'y' ? LS_AMBER : LS_RED);
      glow(g(sh), XC[i] - hx, YC[j] - hy, 14, 0.9); glow(g(sh), XC[i] + hx, YC[j] + hy, 14, 0.9); glow(g(sv), XC[i] + hx, YC[j] - hy, 14, 0.9); glow(g(sv), XC[i] - hx, YC[j] + hy, 14, 0.9);
    }
    ctx.restore();
  }

  /* ================================================================ HUD */
  const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_UI = 'Inter, -apple-system, sans-serif', F_DISP = 'Fraunces, "Times New Roman", serif';
  function plate(c, x, y, w, h, r, a) {
    c.fillStyle = 'rgba(10,9,7,' + (a == null ? 0.7 : a) + ')'; rrect(c, x, y, w, h, r == null ? 10 : r); c.fill();
    c.strokeStyle = 'rgba(251,245,236,.14)'; c.lineWidth = 1; c.stroke();
  }
  function text(c, s, x, y, font, col, align) { c.font = font; c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle'; c.fillText(s, x, y); }
  function starPath(c, x, y, r) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -PI / 2 + i * PI / 5, rad = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); }
  function wrapLines(c, s, maxW, maxLines) {
    const words = s.split(' '), lines = []; let cur = '';
    for (const wd of words) { const t = cur ? cur + ' ' + wd : wd; if (c.measureText(t).width > maxW && cur) { lines.push(cur); cur = wd; } else cur = t; }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '...'; }
    return lines;
  }
  function bar(c, x, y, w, h, f, col, back) {
    c.fillStyle = back || 'rgba(251,245,236,.12)'; rrect(c, x, y, w, h, h / 2); c.fill();
    if (f > 0.01) { c.fillStyle = col; rrect(c, x, y, Math.max(h, w * clamp(f, 0, 1)), h, h / 2); c.fill(); }
  }

  const blipSpec = () => {
    const out = [];
    for (const o of G.offers) if (!o.hidden && o.cd <= 0) out.push({ x: o.x, y: o.y, col: JT[o.type].col, ch: JT[o.type].letter, r: 6.5 });
    for (const s of SAFE) out.push({ x: s.x, y: s.y, col: '#38D6B8', ch: 'H', r: 5.5 });
    const j = G.job;
    if (j) {
      if (j.cps) { for (let q = j.cp; q < j.cps.length; q++) out.push({ x: j.cps[q].x, y: j.cps[q].y, col: '#FF5EA8', ch: String(q + 1), r: q === j.cp ? 8 : 5.5, pulse: q === j.cp }); }
      else if (j.tx != null) out.push({ x: j.tx, y: j.ty, col: j.col, ch: '*', r: 8, pulse: true });
    }
    return out;
  };

  function drawMinimap(c, cx, cy, R, arc) {
    const Rw = arc.touchMode ? 400 : 440, s = R / Rw;
    if (G.mmA == null) G.mmA = 0;
    if (pl.veh) G.mmA = pl.veh.a; else if (pl.moving) G.mmA += wrapA(pl.a - G.mmA) * 0.2;
    const th = -PI / 2 - G.mmA;
    c.save();
    c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.clip();
    c.fillStyle = '#10141c'; c.fillRect(cx - R, cy - R, R * 2, R * 2);
    c.translate(cx, cy); c.rotate(th);
    c.save(); c.scale(s * MMK, s * MMK); c.drawImage(mmCv, -pl.x / MMK, -pl.y / MMK); c.restore();
    const edge = R - 9;
    // labels drawn upright: handle by drawing each blip's letter after un-rotating
    for (const b of blipSpec()) {
      let dx = (b.x - pl.x) * s, dy = (b.y - pl.y) * s; const d = hyp(dx, dy);
      if (d > edge) { dx *= edge / d; dy *= edge / d; }
      const pu = b.pulse ? 1 + 0.18 * Math.sin(G.time * 6) : 1;
      c.fillStyle = b.col; c.strokeStyle = '#0c0b09'; c.lineWidth = 1.5; c.beginPath(); c.arc(dx, dy, b.r * pu, 0, TAU); c.fill(); c.stroke();
      c.save(); c.translate(dx, dy); c.rotate(-th); c.fillStyle = '#16130e'; c.font = '700 ' + Math.round(b.r * 1.3) + 'px ' + F_MONO; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(b.ch, 0, 0.5); c.restore();
    }
    const flash = !arc.reducedMotion && Math.floor(G.time * 4) % 2;
    for (const v of V) {
      if (!v.police || v.wreck) continue;
      let dx = (v.x - pl.x) * s, dy = (v.y - pl.y) * s; const d = hyp(dx, dy);
      if (d > edge) { if (!(v.ai && v.ai.kind === 'chase')) continue; dx *= edge / d; dy *= edge / d; }
      const chase = v.ai && v.ai.kind === 'chase';
      c.fillStyle = chase ? (flash ? '#ff3a3a' : '#4b8bff') : '#8aa0c8'; c.strokeStyle = '#fff'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(dx, dy, chase ? 4.4 : 3, 0, TAU); c.fill(); if (chase) c.stroke();
    }
    c.restore();
    c.save(); c.translate(cx, cy);
    c.fillStyle = '#FBF5EC'; c.strokeStyle = '#0c0b09'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(0, -8); c.lineTo(6, 6); c.lineTo(0, 3); c.lineTo(-6, 6); c.closePath(); c.fill(); c.stroke();
    // north marker
    const na = -PI / 2 + th, nr = R - 8;
    c.fillStyle = '#FFB736'; c.font = '700 11px ' + F_MONO; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('N', Math.cos(na) * nr, Math.sin(na) * nr);
    c.restore();
    const g = c.createRadialGradient(cx, cy, R * 0.7, cx, cy, R);
    g.addColorStop(0, 'rgba(10,9,7,0)'); g.addColorStop(1, 'rgba(10,9,7,.55)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(10,9,7,.9)'; c.lineWidth = 4; c.beginPath(); c.arc(cx, cy, R + 1, 0, TAU); c.stroke();
    c.strokeStyle = G.copDist < 440 && stars() > 0 && !arc.reducedMotion ? (flash ? '#ff5252' : '#4b8bff') : '#c9a96e'; c.lineWidth = 2; c.beginPath(); c.arc(cx, cy, R, 0, TAU); c.stroke();
  }

  const DLABELS = [['Marine Parade', 640, 1700], ['Bandar Docks', 1300, 4300], ['Qila Quarter', 1900, 960], ['Chowk Bazaar', 2900, 2200], ['Malabar Heights', 4260, 1100], ['Navi Business Park', 4100, 3900], ['Lakshmi Nagar', 1850, 3000]];
  function drawFullMap(c, arc) {
    const w = arc.w, h = arc.h;
    c.fillStyle = 'rgba(6,5,3,.92)'; c.fillRect(0, 0, w, h);
    const top = 56, bottom = 46, size = Math.min(w - 24, h - top - bottom), s = size / W, ox = (w - size) / 2, oy = top + (h - top - bottom - size) / 2;
    c.save(); c.translate(ox, oy);
    c.fillStyle = '#10141c'; c.fillRect(0, 0, size, size);
    c.drawImage(mmCv, 0, 0, size, size);
    c.strokeStyle = 'rgba(201,169,110,.6)'; c.lineWidth = 2; c.strokeRect(0, 0, size, size);
    c.font = '600 ' + (size > 520 ? 12 : 10) + 'px ' + F_MONO; c.textAlign = 'center'; c.textBaseline = 'middle';
    for (const d of DLABELS) { const x = d[1] * s, y = d[2] * s; c.lineWidth = 3; c.strokeStyle = 'rgba(8,7,5,.85)'; c.strokeText(d[0].toUpperCase(), x, y); c.fillStyle = '#FBF5EC'; c.fillText(d[0].toUpperCase(), x, y); }
    for (const b of blipSpec()) {
      const x = b.x * s, y = b.y * s, r = Math.max(5, b.r * 0.95) * (size > 520 ? 1.2 : 1);
      c.fillStyle = b.col; c.strokeStyle = '#0c0b09'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.stroke();
      c.fillStyle = '#16130e'; c.font = '700 ' + Math.round(r * 1.3) + 'px ' + F_MONO; c.fillText(b.ch, x, y + 0.5);
    }
    const flash = Math.floor(G.time * 4) % 2;
    for (const v of V) if (v.police && !v.wreck && v.ai && v.ai.kind === 'chase') { c.fillStyle = flash ? '#ff3a3a' : '#4b8bff'; c.strokeStyle = '#fff'; c.lineWidth = 1.2; c.beginPath(); c.arc(v.x * s, v.y * s, 4.5, 0, TAU); c.fill(); c.stroke(); }
    c.save(); c.translate(pl.x * s, pl.y * s); c.rotate((pl.veh ? pl.veh.a : (G.mmA || 0)) + PI / 2);
    c.fillStyle = '#FBF5EC'; c.strokeStyle = '#0c0b09'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fill(); c.stroke();
    c.restore();
    c.restore();
    text(c, 'CITY MAP', 16, 28, '600 12px ' + F_MONO, '#c9a96e');
    text(c, arc.touchMode ? 'Tap Map to close' : 'Press M to close', w - 16, 28, '600 12px ' + F_MONO, 'rgba(251,245,236,.7)', 'right');
    const leg = [['C', '#FFB736', 'Courier'], ['F', '#38D6B8', 'Fare'], ['R', '#FF5EA8', 'Race'], ['G', '#FF5252', 'Getaway'], ['H', '#38D6B8', 'Safehouse']];
    let lx = Math.max(12, w / 2 - (leg.length * 84) / 2); const ly = h - 22;
    for (const l of leg) { c.fillStyle = l[1]; c.beginPath(); c.arc(lx + 8, ly, 8, 0, TAU); c.fill(); c.fillStyle = '#16130e'; c.font = '700 11px ' + F_MONO; c.textAlign = 'center'; c.fillText(l[0], lx + 8, ly + 0.5); text(c, l[2], lx + 21, ly, '500 12px ' + F_UI, 'rgba(251,245,236,.8)'); lx += 84; }
  }

  function jobCard(c, x, y, w, arc) {
    const j = G.job, t = arc.touchMode;
    const fs = t ? 13 : 14;
    c.font = '600 ' + fs + 'px ' + F_UI;
    let lines, sub = '', fraction = null, rightTxt = '', rewardTxt = '';
    if (j) {
      lines = wrapLines(c, j.label, w - 24, 2);
      if (j.type === 'courier' || j.type === 'fare') { fraction = j.tl / j.tmax; rightTxt = Math.max(0, Math.ceil(j.tl)) + 's'; rewardTxt = money(j.base * jobMult()); }
      else if (j.type === 'race') { const rv = j.rival && j.rival.ai ? j.rival.ai.cp : 0; sub = j.stage === 'count' ? 'Get ready' : 'Checkpoint ' + Math.min(j.cp + 1, j.cps.length) + '/' + j.cps.length + '   Rival ' + rv + '/' + j.cps.length; rewardTxt = money(j.base * jobMult()); }
      else if (j.type === 'getaway') { const need = G.heat < 1 ? 3 : DIFF[G.diff].decay; fraction = clamp(G.unseen / need, 0, 1); sub = G.copDist < 440 ? 'They can see you' : 'Out of sight'; rewardTxt = money(j.base * jobMult()); }
      if (j.type === 'fare') sub = 'Comfort ' + '★'.repeat(Math.max(0, 3 - j.crashes)) + '☆'.repeat(Math.min(3, j.crashes));
      if (j.needCar && j.noCar > 0.5) sub = 'Get back in a car: ' + Math.max(0, Math.ceil(12 - j.noCar)) + 's';
    } else lines = wrapLines(c, 'No job running. Step into a glowing marker.', w - 24, 2);
    const lh = fs + 4, h = 30 + lines.length * lh + (sub ? 16 : 0) + (fraction != null ? 12 : 0) + (j ? 0 : 20);
    plate(c, x, y, w, h, 12, 0.72);
    c.fillStyle = j ? j.col : '#c9a96e'; c.beginPath(); c.arc(x + 14, y + 16, 4.5, 0, TAU); c.fill();
    text(c, j ? j.name.toUpperCase() : 'JOBS', x + 26, y + 16, '600 11px ' + F_MONO, j ? j.col : '#c9a96e');
    if (G.chain > 0) text(c, 'CHAIN x' + jobMult().toFixed(1), x + w - 12, y + 16, '700 11px ' + F_MONO, '#FFB736', 'right');
    else if (j && rewardTxt) text(c, rewardTxt, x + w - 12, y + 16, '700 12px ' + F_MONO, '#7dff9b', 'right');
    let yy = y + 36;
    c.font = '600 ' + fs + 'px ' + F_UI;
    for (const l of lines) { text(c, l, x + 12, yy, '600 ' + fs + 'px ' + F_UI, '#FBF5EC'); yy += lh; }
    if (sub) { text(c, sub, x + 12, yy, '500 12px ' + F_MONO, 'rgba(251,245,236,.78)'); yy += 16; }
    if (fraction != null) {
      const low = j.type !== 'getaway' && fraction < 0.25;
      bar(c, x + 12, yy - 2, w - 24 - (rightTxt ? 40 : 0), 6, fraction, j.type === 'getaway' ? '#38D6B8' : low ? '#FF5252' : j.col);
      if (rightTxt) text(c, rightTxt, x + w - 12, yy + 1, '700 12px ' + F_MONO, low ? '#FF8A8A' : '#FBF5EC', 'right');
    }
    if (!j) {
      const ch = [['C', '#FFB736', 'Courier'], ['F', '#38D6B8', 'Fare'], ['R', '#FF5EA8', 'Race'], ['G', '#FF5252', 'Getaway']];
      let lx = x + 12; const ly = y + h - 14;
      for (const q of ch) { c.fillStyle = q[1]; c.beginPath(); c.arc(lx + 5, ly, 5, 0, TAU); c.fill(); text(c, q[2], lx + 13, ly, '500 10px ' + F_MONO, 'rgba(251,245,236,.7)'); lx += t ? 54 : 62; }
    }
    return h;
  }

  function drawHUD(c, arc) {
    const w = arc.w, h = arc.h, t = arc.touchMode, pad = t ? 10 : 14;
    const st = stars();
    // vignette when wanted
    if (st >= 1 && G.copDist < 500) {
      const a = (arc.reducedMotion ? 0.12 : 0.1 + 0.07 * Math.sin(G.time * 7)) * (0.5 + st * 0.15);
      const g = c.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      const flash = !arc.reducedMotion && Math.floor(G.time * 3.5) % 2;
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, flash ? 'rgba(255,40,40,' + (a * 2) + ')' : 'rgba(60,110,255,' + (a * 2) + ')');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
    }
    // cash / stars / bars
    const cw = t ? 148 : 214, ch = t ? 96 : 120, x = pad, y = pad;
    plate(c, x, y, cw, ch, 12, 0.74);
    text(c, money(G.cash), x + 12, y + (t ? 20 : 25), '500 ' + (t ? 22 : 29) + 'px ' + F_DISP, '#FBF5EC');
    if (!t) text(c, rankOf(G.cash).toUpperCase(), x + 12, y + 47, '600 10.5px ' + F_MONO, '#c9a96e');
    const sr = t ? 7 : 9.5, sy = y + (t ? 42 : 65), gap = t ? 19 : 25;
    const flashS = st >= 1 && G.copDist < 440 && !arc.reducedMotion && Math.floor(G.time * 4) % 2;
    for (let i = 0; i < 5; i++) {
      const sx = x + 18 + i * gap, filled = G.heat >= i + 1, part = clamp(G.heat - i, 0, 1);
      starPath(c, sx, sy, sr); c.fillStyle = 'rgba(251,245,236,.12)'; c.fill();
      if (filled || part > 0.04) {
        c.save(); starPath(c, sx, sy, sr); c.clip();
        c.fillStyle = flashS ? '#ff6a5a' : '#FFB736'; c.fillRect(sx - sr, sy - sr, sr * 2 * (filled ? 1 : part), sr * 2); c.restore();
      }
      starPath(c, sx, sy, sr); c.strokeStyle = filled ? 'rgba(255,183,54,.9)' : 'rgba(251,245,236,.3)'; c.lineWidth = 1; c.stroke();
    }
    const by = y + (t ? 60 : 87);
    text(c, 'HP', x + 12, by + 3, '600 10px ' + F_MONO, 'rgba(251,245,236,.7)');
    bar(c, x + 38, by, cw - 52, t ? 6 : 7, pl.hp / 100, pl.hp < 30 ? '#FF5252' : '#7dff9b');
    const v = pl.veh;
    text(c, 'CAR', x + 12, by + (t ? 15 : 17), '600 10px ' + F_MONO, 'rgba(251,245,236,.7)');
    bar(c, x + 38, by + (t ? 12 : 14), cw - 52, t ? 6 : 7, v ? v.hp / v.maxhp : 0, v && v.hp / v.maxhp < 0.3 ? '#FF5252' : '#FFB736');

    // clock and hustle timer
    if (!t) {
      const tw = G.mode === 'hustle' ? 168 : 138, tx = w / 2 - tw / 2;
      plate(c, tx, pad, tw, 46, 12, 0.7);
      if (G.mode === 'hustle') {
        const m = Math.max(0, G.hustleLeft), mm = Math.floor(m / 60), ss = Math.floor(m % 60);
        text(c, 'HUSTLE', w / 2, pad + 13, '600 10px ' + F_MONO, G.hustleLeft < 30 ? '#FF8A8A' : '#c9a96e', 'center');
        text(c, mm + ':' + (ss < 10 ? '0' : '') + ss, w / 2, pad + 32, '500 22px ' + F_DISP, G.hustleLeft < 30 && Math.floor(G.time * 2) % 2 ? '#FF8A8A' : '#FBF5EC', 'center');
      } else {
        text(c, 'FREE ROAM', w / 2, pad + 13, '600 10px ' + F_MONO, '#c9a96e', 'center');
        text(c, hourText(G.hour), w / 2, pad + 32, '500 20px ' + F_DISP, '#FBF5EC', 'center');
      }
    }
    // minimap
    const R = t ? 56 : 84;
    const mcx = t ? w - pad - R - 2 : w - pad - R - 4, mcy = t ? pad + R + 2 : h - pad - R - 30;
    drawMinimap(c, mcx, mcy, R, arc);
    const dn = G.district ? G.district.name : '';
    c.font = '600 ' + (t ? 10 : 11) + 'px ' + F_MONO;
    const dw = Math.min(R * 2 + 8, c.measureText(dn.toUpperCase()).width + 18);
    plate(c, mcx - dw / 2, mcy + R + 6, dw, 20, 10, 0.72);
    text(c, dn.toUpperCase(), mcx, mcy + R + 16.5, '600 ' + (t ? 9.5 : 10.5) + 'px ' + F_MONO, '#FBF5EC', 'center');
    if (t) {
      // clock lives under the minimap on touch
      let lbl = G.mode === 'hustle' ? (() => { const m = Math.max(0, G.hustleLeft); return Math.floor(m / 60) + ':' + (Math.floor(m % 60) < 10 ? '0' : '') + Math.floor(m % 60); })() : hourText(G.hour);
      const hw2 = G.mode === 'hustle' ? 92 : 80;
      plate(c, mcx - hw2 / 2, mcy + R + 30, hw2, 22, 10, 0.72);
      text(c, G.mode === 'hustle' ? 'TIME ' + lbl : lbl, mcx, mcy + R + 41.5, '600 11px ' + F_MONO, G.mode === 'hustle' && G.hustleLeft < 30 ? '#FF8A8A' : '#FBF5EC', 'center');
    }
    // job card
    if (t) { const jw = Math.max(170, w - pad * 2 - (R * 2 + 14)); jobCard(c, pad, y + ch + 6, jw, arc); }
    else { const jw = 292; jobCard(c, w - pad - jw, pad, jw, arc); }
    // speed / vehicle (desktop)
    if (!t) {
      plate(c, pad, h - pad - 54, 190, 54, 12, 0.7);
      const sp = v ? Math.round(vSpeed(v) * 0.36) : 0;
      text(c, v ? v.T.name.toUpperCase() : 'ON FOOT', pad + 12, h - pad - 38, '600 10px ' + F_MONO, '#c9a96e');
      text(c, v ? String(sp) : (pl.moving ? 'WALKING' : 'STANDING'), pad + 12, h - pad - 18, '500 ' + (v ? 26 : 16) + 'px ' + F_DISP, '#FBF5EC');
      if (v) text(c, 'km/h', pad + 12 + c.measureText(String(sp)).width + 8, h - pad - 14, '600 11px ' + F_MONO, 'rgba(251,245,236,.65)');
    }
    // prompt
    if (G.prompt && !G.mapOpen) {
      c.font = '600 14px ' + F_UI;
      const pw = c.measureText(G.prompt).width + 28, py = t ? h - 200 : h - pad - 30;
      plate(c, w / 2 - pw / 2, py - 18, pw, 36, 18, 0.78);
      text(c, G.prompt, w / 2, py, '600 14px ' + F_UI, '#FFB736', 'center');
    }
    // arrest meter
    if (G.arrest > 0.04) {
      const aw = 180, ax = w / 2 - aw / 2, ay = h * 0.62;
      plate(c, ax - 10, ay - 22, aw + 20, 40, 12, 0.78);
      text(c, 'BEING ARRESTED', w / 2, ay - 9, '700 10px ' + F_MONO, '#FF8A8A', 'center');
      bar(c, ax, ay + 4, aw, 8, G.arrest, '#ff4a4a');
    }
    // banner
    if (G.banner) {
      const b = G.banner, a = b.t < 0.2 ? b.t / 0.2 : b.t > b.max - 0.4 ? clamp((b.max - b.t) / 0.4, 0, 1) : 1;
      c.save(); c.globalAlpha = a;
      const by = t ? Math.min(h * 0.34, 260) : h * 0.27;
      c.font = '500 ' + (t ? 28 : 36) + 'px ' + F_DISP; const tw = c.measureText(b.title).width;
      c.font = '500 ' + (t ? 13 : 15) + 'px ' + F_UI;
      const subLines = b.sub ? wrapLines(c, b.sub, Math.min(w - 40, 520), 2) : [];
      let sw2 = 0; for (const l of subLines) sw2 = Math.max(sw2, c.measureText(l).width);
      const bw = Math.min(w - 20, Math.max(tw, sw2) + 48), bh = 20 + (t ? 34 : 42) + subLines.length * 19;
      plate(c, w / 2 - bw / 2, by - 14, bw, bh, 14, 0.74);
      c.fillStyle = b.col; c.fillRect(w / 2 - bw / 2 + 14, by - 14, 28, 3);
      text(c, b.title, w / 2, by + (t ? 14 : 18), '500 ' + (t ? 28 : 36) + 'px ' + F_DISP, '#FBF5EC', 'center');
      subLines.forEach((l, i) => text(c, l, w / 2, by + (t ? 40 : 50) + i * 19, '500 ' + (t ? 13 : 15) + 'px ' + F_UI, 'rgba(251,245,236,.85)', 'center'));
      c.restore();
    }
    // caught overlay
    if (G.caught) {
      const k = G.caught.t, a = k < 0.5 ? k / 0.5 : k < 2.6 ? 1 : clamp(1 - (k - 2.6) / 0.8, 0, 1);
      c.fillStyle = 'rgba(6,5,3,' + (0.82 * a) + ')'; c.fillRect(0, 0, w, h);
      c.save(); c.globalAlpha = a;
      text(c, G.caught.reason === 'ko' ? 'Knocked out' : 'Busted', w / 2, h / 2 - 16, '500 ' + (t ? 44 : 60) + 'px ' + F_DISP, '#FBF5EC', 'center');
      text(c, (G.caught.lose ? 'You lost ' + money(G.caught.lose) + '. ' : '') + 'Back to the safehouse.', w / 2, h / 2 + 26, '500 16px ' + F_UI, 'rgba(251,245,236,.8)', 'center');
      c.restore();
    }
    if (G.mapOpen) drawFullMap(c, arc);
  }

  /* ================================================================ wiring to the arcade shell */
  function enterAttract() {
    stopHum();
    V.length = 0; PD.length = 0; PK.length = 0; for (const p of PART) p.on = false; SK.n = 0;
    G.phase = 'attract'; G.heat = 0; G.job = null; G.offers = []; G.caught = null; G.mapOpen = false; G.banner = null; G.floaters.length = 0; G.prompt = ''; G.nearVeh = null;
    pl.veh = null; pl.x = -2000; pl.y = -2000; pl.vx = pl.vy = 0;
    G.attractT = 0; G.attX = 900; G.attY = YC[6] - 24; G.camX = 900; G.camY = YC[6] - 24; G.fx = G.camX; G.fy = G.camY; G.zoom = 1.0; G.lookX = G.lookY = 0;
    G.hour = 18.1;
    updateCamera(0.016, false); G.zoom = G.zoom || 1;
    populate();
    G.preload = true;
  }

  const MENU_HTML = '<p>It is dusk in Saffron City. Walk to a car and press F to borrow it, then drive into a glowing marker to take a job: courier runs, taxi fares, street races or a getaway. Crash, carjack or run people off the road and the heat rises, so break the police\'s sight to cool off.</p>' +
    '<p>Free roam has no clock. The ten minute hustle ends when time is up and your score is your cash.</p>';
  function showMenu(arc, extra) {
    arc.menu({
      eyebrow: 'Open-world sandbox', title: 'Saffron <em>City</em>',
      html: (extra || '') + MENU_HTML,
      options: [
        { id: 'mode', label: 'Mode', choices: [{ v: 'free', label: 'Free roam' }, { v: 'hustle', label: 'Ten minute hustle' }] },
        { id: 'diff', label: 'Police heat', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
      ],
    });
  }

  const arc = Arcade.create({
    slug: 'saffron-city', title: 'Saffron City', genre: 'Open-world sandbox',
    keys: [['WASD / arrows', 'Walk or drive'], ['Space', 'Handbrake (sprint on foot)'], ['Shift', 'Sprint on foot'], ['F', 'Get in or out of a car'], ['H', 'Horn'], ['M', 'City map']],
    touch: { stick: true, pads: [{ label: 'Car', key: 'KeyF' }, { label: 'Brake', key: 'Space', big: true, hot: true }, { label: 'Map', key: 'KeyM' }, { label: 'Horn', key: 'KeyH' }] },
    gameKeys: ['KeyF', 'KeyH', 'KeyM', 'ShiftLeft', 'ShiftRight'],
    hint: 'WASD move   F car   Space handbrake   H horn   M map',
    formatScore: (v) => money(v),
    resize(a) { G.vw = a.w / (G.zoom || 1); G.vh = a.h / (G.zoom || 1); },
    init(a) {
      arcRef = a;
      a.debug = () => {
        let police = 0, traffic = 0, chase = 0;
        for (const v of V) { if (v.police) { police++; if (v.ai && v.ai.kind === 'chase') chase++; } else if (v.ai && v.ai.kind === 'traffic') traffic++; }
        const pv = pl.veh;
        return {
          mode: G.mode, phase: G.phase, onFoot: !pv, vehicleType: pv ? pv.type : null, x: Math.round(pl.x), y: Math.round(pl.y),
          speed: Math.round(pv ? vSpeed(pv) : hyp(pl.vx, pl.vy)), cash: Math.round(G.cash), heat: +G.heat.toFixed(2), stars: stars(),
          job: G.job ? G.job.type : null, jobStage: G.job ? (G.job.stage + (G.job.cp != null ? ':' + G.job.cp : '')) : null,
          police, chasing: chase, traffic, peds: PD.length, vehicles: V.length, district: G.district ? G.district.name : null,
          hp: Math.round(pl.hp), carHp: pv ? Math.round(pv.hp) : null, hour: +G.hour.toFixed(2), night: +nightOf(G.hour).toFixed(2),
          chain: G.chain, hustleLeft: Math.round(G.hustleLeft), tiles: tileCount, zoom: +G.zoom.toFixed(2), caught: !!G.caught, arrest: +G.arrest.toFixed(2),
          offers: G.offers.map((o) => ({ t: o.type, x: Math.round(o.x), y: Math.round(o.y), cd: Math.round(o.cd) })), jobs: G.stats.jobs, crashes: G.stats.crashes,
        };
      };
      // helpers for automated tests
      a.cheat = {
        tp(x, y) { pl.x = x; pl.y = y; if (pl.veh) { pl.veh.x = x; pl.veh.y = y; } G.camX = x; G.camY = y; },
        cash(n) { G.cash = n; }, heat(n) { G.heat = n; G.unseen = 0; }, time(h) { G.hour = h; }, hustle(s) { G.hustleLeft = s; },
        car(type) { const v = mkVeh(type || 'hatch', pl.x + 40, pl.y, 0); v.driver = false; v.parked = true; v.c.hb = true; return v; },
        enter() { tryEnter(); }, leave() { leaveCar(false); }, V, PD, G, pl, SAFE,
        job(type) { const o = G.offers.find((q) => q.type === type); if (o) { pl.x = o.x; pl.y = o.y; if (pl.veh) { pl.veh.x = o.x; pl.veh.y = o.y; } startJob(o); } },
        finish() { const j = G.job; if (j && j.tx != null) { pl.x = j.tx; pl.y = j.ty; if (pl.veh) { pl.veh.x = j.tx; pl.veh.y = j.ty; } } },
      };
      enterAttract();
      showMenu(a);
    },
    start(a, ch) {
      G.mode = ch.mode === 'hustle' ? 'hustle' : 'free'; G.diff = DIFF[ch.diff] ? ch.diff : 'normal';
      G.active = true; resetGame();
      a.input.clear();
    },
    onMenu(a) {
      if (G.active) {
        G.active = false;
        let extra = '';
        if (G.mode === 'free' && G.phase === 'play') {
          const cash = Math.round(G.cash);
          a.record(cash);
          extra = '<div class="stat"><div>Banked in free roam<b>' + money(cash) + '</b></div><div>Rank<b style="font-size:17px">' + esc(rankOf(cash)) + '</b></div></div>';
        }
        enterAttract();
        showMenu(a, extra);
      } else if (G.phase !== 'attract') { enterAttract(); }
    },
    onPause() { if (pl.hum) pl.hum.set(30, 0); },
    idle(dt, a) {
      if (a.state === 'menu') { updateWorld(dt, false); updateCamera(dt, false); }
      else if (a.state === 'over') {
        if (pl.veh) { const c = pl.veh.c; c.thr = 0; c.brk = 0.3; c.str = 0; c.hb = true; }
        stopHum(); updateWorld(dt, true); updateCamera(dt, true);
      }
    },
    update(dt, a) { updatePlay(dt); },
    render(ctx, a) {
      const cam = drawWorld(ctx, a);
      drawLighting(ctx, a, cam);
      if (G.phase === 'play' || G.phase === 'over') drawHUD(ctx, a);
      else {
        const g = ctx.createRadialGradient(a.w / 2, a.h / 2, Math.min(a.w, a.h) * 0.35, a.w / 2, a.h / 2, Math.max(a.w, a.h) * 0.8);
        g.addColorStop(0, 'rgba(6,5,3,0)'); g.addColorStop(1, 'rgba(6,5,3,.55)'); ctx.fillStyle = g; ctx.fillRect(0, 0, a.w, a.h);
      }
    },
  });
})();
