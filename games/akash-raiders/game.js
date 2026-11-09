/*
 * Akash Raiders, the 2D edition, for browsers without WebGL2. The rules,
 * waves, controls, HUD and sound all come from core.js, exactly as in 3D;
 * this file only paints the night sky, the city and every raider with the
 * 2D canvas, using the same field the 3D camera frames.
 */
(function () {
  'use strict';
  import('/games/akash-raiders/core.js').then(function (M) {
    var XW = M.XW, PY = M.PY, BAR = M.BAR, TAU = M.TAU, clamp = M.clamp, lerp = M.lerp, KITE = M.KITE, BUG = M.BUG, MOTH = M.MOTH, DUAL_DX = M.DUAL_DX;
    var ARC = null, W = 0, H = 0, S = 20, CX = 0, Y0 = 0, bg = null, city = null, stars = [], parts = [], rings = [], t = 0;
    var KITE_COL = ['#ff8a3d', '#ff5fa2', '#3fd6c6', '#ffd23f'];
    function sx(x) { return CX + x * S; }
    function sy(y) { return Y0 - y * S; }
    function layout(a) {
      W = a.w; H = a.h;
      var pad = a.hudPad(), top = 64, bot = pad.bottom + 40;
      S = Math.min(W / 21.4, (H - top - bot) / 32.4);
      CX = W / 2; Y0 = H - bot - 1.2 * S;
      view.pxPerUnit = S; view.fieldCx = CX;
      // sky and nebula, painted once per size
      bg = document.createElement('canvas'); bg.width = Math.max(1, W); bg.height = Math.max(1, H);
      var g = bg.getContext('2d');
      var gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#05041a'); gr.addColorStop(0.55, '#1d0f3d'); gr.addColorStop(0.85, '#5a1f5c'); gr.addColorStop(1, '#ff7a4a');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      var r = 7;
      for (var i = 0; i < 26; i++) {
        r = (r * 16807) % 2147483647; var u = r / 2147483647; r = (r * 16807) % 2147483647; var v = r / 2147483647;
        var x = u * W, y = v * H * 0.75, rad = (60 + (i % 5) * 40) * Math.max(1, W / 600);
        var ng = g.createRadialGradient(x, y, 0, x, y, rad);
        ng.addColorStop(0, i % 3 ? 'rgba(80,40,160,0.16)' : 'rgba(40,190,200,0.12)'); ng.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = ng; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      }
      var mx = W * 0.78, my = H * 0.16, mr = Math.max(18, Math.min(W, H) * 0.05);
      var mg = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 3); mg.addColorStop(0, 'rgba(255,240,210,0.35)'); mg.addColorStop(1, 'rgba(255,240,210,0)');
      g.fillStyle = mg; g.fillRect(mx - mr * 3, my - mr * 3, mr * 6, mr * 6);
      g.fillStyle = '#fff3dc'; g.beginPath(); g.arc(mx, my, mr, 0, TAU); g.fill();
      g.fillStyle = 'rgba(200,180,150,0.35)'; g.beginPath(); g.arc(mx - mr * 0.3, my - mr * 0.2, mr * 0.22, 0, TAU); g.arc(mx + mr * 0.35, my + mr * 0.3, mr * 0.15, 0, TAU); g.fill();
      // the city: two rows of towers with lit windows, domes and a temple spire
      city = document.createElement('canvas'); city.width = Math.max(1, W); city.height = Math.max(1, H);
      var c = city.getContext('2d'), base = sy(-0.2);
      // roofs stay under the rocket's flight line: the back row just below it, the front row lower still
      [{ col: '#1b1233', lit: 0.25, t0: 0.6, t1: -1.6, w0: 1.0, w1: 2.4 }, { col: '#0d0a1a', lit: 0.45, t0: -0.6, t1: -3.4, w0: 1.4, w1: 3.2 }].forEach(function (L, li) {
        var x = -W * 0.05;
        while (x < W * 1.05) {
          r = (r * 16807) % 2147483647; var q = r / 2147483647; r = (r * 16807) % 2147483647; var q2 = r / 2147483647;
          var bw = (L.w0 + q * (L.w1 - L.w0)) * S, top = sy(L.t0 + q2 * (L.t1 - L.t0)), bh = H - top;
          c.fillStyle = L.col; c.fillRect(x, top, bw - 2, H - top);
          if (q > 0.82) { c.beginPath(); c.arc(x + bw / 2, top, bw * 0.38, Math.PI, 0); c.fill(); }
          if (q2 > 0.9) { c.beginPath(); c.moveTo(x + bw * 0.3, top); c.lineTo(x + bw / 2 - 1, top - bh * 0.5); c.lineTo(x + bw * 0.7, top); c.fill(); }
          var ws = Math.max(2, S * 0.18);
          for (var wy = top + ws * 1.4; wy < H; wy += ws * 2.2) for (var wx = x + ws; wx < x + bw - ws * 1.5; wx += ws * 1.9) {
            r = (r * 16807) % 2147483647;
            if (r / 2147483647 < L.lit) { c.fillStyle = (r % 3) ? 'rgba(255,196,110,0.85)' : 'rgba(150,230,255,0.75)'; c.fillRect(wx, wy, ws, ws * 1.2); }
          }
          x += bw;
        }
      });
      var hz = c.createLinearGradient(0, base - S * 3, 0, H); hz.addColorStop(0, 'rgba(255,120,80,0)'); hz.addColorStop(1, 'rgba(255,120,80,0.18)');
      c.fillStyle = hz; c.fillRect(0, base - S * 3, W, H);
      stars.length = 0;
      for (var k = 0; k < 140; k++) stars.push({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 0.7 });
    }
    function emit(x, y, vx, vy, life, size, col, kind) {
      var p = null;
      for (var i = 0; i < parts.length; i++) if (parts[i].life <= 0) { p = parts[i]; break; }
      if (!p) { if (parts.length > 500) p = parts[(Math.random() * parts.length) | 0]; else { p = {}; parts.push(p); } }
      p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life; p.size = size; p.col = col; p.kind = kind || 0; p.spin = Math.random() * 6;
    }
    function burst(x, y, n, sp, cols, kind) {
      for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.8); emit(x, y, Math.cos(a) * s, Math.sin(a) * s, (kind ? 1.6 : 0.7) * (0.6 + Math.random() * 0.6), kind ? 0.22 : 0.13, cols[i % cols.length], kind); }
    }
    function ring(x, y, col, max, dur) { rings.push({ x: x, y: y, t: 0, dur: dur || 0.6, max: max || 3, col: col }); if (rings.length > 8) rings.shift(); }
    function kite(g, x, y, s, ang, col, flash) {
      g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
      g.fillStyle = flash > 0.3 ? '#ffffff' : col;
      g.beginPath(); g.moveTo(0, -0.95); g.lineTo(0.72, 0); g.lineTo(0, 0.9); g.lineTo(-0.72, 0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.28)'; g.beginPath(); g.moveTo(0, -0.95); g.lineTo(0.72, 0); g.lineTo(0, 0); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(40,20,30,0.6)'; g.lineWidth = 0.06; g.beginPath(); g.moveTo(0, -0.95); g.lineTo(0, 0.9); g.moveTo(-0.72, 0); g.lineTo(0.72, 0); g.stroke();
      g.strokeStyle = col; g.lineWidth = 0.08; g.beginPath(); g.moveTo(0, 0.9); g.quadraticCurveTo(0.3 * Math.sin(t * 6), 1.3, 0, 1.7); g.stroke();
      eyes(g, 0, -0.08, 0.2);
      g.restore();
    }
    function eyes(g, x, y, r) {
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x - r * 1.1, y, r, 0, TAU); g.arc(x + r * 1.1, y, r, 0, TAU); g.fill();
      g.fillStyle = '#1a1020'; g.beginPath(); g.arc(x - r * 1.1, y + r * 0.25, r * 0.55, 0, TAU); g.arc(x + r * 1.1, y + r * 0.25, r * 0.55, 0, TAU); g.fill();
    }
    function bug(g, x, y, s, ang, col, flash, moth) {
      g.save(); g.translate(x, y); g.rotate(ang); g.scale(s, s);
      var flap = Math.sin(t * (moth ? 9 : 16)) * 0.35;
      g.fillStyle = moth ? 'rgba(190,160,255,0.55)' : 'rgba(170,240,255,0.45)';
      [-1, 1].forEach(function (d) { g.save(); g.scale(d, 1); g.rotate(flap); g.beginPath(); g.ellipse(0.62, -0.25, moth ? 0.75 : 0.5, moth ? 0.45 : 0.3, -0.4, 0, TAU); g.fill(); g.restore(); });
      var lg = g.createRadialGradient(0, 0.42, 0.05, 0, 0.42, 0.6); lg.addColorStop(0, '#fff3c0'); lg.addColorStop(0.5, moth ? '#c58bff' : '#ffb736'); lg.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = lg; g.beginPath(); g.arc(0, 0.42, 0.6, 0, TAU); g.fill();
      g.fillStyle = flash > 0.3 ? '#ffffff' : col; g.beginPath(); g.ellipse(0, -0.1, moth ? 0.58 : 0.45, moth ? 0.62 : 0.5, 0, 0, TAU); g.fill();
      g.strokeStyle = col; g.lineWidth = 0.06; g.beginPath(); g.moveTo(-0.15, -0.55); g.lineTo(-0.35, -0.95); g.moveTo(0.15, -0.55); g.lineTo(0.35, -0.95); g.stroke();
      eyes(g, 0, -0.18, 0.17);
      g.restore();
    }
    function rocket(g, x, y, s, lean, tint) {
      g.save(); g.translate(x, y); g.rotate(lean * 0.4); g.scale(s, s);
      var fl = 0.8 + Math.random() * 0.4;
      var fg = g.createLinearGradient(0, 0.7, 0, 0.7 + 1.2 * fl); fg.addColorStop(0, '#fff6d0'); fg.addColorStop(0.4, '#ffa040'); fg.addColorStop(1, 'rgba(255,60,40,0)');
      g.fillStyle = fg; g.beginPath(); g.moveTo(-0.26, 0.7); g.lineTo(0.26, 0.7); g.lineTo(0, 0.7 + 1.3 * fl); g.closePath(); g.fill();
      g.fillStyle = tint || '#2fd3c8';
      g.beginPath(); g.moveTo(-0.32, 0.1); g.lineTo(-0.75, 0.8); g.lineTo(-0.25, 0.62); g.fill(); g.beginPath(); g.moveTo(0.32, 0.1); g.lineTo(0.75, 0.8); g.lineTo(0.25, 0.62); g.fill();
      g.fillStyle = tint ? '#e0c8ff' : '#f7f1e6'; g.beginPath(); g.moveTo(0, -1.0); g.quadraticCurveTo(0.42, -0.4, 0.34, 0.7); g.lineTo(-0.34, 0.7); g.quadraticCurveTo(-0.42, -0.4, 0, -1.0); g.fill();
      g.fillStyle = '#ff7a2a'; g.beginPath(); g.moveTo(0, -1.0); g.quadraticCurveTo(0.22, -0.72, 0.28, -0.5); g.lineTo(-0.28, -0.5); g.quadraticCurveTo(-0.22, -0.72, 0, -1.0); g.fill();
      g.fillStyle = '#5ee8ff'; g.beginPath(); g.arc(0, -0.15, 0.16, 0, TAU); g.fill();
      g.restore();
    }
    var view = {
      name: '2d', three: false, ready: true, pxPerUnit: 20, fieldCx: 0,
      init: function (a) { ARC = a; layout(a); return true; },
      resize: function (a) { if (ARC) layout(a); },
      newGame: function () { for (var i = 0; i < parts.length; i++) parts[i].life = 0; rings.length = 0; },
      render: function (a, G, g) {
        if (a.w !== W || a.h !== H) layout(a);
        var dt = a.state === 'pause' ? 0 : 1 / 60; t += dt;
        var al = G.alpha;
        g.drawImage(bg, 0, 0);
        // parallax stars streaming down: the rocket climbs
        for (var i = 0; i < stars.length; i++) {
          var st = stars[i]; st.y += dt * 30 * st.z; if (st.y > H) { st.y -= H; st.x = Math.random() * W; }
          g.globalAlpha = 0.4 + 0.6 * st.z * (0.7 + 0.3 * Math.sin(t * 3 + i)); g.fillStyle = '#fff'; g.fillRect(st.x, st.y, st.z * 2, st.z * 2);
        }
        g.globalAlpha = 1;
        g.drawImage(city, 0, 0);
        g.save();
        // shields
        for (var b = 0; b < BAR.n; b++) for (var r = 0; r < BAR.rows; r++) for (var c = 0; c < BAR.cols; c++) {
          var hp = G.cells[(b * BAR.rows + r) * BAR.cols + c]; if (!hp) continue;
          g.fillStyle = hp > 1 ? 'rgba(255,190,110,0.85)' : 'rgba(255,150,90,0.5)';
          g.fillRect(sx(M.barX(b, c)) - S * BAR.cs * 0.46, sy(M.barY(r)) - S * BAR.cs * 0.46, S * BAR.cs * 0.92, S * BAR.cs * 0.92);
        }
        // tractor beam
        if (G.beam.on) {
          var be = G.E[G.beam.e], bx = sx(lerp(be.px, be.x, al)), byy = sy(lerp(be.py, be.y, al)), wv = G.beam.w * S;
          var bgr = g.createLinearGradient(0, byy, 0, sy(0)); bgr.addColorStop(0, 'rgba(160,120,255,0.55)'); bgr.addColorStop(1, 'rgba(110,231,255,0.15)');
          g.fillStyle = bgr; g.globalAlpha = G.beam.open; g.beginPath(); g.moveTo(bx - 0.3 * S, byy); g.lineTo(bx + 0.3 * S, byy); g.lineTo(bx + wv, sy(0)); g.lineTo(bx - wv, sy(0)); g.closePath(); g.fill();
          for (var k = 0; k < 5; k++) { var f = ((t * 1.6 + k / 5) % 1), yy = lerp(byy, sy(0), f); g.strokeStyle = 'rgba(220,200,255,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx - lerp(0.3 * S, wv, f), yy); g.lineTo(bx + lerp(0.3 * S, wv, f), yy); g.stroke(); }
          g.globalAlpha = 1;
        }
        // boss
        var B = G.boss;
        if (B.on) {
          var bxx = sx(lerp(B.px, B.x, al)), byq = sy(lerp(B.py, B.y, al));
          for (var p = 0; p < 4; p++) { var pd = B.pods[p]; if (pd.hp <= 0) continue; var ppx = sx(lerp(pd.px, pd.x, al)), ppy = sy(lerp(pd.py, pd.y, al)); var pg = g.createRadialGradient(ppx, ppy, 2, ppx, ppy, S * 1.1); pg.addColorStop(0, pd.flash > 0.3 ? '#ffffff' : '#ffe2a0'); pg.addColorStop(0.5, '#ff7a3a'); pg.addColorStop(1, 'rgba(255,80,60,0)'); g.fillStyle = pg; g.beginPath(); g.arc(ppx, ppy, S * 1.1, 0, TAU); g.fill(); }
          g.save(); g.translate(bxx, byq); g.rotate(B.rot * 0.2);
          g.fillStyle = B.flash > 0.3 ? '#fff' : '#d8344f';
          g.beginPath(); for (var q = 0; q < 16; q++) { var rr = (q % 2 ? 1.4 : 2.7) * S, aa = q * TAU / 16; if (q) g.lineTo(Math.cos(aa) * rr, Math.sin(aa) * rr); else g.moveTo(rr, 0); } g.closePath(); g.fill();
          var cg = g.createRadialGradient(0, 0, 2, 0, 0, S * 1.3); cg.addColorStop(0, '#fff8d8'); cg.addColorStop(1, '#ffb736'); g.fillStyle = cg; g.beginPath(); g.arc(0, 0, S * 1.1, 0, TAU); g.fill();
          if (B.shield > 0.05) { g.strokeStyle = 'rgba(120,220,255,' + 0.6 * B.shield + ')'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, S * 2.9, 0, TAU); g.stroke(); }
          eyes(g, 0, -S * 0.1, S * 0.3);
          g.restore();
        }
        // raiders
        for (var e = 0; e < G.E.length; e++) {
          var en = G.E[e]; if (!en.on || en.st === M.S_WAIT) continue;
          var ex = sx(lerp(en.px, en.x, al)), ey = sy(lerp(en.py, en.y, al)), ea = lerp(en.pang, en.ang, al);
          if (en.gift) { var gg = g.createRadialGradient(ex, ey, 2, ex, ey, S * 1.2); gg.addColorStop(0, 'rgba(255,215,100,0.6)'); gg.addColorStop(1, 'rgba(255,215,100,0)'); g.fillStyle = gg; g.beginPath(); g.arc(ex, ey, S * 1.2, 0, TAU); g.fill(); }
          if (en.type === KITE) kite(g, ex, ey, S, ea, KITE_COL[(en.col + en.row) % 4], en.flash);
          else bug(g, ex, ey, S * (en.type === MOTH ? 1.15 : 1), ea, en.type === MOTH ? (en.hp < en.maxHp ? '#9a6bff' : '#5a3fd0') : '#2fbfa8', en.flash, en.type === MOTH);
          if (en.captive) rocket(g, ex, ey - S * 1.3, S * 0.8, Math.sin(t * 3) * 0.2, '#b06bff');
        }
        // the player
        var P = G.P;
        if (P.state === 'captured') { rocket(g, sx(P.x), sy(P.cy), S * 0.85, P.spin, '#b06bff'); }
        else if (P.alive || P.state === 'launch') {
          var blink = P.inv > 0 && Math.floor(t * 12) % 2 === 0;
          if (!blink) {
            var px = sx(lerp(P.px, P.x, al)), py = sy(lerp(P.py, P.y, al));
            if (P.dual) { rocket(g, px - DUAL_DX * S, py, S, P.lean); rocket(g, px + DUAL_DX * S, py, S, P.lean); }
            else rocket(g, px, py, S, P.lean);
            if (P.shield > 0) { g.strokeStyle = 'rgba(110,231,255,0.7)'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, S * (P.dual ? 1.9 : 1.3), 0, TAU); g.stroke(); }
          }
        }
        if (G.rescue.on) rocket(g, sx(lerp(G.rescue.px, G.rescue.x, al)), sy(lerp(G.rescue.py, G.rescue.y, al)), S, Math.sin(G.rescue.spin) * 0.5);
        if (G.lost.on) rocket(g, sx(G.lost.x), sy(G.lost.y), S * 0.8, G.lost.spin, '#b06bff');
        // bullets
        g.fillStyle = '#bff6ff';
        for (var i2 = 0; i2 < G.PB.length; i2++) { var pb = G.PB[i2]; if (!pb.on) continue; var bx2 = sx(lerp(pb.px, pb.x, al)), by2 = sy(lerp(pb.py, pb.y, al)); g.fillRect(bx2 - 1.5, by2 - S * 0.4, 3, S * 0.8); }
        for (var i3 = 0; i3 < G.EB.length; i3++) {
          var eb = G.EB[i3]; if (!eb.on) continue;
          var ex3 = sx(lerp(eb.px, eb.x, al)), ey3 = sy(lerp(eb.py, eb.y, al)), rad = S * (eb.k ? 0.3 : 0.22);
          g.fillStyle = eb.k ? 'rgba(255,90,140,0.35)' : 'rgba(255,140,70,0.35)'; g.beginPath(); g.arc(ex3, ey3, rad * 2, 0, TAU); g.fill();
          g.fillStyle = eb.k ? '#ff9ac0' : '#ffd0a0'; g.beginPath(); g.arc(ex3, ey3, rad, 0, TAU); g.fill();
        }
        // pickups
        var PC = ['#ffb736', '#6ee7ff', '#b69cff', '#ff7ad9'];
        for (var i4 = 0; i4 < G.PU.length; i4++) { var pu = G.PU[i4]; if (!pu.on) continue; var ux = sx(lerp(pu.px, pu.x, al)), uy = sy(lerp(pu.py, pu.y, al)); g.fillStyle = PC[pu.k]; g.shadowColor = PC[pu.k]; g.shadowBlur = 12; g.beginPath(); g.arc(ux, uy, S * 0.55, 0, TAU); g.fill(); g.shadowBlur = 0; }
        // nova ring
        if (G.nova.on) { g.strokeStyle = 'rgba(255,140,230,' + (1 - G.nova.r / 15) + ')'; g.lineWidth = 6; g.beginPath(); g.arc(sx(G.nova.x), sy(G.nova.y), G.nova.r * S, 0, TAU); g.stroke(); }
        // particles and rings
        for (var j = rings.length - 1; j >= 0; j--) { var rg = rings[j]; rg.t += dt; var kk = rg.t / rg.dur; if (kk >= 1) { rings.splice(j, 1); continue; } g.strokeStyle = rg.col; g.globalAlpha = 1 - kk; g.lineWidth = 3; g.beginPath(); g.arc(sx(rg.x), sy(rg.y), rg.max * kk * S, 0, TAU); g.stroke(); }
        g.globalAlpha = 1;
        for (var q2 = 0; q2 < parts.length; q2++) {
          var pp = parts[q2]; if (pp.life <= 0) continue;
          pp.life -= dt; pp.vy -= (pp.kind ? 3 : 6) * dt; pp.vx *= 0.985; pp.x += pp.vx * dt; pp.y += pp.vy * dt; pp.spin += dt * 9;
          g.globalAlpha = clamp(pp.life / pp.max * 2, 0, 1); g.fillStyle = pp.col;
          if (pp.kind) { var w = pp.size * S, h = w * 0.6 * Math.abs(Math.sin(pp.spin)); g.fillRect(sx(pp.x) - w / 2, sy(pp.y) - h / 2, w, h + 1); }
          else g.fillRect(sx(pp.x) - 1.5, sy(pp.y) - 1.5, 3, 3);
        }
        g.globalAlpha = 1;
        g.restore();
        var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.4)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
        return true;
      },
      project: function (x, y, z, out) { out.x = sx(x); out.y = sy(y); out.on = true; return true; },
      fx: function (type, x, y, p1, p2) {
        if (type === 'pop') { burst(x, y, 22, 7, p1 === KITE ? ['#ffb736', '#ff5fa2', '#fff'] : p1 === BUG ? ['#ffe08a', '#3fd6c6', '#fff'] : ['#c58bff', '#ff7ad9', '#fff'], 0); burst(x, y, 10, 4, ['#ff5fa2', '#3fd6c6', '#ffd23f'], 1); ring(x, y, 'rgba(255,220,160,0.8)', 2, 0.4); }
        else if (type === 'hit' || type === 'bosshit') burst(x, y, 6, 5, ['#fff2c0']);
        else if (type === 'player') { burst(x, y, 40, 9, ['#fff', '#ffb736', '#6ee7ff'], 0); burst(x, y, 20, 5, ['#ff5fa2', '#ffd23f'], 1); ring(x, y, '#ffffff', 4, 0.6); }
        else if (type === 'cell') burst(x, y, 4, 3, ['#ffbe6e']);
        else if (type === 'fizz') burst(x, y, 3, 2, ['#ff9ac0']);
        else if (type === 'pod') { burst(x, y, 40, 9, ['#ffb736', '#fff', '#ff5a3a'], 0); ring(x, y, '#ffd38a', 4, 0.6); }
        else if (type === 'bossdie' || type === 'fireworks') { for (var k = 0; k < 4; k++) burst(x + (Math.random() - 0.5) * 10, y + (Math.random() - 0.5) * 6, 40, 9, ['#ff5fa2', '#3fd6c6', '#ffd23f', '#fff'], k % 2); ring(x, y, '#fff', 9, 1); }
        else if (type === 'nova') ring(x, y, 'rgba(255,140,230,0.9)', 3, 0.4);
        else if (type === 'pickup' || type === 'dock') ring(x, y, '#6ee7ff', 2.5, 0.5);
        else if (type === 'shield' || type === 'shieldpop') burst(x, y, 6, 4, ['#6ee7ff']);
        else if (type === 'launch') burst(x, y, 30, 4, ['#ffd0a0', '#888'], 0);
      },
      debug: function () { return { quality: 0, mode2d: true, parts: parts.length }; },
      dev: { quality: function () {} }
    };
    M.boot(view);
  }).catch(function (e) { console.warn(e); });
})();
