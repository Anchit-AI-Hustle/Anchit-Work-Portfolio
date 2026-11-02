/*
 * Midnight Apex: a night street racer on a pseudo-3D road.
 *
 * The road is a ring of short segments with a curve and a height each. Every
 * frame the nearest few hundred are projected to the screen from a chase
 * camera, drawn near to far with a hill clip, and the roadside sprites and cars
 * are drawn back to front on top. Everything on screen (cars, towers, palms,
 * rock walls, signs) is painted on small canvases at start up, no images.
 */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function pad2(n) { return n < 10 ? '0' + n : '' + n; }
  function ease(a, b, p) { return a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5); }
  function easeIn(a, b, p) { return a + (b - a) * p * p; }
  function hash(i) {
    var x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }
  function fmtTime(s) {
    if (s == null || !isFinite(s)) return '-:--.--';
    var cs = Math.max(0, Math.round(s * 100));
    var m = Math.floor(cs / 6000), sec = Math.floor((cs % 6000) / 100), c = cs % 100;
    return m + ':' + pad2(sec) + '.' + pad2(c);
  }
  function ordinal(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }

  /* colour helpers (build time only, never per frame) */
  function hex2rgb(h) {
    h = h.replace('#', ''); if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgb2hex(r, g, b) { return '#' + ((1 << 24) + (clamp(Math.round(r), 0, 255) << 16) + (clamp(Math.round(g), 0, 255) << 8) + clamp(Math.round(b), 0, 255)).toString(16).slice(1); }
  function mix(a, b, t) { var A = hex2rgb(a), B = hex2rgb(b); return rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); }
  function shade(h, f) { return f >= 0 ? mix(h, '#ffffff', f) : mix(h, '#000000', -f); }
  function rgba(h, a) { var c = hex2rgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }

  /* ------------------------------------------------------------ constants */
  var SEG = 200;            // length of one road segment, world units
  var ROAD_W = 2000;        // half width of the road
  var CAM_H = 1000;         // camera height
  var RUMBLE = 3;           // segments per colour stripe
  var BASE_MAX = 12000;     // top speed of a 1.00 car, units per second
  var LAPS = 3;
  var CENT = 0.26;          // how hard bends push the car outward
  var CAR_HALF = 0.19;      // half width of a car in road-half-width units
  var KMH = 280 / BASE_MAX;

  /* -------------------------------------------------------- canvas helpers */
  function makeCanvas(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
  function mips(c) {
    var list = [c], cur = c;
    while (cur.width > 28) {
      var n = makeCanvas(cur.width / 2, cur.height / 2), g = n.getContext('2d');
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(cur, 0, 0, n.width, n.height); list.push(n); cur = n;
    }
    return { m: list, w: c.width, h: c.height };
  }
  function makeSprite(w, h, draw) { var c = makeCanvas(w, h), g = c.getContext('2d'); draw(g, c.width, c.height); return mips(c); }
  function rr(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
    g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h);
    g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath();
  }
  function vgrad(g, y0, y1, stops) { var gr = g.createLinearGradient(0, y0, 0, y1); for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
  function hgrad(g, x0, x1, stops) { var gr = g.createLinearGradient(x0, 0, x1, 0); for (var i = 0; i < stops.length; i += 2) gr.addColorStop(stops[i], stops[i + 1]); return gr; }
  function glow(g, x, y, r, col, a) {
    var gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, rgba(col, a)); gr.addColorStop(0.35, rgba(col, a * 0.35)); gr.addColorStop(1, rgba(col, 0));
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
  }
  function sideShade(g, x0, x1, a) {
    g.fillStyle = hgrad(g, x0, x1, [0, 'rgba(0,0,0,' + a + ')', 0.3, 'rgba(0,0,0,0)', 0.7, 'rgba(0,0,0,0)', 1, 'rgba(0,0,0,' + a + ')']); g.fill();
  }

  /* draw a sprite scaled to destW with an anchor and an optional clip line */
  function blit(ctx, spr, destW, x, y, ax, ay, clipY) {
    if (destW < 1.5) return;
    var destH = destW * spr.h / spr.w;
    var dx = x + destW * ax, dy = y + destH * ay, clipH = 0;
    if (clipY != null) { clipH = dy + destH - clipY; if (clipH >= destH) return; if (clipH < 0) clipH = 0; }
    var m = spr.m, k = 0;
    while (k + 1 < m.length && m[k + 1].width >= destW) k++;
    var img = m[k];
    if (clipH > 0) {
      var f = 1 - clipH / destH;
      ctx.drawImage(img, 0, 0, img.width, img.height * f, dx, dy, destW, destH * f);
    } else ctx.drawImage(img, dx, dy, destW, destH);
  }

  /* ------------------------------------------------------------------ cars */
  // Geometry is drawn on a 240 unit wide grid, ground line at y=148.
  var KINDS = {
    kestrel: { name: 'Kestrel RS', bw: 104, belt: 72, roofY: 30, roofHalf: 62, bumpT: 100, tail: 'bar', ltY: [78, 94], spoiler: 'lip', pipes: [-44, 44], pipeY: 124, pipeR: 8, plate: 'KS-21', ww: 820, top: 1.0, acc: 1.0, grip: 1.0, blurb: 'Balanced, forgiving, quick off the line.' },
    vanta: { name: 'Vanta GT', bw: 110, belt: 94, roofY: 56, roofHalf: 74, bumpT: 106, tail: 'slim', ltY: [96, 104], spoiler: 'none', pipes: [-40, -22, 22, 40], pipeY: 124, pipeR: 6, plate: 'VT-88', ww: 860, top: 1.08, acc: 0.86, grip: 0.88, blurb: 'Fastest on the straights, wide and edgy in corners.' },
    rook: { name: 'Rook Mk2', bw: 98, belt: 68, roofY: 18, roofHalf: 70, bumpT: 102, tail: 'round', ltY: [72, 100], spoiler: 'bigwing', pipes: [52], pipeY: 124, pipeR: 10, plate: 'RK-02', ww: 780, top: 0.94, acc: 1.2, grip: 1.2, blurb: 'Grippy and punchy. Lower top speed, hard to shake.' },
    sedan: { name: 'Sedan', bw: 100, belt: 82, roofY: 46, roofHalf: 64, bumpT: 106, tail: 'box', ltY: [86, 102], spoiler: 'none', pipes: [48], pipeY: 126, pipeR: 6, plate: 'CV-14', ww: 800 },
    hatch: { name: 'Hatch', bw: 92, belt: 74, roofY: 34, roofHalf: 64, bumpT: 104, tail: 'box', ltY: [78, 98], spoiler: 'lip', pipes: [-40], pipeY: 126, pipeR: 6, plate: 'CV-61', ww: 740 },
    van: { name: 'Van', bw: 98, belt: 44, roofY: 6, roofHalf: 94, bumpT: 108, tail: 'tall', ltY: [50, 100], spoiler: 'none', pipes: [50], pipeY: 128, pipeR: 6, plate: 'CV-33', ww: 900, van: true },
    taxi: { name: 'Cab', bw: 100, belt: 82, roofY: 46, roofHalf: 64, bumpT: 106, tail: 'box', ltY: [86, 102], spoiler: 'none', pipes: [48], pipeY: 126, pipeR: 6, plate: 'CAB-9', ww: 800, taxi: true }
  };
  var PLAYER_KINDS = ['kestrel', 'vanta', 'rook'];
  var COLORS = [
    { id: 'ember', name: 'Ember', hex: '#e8452c' },
    { id: 'cobalt', name: 'Cobalt', hex: '#2f6fe0' },
    { id: 'solar', name: 'Solar', hex: '#ffc22e' },
    { id: 'mint', name: 'Mint', hex: '#2fd5a0' },
    { id: 'violet', name: 'Violet', hex: '#8a4bff' },
    { id: 'pearl', name: 'Pearl', hex: '#e9e7e2' }
  ];
  function colorHex(id) { for (var i = 0; i < COLORS.length; i++) if (COLORS[i].id === id) return COLORS[i].hex; return COLORS[0].hex; }
  Object.keys(KINDS).forEach(function (key) {
    var k = KINDS[key];
    var spTop = k.spoiler === 'bigwing' ? k.roofY - 12 : (k.spoiler === 'wing' ? k.belt - 26 : k.roofY);
    k.top0 = Math.max(0, Math.min(k.roofY, spTop) - (k.taxi ? 18 : 8));
  });

  function paintCar(g, k, col, brake) {
    var cx = 120, gy = 148, bw = k.bw, belt = k.belt, rY = k.roofY, rh = k.roofHalf, bt = k.bumpT, bb = 134;
    var hi = shade(col, 0.3), lo = shade(col, -0.5), dk = shade(col, -0.26), s;
    // ground shadow
    g.save(); g.translate(cx, gy + 3); g.scale(1, 0.15);
    var sg = g.createRadialGradient(0, 0, 8, 0, 0, bw + 26);
    sg.addColorStop(0, 'rgba(0,0,0,.75)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sg; g.beginPath(); g.arc(0, 0, bw + 26, 0, TAU); g.fill(); g.restore();
    // tyres
    for (s = -1; s <= 1; s += 2) {
      var tx = cx + s * (bw - 11);
      rr(g, tx - 14, gy - 42, 28, 43, 8); g.fillStyle = '#09090b'; g.fill();
      rr(g, tx - 11, gy - 39, 6, 36, 3); g.fillStyle = 'rgba(255,255,255,.07)'; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.06)'; g.lineWidth = 1;
      for (var q = 0; q < 5; q++) { g.beginPath(); g.moveTo(tx - 12, gy - 36 + q * 8); g.lineTo(tx + 12, gy - 36 + q * 8); g.stroke(); }
    }
    // lower bumper and diffuser
    g.beginPath(); g.moveTo(cx - bw + 5, bt); g.lineTo(cx + bw - 5, bt);
    g.quadraticCurveTo(cx + bw + 2, bt + 5, cx + bw - 3, bt + 18); g.lineTo(cx + bw - 9, bb); g.lineTo(cx - bw + 9, bb);
    g.lineTo(cx - bw + 3, bt + 18); g.quadraticCurveTo(cx - bw - 2, bt + 5, cx - bw + 5, bt); g.closePath();
    g.fillStyle = vgrad(g, bt, bb, [0, hi, 0.35, col, 1, lo]); g.fill(); sideShade(g, cx - bw, cx + bw, 0.4);
    rr(g, cx - bw * 0.64, bb - 22, bw * 1.28, 20, 3); g.fillStyle = '#0a0a0c'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 1.2;
    for (q = -3; q <= 3; q++) { g.beginPath(); g.moveTo(cx + q * bw * 0.17, bb - 21); g.lineTo(cx + q * bw * 0.2, bb - 3); g.stroke(); }
    // deck (the rear panel that carries the lights)
    g.beginPath(); g.moveTo(cx - bw * 0.9, belt); g.lineTo(cx + bw * 0.9, belt); g.lineTo(cx + bw - 3, bt + 3); g.lineTo(cx - bw + 3, bt + 3); g.closePath();
    g.fillStyle = vgrad(g, belt, bt, [0, hi, 0.45, col, 1, dk]); g.fill(); sideShade(g, cx - bw, cx + bw, 0.36);
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - bw * 0.88, belt + 1); g.lineTo(cx + bw * 0.88, belt + 1); g.stroke();
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx - bw + 6, bt + 2); g.lineTo(cx + bw - 6, bt + 2); g.stroke();
    // cabin
    if (k.van) {
      g.beginPath(); g.moveTo(cx - bw * 0.9, belt); g.lineTo(cx - rh, rY + 8); g.quadraticCurveTo(cx - rh, rY, cx - rh + 8, rY);
      g.lineTo(cx + rh - 8, rY); g.quadraticCurveTo(cx + rh, rY, cx + rh, rY + 8); g.lineTo(cx + bw * 0.9, belt); g.closePath();
      g.fillStyle = vgrad(g, rY, belt, [0, hi, 0.5, col, 1, dk]); g.fill(); sideShade(g, cx - rh, cx + rh, 0.34);
      for (s = -1; s <= 1; s += 2) {
        rr(g, s < 0 ? cx - rh + 8 : cx + 5, rY + 7, rh - 13, 30, 4); g.fillStyle = vgrad(g, rY + 7, rY + 37, [0, '#2b3a4c', 1, '#070a10']); g.fill();
      }
      g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx, rY + 2); g.lineTo(cx, belt + 40); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.2)'; rr(g, cx - rh + 10, rY + 1, rh * 2 - 20, 3, 1.5); g.fill();
    } else {
      g.beginPath(); g.moveTo(cx - bw * 0.86, belt + 3); g.lineTo(cx - rh - 5, rY + 12); g.quadraticCurveTo(cx - rh - 1, rY, cx - rh + 14, rY);
      g.lineTo(cx + rh - 14, rY); g.quadraticCurveTo(cx + rh + 1, rY, cx + rh + 5, rY + 12); g.lineTo(cx + bw * 0.86, belt + 3); g.closePath();
      g.fillStyle = vgrad(g, rY, belt, [0, hi, 0.4, col, 1, dk]); g.fill(); sideShade(g, cx - bw, cx + bw, 0.34);
      // rear glass
      g.beginPath(); g.moveTo(cx - bw * 0.86 + 10, belt - 3); g.lineTo(cx - rh + 8, rY + 15); g.lineTo(cx - rh + 17, rY + 9);
      g.lineTo(cx + rh - 17, rY + 9); g.lineTo(cx + rh - 8, rY + 15); g.lineTo(cx + bw * 0.86 - 10, belt - 3); g.closePath();
      g.fillStyle = vgrad(g, rY + 9, belt, [0, '#2a3b50', 0.5, '#0d1520', 1, '#04060a']); g.fill();
      g.save(); g.clip();
      g.fillStyle = 'rgba(190,220,255,.13)'; g.beginPath(); g.moveTo(cx - 70, belt); g.lineTo(cx - 30, belt); g.lineTo(cx + 10, rY); g.lineTo(cx - 30, rY); g.closePath(); g.fill();
      g.fillStyle = 'rgba(190,220,255,.07)'; g.beginPath(); g.moveTo(cx + 10, belt); g.lineTo(cx + 26, belt); g.lineTo(cx + 66, rY); g.lineTo(cx + 50, rY); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 1;
      for (q = 1; q < 4; q++) { var yy = rY + 9 + (belt - rY - 12) * q / 4; g.beginPath(); g.moveTo(cx - bw, yy); g.lineTo(cx + bw, yy); g.stroke(); }
      g.restore();
      g.fillStyle = 'rgba(255,255,255,.22)'; rr(g, cx - rh + 18, rY + 1.5, rh * 2 - 36, 3, 1.5); g.fill();
      if (k.taxi) {
        rr(g, cx - 22, rY - 14, 44, 14, 4); g.fillStyle = '#fff1b0'; g.fill(); g.strokeStyle = '#6a5200'; g.lineWidth = 1.2; g.stroke();
        g.fillStyle = '#5a4400'; g.font = 'bold 9px Inter, sans-serif'; g.textAlign = 'center'; g.fillText('CAB', cx, rY - 4);
        glow(g, cx, rY - 7, 34, '#ffe98a', 0.5);
      }
      // high mounted stop light
      rr(g, cx - 16, belt - 14, 32, 4, 2); g.fillStyle = brake ? '#ff4538' : '#6e0e16'; g.fill();
      if (brake) glow(g, cx, belt - 12, 22, '#ff3a2c', 0.6);
    }
    // spoiler
    if (k.spoiler === 'lip') {
      g.beginPath(); g.moveTo(cx - bw * 0.8, belt + 5); g.lineTo(cx - bw * 0.74, belt - 4); g.lineTo(cx + bw * 0.74, belt - 4); g.lineTo(cx + bw * 0.8, belt + 5); g.closePath();
      g.fillStyle = vgrad(g, belt - 4, belt + 5, [0, hi, 1, dk]); g.fill();
    } else if (k.spoiler === 'bigwing') {
      var wy = rY - 12;
      g.fillStyle = '#16171b';
      for (s = -1; s <= 1; s += 2) { g.fillRect(cx + s * bw * 0.52 - 3, wy + 8, 6, belt - wy - 6); }
      rr(g, cx - bw - 6, wy, (bw + 6) * 2, 11, 3); g.fillStyle = vgrad(g, wy, wy + 11, [0, '#3a3c44', 0.4, '#1b1c21', 1, '#0c0c0f']); g.fill();
      g.fillStyle = col; rr(g, cx - bw - 6, wy + 9, (bw + 6) * 2, 3, 1.5); g.fill();
      for (s = -1; s <= 1; s += 2) { rr(g, cx + s * (bw + 6) - 3, wy - 6, 6, 26, 2); g.fillStyle = dk; g.fill(); }
    }
    // tail lights
    var on = brake ? 1 : 0, lt0 = k.ltY[0], lt1 = k.ltY[1], lensA = brake ? '#ff3b34' : '#a3121f', lensB = brake ? '#ff8a6a' : '#e0263a';
    function cluster(x, y, w, h, r) {
      rr(g, x - 1.5, y - 1.5, w + 3, h + 3, r + 1); g.fillStyle = '#12070a'; g.fill();
      rr(g, x, y, w, h, r); g.fillStyle = vgrad(g, y, y + h, [0, lensB, 1, lensA]); g.fill();
      g.fillStyle = 'rgba(255,255,255,.28)'; rr(g, x + 2, y + 1.5, w - 4, 2, 1); g.fill();
    }
    if (k.tail === 'bar') {
      cluster(cx - bw + 7, lt0, bw * 0.7, lt1 - lt0, 4); cluster(cx + bw - 7 - bw * 0.7, lt0, bw * 0.7, lt1 - lt0, 4);
      rr(g, cx - bw * 0.3, lt0 + 4, bw * 0.6, 5, 2); g.fillStyle = brake ? '#ff5a4a' : '#8d1522'; g.fill();
    } else if (k.tail === 'slim') {
      cluster(cx - bw + 6, lt0, bw * 2 - 12, lt1 - lt0, 3);
      g.fillStyle = '#12070a'; g.fillRect(cx - 2, lt0 - 1, 4, lt1 - lt0 + 2);
    } else if (k.tail === 'round') {
      for (s = -1; s <= 1; s += 2) {
        var rx = cx + s * (bw - 17);
        rr(g, rx - 11, lt0, 22, lt1 - lt0, 8); g.fillStyle = '#12070a'; g.fill();
        for (q = 0; q < 2; q++) {
          var ry = lt0 + 9 + q * 15; g.beginPath(); g.arc(rx, ry, 7, 0, TAU);
          var rg = g.createRadialGradient(rx - 2, ry - 2, 1, rx, ry, 7); rg.addColorStop(0, lensB); rg.addColorStop(1, lensA); g.fillStyle = rg; g.fill();
        }
      }
    } else if (k.tail === 'tall') {
      for (s = -1; s <= 1; s += 2) cluster(s < 0 ? cx - bw + 3 : cx + bw - 15, lt0, 12, lt1 - lt0, 3);
    } else {
      cluster(cx - bw + 6, lt0, bw * 0.46, lt1 - lt0, 3); cluster(cx + bw - 6 - bw * 0.46, lt0, bw * 0.46, lt1 - lt0, 3);
    }
    var gl = brake ? 0.75 : 0.28, gr = brake ? 34 : 20;
    if (k.tail === 'slim') { glow(g, cx - bw * 0.55, (lt0 + lt1) / 2, gr, '#ff2a30', gl); glow(g, cx + bw * 0.55, (lt0 + lt1) / 2, gr, '#ff2a30', gl); glow(g, cx, (lt0 + lt1) / 2, gr, '#ff2a30', gl * 0.8); }
    else { glow(g, cx - bw * 0.6, (lt0 + lt1) / 2, gr, '#ff2a30', gl); glow(g, cx + bw * 0.6, (lt0 + lt1) / 2, gr, '#ff2a30', gl); }
    if (on) { g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = vgrad(g, bt, bb, [0, 'rgba(255,40,30,.28)', 1, 'rgba(255,40,30,0)']); g.fillRect(cx - bw, bt, bw * 2, bb - bt); g.restore(); }
    // plate
    rr(g, cx - 21, bt + 9, 42, 14, 2); g.fillStyle = '#ecebe0'; g.fill(); g.strokeStyle = '#202020'; g.lineWidth = 1; g.stroke();
    g.fillStyle = '#1a1a1a'; g.font = 'bold 9px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.fillText(k.plate, cx, bt + 19.5);
    g.fillStyle = '#fff6c8'; g.fillRect(cx - 28, bt + 14, 3, 3); g.fillRect(cx + 25, bt + 14, 3, 3);
    // exhaust pipes
    for (q = 0; q < k.pipes.length; q++) {
      var px = cx + k.pipes[q], py = k.pipeY, pr = k.pipeR;
      var pg = g.createRadialGradient(px - pr * 0.3, py - pr * 0.3, 1, px, py, pr + 2);
      pg.addColorStop(0, '#f1f3f6'); pg.addColorStop(0.6, '#8d9199'); pg.addColorStop(1, '#41444b');
      g.beginPath(); g.arc(px, py, pr + 1.5, 0, TAU); g.fillStyle = pg; g.fill();
      g.beginPath(); g.arc(px, py, pr - 1.5, 0, TAU); g.fillStyle = '#050507'; g.fill();
      g.beginPath(); g.arc(px, py + 1, pr - 3, 0, Math.PI); g.strokeStyle = 'rgba(80,110,255,.45)'; g.lineWidth = 1.4; g.stroke();
    }
  }

  var carCache = {};
  function carSprite(kind, hex, brake, S) {
    var key = kind + '|' + hex + '|' + (brake ? 1 : 0) + '|' + S;
    var hit = carCache[key]; if (hit) return hit;
    var k = KINDS[kind], top = k.top0, hgt = 156 - top;
    var spr = makeSprite(240 * S, hgt * S, function (g) {
      g.imageSmoothingEnabled = true; g.scale(S, S); g.translate(0, -top); paintCar(g, k, k.taxi ? '#f2b81c' : hex, brake);
    });
    spr.kind = kind; spr.top = top;
    carCache[key] = spr; return spr;
  }
  function dropPlayerSprites() { for (var k in carCache) if (/\|2$/.test(k)) delete carCache[k]; }

  /* --------------------------------------------------- roadside sprites */
  function def(spr, ww, o) { o = o || {}; return { spr: spr, ww: ww, solid: !!o.solid, hw: o.hw || 0, edge: !!o.edge }; }

  function lampSprite(dir, tint) {
    return makeSprite(128, 340, function (g, W, H) {
      var px = 64;
      g.fillStyle = hgrad(g, px - 3, px + 3, [0, '#171a21', 0.5, '#434b5a', 1, '#171a21']); g.fillRect(px - 3, 50, 6, H - 50);
      rr(g, px - 9, H - 15, 18, 15, 3); g.fillStyle = '#20242c'; g.fill();
      g.lineCap = 'round'; g.strokeStyle = '#2c313b'; g.lineWidth = 5; g.beginPath(); g.moveTo(px, 62); g.quadraticCurveTo(px, 26, px + dir * 44, 24); g.stroke();
      g.save(); g.translate(px + dir * 46, 26); rr(g, -17, -5, 34, 12, 5); g.fillStyle = '#14161b'; g.fill();
      rr(g, -13, 3, 26, 4, 2); g.fillStyle = tint; g.fill(); g.restore();
      g.save(); g.globalCompositeOperation = 'lighter';
      g.fillStyle = vgrad(g, 34, 250, [0, rgba(tint, 0.14), 1, rgba(tint, 0)]);
      g.beginPath(); g.moveTo(px + dir * 46 - 10, 34); g.lineTo(px + dir * 46 + 10, 34); g.lineTo(px + dir * 46 + 54, 250); g.lineTo(px + dir * 46 - 54, 250); g.closePath(); g.fill(); g.restore();
      glow(g, px + dir * 46, 34, 62, tint, 0.8);
    });
  }

  function palmSprite() {
    return makeSprite(200, 300, function (g, W, H) {
      var bx = 98, by = H - 3, tx = 120, ty = 98, cxp = 92, cyp = 200;
      function qb(t) { var u = 1 - t; return [u * u * bx + 2 * u * t * cxp + t * t * tx, u * u * by + 2 * u * t * cyp + t * t * ty]; }
      g.lineCap = 'round';
      g.strokeStyle = '#2a2017'; g.lineWidth = 13; g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(cxp, cyp, tx, ty); g.stroke();
      g.strokeStyle = 'rgba(120,98,76,.7)'; g.lineWidth = 3.5; g.beginPath(); g.moveTo(bx + 3, by); g.quadraticCurveTo(cxp + 3, cyp, tx + 2, ty); g.stroke();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1.2;
      for (var t = 0.05; t < 1; t += 0.055) { var p = qb(t); g.beginPath(); g.moveTo(p[0] - 6 + t * 2, p[1]); g.lineTo(p[0] + 6 - t * 2, p[1] + 1); g.stroke(); }
      var rnd = Arcade.rng(7);
      for (var i = 0; i < 10; i++) {
        var a = -Math.PI * 0.98 + i * (Math.PI * 1.0 / 9) + (rnd() - 0.5) * 0.15, L = 74 + rnd() * 20;
        var ex = tx + Math.cos(a) * L, ey = ty + Math.sin(a) * L * 0.55 + L * 0.42 * Math.abs(Math.cos(a)), qx = tx + Math.cos(a) * L * 0.55, qy = ty + Math.sin(a) * L * 0.75 - 12;
        g.strokeStyle = '#17452f'; g.lineWidth = 2.6; g.beginPath(); g.moveTo(tx, ty); g.quadraticCurveTo(qx, qy, ex, ey); g.stroke();
        for (var u = 0.1; u < 1; u += 0.052) {
          var v = 1 - u, px = v * v * tx + 2 * v * u * qx + u * u * ex, py = v * v * ty + 2 * v * u * qy + u * u * ey;
          var dx = 2 * v * (qx - tx) + 2 * u * (ex - qx), dy = 2 * v * (qy - ty) + 2 * u * (ey - qy), dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
          var l = 22 * (1 - u * 0.55);
          for (var sd = -1; sd <= 1; sd += 2) {
            var nx = -dy * sd, ny = dx * sd;
            g.strokeStyle = (sd < 0 ? '#1f6a45' : '#123c29'); g.lineWidth = 1.8;
            g.beginPath(); g.moveTo(px, py); g.lineTo(px + nx * l + dx * 7, py + ny * l + dy * 7 + 3); g.stroke();
            if (ny < -0.3) { g.strokeStyle = 'rgba(120,200,170,.35)'; g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px + nx * l * 0.9 + dx * 6, py + ny * l * 0.9 + dy * 6 + 2); g.stroke(); }
          }
        }
      }
      g.fillStyle = '#2a2016'; [[-5, 6], [4, 9], [-1, 13]].forEach(function (c) { g.beginPath(); g.arc(tx + c[0], ty + c[1], 5, 0, TAU); g.fill(); });
    });
  }

  function craneSprite() {
    return makeSprite(400, 440, function (g, W, H) {
      var steel = '#24364b', hi = '#4f6f92';
      function truss(x0, y0, x1, y1, th, n) {
        g.strokeStyle = steel; g.lineWidth = 3;
        var dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy), nx = -dy / l * th, ny = dx / l * th;
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.moveTo(x0 + nx, y0 + ny); g.lineTo(x1 + nx, y1 + ny); g.stroke();
        g.lineWidth = 1.6; g.beginPath();
        for (var i = 0; i < n; i++) {
          var t0 = i / n, t1 = (i + 1) / n, ax = x0 + dx * t0, ay = y0 + dy * t0, bx = x0 + dx * t1, by = y0 + dy * t1;
          if (i % 2) { g.moveTo(ax, ay); g.lineTo(bx + nx, by + ny); } else { g.moveTo(ax + nx, ay + ny); g.lineTo(bx, by); }
        }
        g.stroke();
        g.strokeStyle = hi; g.lineWidth = 1; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      truss(92, H - 4, 100, 215, 12, 16); truss(176, H - 4, 168, 215, 12, 16);
      truss(70, 205, 200, 205, 14, 10);
      g.fillStyle = steel; g.fillRect(66, 196, 138, 8);
      truss(14, 134, 392, 164, 14, 30);
      truss(140, 60, 14, 134, 5, 8); truss(140, 60, 392, 164, 5, 12);
      g.strokeStyle = steel; g.lineWidth = 3; g.beginPath(); g.moveTo(104, 196); g.lineTo(140, 60); g.lineTo(172, 196); g.stroke();
      rr(g, 56, 168, 44, 26, 3); g.fillStyle = '#b4672f'; g.fill(); rr(g, 62, 174, 30, 12, 2); g.fillStyle = '#ffd98a'; g.fill();
      g.strokeStyle = '#111c28'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(70, 194); g.lineTo(70, 262); g.moveTo(88, 194); g.lineTo(88, 262); g.stroke();
      rr(g, 56, 262, 44, 24, 2); g.fillStyle = '#7a2e26'; g.fill();
      g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; for (var i = 1; i < 6; i++) { g.beginPath(); g.moveTo(56 + i * 7.4, 263); g.lineTo(56 + i * 7.4, 285); g.stroke(); }
      glow(g, 140, 56, 26, '#ff2a2a', 0.9); glow(g, 14, 134, 22, '#fff2cf', 0.7); glow(g, 392, 164, 22, '#fff2cf', 0.7); glow(g, 78, 190, 30, '#ffd98a', 0.5);
      g.fillStyle = '#ff5a4a'; g.beginPath(); g.arc(140, 56, 3, 0, TAU); g.fill();
    });
  }

  function containerSprite(seed) {
    return makeSprite(260, 190, function (g, W, H) {
      var rnd = Arcade.rng(seed), pal = ['#9c3b2e', '#2e6a8c', '#c8932a', '#3e7d5a', '#7d4a8c', '#cfcabd', '#5d6670'];
      for (var row = 0; row < 3; row++) {
        var x = 6 + rnd() * 14, y = H - 6 - (row + 1) * 54, n = 3 - (row === 2 && rnd() < 0.4 ? 1 : 0);
        if (row === 2) x += 30;
        for (var c = 0; c < n && x < W - 60; c++) {
          var col = pal[(rnd() * pal.length) | 0], w = 76;
          g.fillStyle = vgrad(g, y, y + 52, [0, shade(col, 0.15), 1, shade(col, -0.35)]); g.fillRect(x, y, w, 52);
          g.strokeStyle = 'rgba(0,0,0,.28)'; g.lineWidth = 1;
          for (var i = 1; i < 12; i++) { g.beginPath(); g.moveTo(x + i * w / 12, y + 3); g.lineTo(x + i * w / 12, y + 49); g.stroke(); }
          g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(x, y, w, 3);
          g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(x, y + 49, w, 3); g.fillRect(x + w - 3, y, 3, 52);
          x += w + 3;
        }
      }
    });
  }

  function warehouseSprite() {
    return makeSprite(440, 210, function (g, W, H) {
      g.fillStyle = vgrad(g, 70, H, [0, '#2b3646', 1, '#151b26']); g.fillRect(10, 70, 420, H - 70);
      g.beginPath(); g.moveTo(4, 74); g.lineTo(34, 52); g.lineTo(406, 52); g.lineTo(436, 74); g.closePath(); g.fillStyle = '#1b2230'; g.fill();
      g.fillStyle = 'rgba(160,190,230,.25)'; g.fillRect(34, 52, 372, 2);
      g.fillStyle = '#ffd98a'; for (var i = 0; i < 12; i++) g.fillRect(24 + i * 34, 86, 20, 8);
      for (i = 0; i < 3; i++) {
        var x = 36 + i * 130; g.fillStyle = '#0d1219'; g.fillRect(x, 120, 100, 84);
        g.fillStyle = vgrad(g, 120, 204, [0, 'rgba(255,210,140,.55)', 1, 'rgba(255,210,140,.06)']); g.fillRect(x, 120, 100, 84);
        g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 1; for (var j = 1; j < 9; j++) { g.beginPath(); g.moveTo(x, 120 + j * 9.5); g.lineTo(x + 100, 120 + j * 9.5); g.stroke(); }
      }
      glow(g, 20, 70, 40, '#fff0c8', 0.7); glow(g, 420, 70, 40, '#fff0c8', 0.7);
      g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(10, H - 6, 420, 6);
    });
  }

  function gantrySprite() {
    return makeSprite(560, 290, function (g, W, H) {
      var steel = '#303a48';
      for (var s = 0; s < 2; s++) {
        var x = s ? 506 : 24; g.fillStyle = vgrad(g, 0, H, [0, '#4b586b', 1, '#222a36']); g.fillRect(x, 30, 30, H - 30);
        g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 1.2; for (var i = 0; i < 12; i++) { g.beginPath(); g.moveTo(x, 50 + i * 20); g.lineTo(x + 30, 70 + i * 20); g.stroke(); }
      }
      g.fillStyle = steel; g.fillRect(14, 22, 532, 22);
      g.strokeStyle = '#1a212b'; g.lineWidth = 2; g.beginPath(); for (i = 0; i < 26; i++) { g.moveTo(16 + i * 21, 24); g.lineTo(26 + i * 21, 42); g.lineTo(36 + i * 21, 24); } g.stroke();
      rr(g, 62, 56, 436, 98, 8); g.fillStyle = '#0d1020'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#ff6940'; g.stroke();
      for (i = 0; i < 2; i++) for (var j = 0; j < 8; j++) { g.fillStyle = (i + j) % 2 ? '#f4f0e6' : '#14151a'; g.fillRect(72 + j * 12, 66 + i * 12, 12, 12); g.fillRect(392 + j * 12, 66 + i * 12, 12, 12); }
      g.fillStyle = '#fbf5ec'; g.font = 'italic 700 46px Fraunces, "Times New Roman", serif'; g.textAlign = 'center'; g.fillText('MIDNIGHT APEX', 280, 118);
      g.fillStyle = '#ff6940'; g.fillRect(150, 130, 260, 5); g.fillStyle = '#c9a96e'; g.font = '600 13px "JetBrains Mono", monospace'; g.fillText('START  /  FINISH', 280, 148);
      glow(g, 90, 46, 40, '#fff2cf', 0.7); glow(g, 470, 46, 40, '#fff2cf', 0.7); glow(g, 280, 160, 100, '#ff6940', 0.25);
    });
  }

  var SHOP_NAMES = [['NOODLE', 'ORBIT'], ['BLUE', 'LANTERN'], ['KITE & CO', ''], ['PIXEL', 'BAZAAR'], ['MOON', 'TAILOR'], ['TURBO', 'TEA'], ['VELVET', 'ARCADE'], ['HOTEL', 'AURORA']];
  var NEON_COLS = ['#ff3d8b', '#38e1ff', '#ffb52e', '#9b6bff', '#44ffa8', '#ff6940'];

  function towerSprite(seed) {
    return makeSprite(240, 580, function (g, W, H) {
      var rnd = Arcade.rng(seed), neon = NEON_COLS[seed % NEON_COLS.length], neon2 = NEON_COLS[(seed + 2) % NEON_COLS.length];
      var bw = 150 + rnd() * 60, bx = (W - bw) / 2, top = 60 + rnd() * 70;
      g.fillStyle = hgrad(g, bx, bx + bw, [0, '#1b1538', 0.5, '#281d52', 1, '#150f2e']); g.fillRect(bx, top, bw, H - top);
      var cw = bw * (0.45 + rnd() * 0.15), cx0 = bx + (bw - cw) * rnd();
      g.fillStyle = hgrad(g, cx0, cx0 + cw, [0, '#1d173c', 1, '#251b4a']); g.fillRect(cx0, top - 46, cw, 48);
      g.fillStyle = '#a6a0c8'; g.fillRect(cx0 + cw / 2 - 1.5, top - 98, 3, 54); glow(g, cx0 + cw / 2, top - 98, 18, '#ff2a2a', 0.9);
      function windows(x0, y0, w, h) {
        var cols = Math.floor(w / 13), rows = Math.floor(h / 17);
        for (var r = 0; r < rows; r++) {
          var full = rnd() < 0.07;
          for (var c = 0; c < cols; c++) {
            var lit = full || rnd() < 0.36;
            g.fillStyle = lit ? ['#ffd9a0', '#ffe9c8', '#9ad8ff', '#ffb0dc'][(rnd() * 4) | 0] : '#0c0920';
            g.fillRect(x0 + 3 + c * 13, y0 + 4 + r * 17, 8, 11);
          }
        }
      }
      windows(bx + 4, top + 6, bw - 8, H - top - 12); windows(cx0 + 2, top - 44, cw - 4, 44);
      g.fillStyle = 'rgba(0,0,0,.35)'; for (var b = 0; b < 6; b++) g.fillRect(bx, top + 30 + b * 78, bw, 3);
      g.fillStyle = neon; g.fillRect(bx + bw - 6, top + 10, 3, H - top - 20); glow(g, bx + bw - 5, H * 0.6, 120, neon, 0.35);
      g.fillStyle = neon2; g.fillRect(bx + 4, top + 4, bw - 8, 3); glow(g, bx + bw / 2, top + 5, 90, neon2, 0.3);
      g.fillStyle = 'rgba(160,150,230,.35)'; g.fillRect(bx, top, 2, H - top);
    });
  }

  function shopSprite(seed) {
    return makeSprite(380, 240, function (g, W, H) {
      var rnd = Arcade.rng(seed + 90), a = NEON_COLS[seed % NEON_COLS.length], b = NEON_COLS[(seed + 3) % NEON_COLS.length], nm = SHOP_NAMES[seed % SHOP_NAMES.length];
      g.fillStyle = vgrad(g, 40, H, [0, '#241c44', 1, '#130e26']); g.fillRect(8, 40, 364, H - 40);
      g.fillStyle = '#322659'; g.fillRect(2, 34, 376, 10);
      for (var i = 0; i < 7; i++) { g.fillStyle = rnd() < 0.6 ? '#ffd9a0' : '#171030'; g.fillRect(24 + i * 50, 58, 30, 34); }
      rr(g, 24, 100, 332, 26, 4); g.fillStyle = '#0b0818'; g.fill(); g.lineWidth = 2; g.strokeStyle = a; g.shadowColor = a; g.shadowBlur = 10; g.stroke(); g.shadowBlur = 0;
      g.fillStyle = '#fff'; g.font = '800 17px Inter, sans-serif'; g.textAlign = 'center'; g.shadowColor = a; g.shadowBlur = 8;
      g.fillText((nm[0] + ' ' + nm[1]).trim(), W / 2, 119); g.shadowBlur = 0;
      var gx = 24, gw = 332, gy = 132, gh = H - gy - 10;
      g.fillStyle = vgrad(g, gy, gy + gh, [0, 'rgba(255,224,170,.95)', 1, rgba(b, 0.75)]); g.fillRect(gx, gy, gw, gh);
      g.fillStyle = 'rgba(20,10,40,.75)'; for (i = 0; i < 4; i++) { g.fillRect(gx + 30 + i * 80, gy + 12, 8, gh - 12); g.beginPath(); g.arc(gx + 34 + i * 80, gy + 10, 7, 0, TAU); g.fill(); }
      g.fillStyle = '#0c0818'; g.fillRect(gx, gy, 4, gh); g.fillRect(gx + gw - 4, gy, 4, gh); g.fillRect(gx + gw / 2 - 2, gy, 4, gh);
      for (i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#f6ecf6' : a; g.beginPath(); g.moveTo(gx + i * 27.6, gy); g.lineTo(gx + (i + 1) * 27.6, gy); g.lineTo(gx + (i + 1) * 27.6 - 4, gy + 14); g.lineTo(gx + i * 27.6 - 4, gy + 14); g.closePath(); g.fill(); }
      glow(g, W / 2, gy + gh * 0.6, 150, b, 0.45); glow(g, W / 2, 112, 90, a, 0.35);
    });
  }

  function signSprite(seed) {
    return makeSprite(240, 360, function (g, W, H) {
      var a = NEON_COLS[seed % NEON_COLS.length], b = NEON_COLS[(seed + 1) % NEON_COLS.length], nm = SHOP_NAMES[(seed + 3) % SHOP_NAMES.length];
      g.fillStyle = hgrad(g, 114, 126, [0, '#16181f', 0.5, '#4a505e', 1, '#16181f']); g.fillRect(114, 150, 12, H - 150);
      rr(g, 98, H - 16, 44, 16, 3); g.fillStyle = '#22252d'; g.fill();
      rr(g, 16, 18, 208, 138, 12); g.fillStyle = '#090714'; g.fill();
      g.lineWidth = 4; g.strokeStyle = a; g.shadowColor = a; g.shadowBlur = 14; g.stroke();
      rr(g, 26, 28, 188, 118, 8); g.lineWidth = 2; g.strokeStyle = b; g.shadowColor = b; g.shadowBlur = 8; g.stroke(); g.shadowBlur = 0;
      g.textAlign = 'center'; g.fillStyle = '#fff'; g.shadowColor = a; g.shadowBlur = 14;
      var two = !!nm[1];
      g.font = '800 ' + (two ? 38 : 46) + 'px Inter, sans-serif'; g.fillText(nm[0], 120, two ? 78 : 100);
      if (two) { g.shadowColor = b; g.font = '800 38px Inter, sans-serif'; g.fillStyle = '#fff'; g.fillText(nm[1], 120, 122); }
      g.shadowBlur = 0;
      glow(g, 120, 90, 150, a, 0.4);
    });
  }

  function pillarSprite() {
    return makeSprite(130, 430, function (g, W, H) {
      g.fillStyle = hgrad(g, 38, 92, [0, '#4a4955', 0.4, '#77757f', 1, '#35343e']); g.fillRect(38, 30, 54, H - 30);
      rr(g, 2, 0, 126, 38, 4); g.fillStyle = hgrad(g, 2, 128, [0, '#4d4b58', 0.5, '#6e6c78', 1, '#403e4b']); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1.2; for (var y = 52; y < H - 40; y += 34) { g.beginPath(); g.moveTo(38, y); g.lineTo(92, y); g.stroke(); }
      for (var i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#f0c020' : '#17171a'; g.beginPath(); g.moveTo(38 + i * 9, H - 34); g.lineTo(47 + i * 9, H - 34); g.lineTo(38 + i * 9 + 3, H); g.lineTo(38 + i * 9 - 6, H); g.closePath(); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.12)'; g.fillRect(38, 30, 3, H - 30);
      glow(g, 65, 40, 70, '#ff3d8b', 0.15);
    });
  }

  function pineSprite(seed, dark) {
    return makeSprite(210, 400, function (g, W, H) {
      var rnd = Arcade.rng(seed);
      g.fillStyle = '#2a1d14'; g.fillRect(W / 2 - 8, H - 70, 16, 70);
      for (var i = 0; i < 8; i++) {
        var ty = 8 + i * 43, hw = 22 + i * 12.5 + rnd() * 5, th = 86;
        var c0 = dark ? '#071a10' : '#0c2a1b', c1 = dark ? '#0e2a1c' : '#174330';
        g.beginPath(); g.moveTo(W / 2, ty); g.lineTo(W / 2 + hw, ty + th); g.lineTo(W / 2 + hw * 0.4, ty + th - 8); g.lineTo(W / 2 - hw * 0.4, ty + th - 8); g.lineTo(W / 2 - hw, ty + th); g.closePath();
        g.fillStyle = hgrad(g, W / 2 - hw, W / 2 + hw, [0, c0, 0.6, c1, 1, shade(c1, 0.18)]); g.fill();
        g.strokeStyle = 'rgba(120,190,170,.35)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(W / 2 + 1, ty + 1); g.lineTo(W / 2 + hw - 2, ty + th - 2); g.stroke();
      }
    });
  }

  function boulderSprite(seed) {
    return makeSprite(290, 210, function (g, W, H) {
      var rnd = Arcade.rng(seed), pts = [], n = 12, cx = W / 2, cy = H - 70;
      for (var i = 0; i < n; i++) { var a = Math.PI + i * Math.PI * 2 / n, rx = 120 + rnd() * 18, ry = 92 + rnd() * 18; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry * (Math.sin(a) < 0 ? 1 : 0.78)]); }
      g.beginPath(); pts.forEach(function (p, j) { if (j) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); }); g.closePath();
      g.fillStyle = vgrad(g, 20, H, [0, '#6a6c70', 0.5, '#3d3f43', 1, '#202124']); g.fill();
      g.save(); g.clip();
      for (i = 0; i < n; i++) {
        var p0 = pts[i], p1 = pts[(i + 1) % n], up = (p0[0] + p1[0]) / 2 > cx && (p0[1] + p1[1]) / 2 < cy;
        g.fillStyle = up ? 'rgba(255,255,255,.1)' : 'rgba(0,0,0,' + (0.12 + rnd() * 0.12) + ')';
        g.beginPath(); g.moveTo(cx + 14, cy - 26); g.lineTo(p0[0], p0[1]); g.lineTo(p1[0], p1[1]); g.closePath(); g.fill();
      }
      g.fillStyle = 'rgba(40,70,50,.55)'; for (i = 0; i < 4; i++) { g.beginPath(); g.ellipse(cx - 30 + rnd() * 80, cy - 70 + rnd() * 16, 22 + rnd() * 16, 6, 0, 0, TAU); g.fill(); }
      g.restore();
      g.fillStyle = 'rgba(0,0,0,.4)'; g.beginPath(); g.ellipse(cx, H - 6, 130, 9, 0, 0, TAU); g.fill();
    });
  }

  function cliffSprite() {
    return makeSprite(560, 420, function (g, W, H) {
      var rnd = Arcade.rng(21), x;
      g.beginPath(); g.moveTo(0, H); g.lineTo(0, 70);
      for (x = 0; x <= W; x += 28) g.lineTo(x, 40 + rnd() * 70 + Math.sin(x * 0.02) * 20);
      g.lineTo(W, H); g.closePath();
      g.fillStyle = vgrad(g, 30, H, [0, '#4a4b4e', 0.4, '#2e2f32', 1, '#151618']); g.fill();
      g.save(); g.clip();
      for (var i = 0; i < 10; i++) {
        var y = 90 + i * 32; g.strokeStyle = i % 2 ? 'rgba(0,0,0,.28)' : 'rgba(255,255,255,.06)'; g.lineWidth = 2 + rnd() * 2;
        g.beginPath(); g.moveTo(0, y); for (x = 0; x <= W; x += 40) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 8 + (rnd() - 0.5) * 6); g.stroke();
      }
      for (i = 0; i < 16; i++) { var cx = rnd() * W, cy = 80 + rnd() * 200; g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + (rnd() - 0.5) * 20, cy + 40 + rnd() * 60); g.stroke(); }
      g.fillStyle = hgrad(g, 0, W, [0, 'rgba(0,0,0,.35)', 0.55, 'rgba(0,0,0,0)', 1, 'rgba(160,190,220,.12)']); g.fillRect(0, 0, W, H);
      g.fillStyle = '#10261a'; for (i = 0; i < 14; i++) { g.beginPath(); g.ellipse(rnd() * W, H - 8 - rnd() * 40, 26 + rnd() * 20, 14 + rnd() * 10, 0, 0, TAU); g.fill(); }
      g.restore();
    });
  }

  function chevronSprite(dir) {
    return makeSprite(130, 210, function (g, W, H) {
      g.save(); if (dir < 0) { g.translate(W, 0); g.scale(-1, 1); }
      g.fillStyle = hgrad(g, 58, 72, [0, '#6e747d', 0.5, '#b4bac3', 1, '#5c626b']); g.fillRect(58, 100, 14, H - 100);
      rr(g, 8, 12, 114, 96, 7); g.fillStyle = '#f6c11c'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#17171a'; g.stroke();
      g.strokeStyle = '#17171a'; g.lineWidth = 11; g.lineJoin = 'round'; g.lineCap = 'butt';
      for (var i = 0; i < 2; i++) { var x = 34 + i * 40; g.beginPath(); g.moveTo(x, 28); g.lineTo(x + 26, 60); g.lineTo(x, 92); g.stroke(); }
      g.fillStyle = vgrad(g, 12, 108, [0, 'rgba(255,255,255,.28)', 1, 'rgba(255,255,255,0)']); rr(g, 8, 12, 114, 96, 7); g.fill();
      g.restore();
      glow(g, 65, 60, 70, '#ffe08a', 0.18);
    });
  }

  function shrineSprite() {
    return makeSprite(170, 180, function (g, W, H) {
      g.fillStyle = vgrad(g, 130, H, [0, '#5a554e', 1, '#2c2a27']); g.fillRect(14, 138, 142, 42);
      g.fillStyle = '#3d2d25'; g.fillRect(34, 76, 102, 64);
      g.fillStyle = '#6a5446'; g.fillRect(34, 76, 102, 6);
      g.beginPath(); g.moveTo(14, 82); g.quadraticCurveTo(85, 44, 156, 82); g.lineTo(140, 66); g.quadraticCurveTo(85, 20, 30, 66); g.closePath(); g.fillStyle = '#2a1c18'; g.fill();
      rr(g, 62, 92, 46, 48, 20); g.fillStyle = '#ffcf80'; g.fill(); glow(g, 85, 116, 70, '#ffb347', 0.75);
      g.fillStyle = 'rgba(40,20,10,.7)'; g.beginPath(); g.arc(85, 118, 8, 0, TAU); g.fill();
      g.strokeStyle = '#55341f'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(14, 54); g.lineTo(156, 54); g.stroke();
      ['#e8452c', '#ffc22e', '#e8452c', '#ffc22e', '#e8452c', '#ffc22e', '#e8452c'].forEach(function (c, i) { g.fillStyle = c; g.beginPath(); g.moveTo(22 + i * 20, 54); g.lineTo(34 + i * 20, 54); g.lineTo(28 + i * 20, 70); g.closePath(); g.fill(); });
    });
  }

  function bollardSprite() {
    return makeSprite(60, 120, function (g, W, H) {
      g.fillStyle = hgrad(g, 18, 42, [0, '#bfc3c8', 0.5, '#f0f2f4', 1, '#8a8e94']); rr(g, 18, 20, 24, H - 20, 5); g.fill();
      g.fillStyle = '#d63a2e'; g.fillRect(18, 44, 24, 12); g.fillRect(18, 70, 24, 12);
      glow(g, 30, 22, 18, '#ffb347', 0.6);
    });
  }

  /* All sprites a theme uses. Offsets and widths are in world units. */
  function themeSprites(id) {
    var d = {};
    if (id === 'harbour') {
      d.lampL = def(lampSprite(1, '#ffb55a'), 1500); d.lampR = def(lampSprite(-1, '#ffb55a'), 1500);
      d.palm = def(palmSprite(), 1700, { solid: true, hw: 0.08 });
      d.crane = def(craneSprite(), 12000, { edge: true });
      d.cont = def(containerSprite(3), 2700, { solid: true, hw: 0.62 }); d.cont2 = def(containerSprite(11), 2700, { solid: true, hw: 0.62 });
      d.ware = def(warehouseSprite(), 9000, { edge: true });
      d.gantry = def(gantrySprite(), 5400);
      d.bollard = def(bollardSprite(), 420, { solid: true, hw: 0.05 });
    } else if (id === 'neon') {
      d.lampL = def(lampSprite(1, '#bfe9ff'), 1500); d.lampR = def(lampSprite(-1, '#bfe9ff'), 1500);
      d.tower0 = def(towerSprite(1), 9000, { edge: true }); d.tower1 = def(towerSprite(2), 10000, { edge: true }); d.tower2 = def(towerSprite(3), 8200, { edge: true }); d.tower3 = def(towerSprite(4), 9600, { edge: true });
      d.shop0 = def(shopSprite(0), 5200, { edge: true, solid: true }); d.shop1 = def(shopSprite(1), 5200, { edge: true, solid: true }); d.shop2 = def(shopSprite(2), 5200, { edge: true, solid: true });
      d.shop3 = def(shopSprite(3), 5200, { edge: true, solid: true }); d.shop4 = def(shopSprite(4), 5200, { edge: true, solid: true });
      d.sign0 = def(signSprite(0), 2500, { solid: true, hw: 0.07 }); d.sign1 = def(signSprite(1), 2500, { solid: true, hw: 0.07 });
      d.sign2 = def(signSprite(2), 2500, { solid: true, hw: 0.07 }); d.sign3 = def(signSprite(3), 2500, { solid: true, hw: 0.07 });
      d.sign4 = def(signSprite(4), 2500, { solid: true, hw: 0.07 }); d.sign5 = def(signSprite(5), 2500, { solid: true, hw: 0.07 });
      d.pillar = def(pillarSprite(), 1600, { solid: true, hw: 0.2 });
      d.gantry = def(gantrySprite(), 5400);
    } else {
      d.lampL = def(lampSprite(1, '#ffd9a0'), 1400); d.lampR = def(lampSprite(-1, '#ffd9a0'), 1400);
      d.pine0 = def(pineSprite(5, false), 2100, { solid: true, hw: 0.09 }); d.pine1 = def(pineSprite(9, true), 2500, { solid: true, hw: 0.09 }); d.pine2 = def(pineSprite(14, false), 1800, { solid: true, hw: 0.09 });
      d.rock0 = def(boulderSprite(2), 2600, { solid: true, hw: 0.5 }); d.rock1 = def(boulderSprite(6), 2000, { solid: true, hw: 0.4 });
      d.cliff = def(cliffSprite(), 10000, { edge: true, solid: true });
      d.chevRt = def(chevronSprite(1), 1300, { solid: true, hw: 0.06 }); d.chevLt = def(chevronSprite(-1), 1300, { solid: true, hw: 0.06 });
      d.shrine = def(shrineSprite(), 1700, { solid: true, hw: 0.3 });
      d.gantry = def(gantrySprite(), 5400);
    }
    return d;
  }

  /* ------------------------------------------------------- backgrounds */
  var BGW = 1600, BGH = 256;
  function bgCanvas(draw) { var c = makeCanvas(BGW, BGH), g = c.getContext('2d'); draw(g, BGW, BGH); return c; }
  function periodic(seed) {
    var r = Arcade.rng(seed), ph = [], amp = [];
    for (var k = 1; k <= 7; k++) { ph[k] = r() * TAU; amp[k] = 1 / Math.pow(k, 0.9); }
    return function (x) { var s = 0, n = 0; for (var k = 1; k <= 7; k++) { s += Math.sin(TAU * k * x / BGW + ph[k]) * amp[k]; n += amp[k]; } return s / n * 0.5 + 0.5; };
  }
  function ridge(g, f, base, amp, fill) {
    g.beginPath(); g.moveTo(0, BGH);
    for (var x = 0; x <= BGW; x += 8) g.lineTo(x, base - amp * f(x));
    g.lineTo(BGW, BGH); g.closePath(); g.fillStyle = fill; g.fill();
  }
  function fogBand(g, y0, col, a) {
    g.fillStyle = vgrad(g, y0, BGH, [0, rgba(col, 0), 1, rgba(col, a)]); g.fillRect(0, y0, BGW, BGH - y0);
  }

  function bgHarbour() {
    var L0 = bgCanvas(function (g) {
      ridge(g, periodic(3), 190, 90, vgrad(g, 90, BGH, [0, '#0c1c38', 1, '#142c4c']));
      var r = Arcade.rng(5); g.fillStyle = 'rgba(255,214,150,.55)';
      for (var i = 0; i < 120; i++) { var x = r() * BGW; g.fillRect(x, 196 + r() * 40, 1.6, 1.6); }
      fogBand(g, 150, '#2a4f73', 0.55);
    });
    var L1 = bgCanvas(function (g) {
      var r = Arcade.rng(9), x = 10, i;
      g.fillStyle = '#081226';
      while (x < BGW - 220) {
        var t = r();
        if (t < 0.3) { // crane
          var h = 110 + r() * 50, w = 120;
          g.fillRect(x + 30, BGH - h, 4, h); g.fillRect(x + 70, BGH - h, 4, h); g.fillRect(x + 24, BGH - h * 0.55, 56, 4);
          g.fillRect(x - 6, BGH - h - 4, w, 5); g.beginPath(); g.moveTo(x + 50, BGH - h - 30); g.lineTo(x + 30, BGH - h); g.lineTo(x + 70, BGH - h); g.closePath(); g.fill();
          glow(g, x + 50, BGH - h - 30, 12, '#ff3a30', 0.9);
          x += 150;
        } else if (t < 0.65) { // container stacks
          var n = 3 + ((r() * 4) | 0), hh = 18 + ((r() * 2) | 0) * 14;
          for (i = 0; i < n; i++) g.fillRect(x + i * 20, BGH - hh - ((i % 2) * 8), 18, hh + (i % 2) * 8);
          x += n * 20 + 30;
        } else { // sheds and ships
          var w2 = 90 + r() * 80; g.fillRect(x, BGH - 40, w2, 40); g.fillRect(x + 10, BGH - 52, w2 - 20, 12);
          g.fillStyle = 'rgba(255,214,150,.8)'; for (i = 0; i < w2 / 12; i++) g.fillRect(x + 6 + i * 12, BGH - 30, 4, 3);
          g.fillStyle = '#081226'; x += w2 + 24;
        }
      }
      g.fillStyle = 'rgba(255,214,150,.7)'; for (i = 0; i < 70; i++) g.fillRect(r() * BGW, BGH - 6 - r() * 44, 1.5, 1.5);
      fogBand(g, 170, '#2a4f73', 0.4);
    });
    var L2 = bgCanvas(function (g) {
      var r = Arcade.rng(13);
      g.fillStyle = '#050c1b'; g.fillRect(0, 236, BGW, 20);
      for (var x = 20; x < BGW - 20; x += 90 + r() * 80) {
        g.fillRect(x + 2, 214, 2, 26); glow(g, x + 3, 214, 14, '#ffc873', 0.9);
        if (r() < 0.5) { g.beginPath(); g.moveTo(x + 40, 238); g.quadraticCurveTo(x + 44, 214, x + 56, 206); g.strokeStyle = '#050c1b'; g.lineWidth = 3; g.stroke(); }
      }
    });
    return [{ img: L0, speed: 0.1 }, { img: L1, speed: 0.22 }, { img: L2, speed: 0.42 }];
  }

  function bgNeon() {
    function towers(seed, minH, maxH, col, litA, signs) {
      return bgCanvas(function (g) {
        var r = Arcade.rng(seed), x = 0;
        while (x < BGW - 60) {
          var w = 36 + r() * 56, h = minH + r() * (maxH - minH);
          g.fillStyle = vgrad(g, BGH - h, BGH, [0, shade(col, 0.1), 1, col]); g.fillRect(x, BGH - h, w, h);
          g.fillStyle = 'rgba(190,170,255,.18)'; g.fillRect(x, BGH - h, 1.5, h);
          for (var yy = BGH - h + 8; yy < BGH - 6; yy += 9) for (var xx = x + 4; xx < x + w - 5; xx += 7) if (r() < litA) { g.fillStyle = r() < 0.7 ? '#ffd9a0' : '#a6e0ff'; g.fillRect(xx, yy, 3, 4); }
          if (r() < 0.35) { g.fillStyle = '#9a96c0'; g.fillRect(x + w / 2, BGH - h - 18, 1.5, 18); glow(g, x + w / 2, BGH - h - 18, 8, '#ff2a2a', 0.9); }
          if (signs && r() < 0.45) { var c = NEON_COLS[(r() * NEON_COLS.length) | 0]; g.fillStyle = c; g.fillRect(x + 4, BGH - h + 3, w - 8, 3); glow(g, x + w / 2, BGH - h + 5, w, c, 0.35); }
          x += w + 2 + r() * 10;
        }
      });
    }
    var L0 = towers(4, 70, 170, '#241547', 0.1, false);
    var L1 = towers(8, 90, 215, '#2d1a58', 0.2, true);
    var L2 = towers(12, 34, 100, '#150b2a', 0.3, true);
    [L0, L1].forEach(function (c, i) { var g = c.getContext('2d'); fogBand(g, 130, '#6a1b6e', i ? 0.34 : 0.5); });
    return [{ img: L0, speed: 0.08 }, { img: L1, speed: 0.17 }, { img: L2, speed: 0.34 }];
  }

  function bgGhat() {
    var L0 = bgCanvas(function (g) {
      var f = periodic(31); ridge(g, f, 205, 170, vgrad(g, 40, BGH, [0, '#35575f', 1, '#24404a']));
      g.save(); g.globalCompositeOperation = 'source-atop'; g.fillStyle = hgrad(g, 0, BGW, [0, 'rgba(180,220,230,.0)', 0.5, 'rgba(180,220,230,.09)', 1, 'rgba(180,220,230,0)']); g.fillRect(0, 0, BGW, BGH); g.restore();
      fogBand(g, 120, '#506f78', 0.7);
    });
    var L1 = bgCanvas(function (g) {
      var f = periodic(17); ridge(g, f, 218, 140, vgrad(g, 70, BGH, [0, '#1d3a44', 1, '#142b34']));
      var r = Arcade.rng(2); g.fillStyle = '#0c1d24';
      for (var x = 0; x < BGW; x += 7 + r() * 8) { var y = 218 - 140 * f(x); g.beginPath(); g.moveTo(x, y + 4); g.lineTo(x + 5, y - 14 - r() * 12); g.lineTo(x + 10, y + 4); g.closePath(); g.fill(); }
      fogBand(g, 130, '#506f78', 0.62);
    });
    var L2 = bgCanvas(function (g) {
      var f = periodic(23); ridge(g, f, 238, 84, '#0a1c23');
      var r = Arcade.rng(4); g.fillStyle = '#071318';
      for (var x = 0; x < BGW; x += 11 + r() * 12) { var y = 238 - 84 * f(x), h = 20 + r() * 24; g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + 8, y - h); g.lineTo(x + 16, y + 6); g.closePath(); g.fill(); }
      fogBand(g, 170, '#506f78', 0.5);
    });
    return [{ img: L0, speed: 0.05 }, { img: L1, speed: 0.12 }, { img: L2, speed: 0.24 }];
  }

  function moonSprite(tint) {
    return makeSprite(240, 240, function (g) {
      glow(g, 120, 120, 118, tint, 0.55);
      var d = g.createRadialGradient(100, 100, 6, 120, 120, 44); d.addColorStop(0, '#ffffff'); d.addColorStop(0.7, shade(tint, 0.55)); d.addColorStop(1, shade(tint, 0.2));
      g.beginPath(); g.arc(120, 120, 42, 0, TAU); g.fillStyle = d; g.fill();
      g.fillStyle = 'rgba(120,130,150,.22)';
      [[104, 108, 9], [134, 128, 12], [118, 138, 6], [138, 104, 5], [106, 130, 5]].forEach(function (c) { g.beginPath(); g.arc(c[0], c[1], c[2], 0, TAU); g.fill(); });
    });
  }

  /* ------------------------------------------------------------- tracks */
  var PAL = {
    harbour: {
      name: 'Harbour Run', sub: 'Sea-front highway', sky: [0, '#030817', 0.5, '#0a1836', 0.82, '#1b3a63', 1, '#3b6a8c'], fog: '#2c5278', fogA: 0.9,
      ground: [['#0a2947', '#0d3256'], ['#14231c', '#112019'], ['#2a2f37', '#252a31']],
      road: ['#3d424e', '#363a46'], rumble: ['#dde2ec', '#b3322c'], lane: '#ebe7d5', moon: '#cfe3ff', moonAt: [0.3, 0.38, 1], stars: 150, fogH: 0.8,
      horizon: '#1b3a63', sea: true, rail: { panel: '#4b515c', cap: '#9aa2ae', post: '#2d3139', h: 380 }
    },
    neon: {
      name: 'Neon Mile', sub: 'Downtown in the rain', sky: [0, '#06021a', 0.45, '#1c0b3d', 0.8, '#521a64', 1, '#8a2a84'], fog: '#4a1a62', fogA: 0.92,
      ground: [['#2a2440', '#241f39'], ['#201b33', '#1b172c']],
      road: ['#292938', '#232331'], rumble: ['#e8e4f5', '#5b2a7a'], lane: '#f0e9ff', moon: '#d8c4ff', moonAt: [0.74, 0.4, 0.7], stars: 28, fogH: 0.75,
      horizon: '#8a2a84', rain: true
    },
    ghat: {
      name: 'Ghat Pass', sub: 'Mountain switchbacks', sky: [0, '#02060f', 0.5, '#0b1f2c', 0.85, '#2a4a56', 1, '#4f747c'], fog: '#4a6c75', fogA: 0.96,
      ground: [['#142a1b', '#102316'], ['#2f3331', '#282c2a'], ['#3a3a35', '#33332e']],
      road: ['#3a3d41', '#33363a'], rumble: ['#d9d7c8', '#9c3d28'], lane: '#e9e2c4', moon: '#e6f0ff', moonAt: [0.62, 0.34, 1.1], stars: 130, fogH: 1.0,
      horizon: '#4f747c', mist: true, rail: { panel: '#8d969e', cap: '#d6dce0', post: '#2b2f33', h: 300 }
    }
  };
  var TRACK_ORDER = ['harbour', 'neon', 'ghat'];

  // [enter, hold, leave, curve, hill, options]
  var SECTIONS = {
    harbour: [
      [25, 50, 25, 0, 0, { gl: 0, gr: 1 }], [30, 40, 30, 1.6, 8, { gl: 0, gr: 1 }], [20, 60, 20, 0, -8, { gl: 0, gr: 2 }], [30, 50, 30, -2.4, 0, { gl: 0, gr: 2 }],
      [15, 30, 15, 0, 12, { gl: 0, gr: 2 }], [30, 40, 30, 3.2, -12, { gl: 0, gr: 1 }], [20, 40, 20, -3.2, 0, { gl: 1, gr: 1 }], [25, 50, 25, 0, 0, { gl: 1, gr: 1 }],
      [30, 60, 30, 2.0, 0, { gl: 1, gr: 1 }], [20, 30, 20, 0, 18, { gl: 0, gr: 1 }], [25, 50, 25, -3.8, -18, { gl: 0, gr: 1 }], [15, 40, 15, 0, 0, { gl: 0, gr: 2 }],
      [25, 35, 25, 4.2, 0, { gl: 0, gr: 2 }], [25, 35, 25, -4.2, 6, { gl: 0, gr: 1 }], [20, 80, 20, 0, 0, { gl: 0, gr: 1 }], [30, 45, 30, 2.6, -6, { gl: 0, gr: 1 }],
      [20, 60, 20, 0, 10, { gl: 0, gr: 2 }], [30, 50, 30, -2.0, -10, { gl: 0, gr: 2 }], [25, 40, 25, 3.4, 0, { gl: 0, gr: 1 }], [20, 50, 20, 0, 0, { gl: 0, gr: 1 }],
      [30, 50, 30, -3.0, 8, { gl: 0, gr: 1 }], [25, 60, 25, 1.8, -8, { gl: 0, gr: 1 }], [40, 100, 40, 0, 0, { gl: 0, gr: 1 }]
    ],
    neon: [
      [20, 40, 20, 0, 0], [20, 30, 20, 4.2, 0], [15, 30, 15, 0, 0], [20, 30, 20, -4.4, 0],
      [20, 40, 20, 0, 16], [20, 60, 20, 0, 0, { tun: 2 }], [20, 40, 20, 2.4, -16], [15, 25, 15, -4.8, 0], [15, 25, 15, 4.8, 0], [20, 60, 20, 0, 0],
      [25, 40, 25, 3.0, 8], [25, 40, 25, -3.0, -8], [20, 40, 20, -3.4, 0], [20, 40, 20, 3.4, 6], [20, 50, 20, 0, 0], [15, 30, 15, 5.0, 0], [15, 30, 15, 5.0, 0],
      [20, 40, 20, 0, 12], [20, 40, 20, -3.6, -12], [20, 80, 20, 0, 0, { tun: 2 }], [20, 35, 20, 4.0, 0], [20, 35, 20, -4.0, 0], [20, 60, 20, 0, 0], [25, 45, 25, -2.8, -6], [30, 60, 30, 0, 0]
    ],
    ghat: [
      [25, 40, 25, 0, 0, { cliff: -1 }], [25, 40, 25, 2.8, 15, { cliff: -1 }], [20, 40, 20, -3.6, 15, { cliff: 1 }], [20, 35, 20, 4.6, 18, { cliff: -1 }],
      [20, 35, 20, -4.8, 18, { cliff: 1 }], [20, 50, 20, 0, 0, { tun: 1 }], [20, 40, 20, 3.4, 0, { tun: 1 }], [20, 60, 20, 0, 9, { cliff: -1 }],
      [25, 40, 25, -3.2, 9, { cliff: 1 }], [20, 30, 20, 5.0, 6, { cliff: -1 }], [20, 30, 20, -5.0, 6, { cliff: 1 }], [25, 50, 25, 0, -8, { cliff: -1 }],
      [25, 40, 25, 3.8, -21, { cliff: 1 }], [20, 35, 20, -4.6, -21, { cliff: -1 }], [20, 35, 20, 4.6, -18, { cliff: 1 }], [20, 60, 20, 0, -12, { tun: 1 }],
      [20, 40, 20, -3.0, 0, { cliff: 1 }], [20, 30, 20, 5.2, 0, { cliff: -1 }], [20, 30, 20, -5.2, -9, { cliff: 1 }], [25, 60, 25, 2.4, 0, { cliff: -1 }],
      [20, 40, 20, 0, 0, { cliff: 1 }], [25, 40, 25, -3.4, 0, { cliff: -1 }], [25, 50, 25, 0, 0, { cliff: 1 }]
    ]
  };

  var trackCache = {};
  function getTrack(id) {
    if (trackCache[id]) return trackCache[id];
    var P = PAL[id], segs = [], si, tn = 0;
    function lastY() { return segs.length ? segs[segs.length - 1].p2.wy : 0; }
    function pt(wy, wz) { return { wy: wy, wz: wz, cx: 0, cy: 0, cz: 0, sx: 0, sy: 0, sw: 0, ss: 0 }; }
    function add(curve, y, o) {
      var n = segs.length, y0 = lastY();
      segs.push({ i: n, curve: curve, light: ((n / RUMBLE) | 0) % 2, gl: o.gl || 0, gr: o.gr || 0, rail: 0, tun: o.tun || 0, sec: o.sec, cliff: o.cliff || 0, spr: [], cars: [], clip: 0, looped: false, pf: -1, p1: pt(y0, n * SEG), p2: pt(y, (n + 1) * SEG) });
    }
    function road(en, ho, le, curve, y, o) {
      var y0 = lastY(), y1 = y0 + y * SEG, tot = en + ho + le, n;
      for (n = 0; n < en; n++) add(easeIn(0, curve, n / en), ease(y0, y1, n / tot), o);
      for (n = 0; n < ho; n++) add(curve, ease(y0, y1, (en + n) / tot), o);
      for (n = 0; n < le; n++) add(ease(curve, 0, n / le), ease(y0, y1, (en + ho + n) / tot), o);
    }
    var hillK = id === 'ghat' ? 0.8 : 1;
    SECTIONS[id].forEach(function (s, k) {
      var o = s[5] || {}; o = { gl: o.gl, gr: o.gr, tun: o.tun, cliff: o.cliff, sec: k };
      if (id === 'ghat') { o.gl = o.cliff === -1 ? 1 : 0; o.gr = o.cliff === 1 ? 1 : 0; }
      road(s[0], s[1], s[2], s[3], s[4] * hillK, o);
    });
    if (Math.abs(lastY()) > 1) road(30, 20, 30, 0, -lastY() / SEG, { gl: segs[segs.length - 1].gl, gr: segs[segs.length - 1].gr, sec: 99 });
    var N = segs.length;
    for (si = 0; si < N; si++) { segs[si].p1.wy = si ? segs[si - 1].p2.wy : 0; segs[si].h = hash(si * 3 + id.length); segs[si].h7 = hash(((si / 7) | 0) + 500 + id.length); }
    var T = { id: id, pal: P, segs: segs, n: N, L: N * SEG, defs: null, bg: null, stars: [], moon: null, map: null, name: P.name };
    T.defs = themeSprites(id);
    T.bg = id === 'harbour' ? bgHarbour() : id === 'neon' ? bgNeon() : bgGhat();
    T.moon = moonSprite(P.moon);
    var sr = Arcade.rng(77 + id.length);
    for (si = 0; si < P.stars; si++) T.stars.push([sr(), Math.pow(sr(), 1.4), 0.6 + sr() * 1.3, sr() * TAU]);
    decorate(T);
    T.map = buildMap(T);
    trackCache[id] = T; return T;
  }

  function place(seg, key, off, extra) { seg.spr.push({ key: key, off: off, hit: -9 }); }

  function decorate(T) {
    var id = T.id, segs = T.segs, N = T.n, r = Arcade.rng(100 + id.length * 7), i, s;
    for (i = 0; i < N; i++) {
      s = segs[i];
      if (id === 'harbour') {
        if (s.gl === 0) s.rail |= 1;
        if (s.tun === 0) {
          if (i % 10 === 0) place(s, 'lampR', 1.5);
          if (i % 20 === 5) place(s, 'lampL', -1.5);
          if (s.gr === 1) {
            if (r() < 0.2) place(s, 'palm', 1.75 + r() * 1.7);
          } else if (s.gr === 2) {
            if (i % 4 === 0 && r() < 0.7) place(s, r() < 0.5 ? 'cont' : 'cont2', 2.45 + r() * 0.4);
            if (i % 15 === 3) place(s, 'ware', 4.6 + r() * 2, 1);
            if (i % 37 === 11) place(s, 'crane', 8 + r() * 2);
          }
          if (s.gl === 1 && r() < 0.28) place(s, 'palm', -(1.75 + r() * 1.6));
        }
      } else if (id === 'neon') {
        if (i % 9 === 0) place(s, 'lampL', -1.46);
        if (i % 9 === 5) place(s, 'lampR', 1.46);
        var ti, side;
        for (side = -1; side <= 1; side += 2) {
          if (s.tun === 2) { if (i % 6 === 0) place(s, 'pillar', side * 1.3); }
          else {
            if (i % 5 === (side < 0 ? 0 : 2) && r() < 0.85) place(s, 'tower' + ((r() * 4) | 0), side * (2.9 + r() * 5));
            if (i % 8 === (side < 0 ? 3 : 6) && r() < 0.85) place(s, 'shop' + ((r() * 5) | 0), side * (2.05 + r() * 0.2));
          }
        }
        if (i % 23 === 7) place(s, 'sign' + ((r() * 6) | 0), (i % 46 === 7 ? -1 : 1) * 1.66);
      } else {
        if (s.tun !== 1) {
          // outer edge of a bend gets a rail
          if (Math.abs(s.curve) > 2.2) s.rail |= (s.curve > 0 ? 1 : 2);
          for (var sd = -1; sd <= 1; sd += 2) {
            if (r() < 0.4) place(s, 'pine' + ((r() * 3) | 0), sd * (1.5 + r() * 2.6));
            if (i % 3 === 0 && r() < 0.8) place(s, 'pine1', sd * (4.2 + r() * 6));
          }
          if (s.cliff && i % 8 === 0) place(s, 'cliff', s.cliff * 1.38);
          if (r() < 0.035) place(s, r() < 0.5 ? 'rock0' : 'rock1', (r() < 0.5 ? -1 : 1) * (1.62 + r() * 0.4));
          if (Math.abs(s.curve) >= 4.2 && i % 7 === 2) place(s, s.curve > 0 ? 'chevRt' : 'chevLt', (s.curve > 0 ? -1 : 1) * 1.5);
          if (i % 41 === 9 && Math.abs(s.curve) < 1) place(s, 'shrine', (r() < 0.5 ? -1 : 1) * 1.58);
          if (i % 50 === 20 && Math.abs(s.curve) < 2) place(s, 'lampR', 1.5);
        }
      }
    }
    place(segs[2], 'gantry', 0);
    // keep tunnel flags in the segment so the renderer can see them
    for (i = 0; i < N; i++) {
      s = segs[i];
      if (s.tun === 1) { s.rail = 3; }
    }
  }

  function buildMap(T) {
    var x = 0, y = 0, a = 0, pts = [], n = T.n, i;
    for (i = 0; i < n; i++) { a += T.segs[i].curve * 0.0088; x += Math.cos(a); y += Math.sin(a); pts.push([x, y]); }
    var dx = pts[n - 1][0], dy = pts[n - 1][1];
    for (i = 0; i < n; i++) { pts[i][0] -= dx * (i + 1) / n; pts[i][1] -= dy * (i + 1) / n; }
    var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
    pts.forEach(function (p) { minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]); minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); });
    var sc = 1 / Math.max(maxX - minX, maxY - minY, 1), ox = (1 - (maxX - minX) * sc) / 2, oy = (1 - (maxY - minY) * sc) / 2;
    var out = pts.map(function (p) { return [ox + (p[0] - minX) * sc, oy + (p[1] - minY) * sc]; });
    return { pts: out, cache: null, cacheSize: 0 };
  }

  /* ----------------------------------------------------------- particles */
  var NP = 240, PX = new Float32Array(NP), PY = new Float32Array(NP), PVX = new Float32Array(NP), PVY = new Float32Array(NP);
  var PL = new Float32Array(NP), PM = new Float32Array(NP), PS = new Float32Array(NP), PT = new Int8Array(NP), pHead = 0;
  function spawnP(t, x, y, vx, vy, life, size) {
    var i = pHead; pHead = (pHead + 1) % NP;
    PX[i] = x; PY[i] = y; PVX[i] = vx; PVY[i] = vy; PL[i] = life; PM[i] = life; PS[i] = size; PT[i] = t;
  }
  function clearP() { for (var i = 0; i < NP; i++) PL[i] = 0; }
  function updateP(dt) {
    for (var i = 0; i < NP; i++) {
      if (PL[i] <= 0) continue;
      PL[i] -= dt; PX[i] += PVX[i] * dt; PY[i] += PVY[i] * dt;
      if (PT[i] === 0) PVY[i] += 1100 * dt;
      else if (PT[i] === 1) { PVY[i] -= 20 * dt; PS[i] += 40 * dt; }
      else if (PT[i] === 2) { PVY[i] += 500 * dt; }
    }
  }
  function drawP(ctx) {
    var i, a;
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = '#ffc561';
    ctx.beginPath(); var any = false;
    for (i = 0; i < NP; i++) if (PL[i] > 0 && PT[i] === 0) { ctx.moveTo(PX[i], PY[i]); ctx.lineTo(PX[i] - PVX[i] * 0.028, PY[i] - PVY[i] * 0.028); any = true; }
    if (any) ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#b9bdc7';
    for (i = 0; i < NP; i++) if (PL[i] > 0 && PT[i] === 1) { a = PL[i] / PM[i]; ctx.globalAlpha = a * 0.3; ctx.beginPath(); ctx.arc(PX[i], PY[i], PS[i], 0, TAU); ctx.fill(); }
    ctx.fillStyle = '#8a7656';
    for (i = 0; i < NP; i++) if (PL[i] > 0 && PT[i] === 2) { a = PL[i] / PM[i]; ctx.globalAlpha = a * 0.7; ctx.fillRect(PX[i], PY[i], PS[i], PS[i]); }
    ctx.globalAlpha = 1;
  }

  /* -------------------------------------------------------------- world */
  var DIFF = {
    rookie: { base: 0.74, span: 0.10, up: 0.07, down: 0.06, block: 0, slot: 3, name: 'Rookie' },
    pro: { base: 0.84, span: 0.11, up: 0.06, down: 0.04, block: 1, slot: 5, name: 'Pro' },
    legend: { base: 0.91, span: 0.12, up: 0.05, down: 0.02, block: 1, slot: 5, name: 'Legend' }
  };
  var RIVALS = [
    { name: 'Nyx', skill: 0.95, kind: 'vanta', pref: -0.22 }, { name: 'Saffron', skill: 0.8, kind: 'kestrel', pref: 0.3 },
    { name: 'Jett', skill: 0.65, kind: 'rook', pref: -0.08 }, { name: 'Mara', skill: 0.5, kind: 'kestrel', pref: 0.18 }, { name: 'Dax', skill: 0.35, kind: 'rook', pref: 0.34 }
  ];
  var RIVAL_HEX = ['#e8452c', '#2f6fe0', '#ffc22e', '#2fd5a0', '#8a4bff', '#e9e7e2', '#ff7ab8', '#22a6b3'];
  var CIV_HEX = ['#7d8591', '#b9bcc4', '#2f3a4a', '#8a2f2f', '#3f5a49', '#d8d2c4', '#4c3f5a', '#a8692e'];
  var CIV_KINDS = ['sedan', 'hatch', 'van', 'taxi', 'sedan', 'hatch'];
  var LANE_X = [-0.75, -0.25, 0.25, 0.75], LANE_V = [4900, 3700, 3300, 4300];
  var TRAFFIC = { harbour: 26, neon: 40, ghat: 0 };

  var PLAN = { tx: 0, vcap: 1, slow: 1e9, avoid: 0 };
  var racerId = 0;

  function wrapD(a, L) { return mod(a + L / 2, L) - L / 2; }

  function mkRacer(o) {
    var k = KINDS[o.kind];
    return {
      id: ++racerId, name: o.name, kind: o.kind, k: k, hex: o.hex, isPlayer: !!o.isPlayer, isTraffic: !!o.isTraffic,
      dist: o.dist || 0, x: o.x || 0, vx: 0, speed: o.speed || 0, vmax: o.vmax || BASE_MAX * (k.top || 1), skill: o.skill || 0.5, pref: o.pref || 0, rb: 1,
      finished: false, finT: 0, lapIdx: Math.floor((o.dist || 0) / 1e9), lapT0: 0, lapTimes: [], bestLap: Infinity, seg: null, z: 0, brake: false, ghost: false, nmT: -9, block: 0
    };
  }
  function placeCar(T, c) {
    var z = mod(c.dist, T.L), seg = T.segs[(z / SEG) | 0];
    if (c.seg !== seg) {
      if (c.seg) { var a = c.seg.cars, ix = a.indexOf(c); if (ix >= 0) a.splice(ix, 1); }
      seg.cars.push(c); c.seg = seg;
    }
    c.z = z;
  }
  function gridSlot(slot) { return { dist: -(Math.floor(slot / 2) * 700 + 450), x: slot % 2 ? 0.36 : -0.36 }; }

  function newWorld(cfg) {
    var T = getTrack(cfg.track), i, j, segs = T.segs;
    for (i = 0; i < T.n; i++) { var s = segs[i]; s.cars.length = 0; for (j = 0; j < s.spr.length; j++) s.spr[j].hit = -9; }
    clearP();
    var W = {
      T: T, cfg: cfg, attract: !!cfg.attract, mode: cfg.mode || 'race', diff: DIFF[cfg.diff] || DIFF.pro, phase: cfg.attract ? 'racing' : 'countdown',
      cd: 0, t: 0, racers: [], rivals: [], traffic: [], obst: [], order: [], P: null, shake: 0, fov: 98, bgX: 0, endT: 0, bannerT: 0, banner: '', flash: 0,
      pcx: 0, pcy: 0, pcw: 100, frame: 0, rbT: 0, lastBeep: -1, sq: 0, scr: 0, nitroSnd: 0, popT: 0, bounce: 0, tAcc: 0, results: null, over: false, slipT: 0, lapBannerT: 0, lapBanner: '', goT: 0, sparksT: 0
    };
    var hex = colorHex(cfg.color), P = mkRacer({ name: 'You', kind: cfg.car, hex: hex, isPlayer: true });
    P.nitro = 35; P.nitroOn = false; P.steerIn = 0; P.rpm = 0.2; P.gear = 1; P.xCam = 0; P.drift = 0; P.cleanT = 0; P.draft = 0; P.hitCd = 0; P.lean = 0; P.thr = 0; P.bestNm = 0;
    P.lapT0 = 0; P.started = false; P.flameT = 0; P.wasOff = false; P.crashes = 0; P.nearMisses = 0;
    W.P = P; W.racers.push(P);
    var attract = W.attract, withRivals = attract || W.mode === 'race';
    if (withRivals) {
      var pool = RIVAL_HEX.filter(function (h) { return h !== hex; }), slot = 0, pslot = W.diff.slot;
      RIVALS.forEach(function (rv, idx) {
        if (slot === pslot) slot++;
        var g = gridSlot(slot++), vf = W.diff.base + W.diff.span * rv.skill;
        var r = mkRacer({ name: rv.name, kind: rv.kind, hex: pool[idx % pool.length], skill: rv.skill, pref: rv.pref, dist: g.dist, x: g.x, vmax: BASE_MAX * KINDS[rv.kind].top * vf });
        r.block = W.diff.block && rv.skill > 0.6 ? 1 : 0;
        W.racers.push(r); W.rivals.push(r);
      });
      var pg = gridSlot(pslot); P.dist = pg.dist; P.x = pg.x;
    } else { P.dist = -500; P.x = 0; }
    var tc = Math.round((TRAFFIC[cfg.track] || 0) * (W.mode === 'time' && !attract ? 0.4 : 1));
    var perLane = [0, 0, 0, 0], r2 = Arcade.rng(1234 + cfg.track.length * 17);
    for (i = 0; i < tc; i++) perLane[i % 4]++;
    var tIdx = 0;
    for (var ln = 0; ln < 4; ln++) {
      for (j = 0; j < perLane[ln]; j++) {
        var zz = (j + 0.5 + (r2() - 0.5) * 0.5) * T.L / perLane[ln];
        if (zz > T.L - 3600) zz = T.L - 3600 - r2() * 1500;
        if (zz < 1400) zz += 3600;
        var kind = CIV_KINDS[(r2() * CIV_KINDS.length) | 0];
        var tr = mkRacer({ name: 'civ', kind: kind, hex: CIV_HEX[(r2() * CIV_HEX.length) | 0], isTraffic: true, dist: zz, x: LANE_X[ln], speed: LANE_V[ln], vmax: LANE_V[ln] });
        tr.id = 5000 + (tIdx++); W.traffic.push(tr);
      }
    }
    if (attract) {
      P.dist = 2600; P.x = 0.1; P.speed = 6500; P.nitro = 0; P.started = true;
      W.rivals.forEach(function (r, idx) { r.dist = P.dist + (idx - 2) * 1500 + 900; r.speed = 7000; r.x = [-0.4, 0.4, 0, -0.2, 0.3][idx]; });
      W.traffic.forEach(function (c) { var dd = wrapD(c.dist - P.dist, T.L); if (Math.abs(dd) < 2500) c.dist += 6000; });
    }
    W.racers.forEach(function (c) { c.lapIdx = Math.floor(c.dist / T.L); });
    W.traffic.forEach(function (c) { placeCar(T, c); });
    W.racers.forEach(function (c) { if (!c.isPlayer) placeCar(T, c); });
    W.obst = W.rivals.concat(W.traffic, [P]);
    W.order = W.racers.slice();
    return W;
  }

  /* ---------------------------------------------------------------- AI */
  function aiPlan(W, c) {
    var T = W.T, segs = T.segs, N = T.n, L = T.L, si = (mod(c.dist, L) / SEG) | 0, k, sum = 0, cm = 0, cv;
    for (k = 1; k <= 24; k += 2) { cv = segs[(si + k) % N].curve; sum += cv; if (k <= 17) { var ac = Math.abs(cv); if (ac > cm) cm = ac; } }
    var lineX = clamp(sum / 12 * 0.3, -0.6, 0.6);
    var tx = lineX * (0.55 + 0.45 * c.skill) + c.pref * (1 - Math.abs(lineX) * 1.2);
    var vcap = 1 - clamp((cm - 2.9) * 0.07 * (1.3 - c.skill * 0.45), 0, 0.3);
    var avoid = 0, slow = 1e9, P = W.P, blocking = false, j, o;
    if (!c.isPlayer && c.block && !W.attract && !P.ghost && P.started) {
      var bz = wrapD(c.dist - P.dist, L);
      if (bz > 260 && bz < 2800 && P.speed > c.speed - 900 && Math.sin(W.t * 0.35 + c.id * 1.9) > 0.15) { blocking = true; tx = clamp(P.x, -0.72, 0.72); }
    }
    for (j = 0; j < W.obst.length; j++) {
      o = W.obst[j];
      if (o === c || o.ghost || (blocking && o === P)) continue;
      var dz = wrapD(o.dist - c.dist, L);
      if (dz <= 60 || dz > 3600) continue;
      var dx = o.x - c.x, adx = Math.abs(dx);
      if (adx < 0.5) {
        var str = 1 - dz / 3600, dir = dx > 0 ? -1 : 1;
        if (adx < 0.04) dir = c.x > 0 ? -1 : 1;
        if (c.x + dir * 0.5 > 0.86 || c.x + dir * 0.5 < -0.86) dir = -dir;
        avoid += dir * str * (1.5 + 0.5 * c.skill);
        if (dz < 1100 && adx < 0.33 && o.speed < c.speed + 600) slow = Math.min(slow, o.speed * 0.98);
      }
    }
    PLAN.tx = tx; PLAN.vcap = vcap; PLAN.slow = slow; PLAN.avoid = avoid;
  }

  function updateRival(W, c, dt) {
    aiPlan(W, c);
    var tgt = Math.min(c.vmax * c.rb * PLAN.vcap, PLAN.slow);
    if (c.finished) tgt = Math.min(tgt, BASE_MAX * 0.5);
    if (c.speed < tgt) c.speed = Math.min(tgt, c.speed + BASE_MAX * 0.3 * (1.05 - 0.75 * c.speed / BASE_MAX) * c.k.acc * dt);
    else c.speed = Math.max(tgt, c.speed - BASE_MAX * 0.6 * dt);
    c.brake = c.speed > tgt + 250;
    var want = clamp((PLAN.tx - c.x) * 1.7 + PLAN.avoid, -1.1, 1.1);
    c.vx += (want - c.vx) * Math.min(1, dt * 5);
    c.x = clamp(c.x + c.vx * dt, -0.9, 0.9);
    c.dist += c.speed * dt;
  }

  function advanceAI(W, dt, rivalsOn) {
    var T = W.T, i, c;
    W.t += rivalsOn ? dt : 0;
    for (i = 0; i < W.traffic.length; i++) { c = W.traffic[i]; c.dist += c.speed * dt; placeCar(T, c); }
    if (!rivalsOn) return;
    W.rbT -= dt;
    var P = W.P;
    for (i = 0; i < W.rivals.length; i++) {
      c = W.rivals[i];
      if (W.rbT <= 0 && !W.attract) {
        var gap = P.dist - c.dist, d = W.diff;
        c.rb = 1 + (gap > 0 ? Math.min(gap / 9000, 1) * d.up : Math.max(gap / 9000, -1) * d.down);
        if (P.ghost) c.rb = 1;
      }
      updateRival(W, c, dt); placeCar(T, c);
      if (!c.finished && !W.attract && c.dist >= LAPS * T.L) { c.finished = true; c.finT = W.t - (c.dist - LAPS * T.L) / Math.max(c.speed, 500); }
    }
    if (W.rbT <= 0) W.rbT = 0.3;
  }

  /* ------------------------------------------------------------- sound */
  var SND = { e1: null, e2: null };
  function engineStop() { if (SND.e1) { SND.e1.stop(); SND.e2.stop(); } SND.e1 = SND.e2 = null; }
  function engineStart() { engineStop(); SND.e1 = ARC.sfx.hum('sawtooth'); SND.e2 = ARC.sfx.hum('square'); }
  function engineSet(rpm, thr, boost) {
    if (!SND.e1) return;
    var f = 44 + rpm * 175 + (boost ? 24 : 0);
    SND.e1.set(f, 0.05 + 0.07 * thr + 0.035 * rpm); SND.e2.set(f * 0.5, 0.035 + 0.04 * thr);
  }
  function beep(freq, dur, vol) { ARC.sfx.tone(freq, dur, { type: 'square', vol: vol || 0.16 }); }

  /* -------------------------------------------------------- the player */
  function gearOf(speed, top) {
    var sp = speed / top, gsz = 1 / 6, g = Math.min(5, Math.floor(sp / gsz)), inG = Math.min(1.05, (sp - g * gsz) / gsz);
    return { g: g + 1, rpm: g === 0 ? 0.24 + 0.74 * inG : 0.44 + 0.55 * inG };
  }

  function sparksAt(W, side, n, power) {
    for (var i = 0; i < n; i++) {
      var a = (Math.random() * 1.6 - 0.8) + (side < 0 ? Math.PI : 0) + (Math.random() < 0.5 ? -0.5 : 0.5);
      spawnP(0, W.pcx + side * W.pcw * 0.42, W.pcy - W.pcw * 0.1, Math.cos(a) * (140 + Math.random() * 360) * power, -Math.abs(Math.sin(a)) * (120 + Math.random() * 300) * power, 0.35 + Math.random() * 0.4, 2);
    }
  }
  function crashFx(W, strength, side) {
    var P = W.P;
    if (W.attract) { P.hitCd = 0.35; return; }
    P.cleanT = 0; P.hitCd = 0.35; P.crashes++;
    if (!ARC.reducedMotion) W.shake = Math.max(W.shake, 6 + strength * 12);
    sparksAt(W, side || (Math.random() < 0.5 ? -1 : 1), Math.round(8 + strength * 22), 0.8 + strength * 0.7);
    ARC.sfx.noise(0.3, { freq: 560, vol: 0.14 + 0.3 * strength });
    ARC.sfx.tone(120, 0.24, { type: 'sawtooth', slide: 42, vol: 0.12 + 0.14 * strength });
  }
  function addNitro(W, n) { W.P.nitro = Math.min(100, W.P.nitro + n); }

  function updatePlayer(W, dt) {
    var P = W.P, T = W.T, K = P.k, segs = T.segs, L = T.L, inp = ARC.input, i, o;
    var racing = W.phase === 'racing', fin = W.phase === 'finished', cd = W.phase === 'countdown';
    var auto = W.attract || fin || P.bot, live = !W.attract && !fin, quiet = W.attract;
    var top = BASE_MAX * K.top, steer = 0, gas = false, brake = false, nit = false;
    var z = mod(P.dist, L), si = (z / SEG) | 0, seg = segs[si];
    if (auto) {
      aiPlan(W, P);
      var vt = fin ? 0 : Math.min(top * (P.bot ? 0.97 : 0.82) * PLAN.vcap, PLAN.slow);
      if (P.bot && !fin) nit = P.nitro > 30 && PLAN.vcap > 0.97 && PLAN.slow > 1e8;
      steer = clamp((PLAN.tx - P.x) * 2.2 + PLAN.avoid * 0.9 - P.vx * 0.3, -1, 1);
      if (fin) steer = clamp(-P.x * 1.4 - P.vx * 0.3, -1, 1);
      gas = !fin && P.speed < vt; brake = !fin && P.speed > vt * 1.06;
    } else {
      var kx = (inp.down('ArrowRight', 'KeyD') ? 1 : 0) - (inp.down('ArrowLeft', 'KeyA') ? 1 : 0), sx = kx;
      if (inp.stick.active) { sx = clamp(inp.stick.x * 1.35, -1, 1); if (Math.abs(sx) < 0.07) sx = 0; }
      brake = inp.down('ArrowDown', 'KeyS');
      gas = inp.down('ArrowUp', 'KeyW') || (W.cfg.auto === 'on' && !brake);
      nit = inp.down('ShiftLeft', 'ShiftRight', 'KeyN');
      P.steerIn += (sx - P.steerIn) * Math.min(1, dt * (Math.abs(sx) > 0.01 ? 11 : 15));
      steer = P.steerIn;
    }
    P.thr += ((gas ? 1 : 0) - P.thr) * Math.min(1, dt * 8);
    var spPct = clamp(P.speed / (BASE_MAX * 0.95), 0, 1.5);
    // nitro
    if (live && racing && nit && P.nitro > 0 && P.speed > 1800) {
      if (!P.nitroOn) {
        P.nitroOn = true;
        ARC.sfx.noise(0.8, { filter: 'highpass', freq: 900, vol: 0.28 });
        ARC.sfx.tone(260, 0.6, { type: 'sawtooth', slide: 1100, vol: 0.1 });
      }
    } else P.nitroOn = false;
    if (P.nitroOn) {
      P.nitro = Math.max(0, P.nitro - 28 * dt);
      if (P.nitro <= 0) P.nitroOn = false;
      W.nitroSnd -= dt; if (W.nitroSnd <= 0) { W.nitroSnd = 0.11; ARC.sfx.noise(0.12, { filter: 'bandpass', freq: 1800, vol: 0.07 }); }
    }
    // drafting and near misses
    var drafting = false;
    if (racing && live) {
      for (i = 0; i < W.obst.length; i++) {
        o = W.obst[i]; if (o === P || o.ghost) continue;
        var dz = wrapD(o.dist - P.dist, L), adz = Math.abs(dz), adx = Math.abs(o.x - P.x);
        if (dz > 160 && dz < 2300 && adx < 0.26 && o.speed > BASE_MAX * 0.33 && P.speed > BASE_MAX * 0.45) drafting = true;
        if (adz < 460 && adx > 0.34 && adx < 0.47 && P.speed > o.speed + 1300 && W.t - o.nmT > 2 && P.hitCd <= 0) {
          o.nmT = W.t; P.nearMisses++; addNitro(W, 13);
          ARC.toast('Near miss', '+ nitro', 700);
          ARC.sfx.noise(0.18, { filter: 'highpass', freq: 1400, vol: 0.2 });
        }
      }
    }
    P.draft += ((drafting ? 1 : 0) - P.draft) * Math.min(1, dt * 4);
    if (drafting) addNitro(W, 9 * dt);
    if (racing && live && P.cleanT > 2.2 && spPct > 0.55) addNitro(W, 2.4 * dt);
    // speed
    var offroad = Math.abs(P.x) > 1.12 && !(seg.rail & (P.x < 0 ? 1 : 2));
    if (cd) { P.speed = 0; }
    else {
      var a = 0, topCap = top * (P.nitroOn ? 1.34 : 1) * (1 + 0.045 * P.draft);
      if (fin) { a = -BASE_MAX * 0.3; }
      else if (brake) a = -BASE_MAX * (0.85 + 0.2 * K.grip);
      else if (gas) a = BASE_MAX * 0.26 * K.acc * clamp(1.05 - 0.8 * (P.speed / top), 0.05, 1.1) * (spPct < 0.12 ? 0.75 + spPct * 2 : 1);
      else a = -BASE_MAX * (0.07 + 0.1 * spPct);
      if (P.nitroOn) a += BASE_MAX * 0.6;
      P.speed += a * dt;
      if (P.speed > topCap) P.speed -= (P.speed - topCap) * Math.min(1, dt * 2.6);
      if (offroad && P.speed > top * 0.3) P.speed -= BASE_MAX * 0.55 * dt;
      if (P.speed < 0) P.speed = 0;
    }
    P.brake = brake || (fin && P.speed > 500);
    // steering and bends
    var auth = Math.min(1, spPct * 5) * (1.05 - 0.3 * Math.min(1, spPct));
    var maxLat = 2.1 * K.grip * auth;
    P.vx += (steer * maxLat - P.vx) * (1 - Math.exp(-dt * 8 * K.grip));
    var push = 2 * CENT * seg.curve * spPct * spPct / Math.pow(K.grip, 0.75);
    if (cd) push = 0;
    P.x += (P.vx - push) * dt;
    var slide = Math.abs(push) / (maxLat + 0.5) + (brake && spPct > 0.6 ? 0.35 * Math.abs(steer) : 0) + (Math.abs(steer) > 0.75 && spPct > 0.8 ? 0.2 : 0);
    P.drift += ((spPct > 0.5 && slide > 0.5 ? clamp(slide, 0, 1) : 0) - P.drift) * Math.min(1, dt * 7);
    if (P.drift > 0.5 && spPct > 0.5 && !offroad) {
      W.sq -= dt;
      if (W.sq <= 0) { W.sq = 0.085; if (!quiet) ARC.sfx.noise(0.1, { filter: 'bandpass', freq: 2300 + Math.random() * 500, vol: 0.05 + 0.09 * P.drift }); }
      if (!ARC.reducedMotion && Math.random() < 0.5) spawnP(1, W.pcx + (Math.random() < 0.5 ? -1 : 1) * W.pcw * 0.4, W.pcy - 3, (Math.random() - 0.5) * 40, -10 - Math.random() * 25, 0.7, 4 + Math.random() * 5);
    }
    if (P.drift > 0.5) P.cleanT = Math.min(P.cleanT, 1.2);
    // walls and the edge of the world
    var lim = 1.11;
    if ((seg.rail & 1) && P.x < -lim) { P.x = -lim; P.vx = Math.max(P.vx, 0); wallScrape(W, -1, dt); }
    else if ((seg.rail & 2) && P.x > lim) { P.x = lim; P.vx = Math.min(P.vx, 0); wallScrape(W, 1, dt); }
    if (P.x < -2.75 || P.x > 2.75) { var sd = P.x < 0 ? -1 : 1; P.x = sd * 2.75; P.vx = 0; P.speed *= 0.8; if (P.hitCd <= 0) crashFx(W, 0.5, sd); }
    // gravel
    if (offroad && P.speed > 2000) {
      P.cleanT = 0;
      if (!ARC.reducedMotion) { W.shake = Math.max(W.shake, 2.5 + 3 * spPct); }
      W.scr -= dt; if (W.scr <= 0) { W.scr = 0.1; if (!quiet) ARC.sfx.noise(0.12, { freq: 380, vol: 0.12 }); }
      if (Math.random() < 0.7) spawnP(2, W.pcx + (Math.random() - 0.5) * W.pcw, W.pcy - 2, (Math.random() - 0.5) * 160, -120 - Math.random() * 160, 0.5, 2 + Math.random() * 3);
    }
    // advance
    var before = P.dist;
    P.dist += P.speed * dt;
    P.hitCd -= dt;
    if (!cd && P.speed > 1500 && !offroad && !P.nitroOn) P.cleanT += dt;
    // roadside objects
    var sj, sp, dd, hit;
    for (sj = 0; sj < 2; sj++) {
      var sg = segs[(si + sj) % T.n];
      for (i = 0; i < sg.spr.length; i++) {
        sp = sg.spr[i]; dd = T.defs[sp.key];
        if (!dd.solid || W.t - sp.hit < 0.7) continue;
        if (Math.abs(wrapD(sg.i * SEG - mod(P.dist, L), L)) > 230) continue;
        if (dd.edge) hit = sp.off < 0 ? P.x < sp.off + CAR_HALF : P.x > sp.off - CAR_HALF;
        else hit = Math.abs(P.x - sp.off) < dd.hw + CAR_HALF;
        if (hit) {
          sp.hit = W.t;
          if (dd.edge) P.x = sp.off + (sp.off < 0 ? 1 : -1) * (CAR_HALF + 0.03);
          else P.x = sp.off + (P.x >= sp.off ? 1 : -1) * (dd.hw + CAR_HALF + 0.03);
          var st = clamp(P.speed / BASE_MAX, 0.15, 1.1);
          P.speed = Math.min(P.speed * 0.4, BASE_MAX * 0.28); P.vx = 0; P.nitroOn = false;
          crashFx(W, st, P.x > 0 ? 1 : -1);
        }
      }
    }
    // other cars
    if (!cd) {
      for (i = 0; i < W.obst.length; i++) {
        o = W.obst[i]; if (o === P || o.ghost) continue;
        var dz2 = wrapD(o.dist - P.dist, L);
        if (Math.abs(dz2) > 330) continue;
        var dx2 = P.x - o.x, adx2 = Math.abs(dx2);
        if (adx2 >= 0.34) continue;
        var rel = Math.abs(P.speed - o.speed), stt = clamp(rel / 8000, 0.1, 1);
        if (dz2 > 70 && P.speed >= o.speed - 300) {
          P.dist = o.dist - 335; P.speed = Math.max(o.speed * 0.9, P.speed * 0.5);
          if (!o.isTraffic) o.speed = Math.min(o.speed * 1.0 + 300, o.vmax * 1.05);
        } else if (dz2 < -70) {
          o.speed = Math.max(0, o.speed * 0.92); P.speed = Math.min(P.speed * 1.02 + 200, top * 1.2);
        } else {
          P.speed *= 0.97;
        }
        var dir = dx2 >= 0 ? 1 : -1; if (adx2 < 0.02) dir = P.x > 0 ? -1 : 1;
        var ov = 0.34 - adx2;
        P.x += dir * ov * 0.6; P.vx = dir * 0.9;
        if (!o.isTraffic) { o.x = clamp(o.x - dir * ov * 0.5, -0.9, 0.9); o.vx = -dir * 0.9; }
        if (P.hitCd <= 0) { P.nitroOn = false; crashFx(W, stt, dir); }
      }
    }
    // camera follows the car a little late, so the car slides on screen
    P.xCam += (P.x - P.xCam) * Math.min(1, dt * 6.5);
    P.lean += (clamp(P.vx * 0.045 - push * 0.03, -0.14, 0.14) - P.lean) * Math.min(1, dt * 8);
    // engine
    var gr = gearOf(P.speed, top * (P.nitroOn ? 1.2 : 1));
    var rpmT = P.speed > 80 ? gr.rpm : 0.2 + 0.55 * P.thr;
    if (cd) rpmT = 0.2 + 0.6 * P.thr;
    P.rpm += (rpmT - P.rpm) * Math.min(1, dt * (rpmT < P.rpm ? 7 : 11));
    if (gr.g !== P.gear) {
      if (P.speed > 800 && !cd && !quiet) { ARC.sfx.tone(150, 0.07, { type: 'square', vol: 0.05 }); if (gr.g > P.gear && P.thr < 0.4 && Math.random() < 0.5) ARC.sfx.noise(0.06, { freq: 700, vol: 0.12 }); }
      P.gear = gr.g;
    }
    engineSet(P.rpm, P.thr, P.nitroOn);
    // field of view and background drift
    var fovT = 98 + (ARC.reducedMotion ? 0 : spPct * 6 + (P.nitroOn ? 14 : 0));
    W.fov += (fovT - W.fov) * Math.min(1, dt * 3.5);
    W.bgX += seg.curve * spPct * dt * 0.9;
    return before;
  }

  function wallScrape(W, side, dt) {
    var P = W.P;
    P.speed = Math.max(0, P.speed - BASE_MAX * 0.55 * dt); P.cleanT = 0;
    W.sparksT -= dt;
    if (W.sparksT <= 0 && P.speed > 1200) { W.sparksT = 0.05; sparksAt(W, side, 3, 0.8); W.scr -= 0; }
    W.scr -= dt;
    if (W.scr <= 0) { W.scr = 0.12; if (!W.attract) ARC.sfx.noise(0.14, { filter: 'bandpass', freq: 1700, vol: 0.14 }); }
    if (!ARC.reducedMotion) W.shake = Math.max(W.shake, 3);
  }

  /* ----------------------------------------------- laps, order, finish */
  function sortOrder(W) {
    var a = W.order, i, j, t;
    function key(c) { return c.finished ? 1e9 - c.finT * 1000 : c.dist; }
    for (i = 1; i < a.length; i++) { t = a[i]; var kt = key(t); for (j = i - 1; j >= 0 && key(a[j]) < kt; j--) a[j + 1] = a[j]; a[j + 1] = t; }
  }
  function positionOf(W, c) { return W.order.indexOf(c) + 1; }

  function updateLaps(W, dt, before) {
    var P = W.P, L = W.T.L;
    if (W.attract || P.finished) return;
    var lap = Math.floor(P.dist / L);
    if (lap > P.lapIdx) {
      var over = (P.dist - lap * L) / Math.max(P.speed, 500), tNow = W.t - over;
      P.lapIdx = lap;
      if (lap === 0) { P.lapT0 = tNow; P.started = true; }
      else {
        var lt = tNow - P.lapT0; P.lapT0 = tNow; P.lapTimes.push(lt);
        var prevBest = P.bestLap, stored = bestOf(W.cfg.track).lap;
        if (lt < P.bestLap) P.bestLap = lt;
        var msg = fmtTime(lt), sub = lap < LAPS ? 'Lap ' + lap + ' done' : 'Final lap';
        if (lt <= prevBest) sub += ' - best lap';
        if (stored != null) msg += '  (' + (lt <= stored ? '-' : '+') + Math.abs(lt - stored).toFixed(2) + ')';
        if (lap < LAPS) { ARC.toast(msg, sub, 2000); ARC.sfx.tone(660, 0.12, { type: 'triangle', vol: 0.2 }); ARC.sfx.tone(990, 0.16, { type: 'triangle', vol: 0.2, delay: 0.12 }); }
        if (lap >= LAPS) finishPlayer(W, tNow);
      }
    }
  }

  function finishPlayer(W, tNow) {
    var P = W.P;
    P.finished = true; P.finT = tNow; W.phase = 'finished'; W.endT = 0; P.nitroOn = false;
    sortOrder(W);
    var pos = positionOf(W, P);
    W.banner = W.mode === 'race' ? ordinal(pos) : 'FINISH'; W.bannerT = 3.2;
    ARC.toast(W.mode === 'race' ? 'You finished ' + ordinal(pos) : 'Time ' + fmtTime(tNow), 'Chequered flag', 2600);
    [523, 659, 784, 1046].forEach(function (f, i) { ARC.sfx.tone(f, 0.22, { type: 'triangle', vol: 0.2, delay: i * 0.11 }); });
  }

  function bestOf(track) { return BESTS[track] || (BESTS[track] = { total: null, lap: null }); }

  /* ------------------------------------------------------- main step */
  function stepWorld(W, dt) {
    var P = W.P;
    if (W.phase === 'countdown') {
      W.cd += dt;
      var step = W.cd < 0.6 ? -1 : W.cd < 1.4 ? 0 : W.cd < 2.2 ? 1 : W.cd < 3.0 ? 2 : 3;
      if (step !== W.lastBeep) {
        W.lastBeep = step;
        if (step >= 0 && step < 3) beep(520, 0.16, 0.18);
        if (step === 3) { beep(1040, 0.5, 0.2); ARC.toast('GO!', '', 900); W.phase = 'racing'; W.t = 0; W.goT = 0.9; }
      }
      advanceAI(W, dt, false);
      updatePlayer(W, dt);
      if (W.phase === 'racing') { /* first racing frame handled next tick */ }
    } else {
      advanceAI(W, dt, true);
      var before = updatePlayer(W, dt);
      if (!W.attract) updateLaps(W, dt, before);
      if (W.phase === 'finished') {
        W.endT += dt;
        if (W.endT > 3.0 && !W.over) { W.over = true; endRace(W); }
      } else if (!W.attract && W.t > 480 && !W.over) { W.over = true; timeUp(W); }
    }
    W.goT = Math.max(0, W.goT - dt); W.bannerT = Math.max(0, W.bannerT - dt);
    P.xCam = P.xCam;
    sortOrder(W);
    updateP(dt);
    W.shake *= Math.exp(-dt * 7);
    placeCar(W.T, P);
  }

  function simulateRest(W) {
    W.P.ghost = true;
    var guard = 0;
    function open() { for (var i = 0; i < W.rivals.length; i++) if (!W.rivals[i].finished) return true; return false; }
    while (open() && guard++ < 7000) advanceAI(W, 1 / 30, true);
  }

  function endRace(W) {
    var P = W.P, T = W.T, track = W.cfg.track, i;
    engineStop();
    var rows = [];
    if (W.mode === 'race') {
      simulateRest(W);
      W.racers.forEach(function (c) { rows.push(c); });
      rows.sort(function (a, b) { return (a.finT || 1e9) - (b.finT || 1e9); });
    }
    var pos = W.mode === 'race' ? rows.indexOf(P) + 1 : 1, total = P.finT, st = bestOf(track);
    var newTotal = st.total == null || total < st.total, newLap = P.bestLap < Infinity && (st.lap == null || P.bestLap < st.lap);
    var prevTotal = st.total;
    if (newTotal) st.total = total;
    if (newLap) st.lap = P.bestLap;
    ARC.store.set('midnight-apex.bests', BESTS);
    var html = '', h = '<table class="mx-res"><tbody>';
    if (W.mode === 'race') {
      for (i = 0; i < rows.length; i++) {
        var c = rows[i], gap = c.finT - rows[0].finT;
        h += '<tr' + (c.isPlayer ? ' class="me"' : '') + '><td>' + (i + 1) + '</td><td>' + ARC.esc(c.isPlayer ? 'You' : c.name) + '<small>' + ARC.esc(c.k.name) + '</small></td><td>' + (i === 0 ? fmtTime(c.finT) : '+' + gap.toFixed(2)) + '</td></tr>';
      }
      h += '</tbody></table>';
      html += h;
    }
    html += '<div class="mx-laps">' + P.lapTimes.map(function (t, k) { return '<span>Lap ' + (k + 1) + '<b>' + fmtTime(t) + '</b></span>'; }).join('') + '</div>';
    var title = W.mode === 'race' ? ordinal(pos) + ' <em>place</em>' : 'Time <em>attack</em>';
    ARC.over({
      score: total, lowerIsBetter: true, scoreLabel: 'Total time', eyebrow: W.mode === 'race' ? 'Race result - ' + T.name : 'Time attack - ' + T.name,
      title: title, html: html, again: W.mode === 'race' ? 'Race again' : 'Go again'
    });
    var stat = document.querySelector('.arc-card .stat');
    if (stat) {
      stat.innerHTML = '<div>Total time<b>' + fmtTime(total) + '</b></div><div>Best lap<b>' + fmtTime(P.bestLap) + '</b></div><div>Track best<b>' + fmtTime(st.total) + '</b></div>' +
        (newTotal ? '<div class="new">' + (prevTotal == null ? 'First time set' : 'New track best') + '<b class="new">&#9733;</b></div>' : '');
    }
    W.results = { pos: pos, total: total, rows: rows.map(function (c) { return { name: c.name, t: c.finT }; }) };
  }

  function timeUp(W) {
    engineStop();
    ARC.panel({
      eyebrow: 'Out of time', title: 'Time <em>up</em>', html: '<p>Eight minutes on the clock and no chequered flag. Pull the nitro in the straights and keep it clean in the bends.</p>',
      actions: [{ label: 'Try again', primary: true, on: ARC.start }, { label: 'Change settings', on: function () { ARC.menu(); } }]
    });
    ARC.state = 'over';
  }

  /* ----------------------------------------------------------- rendering */
  var vW = 0, vH = 0, vHz = 0, vSX = 0, vSY = 0, vD = 0;
  var R = { skyKey: '', skyG: null, fogKey: '', fogG: null, fogY0: 0, fogSpan: 0, vigKey: '', vigG: null, rain: null, lines: null, lastT: 0, lineT: 0, mapKey: '' };
  var GLINT = ['rgba(210,228,255,.10)', 'rgba(210,228,255,.16)', 'rgba(255,240,205,.20)', 'rgba(255,240,205,.28)'];
  var SHEEN = [];
  NEON_COLS.forEach(function (c) { SHEEN.push(rgba(c, 0.13)); SHEEN.push(rgba(c, 0.2)); });

  function proj(p, camX, camY, camZ) {
    p.cx = -camX; p.cy = p.wy - camY; p.cz = p.wz - camZ;
    p.ss = p.cz > 1 ? vD / p.cz : 0;
    p.sx = vW / 2 + p.ss * p.cx * vSX;
    p.sy = vHz - p.ss * p.cy * vSY;
    p.sw = p.ss * ROAD_W * vSX;
  }
  function poly(ctx, c, x1, y1, x2, y2, x3, y3, x4, y4) {
    ctx.fillStyle = c; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.lineTo(x4, y4); ctx.closePath(); ctx.fill();
  }

  function drawSky(ctx, arc, W) {
    var w = arc.w, hz = vHz, T = W.T, pal = T.pal, i;
    var key = T.id + '|' + hz;
    if (R.skyKey !== key) {
      var g = ctx.createLinearGradient(0, 0, 0, hz + 2);
      for (i = 0; i < pal.sky.length; i += 2) g.addColorStop(pal.sky[i], pal.sky[i + 1]);
      R.skyG = g; R.skyKey = key;
    }
    ctx.fillStyle = R.skyG; ctx.fillRect(0, 0, w, hz + 2);
    // stars
    var tm = performance.now() * 0.001, sh = W.bgX * w * 0.012;
    ctx.fillStyle = '#ffffff';
    for (i = 0; i < T.stars.length; i++) {
      var s = T.stars[i];
      ctx.globalAlpha = 0.35 + 0.45 * Math.sin(tm * 1.7 + s[3]);
      ctx.fillRect(mod(s[0] * w - sh, w), s[1] * hz * 0.86, s[2], s[2]);
    }
    ctx.globalAlpha = 1;
    // moon
    var mw = hz * 0.62 * pal.moonAt[2], mx = pal.moonAt[0] * w - W.bgX * w * 0.02, my = pal.moonAt[1] * hz;
    W.moonX = mx;
    blit(ctx, T.moon, mw, mx, my + mw * 0.5, -0.5, -1, null);
    // parallax layers
    var sc = hz * 0.7 / BGH, tile = BGW * sc;
    for (i = 0; i < T.bg.length; i++) {
      var L = T.bg[i], shift = W.bgX * L.speed * 150 + W.P.xCam * L.speed * 36;
      for (var x = -mod(shift, tile); x < w; x += tile) ctx.drawImage(L.img, x, hz - BGH * sc + 2, tile + 1, BGH * sc);
    }
    ctx.fillStyle = pal.ground[pal.ground.length > 1 ? 1 : 0][1];
    ctx.fillRect(0, hz, w, vH - hz);
  }

  function drawWorld(ctx, arc, W) {
    var w = arc.w, h = arc.h, T = W.T, P = W.P, pal = T.pal, segs = T.segs, N = T.n, L = T.L, n, i;
    var asp = w / h, portrait = asp < 0.9, touch = arc.touchMode;
    var hz = Math.round(h * (portrait ? 0.43 : 0.38));
    var roadY0 = h * (portrait ? (touch ? 0.745 : 0.8) : (touch ? 0.81 : 0.875));
    var carFrac = clamp(0.15 + (1.7 - asp) * 0.105, 0.15, 0.3);
    vW = w; vH = h; vHz = hz; vSY = roadY0 - hz; vSX = carFrac * w * CAM_H / P.k.ww;
    vD = 1 / Math.tan(W.fov * 0.5 * Math.PI / 180);
    var playerZ = CAM_H * vD;

    ctx.fillStyle = pal.sky[1]; ctx.fillRect(0, 0, w, h);
    var shx = 0, shy = 0;
    if (!arc.reducedMotion && W.shake > 0.2) { shx = (Math.random() - 0.5) * W.shake; shy = (Math.random() - 0.5) * W.shake * 0.7; }
    ctx.save(); ctx.translate(shx, shy);
    drawSky(ctx, arc, W);

    var position = mod(P.dist - playerZ, L), base = segs[(position / SEG) | 0], basePct = (position % SEG) / SEG;
    var pz = mod(P.dist, L), pseg = segs[(pz / SEG) | 0], ppct = (pz % SEG) / SEG;
    var playerY = lerp(pseg.p1.wy, pseg.p2.wy, ppct);
    var camYw = playerY + CAM_H, camXw = P.xCam * ROAD_W;
    var drawN = Math.min(N - 2, portrait ? 130 : 170);
    var maxy = h, x = 0, dx = -(base.curve * basePct), seg, p1, p2;
    var x1, y1, w1, x2, y2, w2, r1, r2, l1, l2, c, gl, gr, t, light, xm, by, ty;
    var wet = !!pal.rain, rd = pal.rail;

    for (n = 0; n < drawN; n++) {
      seg = segs[(base.i + n) % N]; seg.looped = seg.i < base.i; seg.clip = maxy; seg.vis = false;
      var cz = position - (seg.looped ? L : 0);
      p1 = seg.p1; p2 = seg.p2;
      proj(p1, camXw - x, camYw, cz); proj(p2, camXw - x - dx, camYw, cz);
      x += dx; dx += seg.curve;
      if (p1.cz <= vD || p2.sy >= p1.sy || p2.sy >= maxy) continue;
      seg.vis = true;
      x1 = p1.sx; y1 = p1.sy; w1 = p1.sw; x2 = p2.sx; y2 = p2.sy; w2 = p2.sw;
      var ymax = y1;
      if (y1 > maxy) { t = (maxy - y2) / (y1 - y2); x1 = x2 + (x1 - x2) * t; w1 = w2 + (w1 - w2) * t; y1 = maxy; }
      light = seg.light;
      ty = Math.floor(y2); by = Math.ceil(y1) + 1; if (by > h) by = h;
      gl = pal.ground[seg.gl][light]; gr = pal.ground[seg.gr][light];
      if (seg.gl === seg.gr) { ctx.fillStyle = gl; ctx.fillRect(0, ty, w, by - ty); }
      else {
        xm = (x1 + x2) * 0.5;
        ctx.fillStyle = gl; ctx.fillRect(0, ty, xm, by - ty);
        ctx.fillStyle = gr; ctx.fillRect(xm, ty, w - xm, by - ty);
      }
      r1 = w1 / 9; r2 = w2 / 9;
      if (pal.sea && seg.gl === 0 && seg.h < 0.55) {
        var edgeL = Math.min((x1 - w1 - r1), (x2 - w2 - r2)) - 6, spread = 5 + (y2 - hz) * 0.5, gx = W.moonX + (seg.h - 0.27) * spread * 4, gx0 = Math.max(0, gx - spread), gx1 = Math.min(edgeL, gx + spread);
        if (gx1 > gx0) { ctx.fillStyle = GLINT[(seg.h * 7.3 | 0) & 3]; ctx.fillRect(gx0, ty, gx1 - gx0, Math.max(1, by - ty - 1)); }
      }
      if (w1 > 26) {
        c = pal.rumble[light];
        poly(ctx, c, x1 - w1 - r1, y1 + 1, x1 - w1, y1 + 1, x2 - w2, y2, x2 - w2 - r2, y2);
        poly(ctx, c, x1 + w1 + r1, y1 + 1, x1 + w1, y1 + 1, x2 + w2, y2, x2 + w2 + r2, y2);
        poly(ctx, pal.road[light], x1 - w1, y1 + 1, x1 + w1, y1 + 1, x2 + w2, y2, x2 - w2, y2);
        if (w1 > 40) {
          l1 = w1 / 40; l2 = w2 / 40;
          var e1 = w1 - w1 / 13, e2 = w2 - w2 / 13;
          poly(ctx, pal.lane, x1 - e1 - l1, y1 + 1, x1 - e1 + l1, y1 + 1, x2 - e2 + l2, y2, x2 - e2 - l2, y2);
          poly(ctx, pal.lane, x1 + e1 - l1, y1 + 1, x1 + e1 + l1, y1 + 1, x2 + e2 + l2, y2, x2 + e2 - l2, y2);
          if (light) {
            l1 = w1 / 34; l2 = w2 / 34;
            for (i = -1; i <= 1; i++) {
              var o1 = i * w1 * 0.5, o2 = i * w2 * 0.5;
              poly(ctx, pal.lane, x1 + o1 - l1, y1 + 1, x1 + o1 + l1, y1 + 1, x2 + o2 + l2, y2, x2 + o2 - l2, y2);
            }
          }
          if (wet && seg.h7 < 0.5) {
            var cc = (seg.h7 * 41 % 1) * 1.5 - 0.75, hw = 0.08 + (seg.h7 * 17 % 1) * 0.12, ci = ((seg.h7 * 23 | 0) % 6) * 2 + (seg.h7 > 0.25 ? 1 : 0);
            poly(ctx, SHEEN[ci], x1 + (cc - hw) * w1, y1 + 1, x1 + (cc + hw) * w1, y1 + 1, x2 + (cc + hw) * w2, y2, x2 + (cc - hw) * w2, y2);
          }
          if (seg.i < 2) {
            // chequered start line
            for (i = 0; i < 8; i++) {
              var a0 = -1 + i * 0.25, a1 = a0 + 0.25;
              poly(ctx, (i + seg.i) % 2 ? '#f4f0e6' : '#17181c', x1 + a0 * w1, y1 + 1, x1 + a1 * w1, y1 + 1, x2 + a1 * w2, y2, x2 + a0 * w2, y2);
            }
          }
        }
      } else {
        poly(ctx, pal.road[light], x1 - w1 - r1, y1 + 1, x1 + w1 + r1, y1 + 1, x2 + w2 + r2, y2, x2 - w2 - r2, y2);
      }
      maxy = ymax;
    }

    // second pass: tall things and cars, far to near
    var drewPlayer = false;
    for (n = drawN - 1; n >= 0; n--) {
      seg = segs[(base.i + n) % N];
      p1 = seg.p1; p2 = seg.p2;
      if (p1.cz <= vD) continue;
      if (seg.vis) {
        if (seg.tun === 1) drawTunnel(ctx, seg, segs[(seg.i + N - 1) % N].tun !== 1, pal);
        else if (seg.tun === 2) drawFlyover(ctx, seg, segs[(seg.i + N - 1) % N].tun !== 2);
        else if (seg.rail && rd) drawRails(ctx, seg, rd);
      }
      var ci, ss, sx, sy, spr, destW;
      for (ci = 0; ci < seg.spr.length; ci++) {
        var sp = seg.spr[ci], d = T.defs[sp.key];
        ss = p1.ss; destW = ss * d.ww * vSX;
        if (destW < 2.5 || destW > 7000) continue;
        sx = p1.sx + ss * sp.off * ROAD_W * vSX;
        var ax = d.edge ? (sp.off < 0 ? -1 : 0) : -0.5, left = sx + destW * ax;
        if (left > w || left + destW < 0) continue;
        blit(ctx, d.spr, destW, sx, p1.sy, ax, -1, seg.clip);
      }
      for (ci = 0; ci < seg.cars.length; ci++) {
        var car = seg.cars[ci], pct = clamp((car.z - p1.wz) / SEG, 0, 1);
        if (lerp(p1.cz, p2.cz, pct) < playerZ * 0.55) continue;
        ss = lerp(p1.ss, p2.ss, pct);
        sx = lerp(p1.sx, p2.sx, pct) + ss * car.x * ROAD_W * vSX; sy = lerp(p1.sy, p2.sy, pct);
        destW = ss * car.k.ww * vSX;
        spr = carSprite(car.kind, car.hex, car.brake, car.isTraffic ? 1 : 1.5);
        blit(ctx, spr, destW, sx, sy, -0.5, -1, seg.clip);
      }
      if (seg === pseg) { drawPlayer(ctx, arc, W, pseg, ppct, playerZ); drewPlayer = true; }
    }
    if (!drewPlayer) drawPlayer(ctx, arc, W, pseg, ppct, playerZ);
    ctx.restore();

    // atmosphere
    var fk = T.id + '|' + hz + '|' + h;
    if (R.fogKey !== fk) {
      var above = hz * 0.36, below = (h - hz) * pal.fogH * 0.9, span = above + below, A = pal.fogA, g = ctx.createLinearGradient(0, hz - above, 0, hz - above + span);
      [[0, 0], [above / span * 0.6, 0.3 * A], [above / span, A], [(above + below * 0.03) / span, 0.88 * A], [(above + below * 0.07) / span, 0.5 * A], [(above + below * 0.14) / span, 0.22 * A], [(above + below * 0.28) / span, 0.07 * A], [(above + below * 0.5) / span, 0], [1, 0]].forEach(function (s) { g.addColorStop(s[0], rgba(pal.fog, s[1])); });
      R.fogG = g; R.fogY0 = hz - above; R.fogSpan = span; R.fogKey = fk;
    }
    ctx.fillStyle = R.fogG; ctx.fillRect(0, R.fogY0, w, R.fogSpan);
    drawP(ctx);
    drawFX(ctx, arc, W, hz);
  }

  function drawRails(ctx, seg, rd) {
    var p1 = seg.p1, p2 = seg.p2, side, off = 1.3, ha = p1.ss * rd.h * vSY, hb = p2.ss * rd.h * vSY, xa, xb;
    for (side = -1; side <= 1; side += 2) {
      if (!(seg.rail & (side < 0 ? 1 : 2))) continue;
      xa = p1.sx + side * off * p1.sw; xb = p2.sx + side * off * p2.sw;
      poly(ctx, rd.panel, xa, p1.sy, xb, p2.sy, xb, p2.sy - hb, xa, p1.sy - ha);
      poly(ctx, rd.cap, xa, p1.sy - ha * 0.82, xb, p2.sy - hb * 0.82, xb, p2.sy - hb, xa, p1.sy - ha);
      if (seg.i % 2 === 0) { var pw = Math.max(1.2, p1.sw * 0.035); poly(ctx, rd.post, xa - pw, p1.sy, xa + pw, p1.sy, xa + pw, p1.sy - ha * 1.12, xa - pw, p1.sy - ha * 1.12); }
    }
  }

  var TUN_H = 2300;
  function drawTunnel(ctx, seg, first, pal) {
    var p1 = seg.p1, p2 = seg.p2, h1 = p1.ss * TUN_H * vSY, h2 = p2.ss * TUN_H * vSY, k = 1.16, light = seg.light;
    var xl1 = p1.sx - p1.sw * k, xr1 = p1.sx + p1.sw * k, xl2 = p2.sx - p2.sw * k, xr2 = p2.sx + p2.sw * k;
    var yt1 = Math.max(-5000, p1.sy - h1), yt2 = Math.max(-5000, p2.sy - h2);
    if (first) {
      var ht = Math.max(-9000, p1.sy - p1.ss * (TUN_H + 9000) * vSY), ex = p1.sw * 3.6;
      poly(ctx, '#2a2d30', p1.sx - ex, p1.sy, xl1, p1.sy, xl1, ht, p1.sx - ex, ht);
      poly(ctx, '#2a2d30', xr1, p1.sy, p1.sx + ex, p1.sy, p1.sx + ex, ht, xr1, ht);
      poly(ctx, '#2a2d30', p1.sx - ex, yt1, p1.sx + ex, yt1, p1.sx + ex, ht, p1.sx - ex, ht);
      var lip = p1.sw * 0.14;
      poly(ctx, '#80848a', xl1 - lip, p1.sy, xl1, p1.sy, xl1, yt1, xl1 - lip, yt1);
      poly(ctx, '#80848a', xr1, p1.sy, xr1 + lip, p1.sy, xr1 + lip, yt1, xr1, yt1);
      poly(ctx, '#80848a', xl1 - lip, yt1, xr1 + lip, yt1, xr1 + lip, yt1 - lip * 0.8, xl1 - lip, yt1 - lip * 0.8);
    }
    poly(ctx, light ? '#4a4b52' : '#42434a', xl1, p1.sy, xl2, p2.sy, xl2, yt2, xl1, yt1);
    poly(ctx, light ? '#4a4b52' : '#42434a', xr1, p1.sy, xr2, p2.sy, xr2, yt2, xr1, yt1);
    poly(ctx, light ? '#2a2b31' : '#222329', xl1, yt1, xr1, yt1, xr2, yt2, xl2, yt2);
    var b1 = p1.ss * 260 * vSY, b2 = p2.ss * 260 * vSY;
    poly(ctx, '#c9c2a8', xl1, p1.sy, xl2, p2.sy, xl2, p2.sy - b2, xl1, p1.sy - b1);
    poly(ctx, '#c9c2a8', xr1, p1.sy, xr2, p2.sy, xr2, p2.sy - b2, xr1, p1.sy - b1);
    if (seg.i % 4 === 0) {
      var q = 0.22;
      poly(ctx, '#fff0c8', p1.sx - p1.sw * q, yt1, p1.sx + p1.sw * q, yt1, p2.sx + p2.sw * q, yt2, p2.sx - p2.sw * q, yt2);
      var lz = p1.sy - p1.ss * TUN_H * 0.75 * vSY;
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      poly(ctx, 'rgba(255,200,120,.10)', p1.sx - p1.sw, p1.sy, p1.sx + p1.sw, p1.sy, p2.sx + p2.sw, p2.sy, p2.sx - p2.sw, p2.sy);
      ctx.restore();
    }
  }

  var FLY_H = 1700;
  function drawFlyover(ctx, seg, first) {
    var p1 = seg.p1, p2 = seg.p2, k = 1.55, h1 = p1.ss * FLY_H * vSY, h2 = p2.ss * FLY_H * vSY, t1 = p1.ss * 500 * vSY, t2 = p2.ss * 500 * vSY;
    var yb1 = Math.max(-5000, p1.sy - h1), yb2 = Math.max(-5000, p2.sy - h2);
    if (first) poly(ctx, '#4b4a58', p1.sx - p1.sw * k, yb1, p1.sx + p1.sw * k, yb1, p1.sx + p1.sw * k, yb1 - t1, p1.sx - p1.sw * k, yb1 - t1);
    poly(ctx, seg.light ? '#2b2a35' : '#24232d', p1.sx - p1.sw * k, yb1, p1.sx + p1.sw * k, yb1, p2.sx + p2.sw * k, yb2, p2.sx - p2.sw * k, yb2);
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var s = -1; s <= 1; s += 2) {
      var a = s * 1.3, wd = 0.045;
      poly(ctx, 'rgba(255,61,139,.75)', p1.sx + (a - wd) * p1.sw, yb1, p1.sx + (a + wd) * p1.sw, yb1, p2.sx + (a + wd) * p2.sw, yb2, p2.sx + (a - wd) * p2.sw, yb2);
    }
    if (seg.i % 5 === 0) poly(ctx, 'rgba(190,230,255,.55)', p1.sx - p1.sw * 0.3, yb1, p1.sx + p1.sw * 0.3, yb1, p2.sx + p2.sw * 0.3, yb2, p2.sx - p2.sw * 0.3, yb2);
    ctx.restore();
  }

  function drawPlayer(ctx, arc, W, pseg, ppct, playerZ) {
    var P = W.P, K = P.k, w = arc.w;
    var s0 = vD / playerZ;
    var cy = lerp(pseg.p1.cy, pseg.p2.cy, ppct);
    var bob = arc.reducedMotion ? 0 : Math.sin(arc.time * 38) * (0.5 + P.speed / BASE_MAX * 1.2) * (Math.abs(P.x) > 1.12 ? 3 : 0.6) * vW / 600;
    var carX = w / 2 + (P.x - P.xCam) * ROAD_W * s0 * vSX, carY = vHz - s0 * cy * vSY + bob;
    var destW = K.ww * s0 * vSX;
    var spr = carSprite(P.kind, P.hex, P.brake, 2);
    W.pcx = carX; W.pcy = carY; W.pcw = destW;
    ctx.save(); ctx.translate(carX, carY); ctx.rotate(P.lean);
    blit(ctx, spr, destW, 0, 0, -0.5, -1, null);
    ctx.restore();
    // nitro flames
    var sc = destW / 240, tm = performance.now() * 0.001;
    if (P.nitroOn || (P.flameT > 0)) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < K.pipes.length; i++) {
        var ex = carX + K.pipes[i] * sc * Math.cos(P.lean), ey = carY - (156 - K.pipeY) * sc;
        var fl = (0.75 + 0.5 * Math.sin(tm * 70 + i * 2.1) * Math.sin(tm * 43 + i)) * destW * (K.pipes.length > 2 ? 0.34 : 0.5);
        var pr = K.pipeR * sc;
        var gr = ctx.createLinearGradient(0, ey, 0, ey + fl);
        gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.18, 'rgba(150,200,255,.9)'); gr.addColorStop(0.6, 'rgba(40,110,255,.55)'); gr.addColorStop(1, 'rgba(20,60,255,0)');
        ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(ex - pr * 0.8, ey); ctx.lineTo(ex + pr * 0.8, ey); ctx.lineTo(ex + pr * 0.35 + Math.sin(tm * 50 + i) * pr * 0.3, ey + fl); ctx.lineTo(ex - pr * 0.35, ey + fl); ctx.closePath(); ctx.fill();
        var gg = ctx.createRadialGradient(ex, ey, 0, ex, ey, pr * 3.4);
        gg.addColorStop(0, 'rgba(160,210,255,.7)'); gg.addColorStop(1, 'rgba(40,100,255,0)');
        ctx.fillStyle = gg; ctx.fillRect(ex - pr * 3.4, ey - pr * 3.4, pr * 6.8, pr * 6.8);
      }
      ctx.restore();
    }
    if (P.nitroOn) P.flameT = 0.25; else if (P.flameT > 0) P.flameT -= 0.016;
  }

  function drawFX(ctx, arc, W, hz) {
    var w = arc.w, h = arc.h, P = W.P, T = W.T, i, now = performance.now() * 0.001, dtR = clamp(now - R.lastT, 0, 0.05);
    R.lastT = now;
    var sp = clamp(P.speed / BASE_MAX, 0, 1.5), inten = clamp((sp - 0.72) / 0.5, 0, 1) * 0.55 + (P.nitroOn ? 0.5 : 0);
    if (!arc.reducedMotion && inten > 0.02 && W.phase !== 'countdown') {
      if (!R.lines) { R.lines = []; for (i = 0; i < 34; i++) R.lines.push([Math.random() * TAU, Math.random(), 0.6 + Math.random() * 0.8]); }
      var vx = w / 2, vy = hz + (h - hz) * 0.22, maxR = Math.hypot(w, h) * 0.62;
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      ctx.strokeStyle = P.nitroOn ? 'rgba(150,200,255,' + (0.18 + inten * 0.22) + ')' : 'rgba(255,255,255,' + (0.06 + inten * 0.16) + ')';
      ctx.lineWidth = 1.6; ctx.beginPath();
      for (i = 0; i < R.lines.length; i++) {
        var ln = R.lines[i]; ln[1] += dtR * (0.9 + sp) * ln[2]; if (ln[1] > 1) { ln[1] -= 1; ln[0] = Math.random() * TAU; }
        var r0 = (0.28 + ln[1] * 0.72) * maxR, r1 = r0 + (0.05 + ln[1] * 0.2) * maxR * inten, ca = Math.cos(ln[0]), sa = Math.sin(ln[0]);
        ctx.moveTo(vx + ca * r0, vy + sa * r0 * 0.8); ctx.lineTo(vx + ca * r1, vy + sa * r1 * 0.8);
      }
      ctx.stroke(); ctx.restore();
    }
    if (T.pal.rain) {
      if (!R.rain) { R.rain = []; for (i = 0; i < 110; i++) R.rain.push([Math.random(), Math.random(), 0.7 + Math.random() * 0.8, 10 + Math.random() * 16]); }
      ctx.strokeStyle = 'rgba(190,210,255,.30)'; ctx.lineWidth = 1.2; ctx.beginPath();
      var slant = 0.16 + sp * 0.2;
      for (i = 0; i < R.rain.length; i++) {
        var d = R.rain[i]; d[1] += dtR * (1.1 + d[2]); d[0] -= dtR * slant * 0.5; if (d[1] > 1) { d[1] -= 1; d[0] = Math.random(); } if (d[0] < 0) d[0] += 1;
        var rx = d[0] * w, ry = d[1] * h; ctx.moveTo(rx, ry); ctx.lineTo(rx - d[3] * slant, ry + d[3]);
      }
      ctx.stroke();
    }
    var vk = w + 'x' + h;
    if (R.vigKey !== vk) {
      var g = ctx.createRadialGradient(w / 2, h * 0.55, Math.min(w, h) * 0.35, w / 2, h * 0.55, Math.hypot(w, h) * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.5)'); R.vigG = g; R.vigKey = vk;
    }
    ctx.fillStyle = R.vigG; ctx.fillRect(0, 0, w, h);
    if (W.flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + (W.flash * 0.3) + ')'; ctx.fillRect(0, 0, w, h); }
  }

  /* --------------------------------------------------------------- HUD */
  var F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif', F_BODY = 'Inter, -apple-system, sans-serif';
  var INK = '#fbf5ec', DIM = '#a39e94', GOLD = '#ffb736', ORANGE = '#ff6940';
  function txt(ctx, s, x, y, size, color, align, weight, fam) {
    ctx.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); ctx.fillStyle = color; ctx.textAlign = align || 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(s, x, y);
  }
  function plate(ctx, x, y, w, h, r) {
    rr(ctx, x, y, w, h, r == null ? 10 : r); ctx.fillStyle = 'rgba(8,6,4,.64)'; ctx.fill(); ctx.strokeStyle = 'rgba(251,245,236,.16)'; ctx.lineWidth = 1; ctx.stroke();
  }

  function drawDial(ctx, cx, cy, r, P, K, F) {
    var a0 = 0.75 * Math.PI, a1 = 2.25 * Math.PI, maxK = 400, kmh = P.speed * KMH, v, a, i;
    var g = ctx.createRadialGradient(cx, cy - r * 0.25, r * 0.1, cx, cy, r * 1.05);
    g.addColorStop(0, 'rgba(38,31,24,.88)'); g.addColorStop(1, 'rgba(8,6,4,.9)');
    ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, TAU); ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(251,245,236,.22)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.87, a0 + (330 / maxK) * (a1 - a0), a1); ctx.lineWidth = r * 0.07; ctx.strokeStyle = 'rgba(255,77,31,.85)'; ctx.stroke();
    ctx.lineCap = 'butt';
    for (v = 0; v <= maxK; v += 20) {
      a = a0 + (v / maxK) * (a1 - a0); var big = v % 100 === 0, in1 = r * (big ? 0.72 : 0.79), out = r * 0.9;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * in1, cy + Math.sin(a) * in1); ctx.lineTo(cx + Math.cos(a) * out, cy + Math.sin(a) * out);
      ctx.strokeStyle = big ? INK : 'rgba(251,245,236,.45)'; ctx.lineWidth = big ? 2 : 1; ctx.stroke();
      if (big && r >= 62) txt(ctx, String(v / 100), cx + Math.cos(a) * r * 0.6, cy + Math.sin(a) * r * 0.6 + 4, 11, DIM, 'center', '500');
    }
    // needle
    var na = a0 + clamp(kmh / maxK, 0, 1.02) * (a1 - a0);
    ctx.save(); ctx.shadowColor = ORANGE; ctx.shadowBlur = 8; ctx.strokeStyle = ORANGE; ctx.lineWidth = Math.max(2.5, r * 0.05); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - Math.cos(na) * r * 0.12, cy - Math.sin(na) * r * 0.12); ctx.lineTo(cx + Math.cos(na) * r * 0.84, cy + Math.sin(na) * r * 0.84); ctx.stroke(); ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.09, 0, TAU); ctx.fillStyle = '#2a251f'; ctx.fill(); ctx.strokeStyle = ORANGE; ctx.lineWidth = 2; ctx.stroke();
    // gear and speed
    txt(ctx, P.speed < 120 ? 'N' : String(P.gear), cx, cy - r * 0.22, Math.max(14, r * 0.5), GOLD, 'center', '700');
    txt(ctx, String(Math.round(kmh)), cx, cy + r * 0.36, Math.max(13, r * 0.38), INK, 'center', '700');
    if (r >= 62) txt(ctx, 'km/h', cx, cy + r * 0.5, 11, DIM, 'center', '500');
    // rpm bar
    var seg = 14, bw = r * 1.18, sw = bw / seg, by = cy + r * (r >= 62 ? 0.62 : 0.56), lit = Math.round(clamp(P.rpm, 0, 1) * seg);
    for (i = 0; i < seg; i++) {
      ctx.fillStyle = i < lit ? (i > seg - 4 ? '#ff4d1f' : i > seg - 7 ? '#ffd23f' : '#44e39a') : 'rgba(251,245,236,.14)';
      ctx.fillRect(cx - bw / 2 + i * sw + 0.5, by, sw - 1.5, Math.max(4, r * 0.09));
    }
  }

  function drawMap(ctx, W, x, y, S) {
    var T = W.T, M = T.map, pad = Math.max(6, S * 0.1), inner = S - pad * 2, i;
    var dpr = ARC.dpr || 1, key = T.id + '|' + S + '|' + dpr;
    if (M.cacheKey !== key) {
      var c = makeCanvas(S * dpr, S * dpr), g = c.getContext('2d'); g.scale(dpr, dpr); g.lineJoin = 'round'; g.lineCap = 'round';
      g.beginPath(); M.pts.forEach(function (p, k) { var px = pad + p[0] * inner, py = pad + p[1] * inner; if (k) g.lineTo(px, py); else g.moveTo(px, py); }); g.closePath();
      g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = Math.max(6, S * 0.08); g.stroke();
      g.strokeStyle = '#d6cfc0'; g.lineWidth = Math.max(3, S * 0.04); g.stroke();
      var s0 = M.pts[0]; g.fillStyle = ORANGE; g.fillRect(pad + s0[0] * inner - 3, pad + s0[1] * inner - 3, 6, 6);
      M.cache = c; M.cacheKey = key;
    }
    plate(ctx, x, y, S, S, 12);
    ctx.drawImage(M.cache, x, y, S, S);
    var list = W.rivals.concat([W.P]);
    for (i = 0; i < list.length; i++) {
      var c2 = list[i], f = mod(c2.dist, T.L) / SEG, k = Math.floor(f) % T.n, t = f - Math.floor(f), a = M.pts[k], b = M.pts[(k + 1) % T.n];
      var px = x + pad + lerp(a[0], b[0], t) * inner, py = y + pad + lerp(a[1], b[1], t) * inner, isP = c2.isPlayer;
      ctx.beginPath(); ctx.arc(px, py, isP ? Math.max(4.5, S * 0.05) : Math.max(3.2, S * 0.034), 0, TAU);
      ctx.fillStyle = isP ? ORANGE : c2.hex; ctx.fill(); ctx.lineWidth = isP ? 2 : 1.2; ctx.strokeStyle = isP ? '#fff' : 'rgba(0,0,0,.7)'; ctx.stroke();
    }
  }

  function drawHUD(ctx, arc, W) {
    var w = arc.w, h = arc.h, P = W.P, touch = arc.touchMode, race = W.mode === 'race', i;
    var u = clamp(Math.min(w / 700, h / 600), 0.78, 1.15), portrait = w / h < 0.9;
    function S(v) { return Math.round(v * u); }
    function F(v) { return Math.max(12, Math.round(v * u)); }
    var m = S(9) + 2;
    var pos = positionOf(W, P), lapNo = clamp(P.lapIdx + 1, 1, LAPS);
    var tTotal = W.phase === 'countdown' ? 0 : (P.finished ? P.finT : W.t), lapNow = (P.started && !P.finished) ? W.t - P.lapT0 : 0;
    var stored = bestOf(W.cfg.track).lap, bestL = Math.min(P.bestLap, stored == null ? Infinity : stored);

    // position and lap
    var aw = S(108), ah = S(66);
    plate(ctx, m, m, aw, ah, 12);
    if (race) {
      txt(ctx, String(pos), m + S(12), m + S(40), F(38), pos === 1 ? GOLD : INK, 'left', '500', F_DISP);
      var nw = ctx.measureText(String(pos)).width;
      txt(ctx, ordinal(pos).replace(/\d+/, ''), m + S(14) + nw, m + S(24), F(13), DIM, 'left', '600');
      txt(ctx, '/ ' + (W.rivals.length + 1), m + S(14) + nw + S(26), m + S(40), F(14), DIM, 'left', '600');
      txt(ctx, 'LAP ' + lapNo + '/' + LAPS, m + S(12), m + S(59), F(13), INK, 'left', '700');
    } else {
      txt(ctx, 'LAP ' + lapNo + '/' + LAPS, m + S(12), m + S(34), F(20), INK, 'left', '700');
      txt(ctx, 'TIME ATTACK', m + S(12), m + S(55), F(11), GOLD, 'left', '600');
    }
    // timers
    var bw = S(178), bh = S(66), bx = portrait ? m + aw + S(6) : Math.round((w - bw) / 2), by = m;
    plate(ctx, bx, by, bw, bh, 12);
    var rows = [['TIME', fmtTime(tTotal), INK], ['LAP', fmtTime(lapNow), INK], ['BEST', bestL < Infinity ? fmtTime(bestL) : '-:--.--', P.bestLap <= (stored == null ? Infinity : stored) && P.bestLap < Infinity ? GOLD : DIM]];
    for (i = 0; i < 3; i++) {
      txt(ctx, rows[i][0], bx + S(10), by + S(19) + i * S(18), F(11), DIM, 'left', '600');
      txt(ctx, rows[i][1], bx + bw - S(10), by + S(19) + i * S(18), F(i === 0 ? 15 : 13), rows[i][2], 'right', i === 0 ? '700' : '600');
    }
    // map
    var ms = portrait ? S(100) : S(136);
    drawMap(ctx, W, w - m - ms, m, ms);

    // dial and nitro
    var r = touch ? S(62) : S(74), cx, cy;
    if (touch) { cx = Math.max(18, m) + r + 4; cy = h - 150 - 12 - r; }
    else { cx = w - m - r - 6; cy = h - m - r - 6; }
    drawDial(ctx, cx, cy, r, P, P.k, F);
    var nit = clamp(P.nitro / 100, 0, 1), flick = P.nitroOn ? 0.75 + 0.25 * Math.sin(performance.now() * 0.04) : 1;
    var nx, ny, nw2, nh2;
    if (touch) {
      nw2 = S(14); nh2 = S(112); nx = w - 14 - 78 / 2 - nw2 / 2 - 6 + 24; ny = h - 168 - 14 - nh2;
      nx = w - 14 - nw2 - 6;
      plate(ctx, nx - 5, ny - 22, nw2 + 10, nh2 + 28, 8);
      txt(ctx, 'N2O', nx + nw2 / 2, ny - 7, 11, GOLD, 'center', '700');
      ctx.fillStyle = 'rgba(251,245,236,.14)'; ctx.fillRect(nx, ny, nw2, nh2);
      var gv = ctx.createLinearGradient(0, ny + nh2, 0, ny); gv.addColorStop(0, '#2f7bff'); gv.addColorStop(1, '#a8e4ff');
      ctx.globalAlpha = flick; ctx.fillStyle = gv; ctx.fillRect(nx, ny + nh2 * (1 - nit), nw2, nh2 * nit); ctx.globalAlpha = 1;
      if (P.draft > 0.4) txt(ctx, 'DRAFT', nx + nw2 / 2, ny - 26, 11, '#9fe0ff', 'center', '700');
    } else {
      nw2 = S(250); nh2 = S(16); nx = m + 4; ny = h - m - nh2 - 6;
      plate(ctx, nx - 8, ny - S(24), nw2 + 16, nh2 + S(32), 10);
      txt(ctx, 'NITRO', nx, ny - 7, F(11), GOLD, 'left', '700');
      if (P.draft > 0.4) txt(ctx, 'DRAFTING', nx + nw2, ny - 7, F(11), '#9fe0ff', 'right', '700');
      ctx.fillStyle = 'rgba(251,245,236,.14)'; ctx.fillRect(nx, ny, nw2, nh2);
      var gh = ctx.createLinearGradient(nx, 0, nx + nw2, 0); gh.addColorStop(0, '#2f7bff'); gh.addColorStop(1, '#a8e4ff');
      ctx.globalAlpha = flick; ctx.fillStyle = gh; ctx.fillRect(nx, ny, nw2 * nit, nh2); ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(251,245,236,.3)'; ctx.lineWidth = 1; ctx.strokeRect(nx + 0.5, ny + 0.5, nw2 - 1, nh2 - 1);
    }

    // start lights
    if (W.phase === 'countdown') {
      var step = W.cd < 0.6 ? 0 : W.cd < 1.4 ? 1 : W.cd < 2.2 ? 2 : 3, lw = S(206), lh = S(64), lx = (w - lw) / 2, ly = Math.round(h * 0.3);
      plate(ctx, lx, ly, lw, lh, 14);
      for (i = 0; i < 3; i++) {
        var on = step > i, lcx = lx + lw / 2 + (i - 1) * S(58), lcy = ly + lh / 2;
        ctx.beginPath(); ctx.arc(lcx, lcy, S(20), 0, TAU); ctx.fillStyle = on ? '#ff2a20' : '#2a1412'; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(251,245,236,.3)'; ctx.stroke();
        if (on) glow(ctx, lcx, lcy, S(44), '#ff3a2c', 0.8);
      }
      txt(ctx, step === 0 ? 'READY' : 'GET SET', w / 2, ly + lh + F(22), F(15), INK, 'center', '700');
    } else if (W.goT > 0 && !W.attract) {
      var gl = W.goT / 0.9;
      ctx.globalAlpha = Math.min(1, gl * 1.5);
      var lw2 = S(206), lh2 = S(64), lx2 = (w - lw2) / 2, ly2 = Math.round(h * 0.3);
      plate(ctx, lx2, ly2, lw2, lh2, 14);
      for (i = 0; i < 3; i++) { var gx = lx2 + lw2 / 2 + (i - 1) * S(58); ctx.beginPath(); ctx.arc(gx, ly2 + lh2 / 2, S(20), 0, TAU); ctx.fillStyle = '#3dff8a'; ctx.fill(); glow(ctx, gx, ly2 + lh2 / 2, S(44), '#3dff8a', 0.7); }
      ctx.globalAlpha = 1;
    }
    // finish banner
    if (W.bannerT > 0 && W.phase === 'finished') {
      var al = Math.min(1, W.bannerT * 2, (3.2 - W.bannerT) * 4);
      ctx.save(); ctx.globalAlpha = clamp(al, 0, 1);
      txt(ctx, race ? 'FINISH' : 'FINISH', w / 2, Math.round(h * 0.34), F(26), GOLD, 'center', '700');
      ctx.shadowColor = 'rgba(0,0,0,.8)'; ctx.shadowBlur = 24;
      txt(ctx, W.banner, w / 2, Math.round(h * 0.34) + F(74), F(78), INK, 'center', '500', F_DISP);
      ctx.restore();
    }
  }

  /* ------------------------------------------------------ menu and glue */
  var MENU_CSS =
    '.mx-prev{display:grid;grid-template-columns:132px 1fr;gap:14px;align-items:center;margin:2px 0 12px;padding:10px;border:1px solid var(--rule-strong);border-radius:12px;background:var(--bg-deep)}' +
    '.arc-stage .mx-prev canvas{position:static;inset:auto;width:132px;height:84px;display:block;border-radius:8px;background:var(--bg)}' +
    '.mx-stat{display:grid;grid-template-columns:auto 1fr;gap:5px 10px;align-items:center;font-family:var(--font-mono);font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mute)}' +
    '.mx-stat .mx-name{grid-column:1/-1;font-family:var(--font-display);font-size:20px;letter-spacing:0;text-transform:none;color:var(--ink);line-height:1.1}' +
    '.mx-bar{height:6px;border-radius:3px;background:var(--rule);position:relative;overflow:hidden}.mx-bar i{position:absolute;inset:0 auto 0 0;background:var(--accent-warm);border-radius:3px}' +
    '.mx-blurb{grid-column:1/-1;font-family:var(--font-body);font-size:13px;letter-spacing:0;text-transform:none;color:var(--ink-dim);line-height:1.35}' +
    '.mx-laps{display:flex;flex-wrap:wrap;gap:6px 18px;margin:0 0 12px;font-family:var(--font-mono);font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-mute)}' +
    '.mx-laps b{display:block;font-size:15px;color:var(--ink);font-weight:500;letter-spacing:0}' +
    '.mx-res{width:100%;border-collapse:collapse;margin:4px 0 12px;font-size:14px}.mx-res td{padding:7px 8px;border-bottom:1px solid var(--rule);color:var(--ink-dim)}' +
    '.mx-res tr.me td{background:var(--primary-soft);color:var(--ink)}.mx-res td:first-child{font-family:var(--font-mono);color:var(--accent);width:30px}' +
    '.mx-res small{display:block;font-size:11px;color:var(--ink-mute)}.mx-res td:last-child{text-align:right;font-family:var(--font-mono)}' +
    '.arc-seg[data-opt="color"] button::before{content:"";display:inline-block;width:11px;height:11px;border-radius:50%;background:var(--sw);margin-right:7px;vertical-align:-1px;box-shadow:0 0 0 1px rgba(251,245,236,.4)}' +
    '.arc-card:has(.mx-prev) .arc-actions{position:sticky;bottom:0;background:var(--bg-elev);padding:12px 0 2px;margin-top:8px;box-shadow:0 -14px 14px var(--bg-elev);z-index:2}' +
    '.arc-card:has(.mx-prev) p{font-size:14px;margin-bottom:10px}.arc-card:has(.mx-prev) h2{margin:4px 0 8px}' +
    '@media (pointer:fine){.arc-card:has(.mx-prev) .arc-seg button{min-height:34px;padding:0 12px;font-size:13px}.arc-card:has(.mx-prev) .arc-opts{gap:7px;margin-bottom:6px}}' +
    '@media (max-width:420px){.mx-prev{grid-template-columns:110px 1fr;gap:10px}.arc-stage .mx-prev canvas{width:110px;height:70px}}';
  var cssDone = false;
  function injectCss() { if (cssDone) return; cssDone = true; var s = document.createElement('style'); s.textContent = MENU_CSS; document.head.appendChild(s); }

  function drawPreview(cv) {
    var g = cv.getContext('2d'), ch = ARC.choices, T = getTrack(ch.track), pal = T.pal, W = cv.width, H = cv.height, hz = Math.round(H * 0.56), i;
    g.imageSmoothingEnabled = true;
    var sg = g.createLinearGradient(0, 0, 0, hz); for (i = 0; i < pal.sky.length; i += 2) sg.addColorStop(pal.sky[i], pal.sky[i + 1]);
    g.fillStyle = sg; g.fillRect(0, 0, W, hz + 1);
    g.fillStyle = '#fff'; for (i = 0; i < 24; i++) { var s = T.stars[i % T.stars.length]; g.globalAlpha = 0.6; g.fillRect(s[0] * W, s[1] * hz * 0.8, 1.5, 1.5); } g.globalAlpha = 1;
    blit(g, T.moon, hz * 0.62 * pal.moonAt[2] * 0.9, pal.moonAt[0] * W, pal.moonAt[1] * hz * 0.9 + 18, -0.5, -1, null);
    var sc = hz * 0.78 / BGH; g.drawImage(T.bg[1].img, 0, hz - BGH * sc + 1, BGW * sc, BGH * sc);
    g.drawImage(T.bg[2].img, -200 * sc, hz - BGH * sc + 1, BGW * sc, BGH * sc);
    g.fillStyle = pal.ground[pal.ground.length > 1 ? 1 : 0][0]; g.fillRect(0, hz, W, H - hz);
    function tp(c, y0, y1, hw0, hw1) { g.fillStyle = c; g.beginPath(); g.moveTo(W / 2 - hw0, y0); g.lineTo(W / 2 + hw0, y0); g.lineTo(W / 2 + hw1, y1); g.lineTo(W / 2 - hw1, y1); g.closePath(); g.fill(); }
    tp(pal.rumble[0], hz, H, 4, W * 0.7); tp(pal.road[0], hz, H, 3.4, W * 0.62);
    g.fillStyle = pal.lane; for (i = 0; i < 6; i++) { var a = hz + Math.pow(i / 6, 2) * (H - hz), b = hz + Math.pow((i + 0.5) / 6, 2) * (H - hz); g.beginPath(); g.moveTo(W / 2 - 0.5 - i * 0.6, a); g.lineTo(W / 2 + 0.5 + i * 0.6, a); g.lineTo(W / 2 + 0.5 + (i + 0.5) * 0.6 + 1, b); g.lineTo(W / 2 - 0.5 - (i + 0.5) * 0.6 - 1, b); g.closePath(); g.fill(); }
    var fg = g.createLinearGradient(0, hz - 22, 0, hz + 36); fg.addColorStop(0, rgba(pal.fog, 0)); fg.addColorStop(0.45, rgba(pal.fog, 0.85)); fg.addColorStop(1, rgba(pal.fog, 0)); g.fillStyle = fg; g.fillRect(0, hz - 22, W, 58);
    blit(g, carSprite(ch.car, colorHex(ch.color), false, 2), W * 0.5, W / 2, H - 4, -0.5, -1, null);
  }

  function refreshPreview() {
    var card = document.querySelector('.arc-card'); if (!card) return;
    var cv = card.querySelector('.mx-cv'), st = card.querySelector('.mx-stat'); if (!cv || !st) return;
    var ch = ARC.choices, k = KINDS[ch.car] || KINDS.kestrel;
    try { drawPreview(cv); } catch (e) { /* the menu must always open */ }
    function bar(l, v) { return '<span>' + l + '</span><div class="mx-bar"><i style="width:' + Math.round(clamp(v, 0.05, 1) * 100) + '%"></i></div>'; }
    st.innerHTML = '<div class="mx-name">' + ARC.esc(k.name) + '</div>' + bar('Top speed', (k.top - 0.7) / 0.45) + bar('Accel', (k.acc - 0.6) / 0.7) + bar('Grip', (k.grip - 0.6) / 0.7) + '<div class="mx-blurb">' + ARC.esc(k.blurb) + '</div>';
  }

  function menuProps() {
    var bests = TRACK_ORDER.map(function (id) {
      var b = BESTS[id];
      return '<span>' + ARC.esc(PAL[id].name) + '<b>' + (b && b.total != null ? fmtTime(b.total) : 'No time yet') + '</b>' + (b && b.lap != null ? '<small style="color:var(--ink-mute);font-size:11px">best lap ' + fmtTime(b.lap) + '</small>' : '') + '</span>';
    }).join('');
    return {
      eyebrow: 'Street racing', title: 'Midnight <em>Apex</em>', noBest: true,
      html: '<div class="mx-prev"><canvas class="mx-cv" width="264" height="168"></canvas><div class="mx-stat"></div></div>' +
        '<p>Three laps of the night. Draft rivals and brush past traffic to fill the nitro, then burn it on the straights. Lift for the hairpins or the bend throws you wide.</p>' +
        '<div class="mx-laps">' + bests + '</div>',
      options: [
        { id: 'track', label: 'Track', value: 'harbour', choices: TRACK_ORDER.map(function (id) { return { v: id, label: PAL[id].name }; }) },
        { id: 'mode', label: 'Mode', value: 'race', choices: [{ v: 'race', label: 'Race' }, { v: 'time', label: 'Time attack' }] },
        { id: 'car', label: 'Car', value: 'kestrel', choices: PLAYER_KINDS.map(function (id) { return { v: id, label: KINDS[id].name }; }) },
        { id: 'color', label: 'Colour', value: 'ember', choices: COLORS.map(function (c) { return { v: c.id, label: c.name }; }) },
        { id: 'diff', label: 'Difficulty', value: 'pro', choices: [{ v: 'rookie', label: 'Rookie' }, { v: 'pro', label: 'Pro' }, { v: 'legend', label: 'Legend' }] },
        { id: 'auto', label: 'Auto gas', value: ARC.touchMode ? 'on' : 'off', choices: [{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }] }
      ]
    };
  }

  function warmWorld(W) {
    W.racers.forEach(function (c) { carSprite(c.kind, c.hex, false, 1.5); carSprite(c.kind, c.hex, true, 1.5); });
    W.traffic.forEach(function (c) { carSprite(c.kind, c.hex, false, 1); });
    carSprite(W.P.kind, W.P.hex, false, 2); carSprite(W.P.kind, W.P.hex, true, 2);
  }

  var ARC = null, Wd = null, BESTS = {};

  function stopAll() { engineStop(); }

  function debugState() {
    var W = Wd, a = ARC;
    if (!W) return { phase: 'none', state: a.state };
    var P = W.P;
    return {
      state: a.state, phase: W.attract ? 'attract' : W.phase, track: W.cfg.track, mode: W.mode, diff: W.cfg.diff, lap: clamp(P.lapIdx + 1, 1, LAPS), position: positionOf(W, P),
      speed: Math.round(P.speed * KMH), speedRaw: Math.round(P.speed), nitro: Math.round(P.nitro), nitroOn: P.nitroOn, playerX: +P.x.toFixed(3), distance: Math.round(P.dist),
      totalTime: +(P.finished ? P.finT : W.t).toFixed(2), lapTimes: P.lapTimes.map(function (t) { return +t.toFixed(2); }), bestLap: P.bestLap < Infinity ? +P.bestLap.toFixed(2) : null,
      gear: P.gear, rpm: +P.rpm.toFixed(2), drift: +P.drift.toFixed(2), draft: +P.draft.toFixed(2), crashes: P.crashes, nearMisses: P.nearMisses, trackLen: W.T.L,
      rivals: W.rivals.map(function (r) { return { name: r.name, dist: Math.round(r.dist), x: +r.x.toFixed(2), speed: Math.round(r.speed * KMH), pos: positionOf(W, r), finished: r.finished }; }),
      traffic: W.traffic.length, results: W.results
    };
  }

  // helpers for automated play-testing: a bot that drives like a decent player
  var dev = {
    world: function () { return Wd; },
    bot: function (on) { if (Wd) Wd.P.bot = on !== false; },
    ff: function (sec) {
      var W = Wd, n = Math.round(sec * 50), i;
      for (i = 0; i < n && W && ARC.state === 'play'; i++) stepWorld(W, 0.02);
    },
    teleport: function (dist) { if (Wd) { Wd.P.dist = dist; } }
  };
  Arcade.create({
    slug: 'midnight-apex', title: 'Midnight Apex', genre: 'Street racing',
    hint: 'Arrows or WASD to drive. Shift or N for nitro. Esc to pause.',
    keys: [['Left Right / A D', 'Steer'], ['Up / W', 'Gas'], ['Down / S', 'Brake'], ['Shift / N (hold)', 'Nitro'], ['Esc / P', 'Pause']],
    touch: { stick: true, pads: [{ label: 'Gas', key: 'ArrowUp', hot: true, big: true }, { label: 'Brake', key: 'ArrowDown' }, { label: 'Nitro', key: 'KeyN' }] },
    formatScore: fmtTime,
    init: function (a) {
      ARC = a;
      BESTS = a.store.get('midnight-apex.bests', {}) || {};
      var origMenu = a.menu;
      a.menu = function (p) { if (typeof stopAll === 'function') stopAll(); return origMenu(Object.assign(menuProps(), p || {})); };
      a.debug = debugState;
      a.dev = dev;
      a.menu();
    },
    onMenu: function () { injectCss(); stopAll(); var card = document.querySelector('.arc-card'); if (!card) return;
      card.querySelectorAll('.arc-seg[data-opt="color"] button').forEach(function (b) { b.style.setProperty('--sw', colorHex(b.getAttribute('data-v'))); });
      refreshPreview();
      card.querySelectorAll('.arc-seg').forEach(function (seg) { seg.addEventListener('click', function () { setTimeout(refreshPreview, 0); }); });
    },
    start: function (a, ch) {
      dropPlayerSprites();
      Wd = newWorld({ track: ch.track, mode: ch.mode, car: ch.car, color: ch.color, diff: ch.diff, auto: ch.auto, attract: false });
      warmWorld(Wd); engineStart();
      a.toast('Get ready', PAL[ch.track].name, 1800);
    },
    update: function (dt) {
      if (!Wd) return;
      var n = Math.max(1, Math.ceil(dt / 0.02)), k;
      for (k = 0; k < n; k++) stepWorld(Wd, dt / n);
    },
    idle: function (dt, a) {
      if (a.state === 'menu') {
        var c = a.choices, key = c.track + '|' + c.car + '|' + c.color;
        if (!Wd || !Wd.attract || Wd.attractKey !== key) {
          Wd = newWorld({ track: c.track, mode: 'race', car: c.car, color: c.color, diff: 'pro', auto: 'on', attract: true }); Wd.attractKey = key; warmWorld(Wd);
        }
        var n = Math.max(1, Math.ceil(dt / 0.02)), k;
        for (k = 0; k < n; k++) stepWorld(Wd, dt / n);
      }
    },
    render: function (ctx, a) {
      if (!Wd) { ctx.fillStyle = '#060503'; ctx.fillRect(0, 0, a.w, a.h); return; }
      drawWorld(ctx, a, Wd);
      if (a.state !== 'menu') drawHUD(ctx, a, Wd);
    },
    onPause: function () { engineStop(); },
    onResume: function () { if (Wd && !Wd.attract) engineStart(); },
    onOver: function () { engineStop(); }
  });

})();
