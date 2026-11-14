/*
 * Ring Rajas, the 2D edition, for browsers without WebGL2. The match, its
 * rules, AI, career, commentary, HUD and sound come from core.js exactly as in
 * 3D; this file draws the arena with its own small perspective projection on a
 * 2D canvas: the ring, ropes that give, the stage and titantron, a crowd that
 * bounces with the noise, and the wrestlers as shaded figures posed from the
 * same body data the 3D people use. Replays and entrances work here too.
 */
(function () {
  'use strict';
  import('/games/ring-rajas/core.js').then(function (M) {
    var RH = M.RH, ROPE = M.ROPE, POST = M.POST, APRON = M.APRON, FLOOR = M.FLOOR, STAGE_Z = M.STAGE_Z, STAGE_Y = M.STAGE_Y, RAMP_END = M.RAMP_END;
    var PI = Math.PI, HALF = PI / 2, TAU = PI * 2, clamp = M.clamp, lerp = M.lerp, PHf = M.PHf;
    var ARC = null, W = 0, H = 0, G0 = null, time = 0;
    // camera
    var cam = { x: 0, y: 8, z: 12, tx: 0, ty: RH + 1, tz: 0, f: 600, fx: 0, fy: 0, fz: 0, rx: 0, ry: 0, rz: 0, ux: 0, uy: 0, uz: 0, yaw: PI, init: false };
    var parts = [], ropes = [{ ax: 'x', sg: 1, b: 0, v: 0, at: 0 }, { ax: 'x', sg: -1, b: 0, v: 0, at: 0 }, { ax: 'z', sg: 1, b: 0, v: 0, at: 0 }, { ax: 'z', sg: -1, b: 0, v: 0, at: 0 }];
    var crowd = [], flash = 0, tron = { title: 'RING RAJAS', sub: 'Monday Akhada  LIVE', col: '#ff7a1a' }, pyroT = 0, pyroCol = '#ff7a1a';
    var rec = { buf: [], n: 0, head: 0, t: 0 }, replay = null, RECN = 260;
    var out = { x: 0, y: 0, s: 1, z: 0 };

    function rnd(a, b) { return a + Math.random() * (b - a); }
    function setCam(px, py, pz, tx, ty, tz) {
      cam.x = px; cam.y = py; cam.z = pz; cam.tx = tx; cam.ty = ty; cam.tz = tz;
      var fx = tx - px, fy = ty - py, fz = tz - pz, l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l;
      // right = f x up, up = r x f
      var rx = -fz, ry = 0, rz = fx, rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
      var ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
      cam.fx = fx; cam.fy = fy; cam.fz = fz; cam.rx = rx; cam.ry = ry; cam.rz = rz; cam.ux = ux; cam.uy = uy; cam.uz = uz;
    }
    // world to screen; out.s is pixels per metre at that depth
    function proj(x, y, z, o) {
      var dx = x - cam.x, dy = y - cam.y, dz = z - cam.z;
      var d = dx * cam.fx + dy * cam.fy + dz * cam.fz;
      if (d < 0.2) { o.z = -1; return false; }
      var sx = dx * cam.rx + dy * cam.ry + dz * cam.rz, sy = dx * cam.ux + dy * cam.uy + dz * cam.uz;
      o.x = W / 2 + sx / d * cam.f; o.y = H / 2 - sy / d * cam.f; o.s = cam.f / d; o.z = d;
      return true;
    }
    function shade(hex, k) {
      var n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
      return 'rgb(' + Math.round(clamp(r * k, 0, 255)) + ',' + Math.round(clamp(g * k, 0, 255)) + ',' + Math.round(clamp(b * k, 0, 255)) + ')';
    }
    function emit(x, y, z, vx, vy, vz, life, size, col, kind) {
      if (parts.length > 260) parts.shift();
      parts.push({ x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, life: life, max: life, size: size, col: col, kind: kind || 'dust' });
    }
    function burst(x, y, z, n, sp, cols, kind, life) {
      for (var i = 0; i < n; i++) { var a = Math.random() * TAU, e = Math.random() * 1.2, s = sp * (0.4 + Math.random() * 0.8); emit(x, y, z, Math.cos(a) * s * Math.cos(e), Math.sin(e) * s + (kind === 'conf' ? 2 : 0.4), Math.sin(a) * s * Math.cos(e), (life || 0.8) * (0.6 + Math.random() * 0.6), kind === 'conf' ? 0.07 : 0.16, cols[i % cols.length], kind); }
    }
    function buildCrowd() {
      crowd = [];
      var cols = ['#ff7a1a', '#2ab8ff', '#f2c230', '#c2272d', '#f4f1ea', '#b06bff', '#3a4a6a', '#6a3a3a', '#2f5d50'];
      var skins = ['#c98f66', '#b77b54', '#a26a47', '#8c5a3b', '#d9a47b'];
      var add = function (x0, z0, ax, az, n, rows, bx, bz) {
        for (var r = 0; r < rows; r++) for (var i = 0; i < n; i++) {
          if (Math.random() > 0.9) continue;
          crowd.push({ x: x0 + ax * i * 0.9 + bx * r * 0.85 + rnd(-0.2, 0.2), y: 0.5 + r * 0.45, z: z0 + az * i * 0.9 + bz * r * 0.85 + rnd(-0.2, 0.2), c: cols[(Math.random() * cols.length) | 0], s: skins[(Math.random() * skins.length) | 0], p: Math.random() * TAU, f: 1.4 + Math.random() * 1.6 });
        }
      };
      add(-12, 9.6, 1, 0, 27, 9, 0, 1);
      add(9.6, 11, 0, -1, 23, 9, 1, 0);
      add(-9.6, -9.6, 0, 1, 23, 9, -1, 0);
      add(-12, -10, 1, 0, 9, 9, 0, -1);
      add(4.4, -10, 1, 0, 9, 9, 0, -1);
    }
    /* ---------------------------------------------------------- the director */
    function director(G, dt) {
      var n = 0, fx = 0, fz = 0, fy = 0, mnx = 9, mxx = -9, mnz = 9, mxz = -9;
      G.W.forEach(function (w) { if (w.hidden || w.gone || w.elim || w.apron) return; fx += w.x; fz += w.z; fy += w.yb; n++; mnx = Math.min(mnx, w.x); mxx = Math.max(mxx, w.x); mnz = Math.min(mnz, w.z); mxz = Math.max(mxz, w.z); });
      if (n) { fx /= n; fz /= n; fy /= n; } else fy = RH;
      var portrait = W < H * 0.85;
      var half = Math.max(2.4, Math.hypot(mxx - mnx, mxz - mnz) / 2 + 1.4);
      var px, py, pz, tx, ty, tz;
      if (G.phase === 'entrance' && G.entGroup) {
        var w = G.entGroup[0];
        // the entrant about a third of the frame tall, the pyro either side
        var De = 2.75 * (G.entGroup.length > 1 ? 1.35 : 1) / Math.tan(portrait ? 0.47 : 0.38);
        tx = w.x; ty = w.yb + 1.3; tz = w.z; px = w.x + 0.6; py = Math.max(w.yb + 1.5, w.z > -8 ? RH + 1.7 : 0); pz = Math.min(w.z + De, -3.9);
      } else if (G.phase === 'replay' && replay) {
        var ang = replay.ang + (G.replay ? G.replay.t : 0) * 0.2, D = portrait ? 8 : 6;
        tx = replay.fx; ty = RH + 0.9; tz = replay.fz; px = tx + Math.sin(ang) * D; py = RH + 1.6; pz = tz + Math.cos(ang) * D;
      } else if (G.phase === 'post' && G.winner) {
        var ww = G.winner, a2 = ww.yaw + 0.5 + G.pt * 0.12, D2 = portrait ? 7 : 5;
        tx = ww.x; ty = ww.yb + 1.3; tz = ww.z; px = ww.x + Math.sin(a2) * D2; py = ww.yb + 1.2; pz = ww.z + Math.cos(a2) * D2;
      } else {
        var aspect = W / Math.max(1, H), vf = 0.5, hf = Math.atan(Math.tan(vf) * aspect);
        var D3 = clamp(Math.max((half + (portrait ? 0.5 : 1)) / Math.tan(hf), half / Math.tan(vf)), 8, portrait ? 17 : 15);
        if (G.cfg.attract) D3 *= 1.1;
        cam.yaw = lerp(cam.yaw, PI + clamp(fx * 0.05, -0.18, 0.18) + (G.cfg.attract ? Math.sin(time * 0.08) * 0.5 : 0), Math.min(1, dt * 1.5));
        tx = fx * 0.85; ty = fy + 1 + (portrait ? 0.3 : 0); tz = fz * 0.72 + (portrait ? 0.5 : 0);
        px = tx - Math.sin(cam.yaw) * D3; py = ty + D3 * (portrait ? 0.5 : 0.42); pz = tz - Math.cos(cam.yaw) * D3;
      }
      var k = cam.init ? Math.min(1, dt * 2.6) : 1; cam.init = true;
      var sx = ARC && ARC.shakeX ? ARC.shakeX * 0.01 : 0, sy = ARC && ARC.shakeY ? ARC.shakeY * 0.01 : 0;
      setCam(lerp(cam.x, px, k) + sx, lerp(cam.y, py, k) + sy, lerp(cam.z, pz, k), lerp(cam.tx, tx, k), lerp(cam.ty, ty, k), lerp(cam.tz, tz, k));
      cam.f = H / 2 / Math.tan(portrait ? 0.47 : 0.38);
    }
    /* ---------------------------------------------------------- the arena */
    var P0 = { x: 0, y: 0, s: 1, z: 0 }, P1 = { x: 0, y: 0, s: 1, z: 0 }, P2 = { x: 0, y: 0, s: 1, z: 0 }, P3 = { x: 0, y: 0, s: 1, z: 0 };
    function quad(g, ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, fill) {
      if (!proj(ax, ay, az, P0) || !proj(bx, by, bz, P1) || !proj(cx, cy, cz, P2) || !proj(dx, dy, dz, P3)) return;
      g.fillStyle = fill; g.beginPath(); g.moveTo(P0.x, P0.y); g.lineTo(P1.x, P1.y); g.lineTo(P2.x, P2.y); g.lineTo(P3.x, P3.y); g.closePath(); g.fill();
    }
    function drawArena(g, G) {
      var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#07060c'); bg.addColorStop(1, '#120e14');
      g.fillStyle = bg; g.fillRect(0, 0, W, H);
      // stage and titantron in the distance
      quad(g, -12, 0, STAGE_Z - 5, 12, 0, STAGE_Z - 5, 12, 13, STAGE_Z - 5, -12, 13, STAGE_Z - 5, '#0c0a10');
      if (proj(-5.6, 10.5, STAGE_Z - 5, P0) && proj(5.6, 4.2, STAGE_Z - 5, P1)) {
        var sw = P1.x - P0.x, sh = P1.y - P0.y;
        var tg = g.createLinearGradient(P0.x, P0.y, P1.x, P1.y); tg.addColorStop(0, '#1a0c18'); tg.addColorStop(1, '#06040a');
        g.fillStyle = tg; g.fillRect(P0.x, P0.y, sw, sh);
        g.fillStyle = tron.col; g.fillRect(P0.x, P1.y - sh * 0.05, sw, sh * 0.05);
        g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#fff';
        g.font = '700 ' + Math.max(8, Math.round(sh * 0.3)) + 'px Georgia, serif'; g.fillText(tron.title, P0.x + sw / 2, P0.y + sh * 0.42);
        g.font = '600 ' + Math.max(6, Math.round(sh * 0.1)) + 'px Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText(tron.sub, P0.x + sw / 2, P0.y + sh * 0.72);
      }
      quad(g, -9, 0, STAGE_Z - 5, 9, 0, STAGE_Z - 5, 9, STAGE_Y, STAGE_Z + 1.9, -9, STAGE_Y, STAGE_Z + 1.9, '#141018');
      quad(g, -1.7, STAGE_Y, STAGE_Z + 1.9, 1.7, STAGE_Y, STAGE_Z + 1.9, 1.7, 0, RAMP_END, -1.7, 0, RAMP_END, '#1c1622');
      // floor and mats
      quad(g, -30, 0, -30, 30, 0, -30, 30, 0, 30, -30, 0, 30, '#1a1816');
      quad(g, -FLOOR, 0.01, -FLOOR, FLOOR, 0.01, -FLOOR, FLOOR, 0.01, FLOOR, -FLOOR, 0.01, FLOOR, '#1a2a4a');
      // crowd: back to front so near people overlap far
      var ex = G.crowd;
      for (var i = 0; i < crowd.length; i++) {
        var c = crowd[i];
        var bob = Math.max(0, Math.sin(time * c.f + c.p)) * (0.05 + ex * 0.25);
        if (!proj(c.x, c.y + 0.5 + bob, c.z, P0)) continue;
        var s = P0.s;
        if (s < 1.5) continue;
        g.fillStyle = shade(c.c, 0.55 + ex * 0.25); g.fillRect(P0.x - s * 0.2, P0.y, s * 0.4, s * 0.55);
        g.fillStyle = shade(c.s, 0.6); g.beginPath(); g.arc(P0.x, P0.y - s * 0.12, s * 0.12, 0, TAU); g.fill();
        if (ex > 0.7 && (i % 3 === 0)) { g.strokeStyle = shade(c.s, 0.6); g.lineWidth = Math.max(1, s * 0.06); g.beginPath(); g.moveTo(P0.x - s * 0.18, P0.y + s * 0.05); g.lineTo(P0.x - s * 0.25, P0.y - s * 0.35 - bob * s); g.stroke(); }
      }
      // barricade
      var B = FLOOR + 0.35;
      quad(g, -B, 0, B, B, 0, B, B, 1.05, B, -B, 1.05, B, '#141218');
      quad(g, -B, 0.7, B, B, 0.7, B, B, 0.95, B, -B, 0.95, B, '#3a1c0a');
      // the ring box
      quad(g, -APRON, 0, APRON, APRON, 0, APRON, APRON, RH, APRON, -APRON, RH, APRON, '#100d12');
      quad(g, APRON, 0, APRON, APRON, 0, -APRON, APRON, RH, -APRON, APRON, RH, APRON, '#0c0a0e');
      quad(g, -APRON, 0, -APRON, -APRON, 0, APRON, -APRON, RH, APRON, -APRON, RH, -APRON, '#0c0a0e');
      if (proj(0, RH * 0.55, APRON, P0)) { g.fillStyle = '#7d766c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '700 ' + Math.round(P0.s * 0.36) + 'px Georgia, serif'; g.fillText('RING RAJAS', P0.x, P0.y); }
      quad(g, -APRON, RH, -APRON, APRON, RH, -APRON, APRON, RH, APRON, -APRON, RH, APRON, '#1d2433');
      quad(g, -ROPE, RH + 0.002, -ROPE, ROPE, RH + 0.002, -ROPE, ROPE, RH + 0.002, ROPE, -ROPE, RH + 0.002, ROPE, '#d9d4ca');
      // the centre logo
      g.strokeStyle = 'rgba(196,87,42,0.85)'; g.lineWidth = 3; g.beginPath();
      for (var a = 0; a <= 40; a++) { var an = a / 40 * TAU; proj(Math.cos(an) * 1.0, RH + 0.003, Math.sin(an) * 1.0, P0); if (a === 0) g.moveTo(P0.x, P0.y); else g.lineTo(P0.x, P0.y); }
      g.stroke();
      if (proj(0, RH + 0.003, 0, P0)) { g.save(); g.translate(P0.x, P0.y); g.scale(1, 0.45); g.fillStyle = 'rgba(196,87,42,0.85)'; g.font = '700 ' + Math.round(P0.s * 1.0) + 'px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RR', 0, 0); g.restore(); }
    }
    function postAt(cx, cz) {
      var top = RH + 1.45;
      if (proj(cx, 0, cz, P0) && proj(cx, top, cz, P1)) { return { b: { x: P0.x, y: P0.y }, t: { x: P1.x, y: P1.y }, s: P1.s }; }
      return null;
    }
    function drawRopes(g, far) {
      var cs = [[-POST, -POST], [POST, -POST], [POST, POST], [-POST, POST]];
      // posts
      for (var i = 0; i < 4; i++) {
        var c = cs[i], isFar = c[1] < 0; if (isFar !== far) continue;
        var p = postAt(c[0], c[1]); if (!p) continue;
        g.strokeStyle = '#8d9299'; g.lineWidth = Math.max(2, p.s * 0.15); g.lineCap = 'round'; g.beginPath(); g.moveTo(p.b.x, p.b.y); g.lineTo(p.t.x, p.t.y); g.stroke();
        var pc = ['#c2272d', '#1f5fc2', '#e8e2d6', '#e8e2d6'][i];
        for (var h = 0; h < 3; h++) { if (proj(c[0] * 0.97, RH + 0.45 + h * 0.4, c[1] * 0.97, P0)) { g.fillStyle = pc; g.fillRect(P0.x - P0.s * 0.1, P0.y - P0.s * 0.13, P0.s * 0.2, P0.s * 0.26); } }
      }
      var cols = ['#1f5fc2', '#f2ebe0', '#c2272d'];
      for (var r = 0; r < 4; r++) {
        var R0 = ropes[r];
        var isFarR = R0.ax === 'z' ? R0.sg < 0 : true;
        if (far !== isFarR) continue;
        for (var hh = 0; hh < 3; hh++) {
          var y = RH + 0.45 + hh * 0.4;
          g.strokeStyle = cols[hh]; g.lineWidth = 2; g.beginPath();
          for (var s = 0; s <= 12; s++) {
            var u = s / 12 * 2 - 1, bow = R0.b * (1 - u * u) * (0.6 + hh * 0.2);
            var x = R0.ax === 'x' ? R0.sg * (ROPE + bow) : u * POST, z = R0.ax === 'z' ? R0.sg * (ROPE + bow) : u * POST;
            if (!proj(x, y, z, P0)) continue;
            if (s === 0) g.moveTo(P0.x, P0.y); else g.lineTo(P0.x, P0.y);
          }
          g.stroke();
        }
      }
    }
    /* ---------------------------------------------------------- people */
    // A figure in body space (metres, pelvis at the origin, +y up, +z forward), posed from the anim.
    var J = {};
    ['hd', 'nk', 'ch', 'pv', 'shL', 'shR', 'elL', 'elR', 'haL', 'haR', 'hiL', 'hiR', 'knL', 'knR', 'ftL', 'ftR'].forEach(function (k) { J[k] = { x: 0, y: 0, z: 0, sx: 0, sy: 0, s: 1, d: 0 }; });
    function arm(side, fwd, up, out, bend, sh, el, ha) {
      // shoulder-relative direction from three weights, upper arm 0.29, forearm 0.26
      var dx = out * side, dy = -1 + up, dz = fwd, l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      el.x = sh.x + dx * 0.29; el.y = sh.y + dy * 0.29; el.z = sh.z + dz * 0.29;
      var bx = dx, by = dy + bend * 0.9, bz = dz + bend * 0.6, bl = Math.hypot(bx, by, bz) || 1;
      ha.x = el.x + bx / bl * 0.26; ha.y = el.y + by / bl * 0.26; ha.z = el.z + bz / bl * 0.26;
    }
    function leg(side, fwd, lift, out, bend, hi, kn, ft) {
      var dx = out * side, dy = -1, dz = fwd, l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      kn.x = hi.x + dx * 0.42; kn.y = hi.y + dy * 0.42 + lift * 0.3; kn.z = hi.z + dz * 0.42;
      ft.x = kn.x + dx * 0.4 * (1 - bend * 0.3); ft.y = kn.y - 0.4 * (1 - bend * 0.5); ft.z = kn.z - bend * 0.32 + dz * 0.2;
    }
    function poseFigure(w) {
      var a = w.anim || 'idle', k = w.ak || 0, t = time + w.i;
      var walk = (a === 'walk' || a === 'run') ? 1 : 0, ph = t * (a === 'run' ? 9 : 6);
      var aL = [0.2, 0, 0.12, 0.2], aR = [0.2, 0, 0.12, 0.2], lL = [0, 0, 0.12, 0], lR = [0, 0, 0.12, 0];
      var inRing = !w.out && !w.apron;
      var guard = inRing && (a === 'idle' || a === 'walk');
      if (guard) { aL = [0.9, 0.5, 0.2, 1]; aR = [0.9, 0.5, 0.2, 1]; }
      if (walk) { var sw = Math.sin(ph) * (a === 'run' ? 0.8 : 0.45); lL[0] = sw; lR[0] = -sw; lL[3] = Math.max(0, -Math.cos(ph)) * 0.6; lR[3] = Math.max(0, Math.cos(ph)) * 0.6; if (!guard) { aL[0] = -sw * 0.7; aR[0] = sw * 0.7; } }
      var hit = function (kk, i0) { return kk > i0 - 0.2 && kk < i0 + 0.25; };
      if (a === 'jab' || a === 'hook' || a === 'forearm' || a === 'chop') { if (hit(k, 0.5)) aR = [1.4, 0.95, a === 'hook' ? 0.6 : 0.05, 0.05]; }
      else if (a === 'kick' || a === 'bigboot' || a === 'superkick' || a === 'roundkick' || a === 'kickFlurry') { if (hit(k, 0.5)) lR = [1.8, 0.5, 0.1, 0]; }
      else if (a === 'clothes' || a === 'lariat') { aR = [0.3, 0.9, 1.2, 0]; }
      else if (a === 'lock' || a.indexOf(':a') > 0 && k < 0.3) { aL = [1.2, 0.85, 0.1, 0.6]; aR = [1.2, 0.85, 0.1, 0.6]; }
      if (a.indexOf(':a') > 0 && k >= 0.3) { aL = [0.6, 1.8, 0.3, 0.3]; aR = [0.6, 1.8, 0.3, 0.3]; }
      if (a.indexOf(':d') > 0 || a === 'fallBack' || a === 'fallFront' || a === 'overTop') { aL = [0.3, 0.6, 1.0, 0.3]; aR = [0.3, 0.6, 1.0, 0.3]; lL = [0.3, 0, 0.2, 0.4]; }
      if (a === 'down' || a === 'downFront' || a === 'pinned' || a === 'kickout') { aL = [0, 1.0, 1.0, 0.1]; aR = [0, 1.0, 1.0, 0.1]; lL = [0, 0, 0.15, 0]; lR = [w.dmg > 55 ? 0.9 : 0, 0, 0.15, w.dmg > 55 ? 1 : 0]; }
      if (a === 'cover') { aL = [1.4, 0.9, 0.3, 0.4]; aR = [1.4, 0.9, 0.3, 0.4]; lL = [0, 0, 0.5, 0.5]; lR = [0, 0, 0.5, 0.5]; }
      if (a === 'bridge') { aL = [-0.3, 2, 0.2, 0.2]; aR = [-0.3, 2, 0.2, 0.2]; lL = [0.6, 0, 0.3, 1.2]; lR = [0.6, 0, 0.3, 1.2]; }
      if (a === 'perch') { lL = [1.2, 1, 0.3, 1.4]; lR = [1.2, 1, 0.3, 1.4]; aL = [0.3, 0.8, 1.2, 0.2]; aR = [0.3, 0.8, 1.2, 0.2]; }
      if (a === 'splash' || a === 'crossbody' || a === 'elbowDive') { aL = [0, 1, 1.4, 0]; aR = [0, 1, 1.4, 0]; lL = [0, 0, 0.3, 0.2]; lR = [0, 0, 0.3, 0.2]; }
      if (a === 'climb') { aL = [0.5, 2, 0.4, 0.5]; aR = [0.5, 2, 0.4, 0.5]; lL = [1, 0.8, 0.1, 1.2]; }
      if (a.indexOf('hold:') === 0) { var ar = a.indexOf(':a') > 0; aL = ar ? [1.2, 0.8, 0.2, 0.8] : [0.6, 0.8, 0.6, 0.6]; aR = aL; if (ar && a.indexOf('sit') > 0) { lL = [1.2, 0, 0.6, 1.4]; lR = [1.2, 0, 0.6, 1.4]; } }
      if (a === 'taunt' || a === 'celebrate') { var up = Math.abs(Math.sin(t * 3)); aL = [0.2, 2.2, 0.6, 0.2 + up * 0.3]; aR = [0.2, 2.2, 0.6, 0.2 + up * 0.3]; }
      if (a === 'getup') { lL = [1.0, 0.6, 0.15, 1.4 * (1 - k)]; }
      if (w.apron) { aL = [0.6, 1.6, 0.3, 0.6]; aR = w.reach ? [1.5, 0.9, 0.1, 0] : [0.6, 1.6, 0.3, 0.6]; }
      var sc = w.def.height / 1.75;
      J.pv.x = 0; J.pv.y = 0; J.pv.z = 0;
      J.ch.x = 0; J.ch.y = 0.42 * sc; J.ch.z = 0; J.nk.x = 0; J.nk.y = 0.62 * sc; J.nk.z = 0; J.hd.x = 0; J.hd.y = 0.8 * sc; J.hd.z = 0.02;
      J.shL.x = 0.19 * sc; J.shL.y = 0.56 * sc; J.shL.z = 0; J.shR.x = -0.19 * sc; J.shR.y = 0.56 * sc; J.shR.z = 0;
      J.hiL.x = 0.1 * sc; J.hiL.y = -0.05; J.hiL.z = 0; J.hiR.x = -0.1 * sc; J.hiR.y = -0.05; J.hiR.z = 0;
      arm(1, aL[0], aL[1], aL[2], aL[3], J.shL, J.elL, J.haL); arm(-1, aR[0], aR[1], aR[2], aR[3], J.shR, J.elR, J.haR);
      leg(1, lL[0], lL[1], lL[2], lL[3], J.hiL, J.knL, J.ftL); leg(-1, lR[0], lR[1], lR[2], lR[3], J.hiR, J.knR, J.ftR);
    }
    var KEYS = Object.keys(J);
    function toWorld(w, x, y, z, o) {
      // pelvis frame: pitch about x, roll about z, then yaw, then translate
      var p = w.pitch || 0, r = w.roll || 0, yw = (w.yaw || 0) + (w.yawOff || 0);
      var cy = Math.cos(p), sy = Math.sin(p);
      var y1 = y * cy - z * sy, z1 = y * sy + z * cy;
      var cr = Math.cos(r), sr = Math.sin(r);
      var x2 = x * cr - y1 * sr, y2 = x * sr + y1 * cr;
      var c = Math.cos(yw), s = Math.sin(yw);
      o.x = w.x + x2 * c + z1 * s; o.z = w.z - x2 * s + z1 * c; o.y = w.yb + Math.max(0.08, w.h * PHf(w)) + y2;
    }
    var TMP = { x: 0, y: 0, z: 0 };
    function seg(g, a, b, wid, col) { g.strokeStyle = col; g.lineWidth = Math.max(1.5, wid); g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.stroke(); }
    function drawFigure(g, w, isRef) {
      poseFigure(w);
      for (var i = 0; i < KEYS.length; i++) { var j = J[KEYS[i]]; toWorld(w, j.x, j.y, j.z, TMP); if (!proj(TMP.x, TMP.y, TMP.z, out)) return; j.sx = out.x; j.sy = out.y; j.s = out.s; j.d = out.z; }
      var o = w.outfit || {}, skin = w.def.skin || '#c98f66', top = o.top || '#e8e2d6', bot = o.bottom || '#2f3a52', boot = o.socks || o.shoes || '#222';
      var s = J.pv.s, dark = clamp(1.25 - J.pv.d / 30, 0.55, 1.1);
      // shadow
      if (proj(w.x, w.yb + 0.01, w.z, out)) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(out.x, out.y, out.s * (w.h < 0.5 ? 0.9 : 0.4), out.s * (w.h < 0.5 ? 0.3 : 0.14), 0, 0, TAU); g.fill(); }
      g.lineCap = 'round'; g.lineJoin = 'round';
      var farL = J.shL.d > J.shR.d;
      var limbs = function (L) {
        var hi = L ? J.hiL : J.hiR, kn = L ? J.knL : J.knR, ft = L ? J.ftL : J.ftR;
        seg(g, hi, kn, s * 0.17, shade(bot, dark * (L === farL ? 0.8 : 1))); seg(g, kn, ft, s * 0.14, shade(o.legs === 'trousers' ? bot : skin, dark * (L === farL ? 0.8 : 1))); seg(g, { sx: ft.sx, sy: ft.sy }, { sx: ft.sx + 0.5, sy: ft.sy + 0.5 }, s * 0.15, shade(boot, dark));
      };
      var arms = function (L) {
        var sh = L ? J.shL : J.shR, el = L ? J.elL : J.elR, ha = L ? J.haL : J.haR;
        seg(g, sh, el, s * 0.12, shade(o.sleeves === 'long' ? top : skin, dark * (L === farL ? 0.82 : 1))); seg(g, el, ha, s * 0.1, shade(o.sleeves === 'long' ? top : skin, dark * (L === farL ? 0.82 : 1)));
        g.fillStyle = shade(skin, dark); g.beginPath(); g.arc(ha.sx, ha.sy, s * 0.06, 0, TAU); g.fill();
      };
      limbs(farL); arms(farL);
      // torso
      g.lineCap = 'butt'; seg(g, J.pv, J.nk, s * 0.34, shade(top, dark)); g.lineCap = 'round';
      seg(g, J.pv, J.ch, s * 0.32, shade(o.top2 || top, dark * 0.95));
      g.fillStyle = shade(bot, dark); g.beginPath(); g.arc(J.pv.sx, J.pv.sy, s * 0.17, 0, TAU); g.fill();
      limbs(!farL); arms(!farL);
      // head
      seg(g, J.nk, J.hd, s * 0.1, shade(skin, dark));
      g.fillStyle = shade(w.def.mask || skin, dark); g.beginPath(); g.arc(J.hd.sx, J.hd.sy, s * 0.12, 0, TAU); g.fill(); g.strokeStyle = 'rgba(10,8,12,0.45)'; g.lineWidth = Math.max(1, s * 0.012); g.stroke();
      if (w.def.hair !== 'bald' && !w.def.mask) { g.fillStyle = shade(w.def.hairColor || '#1d1511', dark); g.beginPath(); g.arc(J.hd.sx, J.hd.sy - s * 0.03, s * 0.12, PI, TAU); g.fill(); }
      if (isRef) { g.strokeStyle = '#16161b'; g.lineWidth = Math.max(1, s * 0.04); for (var st = 0; st < 4; st++) { var tt = 0.2 + st * 0.18; g.beginPath(); g.moveTo(lerp(J.pv.sx, J.nk.sx, tt) - s * 0.15, lerp(J.pv.sy, J.nk.sy, tt)); g.lineTo(lerp(J.pv.sx, J.nk.sx, tt) + s * 0.15, lerp(J.pv.sy, J.nk.sy, tt)); g.stroke(); } }
    }
    var REFW = { def: { height: 1.76, skin: '#c98f66', hair: 'short', hairColor: '#2a1d15' }, outfit: { top: '#e8e2d6', bottom: '#16161b', legs: 'trousers', socks: '#111' }, i: 9, x: 0, z: 0, yb: RH, yaw: 0, h: 1, pitch: 0, roll: 0, anim: 'idle', ak: 0, out: false, apron: false };
    /* ---------------------------------------------------------- replay snapshots */
    var FIELDS = ['x', 'z', 'yb', 'h', 'pitch', 'roll', 'yaw', 'yawOff', 'ak'];
    function record(G, dt) {
      rec.t += dt;
      var snap = rec.buf[rec.head] || (rec.buf[rec.head] = { t: 0, w: [], anims: [] });
      snap.t = rec.t;
      G.W.forEach(function (w, i) { var a = snap.w[i] || (snap.w[i] = new Float32Array(FIELDS.length)); for (var f = 0; f < FIELDS.length; f++) a[f] = w[FIELDS[f]] || 0; snap.anims[i] = w.anim; });
      rec.head = (rec.head + 1) % RECN; rec.n = Math.min(RECN, rec.n + 1);
    }
    var GHOST = [];
    function ghosts(G, t) {
      // the snapshot nearest t, applied to copies of the wrestlers
      var best = null;
      for (var i = 0; i < rec.n; i++) { var s = rec.buf[(rec.head - 1 - i + RECN) % RECN]; if (s.t <= t) { best = s; break; } }
      if (!best) return null;
      G.W.forEach(function (w, i) {
        var gh = GHOST[i] || (GHOST[i] = {}); gh.def = w.def; gh.outfit = w.outfit; gh.i = w.i; gh.hidden = w.hidden; gh.gone = w.gone; gh.apron = w.apron; gh.out = w.out; gh.dmg = w.dmg;
        var a = best.w[i]; if (!a) return; for (var f = 0; f < FIELDS.length; f++) gh[FIELDS[f]] = a[f]; gh.anim = best.anims[i];
      });
      return GHOST;
    }
    /* ---------------------------------------------------------- the view */
    var order = [];
    var view = {
      name: '2d', three: false,
      init: function (a) { ARC = a; buildCrowd(); return true; },
      resize: function (a) { W = a.w; H = a.h; },
      newMatch: function (G) { G0 = G; cam.init = false; rec.n = 0; replay = null; tron = { title: 'RING RAJAS', sub: G.cfg.attract ? 'Monday Akhada  LIVE' : 'Live', col: '#ff7a1a' }; },
      event: function (type, d, G) {
        if (type === 'rope') { ropes.forEach(function (r) { if ((r.ax === 'x' && Math.abs(d.x) > 2.5 && Math.sign(d.x) === r.sg) || (r.ax === 'z' && Math.abs(d.z) > 2.5 && Math.sign(d.z) === r.sg)) r.v -= 2.6; }); }
        else if (type === 'impact') { burst(d.x, (d.y || 0) + 0.1, d.z, d.big >= 3 ? 26 : d.big >= 2 ? 16 : 8, d.big >= 2 ? 2.2 : 1.4, ['#d8cfc0', '#bfb4a2', '#efe6d8'], 'dust', 0.9); if (d.big >= 3 && !(ARC && ARC.reducedMotion)) flash = 0.5; }
        else if (type === 'hit') { burst(d.x, (d.y || 0) + 1.4, d.z, 4, 1.2, ['#fff3e0'], 'spark', 0.3); }
        else if (type === 'entrance') { tron = { title: d.w.def.nick.toUpperCase(), sub: d.w.def.name + ', ' + d.w.def.from, col: d.w.def.col }; pyroT = 1.2; pyroCol = d.w.def.col; }
        else if (type === 'win') { tron = { title: d.w.def.nick.toUpperCase(), sub: 'Your winner', col: d.w.def.col }; burst(0, RH + 4, 0, 90, 3.5, [d.w.def.col, '#ffd36a', '#ffffff'], 'conf', 3.2); pyroT = 1.6; pyroCol = d.w.def.col; }
        else if (type === 'replay') {
          var fx = 0, fz = 0, n = 0; G.W.forEach(function (w) { if (!w.hidden && !w.elim) { fx += w.x; fz += w.z; n++; } }); if (n) { fx /= n; fz /= n; }
          replay = { from: rec.t - Math.min(3.2, d.dur * d.slow + 0.4), to: rec.t, t0: time, dur: d.dur, fx: fx, fz: fz, ang: Math.atan2(cam.x - fx, cam.z - fz) + PI * 0.75 };
          tron = { title: 'REPLAY', sub: 'The big moment, again', col: '#ffd36a' };
        }
        else if (type === 'replayEnd') { replay = null; tron = { title: 'RING RAJAS', sub: 'Live', col: '#ff7a1a' }; }
        else if (type === 'reverse') { burst(d.a.x, d.a.yb + 1.2, d.a.z, 10, 1.6, ['#ffd36a'], 'spark', 0.4); }
      },
      project: function (x, y, z, o) { return proj(x, y, z, o); },
      camYaw: function () { return cam.yaw; },
      render: function (a, G, g) {
        W = a.w; H = a.h;
        var dt = a.state === 'pause' ? 0 : 1 / 60;
        time += dt;
        if (G !== G0) view.newMatch(G);
        director(G, dt);
        // rope springs and particles
        ropes.forEach(function (r) { r.v += (-r.b * 140 - r.v * 9) * dt; r.b += r.v * dt; });
        drawArena(g, G);
        drawRopes(g, true);
        // people, far first
        var list = G.W;
        if (G.phase === 'replay' && replay) { var k = clamp((time - replay.t0) / replay.dur, 0, 1); var gl = ghosts(G, lerp(replay.from, replay.to, k)); if (gl) list = gl; }
        else if (dt > 0) record(G, dt);
        order.length = 0;
        list.forEach(function (w) { if (!w.hidden && !w.gone) order.push(w); });
        var r = G.ref; REFW.x = r.x; REFW.z = r.z; REFW.yaw = r.yaw; REFW.h = r.anim === 'count' ? 0.5 : 1; REFW.pitch = r.anim === 'count' ? 0.8 : 0; REFW.anim = r.speed > 0.2 ? 'walk' : 'idle'; REFW.out = true;
        order.push(REFW);
        order.sort(function (p, q) { proj(p.x, p.yb, p.z, P0); var dp = P0.z; proj(q.x, q.yb, q.z, P0); return P0.z - dp; });
        for (var i = 0; i < order.length; i++) drawFigure(g, order[i], order[i] === REFW);
        drawRopes(g, false);
        // pyro on the stage lip
        if (pyroT > 0) {
          pyroT -= dt;
          [-6.5, -3.2, -1.25, 1.25, 3.2, 6.5].forEach(function (x) { for (var f = 0; f < 3; f++) emit(x + rnd(-0.2, 0.2), STAGE_Y + 0.2, STAGE_Z + 1.5, rnd(-0.3, 0.3), rnd(3, 6), 0, 0.6, 0.5, f ? pyroCol : '#ffd36a', 'fire'); });
        }
        // particles
        for (var p = parts.length - 1; p >= 0; p--) {
          var q = parts[p]; q.life -= dt; if (q.life <= 0) { parts.splice(p, 1); continue; }
          q.vy -= (q.kind === 'conf' ? 1.2 : q.kind === 'fire' ? -1 : 4) * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
          var drag = q.kind === 'dust' ? 2.5 : 0.8; q.vx *= 1 - drag * dt; q.vz *= 1 - drag * dt;
          if (!proj(q.x, q.y, q.z, P0)) continue;
          var al = q.life / q.max, sz = Math.max(1, q.size * P0.s * (q.kind === 'dust' ? (2 - al) : 1));
          g.globalAlpha = q.kind === 'dust' ? al * 0.35 : al;
          g.fillStyle = q.col;
          if (q.kind === 'conf') g.fillRect(P0.x - sz, P0.y - sz * 0.5, sz * 2, sz);
          else { g.beginPath(); g.arc(P0.x, P0.y, sz, 0, TAU); g.fill(); }
        }
        g.globalAlpha = 1;
        if (flash > 0) { g.fillStyle = 'rgba(255,248,230,' + flash * 0.6 + ')'; g.fillRect(0, 0, W, H); flash = Math.max(0, flash - dt * 2); }
        if (G.phase === 'replay') { g.fillStyle = '#000'; g.fillRect(0, 0, W, H * 0.06); g.fillRect(0, H * 0.94, W, H * 0.06); }
        return true;
      },
      debug: function () { return { quality: 0, parts: parts.length, crowd: crowd.length, cam: [+cam.x.toFixed(2), +cam.y.toFixed(2), +cam.z.toFixed(2), +cam.tx.toFixed(2), +cam.tz.toFixed(2), +cam.yaw.toFixed(2)] }; },
      dev: { quality: function () {}, setQuality: function () {}, pyro: function (sec) { pyroT = sec || 3; pyroCol = '#ff8a2a'; } },
    };
    M.boot(view);
  }).catch(function (e) { console.warn('Ring Rajas could not start', e && e.message); });
})();
