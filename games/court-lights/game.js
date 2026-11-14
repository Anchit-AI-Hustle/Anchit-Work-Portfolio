/*
 * Court Lights, the 2D edition, for a device without WebGL2. The same game: core.js holds the league,
 * the rules, the AI, the season, the contests, the rooftop shootout and the HUD. This draws it flat:
 * the arena modes from above (the court fills the screen, long way up on a phone held upright), and
 * the rooftop shootout in the original perspective drawing. Everything is drawn in code.
 */
(function () {
  'use strict';
  const PI = Math.PI, TAU = PI * 2;
  const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max;
  const INK = '#FBF5EC', WARM = '#FFB736', PRIM = '#FF6940';
  import('/games/court-lights/core.js').then(function (C) {
    const M = C.MATCH, B = C.BALL, CT = C.CT, TEAMS = C.TEAMS, SH = C.SH, SR = C.SR;
    let arc = null;
    const V = { portrait: true, s: 10, ox: 0, oy: 0 };
    function layout() {
      const w = arc.w, h = arc.h, pad = arc.hudPad ? arc.hudPad() : { top: 12, bottom: 52 };
      V.portrait = h > w;
      const top = pad.top + 64, bot = pad.bottom + (arc.touchMode ? 40 : 10);
      const aw = w - 20, ah = h - top - bot;
      const L = CT.HL * 2 + 2, Wd = CT.HW * 2 + 2;
      V.s = V.portrait ? min(aw / Wd, ah / L) : min(aw / L, ah / Wd);
      V.ox = w / 2; V.oy = top + ah / 2;
    }
    // world (x, z) to the screen; y lifts a thing toward the top of the screen like a shadow offset
    function sx(x, z) { return V.portrait ? V.ox + x * V.s : V.ox + z * V.s; }
    function sy(x, z, y) { return (V.portrait ? V.oy - z * V.s : V.oy + x * V.s) - (y || 0) * V.s * 0.45; }
    function toScreen(x, y, z) { return { x: sx(x, z), y: sy(x, z, y), z: 0 }; }
    function stick(ax, ay) { return V.portrait ? { x: ax, z: -ay } : { x: ay, z: ax }; }
    function line(c, x0, z0, x1, z1) { c.beginPath(); c.moveTo(sx(x0, z0), sy(x0, z0)); c.lineTo(sx(x1, z1), sy(x1, z1)); c.stroke(); }
    function circ(c, x, z, r, a0, a1, fill) {
      c.beginPath();
      const n = 36;
      for (let i = 0; i <= n; i++) { const a = (a0 == null ? 0 : a0) + ((a1 == null ? TAU : a1) - (a0 == null ? 0 : a0)) * i / n; const px = sx(x + cos(a) * r, z + sin(a) * r), py = sy(x + cos(a) * r, z + sin(a) * r); i ? c.lineTo(px, py) : c.moveTo(px, py); }
      if (fill) c.fill(); else c.stroke();
    }
    function drawCourt(c) {
      const T = TEAMS[M.teams[0] || 1];
      c.fillStyle = '#121016'; c.fillRect(0, 0, arc.w, arc.h);
      c.fillStyle = '#2a1d16';
      const x0 = sx(-CT.HW - 1.2, -CT.HL - 1.2), y0 = sy(-CT.HW - 1.2, -CT.HL - 1.2), x1 = sx(CT.HW + 1.2, CT.HL + 1.2), y1 = sy(CT.HW + 1.2, CT.HL + 1.2);
      c.fillRect(min(x0, x1), min(y0, y1), abs(x1 - x0), abs(y1 - y0));
      const a0 = sx(-CT.HW, -CT.HL), b0 = sy(-CT.HW, -CT.HL), a1 = sx(CT.HW, CT.HL), b1 = sy(CT.HW, CT.HL);
      const g = c.createLinearGradient(min(a0, a1), 0, max(a0, a1), 0); g.addColorStop(0, '#b98250'); g.addColorStop(0.5, '#cf9a62'); g.addColorStop(1, '#b98250');
      c.fillStyle = g; c.fillRect(min(a0, a1), min(b0, b1), abs(a1 - a0), abs(b1 - b0));
      c.fillStyle = T.c1; c.globalAlpha = 0.8;
      for (const s of [-1, 1]) { const p0x = sx(-CT.KEYW, s * CT.HL), p0y = sy(-CT.KEYW, s * CT.HL), p1x = sx(CT.KEYW, s * CT.FT), p1y = sy(CT.KEYW, s * CT.FT); c.fillRect(min(p0x, p1x), min(p0y, p1y), abs(p1x - p0x), abs(p1y - p0y)); }
      c.globalAlpha = 1;
      c.strokeStyle = 'rgba(251,245,236,.85)'; c.lineWidth = max(1, V.s * 0.06);
      c.strokeRect(min(a0, a1), min(b0, b1), abs(a1 - a0), abs(b1 - b0));
      line(c, -CT.HW, 0, CT.HW, 0); circ(c, 0, 0, CT.CIRC);
      for (const s of [-1, 1]) {
        const hz = s * CT.HOOP;
        line(c, -CT.CORNER, s * CT.HL, -CT.CORNER, hz - s * 1.414); line(c, CT.CORNER, s * CT.HL, CT.CORNER, hz - s * 1.414);
        const a0 = Math.asin(CT.CORNER / CT.ARC);
        c.beginPath();
        for (let i = 0; i <= 40; i++) { const a = -a0 + 2 * a0 * i / 40, x = CT.ARC * sin(a), z = hz - s * CT.ARC * cos(a); i ? c.lineTo(sx(x, z), sy(x, z)) : c.moveTo(sx(x, z), sy(x, z)); }
        c.stroke();
        line(c, -CT.KEYW, s * CT.HL, -CT.KEYW, s * CT.FT); line(c, CT.KEYW, s * CT.HL, CT.KEYW, s * CT.FT); line(c, -CT.KEYW, s * CT.FT, CT.KEYW, s * CT.FT);
        circ(c, 0, s * CT.FT, CT.CIRC);
        c.strokeStyle = PRIM; c.lineWidth = max(1.5, V.s * 0.05); circ(c, 0, hz, CT.RIM_R + 0.05);
        c.strokeStyle = '#fbf5ec'; c.lineWidth = max(2, V.s * 0.08); line(c, -CT.BW, s * CT.BOARD, CT.BW, s * CT.BOARD);
        c.strokeStyle = 'rgba(251,245,236,.85)'; c.lineWidth = max(1, V.s * 0.06);
      }
    }
    function drawPlayer(c, p) {
      const T = TEAMS[p.side === 0 ? M.teams[0] : p.side === 1 ? M.teams[1] : p.info.team];
      const home = p.side === 0, r = max(5, V.s * 0.36);
      const light = /^#[0-9a-f]{6}$/i.test(T.c2) && (parseInt(T.c2.slice(1, 3), 16) * 0.3 + parseInt(T.c2.slice(3, 5), 16) * 0.59 + parseInt(T.c2.slice(5, 7), 16) * 0.11) > 128 ? T.c2 : '#f1ece2';
      const x = sx(p.x, p.z), y = sy(p.x, p.z);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(x, y + r * 0.3, r, r * 0.6, 0, 0, TAU); c.fill();
      const yy = sy(p.x, p.z, p.y);
      c.fillStyle = home ? light : T.c1; c.beginPath(); c.arc(x, yy, r, 0, TAU); c.fill();
      c.lineWidth = 2; c.strokeStyle = home ? T.c1 : light; c.stroke();
      // the way he faces
      c.strokeStyle = home ? T.c1 : light; c.beginPath(); c.moveTo(x, yy); c.lineTo(sx(p.x + sin(p.yaw) * 0.5, p.z + cos(p.yaw) * 0.5), sy(p.x + sin(p.yaw) * 0.5, p.z + cos(p.yaw) * 0.5, p.y)); c.stroke();
      c.fillStyle = home ? T.c1 : light; c.font = '700 ' + Math.round(r * 0.95) + 'px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(String(p.info.num), x, yy + 1);
      if (p === M.ctrl && M.user >= 0) { c.strokeStyle = M.poss === p.side ? WARM : '#7fd1ff'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, r + 5, 0, TAU); c.stroke(); }
    }
    function drawBall(c) {
      if (M.phase === 'intro') return;
      const x = sx(B.x, B.z), y = sy(B.x, B.z), r = max(3, V.s * 0.16);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.arc(x, y, r * 0.9, 0, TAU); c.fill();
      const yy = sy(B.x, B.z, B.y);
      c.fillStyle = '#d06a2e'; c.beginPath(); c.arc(x, yy, r, 0, TAU); c.fill();
      c.strokeStyle = '#2a1408'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - r, yy); c.lineTo(x + r, yy); c.stroke();
    }
    function drawArena(c) {
      layout();
      drawCourt(c);
      if (M.kind === 'c3' && M.c3) for (let i = 0; i < 5; i++) { const r = C.rackPos(i); c.fillStyle = 'rgba(208,106,46,.8)'; for (let j = 0; j < M.c3.left[i]; j++) { c.beginPath(); c.arc(sx(r.x, r.z) + j * 5 - 10, sy(r.x, r.z) + 14, 2.5, 0, TAU); c.fill(); } }
      const list = [];
      for (let s = 0; s < 2; s++) for (const p of M.court[s] || []) list.push(p);
      if (M.kind === 'dunk' && M.dk) { const p = M.dk.list[M.dk.turn]; if (list.indexOf(p) < 0) list.push(p); }
      list.sort((a, b) => sy(a.x, a.z) - sy(b.x, b.z));
      for (const p of list) drawPlayer(c, p);
      drawBall(c);
    }
    /* ---- the rooftop, in the original perspective drawing */
    function proj(x, y, z) { const f = min(arc.w, arc.h) * 1.35, camY = 1.7, camZ = -9.2, dz = max(1.2, z - camZ), u = f / dz; return { x: arc.w * 0.5 + x * u, y: arc.h * 0.62 - (y - camY) * u, s: u }; }
    let city = null;
    function drawRoof(c) {
      const w = arc.w, h = arc.h;
      const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#1a1630'); g.addColorStop(0.45, '#3a2450'); g.addColorStop(0.72, '#c46a3a'); g.addColorStop(1, '#1a120c');
      c.fillStyle = g; c.fillRect(0, 0, w, h);
      c.fillStyle = WARM; c.beginPath(); c.arc(w * 0.78, h * 0.22, 18, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,183,54,.12)'; c.beginPath(); c.arc(w * 0.78, h * 0.22, 70, 0, TAU); c.fill();
      if (!city) { const r = window.Arcade.rng(42); city = []; for (let i = 0; i < 18; i++) city.push({ x: -14 + i * 1.65 + r() * 0.4, w: 0.9 + r() * 1.2, h: 3.4 + r() * 7.5, win: (r() * 5) | 0 }); }
      city.forEach((b) => {
        const p0 = proj(b.x, 0, 22), p1 = proj(b.x + b.w, min(b.h, 6.2), 22), x = p0.x, ww = p1.x - p0.x, hh = p0.y - p1.y;
        if (ww < 2 || hh < 2) return;
        c.fillStyle = '#120e14'; c.fillRect(x, p1.y, ww, hh);
        c.fillStyle = 'rgba(255,183,54,.28)'; for (let i = 0; i < b.win; i++) c.fillRect(x + 3 + (i % 3) * 6, p1.y + 6 + ((i / 3) | 0) * 8, 3, 4);
      });
      const poly = (pts, fill, stroke, lw) => { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); } };
      poly([proj(-4.2, 0, -0.4), proj(4.2, 0, -0.4), proj(3.1, 0, 7.6), proj(-3.1, 0, 7.6)], '#3a2a22', 'rgba(251,245,236,.35)', 2);
      poly([proj(-1.1, 0, 4.4), proj(1.1, 0, 4.4), proj(1.1, 0, 7.4), proj(-1.1, 0, 7.4)], null, 'rgba(251,245,236,.5)', 1.5);
      c.strokeStyle = PRIM; c.globalAlpha = 0.7; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i <= 16; i++) { const a = PI + (PI * i) / 16, q = proj(cos(a) * 3.4, 0, 3.4 + sin(a) * 1.15); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }
      c.stroke(); c.globalAlpha = 1;
      c.strokeStyle = 'rgba(251,245,236,.12)'; c.lineWidth = 1;
      for (let i = 0; i < 8; i++) { const a = proj(-3.1 + i * 0.9, 0, 7.55), b2 = proj(-3.1 + i * 0.9, 3.6, 7.55); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b2.x, b2.y); c.stroke(); }
      poly([proj(-0.9, 4.05, 7.2), proj(0.9, 4.05, 7.2), proj(0.9, 2.72, 7.2), proj(-0.9, 2.72, 7.2)], 'rgba(251,245,236,.88)');
      poly([proj(-0.28, 3.45, 7.18), proj(0.28, 3.45, 7.18), proj(0.28, 3.05, 7.18), proj(-0.28, 3.05, 7.18)], null, '#c23', 3);
      const pole = proj(0, 0, 7.35), top = proj(0, 3.05, 7.35); c.strokeStyle = '#2a261f'; c.lineWidth = 6; c.beginPath(); c.moveTo(pole.x, pole.y); c.lineTo(top.x, top.y); c.stroke();
      const r = proj(SR.x, SR.y, SR.z); c.strokeStyle = PRIM; c.lineWidth = 4; c.beginPath(); c.ellipse(r.x, r.y, SR.r * r.s, SR.r * r.s * 0.32, 0, 0, TAU); c.stroke();
      c.strokeStyle = 'rgba(201,169,110,.75)'; c.lineWidth = 1;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.beginPath(); for (let k = 0; k < 6; k++) { const u = k / 5, q = proj(SR.x + cos(a) * SR.r * (1 - u * 0.72), SR.y - u * 0.42, SR.z + sin(a) * SR.r * (1 - u * 0.72)); k ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); } c.stroke(); }
      const p = proj(SH.aimX * 0.18, 0, 0.2), hd = proj(SH.aimX * 0.18, 1.8, 0.2), s = max(0.7, (p.y - hd.y) / 62);
      c.save(); c.translate(p.x, p.y); c.scale(s, s); c.fillStyle = '#1a1814'; c.fillRect(-10, -52, 20, 36); c.fillStyle = PRIM; c.fillRect(-10, -28, 20, 8); c.fillStyle = '#3a2a22'; c.beginPath(); c.arc(0, -60, 8, 0, TAU); c.fill(); c.fillStyle = '#1a1814'; c.fillRect(-12, -16, 8, 16); c.fillRect(4, -16, 8, 16); c.restore();
      const b = SH.ball;
      if (b && (b.air || SH.phase !== 'aim')) { const q = proj(b.x, b.y, b.z), br = max(5, 0.12 * q.s); c.fillStyle = '#c45a20'; c.beginPath(); c.arc(q.x, q.y, br, 0, TAU); c.fill(); }
      if (arc.state === 'play') {
        C.plate(c, 12, 12, 140, 66, 12); C.txt(c, 'POINTS', 26, 28, 10, '#c9a96e', 600, 'left', C.F_MONO); C.txt(c, String(SH.score), 26, 54, 28, INK, 500, 'left', C.F_DISP);
        C.plate(c, w / 2 - 54, 12, 108, 44, 12); C.txt(c, SH.mode === 'twentyone' ? 'TO 21' : (max(0, SH.time) | 0) + 's', w / 2, 34, 22, INK, 500, 'center', C.F_DISP);
        if (SH.phase === 'aim') { const bw = min(220, w - 40), bx = w / 2 - bw / 2, by = h - 90; C.plate(c, bx - 8, by - 10, bw + 16, 28, 10, 0.7); c.fillStyle = 'rgba(255,183,54,.35)'; c.fillRect(bx + C.SWEET[0] * bw, by, (C.SWEET[1] - C.SWEET[0]) * bw, 8); c.fillStyle = SH.charge >= C.SWEET[0] && SH.charge <= C.SWEET[1] ? WARM : PRIM; c.fillRect(bx, by, max(4, bw * SH.charge), 8); }
      }
    }
    let venueName = 'arena';
    C.boot({
      three: false,
      init(a) { arc = a; },
      venue(n) { venueName = n; },
      toScreen, stick,
      ev() {},
      render(c) { if (venueName === 'roof') drawRoof(c); else drawArena(c); },
      dbg: () => ({ webgl: false, quality: 0 }),
      dev: { quality() {}, skip() { if (M.phase === 'intro') { M.phase = 'tip'; M.tip = { t: 0.6, done: false }; } } },
    });
  }).catch(function (e) { try { console.warn(e); } catch (er) { /* ignore */ } });
})();
