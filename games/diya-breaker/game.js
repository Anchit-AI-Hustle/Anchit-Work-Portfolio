/*
 * Diya Breaker, the 2D edition, for browsers without WebGL2. The game itself,
 * its rules, physics, levels, controls, HUD and sound come from core.js,
 * exactly as in 3D; this file only draws the board from above.
 */
(function () {
  'use strict';
  import('/games/diya-breaker/core.js').then(function (M) {
    var HALF = M.HALF, TOPY = M.TOPY, PAD_Y = M.PAD_Y, PAD_H = M.PAD_H, BALL_R = M.BALL_R, TAU = M.TAU, clamp = M.clamp, lerp = M.lerp;
    var ARC = null, W = 0, H = 0, S = 20, CX = 0, BY = 0, parts = [], shards = [], rings = [], evRead = 0, flash = 0, G0 = null, fwN = 0, fwT = 0, rise = [], levelKey = '';
    var LOOK = [
      { bg0: '#2a1a2c', bg1: '#120b09', floor: '#2c201b', line: 'rgba(255,220,170,0.08)', wall: '#a07650', inlay: '#ffb04a' },
      { bg0: '#132230', bg1: '#081014', floor: '#1e2628', line: 'rgba(170,220,255,0.08)', wall: '#7d7a72', inlay: '#5fe0ff' },
      { bg0: '#0c0a20', bg1: '#040308', floor: '#18141e', line: 'rgba(255,170,230,0.08)', wall: '#6c5a6e', inlay: '#ff6ad0' }
    ];
    var look = LOOK[0];
    function sx(x) { return CX + x * S; }
    function sy(y) { return BY - (y + 1) * S; }
    function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    function fit(a) {
      W = a.w; H = a.h;
      var pad = a.hudPad(), top = pad.top + (W < 520 ? 96 : 108), bot = a.touchMode ? 30 : 22;
      S = Math.min(W * 0.97 / (HALF * 2 + 1.2), (H - top - bot) / (TOPY + 1.6));
      CX = W / 2; BY = H - bot - Math.max(0, (H - top - bot) - S * (TOPY + 1.6)) / 2;
    }
    function emit(x, y, vx, vy, life, size, col, kind) {
      if (parts.length > 700) parts.shift();
      parts.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, size: size, col: col, kind: kind || 'spark' });
    }
    function burst(x, y, n, sp, col, kind) { for (var i = 0; i < n; i++) { var a = Math.random() * TAU, s = sp * (0.3 + Math.random() * 0.8); emit(x, y, Math.cos(a) * s, Math.sin(a) * s, 0.4 + Math.random() * 0.5, 0.08 + Math.random() * 0.08, col, kind); } }
    function shard(x, y, col, n) { for (var i = 0; i < n; i++) { if (shards.length > 300) shards.shift(); shards.push({ x: x + (Math.random() - 0.5) * 0.8, y: y + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5) * 5, vy: (Math.random() - 0.2) * 5, r: Math.random() * 6, w: (Math.random() - 0.5) * 14, life: 0.8 + Math.random() * 0.4, max: 1.2, col: col, s: 0.08 + Math.random() * 0.08 }); } }
    function ring(x, y, col, max, dur) { rings.push({ x: x, y: y, col: col, max: max, dur: dur, t: 0 }); if (rings.length > 12) rings.shift(); }
    function firework(x, y) { var c = ['#ffb040', '#ff6ab0', '#6ac8ff', '#8aff8a', '#ffe070'][Math.floor(Math.random() * 5)]; for (var i = 0; i < 70; i++) { var a = Math.random() * TAU, s = 3 + Math.random() * 4; emit(x, y, Math.cos(a) * s, Math.sin(a) * s, 1.2 + Math.random() * 0.6, 0.1, c, 'fw'); } flash = Math.max(flash, 0.15); }
    function onEvent(e) {
      var rm = ARC.reducedMotion;
      switch (e.type) {
        case 'break': if (e.a === M.K_GLASS) { burst(e.x, e.y, 16, 4, '#e8f6ff'); shard(e.x, e.y, e.s, 10); } else { shard(e.x, e.y, e.s, 8); burst(e.x, e.y, 8, 3, '#ffd08a'); } ring(e.x, e.y, e.s, 1.3, 0.35); break;
        case 'crack': case 'gold': burst(e.x, e.y, 6, 3, '#ffe0a0'); break;
        case 'boom': burst(e.x, e.y, 34, 7, '#ffa040'); ring(e.x, e.y, '#ffb040', 3, 0.5); if (!rm) ARC.shake = Math.min(14, (ARC.shake || 0) + 3); break;
        case 'paddle': burst(e.x, PAD_Y + 0.2, 6, 2.5, '#ffd08a'); ring(e.x, PAD_Y + 0.2, '#ffd08a', 0.9, 0.3); break;
        case 'wall': burst(e.x, e.y, 4, 2, '#ffd08a'); break;
        case 'zap': burst(e.x, e.y, 8, 3, '#ff6a50'); break;
        case 'power': ring(e.x, PAD_Y, M.POWERS[e.s].col, 2.4, 0.5); burst(e.x, PAD_Y, 24, 3, M.POWERS[e.s].col); break;
        case 'lost': burst(e.x, PAD_Y - 0.6, 30, 4, '#ff6a40'); flash = rm ? 0 : 0.12; break;
        case 'clear': fwN = G0 && G0.cfg.attract ? 2 : 6; fwT = 0; break;
        case 'bossHit': burst(e.x, e.y, 22, 5, '#ffb040'); if (!rm) ARC.shake = Math.min(14, (ARC.shake || 0) + 3); break;
        case 'bossDown': for (var i = 0; i < 4; i++) firework(e.x + (Math.random() - 0.5) * 4, e.y + (Math.random() - 0.5) * 3); break;
        case 'stun': burst(e.x, PAD_Y, 24, 4, '#ff8040'); break;
        case 'shield': shard(e.x, e.y, e.s || '#c9553b', 6); break;
        case 'chain': if (!rm) ARC.shake = Math.min(18, (ARC.shake || 0) + 4 + e.a * 0.3); flash = rm ? 0 : Math.min(0.25, 0.05 + e.a * 0.01); break;
      }
    }
    function step(dt) {
      for (var i = parts.length - 1; i >= 0; i--) { var p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; } var dr = Math.exp(-1.6 * dt); p.vx *= dr; p.vy *= dr; if (p.kind === 'fw') p.vy -= 2 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      for (var k = shards.length - 1; k >= 0; k--) { var s = shards[k]; s.life -= dt; if (s.life <= 0) { shards.splice(k, 1); continue; } s.vy -= 9 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.r += s.w * dt; }
      for (var j = rings.length - 1; j >= 0; j--) { rings[j].t += dt; if (rings[j].t > rings[j].dur) rings.splice(j, 1); }
      flash = Math.max(0, flash - dt * 1.5);
      if (fwN > 0) { fwT -= dt; if (fwT <= 0) { fwN--; fwT = 0.35; firework((Math.random() - 0.5) * 9, 9 + Math.random() * 6); } }
    }
    function drawBrick(g, b, k, t) {
      var x = sx(b.x - 0.47), y = sy(b.y + 0.22), w = 0.94 * S, h = 0.44 * S, r = Math.max(2, S * 0.08);
      var lift = (1 - k) * S * 0.6;
      g.save(); g.globalAlpha = k; g.translate(0, lift);
      var kind = b.kind;
      var gr = g.createLinearGradient(0, y, 0, y + h);
      if (kind === M.K_GLASS) { gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.5, b.col); gr.addColorStop(1, 'rgba(0,0,0,0.25)'); g.globalAlpha = k * 0.85; }
      else if (kind === M.K_GOLD) { gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.5, '#e9b949'); gr.addColorStop(1, '#8a5a18'); }
      else if (kind === M.K_METAL) { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, b.col); gr.addColorStop(1, '#2a2420'); }
      else { gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, b.col); gr.addColorStop(1, '#2a1410'); }
      rr(g, x, y, w, h, r); g.fillStyle = gr; g.fill();
      if (kind === M.K_CLAY || kind === M.K_MOVE) { g.fillStyle = b.col; rr(g, x + w * 0.08, y + h * 0.18, w * 0.84, h * 0.5, r * 0.6); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 1; g.beginPath(); g.arc(x + w / 2, y + h * 0.43, h * 0.18, 0, TAU); g.stroke(); }
      if (kind === M.K_FIRE) { g.fillStyle = '#f2c040'; for (var i = 0; i < 3; i++) { g.fillRect(x + w * (0.2 + i * 0.25), y + 2, w * 0.08, h - 4); } g.fillStyle = 'rgba(255,200,80,' + (0.5 + 0.5 * Math.sin(t * 17 + b.x)) + ')'; g.beginPath(); g.arc(x + w / 2, y, 2.5, 0, TAU); g.fill(); }
      if (b.crack > 0) { g.strokeStyle = 'rgba(255,140,40,0.9)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x + w * 0.3, y + 2); g.lineTo(x + w * 0.45, y + h * 0.5); g.lineTo(x + w * 0.38, y + h - 2); if (b.crack > 0.5) { g.moveTo(x + w * 0.62, y + 2); g.lineTo(x + w * 0.7, y + h * 0.6); } g.stroke(); }
      g.strokeStyle = kind === M.K_GLASS ? 'rgba(255,255,255,0.9)' : b.col; g.lineWidth = 1.2; g.shadowColor = b.col; g.shadowBlur = kind === M.K_GLASS ? 8 : 4; rr(g, x + 0.5, y + 0.5, w - 1, h - 1, r); g.stroke(); g.shadowBlur = 0;
      if (b.flash > 0) { g.globalAlpha = b.flash * 0.7 * k; g.fillStyle = '#fff'; rr(g, x, y, w, h, r); g.fill(); }
      g.restore();
    }
    var view = {
      three: false,
      init: function (a) { ARC = a; fit(a); return true; },
      resize: function (a) { fit(a); },
      newLevel: function (G) { G0 = G; look = LOOK[(G.lv && G.lv.act) || 0] || LOOK[0]; var key = G.cfg.attract + '|' + G.level + '|' + (G.lv ? G.lv.name : ''); if (key !== levelKey) { levelKey = key; rise.length = 0; } },
      render: function (a, G, g) {
        if (G !== G0) view.newLevel(G);
        fit(a);
        var dt = a.state === 'pause' ? 0 : 1 / 60, t = a.time + (G.t || 0);
        evRead = M.events(G, Math.max(evRead, G.evN - 400), onEvent);
        step(dt);
        var bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, look.bg0); bg.addColorStop(1, look.bg1); g.fillStyle = bg; g.fillRect(0, 0, W, H);
        // floor, inlaid rangoli, walls
        var x0 = sx(-HALF), x1 = sx(HALF), y0 = sy(TOPY), y1 = sy(-1.2);
        g.fillStyle = look.floor; g.fillRect(x0, y0, x1 - x0, y1 - y0);
        g.strokeStyle = look.line; g.lineWidth = 1.5;
        for (var k = 1; k <= 5; k++) { g.beginPath(); g.ellipse(sx(0), sy(10), k * S, k * S, 0, 0, TAU); g.stroke(); }
        for (var i = 0; i < 12; i++) { var an = i / 12 * TAU; g.beginPath(); g.ellipse(sx(Math.cos(an) * 3), sy(10 + Math.sin(an) * 3), S, S * 0.4, an, 0, TAU); g.stroke(); }
        var gl = g.createLinearGradient(0, sy(-0.2), 0, sy(-1.2)); gl.addColorStop(0, 'rgba(255,80,40,0)'); gl.addColorStop(1, 'rgba(255,80,40,0.28)'); g.fillStyle = gl; g.fillRect(x0, sy(-0.2), x1 - x0, sy(-1.2) - sy(-0.2));
        g.fillStyle = look.wall; g.fillRect(x0 - S * 0.5, y0 - S * 0.5, S * 0.5, y1 - y0 + S * 0.5); g.fillRect(x1, y0 - S * 0.5, S * 0.5, y1 - y0 + S * 0.5); g.fillRect(x0 - S * 0.5, y0 - S * 0.5, x1 - x0 + S, S * 0.5);
        g.strokeStyle = look.inlay; g.lineWidth = 2; g.shadowColor = look.inlay; g.shadowBlur = 10;
        g.beginPath(); g.moveTo(x0, y1); g.lineTo(x0, y0); g.lineTo(x1, y0); g.lineTo(x1, y1); g.stroke(); g.shadowBlur = 0;
        // rim lamps, lit as the level clears
        var lit = G.total > 0 ? 1 - G.breakable / G.total : 1, nl = 28, on = G.phase === 'clear' ? nl : Math.floor(lit * nl);
        for (var q = 0; q < nl; q++) {
          var side = q % 2 ? 1 : -1, yy = lerp(TOPY - 0.6, -0.6, Math.floor(q / 2) / 13), lx = sx(side * (HALF + 0.25)), ly = sy(yy);
          g.fillStyle = '#8a3a20'; g.beginPath(); g.ellipse(lx, ly, S * 0.18, S * 0.1, 0, 0, TAU); g.fill();
          if ((q * 5) % nl < on) { g.fillStyle = 'rgba(255,200,90,0.9)'; g.shadowColor = '#ffb040'; g.shadowBlur = 10; g.beginPath(); g.arc(lx, ly - S * 0.08, S * 0.08 * (1 + Math.sin(t * 12 + q) * 0.15), 0, TAU); g.fill(); g.shadowBlur = 0; }
        }
        // bricks
        for (var bi = 0; bi < G.bricks.length; bi++) {
          var b = G.bricks[bi]; if (!b.alive) continue;
          if (rise[bi] == null) rise[bi] = G.cfg.attract ? 1 : 0;
          if (rise[bi] < 1) rise[bi] = Math.min(1, rise[bi] + (G.phase !== 'intro' || G.pt > 0.15 + b.r * 0.04 ? dt * 3 : 0));
          drawBrick(g, b, a.reducedMotion ? 1 : rise[bi], t);
        }
        // boss
        var B = G.boss;
        if (B && (!B.dead || B.deadT < 1.2)) {
          var bx = lerp(B.px, B.x, G.alpha), by = lerp(B.py, B.y, G.alpha), al = B.dead ? 1 - B.deadT / 1.2 : 1;
          g.globalAlpha = al;
          if (B.kind === 'dragon') for (var si = B.segs.length - 1; si >= 0; si--) { var sg = B.segs[si]; g.fillStyle = ['#d8322b', '#f2b632', '#d6527e', '#26a69a'][si % 4]; g.beginPath(); g.arc(sx(sg.x), sy(sg.y), sg.r * S, 0, TAU); g.fill(); g.strokeStyle = '#5a2a1a'; g.lineWidth = 2; g.stroke(); }
          var bgr = g.createRadialGradient(sx(bx), sy(by), 0, sx(bx), sy(by), B.r * S);
          if (B.kind === 'lantern') { bgr.addColorStop(0, '#fff2c0'); bgr.addColorStop(0.4, '#ff9a40'); bgr.addColorStop(1, '#a03a20'); }
          else if (B.kind === 'drum') { bgr.addColorStop(0, '#f2dcb0'); bgr.addColorStop(0.8, '#c88a3a'); bgr.addColorStop(1, '#7a4a1a'); }
          else { bgr.addColorStop(0, '#ffcf5a'); bgr.addColorStop(1, '#d8322b'); }
          g.fillStyle = bgr; g.beginPath(); g.arc(sx(bx), sy(by), B.r * S, 0, TAU); g.fill();
          g.strokeStyle = B.inv > 0 ? '#ffffff' : '#ffd070'; g.lineWidth = 3; g.stroke();
          g.fillStyle = '#ffffff'; [-1, 1].forEach(function (s) { g.beginPath(); g.arc(sx(bx + s * 0.4), sy(by + 0.2), S * 0.18, 0, TAU); g.fill(); });
          g.fillStyle = '#ff7a1a'; [-1, 1].forEach(function (s) { g.beginPath(); g.arc(sx(bx + s * 0.4), sy(by + 0.2), S * 0.09, 0, TAU); g.fill(); });
          for (var sh = 0; sh < B.shields.length; sh++) { var s2 = B.shields[sh]; if (!s2.alive || B.dead) continue; g.fillStyle = B.kind === 'lantern' ? 'rgba(106,156,255,0.85)' : '#c9553b'; rr(g, sx(s2.x) - S * 0.36, sy(s2.y) - S * 0.2, S * 0.72, S * 0.4, 3); g.fill(); }
          g.globalAlpha = 1;
        }
        // capsules, lasers, embers
        for (var ci = 0; ci < G.caps.length; ci++) { var c = G.caps[ci]; if (!c.alive) continue; var cx = sx(lerp(c.px, c.x, G.alpha)), cy = sy(lerp(c.py, c.y, G.alpha)); g.fillStyle = M.POWERS[c.type].col; rr(g, cx - S * 0.42, cy - S * 0.16, S * 0.84, S * 0.32, S * 0.16); g.fill(); g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(cx - S * 0.3, cy - S * 0.1, S * 0.6, S * 0.06); }
        g.fillStyle = '#ff5a40'; g.shadowColor = '#ff3020'; g.shadowBlur = 8;
        for (var li = 0; li < G.bolts.length; li++) { var L = G.bolts[li]; if (!L.alive) continue; g.fillRect(sx(L.x) - 1.5, sy(L.y) - S * 0.3, 3, S * 0.6); }
        g.fillStyle = '#ffa030';
        for (var ei = 0; ei < G.embers.length; ei++) { var em = G.embers[ei]; if (!em.alive) continue; g.beginPath(); g.arc(sx(lerp(em.px, em.x, G.alpha)), sy(lerp(em.py, em.y, G.alpha)), S * 0.17, 0, TAU); g.fill(); }
        g.shadowBlur = 0;
        // paddle
        var P = G.paddle, px = lerp(P.px, P.x, G.alpha), pw = P.w * S, ph = PAD_H * S;
        var pg = g.createLinearGradient(0, sy(PAD_Y) - ph, 0, sy(PAD_Y) + ph); pg.addColorStop(0, '#8a4a2a'); pg.addColorStop(1, '#2a120a');
        rr(g, sx(px) - pw, sy(PAD_Y) - ph, pw * 2, ph * 2, ph); g.fillStyle = pg; g.fill();
        g.fillStyle = '#e0a54a'; g.beginPath(); g.arc(sx(px) - pw + ph, sy(PAD_Y), ph * 0.95, 0, TAU); g.arc(sx(px) + pw - ph, sy(PAD_Y), ph * 0.95, 0, TAU); g.fill();
        var ic = P.stun > 0 ? '#777' : P.mode === 'laser' ? '#ff4a3a' : P.mode === 'catch' ? '#35e6d6' : '#ffc65a';
        g.strokeStyle = ic; g.lineWidth = 2; g.shadowColor = ic; g.shadowBlur = 10; g.beginPath(); g.moveTo(sx(px) - pw + ph * 1.6, sy(PAD_Y) - ph * 0.4); g.lineTo(sx(px) + pw - ph * 1.6, sy(PAD_Y) - ph * 0.4); g.stroke(); g.shadowBlur = 0;
        // balls with a warm glow
        var fire = G.fireT > 0;
        for (var k2 = 0; k2 < G.balls.length; k2++) {
          var bb = G.balls[k2]; if (!bb.alive) continue;
          var bx2 = sx(lerp(bb.px, bb.x, G.alpha)), by2 = sy(lerp(bb.py, bb.y, G.alpha));
          var hg = g.createRadialGradient(bx2, by2, 0, bx2, by2, S * 1.1); hg.addColorStop(0, fire ? 'rgba(255,120,40,0.55)' : 'rgba(255,200,110,0.45)'); hg.addColorStop(1, 'rgba(255,160,60,0)');
          g.fillStyle = hg; g.fillRect(bx2 - S * 1.1, by2 - S * 1.1, S * 2.2, S * 2.2);
          g.fillStyle = fire ? '#ffb070' : '#fff4dc'; g.beginPath(); g.arc(bx2, by2, BALL_R * S, 0, TAU); g.fill();
          if (!bb.stuck && dt > 0 && Math.random() < 0.8) emit(bb.x, bb.y, 0, 0, 0.2, 0.12, fire ? '#ff7a30' : '#ffd08a');
        }
        // particles, shards, rings
        for (var pi = 0; pi < parts.length; pi++) { var p = parts[pi]; g.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1); g.fillStyle = p.col; g.beginPath(); g.arc(sx(p.x), sy(p.y), Math.max(1, p.size * S), 0, TAU); g.fill(); }
        for (var s3 = 0; s3 < shards.length; s3++) { var d = shards[s3]; g.globalAlpha = clamp(d.life / 0.3, 0, 1); g.save(); g.translate(sx(d.x), sy(d.y)); g.rotate(d.r); g.fillStyle = d.col; g.fillRect(-d.s * S, -d.s * S * 0.6, d.s * S * 2, d.s * S * 1.2); g.restore(); }
        for (var ri = 0; ri < rings.length; ri++) { var R2 = rings[ri], kk = R2.t / R2.dur; g.globalAlpha = (1 - kk); g.strokeStyle = R2.col; g.lineWidth = 2; g.beginPath(); g.arc(sx(R2.x), sy(R2.y), (0.2 + kk * R2.max) * S, 0, TAU); g.stroke(); }
        g.globalAlpha = 1;
        if (flash > 0) { g.fillStyle = 'rgba(255,240,210,' + flash + ')'; g.fillRect(0, 0, W, H); }
        var vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
        return true;
      },
      project: function (gx, gy, h, out) { out.x = sx(gx); out.y = sy(gy) - h * S * 0.3; out.on = out.x > -20 && out.x < W + 20 && out.y > -20 && out.y < H + 20; return true; },
      paddleLine: function () { return { x0: sx(-HALF), x1: sx(HALF) }; },
      debug: function () { return { quality: 0, fps: 0, soft: true, post: false, mode2d: true }; },
      dev: { quality: function () {}, setQuality: function () {} }
    };
    M.boot(view);
  }).catch(function (e) { console.warn(e); });
})();
