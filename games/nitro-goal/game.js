/*
 * Nitro Goal, the 2D edition, for browsers without WebGL2. The match itself,
 * its rules, AI, controls, HUD and sound come from core.js, exactly as in 3D;
 * this file only draws the arena from above, with height shown by shadows and
 * a gentle lift, and films it with a follow camera.
 */
(function () {
  'use strict';
  import('/games/nitro-goal/core.js').then(function (M) {
    var HW = M.HW, HL = M.HL, RC = M.RC, GW = M.GW, GH = M.GH, GD = M.GD, BR = M.BR, TEAM = M.TEAM, TAU = M.TAU, clamp = M.clamp, lerp = M.lerp;
    var PW = HW - RC, PL = HL - RC;
    var ARC = null, cam = { x: 0, z: 0, s: 8, init: false }, parts = [], flash = 0, W = 0, H = 0;
    var LOOK = {
      dusk: { bg0: '#2a1f3a', bg1: '#0d0b14', turf: '#2f6b2a', ramp: '#3a3d46', glow: '#ff8a4a' },
      night: { bg0: '#0d1430', bg1: '#05060c', turf: '#2a6126', ramp: '#30333b', glow: '#4a6ad8' }
    };
    var look = LOOK.dusk;
    // world to screen: the team-0 attacking direction (+z) points up the screen
    function sx(x) { return W / 2 - (x - cam.x) * cam.s; }
    function sy(z, y) { return H / 2 - (z - cam.z) * cam.s - (y || 0) * cam.s * 0.35; }
    function emit(x, y, z, vx, vy, vz, life, size, col, kind) {
      if (parts.length > 500) parts.shift();
      parts.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, life: life, max: life, size: size, col: col, kind: kind || 'spark', spin: Math.random() * 6 });
    }
    function burst(x, y, z, n, sp, cols, kind) {
      for (var i = 0; i < n; i++) { var a = Math.random() * TAU, e = Math.random() * 1.3, s = sp * (0.4 + Math.random() * 0.8); emit(x, y, z, Math.cos(a) * s * Math.cos(e), Math.sin(e) * s, Math.sin(a) * s * Math.cos(e), (kind === 'conf' ? 2.6 : 0.6) * (0.6 + Math.random() * 0.6), kind === 'conf' ? 0.5 : 0.25, cols[i % cols.length], kind); }
    }
    function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function drawArena(g, G) {
      var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, look.bg0); bg.addColorStop(1, look.bg1);
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // the crowd ring: speckles in team colours round the arena
      var x0 = sx(HW + 30), x1 = sx(-HW - 30), z0 = sy(HL + 30), z1 = sy(-HL - 30);
      g.fillStyle = '#1b1820'; rr(g, Math.min(x0, x1), Math.min(z0, z1), Math.abs(x1 - x0), Math.abs(z1 - z0), 60 * cam.s / 8); g.fill();
      var r = 1;
      for (var i = 0; i < 700; i++) {
        r = (r * 16807) % 2147483647; var u = r / 2147483647; r = (r * 16807) % 2147483647; var v = r / 2147483647;
        var side = Math.floor(u * 4), t = v * 2 - 1, px, pz, d = HW + 6 + ((i * 37) % 22);
        if (side === 0) { px = d; pz = t * (HL + 20); } else if (side === 1) { px = -d; pz = t * (HL + 20); } else if (side === 2) { pz = HL + 6 + ((i * 37) % 22); px = t * (HW + 20); } else { pz = -HL - 6 - ((i * 37) % 22); px = t * (HW + 20); }
        var c = pz < -15 ? TEAM[0].col : pz > 15 ? TEAM[1].col : (i % 3 ? '#e8e2d6' : '#f2c230');
        g.fillStyle = c; g.globalAlpha = 0.35 + 0.25 * Math.sin(i + ARC.time * 3 * (i % 3)); g.fillRect(sx(px) - 1.5, sy(pz) - 1.5, 3, 3);
      }
      g.globalAlpha = 1;
      // the curved ramps: a band from the pitch edge to the wall
      g.fillStyle = look.ramp; rr(g, sx(HW), sy(HL), sx(-HW) - sx(HW), sy(-HL) - sy(HL), RC * cam.s * 0.9); g.fill();
      var rg = g.createLinearGradient(sx(PW), 0, sx(HW), 0); rg.addColorStop(0, 'rgba(255,255,255,0.08)'); rg.addColorStop(1, 'rgba(0,0,0,0.25)');
      // goals
      [0, 1].forEach(function (t) {
        var s = t === 0 ? -1 : 1, zf = s * HL, zb = s * (HL + GD);
        g.fillStyle = t === 0 ? '#3a2a1c' : '#1c2a36'; g.fillRect(sx(GW), Math.min(sy(zf), sy(zb)), sx(-GW) - sx(GW), Math.abs(sy(zb) - sy(zf)));
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
        for (var k = -GW; k <= GW; k += 1.4) { g.beginPath(); g.moveTo(sx(k), sy(zf)); g.lineTo(sx(k), sy(zb)); g.stroke(); }
        for (var q = 0; q <= GD; q += 1.4) { g.beginPath(); g.moveTo(sx(GW), sy(zf + s * q)); g.lineTo(sx(-GW), sy(zf + s * q)); g.stroke(); }
        // the cut in the ramp in front of the goal
        g.fillStyle = look.turf; g.fillRect(sx(GW), Math.min(sy(s * PL), sy(zf)), sx(-GW) - sx(GW), Math.abs(sy(zf) - sy(s * PL)));
        g.strokeStyle = TEAM[t].col; g.lineWidth = Math.max(2, cam.s * 0.6); g.shadowColor = TEAM[t].col; g.shadowBlur = 12;
        g.beginPath(); g.moveTo(sx(GW), sy(zb)); g.lineTo(sx(GW), sy(zf)); g.lineTo(sx(-GW), sy(zf)); g.lineTo(sx(-GW), sy(zb)); g.stroke(); g.shadowBlur = 0;
      });
      // pitch
      g.fillStyle = look.turf; g.fillRect(sx(PW), sy(PL), sx(-PW) - sx(PW), sy(-PL) - sy(PL));
      for (var z = -PL, n = 0; z < PL; z += 6, n++) { g.fillStyle = n % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.06)'; g.fillRect(sx(PW), sy(z + 6), sx(-PW) - sx(PW), sy(z) - sy(z + 6)); }
      var tg = g.createLinearGradient(0, sy(-PL), 0, sy(-PL + 30)); tg.addColorStop(0, 'rgba(255,122,26,0.18)'); tg.addColorStop(1, 'rgba(255,122,26,0)'); g.fillStyle = tg; g.fillRect(sx(PW), sy(-PL + 30), sx(-PW) - sx(PW), sy(-PL) - sy(-PL + 30));
      var tb = g.createLinearGradient(0, sy(PL), 0, sy(PL - 30)); tb.addColorStop(0, 'rgba(42,184,255,0.18)'); tb.addColorStop(1, 'rgba(42,184,255,0)'); g.fillStyle = tb; g.fillRect(sx(PW), sy(PL), sx(-PW) - sx(PW), sy(PL - 30) - sy(PL));
      g.strokeStyle = 'rgba(245,245,235,0.85)'; g.lineWidth = Math.max(1, cam.s * 0.3);
      g.strokeRect(sx(PW - 1), sy(PL - 1), sx(-PW + 1) - sx(PW - 1), sy(-PL + 1) - sy(PL - 1));
      g.beginPath(); g.moveTo(sx(PW - 1), sy(0)); g.lineTo(sx(-PW + 1), sy(0)); g.stroke();
      g.beginPath(); g.arc(sx(0), sy(0), 10 * cam.s, 0, TAU); g.stroke();
      [-1, 1].forEach(function (s) { g.strokeRect(sx(GW + 6), sy(s * (PL - 1)), sx(-GW - 6) - sx(GW + 6), sy(s * (PL - 15)) - sy(s * (PL - 1))); });
      // glowing strip along the top of the ramp
      g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 2; g.shadowColor = look.glow; g.shadowBlur = 10;
      rr(g, sx(HW), sy(HL), sx(-HW) - sx(HW), sy(-HL) - sy(HL), RC * cam.s * 0.9); g.stroke(); g.shadowBlur = 0;
    }
    function drawPads(g, G, t) {
      G.pads.forEach(function (p, i) {
        var on = p.t <= 0, r = (p.big ? 2.0 : 1.1) * cam.s;
        g.beginPath(); g.arc(sx(p.x), sy(p.z), r, 0, TAU); g.fillStyle = on ? 'rgba(255,179,71,0.22)' : 'rgba(42,43,49,0.8)'; g.fill();
        g.strokeStyle = on ? '#ffb347' : 'rgba(255,179,71,0.25)'; g.lineWidth = Math.max(1.5, cam.s * 0.2); g.stroke();
        if (on && p.big) { var pulse = 1 + Math.sin(t * 3 + i) * 0.1; g.shadowColor = '#ffb347'; g.shadowBlur = 16; g.beginPath(); g.arc(sx(p.x), sy(p.z, 1.2), 0.8 * cam.s * pulse, 0, TAU); g.fillStyle = '#ffd38a'; g.fill(); g.shadowBlur = 0; }
      });
    }
    function drawCar(g, c, P) {
      if (!P.vis) return;
      var lift = 1 + P.y * 0.02, x = sx(P.x), y = sy(P.z, P.y), ang = Math.atan2(-P.fx, P.fz);
      // shadow on the ground
      g.save(); g.translate(sx(P.x) + P.y * 0.6, sy(P.z) + P.y * 0.5); g.rotate(-ang); g.fillStyle = 'rgba(0,0,0,' + clamp(0.45 - P.y * 0.02, 0.1, 0.45) + ')'; rr(g, -1.1 * cam.s, -2.1 * cam.s, 2.2 * cam.s, 4.2 * cam.s, 0.6 * cam.s); g.fill(); g.restore();
      g.save(); g.translate(x, y); g.rotate(-ang); g.scale(lift, lift);
      var s = cam.s;
      if (P.boost) { var fl = 1 + Math.random() * 0.5; var gr = g.createLinearGradient(0, 2 * s, 0, (2 + 2.4 * fl) * s); gr.addColorStop(0, '#fff2c0'); gr.addColorStop(0.4, '#ff9a3a'); gr.addColorStop(1, 'rgba(255,60,40,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(-0.6 * s, 2 * s); g.lineTo(0.6 * s, 2 * s); g.lineTo(0, (2 + 2.6 * fl) * s); g.closePath(); g.fill(); }
      g.fillStyle = '#141416'; [[-1.15, -1.3], [1.15, -1.3], [-1.15, 1.25], [1.15, 1.25]].forEach(function (w) { g.fillRect((w[0] - 0.22) * s, (w[1] - 0.42) * s, 0.44 * s, 0.84 * s); });
      g.fillStyle = TEAM[c.team].col; rr(g, -1.0 * s, -2.1 * s, 2.0 * s, 4.2 * s, 0.7 * s); g.fill();
      g.fillStyle = '#0b1420'; rr(g, -0.78 * s, -0.7 * s, 1.56 * s, 1.9 * s, 0.4 * s); g.fill();
      g.fillStyle = TEAM[c.team].col; g.fillRect(-0.68 * s, -0.25 * s, 1.36 * s, 1.0 * s);
      g.fillStyle = '#f4efe6'; g.fillRect(-0.16 * s, -2.05 * s, 0.32 * s, 4.1 * s);
      g.fillStyle = '#fffbe6'; g.fillRect(-0.85 * s, -2.15 * s, 0.4 * s, 0.14 * s); g.fillRect(0.45 * s, -2.15 * s, 0.4 * s, 0.14 * s);
      g.fillStyle = '#ff3a2a'; g.fillRect(-0.9 * s, 2.02 * s, 1.8 * s, 0.12 * s);
      if (c.isPlayer) { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; rr(g, -1.1 * s, -2.2 * s, 2.2 * s, 4.4 * s, 0.8 * s); g.stroke(); }
      g.restore();
    }
    function drawBall(g, P, t) {
      if (!P.vis) return;
      var r = BR * cam.s * (1 + P.y * 0.02);
      g.beginPath(); g.ellipse(sx(P.x) + P.y * 0.6, sy(P.z) + P.y * 0.5, BR * cam.s, BR * cam.s * 0.85, 0, 0, TAU); g.fillStyle = 'rgba(0,0,0,' + clamp(0.4 - P.y * 0.015, 0.08, 0.4) + ')'; g.fill();
      var x = sx(P.x), y = sy(P.z, P.y);
      var gr = g.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.7, '#d9dde6'); gr.addColorStop(1, '#8a90a0');
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = gr; g.fill();
      g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip();
      var spin = (P.q[1] + P.q[3]) * 3;
      g.fillStyle = '#16181f';
      for (var k = 0; k < 5; k++) { var a = spin + k * TAU / 5; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.62, y + Math.sin(a) * r * 0.62, r * 0.22, 0, TAU); g.fill(); }
      g.beginPath(); g.arc(x, y, r * 0.24, 0, TAU); g.fill();
      g.restore();
      g.strokeStyle = 'rgba(140,220,255,0.7)'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
    }
    function step(dt) {
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
        p.vy -= (p.kind === 'conf' ? 4 : 9) * dt; var dr = Math.exp(-1.4 * dt); p.vx *= dr; p.vz *= dr;
        p.x += p.vx * dt; p.y = Math.max(0, p.y + p.vy * dt); p.z += p.vz * dt; p.spin += dt * 8;
      }
      flash = Math.max(0, flash - dt * 2);
    }
    function drawParts(g) {
      parts.forEach(function (p) {
        var a = clamp(p.life / p.max * 2, 0, 1), x = sx(p.x), y = sy(p.z, p.y);
        g.globalAlpha = a; g.fillStyle = p.col;
        if (p.kind === 'conf') { var w = p.size * cam.s, h = w * 0.6 * Math.abs(Math.sin(p.spin)); g.fillRect(x - w / 2, y - h / 2, w, h + 1); }
        else { g.beginPath(); g.arc(x, y, Math.max(1, p.size * cam.s), 0, TAU); g.fill(); }
      });
      g.globalAlpha = 1;
    }
    function camera(a, G, dt) {
      var P = G.pose.cars[G.player.id], B = G.pose.ball, port = a.w < a.h;
      var tx, tz, ts;
      var base = (port ? a.w / 50 : a.h / 74);
      if (G.cfg.attract || G.phase === 'intro' || G.phase === 'introOut' || G.phase === 'over') { tx = 0; tz = G.cfg.attract ? B.z * 0.4 : 0; ts = Math.min(a.w / (HW * 2 + 20), a.h / (HL * 2 + 24)) * (G.phase === 'intro' ? lerp(1, 1.4, clamp(G.pt / 4, 0, 1)) : 1); }
      else if (G.phase === 'replay' || G.phase === 'replayOut') { tx = B.x; tz = B.z; ts = base * 1.25; }
      else { tx = lerp(P.x, B.vis ? B.x : P.x, 0.35); tz = lerp(P.z, B.vis ? B.z : P.z, 0.35) + (port ? 6 : 3); ts = base; }
      var k = cam.init ? 1 - Math.exp(-dt * 4) : 1;
      cam.x += (tx - cam.x) * k; cam.z += (tz - cam.z) * k; cam.s += (ts - cam.s) * k; cam.init = true;
    }
    var view = {
      name: '2d', three: false,
      camPos: { x: 0, y: 80, z: 0 },
      init: function (a) { ARC = a; return true; },
      resize: function () {},
      newMatch: function (G) { look = LOOK[G.cfg.sky] || LOOK.dusk; parts.length = 0; cam.init = false; },
      render: function (a, G, g) {
        W = a.w; H = a.h;
        var dt = a.state === 'pause' ? 0 : 1 / 60;
        camera(a, G, dt); step(dt);
        view.camPos.x = cam.x; view.camPos.z = cam.z;
        drawArena(g, G); drawPads(g, G, a.time);
        var order = G.cars.map(function (c, i) { return i; }).sort(function (i, j) { return G.pose.cars[i].y - G.pose.cars[j].y; });
        var B = G.pose.ball, ballHigh = B.y > 3.5;
        if (!ballHigh) drawBall(g, B, a.time);
        order.forEach(function (i) { drawCar(g, G.cars[i], G.pose.cars[i]); });
        if (ballHigh) drawBall(g, B, a.time);
        // boost trails and supersonic streaks
        G.cars.forEach(function (c, i) { var P = G.pose.cars[i]; if (P.vis && P.boost && Math.random() < 0.7) emit(P.x - P.fx * 2.4, P.y, P.z - P.fz * 2.4, -P.fx * 6 + (Math.random() - 0.5) * 2, 0.5, -P.fz * 6 + (Math.random() - 0.5) * 2, 0.35, 0.3, Math.random() < 0.5 ? '#ffb347' : TEAM[c.team].glow); });
        drawParts(g);
        if (flash > 0 && !a.reducedMotion) { g.fillStyle = 'rgba(255,255,255,' + flash * 0.35 + ')'; g.fillRect(0, 0, W, H); }
        var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
        return true;
      },
      project: function (x, y, z, out) { out.x = sx(x); out.y = sy(z, y); out.behind = false; out.on = out.x > 4 && out.x < W - 4 && out.y > 4 && out.y < H - 4; return true; },
      camBasis: function () { return { fx: 0, fz: 1, rx: -1, rz: 0, r3x: -1, r3y: 0, r3z: 0, u3x: 0, u3y: 0.35, u3z: 1, f3x: 0, f3y: 0, f3z: 0 }; },
      fx: function (type, d) {
        if (type === 'hit') { burst(d.x, d.y, d.z, 8 + d.k * 20, 6 + d.k * 10, ['#ffe7b0', TEAM[d.car.team].glow]); flash = Math.max(flash, d.k > 0.7 ? 0.15 : 0); }
        else if (type === 'bounce' || type === 'post') burst(d.x, d.y, d.z, 6, 6, ['#cfe8ff']);
        else if (type === 'goal') { burst(d.x, Math.max(2, d.y), d.side * (HL - 1), 160, 18, [TEAM[d.team].col, TEAM[d.team].glow, '#ffffff', '#ffd36a'], 'conf'); burst(d.x, d.y, d.z, 60, 22, ['#fff2cc']); flash = 0.6; }
        else if (type === 'demo') { burst(d.x, d.y, d.z, 50, 14, ['#ffd9a0', TEAM[d.car.team].col, '#ffffff'], 'conf'); flash = Math.max(flash, 0.3); }
        else if (type === 'pad') { for (var i = 0; i < (d.pad.big ? 24 : 8); i++) emit(d.pad.x, 0.5, d.pad.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6, 0.5, 0.25, '#ffb347'); }
        else if (type === 'end') { burst(0, 6, 0, 200, 16, [TEAM[d.team].col, '#ffd36a', '#ffffff'], 'conf'); }
      },
      debug: function () { return { quality: 0, fps: 0, soft: true, post: false, mode2d: true }; },
      dev: { quality: function () {}, setQuality: function () {} }
    };
    M.boot(view);
  }).catch(function (e) { console.warn(e); });
})();
