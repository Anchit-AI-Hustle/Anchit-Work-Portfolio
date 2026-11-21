/*
 * Last Ridge, the heads up display, drawn on the shell's 2D overlay for both
 * the 3D and the 2D views: a compass and a radar, the score bug, ammunition,
 * grenades and scorestreaks, hit and knockdown markers, where the hits came
 * from, the kill feed, squad radio, medals, the intro cards, the down cam and
 * the final killcam. Sized for a 390 px phone up to a 1440 px desktop.
 */
import { CS, FACTIONS, STREAKS, MISSIONS } from './data.js';
import { TAU, clamp, lerp, smooth01, toCX, toCZ, cw, cwz, markers, matchClock, curW, streakReady, spreadOf, teamCol, LESSONS, eyePos, ROADBLOCKS } from './sim.js';

export const F_MONO = '"JetBrains Mono", ui-monospace, monospace', F_DISP = 'Fraunces, "Times New Roman", serif', F_BODY = 'Inter, -apple-system, sans-serif';
const INK = '#f4efe6', DIM = '#b3ab9f', GOLD = '#ffd36a', RED = '#ff6a4a', ALLY = FACTIONS[0].ui, FOE = FACTIONS[1].ui;
export function txt(g, s, x, y, size, col, align, weight, fam) { g.font = (weight || '600') + ' ' + size + 'px ' + (fam || F_MONO); g.fillStyle = col; g.textAlign = align || 'left'; g.textBaseline = 'middle'; g.fillText(s, x, y); }
export function rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
export function plate(g, x, y, w, h, r, a) { rr(g, x, y, w, h, r == null ? 8 : r); g.fillStyle = 'rgba(8,10,12,' + (a == null ? 0.55 : a) + ')'; g.fill(); g.strokeStyle = 'rgba(244,239,230,0.09)'; g.lineWidth = 1; g.stroke(); }
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
function wrapLines(g, s, maxW) { const words = s.split(' '); const out = []; let line = ''; for (const w of words) { const t = line ? line + ' ' + w : w; if (g.measureText(t).width > maxW && line) { out.push(line); line = w; } else line = t; } if (line) out.push(line); return out; }
const P3 = { x: 0, y: 0, front: false };
const _e = { x: 0, y: 0, z: 0 };

/* ---------------------------------------------------------------- the radar */
const MINI = new WeakMap();
function miniFor(W) {
  const G = W.G, key = W.gridV || 0;
  let m = MINI.get(G);
  if (m && m.key === key) return m;
  const px = 4, cv = (m && m.cv) || document.createElement('canvas');
  cv.width = G.gw * px; cv.height = G.gh * px;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, cv.width, cv.height);
  g.fillStyle = 'rgba(160,170,180,0.16)'; g.fillRect(0, 0, cv.width, cv.height);
  for (let z = 0; z < G.gh; z++) for (let x = 0; x < G.gw; x++) {
    const k = G.kind[z * G.gw + x];
    if (k === '.' || k === 'r') continue;
    g.fillStyle = k === '#' || k === 'H' ? 'rgba(225,230,236,0.62)' : k === 'X' ? 'rgba(90,140,190,0.5)' : k === 'c' ? 'rgba(225,230,236,0.28)' : k === 'e' ? 'rgba(255,120,80,0.55)' : 'rgba(225,230,236,0.45)';
    g.fillRect(x * px, z * px, px, px);
  }
  m = { cv, key, px }; MINI.set(G, m);
  return m;
}
function drawRadar(g, a, W, cx, cy, R) {
  const P = W.P, m = miniFor(W), G = W.G;
  const px0 = P.mount ? P.mount.x : P.x, pz0 = P.mount ? P.mount.z : P.z;
  const range = 34, sc = R / range;
  g.save();
  g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fillStyle = 'rgba(6,9,12,0.6)'; g.fill(); g.clip();
  g.translate(cx, cy); g.rotate(P.yaw);
  // the map image: one cell is CS metres
  const k = sc * CS / m.px;
  g.globalAlpha = 0.95;
  g.drawImage(m.cv, (-G.gw / 2 * CS - px0) * sc, (-G.gh / 2 * CS - pz0) * sc, m.cv.width * k, m.cv.height * k);
  g.globalAlpha = 1;
  const dot = (x, z, col, r, tri, yaw) => {
    const dx = (x - px0) * sc, dz = (z - pz0) * sc; if (dx * dx + dz * dz > R * R) return;
    g.fillStyle = col;
    if (tri) { g.save(); g.translate(dx, dz); g.rotate(-yaw); g.beginPath(); g.moveTo(0, -r * 1.5); g.lineTo(r, r); g.lineTo(-r, r); g.closePath(); g.fill(); g.restore(); }
    else { g.beginPath(); g.arc(dx, dz, r, 0, TAU); g.fill(); }
  };
  const radarOn = W.radar[0] > 0, ears = P.perks.indexOf('ears') >= 0;
  for (const c of W.chars) {
    if (c === P || !c.alive) continue;
    const ally = !W.ffa && c.team === P.team;
    if (ally) { dot(c.x, c.z, ALLY, 3.2, true, c.yaw); continue; }
    const seen = radarOn && !(c.perks.indexOf('ghost') >= 0 && c.speed > 0.5) || c.revealT > 0 || (ears && Math.hypot(c.x - P.x, c.z - P.z) < 12 && c.speed > 3);
    if (seen) dot(c.x, c.z, FOE, 3.4, false);
  }
  for (const mk of markers(W)) dot(mk.x, mk.z, mk.col, 4, false);
  if (W.convoy) for (const t of W.convoy.trucks) dot(t.x, t.z, ALLY, 4.5, false);
  if (W.drones[0]) { const d = W.drones[0]; dot(Math.cos(d.a) * 18 + d.x, Math.sin(d.a) * 18 + d.z, ALLY, 2.2, false); }
  g.restore();
  // the player and the view cone
  g.save(); g.translate(cx, cy);
  g.fillStyle = 'rgba(244,239,230,0.12)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55); g.closePath(); g.fill();
  g.fillStyle = INK; g.beginPath(); g.moveTo(0, -6); g.lineTo(4.5, 4.5); g.lineTo(-4.5, 4.5); g.closePath(); g.fill();
  g.restore();
  g.strokeStyle = 'rgba(244,239,230,0.22)'; g.lineWidth = 1.2; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.stroke();
  if (radarOn) txt(g, 'RECON', cx, cy + R + 10, 9, ALLY, 'center', '800');
  if (W.radar[1] > 0) txt(g, 'ENEMY DRONE', cx, cy + R + (radarOn ? 22 : 10), 9, RED, 'center', '800');
}

