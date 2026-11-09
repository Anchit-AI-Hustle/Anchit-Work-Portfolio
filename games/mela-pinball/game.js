/*
 * Mela Pinball, the 2D edition, for browsers without WebGL2. The table, its
 * physics, rules, controls, sound and dot matrix display come from core.js,
 * exactly as in 3D; this file only draws the playfield from above, with the
 * display across the top of the screen.
 */
(function () {
  'use strict';
  import('/games/mela-pinball/core.js').then(function (M) {
    var T = M.TABLE, BR = M.BR, DMD = M.DMD, TAU = M.TAU, clamp = M.clamp, lerp = M.lerp;
    var W = 0, H = 0, S = 1, OX = 0, OY = 0, DH = 0, DW = 0, DX = 0;
    var bg = null, bgKey = '', dmdCv = null, dmdCtx = null, dmdImg = null, dmdVer = -1, mask = null;
    var parts = [], lastNow = 0;
    var X0 = -23.6, X1 = 26.6, Y0 = -7, Y1 = 101.5;
    function sx(x) { return OX + (x - X0) * S; }
    function sy(y) { return OY + (Y1 - y) * S; }
    function layout(a) {
      W = a.w; H = a.h;
      DH = Math.round(clamp(W / 5.2, 44, 92)); DW = DH * 4; if (DW > W - 16) { DW = W - 16; DH = DW / 4; }
      DX = (W - DW) / 2;
      var top = DH + 14, avail = H - top - 8;
      S = Math.min((W - 12) / (X1 - X0), avail / (Y1 - Y0));
      OX = (W - (X1 - X0) * S) / 2; OY = top + (avail - (Y1 - Y0) * S) / 2;
    }
    function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    // everything that never moves, painted once per size
    function paintStatic(a) {
      var key = W + 'x' + H + '@' + a.dpr;
      if (bg && bgKey === key) return;
      bgKey = key;
      bg = document.createElement('canvas'); bg.width = Math.round(W * a.dpr); bg.height = Math.round(H * a.dpr);
      var g = bg.getContext('2d'); g.setTransform(a.dpr, 0, 0, a.dpr, 0, 0);
      var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#0b0716'); gr.addColorStop(1, '#1a0a1e'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // cabinet
      g.fillStyle = '#3d1a36'; rr(g, sx(-25.6), sy(104), (51.9 + 2) * S, 113 * S, 14 * S / 8); g.fill();
      // playfield
      var pf = g.createLinearGradient(0, sy(100), 0, sy(-6)); pf.addColorStop(0, '#0d0a2c'); pf.addColorStop(0.5, '#1c0f3d'); pf.addColorStop(1, '#3d0f2c');
      g.fillStyle = pf; g.beginPath();
      T.outline.forEach(function (p, i) { if (i) g.lineTo(sx(p[0]), sy(p[1])); else g.moveTo(sx(p[0]), sy(p[1])); });
      g.closePath(); g.fill();
      // rangoli under the bumpers
      var cx = sx(1), cy = sy(66);
      for (var ring = 0; ring < 6; ring++) {
        g.strokeStyle = ring % 2 ? 'rgba(255,183,54,0.35)' : 'rgba(255,79,160,0.3)'; g.lineWidth = 1.2;
        g.beginPath(); g.arc(cx, cy, (5 + ring * 4.3) * S, 0, TAU); g.stroke();
      }
      // ramp band
      g.strokeStyle = 'rgba(255,122,58,0.32)'; g.lineWidth = 4.2 * S; g.lineCap = 'round'; g.beginPath();
      var R = T.ramp; for (var i = 0; i < R.n; i++) { if (i) g.lineTo(sx(R.x[i]), sy(R.y[i])); else g.moveTo(sx(R.x[i]), sy(R.y[i])); } g.stroke();
      g.strokeStyle = 'rgba(255,200,150,0.5)'; g.lineWidth = 1; g.stroke();
      // shooter lane wood
      g.fillStyle = '#6b4a2c'; g.fillRect(sx(T.LANE[0]), sy(84), (T.LANE[1] - T.LANE[0]) * S, (84 + 4) * S);
      // walls
      g.lineCap = 'round';
      T.segs.forEach(function (s) {
        if (s.kind === 'target' || s.kind === 'gate') return;
        g.strokeStyle = s.mat === 'wood' ? '#e8c27a' : s.mat === 'metal' ? '#cfd3dc' : s.mat === 'sling' ? '#f2f2f2' : s.mat === 'ramp' ? '#ff7a3a' : '#ffd6f0';
        g.lineWidth = Math.max(1.5, (s.mat === 'wood' ? 0.9 : Math.max(0.35, s.r * 2)) * S);
        g.beginPath(); g.moveTo(sx(s.ax), sy(s.ay)); g.lineTo(sx(s.bx), sy(s.by)); g.stroke();
      });
      // slingshot plastics
      T.slings.forEach(function (sl) { g.fillStyle = sl.side ? 'rgba(47,224,200,0.55)' : 'rgba(255,79,160,0.55)'; g.beginPath(); g.moveTo(sx(sl.a[0]), sy(sl.a[1])); g.lineTo(sx(sl.b[0]), sy(sl.b[1])); g.lineTo(sx(sl.c[0]), sy(sl.c[1])); g.closePath(); g.fill(); });
      T.circs.forEach(function (c) { if (c.kind === 'bumper') return; g.fillStyle = c.mat === 'rubber' ? '#e83a5a' : '#dfe2ea'; g.beginPath(); g.arc(sx(c.x), sy(c.y), Math.max(1.5, c.r * S), 0, TAU); g.fill(); });
      // lamp sockets and labels
      T.lamps.forEach(function (lp) { g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(sx(lp.x), sy(lp.y), (lp.shape === 2 ? 0.8 : 1.2) * lp.size * S, 0, TAU); g.fill(); });
      g.font = '800 ' + Math.max(8, Math.round(2.6 * S)) + 'px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      T.laneX.forEach(function (x, i) { g.fillStyle = ['#ff7cc0', '#ffc35a', '#6ff0dc', '#b39bff'][i]; g.fillText('MELA'[i], sx(x), sy(81.6)); });
      g.font = '900 ' + Math.max(10, Math.round(3.4 * S)) + 'px Georgia, serif'; g.fillStyle = '#ffb02e'; g.fillText('MELA', sx(0), sy(36));
      // apron
      g.fillStyle = '#4a1444'; g.beginPath(); g.moveTo(sx(-22.2), sy(6)); g.lineTo(sx(-9.6), sy(6)); g.lineTo(sx(-6.5), sy(1.2)); g.lineTo(sx(6.5), sy(1.2)); g.lineTo(sx(9.6), sy(6)); g.lineTo(sx(22), sy(6)); g.lineTo(sx(22), sy(-6.5)); g.lineTo(sx(-22.2), sy(-6.5)); g.closePath(); g.fill();
      // toys at the back: a ferris wheel and a carousel in outline
      g.strokeStyle = 'rgba(255,210,140,0.45)'; g.lineWidth = 1; g.beginPath(); g.arc(sx(-15.5), sy(104) + 2, 6 * S, Math.PI, TAU); g.stroke();
      // the DMD bezel
      g.fillStyle = '#0c0a10'; rr(g, DX - 6, 4, DW + 12, DH + 6, 6); g.fill();
    }
    function drawDMD(ctx) {
      if (!dmdCv) {
        dmdCv = document.createElement('canvas'); dmdCv.width = 128; dmdCv.height = 32; dmdCtx = dmdCv.getContext('2d'); dmdImg = dmdCtx.createImageData(128, 32);
      }
      if (dmdVer !== DMD.ver) {
        dmdVer = DMD.ver;
        var d = dmdImg.data, b = DMD.buf;
        for (var i = 0; i < 4096; i++) { var v = b[i] / 255; d[i * 4] = 24 + v * 231; d[i * 4 + 1] = 9 + v * 145; d[i * 4 + 2] = 5 + v * 37; d[i * 4 + 3] = 255; }
        dmdCtx.putImageData(dmdImg, 0, 0);
      }
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(dmdCv, DX, 7, DW, DH);
      ctx.imageSmoothingEnabled = true;
      // round dots: a grid mask over the pixels
      if (!mask || mask.w !== DW) {
        var c = document.createElement('canvas'); c.width = Math.ceil(DW); c.height = Math.ceil(DH); var g = c.getContext('2d');
        var p = DW / 128; g.fillStyle = '#0c0a10'; g.fillRect(0, 0, c.width, c.height); g.globalCompositeOperation = 'destination-out';
        for (var y = 0; y < 32; y++) for (var x = 0; x < 128; x++) { g.beginPath(); g.arc((x + 0.5) * p, (y + 0.5) * p, p * 0.42, 0, TAU); g.fill(); }
        mask = { c: c, w: DW };
      }
      ctx.drawImage(mask.c, DX, 7);
    }
    function burst(x, y, n, sp, cols) { for (var i = 0; i < n; i++) { if (parts.length > 260) parts.shift(); var a = Math.random() * TAU, s = sp * (0.3 + Math.random()); parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, max: 0.9, col: cols[i % cols.length] }); } }
    function capsule(ctx, f, th, col, w) {
      var d = f.def, c = Math.cos(th), s = Math.sin(th), dx = d.side * c, dy = s;
      var px = sx(d.px), py = sy(d.py), tx = sx(d.px + dx * d.len), ty = sy(d.py + dy * d.len);
      ctx.strokeStyle = col; ctx.lineCap = 'round';
      ctx.lineWidth = (d.rb + d.rt) * S * w; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.lineWidth = d.rb * 2 * S * w; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + (tx - px) * 0.1, py + (ty - py) * 0.1); ctx.stroke();
    }
    var view = {
      three: false,
      get hudScore() { return false; },
      get hudTop() { return DH + 6; },
      init: function (a) { layout(a); return true; },
      resize: function (a) { layout(a); bg = null; },
      newGame: function () { parts.length = 0; },
      moment: function () {},
      render: function (a, Wd, ctx) {
        var now = performance.now(), dt = lastNow ? Math.min(0.1, (now - lastNow) / 1000) : 1 / 60; lastNow = now;
        if (W !== a.w || H !== a.h) { layout(a); bg = null; }
        paintStatic(a);
        ctx.drawImage(bg, 0, 0, W, H);
        var al = Wd.alpha;
        // events into sparks
        for (var e = 0; e < Wd.ev.length; e++) { var ev = Wd.ev[e]; if (ev.type === 'bumper') burst(ev.x, ev.y, 10, 30, ['#ffd36a', '#ff8a2a']); else if (ev.type === 'sling') burst(ev.x, ev.y, 6, 24, ['#fff', '#ff4fa0']); else if (ev.type === 'jackpot' || ev.type === 'super' || ev.type === 'multiball') burst(ev.x, ev.y, 50, 40, ['#ffd36a', '#ff4fa0', '#2fe0c8', '#fff']); else if (ev.type === 'target') burst(ev.x, ev.y, 8, 20, ['#ffcf4a']); }
        Wd.ev.length = 0;
        // lamps
        var V = Wd.lampV;
        for (var i = 0; i < T.lamps.length; i++) {
          var lp = T.lamps[i], v = V[i], r = (lp.shape === 2 ? 0.75 : 1.1) * lp.size * S;
          ctx.globalAlpha = 0.18 + v * 0.82; ctx.fillStyle = lp.col;
          if (lp.shape === 1) { ctx.save(); ctx.translate(sx(lp.x), sy(lp.y)); ctx.rotate(-lp.rot); ctx.beginPath(); ctx.moveTo(r * 1.4, 0); ctx.lineTo(-r * 0.9, r * 0.9); ctx.lineTo(-r * 0.9, -r * 0.9); ctx.closePath(); ctx.fill(); ctx.restore(); }
          else { ctx.beginPath(); ctx.arc(sx(lp.x), sy(lp.y), r, 0, TAU); ctx.fill(); }
          if (v > 0.6) { ctx.globalAlpha = (v - 0.6) * 0.5; ctx.beginPath(); ctx.arc(sx(lp.x), sy(lp.y), r * 2.4, 0, TAU); ctx.fill(); }
        }
        ctx.globalAlpha = 1;
        // bumpers
        for (var b = 0; b < T.bumpers.length; b++) {
          var B = T.bumpers[b], st = Wd.bump[b];
          var gx = ctx.createRadialGradient(sx(B.x), sy(B.y), 1, sx(B.x), sy(B.y), B.r * S);
          gx.addColorStop(0, '#fff7d8'); gx.addColorStop(0.5, st.flash > 0.1 ? '#ffe08a' : '#ffb02e'); gx.addColorStop(1, '#a8203a');
          ctx.fillStyle = gx; ctx.beginPath(); ctx.arc(sx(B.x), sy(B.y), B.r * S * (1 + st.ring * 0.08), 0, TAU); ctx.fill();
          ctx.strokeStyle = '#e8eaf0'; ctx.lineWidth = 1.5; ctx.stroke();
        }
        // targets
        for (var k = 0; k < T.targets.length; k++) { var tg = T.targets[k]; if (Wd.tgt[k].down) continue; ctx.strokeStyle = '#ffcf4a'; ctx.lineWidth = Math.max(2, 0.7 * S); ctx.beginPath(); ctx.moveTo(sx(tg.x), sy(tg.y0)); ctx.lineTo(sx(tg.x), sy(tg.y1)); ctx.stroke(); }
        // spinner and gates
        var sp = T.spinner, sw = Math.abs(Math.cos(lerp(Wd.spin.pa, Wd.spin.a, al)));
        ctx.strokeStyle = '#e9e2d0'; ctx.lineWidth = Math.max(1.5, (0.3 + sw * 1.4) * S); ctx.beginPath(); ctx.moveTo(sx(sp.x0 + 0.3), sy(sp.y)); ctx.lineTo(sx(sp.x1 - 0.3), sy(sp.y)); ctx.stroke();
        T.gates.forEach(function (s, gi) { ctx.strokeStyle = 'rgba(214,218,226,' + (0.9 - Math.min(0.7, Wd.gates[gi].a)) + ')'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(sx(s.ax), sy(s.ay)); ctx.lineTo(sx(s.bx), sy(s.by)); ctx.stroke(); });
        // flippers
        for (var f = 0; f < 2; f++) { var F = Wd.fl[f], th = lerp(F.pth, F.th, al); capsule(ctx, F, th, '#e0233f', 1.12); capsule(ctx, F, th, '#fbf3e4', 0.92); }
        // plunger
        var pull = lerp(Wd.plunger.ppull, Wd.plunger.pull, al);
        ctx.fillStyle = '#e8243f'; ctx.fillRect(sx(23.0), sy(4.25 - pull * 2.8), 1.3 * S, (4.25 + 6) * S * 0.3);
        // balls
        for (var q = 0; q < Wd.balls.length; q++) {
          var o = Wd.balls[q]; if (!o.on) continue;
          var x = lerp(o.px, o.x, al), y = lerp(o.py, o.y, al), z = lerp(o.pz, o.z, al);
          var rad = BR * S * (1 + z * 0.04), cxp = sx(x), cyp = sy(y) - z * S * 0.25;
          ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.arc(sx(x) + 2, sy(y) + 2, BR * S, 0, TAU); ctx.fill();
          var bgd = ctx.createRadialGradient(cxp - rad * 0.4, cyp - rad * 0.4, rad * 0.1, cxp, cyp, rad);
          bgd.addColorStop(0, '#ffffff'); bgd.addColorStop(0.4, '#c8ccd8'); bgd.addColorStop(1, '#4a4e5c');
          ctx.fillStyle = bgd; ctx.beginPath(); ctx.arc(cxp, cyp, rad, 0, TAU); ctx.fill();
        }
        // sparks
        for (var p = parts.length - 1; p >= 0; p--) {
          var pt = parts[p]; pt.life -= dt; if (pt.life <= 0) { parts.splice(p, 1); continue; }
          pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vx *= 0.96; pt.vy *= 0.96;
          ctx.globalAlpha = clamp(pt.life / 0.5, 0, 1); ctx.fillStyle = pt.col; ctx.fillRect(sx(pt.x) - 1.5, sy(pt.y) - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;
        drawDMD(ctx);
        return true;
      },
      project: function (x, y, z, out) { out.x = sx(x); out.y = sy(y) - z * S * 0.25; out.on = true; return true; },
      info: function () { return { renderer: '2d' }; },
    };
    M.boot(view);
  });
})();
