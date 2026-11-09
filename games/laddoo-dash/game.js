/*
 * Laddoo Dash, the 2D edition, for browsers without WebGL2. The maze, the
 * rules, the spirits, the controls, the HUD and the sound all come from
 * core.js, exactly as in 3D; this file draws it from above in neon on dark
 * glass, and follows the hero on a tall phone screen.
 */
(function () {
  'use strict';
  import('/games/laddoo-dash/core.js').then(function (M) {
    var SPIRITS = M.SPIRITS, BONUS = M.BONUS, WALL = M.WALL, TAU = M.TAU, clamp = M.clamp;
    var ARC = null, W = 0, H = 0, cache = null, cacheKey = '', cam = { x: 0, y: 0, s: 20, ox: 0, oy: 0, init: false };
    var parts = [], glowC = null, t = 0, last = 0;
    function glowSprite() {
      if (glowC) return glowC;
      glowC = document.createElement('canvas'); glowC.width = glowC.height = 64;
      var g = glowC.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      return glowC;
    }
    function openish(Mz, x, y) { if (y < 0 || y >= Mz.H || x < 0 || x >= Mz.W) return false; return Mz.cells[y * Mz.W + x] !== WALL; }
    // The same outline as the 3D maze: walls sit a margin inside each tile wherever they meet an open tile.
    function buildCache(Mz, s) {
      var m = 0.2, FW = Mz.W * 3, FH = Mz.H * 3, fill = new Uint8Array(FW * FH), S = [[-1, 0], [0], [0, 1]];
      for (var y = 0; y < Mz.H; y++) for (var x = 0; x < Mz.W; x++) {
        if (Mz.cells[y * Mz.W + x] !== WALL) continue;
        for (var j = 0; j < 3; j++) for (var i = 0; i < 3; i++) {
          var open = false;
          S[j].forEach(function (dy) { S[i].forEach(function (dx) { if ((dx || dy) && openish(Mz, x + dx, y + dy)) open = true; }); });
          if (!open) fill[(y * 3 + j) * FW + (x * 3 + i)] = 1;
        }
      }
      var pad = 2, c = document.createElement('canvas');
      c.width = Math.ceil((Mz.W + pad * 2) * s); c.height = Math.ceil((Mz.H + pad * 2) * s);
      var g = c.getContext('2d');
      var edge = function (k) { return Math.floor(k / 3) - 0.5 + [0, m, 1 - m][k % 3]; };
      var ex = function (k) { return ((k >= FW ? Mz.W - 0.5 : edge(k)) + pad + 0.5) * s; }, ez = function (k) { return ((k >= FH ? Mz.H - 0.5 : edge(k)) + pad + 0.5) * s; };
      // floor: smoked glass with seams
      g.fillStyle = Mz.floor; g.fillRect(0, 0, c.width, c.height);
      g.fillStyle = 'rgba(255,255,255,0.03)';
      for (var gy = 0; gy < Mz.H + pad * 2; gy++) for (var gx = 0; gx < Mz.W + pad * 2; gx++) if ((gx + gy) % 2) g.fillRect(gx * s, gy * s, s, s);
      var f = function (i, j) { return i < 0 || j < 0 || i >= FW || j >= FH ? 0 : fill[j * FW + i]; };
      // slabs
      var grd = g.createLinearGradient(0, 0, 0, c.height); grd.addColorStop(0, Mz.glass); grd.addColorStop(1, '#05030a');
      g.fillStyle = grd;
      for (var jj = 0; jj < FH; jj++) for (var ii = 0; ii < FW; ii++) if (fill[jj * FW + ii]) g.fillRect(ex(ii), ez(jj), ex(ii + 1) - ex(ii) + 0.6, ez(jj + 1) - ez(jj) + 0.6);
      // neon edges, glowing
      var segs = [];
      for (var b = 0; b < FH; b++) for (var a = 0; a < FW; a++) {
        if (!f(a, b)) continue;
        if (!f(a, b + 1)) segs.push([ex(a), ez(b + 1), ex(a + 1), ez(b + 1)]);
        if (!f(a, b - 1)) segs.push([ex(a), ez(b), ex(a + 1), ez(b)]);
        if (!f(a + 1, b)) segs.push([ex(a + 1), ez(b), ex(a + 1), ez(b + 1)]);
        if (!f(a - 1, b)) segs.push([ex(a), ez(b), ex(a), ez(b + 1)]);
      }
      [[Math.max(6, s * 0.5), 0.5, 3], [Math.max(3, s * 0.18), 1, 1.6], [0, 1, 1]].forEach(function (L, k) {
        g.save(); g.strokeStyle = k === 2 ? '#ffffff' : Mz.neon; g.globalAlpha = k === 2 ? 0.55 : L[1]; g.lineWidth = Math.max(1, s * 0.06 * L[2]); g.lineCap = 'round';
        g.shadowColor = Mz.neon; g.shadowBlur = L[0];
        g.beginPath(); segs.forEach(function (q) { g.moveTo(q[0], q[1]); g.lineTo(q[2], q[3]); }); g.stroke(); g.restore();
      });
      // the house door
      g.fillStyle = '#ff8ad8'; g.shadowColor = '#ff8ad8'; g.shadowBlur = 8;
      g.fillRect((Mz.door.x + pad) * s, (Mz.door.y + pad + 0.42) * s, s, s * 0.16); g.shadowBlur = 0;
      return { c: c, pad: pad, s: s };
    }
    function emit(x, y, vx, vy, life, size, col) { if (parts.length > 400) parts.shift(); parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, col: col }); }
    function burst(x, y, n, sp, cols, life) { for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.8); emit(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + Math.random() * 0.6), 0.08 + Math.random() * 0.1, cols[i % cols.length]); } }
    function sx(x) { return (x - cam.x) * cam.s + W / 2; }
    function sy(y) { return (y - cam.y) * cam.s + H / 2 + cam.oy; }
    function fitCam(a, G) {
      var Mz = G.M, top = 74, bot = a.touchMode ? 64 : 44, port = H > W * 1.15;
      var s = Math.min((W - 12) / (Mz.W + 0.6), (H - top - bot) / (Mz.H + 0.6));
      if (port) s = Math.max(s, Math.min(W / 15.8, (H - top - bot) / (Mz.H + 0.6)));
      cam.s = s; cam.oy = (top - bot) / 2;
      var hx = G.pose.hero.x, hy = G.pose.hero.y;
      var vw = W / s, vh = (H - top - bot) / s;
      var tx = vw >= Mz.W + 0.6 ? (Mz.W - 1) / 2 : clamp(hx, (vw / 2) - 0.8, Mz.W - 1 - vw / 2 + 0.8);
      var ty = vh >= Mz.H + 0.6 ? (Mz.H - 1) / 2 : clamp(hy, vh / 2 - 0.8, Mz.H - 1 - vh / 2 + 0.8);
      var k = cam.init ? 0.12 : 1; cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.init = true;
    }
    function drawHero(g, x, y, ang, mouth, scale, spin) {
      var r = 0.42 * cam.s * scale; if (r < 0.5) return;
      var dir = Math.atan2(Math.cos(ang), Math.sin(ang)) + spin;
      g.save(); g.translate(x, y); g.rotate(dir); if (Math.cos(dir) < -0.1) g.scale(1, -1);
      var m = 0.06 + mouth * 0.75;
      var gr = g.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r); gr.addColorStop(0, '#fff2a6'); gr.addColorStop(0.55, '#ffc928'); gr.addColorStop(1, '#e08a0a');
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, m, TAU - m); g.closePath(); g.fill();
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(r * 0.22, -r * 0.45, r * 0.18, 0, TAU); g.fill();
      g.fillStyle = '#1a1028'; g.beginPath(); g.arc(r * 0.3, -r * 0.45, r * 0.09, 0, TAU); g.fill();
      g.restore();
    }
    function drawSpirit(g, x, y, i, dir, fright, flash, eyes, time) {
      var r = 0.42 * cam.s;
      if (!eyes) {
        var col = fright ? (flash ? '#e8ecff' : '#2a3cff') : SPIRITS[i].col;
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; g.drawImage(glowSprite(), x - r * 2, y - r * 2, r * 4, r * 4); g.restore();
        g.fillStyle = col; g.beginPath(); g.arc(x, y - r * 0.15, r, Math.PI, 0);
        var n = 4, w = (r * 2) / n, base = y + r * 0.85;
        g.lineTo(x + r, base);
        for (var k = 0; k < n; k++) { var x0 = x + r - k * w, ph = Math.sin(time * 9 + k + i) * r * 0.12; g.quadraticCurveTo(x0 - w / 2, base - r * 0.32 + ph, x0 - w, base); }
        g.closePath(); g.fill();
      }
      if (fright && !eyes) {
        g.fillStyle = '#ffd0d0'; g.beginPath(); g.arc(x - r * 0.32, y - r * 0.25, r * 0.12, 0, TAU); g.arc(x + r * 0.32, y - r * 0.25, r * 0.12, 0, TAU); g.fill();
        return;
      }
      var lx = [0, -1, 0, 1][dir] * r * 0.12, ly = [-1, 0, 1, 0][dir] * r * 0.12;
      for (var s = -1; s <= 1; s += 2) {
        g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(x + s * r * 0.36 + lx * 0.4, y - r * 0.25 + ly * 0.4, r * 0.26, r * 0.32, 0, 0, TAU); g.fill();
        g.fillStyle = '#1d36ff'; g.beginPath(); g.arc(x + s * r * 0.36 + lx, y - r * 0.25 + ly, r * 0.14, 0, TAU); g.fill();
      }
    }
    function drawTreat(g, x, y, k, time) {
      var r = 0.36 * cam.s, b = Math.sin(time * 3) * r * 0.1;
      g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.drawImage(glowSprite(), x - r * 2, y - r * 2, r * 4, r * 4); g.restore();
      g.fillStyle = BONUS[k].col;
      g.beginPath();
      if (k === 0) { g.moveTo(x, y - r + b); g.lineTo(x + r, y + r * 0.7 + b); g.lineTo(x - r, y + r * 0.7 + b); }
      else if (k === 1) g.ellipse(x, y + b, r * 0.75, r, 0.3, 0, TAU);
      else if (k === 2) { g.moveTo(x - r * 0.6, y - r * 0.6 + b); g.lineTo(x + r * 0.6, y - r * 0.6 + b); g.lineTo(x + r * 0.45, y + r * 0.7 + b); g.lineTo(x - r * 0.45, y + r * 0.7 + b); }
      else if (k === 3) { g.moveTo(x - r * 0.45, y - r * 0.7 + b); g.lineTo(x + r * 0.45, y - r * 0.7 + b); g.lineTo(x, y + r + b); }
      else { g.moveTo(x, y - r + b); g.lineTo(x + r, y + b); g.lineTo(x, y + r + b); g.lineTo(x - r, y + b); }
      g.closePath(); g.fill();
    }
    var view = {
      name: '2d', three: false,
      init: function (a) { ARC = a; return true; },
      resize: function () { cacheKey = ''; },
      setMaze: function () { cacheKey = ''; cam.init = false; },
      newGame: function () { cacheKey = ''; cam.init = false; parts.length = 0; },
      render: function (a, G, g) {
        W = a.w; H = a.h;
        var now = performance.now(), dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60; last = now;
        if (a.state !== 'pause') t += dt;
        var Mz = G.M;
        g.fillStyle = '#06040c'; g.fillRect(0, 0, W, H);
        if (G.phase === 'cut') { renderCut(a, G, g); return true; }
        fitCam(a, G);
        var key = Mz.id + ':' + cam.s.toFixed(2);
        if (key !== cacheKey) { cache = buildCache(Mz, cam.s); cacheKey = key; }
        var flashOn = G.phase === 'clear' && G.pt > 0.5 && !a.reducedMotion && ((G.pt * 6) | 0) % 2 === 0;
        g.save();
        if (a.shakeX || a.shakeY) g.translate(a.shakeX, a.shakeY);
        g.drawImage(cache.c, sx(-cache.pad - 0.5), sy(-cache.pad - 0.5));
        if (flashOn) { g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.drawImage(cache.c, sx(-cache.pad - 0.5), sy(-cache.pad - 0.5)); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; }
        // laddoos and jalebis
        for (var y = 0; y < Mz.H; y++) for (var x = 0; x < Mz.W; x++) {
          var p = G.pel[y * Mz.W + x]; if (!p) continue;
          var px = sx(x), py = sy(y);
          if (px < -20 || px > W + 20 || py < -20 || py > H + 20) continue;
          if (p === 1) { g.fillStyle = '#f39a2a'; g.beginPath(); g.arc(px, py, Math.max(1.5, cam.s * 0.11), 0, TAU); g.fill(); }
          else {
            var pr = cam.s * (0.26 + 0.03 * Math.sin(t * 6 + x));
            g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.6; g.drawImage(glowSprite(), px - pr * 2.2, py - pr * 2.2, pr * 4.4, pr * 4.4); g.restore();
            g.strokeStyle = '#ffb428'; g.lineWidth = Math.max(1.5, cam.s * 0.07); g.beginPath();
            for (var k = 0; k <= 30; k++) { var u = k / 30, an = u * 2.4 * TAU + t * 2, rr = pr * (0.15 + u * 0.85); if (k) g.lineTo(px + Math.cos(an) * rr, py + Math.sin(an) * rr); else g.moveTo(px + Math.cos(an) * rr, py + Math.sin(an) * rr); }
            g.stroke();
          }
        }
        if (G.fruit.on && !(G.fruit.t < 2 && ((G.fruit.t * 6) | 0) % 2 === 0)) drawTreat(g, sx(Mz.bonus.x), sy(Mz.bonus.y), G.fruit.kind, t);
        var P = G.pose;
        for (var i = 0; i < 4; i++) { var S = P.sp[i]; if (S.vis) drawSpirit(g, sx(S.x), sy(S.y), i, S.dir, S.fright, S.flash, S.eyes, t); }
        var Hp = P.hero;
        if (Hp.vis) {
          g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35; var gr2 = cam.s * 1.2; g.drawImage(glowSprite(), sx(Hp.x) - gr2, sy(Hp.y) - gr2, gr2 * 2, gr2 * 2); g.restore();
          drawHero(g, sx(Hp.x), sy(Hp.y), Hp.ang, Hp.mouth, Hp.scale, Hp.spin);
        }
        stepParts(g, dt, a.state === 'pause');
        g.restore();
        var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.5)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
        return true;
      },
      project: function (x, y, h, out) { out.x = sx(x); out.y = sy(y) - h * cam.s * 0.3; out.on = true; return true; },
      fx: function (type, d, G) {
        var x = d.x, y = d.y;
        if (type === 'eat') { if (d.kind === 2) burst(x, y, 30, 5, ['#ffd23a', '#ffaa22', '#ffffff'], 0.7); else burst(x, y, 4, 1.6, ['#ffc04a', '#fff0b0'], 0.3); }
        else if (type === 'spirit') burst(x, y, 30, 6, [SPIRITS[d.i].col, '#ffffff'], 0.7);
        else if (type === 'death') burst(x, y, 50, 4, ['#ffd65a', '#ffffff'], 1.3);
        else if (type === 'fruit') burst(x, y, 24, 4, [BONUS[d.kind].col, '#ffffff'], 0.8);
        else if (type === 'clear') { for (var i = 0; i < 80; i++) emit(Math.random() * G.M.W, Math.random() * G.M.H, (Math.random() - 0.5) * 3, -2 - Math.random() * 3, 1.8, 0.12, [G.M.neon, G.M.neon2, '#ffffff'][i % 3]); }
      },
      graphics: function () {},
      debug: function () { return { quality: 0, fps: 0, soft: true, post: false, mode2d: true }; },
      dev: { quality: function () {} }
    };
    function stepParts(g, dt, pause) {
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        if (!pause) { p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } var dr = Math.exp(-1.6 * dt); p.vx *= dr; p.vy *= dr; p.vy += 2 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        g.globalAlpha = clamp(p.life / p.max * 2, 0, 1); g.fillStyle = p.col;
        g.beginPath(); g.arc(sx(p.x), sy(p.y), Math.max(1, p.size * cam.s), 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
    function renderCut(a, G, g) {
      var C = G.cut, s = Math.min(W / 26, H / 14);
      cam.s = s; var cy = H * 0.58;
      g.fillStyle = '#160a24'; g.fillRect(0, cy - s * 0.2, W, s * 1.7);
      g.strokeStyle = '#ff3d8b'; g.lineWidth = 2; g.shadowColor = '#ff3d8b'; g.shadowBlur = 10;
      g.beginPath(); g.moveTo(0, cy - s * 0.2); g.lineTo(W, cy - s * 0.2); g.moveTo(0, cy + s * 1.5); g.lineTo(W, cy + s * 1.5); g.stroke(); g.shadowBlur = 0;
      var X = function (x) { return W / 2 + x * s; };
      for (var i = 0; i < 4; i++) { var S = C.sp[i]; if (!S.vis) continue; drawSpirit(g, X(S.x), cy + s * 0.5 - S.y * s, i, S.dir, S.fright, S.flash, false, t); }
      if (C.laddoo.vis) { g.fillStyle = '#f39a2a'; g.beginPath(); g.arc(X(C.laddoo.x), cy + s * 0.8, s * 0.2, 0, TAU); g.fill(); }
      if (C.jalebi.vis) { g.strokeStyle = '#ffb428'; g.lineWidth = 3; g.beginPath(); g.arc(X(C.jalebi.x), cy + s * 0.2 - C.jalebi.y * s, s * 0.6, 0, TAU * 0.9); g.stroke(); }
      var Hh = C.hero;
      if (Hh.vis) drawHero(g, X(Hh.x), cy + s * 0.5 - Hh.y * s - (Hh.scale - 1) * s * 0.4, Hh.dir === 1 ? -Math.PI / 2 : Math.PI / 2, Math.abs(Math.sin(Hh.chomp)), Hh.scale, 0);
    }
    M.boot(view);
  }).catch(function (e) { console.warn(e); });
})();
