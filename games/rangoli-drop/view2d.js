/*
 * Rangoli Drop, drawn in 2D on a canvas: the edition for browsers without
 * WebGL2, and the first frames of the 3D edition while its graphics load.
 * The rules, controls, sound and HUD come from core.js, exactly as in 3D;
 * this only paints the courtyard, the brass frame and the glowing tiles.
 */
import { frozen, COLS, SHAPES, SIZE, PIECE_COL, clamp, layoutUnits, margins, slotAt, makeAnim, animEvent, animTick, boardTile, paletteOf, ghostOn, TAU } from '/games/rangoli-drop/core.js';

const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const mixHex = (a, b, t) => { const x = hexRgb(a), y = hexRgb(b); return 'rgb(' + Math.round(x[0] + (y[0] - x[0]) * t) + ',' + Math.round(x[1] + (y[1] - x[1]) * t) + ',' + Math.round(x[2] + (y[2] - x[2]) * t) + ')'; };
function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

export function make2D(opts) {
  opts = opts || {};
  const A = opts.anim || makeAnim();
  const owner = !opts.anim;
  let TS = null, TM = null;
  let W = 0, H = 0, DPR = 1, k = 20, ox = 0, oy = 0, U = null, bgKey = '', bgCanvas = null, spr = [], ghostSpr = [], dots = [], sprK = 0, lastNow = 0, time = 0;
  const L = { cell: 0, bx0: 0, by0: 0, bx1: 0, by1: 0, ty: 0, portrait: true, tall: false, hold: { x: 0, y: 0, w: 0, h: 0 }, next: { x: 0, y: 0, w: 0, h: 0 } };
  const SL = { x: 0, y: 0, s: 1 };
  const sx = (u) => ox + u * k, sy = (v) => oy - v * k;
  // particles: x, y in world units
  const PN = 520, P = { x: new Float32Array(PN), y: new Float32Array(PN), vx: new Float32Array(PN), vy: new Float32Array(PN), life: new Float32Array(PN), max: new Float32Array(PN), size: new Float32Array(PN), grow: new Float32Array(PN), col: new Uint8Array(PN), n: 0 };
  const emit = (x, y, vx, vy, life, size, grow, col) => {
    if (P.n >= PN) return;
    const i = P.n++; P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.life[i] = life; P.max[i] = life; P.size[i] = size; P.grow[i] = grow; P.col[i] = col;
  };
  const DIYA_N = 22, diya = new Float32Array(DIYA_N * 4);
  for (let i = 0; i < DIYA_N; i++) { diya[i * 4] = Math.random(); diya[i * 4 + 1] = Math.random(); diya[i * 4 + 2] = 0.02 + Math.random() * 0.05; diya[i * 4 + 3] = 0.5 + Math.random(); }

  function layout(a) {
    W = a.w; H = a.h; DPR = a.dpr;
    U = layoutUnits(W, H);
    const M = margins(a, U);
    const bw = U.xmax - U.xmin, bh = U.ymax - U.ymin, aw = W - M.left - M.right, ah = H - M.top - M.bottom;
    k = Math.max(4, Math.min(aw / bw, ah / bh));
    const rcx = M.left + aw / 2, rcy = M.top + ah / 2, bcx = (U.xmin + U.xmax) / 2, bcy = (U.ymin + U.ymax) / 2;
    ox = rcx - bcx * k; oy = rcy + bcy * k;
    L.cell = k; L.portrait = U.portrait; L.tall = U.tall; L.bx0 = sx(-5); L.bx1 = sx(5); L.by0 = sy(10); L.by1 = sy(-10); L.ty = sy(U.ymax);
    const rect = (r, o) => { o.x = sx(r.cx - r.w / 2); o.y = sy(r.cy + r.h / 2); o.w = r.w * k; o.h = r.h * k; };
    rect(U.hold, L.hold); rect(U.next, L.next);
    bgKey = '';
    if (Math.abs(sprK - k * DPR) > 0.5) makeSprites();
  }
  function makeSprites() {
    sprK = k * DPR;
    const t = Math.max(8, Math.round(sprK)), pad = Math.round(t * 0.35), S = t + pad * 2;
    spr = PIECE_COL.map((col) => {
      const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
      g.translate(pad, pad);
      const gr = g.createLinearGradient(0, 0, t, t); gr.addColorStop(0, mixHex(col, '#ffffff', 0.28)); gr.addColorStop(0.55, col); gr.addColorStop(1, mixHex(col, '#000000', 0.4));
      g.shadowColor = col; g.shadowBlur = t * 0.32;
      rr(g, t * 0.05, t * 0.05, t * 0.9, t * 0.9, t * 0.16); g.fillStyle = gr; g.fill();
      g.shadowBlur = 0;
      g.strokeStyle = 'rgba(255,255,255,0.42)'; g.lineWidth = Math.max(1, t * 0.04); rr(g, t * 0.1, t * 0.1, t * 0.8, t * 0.8, t * 0.12); g.stroke();
      // the rangoli on its face: eight petals, a dotted ring and a bright heart
      const cx = t / 2, cy = t / 2, light = mixHex(col, '#ffffff', 0.72);
      g.fillStyle = light; g.globalAlpha = 0.9;
      for (let p = 0; p < 8; p++) { const an = p * TAU / 8; g.beginPath(); g.ellipse(cx + Math.cos(an) * t * 0.15, cy + Math.sin(an) * t * 0.15, t * 0.085, t * 0.04, an, 0, TAU); g.fill(); }
      for (let p = 0; p < 12; p++) { const an = p * TAU / 12; g.beginPath(); g.arc(cx + Math.cos(an) * t * 0.31, cy + Math.sin(an) * t * 0.31, t * 0.025, 0, TAU); g.fill(); }
      g.globalAlpha = 1; g.fillStyle = '#fffaf0'; g.beginPath(); g.arc(cx, cy, t * 0.055, 0, TAU); g.fill();
      c.pad = pad; c.t = t;
      return c;
    });
    ghostSpr = PIECE_COL.map((col) => {
      const c = document.createElement('canvas'); c.width = c.height = S; const g = c.getContext('2d');
      g.translate(pad, pad); g.strokeStyle = col; g.lineWidth = Math.max(1, t * 0.06); g.globalAlpha = 0.85; g.setLineDash([t * 0.12, t * 0.08]);
      rr(g, t * 0.1, t * 0.1, t * 0.8, t * 0.8, t * 0.14); g.stroke(); g.globalAlpha = 0.14; g.fillStyle = col; g.fill();
      c.pad = pad; c.t = t; return c;
    });
    dots = PIECE_COL.concat(['#ffffff', '#ffcf5a']).map((col) => {
      const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d');
      const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, col); gr.addColorStop(0.4, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(0, 0, 32, 32); return c;
    });
  }
  // The courtyard: sky, mandala, the board's stone, the brass frame and panels, cached until size or level change.
  function background(level) {
    const key = W + 'x' + H + ':' + level;
    if (key === bgKey && bgCanvas) return bgCanvas;
    bgKey = key;
    if (!bgCanvas) bgCanvas = document.createElement('canvas');
    bgCanvas.width = Math.round(W * DPR); bgCanvas.height = Math.round(H * DPR);
    const g = bgCanvas.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    const pal = paletteOf(level), cx = sx(0), cy = sy(0), R = Math.hypot(W, H);
    const gr = g.createRadialGradient(cx, cy, 0, cx, cy, R * 0.62); gr.addColorStop(0, pal.bg1); gr.addColorStop(1, pal.bg0);
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.strokeStyle = pal.line; g.lineWidth = 1.2;
    for (let ring = 0; ring < 4; ring++) {
      const r0 = k * (9 + ring * 5.5);
      g.globalAlpha = 0.16 - ring * 0.025;
      g.beginPath(); for (let i = 0; i <= 160; i++) { const an = i / 160 * TAU, r = r0 + k * 0.8 * Math.abs(Math.cos(an * (6 + ring * 2))); i ? g.lineTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r) : g.moveTo(cx + Math.cos(an) * r, cy + Math.sin(an) * r); } g.stroke();
      for (let i = 0; i < 24 + ring * 8; i++) { const an = i / (24 + ring * 8) * TAU; g.beginPath(); g.arc(cx + Math.cos(an) * (r0 + k * 2.2), cy + Math.sin(an) * (r0 + k * 2.2), 1.6, 0, TAU); g.fillStyle = pal.line; g.fill(); }
    }
    g.globalAlpha = 1;
    // the board's polished stone with a dot at every cell corner
    rr(g, sx(-5.05), sy(10.05), k * 10.1, k * 20.1, k * 0.12); g.fillStyle = 'rgba(12,9,18,0.94)'; g.fill();
    g.fillStyle = 'rgba(255,240,220,0.16)';
    for (let y = 0; y <= 20; y++) for (let x = 0; x <= 10; x++) { g.beginPath(); g.arc(sx(x - 5), sy(y - 10), Math.max(0.8, k * 0.035), 0, TAU); g.fill(); }
    // the brass frame, open at the top
    const f = U.frame;
    const brass = g.createLinearGradient(sx(-5 - f), 0, sx(5 + f), 0); brass.addColorStop(0, '#7a5a26'); brass.addColorStop(0.25, '#e8c475'); brass.addColorStop(0.5, '#b88a3c'); brass.addColorStop(0.75, '#f0d08a'); brass.addColorStop(1, '#6e5021');
    g.fillStyle = brass;
    g.beginPath(); g.moveTo(sx(-5 - f), sy(10.3)); g.lineTo(sx(-5 - f), sy(-10 - f + 0.4)); g.quadraticCurveTo(sx(-5 - f), sy(-10 - f), sx(-5 - f + 0.4), sy(-10 - f)); g.lineTo(sx(5 + f - 0.4), sy(-10 - f)); g.quadraticCurveTo(sx(5 + f), sy(-10 - f), sx(5 + f), sy(-10 - f + 0.4)); g.lineTo(sx(5 + f), sy(10.3));
    g.lineTo(sx(5.02), sy(10.3)); g.lineTo(sx(5.02), sy(-10.02)); g.lineTo(sx(-5.02), sy(-10.02)); g.lineTo(sx(-5.02), sy(10.3)); g.closePath(); g.fill();
    [-1, 1].forEach((s) => { const x = sx(s * (5 + f / 2)), y = sy(10.3); g.beginPath(); g.arc(x, y - k * 0.2, k * 0.42, Math.PI, 0); g.fill(); g.beginPath(); g.moveTo(x - k * 0.12, y - k * 0.55); g.lineTo(x, y - k * 1.0); g.lineTo(x + k * 0.12, y - k * 0.55); g.fill(); });
    g.shadowColor = pal.inlay; g.shadowBlur = k * 0.5; g.strokeStyle = pal.inlay; g.lineWidth = Math.max(1, k * 0.06);
    g.beginPath(); g.moveTo(sx(-5.1), sy(10.2)); g.lineTo(sx(-5.1), sy(-10.1)); g.lineTo(sx(5.1), sy(-10.1)); g.lineTo(sx(5.1), sy(10.2)); g.stroke(); g.shadowBlur = 0;
    // the hold and next panels
    [L.hold, L.next].forEach((p) => { rr(g, p.x, p.y, p.w, p.h, k * 0.3); g.fillStyle = 'rgba(12,9,18,0.86)'; g.fill(); g.strokeStyle = '#c9a052'; g.lineWidth = Math.max(1.5, k * 0.09); g.stroke(); });
    return bgCanvas;
  }
  function tile(g, type, x, y, s, rz, alpha, ghost) {
    const sp = ghost ? ghostSpr[type] : spr[type]; if (!sp) return;
    const px = sx(x), py = sy(y), size = k * s, pad = sp.pad / sp.t * size;
    g.globalAlpha = alpha;
    if (rz) { g.save(); g.translate(px, py); g.rotate(-rz); g.drawImage(sp, -size / 2 - pad, -size / 2 - pad, size + pad * 2, size + pad * 2); g.restore(); }
    else g.drawImage(sp, px - size / 2 - pad, py - size / 2 - pad, size + pad * 2, size + pad * 2);
  }
  function mini(g, type, cx, cy, s, alpha) {
    const sh = SHAPES[type][0];
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, sh[i]); x1 = Math.max(x1, sh[i]); y0 = Math.min(y0, sh[i + 1]); y1 = Math.max(y1, sh[i + 1]); }
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    for (let i = 0; i < 8; i += 2) tile(g, type, cx + (sh[i] - mx) * s, cy + (sh[i + 1] - my) * s, s, 0, alpha, false);
  }
  const view = {
    name: '2d', three: false, anim: A, layout: L,
    init(a) { layout(a); return true; },
    resize(a) { layout(a); },
    newGame(G) { if (owner) { Object.assign(A, makeAnim()); animEvent(A, 'level', { level: G.level, snap: true }, G); } P.n = 0; },
    event(type, d, G) {
      if (owner) animEvent(A, type, d, G);
      if (type === 'drop') {
        for (let i = 0; i < 14; i++) emit(A.trailX0 - 4.5 + Math.random() * (A.trailX1 - A.trailX0 + 1) - 0.5, A.trailY1 - 9.5 - 0.5, (Math.random() - 0.5) * 6, Math.random() * 3, 0.45, 0.25, 0, 8);
      } else if (type === 'clear' && (d.n === 4 || d.allClear)) {
        for (let i = 0; i < 70; i++) { const an = Math.random() * TAU, sp = 4 + Math.random() * 8; emit(0, d.rows[0] - 9.5, Math.cos(an) * sp, Math.sin(an) * sp + 4, 1.4, 0.3, 0, 8); }
      } else if (type === 'end' && d.kind !== 'topout') {
        for (let i = 0; i < 120; i++) { const an = Math.random() * TAU, sp = 3 + Math.random() * 9; emit((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 10, Math.cos(an) * sp, Math.sin(an) * sp + 5, 1.8, 0.3, 0, i % 9); }
      }
    },
    render(a, G, g, fadeIn) {
      if (W !== a.w || H !== a.h || a.touchStyle !== TS || a.touchMode !== TM) { TS = a.touchStyle; TM = a.touchMode; layout(a); }
      const now = performance.now(), dt = clamp(lastNow ? (now - lastNow) / 1000 : 1 / 60, 0, 0.1) * (a.state === 'pause' || frozen() ? 0 : 1); lastNow = now; time += dt;
      if (owner) animTick(A, dt, G);
      const rm = a.reducedMotion, level = A.palTo || G.level;
      g.globalAlpha = fadeIn == null ? 1 : fadeIn;
      g.drawImage(background(level), 0, 0, W, H);
      // lamps drifting up behind the board
      for (let i = 0; i < DIYA_N; i++) {
        const yy = ((diya[i * 4 + 1] + time * diya[i * 4 + 2]) % 1);
        const x = diya[i * 4] * W, y = H * (1.05 - yy * 1.1), s = (6 + diya[i * 4 + 3] * 6) * (0.85 + 0.15 * Math.sin(time * 6 + i));
        if (x > L.bx0 - s && x < L.bx1 + s && y > L.by0 - k * 2 && y < L.by1 + s) continue;
        g.globalAlpha = (fadeIn == null ? 1 : fadeIn) * 0.55 * Math.sin(yy * Math.PI); g.drawImage(dots[8], x - s, y - s, s * 2, s * 2);
      }
      g.globalAlpha = 1;
      g.save();
      if (!rm) g.translate(0, -A.dip * k * 0.18);
      // board tiles
      for (let y = 0; y < 22; y++) for (let x = 0; x < COLS; x++) {
        const v = G.board[y * COLS + x]; if (!v) continue;
        const T = boardTile(A, G, x, y, rm);
        if (T.burstNow) for (let i = 0; i < 6; i++) emit(T.x - 4.5, T.y - 9.5, (Math.random() - 0.5) * 7, Math.random() * 6 - 1, 0.8 + Math.random() * 0.5, 0.35 + Math.random() * 0.3, 0.9, v - 1);
        if (T.hide) continue;
        tile(g, v - 1, T.x - 4.5, T.y - 9.5, T.s, T.rz, 1 - T.grey * 0.55, false);
        if (T.white > 0.02) { g.globalAlpha = T.white * 0.85; g.fillStyle = '#fffaf0'; rr(g, sx(T.x - 4.5 - 0.45 * T.s), sy(T.y - 9.5 + 0.45 * T.s), k * 0.9 * T.s, k * 0.9 * T.s, k * 0.14); g.fill(); }
        if (T.grey > 0.02) { g.globalAlpha = T.grey * 0.6; g.fillStyle = '#1a1820'; rr(g, sx(T.x - 4.95), sy(T.y - 9.05), k * 0.9, k * 0.9, k * 0.14); g.fill(); }
      }
      g.globalAlpha = 1;
      // ghost and the falling piece
      if (G.has && G.phase === 'live') {
        const c = G.cur, sh = SHAPES[c.t][c.r], n = SIZE[c.t];
        if (ghostOn() && G.ghostY < c.y) for (let i = 0; i < 8; i += 2) tile(g, c.t, c.x + sh[i] - 4.5, G.ghostY + sh[i + 1] - 9.5, 1, 0, 0.55, true);
        const cs = Math.cos(A.rot), sn = Math.sin(A.rot), ps = 0.75 + 0.25 * A.pop;
        for (let i = 0; i < 8; i += 2) {
          const lx = (sh[i] + 0.5 - n / 2) * ps, ly = (sh[i + 1] + 0.5 - n / 2) * ps;
          tile(g, c.t, A.px + n / 2 + lx * cs - ly * sn - 5, A.py + n / 2 + lx * sn + ly * cs - 10, ps, A.rot, 1, false);
        }
      }
      // hard drop trail
      if (A.trailT < 0.28) {
        const al = 1 - A.trailT / 0.28, x0 = sx(A.trailX0 - 5), x1 = sx(A.trailX1 - 4), y0 = sy(A.trailY0 - 7.5), y1 = sy(A.trailY1 - 9);
        const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(1, PIECE_COL[A.trailType]);
        g.globalAlpha = al * 0.5; g.fillStyle = gr; g.fillRect(x0 + k * 0.1, y0, x1 - x0 - k * 0.2, y1 - y0); g.globalAlpha = 1;
      }
      // row sweeps
      for (let i = 0; i < A.sweepN; i++) if (A.sweep[i] < 0.45) { g.globalAlpha = (1 - A.sweep[i] / 0.45) * 0.7; g.fillStyle = '#fff6dc'; const yy = sy(A.sweepRow[i] - 9); g.fillRect(sx(-5.3), yy - k * 0.05, k * 10.6, k * 1.1); }
      g.globalAlpha = 1;
      g.restore();
      // hold and next
      if (G.hold >= 0) mini(g, G.hold, U.hold.cx, U.hold.cy - (U.tall ? 0.12 : 0), U.holdS * (1 + A.holdPop * 0.25), G.holdUsed ? 0.4 : 1);
      for (let i = 0; i < 5; i++) {
        const t = G.queue[i]; if (t == null) break;
        slotAt(U, i, rm ? 0 : A.nextShift, SL);
        mini(g, t, SL.x, SL.y, SL.s, i === 0 ? 1 : 0.8);
      }
      // powder
      for (let i = P.n - 1; i >= 0; i--) {
        P.life[i] -= dt;
        if (P.life[i] <= 0) { const j = --P.n; P.x[i] = P.x[j]; P.y[i] = P.y[j]; P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.life[i] = P.life[j]; P.max[i] = P.max[j]; P.size[i] = P.size[j]; P.grow[i] = P.grow[j]; P.col[i] = P.col[j]; continue; }
        const dr = Math.exp(-dt * 2.4); P.vx[i] *= dr; P.vy[i] = P.vy[i] * dr - 7 * dt; P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.size[i] += P.grow[i] * dt;
        const f = P.life[i] / P.max[i], r = P.size[i] * k;
        g.globalAlpha = Math.min(1, f * 1.6) * 0.8; g.drawImage(dots[P.col[i]], sx(P.x[i]) - r, sy(P.y[i]) - r, r * 2, r * 2);
      }
      g.globalAlpha = 1;
      if (A.shockT < 0.8 && !rm) { const r = k * (2 + A.shockT * 22); g.globalAlpha = (1 - A.shockT / 0.8) * 0.7; g.strokeStyle = '#ffe2a0'; g.lineWidth = k * 0.3; g.beginPath(); g.arc(sx(0), sy(-2), r, 0, TAU); g.stroke(); g.globalAlpha = 1; }
      if (A.punch > 0 && !rm) { g.globalAlpha = A.punch * 0.22; g.fillStyle = '#fff3d6'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
      const vg = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.78); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
      return true;
    },
    debug() { return { quality: 0, fps: 0, soft: true, post: false, mode2d: true, particles: P.n }; },
    dev: { quality() {}, setQuality() {} },
  };
  return view;
}
