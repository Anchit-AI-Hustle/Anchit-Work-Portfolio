/*
 * Last Ridge, the 2D edition, for browsers without WebGL2. The war itself
 * (the campaign, every multiplayer mode, the range, the bots, ranks and
 * unlocks) comes from core.js and sim.js exactly as in 3D; this file draws it
 * from above: a top-down tactical view that follows you, walls and cover with
 * their shadows, soldiers you can see from where you stand, tracers, blasts,
 * smoke and the flags. Aim with the mouse or a stick, move with WASD.
 */
(function () {
  'use strict';
  Promise.all([import('/games/last-ridge/core.js'), import('/games/last-ridge/sim.js'), import('/games/last-ridge/data.js')]).then(function (mods) {
    var core = mods[0], S = mods[1], D = mods[2];
    var TAU = Math.PI * 2, CS = D.CS, ARC = null, cv = null, g = null;
    var cam = { x: 0, z: 0, s: 20, init: false };
    var fxs = [], tracers = [];
    var FLOOR = { snow: ['#dfe5ea', '#cfd7de'], wet: ['#2d333a', '#262b31'], cobble: ['#8a7a66', '#7c6d5b'], sand: ['#cfa476', '#c39869'], road: ['#5a5a5c', '#4f4f51'], dirt: ['#8a7660', '#7d6a55'] };
    var V = { name: '2d', three: false, flat: true, absMove: true, letter: 0, aimOn: false, touch: null, aimPoint: null };
    function toScreen(x, z, out) { out.x = ARC.w / 2 + (x - cam.x) * cam.s; out.y = ARC.h / 2 + (z - cam.z) * cam.s; return out; }
    var P2 = { x: 0, y: 0 };
    V.init = function (a) { ARC = a; cv = a.canvas; g = a.ctx; return true; };
    V.resize = function () { };
    V.setWorld = function (W) { cam.init = false; fxs = []; tracers = []; };
    V.fov = function () { return 70; };
    V.project = function (x, y, z, out) { toScreen(x, z, out); out.y -= y * cam.s * 0.15; out.front = true; return true; };
    V.quality = function () { }; V.graphics = function () { };
    V.debug = function () { return { quality: 0, renderer: '2d', fx: fxs.length }; };
    V.dev = {};
    // the mouse aims where it points; a right stick aims where it points
    V.aimYaw = function (a, W, I) {
      var P = W.P; if (!P.alive) return null;
      var px = P.mount ? P.mount.x : P.x, pz = P.mount ? P.mount.z : P.z;
      if (a.gamepad && navigator.getGamepads) {
        try { var gp = Array.prototype.find.call(navigator.getGamepads(), function (x) { return x && x.connected; }); if (gp && Math.hypot(gp.axes[2] || 0, gp.axes[3] || 0) > 0.35) return Math.atan2(-(gp.axes[2] || 0), -(gp.axes[3] || 0)); } catch (e) { /* none */ }
      }
      var pt = a.input.pointer;
      if (!a.touchMode && pt.seen) {
        var wx = cam.x + (pt.x - a.w / 2) / cam.s, wz = cam.z + (pt.y - a.h / 2) / cam.s;
        V.aimPoint = { x: pt.x, y: pt.y };
        if (Math.hypot(wx - px, wz - pz) < 0.4) return null;
        return Math.atan2(-(wx - px), -(wz - pz));
      }
      V.aimPoint = null;
      return null;
    };
    // from above there is no looking up or down: the sight finds the body in front of you
    V.autoAim = function (a, W, I) {
      var P = W.P, best = null, ba = 0.16;
      for (var i = 0; i < W.chars.length; i++) {
        var c = W.chars[i]; if (!c.alive || c === P || (!W.ffa && c.team === P.team)) continue;
        var dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz); if (d > 50) continue;
        var ang = Math.abs(S.angDiff(P.yaw, Math.atan2(-dx, -dz)));
        if (ang < ba && S.clearLine(W, P.x, S.eyeY(P), P.z, c.x, S.chestY(c), c.z, true)) { ba = ang; best = c; }
      }
      if (best) { var want = Math.atan2(S.chestY(best) - S.eyeY(P), Math.hypot(best.x - P.x, best.z - P.z)); I.ly = -(want - P.pitch); V.aimOn = true; if (a.touchMode && a.choices.autofire !== 'off') { I.fire = true; I.fireHit = true; } }
      else { I.ly = -(0 - P.pitch) * 0.5; V.aimOn = false; }
    };
    function sees(W, c) {
      var P = W.P; if (W.ffa ? c === P : c.team === P.team) return true;
      if (!c.alive) return Math.hypot(c.x - P.x, c.z - P.z) < 30;
      if (W.radar[0] > 0 || c.revealT > 0) return true;
      return S.clearLine(W, P.x, S.eyeY(P), P.z, c.x, S.headY(c), c.z, true);
    }
    function cellCol(k, map) {
      if (k === '#') return map === 'town' ? ['#b8a48a', '#8a7a66'] : map === 'docks' ? ['#5a6068', '#3a4048'] : ['#8a8478', '#5e5a52'];
      if (k === 'H') return map === 'ridge' ? ['#7a7e84', '#5a5e64'] : ['#9a8468', '#6e5e4a'];
      if (k === 'X') return ['#1e2a36', '#16202a'];
      if (k === 'b') return map === 'docks' || map === 'refinery' ? ['#7a3a2c', '#4e2620'] : ['#8a6a44', '#5e482e'];
      if (k === 'c') return map === 'docks' || map === 'refinery' || map === 'town' ? ['#b0aca2', '#7a766e'] : ['#a8946a', '#7a6a4c'];
      if (k === 'o') return ['#c8c4b8', '#8a867c'];
      if (k === 't') return ['#7c7a76', '#5a5854'];
      if (k === 'e') return ['#b8402c', '#7a2a1e'];
      if (k === 'r') return ['#5a5048', '#4a4038'];
      return null;
    }
    V.render = function (a, W, ctx) {
      var G = W.G, P = W.P, w = a.w, h = a.h, now = performance.now();
      var dt = V.last ? Math.min(0.1, (now - V.last) / 1000) : 1 / 60; V.last = now;
      if (a.state === 'pause') dt = 0;
      // the camera follows you, eased; the menu drifts over the field
      var tx = P.mount ? P.mount.x : P.x, tz = P.mount ? P.mount.z : P.z;
      if (W.attract) { tx = Math.cos(W.t * 0.05) * 18; tz = Math.sin(W.t * 0.04) * 14; }
      if (W.phase === 'killcam' && W.kc) { var K = W.chars[W.kc.ko.killer]; if (K) { tx = K.x; tz = K.z; } }
      cam.s = Math.min(w, h) / (a.touchMode ? 30 : 38);
      if (!cam.init) { cam.x = tx; cam.z = tz; cam.init = true; }
      var lead = W.attract ? 0 : 3;
      cam.x += (tx - Math.sin(P.yaw) * lead - cam.x) * Math.min(1, dt * 5); cam.z += (tz - Math.cos(P.yaw) * lead - cam.z) * Math.min(1, dt * 5);
      if (a.shakeX && !a.reducedMotion) { cam.x += a.shakeX * 0.01; cam.z += a.shakeY * 0.01; }
      var fl = FLOOR[W.M.floor] || FLOOR.dirt;
      ctx.fillStyle = fl[0]; ctx.fillRect(0, 0, w, h);
      // cells in view
      var x0 = Math.max(0, S.toCX(G, cam.x - w / 2 / cam.s) - 1), x1 = Math.min(G.gw - 1, S.toCX(G, cam.x + w / 2 / cam.s) + 1);
      var z0 = Math.max(0, S.toCZ(G, cam.z - h / 2 / cam.s) - 1), z1 = Math.min(G.gh - 1, S.toCZ(G, cam.z + h / 2 / cam.s) + 1);
      var cs = CS * cam.s;
      // floor tiles: a soft checker so motion reads
      ctx.fillStyle = fl[1];
      for (var z = z0; z <= z1; z++) for (var x = x0; x <= x1; x++) if ((x + z) % 2 === 0) { toScreen(S.cw(G, x), S.cwz(G, z), P2); ctx.fillRect(P2.x, P2.y, cs + 0.5, cs + 0.5); }
      // shadows first, then tops (the sun from the north west)
      var sh = cam.s * 0.22;
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      for (z = z0; z <= z1; z++) for (x = x0; x <= x1; x++) { var k = G.kind[z * G.gw + x]; if (k === '.' || k === 'r') continue; var hgt = Math.min(5, G.h[z * G.gw + x]); toScreen(S.cw(G, x), S.cwz(G, z), P2); ctx.fillRect(P2.x + hgt * sh, P2.y + hgt * sh, cs, cs); }
      for (z = z0; z <= z1; z++) for (x = x0; x <= x1; x++) {
        k = G.kind[z * G.gw + x]; var col = cellCol(k, W.mapId); if (!col) continue;
        toScreen(S.cw(G, x), S.cwz(G, z), P2);
        if (k === 't' || k === 'o' || k === 'e') { ctx.fillStyle = col[1]; ctx.beginPath(); ctx.arc(P2.x + cs / 2, P2.y + cs / 2, cs * (k === 'e' ? 0.32 : 0.48), 0, TAU); ctx.fill(); ctx.fillStyle = col[0]; ctx.beginPath(); ctx.arc(P2.x + cs / 2 - cs * 0.06, P2.y + cs / 2 - cs * 0.06, cs * (k === 'e' ? 0.24 : 0.38), 0, TAU); ctx.fill(); continue; }
        ctx.fillStyle = col[1]; ctx.fillRect(P2.x, P2.y, cs + 0.5, cs + 0.5);
        ctx.fillStyle = col[0]; ctx.fillRect(P2.x + 1, P2.y + 1, cs - 3, cs - 3);
        if (k === 'c') { ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(P2.x, P2.y + cs / 2); ctx.lineTo(P2.x + cs, P2.y + cs / 2); ctx.stroke(); }
      }
      // objectives
      var mks = S.markers(W);
      for (var i = 0; i < mks.length; i++) { var m = mks[i]; toScreen(m.x, m.z, P2); ctx.strokeStyle = m.col; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(P2.x, P2.y, (m.flag ? m.flag.r : 1.2) * cam.s, 0, TAU); ctx.stroke(); core.txt(ctx, m.label, P2.x, P2.y, 11, m.col, 'center', '800'); }
      // range boards
      if (W.targets) for (i = 0; i < W.targets.length; i++) { var tg = W.targets[i]; toScreen(tg.x, tg.z, P2); ctx.fillStyle = tg.up ? '#e0cfa0' : 'rgba(120,100,70,0.5)'; ctx.fillRect(P2.x - 0.3 * cam.s, P2.y - 2, 0.6 * cam.s, 4); }
      // the convoy trucks
      if (W.convoy) for (i = 0; i < W.convoy.trucks.length; i++) { var tr = W.convoy.trucks[i]; toScreen(tr.x, tr.z, P2); ctx.fillStyle = '#4f5641'; ctx.fillRect(P2.x - 1.2 * cam.s, P2.y - 3.1 * cam.s, 2.4 * cam.s, 6.2 * cam.s); ctx.fillStyle = '#2a2e24'; ctx.fillRect(P2.x - 1.1 * cam.s, P2.y - 3.1 * cam.s, 2.2 * cam.s, 1.6 * cam.s); }
      // crates
      for (i = 0; i < W.crates.length; i++) { var cr = W.crates[i]; toScreen(cr.x, cr.z, P2); ctx.fillStyle = cr.landed ? '#6a7650' : 'rgba(106,118,80,0.5)'; ctx.fillRect(P2.x - 0.6 * cam.s, P2.y - 0.45 * cam.s, 1.2 * cam.s, 0.9 * cam.s); }
      // people
      for (i = 0; i < W.chars.length; i++) {
        var c = W.chars[i]; if (c.gone || (!c.alive && c.downT > 8)) continue;
        if (!sees(W, c)) continue;
        toScreen(c.x, c.z, P2);
        var ally = W.ffa ? c === P : c.team === P.team, tcol = c === P ? '#ffd36a' : ally ? D.FACTIONS[0].tag : D.FACTIONS[1].tag;
        var r = 0.36 * cam.s;
        if (!c.alive) { ctx.globalAlpha = Math.max(0, Math.min(1, (8 - c.downT) / 2)); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.beginPath(); ctx.ellipse(P2.x, P2.y, r * 1.6, r * 0.8, -c.yaw, 0, TAU); ctx.fill(); core.txt(ctx, 'OUT', P2.x, P2.y, 9, tcol, 'center', '800'); ctx.globalAlpha = 1; continue; }
        // a vision cone for sentries on the stealth mission
        if (W.stealth && c.bot && c.team !== P.team && !W.alarm) {
          var al = c.bot.alert, cr2 = al > 0.7 ? '255,90,60' : al > 0.35 ? '255,200,90' : '244,239,230';
          ctx.fillStyle = 'rgba(' + cr2 + ',0.12)'; ctx.beginPath(); ctx.moveTo(P2.x, P2.y); ctx.arc(P2.x, P2.y, (W.look.night ? 24 : 40) * cam.s * 0.5, -Math.PI / 2 - c.yaw - 0.95, -Math.PI / 2 - c.yaw + 0.95); ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.arc(P2.x + 2, P2.y + 3, r, 0, TAU); ctx.fill();
        var fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
        ctx.strokeStyle = '#1a1a1a'; ctx.lineWidth = Math.max(2, cam.s * 0.1); ctx.beginPath(); ctx.moveTo(P2.x + fx * r * 0.4, P2.y + fz * r * 0.4); ctx.lineTo(P2.x + fx * r * 2.2, P2.y + fz * r * 2.2); ctx.stroke();
        ctx.fillStyle = c.hitFlash > 0.5 ? '#ffffff' : tcol; ctx.beginPath(); ctx.arc(P2.x, P2.y, c.stance === 'prone' ? r * 0.8 : c.stance === 'stand' ? r : r * 0.9, 0, TAU); ctx.fill();
        ctx.fillStyle = 'rgba(20,20,20,0.6)'; ctx.beginPath(); ctx.arc(P2.x + fx * r * 0.2, P2.y + fz * r * 0.2, r * 0.5, 0, TAU); ctx.fill();
        if (c.stance === 'crouch' || c.stance === 'prone') { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(P2.x, P2.y, r + 3, 0, TAU); ctx.stroke(); }
        if (c !== P && ally && !W.ffa) core.txt(ctx, c.name, P2.x, P2.y - r - 9, 9, D.FACTIONS[0].ui, 'center', '700');
      }
      // grenades, rockets, smoke, effects
      for (i = 0; i < W.nades.length; i++) { var n = W.nades[i]; toScreen(n.x, n.z, P2); ctx.fillStyle = n.kind === 'frag' ? '#3a4030' : '#cfcfc8'; ctx.beginPath(); ctx.arc(P2.x, P2.y - n.y * cam.s * 0.2, Math.max(3, cam.s * 0.12), 0, TAU); ctx.fill(); if (n.kind === 'frag') { ctx.strokeStyle = 'rgba(255,90,60,0.6)'; ctx.beginPath(); ctx.arc(P2.x, P2.y, 7 * cam.s * (1 - Math.max(0, n.fuse) / 3.2) + 4, 0, TAU); ctx.stroke(); } }
      for (i = 0; i < W.rockets.length; i++) { var rk = W.rockets[i]; toScreen(rk.x, rk.z, P2); ctx.fillStyle = '#ffd36a'; ctx.beginPath(); ctx.arc(P2.x, P2.y, 4, 0, TAU); ctx.fill(); }
      for (i = 0; i < W.ev.length; i++) {
        var e = W.ev[i];
        if (e.k === 'shot' && e.tracer) tracers.push({ ax: e.ox, az: e.oz, bx: e.ex, bz: e.ez, t: 0 });
        else if (e.k === 'boom') fxs.push({ k: 'boom', x: e.x, z: e.z, t: 0, s: e.size || 1 });
        else if (e.k === 'flash') fxs.push({ k: 'flash', x: e.x, z: e.z, t: 0, s: 1 });
        else if (e.k === 'hit' || (e.k === 'shot' && e.hit === 'wall')) fxs.push({ k: 'spark', x: e.k === 'hit' ? e.x : e.ex, z: e.k === 'hit' ? e.z : e.ez, t: 0, s: 1 });
      }
      for (i = tracers.length - 1; i >= 0; i--) {
        var t = tracers[i]; t.t += dt; if (t.t > 0.08) { tracers.splice(i, 1); continue; }
        toScreen(t.ax, t.az, P2); var ax = P2.x, ay = P2.y; toScreen(t.bx, t.bz, P2);
        ctx.strokeStyle = 'rgba(255,210,140,' + (1 - t.t / 0.08) + ')'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(P2.x, P2.y); ctx.stroke();
      }
      for (i = 0; i < W.smokes.length; i++) { var sm = W.smokes[i]; toScreen(sm.x, sm.z, P2); for (var q = 0; q < 6; q++) { var a2 = q * 1.05 + sm.t * 0.1; ctx.fillStyle = 'rgba(200,204,206,0.42)'; ctx.beginPath(); ctx.arc(P2.x + Math.cos(a2) * sm.r * 0.45 * cam.s, P2.y + Math.sin(a2) * sm.r * 0.45 * cam.s, sm.r * 0.65 * cam.s, 0, TAU); ctx.fill(); } }
      for (i = fxs.length - 1; i >= 0; i--) {
        var f = fxs[i]; f.t += dt; var life = f.k === 'boom' ? 0.9 : f.k === 'flash' ? 0.5 : 0.18; if (f.t > life) { fxs.splice(i, 1); continue; }
        toScreen(f.x, f.z, P2); var k2 = f.t / life;
        if (f.k === 'boom') { ctx.fillStyle = 'rgba(255,170,80,' + (1 - k2) * 0.8 + ')'; ctx.beginPath(); ctx.arc(P2.x, P2.y, (1.5 + k2 * 5) * f.s * cam.s, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(90,84,76,' + (1 - k2) * 0.6 + ')'; ctx.beginPath(); ctx.arc(P2.x, P2.y, (2.5 + k2 * 6) * f.s * cam.s, 0, TAU); ctx.fill(); }
        else if (f.k === 'flash') { ctx.fillStyle = 'rgba(255,255,250,' + (1 - k2) + ')'; ctx.beginPath(); ctx.arc(P2.x, P2.y, (2 + k2 * 8) * cam.s, 0, TAU); ctx.fill(); }
        else { ctx.fillStyle = 'rgba(255,220,160,' + (1 - k2) + ')'; ctx.beginPath(); ctx.arc(P2.x, P2.y, 3, 0, TAU); ctx.fill(); }
      }
      // weather
      if (W.look.rain || W.look.snow) { ctx.fillStyle = W.look.rain ? 'rgba(180,200,220,0.35)' : 'rgba(255,255,255,0.7)'; for (i = 0; i < 70; i++) { var sx = (i * 97.3 + W.t * (W.look.rain ? 260 : 30)) % w, sy = (i * 53.7 + W.t * (W.look.rain ? 520 : 50)) % h; ctx.fillRect(sx, sy, W.look.rain ? 1 : 2, W.look.rain ? 7 : 2); } }
      if (W.look.night) { ctx.fillStyle = 'rgba(8,12,24,0.35)'; ctx.fillRect(0, 0, w, h); var lg = ctx.createRadialGradient(w / 2, h / 2, 40, w / 2, h / 2, Math.max(w, h) * 0.6); lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.45)'); ctx.fillStyle = lg; ctx.fillRect(0, 0, w, h); }
      return true;
    };
    core.boot(V);
  }).catch(function (e) { console.error(e); });
})();