/* ---------------------------------------------------------------- the compass */
function drawCompass(g, a, W, cx, y, w) {
  const P = W.P, fov = 1.6;
  plate(g, cx - w / 2, y - 11, w, 22, 6, 0.38);
  g.save(); g.beginPath(); g.rect(cx - w / 2, y - 11, w, 22); g.clip();
  // yaw 0 looks north; a bearing increases clockwise
  const head = (-P.yaw) % TAU;
  for (let deg = 0; deg < 360; deg += 15) {
    const b = deg * Math.PI / 180;
    let d = b - head; d = Math.atan2(Math.sin(d), Math.cos(d));
    if (Math.abs(d) > fov / 2 + 0.1) continue;
    const x = cx + d / (fov / 2) * w / 2;
    const card = deg % 90 === 0;
    if (card) txt(g, 'NESW'[deg / 90], x, y, 12, deg === 0 ? GOLD : INK, 'center', '800');
    else if (deg % 45 === 0) txt(g, deg, x, y, 9, DIM, 'center', '600');
    else { g.fillStyle = 'rgba(244,239,230,0.35)'; g.fillRect(x - 0.5, y + 2, 1, 6); }
  }
  for (const mk of markers(W)) {
    const b = Math.atan2(mk.x - P.x, -(mk.z - P.z));
    let d = b - head; d = Math.atan2(Math.sin(d), Math.cos(d));
    const x = cx + clamp(d / (fov / 2), -1, 1) * (w / 2 - 6);
    g.fillStyle = mk.col; g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x + 5, y - 4); g.lineTo(x - 5, y - 4); g.closePath(); g.fill();
  }
  g.restore();
  g.fillStyle = INK; g.fillRect(cx - 1, y + 9, 2, 5);
}

/* ---------------------------------------------------------------- the whole HUD */
export function drawHUD(g, a, W, V, I) {
  const P = W.P, pad = a.hudPad(), w = a.w, h = a.h, sm = w < 560, mid = w < 900;
  const lbK = W.phase === 'intro' || W.phase === 'final' || W.phase === 'killcam' || (W.downCam && !P.alive && W.kind !== 'range') ? 1 : 0;
  V.letter = lerp(V.letter || 0, lbK, 0.12);
  const lb = h * (sm ? 0.07 : 0.09) * V.letter;
  // screen effects: hurt, flash, suppression
  if (P.alive && W.phase === 'live') {
    const hp = P.hp / P.hpMax;
    const hk = Math.max(W.hurtK * 0.6, hp < 0.45 ? (0.45 - hp) * 1.6 : 0);
    if (hk > 0.01) { const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.25, w / 2, h / 2, Math.max(w, h) * 0.72); gr.addColorStop(0, 'rgba(120,20,10,0)'); gr.addColorStop(1, 'rgba(120,20,10,' + clamp(hk, 0, 0.75) + ')'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
    if (W.supK > 0.05) { const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.7); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,' + (W.supK * 0.5) + ')'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }
  }
  if (W.flashK > 0.01) { g.fillStyle = 'rgba(255,253,246,' + clamp(W.flashK * 1.15, 0, 1) + ')'; g.fillRect(0, 0, w, h); }
  if (lb > 0.5) { g.fillStyle = '#030304'; g.fillRect(0, 0, w, lb); g.fillRect(0, h - lb, w, lb); }
  if (W.phase === 'intro') { drawIntro(g, a, W, lb); fade(g, a, W); return; }
  if (W.phase === 'killcam') { drawKillcam(g, a, W, lb); fade(g, a, W); return; }
  const fp = P.alive && !V.flat && W.phase === 'live';
  const d = curW(P).def;
  // scope or optic reticle
  const scoped = fp && P.adsK > 0.85 && (d.optic === 'scope' || d.optic === 'scout');
  if (scoped) drawScope(g, w, h, d, W);
  // name tags over squadmates, markers in the world
  if (!V.flat) for (const c of W.chars) {
    if (c === P || !c.alive || W.ffa || c.team !== P.team) continue;
    if (!V.project(c.x, c.y + 2.05, c.z, P3)) continue;
    const dd = Math.hypot(c.x - P.x, c.z - P.z); if (dd > 45) continue;
    g.globalAlpha = clamp(1.4 - dd / 40, 0.3, 1);
    txt(g, c.name.toUpperCase(), P3.x, P3.y - 8, sm ? 9 : 10, ALLY, 'center', '700');
    g.fillStyle = ALLY; g.beginPath(); g.moveTo(P3.x - 4, P3.y); g.lineTo(P3.x + 4, P3.y); g.lineTo(P3.x, P3.y + 5); g.fill(); g.globalAlpha = 1;
  }
  // knocked down soldiers: an OUT marker, never anything else
  if (!V.flat) for (const c of W.chars) {
    if (c.alive || c.gone || c.downT > 6 || c.downT < 0.5) continue;
    if (!V.project(c.x, c.y + 0.9, c.z, P3)) continue;
    const dd = Math.hypot(c.x - P.x, c.z - P.z); if (dd > 30) continue;
    g.globalAlpha = clamp((6 - c.downT) / 1, 0, 0.8) * clamp(1.3 - dd / 30, 0.3, 1);
    plate(g, P3.x - 16, P3.y - 8, 32, 16, 5, 0.55); txt(g, 'OUT', P3.x, P3.y, 9, W.ffa || c.team !== P.team ? FOE : ALLY, 'center', '800'); g.globalAlpha = 1;
  }
  for (const mk of markers(W)) {
    const front = V.project(mk.x, mk.y + 0.6, mk.z, P3);
    let sx = P3.x, sy = P3.y;
    const dd = Math.round(Math.hypot(mk.x - P.x, mk.z - P.z));
    const off = !front || sx < 30 || sx > w - 30 || sy < 70 || sy > h - 90;
    if (off) {
      const ang = Math.atan2(-(mk.x - P.x), -(mk.z - P.z)) - P.yaw, dx = -Math.sin(ang), dy = -Math.cos(ang);
      const k = Math.min((w / 2 - 40) / Math.max(0.01, Math.abs(dx)), (h / 2 - 100) / Math.max(0.01, Math.abs(dy)));
      sx = w / 2 + dx * k; sy = h / 2 + dy * k;
      g.save(); g.translate(sx, sy); g.rotate(Math.atan2(dy, dx) + Math.PI / 2); g.fillStyle = mk.col; g.beginPath(); g.moveTo(0, -10); g.lineTo(7, 4); g.lineTo(-7, 4); g.closePath(); g.fill(); g.restore();
    } else {
      g.save(); g.translate(sx, sy);
      if (mk.flag) {
        const f = mk.flag; g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.stroke();
        g.strokeStyle = mk.col; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, 13, 0, TAU); g.stroke();
        if (f.by >= 0) { g.strokeStyle = f.by === P.team ? ALLY : FOE; g.lineWidth = 3.5; g.beginPath(); g.arc(0, 0, 13, -Math.PI / 2, -Math.PI / 2 + TAU * Math.abs(f.prog)); g.stroke(); }
        g.restore(); txt(g, f.name, sx, sy, 12, mk.col, 'center', '800');
        txt(g, dd + ' m', sx, sy + 23, 10, mk.col, 'center', '700'); continue;
      }
      g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 5; g.beginPath(); g.moveTo(0, -10); g.lineTo(8, 0); g.lineTo(0, 10); g.lineTo(-8, 0); g.closePath(); g.stroke();
      g.strokeStyle = mk.col; g.lineWidth = 2.4; g.stroke(); g.restore();
    }
    txt(g, mk.label.toUpperCase() + '  ' + dd + ' m', sx, sy + (off ? -18 : 22), sm ? 9 : 10, mk.col, 'center', '700');
  }
  // crosshair
  if (fp && !scoped) drawCrosshair(g, w, h, W, P, V, d, sm);
  if (V.flat && P.alive && V.aimPoint) { const ap = V.aimPoint; g.strokeStyle = 'rgba(244,239,230,0.85)'; g.lineWidth = 1.6; g.beginPath(); g.arc(ap.x, ap.y, 9 + P.bloom * 3, 0, TAU); g.stroke(); if (W.hitMark > 0) { g.strokeStyle = W.hitKO > 0 ? RED : INK; g.lineWidth = 2.4; const s = 8; g.beginPath(); g.moveTo(ap.x - s, ap.y - s); g.lineTo(ap.x + s, ap.y + s); g.moveTo(ap.x + s, ap.y - s); g.lineTo(ap.x - s, ap.y + s); g.stroke(); } }
  // where hits came from
  for (const hh of W.hurt) {
    const ang = hh.a - P.yaw, k = 1 - hh.t / 1.8, R = Math.min(w, h) * 0.16;
    g.save(); g.translate(w / 2, h / 2); g.rotate(-ang);
    g.strokeStyle = 'rgba(255,80,50,' + (0.85 * k) + ')'; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, R, -Math.PI / 2 - 0.32, -Math.PI / 2 + 0.32); g.stroke(); g.restore();
  }
  // grenade warnings
  if (P.alive) for (const n of W.nades) {
    if (n.kind !== 'frag' || Math.hypot(n.x - P.x, n.z - P.z) > 8 || n.owner === P && n.t < 0.6) continue;
    const ang = Math.atan2(-(n.x - P.x), -(n.z - P.z)) - P.yaw, R = Math.min(w, h) * 0.12;
    const gx = w / 2 - Math.sin(ang) * R, gy = h / 2 - Math.cos(ang) * R;
    plate(g, gx - 13, gy - 13, 26, 26, 13, 0.6); g.fillStyle = RED; g.beginPath(); g.arc(gx, gy + 2, 5, 0, TAU); g.fill(); g.fillRect(gx - 1.5, gy - 7, 3, 5);
  }
  // stealth: who is starting to notice you
  if (W.stealth && !W.alarm && P.alive) {
    for (const c of W.chars) {
      if (!c.bot || !c.alive || c.team === P.team || c.bot.alert < 0.08) continue;
      const ang = Math.atan2(-(c.x - P.x), -(c.z - P.z)) - P.yaw, R = Math.min(w, h) * 0.2, k = clamp(c.bot.alert, 0, 1);
      g.save(); g.translate(w / 2, h / 2); g.rotate(-ang);
      g.strokeStyle = k > 0.7 ? 'rgba(255,90,60,0.9)' : k > 0.4 ? 'rgba(255,200,90,0.85)' : 'rgba(244,239,230,0.6)'; g.lineWidth = 5;
      g.beginPath(); g.arc(0, 0, R, -Math.PI / 2 - 0.22 * k - 0.05, -Math.PI / 2 + 0.22 * k + 0.05); g.stroke(); g.restore();
    }
  }
  /* --- top: score bug, compass, objective --- */
  const bugW = sm ? 216 : 320, by0 = pad.top;
  drawBug(g, a, W, w / 2 - bugW / 2, by0, bugW, sm);
  if (!V.flat) drawCompass(g, a, W, w / 2, by0 + 56, sm ? Math.min(w - 180, 200) : 360);
  let oy = by0 + (V.flat ? 62 : 82);
  const obj = objectiveLine(W);
  if (obj) {
    g.font = '600 ' + (sm ? 12 : 13) + 'px ' + F_BODY; const tw = Math.min(w - 32, g.measureText(obj).width + 34);
    plate(g, w / 2 - tw / 2, oy - 12, tw, 24, 12, 0.5);
    g.fillStyle = GOLD; g.beginPath(); g.moveTo(w / 2 - tw / 2 + 12, oy - 5); g.lineTo(w / 2 - tw / 2 + 17, oy); g.lineTo(w / 2 - tw / 2 + 12, oy + 5); g.lineTo(w / 2 - tw / 2 + 7, oy); g.fill();
    txt(g, obj, w / 2 + 8, oy, sm ? 12 : 13, INK, 'center', '600', F_BODY);
    oy += 22;
  }
  if (W.obj && (W.obj.def.t === 'hold' || W.obj.def.t === 'defend' || W.obj.def.t === 'plant') && W.kind === 'campaign') {
    const k = W.obj.def.t === 'plant' ? W.obj.prog / W.obj.def.time : W.obj.prog / W.obj.def.time;
    if (k > 0 || W.obj.def.t !== 'plant') { plate(g, w / 2 - 80, oy - 4, 160, 8, 4, 0.5); g.fillStyle = W.obj.contested || W.obj.lost > 0 ? RED : GOLD; rr(g, w / 2 - 80, oy - 4, 160 * clamp(k, 0, 1), 8, 4); g.fill(); oy += 14; if (W.obj.contested) { txt(g, 'CONTESTED', w / 2, oy, 10, RED, 'center', '800'); oy += 14; } else if (W.obj.lost > 0) { txt(g, 'THEY ARE TAKING THE SQUARE', w / 2, oy, 10, RED, 'center', '800'); oy += 14; } }
  }
  if (W.stealth) { txt(g, W.alarm ? 'ALARM RAISED' : 'UNDETECTED', w / 2, oy + 4, 10, W.alarm ? RED : '#9de07a', 'center', '800'); oy += 16; }
  if (W.convoy) drawConvoy(g, W, w / 2, oy + 6, sm);
  if (W.lesson && W.lesson.i >= 0 && W.lesson.i < LESSONS.length) drawLesson(g, a, W, oy + 10, sm);
  if (W.course && (W.course.run || W.course.done)) txt(g, W.course.t.toFixed(2) + ' s', w / 2, oy + 18, sm ? 22 : 28, W.course.done ? GOLD : INK, 'center', '800');
  /* --- radar --- */
  const mR = sm ? 36 : mid ? 54 : 66;
  drawRadar(g, a, W, pad.left + mR + 2, sm ? pad.top + (V.flat ? 52 : 74) + mR : pad.top + mR + 2, mR);
  /* --- kill feed --- */
  let fy = sm ? pad.top + (V.flat ? 52 : 74) + mR * 2 + 24 : pad.top + 10;
  const fx = w - pad.right - 2;
  for (const f of W.feed.slice(0, sm ? 3 : 5)) {
    g.globalAlpha = clamp((6 - f.t) / 0.6, 0, 1);
    g.font = '600 ' + (sm ? 10 : 12) + 'px ' + F_BODY;
    const mid2 = '  [' + f.how + ']  ', wa = g.measureText(f.a).width, wm = g.measureText(mid2).width, wb = g.measureText(f.b).width, tw = wa + wm + wb + 16;
    const x0 = sm ? w - pad.right - tw : fx - tw;
    plate(g, x0, fy - 10, tw, 20, 6, 0.45);
    txt(g, f.a, x0 + 8, fy, sm ? 10 : 12, f.col, 'left', '700', F_BODY);
    txt(g, mid2, x0 + 8 + wa, fy, sm ? 10 : 12, DIM, 'left', '500', F_BODY);
    txt(g, f.b, x0 + 8 + wa + wm, fy, sm ? 10 : 12, f.colB, 'left', '700', F_BODY);
    g.globalAlpha = 1; fy += 23;
  }
  /* --- radio --- */
  let cy0 = h * (sm ? 0.42 : 0.6);
  for (const c of W.calls.slice(0, 2)) {
    g.globalAlpha = clamp(Math.min(c.t / 0.2, (4.4 - c.t) / 0.5), 0, 1);
    g.font = '600 ' + (sm ? 11 : 13) + 'px ' + F_BODY;
    const lines = wrapLines(g, c.text, Math.min(w * 0.55, 420));
    const tw = Math.max(...lines.map((l) => g.measureText(l).width)) + 22, th = lines.length * 17 + 9;
    plate(g, pad.left, cy0 - th / 2, tw, th, 7, 0.5);
    g.fillStyle = c.text.indexOf('Hearth:') === 0 ? GOLD : ALLY; g.fillRect(pad.left, cy0 - th / 2, 3, th);
    lines.forEach((l, i) => txt(g, l, pad.left + 12, cy0 - th / 2 + 13 + i * 17, sm ? 11 : 13, INK, 'left', '600', F_BODY));
    g.globalAlpha = 1; cy0 -= th + 8;
  }
  /* --- medals and points --- */
  W.medals.forEach((m, k) => {
    const t = m.t / 2.4, al = clamp(Math.min(m.t / 0.15, (2.4 - m.t) / 0.4), 0, 1), s = 1 + (1 - clamp(m.t / 0.2, 0, 1)) * 0.4;
    g.globalAlpha = al; const yy = h * 0.3 + k * 30;
    g.save(); g.translate(w / 2, yy); g.scale(s, s); txt(g, m.name.toUpperCase(), 0, 0, sm ? 15 : 19, GOLD, 'center', '800'); g.restore();
    g.globalAlpha = 1; void t;
  });
  W.pops.forEach((p, k) => { const t = p.t / 1.4; g.globalAlpha = 1 - smooth01((t - 0.6) / 0.4); txt(g, p.text, w / 2, h / 2 + 58 + k * 20 - t * 22, sm ? 13 : 15, p.col, 'center', '800'); g.globalAlpha = 1; });
  /* --- bottom: health, streaks, weapon --- */
  const bot = h - pad.bottom - 6, gest = a.touchMode && a.touchStyle !== 'pads';
  if (P.alive && W.phase === 'live') {
    const bw = sm ? 120 : 180;
    plate(g, pad.left, bot - 40, bw + 20, 44, 10);
    const hp = clamp(P.hp / P.hpMax, 0, 1);
    txt(g, P.stance === 'prone' ? 'PRONE' : P.stance === 'crouch' || P.stance === 'slide' ? 'CROUCH' : P.sprint ? 'SPRINT' : 'HEALTH', pad.left + 10, bot - 30, 9, DIM, 'left', '700');
    g.fillStyle = 'rgba(255,255,255,0.1)'; rr(g, pad.left + 10, bot - 20, bw, 9, 4); g.fill();
    g.fillStyle = hp > 0.5 ? '#e9f1f4' : hp > 0.25 ? GOLD : RED; rr(g, pad.left + 10, bot - 20, Math.max(5, bw * hp), 9, 4); g.fill();
    if (P.armor > 0) { g.fillStyle = '#8fd3ff'; rr(g, pad.left + 10, bot - 8, bw * P.armor / 50, 4, 2); g.fill(); }
    // scorestreaks
    if (W.kind === 'mp') {
      let sx = pad.left + bw + 2;
      STREAKS.forEach((s, k) => {
        const ready = streakReady(W, P, s), used = P.streaksUsed[s.id], prog = clamp(P.streakPts / (s.cost * (P.perks.indexOf('hard') >= 0 ? 0.8 : 1)), 0, 1);
        const x = pad.left + 10 + k * (sm ? 40 : 60), y = bot - 58;
        plate(g, x, y - 12, sm ? 36 : 56, 18, 5, ready ? 0.7 : 0.42);
        if (!used) { g.fillStyle = ready ? GOLD : 'rgba(255,211,106,0.35)'; rr(g, x + 2, y + 2, ((sm ? 36 : 56) - 4) * prog, 2, 1); g.fill(); }
        txt(g, sm ? s.name.split(' ')[0].slice(0, 5).toUpperCase() : s.name.split(' ')[0].toUpperCase(), x + (sm ? 18 : 28), y - 4, sm ? 8 : 9, used ? 'rgba(244,239,230,0.3)' : ready ? GOLD : DIM, 'center', '800');
        if (ready && !a.touchMode) txt(g, a.gamepad ? 'Y' : String(k + 4), x + (sm ? 18 : 28), y + 12, 9, GOLD, 'center', '800');
      });
      void sx;
    }
    // weapon and ammo
    const s = curW(P), gw = sm ? 128 : 196;
    const ax = gest ? pad.left + gw + 8 : w - pad.right, ay = gest ? bot - 66 : bot;
    if (!(gest && sm)) {
      plate(g, ax - gw - 6, ay - 56, gw + 6, 60, 10);
      const mag = d.mag > 999 ? '' : String(s.mag);
      if (d.mag > 999) { const ht = P.heat || 0; txt(g, P.overheat > 0 ? 'OVERHEAT' : 'HEAT', ax - gw + 6, ay - 28, 11, P.overheat > 0 ? RED : DIM, 'left', '800'); g.fillStyle = 'rgba(255,255,255,0.12)'; rr(g, ax - gw + 6, ay - 18, gw - 18, 7, 3); g.fill(); g.fillStyle = ht > 0.75 ? RED : GOLD; rr(g, ax - gw + 6, ay - 18, (gw - 18) * clamp(ht, 0, 1), 7, 3); g.fill(); }
      else { txt(g, mag, ax - (sm ? 54 : 78), ay - 26, sm ? 24 : 30, s.mag ? INK : RED, 'right', '800'); txt(g, '/ ' + s.spare, ax - (sm ? 50 : 74), ay - 22, 12, DIM, 'left', '600'); }
      txt(g, d.name.toUpperCase(), ax - gw + 6, ay - 46, 10, GOLD, 'left', '800');
      txt(g, 'F' + P.frag + '  ' + (P.lo.tactical === 'flash' ? 'FL' : 'SM') + P.tac, ax - 10, ay - 8, 10, DIM, 'right', '700');
      for (let k = 0; k < 2; k++) { g.fillStyle = k === P.cur ? INK : 'rgba(255,255,255,0.18)'; rr(g, ax - gw + 6 + k * 16, ay - 7, 12, 4, 2); g.fill(); }
    } else {
      txt(g, d.mag > 999 ? (P.overheat > 0 ? 'OVERHEAT' : '') : s.mag + ' / ' + s.spare, pad.left + bw + 12, bot - 30, 12, s.mag ? INK : RED, 'right', '800');
    }
    if (s.reloadT > 0 && !V.flat) { const k = 1 - s.reloadT / Math.max(0.01, s.reloadDur); g.strokeStyle = 'rgba(244,239,230,0.85)'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 22, -Math.PI / 2, -Math.PI / 2 + k * TAU); g.stroke(); txt(g, 'RELOADING', w / 2, h / 2 + 38, 10, INK, 'center', '700'); }
    else if (d.mag < 999 && s.mag <= Math.ceil(d.mag * 0.25)) txt(g, s.mag ? 'LOW AMMO' : (s.spare ? (a.touchMode ? 'RELOAD' : 'RELOAD  R') : 'NO AMMO'), w / 2, h / 2 + 38, 10, s.mag ? GOLD : RED, 'center', '700');
    if (P.cookT >= 0) { const k = clamp(P.cookT / 3.2, 0, 1); txt(g, 'COOKING ' + (3.2 - P.cookT).toFixed(1), w / 2, h / 2 + 54, 11, k > 0.7 ? RED : GOLD, 'center', '800'); }
    // a use prompt
    const pr = usePrompt(W, P, a);
    if (pr) { g.font = '700 12px ' + F_BODY; const tw = g.measureText(pr).width + 24; plate(g, w / 2 - tw / 2, h * 0.64 - 13, tw, 26, 13, 0.6); txt(g, pr, w / 2, h * 0.64, 12, INK, 'center', '700', F_BODY); if (W.useK > 0) { g.fillStyle = GOLD; rr(g, w / 2 - tw / 2 + 6, h * 0.64 + 9, (tw - 12) * clamp(W.useK, 0, 1), 3, 1.5); g.fill(); } }
  }
  /* --- down cam --- */
  if (!P.alive && W.downCam && W.phase === 'live') {
    const DC = W.downCam, k = clamp(DC.t / 0.4, 0, 1), K = DC.killer >= 0 ? W.chars[DC.killer] : null;
    g.globalAlpha = k;
    txt(g, 'KNOCKED DOWN', w / 2, lb + 24, 12, RED, 'center', '800');
    txt(g, K ? K.name : 'Out of the fight', w / 2, h - lb - 50, sm ? 20 : 26, INK, 'center', '500', F_DISP);
    txt(g, K ? DC.wname + '  ·  ' + DC.dist + ' m' : '', w / 2, h - lb - 24, 11, DIM, 'center', '600');
    if (W.dem) txt(g, 'Out for the round. Watching your squad.', w / 2, h / 2 + (sm ? 80 : 110), 12, GOLD, 'center', '700');
    else txt(g, W.kind === 'campaign' ? 'Back at the last checkpoint in ' + Math.max(1, Math.ceil(P.respawnT)) : 'Back in ' + Math.max(1, Math.ceil(P.respawnT)), w / 2, h / 2 + (sm ? 80 : 110), 13, GOLD, 'center', '700');
    g.globalAlpha = 1;
  }
  if (W.dem && (W.dem.betweenT > 0 || W.prepT > 0)) {
    txt(g, W.dem.betweenT > 0 ? 'ROUND OVER' : 'ROUND ' + W.dem.round + (W.dem.attack === P.team ? '  ·  ATTACK' : '  ·  DEFEND'), w / 2, h * 0.36, sm ? 18 : 24, GOLD, 'center', '800');
    if (W.prepT > 0) txt(g, 'Starts in ' + Math.ceil(W.prepT), w / 2, h * 0.36 + 28, 12, INK, 'center', '700');
  }
  if (W.phase === 'final') {
    const k = clamp(W.final.t / 0.4, 0, 1); g.globalAlpha = k;
    const won = W.winner === P.team, draw = W.winner < 0;
    txt(g, W.kind === 'campaign' ? (W.winner === 0 ? 'MISSION COMPLETE' : 'MISSION FAILED') : W.kind === 'range' ? 'TRAINING DONE' : draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT', w / 2, h / 2 - 20, sm ? 30 : 46, W.kind === 'campaign' && W.winner !== 0 || (!won && !draw && W.kind === 'mp') ? RED : GOLD, 'center', '500', F_DISP);
    txt(g, finalLine(W), w / 2, h / 2 + 18, sm ? 11 : 13, INK, 'center', '600');
    g.globalAlpha = 1;
  }
  if ((I && I.board) || (W.dem && W.dem.betweenT > 0)) drawBoard(g, a, W, sm);
  if (a.touchMode && a.state === 'play' && W.phase === 'live') drawTouchHelp(g, a, W, V);
  fade(g, a, W);
}
function finalLine(W) {
  const why = W.why;
  if (W.kind === 'campaign') return why === 'truck' ? 'The convoy was stopped.' : why === 'lost' ? 'The square fell.' : why === 'timer' ? 'You did not get clear in time.' : W.mission.name;
  if (W.kind === 'range') return 'The Pit';
  return why === 'time' ? 'Time' : why === 'rounds' ? 'Final round' : 'Score limit';
}
function fade(g, a, W) {
  W.fadeIn = Math.max(0, (W.fadeIn || 0) - 1 / 60 * 2.2);
  if (W.fadeIn > 0.01) { g.fillStyle = 'rgba(3,3,4,' + W.fadeIn + ')'; g.fillRect(0, 0, a.w, a.h); }
}
function objectiveLine(W) {
  const P = W.P;
  if (W.kind === 'campaign' && W.obj) {
    const o = W.obj.def;
    if (o.t === 'ko') return o.text + ' (' + W.obj.count + '/' + o.n + ')';
    if (o.t === 'hold' || o.t === 'defend') return o.text + '  ' + fmt(o.time - W.obj.prog);
    if (o.timer) return o.text + '  ' + fmt(W.obj.timer);
    return o.text;
  }
  if (W.dem) {
    const D = W.dem;
    if (D.charge) return D.attack === P.team ? 'Defend the charge' : 'Disarm the charge at ' + 'AB'[D.charge.site];
    if (P.hasCharge) return 'You carry the charge: plant at A or B';
    if (D.dropped) return D.attack === P.team ? 'Pick up the dropped charge' : 'They dropped the charge';
    return D.attack === P.team ? 'Escort the charge to A or B' : 'Defend sites A and B';
  }
  if (W.flags && W.phase === 'live') return null;
  return null;
}
function usePrompt(W, P, a) {
  const key = a.touchMode ? 'Hold Use' : a.gamepad ? 'Hold X' : 'Hold F';
  if (W.kind === 'campaign' && W.obj && W.obj.def.t === 'plant' && Math.hypot(P.x - W.obj.x, P.z - W.obj.z) < 1.9) return key + ' to ' + (W.obj.def.quiet ? 'place the tracker' : 'plant the charge');
  if (W.dem) {
    const D = W.dem;
    if (P.hasCharge && !D.charge) for (let i = 0; i < W.demSites.length; i++) if (Math.hypot(P.x - W.demSites[i].x, P.z - W.demSites[i].z) < 2.6) return key + ' to plant at ' + 'AB'[i];
    if (D.charge && D.attack !== P.team && Math.hypot(P.x - D.charge.x, P.z - D.charge.z) < 1.8) return key + ' to disarm';
  }
  for (const cr of W.crates) if (cr.landed && cr.uses > 0 && Math.hypot(cr.x - P.x, cr.z - P.z) < 2.2) return (a.touchMode ? 'Tap Use' : a.gamepad ? 'Press X' : 'Press F') + ' to resupply';
  if (W.stealth) for (const c of W.chars) { if (!c.alive || c.team === P.team || !c.bot) continue; const dx = c.x - P.x, dz = c.z - P.z, d = Math.hypot(dx, dz); if (d < 1.8 && (-Math.sin(c.yaw) * dx - Math.cos(c.yaw) * dz) / d > 0.3 && (!c.bot.vis)) return (a.touchMode ? 'Tap Use' : a.gamepad ? 'Press R3' : 'Press V or F') + ': quiet takedown'; }
  return null;
}
function drawBug(g, a, W, x, y, bw, sm) {
  const P = W.P;
  plate(g, x, y, bw, 44, 10);
  const clock = fmt(matchClock(W));
  if (W.kind === 'mp' && !W.ffa) {
    const mine = W.score[P.team], theirs = W.score[1 - P.team];
    g.fillStyle = 'rgba(95,182,255,0.85)'; rr(g, x + 5, y + 5, 52, 34, 7); g.fill(); txt(g, '' + mine, x + 31, y + 22, 18, '#06121c', 'center', '800');
    g.fillStyle = 'rgba(255,106,74,0.85)'; rr(g, x + bw - 57, y + 5, 52, 34, 7); g.fill(); txt(g, '' + theirs, x + bw - 31, y + 22, 18, '#1c0806', 'center', '800');
    txt(g, W.dem ? 'ROUND ' + W.dem.round : clock, x + bw / 2, y + 16, sm ? 13 : 15, INK, 'center', '700');
    txt(g, W.dem ? (W.dem.charge ? 'CHARGE ' + Math.ceil(W.dem.charge.t) : clock) + '  ·  TO ' + W.target : (sm ? W.mp.short + ' · ' : W.mp.name.toUpperCase() + '  ·  ') + 'TO ' + W.target, x + bw / 2, y + 33, 9, DIM, 'center', '600');
    if (W.flags) W.flags.forEach((f, i) => { const fx = x + bw / 2 - 30 + i * 30, fy = y + 56 + (sm ? 0 : 0); void fx; void fy; });
  } else if (W.ffa) {
    const sorted = W.chars.slice().sort((p, q) => W.score[q.team] - W.score[p.team]);
    const lead = sorted[0], rank = sorted.indexOf(P) + 1;
    txt(g, clock, x + bw / 2, y + 15, sm ? 13 : 15, INK, 'center', '700');
    txt(g, 'YOU ' + W.score[P.team] + '  ·  ' + ordinal(rank) + '  ·  LEAD ' + W.score[lead.team] + ' / ' + W.target, x + bw / 2, y + 32, 9, DIM, 'center', '700');
  } else if (W.kind === 'campaign') {
    txt(g, W.mission.name.toUpperCase(), x + bw / 2, y + 15, sm ? 12 : 14, GOLD, 'center', '800');
    txt(g, (W.convoy ? 'CONVOY' : 'OBJECTIVE ' + (W.objI + 1) + ' / ' + W.mission.objs.length) + '  ·  ' + fmt(W.missionT), x + bw / 2, y + 32, 9, DIM, 'center', '700');
  } else {
    txt(g, 'THE PIT', x + bw / 2, y + 15, sm ? 12 : 14, GOLD, 'center', '800');
    txt(g, W.rangeMode === 'course' ? 'KILL HOUSE' : W.rangeMode === 'free' ? 'FREE PRACTICE  ·  ' + (W.rangeScore || 0) : 'LESSON ' + Math.min(LESSONS.length, W.lesson.i + 1) + ' / ' + LESSONS.length, x + bw / 2, y + 32, 9, DIM, 'center', '700');
  }
  // domination flags under the bug
  if (W.flags) W.flags.forEach((f, i) => {
    const fx = x + bw / 2 + (i - 1) * 32, fy = y + 62;
    g.fillStyle = 'rgba(8,10,12,0.6)'; g.beginPath(); g.arc(fx, fy, 12, 0, TAU); g.fill();
    g.strokeStyle = f.owner < 0 ? 'rgba(244,239,230,0.5)' : f.owner === P.team ? ALLY : FOE; g.lineWidth = 2.5; g.beginPath(); g.arc(fx, fy, 12, 0, TAU); g.stroke();
    if (f.by >= 0 && f.prog > 0) { g.strokeStyle = f.by === P.team ? ALLY : FOE; g.lineWidth = 3; g.beginPath(); g.arc(fx, fy, 12, -Math.PI / 2, -Math.PI / 2 + TAU * f.prog); g.stroke(); }
    txt(g, f.name, fx, fy, 11, f.contested ? RED : INK, 'center', '800');
  });
}
const ordinal = (n) => n + (n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th');
function drawConvoy(g, W, cx, y, sm) {
  const V = W.convoy; const bw = sm ? 150 : 220;
  V.trucks.forEach((t, i) => {
    const yy = y + i * 12;
    txt(g, i === 0 ? 'LEAD' : 'TRUCK ' + (i + 1), cx - bw / 2 - 6, yy, 9, DIM, 'right', '700');
    g.fillStyle = 'rgba(255,255,255,0.12)'; rr(g, cx - bw / 2, yy - 3, bw, 6, 3); g.fill();
    const k = clamp(t.hp / t.hpMax, 0, 1); g.fillStyle = k > 0.5 ? '#9de07a' : k > 0.25 ? GOLD : RED; rr(g, cx - bw / 2, yy - 3, bw * k, 6, 3); g.fill();
  });
  const blocked = V.block < ROADBLOCKS.length && W.convoy.trucks[0].v < 0.3;
  if (blocked) txt(g, 'ROADBLOCK: SHOOT THE BARRELS', cx, y + 44, 10, GOLD, 'center', '800');
}
function drawLesson(g, a, W, y, sm) {
  const L = LESSONS[W.lesson.i]; if (!L) return;
  const w = a.w, bw = Math.min(w - 32, 440);
  plate(g, w / 2 - bw / 2, y, bw, 44, 10, 0.6);
  txt(g, 'LESSON ' + (W.lesson.i + 1) + '  ·  ' + L.text.toUpperCase(), w / 2, y + 14, sm ? 10 : 11, GOLD, 'center', '800');
  g.font = '500 ' + (sm ? 11 : 12) + 'px ' + F_BODY;
  const ln = wrapLines(g, L.hint, bw - 20)[0];
  txt(g, ln, w / 2, y + 31, sm ? 11 : 12, INK, 'center', '500', F_BODY);
}
function drawCrosshair(g, w, h, W, P, V, d, sm) {
  const fov = (V.fov ? V.fov() : 70) * Math.PI / 180, sp = spreadOf(P);
  const cx = w / 2, cy = h / 2;
  const adsK = P.adsK;
  if (adsK > 0.55 && d.optic !== 'iron') {
    // red dot or ring sight
    g.fillStyle = 'rgba(255,60,40,' + (adsK) + ')'; g.beginPath(); g.arc(cx, cy, 2.2, 0, TAU); g.fill();
    if (d.optic === 'ring') { g.strokeStyle = 'rgba(255,60,40,' + adsK * 0.85 + ')'; g.lineWidth = 1.4; g.beginPath(); g.arc(cx, cy, 11, 0, TAU); g.stroke(); }
  } else if (adsK > 0.55) {
    g.fillStyle = 'rgba(244,239,230,' + adsK * 0.8 + ')'; g.beginPath(); g.arc(cx, cy, 1.6, 0, TAU); g.fill();
  } else {
    const gap = clamp(Math.tan(sp) / Math.tan(fov / 2) * h / 2, 3, 70) + 4 + P.recoilP * 60;
    const a2 = 0.9 - adsK;
    const L = sm ? 7 : 9;
    const lines = () => { g.beginPath(); g.moveTo(cx - gap - L, cy); g.lineTo(cx - gap, cy); g.moveTo(cx + gap, cy); g.lineTo(cx + gap + L, cy); g.moveTo(cx, cy + gap); g.lineTo(cx, cy + gap + L); if (d.pellets) { g.moveTo(cx, cy - gap - L); g.lineTo(cx, cy - gap); } else { g.moveTo(cx, cy - gap - L); g.lineTo(cx, cy - gap); } g.stroke(); };
    g.strokeStyle = 'rgba(0,0,0,' + 0.45 * a2 + ')'; g.lineWidth = 3.4; lines();
    g.strokeStyle = (V.aimOn ? 'rgba(255,120,90,' : 'rgba(244,239,230,') + a2 + ')'; g.lineWidth = 1.6; lines();
    g.fillStyle = 'rgba(244,239,230,' + a2 + ')'; g.fillRect(cx - 1, cy - 1, 2, 2);
  }
  if (W.hitMark > 0) {
    const k = W.hitMark, ko = W.hitKO > 0, s = 7 + (1 - k) * 4 + (ko ? 4 : 0);
    g.strokeStyle = ko ? RED : W.hitHead > 0 ? GOLD : 'rgba(255,255,255,' + k + ')'; g.lineWidth = ko ? 3 : 2.2;
    g.beginPath(); g.moveTo(cx - s, cy - s); g.lineTo(cx - s / 2.5, cy - s / 2.5); g.moveTo(cx + s, cy - s); g.lineTo(cx + s / 2.5, cy - s / 2.5); g.moveTo(cx - s, cy + s); g.lineTo(cx - s / 2.5, cy + s / 2.5); g.moveTo(cx + s, cy + s); g.lineTo(cx + s / 2.5, cy + s / 2.5); g.stroke();
  }
}
function drawScope(g, w, h, d, W) {
  const R = Math.min(w, h) * 0.44, cx = w / 2, cy = h / 2;
  g.save(); g.fillStyle = 'rgba(2,3,4,0.97)'; g.beginPath(); g.rect(0, 0, w, h); g.arc(cx, cy, R, 0, TAU, true); g.fill();
  const vg = g.createRadialGradient(cx, cy, R * 0.72, cx, cy, R); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.75)'); g.fillStyle = vg; g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(6,6,8,0.95)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx - 8, cy); g.moveTo(cx + 8, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy + 8); g.lineTo(cx, cy + R); g.moveTo(cx, cy - R); g.lineTo(cx, cy - 8); g.stroke();
  g.lineWidth = 3.5; g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx - R * 0.55, cy); g.moveTo(cx + R * 0.55, cy); g.lineTo(cx + R, cy); g.moveTo(cx, cy + R * 0.55); g.lineTo(cx, cy + R); g.stroke();
  for (let k = 1; k <= 4; k++) { g.fillStyle = 'rgba(6,6,8,0.9)'; g.fillRect(cx - 4, cy + k * R * 0.1, 8, 1.2); }
  g.fillStyle = '#ff4a2a'; g.beginPath(); g.arc(cx, cy, 1.8, 0, TAU); g.fill();
  const P = W.P; if (P.breath < 0.98) { g.fillStyle = 'rgba(255,255,255,0.15)'; rr(g, cx - 40, cy + R * 0.7, 80, 4, 2); g.fill(); g.fillStyle = GOLD; rr(g, cx - 40, cy + R * 0.7, 80 * P.breath, 4, 2); g.fill(); }
  g.restore();
  if (W.hitMark > 0) { g.strokeStyle = W.hitKO > 0 ? RED : '#fff'; g.lineWidth = 2.4; const s = 10; g.beginPath(); g.moveTo(cx - s, cy - s); g.lineTo(cx - 4, cy - 4); g.moveTo(cx + s, cy - s); g.lineTo(cx + 4, cy - 4); g.moveTo(cx - s, cy + s); g.lineTo(cx - 4, cy + 4); g.moveTo(cx + s, cy + s); g.lineTo(cx + 4, cy + 4); g.stroke(); }
}
function drawIntro(g, a, W, lb) {
  const w = a.w, h = a.h, t = W.phaseT, sm = w < 560;
  const k = clamp(t / 0.6, 0, 1) * clamp((W.introDur - t) / 0.5, 0, 1);
  g.globalAlpha = k;
  if (W.kind === 'campaign') {
    const L = W.mission.intro;
    txt(g, L[0], w / 2, lb + 30, sm ? 12 : 14, GOLD, 'center', '800');
    txt(g, L[1], w / 2, lb + 52, 11, DIM, 'center', '600');
    const shown = Math.floor(clamp((t - 0.6) / 3.6, 0, 1) * W.mission.brief.length);
    g.font = '500 ' + (sm ? 13 : 16) + 'px ' + F_BODY;
    const ln = wrapLines(g, W.mission.brief.slice(0, shown), Math.min(w - 40, 640));
    ln.forEach((l, i) => txt(g, l, w / 2, h - lb - (sm ? 34 : 40) - (ln.length - 1 - i) * (sm ? 18 : 22), sm ? 13 : 16, INK, 'center', '500', F_BODY));
    txt(g, L[2].toUpperCase(), w / 2, h - lb - 14, 10, DIM, 'center', '700');
  } else if (W.kind === 'mp') {
    txt(g, W.mp.name.toUpperCase(), w / 2, lb + 30, sm ? 12 : 14, GOLD, 'center', '800');
    txt(g, W.M.name, w / 2, h - lb - 58, sm ? 28 : 40, INK, 'center', '500', F_DISP);
    txt(g, W.M.where + '  ·  ' + W.M.when, w / 2, h - lb - 30, 11, DIM, 'center', '600');
    txt(g, W.ffa ? 'Eight soldiers, no sides' : FACTIONS[0].name + '  vs  ' + FACTIONS[1].name, w / 2, h - lb - 14, 10, ALLY, 'center', '700');
  } else {
    txt(g, 'TRAINING', w / 2, lb + 30, sm ? 12 : 14, GOLD, 'center', '800');
    txt(g, 'The Pit', w / 2, h - lb - 46, sm ? 28 : 40, INK, 'center', '500', F_DISP);
    txt(g, 'Halberd training ground', w / 2, h - lb - 18, 11, DIM, 'center', '600');
  }
  txt(g, a.touchMode ? 'Tap to skip' : 'Click or press Space to skip', w / 2, lb + 72, 10, 'rgba(244,239,230,0.5)', 'center', '600');
  g.globalAlpha = 1;
}
function drawKillcam(g, a, W, lb) {
  const K = W.kc, w = a.w, h = a.h, sm = w < 560; if (!K) return;
  const killer = W.chars[K.ko.killer], victim = W.chars[K.ko.victim];
  txt(g, 'FINAL KILLCAM', w / 2, lb + 24, sm ? 12 : 14, RED, 'center', '800');
  if (K.slow < 0.9) txt(g, 'SLOW MOTION', w / 2, lb + 44, 9, DIM, 'center', '700');
  txt(g, killer ? killer.name : '', w / 2, h - lb - 48, sm ? 20 : 28, killer ? teamCol(W, killer) : INK, 'center', '500', F_DISP);
  txt(g, (victim ? 'on ' + victim.name : '') + (K.ko.how === 'blast' ? '  ·  blast' : '') + (K.ko.head ? '  ·  precision' : '') + '  ·  ' + Math.round(K.ko.dist) + ' m', w / 2, h - lb - 22, 11, DIM, 'center', '600');
  // a thin progress line
  const p = clamp((K.t - K.start) / (K.end - K.start), 0, 1);
  g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(w * 0.3, h - lb - 6, w * 0.4, 2); g.fillStyle = RED; g.fillRect(w * 0.3, h - lb - 6, w * 0.4 * p, 2);
}
export function drawBoard(g, a, W, sm) {
  const P = W.P, rows = W.chars.slice().sort((x, y) => (W.ffa ? W.score[y.team] - W.score[x.team] : 0) || y.score - x.score);
  const w = a.w, h = a.h, bw = Math.min(w - 24, 560), rowH = sm ? 18 : 22;
  const teams = W.ffa ? [rows] : [rows.filter((c) => c.team === P.team), rows.filter((c) => c.team !== P.team)];
  const total = teams.reduce((n, t) => n + t.length + 1, 0), bh = total * rowH + 26;
  const x0 = w / 2 - bw / 2, y0 = Math.max(60, h / 2 - bh / 2);
  plate(g, x0, y0, bw, bh, 12, 0.78);
  let y = y0 + 16;
  const col = (s, k, c, al, wt) => txt(g, s, x0 + k * bw, y, sm ? 10 : 12, c, al || 'left', wt || '600', F_BODY);
  teams.forEach((list, ti) => {
    const tc = W.ffa ? GOLD : ti === 0 ? ALLY : FOE;
    col(W.ffa ? 'FREE FOR ALL' : FACTIONS[ti === 0 ? 0 : 1].name.toUpperCase() + '  ' + (W.score[ti === 0 ? P.team : 1 - P.team] | 0), 0.04, tc, 'left', '800');
    col('SCORE', 0.62, DIM, 'right', '700'); col('DOWNS', 0.76, DIM, 'right', '700'); col('ASSISTS', 0.88, DIM, 'right', '700'); col('OUT', 0.97, DIM, 'right', '700');
    y += rowH;
    for (const c of list) {
      if (c === P) { g.fillStyle = 'rgba(255,211,106,0.1)'; g.fillRect(x0 + 6, y - rowH / 2, bw - 12, rowH); }
      col((c.alive ? '' : '· ') + c.name, 0.04, c === P ? GOLD : INK); col('' + c.score, 0.62, INK, 'right'); col('' + c.kos, 0.76, INK, 'right'); col('' + c.assists, 0.88, INK, 'right'); col('' + c.downs, 0.97, INK, 'right');
      y += rowH;
    }
  });
}
function drawTouchHelp(g, a, W, V) {
  const T = V.touch; if (!T) return;
  if (a.touchStyle !== 'pads') {
    if (T.move) { g.strokeStyle = 'rgba(244,239,230,0.32)'; g.lineWidth = 2; g.beginPath(); g.arc(T.move.sx, T.move.sy, 52, 0, TAU); g.stroke(); g.fillStyle = 'rgba(244,239,230,0.3)'; g.beginPath(); g.arc(T.move.sx + T.mx * 52, T.move.sy + T.mz * 52, 22, 0, TAU); g.fill(); }
    else if (W.t < 16 + W.introDur) { g.globalAlpha = 0.5; txt(g, 'MOVE', a.w * 0.22, a.h * 0.7, 11, INK, 'center', '700'); txt(g, 'LOOK', a.w * 0.72, a.h * 0.7, 11, INK, 'center', '700'); txt(g, 'TAP TO FIRE', a.w * 0.72, a.h * 0.7 + 16, 9, INK, 'center', '700'); g.strokeStyle = 'rgba(244,239,230,0.22)'; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(a.w / 2, a.h * 0.45); g.lineTo(a.w / 2, a.h * 0.86); g.stroke(); g.setLineDash([]); g.globalAlpha = 1; }
  }
  if (a.choices.autofire !== 'off' && W.P.alive) txt(g, 'AUTO FIRE', a.w / 2, a.h / 2 + 52, 9, V.aimOn ? FOE : 'rgba(244,239,230,0.3)', 'center', '700');
}
