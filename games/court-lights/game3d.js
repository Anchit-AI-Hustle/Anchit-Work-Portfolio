import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX as createPost, contactShadow } from '/games/shared/fx3d.js';
import { createHuman, createCrowd, crowdRows } from '/games/shared/human.js';
import { createVFX } from '/games/shared/vfx.js';
import { boot as coreBoot, MATCH as M, BALL as B, CT, TEAMS, LEAGUE, RACKS, rackPos, drawCrest, titles, UNL, isThree, hoopZ, replaying, RISE } from '/games/court-lights/core.js';
/*
 * Court Lights in 3D: the Floodlight League's arena. A polished hardwood floor under a bowl of light,
 * two glass backboards with their own shot clocks, a crowd in tiers on four sides, benches and the
 * scorer's table, a centre-hung scoreboard, LED ribbons and the clubs' banners in the rafters.
 *
 * The rules, the AI, the clocks and the HUD live in core.js; this file draws them: every player is a
 * person from the shared people library, posed here for basketball (the dribble in time with the ball,
 * the jump shot, layups, dunks and hanging on the rim, passes, blocks, the defensive stance, screens),
 * and a broadcast director picks the camera: the TV angle in landscape, a baseline angle on a phone
 * held upright, close-ups for the player intros, slow-motion replays of dunks and buzzer beaters.
 *
 * The rooftop shootout (the original Court Lights) has its own world in roof3d.js, loaded only when
 * that mode is played.
 */
const A = window.Arcade;
const TAU = Math.PI * 2, PI = Math.PI;
const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, hypot = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const rnd = Math.random;
const rr = (a, b) => a + (b - a) * rnd();
const F_DISP = 'Fraunces, Times New Roman, serif';
const F_UI = 'Inter, sans-serif';

let arc = null, POST = null, VFX = null, ROOF = null;
const R3 = { ok: false, lost: false, q: 2, lock: false, soft: false, fps: null, accT: 0, accN: 0, settle: 1, time: 0, last: 0, realDt: 1 / 60, venue: 'arena', late: [], cam: 'auto' };
const W = {};      // arena objects
const PV = new Map(); // player id -> its visual
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _ax = new THREE.Vector3();
const HOME_FLOOR = { wood: '#c8925a', wood2: '#b07a46' };

/* ====================================================================== textures */
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (o.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = R3.aniso || 4;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  if (o.flipU) { t.repeat.x = -1; t.offset.x = 1; }
  t.userData.canvas = c;
  return t;
}
// fine noise in one pass of pixels, not thousands of rectangles
// (a small tile of noise laid over the whole canvas as a pattern: cheap at any size)
let NOISE_TILE = null;
function noise(g, w, h, amt) {
  if (!NOISE_TILE) {
    NOISE_TILE = document.createElement('canvas'); NOISE_TILE.width = NOISE_TILE.height = 128;
    const ng = NOISE_TILE.getContext('2d'), id = ng.createImageData(128, 128), d = id.data;
    let s = 7;
    for (let i = 0; i < d.length; i += 4) { s = (s * 16807) % 2147483647; const v = (s / 2147483647) * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; }
    ng.putImageData(id, 0, 0);
  }
  g.save(); g.globalAlpha = clamp(amt / 90, 0.02, 0.4); g.globalCompositeOperation = 'overlay';
  g.fillStyle = g.createPattern(NOISE_TILE, 'repeat'); g.fillRect(0, 0, w, h); g.restore();
}
// Court: 34 x 20 m of floor (the court and its apron) at 48 px a metre.
const FW = 34, FH = 20, FPX = 48;
const FLOORPAINT = { c1: '#a3402a', c3: '#18130f' };
function floorTex() {
  const T = FLOORPAINT;
  return canvasTex(FW * FPX, FH * FPX, (g, w, h) => {
    const px = (x) => (x + FW / 2) * FPX, pz = (z) => (z + FH / 2) * FPX; // canvas x = court z (length), canvas y = court x
    // apron in the home club's darkest colour
    g.fillStyle = T.c3; g.fillRect(0, 0, w, h);
    // maple boards along the length, each a slightly different tone, butt joints staggered
    const cx0 = px(-CT.HL), cx1 = px(CT.HL), cy0 = pz(-CT.HW), cy1 = pz(CT.HW);
    const bw = 0.078 * FPX;
    let s = 99;
    const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
    for (let y = 0; y < h; y += bw) {
      let x = -r() * 120;
      while (x < w) {
        const L = (1.4 + r() * 2.2) * FPX;
        const k = 0.86 + r() * 0.2;
        g.fillStyle = 'rgb(' + Math.round(200 * k) + ',' + Math.round(146 * k) + ',' + Math.round(92 * k) + ')';
        g.fillRect(x, y, L - 1, bw - 0.6);
        x += L;
      }
    }
    noise(g, w, h, 10, 11);
    // the apron outside the lines in the club's dark colour, a clean border of bare maple next to the lines
    g.fillStyle = T.c3; g.globalAlpha = 0.92;
    const m = 0.9 * FPX;
    g.fillRect(0, 0, w, cy0 - m); g.fillRect(0, cy1 + m, w, h - cy1 - m); g.fillRect(0, 0, cx0 - m, h); g.fillRect(cx1 + m, 0, w - cx1 - m, h);
    g.globalAlpha = 1;
    // the paint: keys and the centre circle in the club colour
    g.fillStyle = T.c1; g.globalAlpha = 0.86;
    g.fillRect(px(CT.HL - 5.8), pz(-CT.KEYW), 5.8 * FPX, CT.KEYW * 2 * FPX);
    g.fillRect(px(-CT.HL), pz(-CT.KEYW), 5.8 * FPX, CT.KEYW * 2 * FPX);
    g.beginPath(); g.arc(px(0), pz(0), CT.CIRC * FPX, 0, TAU); g.fill();
    g.globalAlpha = 1;
    // lines
    const LW = 0.05 * FPX;
    g.strokeStyle = '#fbf5ec'; g.lineWidth = LW;
    g.strokeRect(cx0, cy0, cx1 - cx0, cy1 - cy0);
    g.beginPath(); g.moveTo(px(0), cy0); g.lineTo(px(0), cy1); g.stroke();
    g.beginPath(); g.arc(px(0), pz(0), CT.CIRC * FPX, 0, TAU); g.stroke();
    for (const s2 of [-1, 1]) {
      const hz = s2 * CT.HOOP, base = s2 * CT.HL;
      // key and free throw circle
      g.strokeRect(s2 > 0 ? px(CT.HL - 5.8) : px(-CT.HL), pz(-CT.KEYW), 5.8 * FPX, CT.KEYW * 2 * FPX);
      g.beginPath(); g.arc(px(s2 * CT.FT), pz(0), CT.CIRC * FPX, s2 > 0 ? PI / 2 : -PI / 2, s2 > 0 ? PI * 1.5 : PI / 2); g.stroke();
      g.setLineDash([0.35 * FPX, 0.3 * FPX]); g.beginPath(); g.arc(px(s2 * CT.FT), pz(0), CT.CIRC * FPX, s2 > 0 ? -PI / 2 : PI / 2, s2 > 0 ? PI / 2 : PI * 1.5); g.stroke(); g.setLineDash([]);
      // three point line: corners then the arc
      const zc = hz - s2 * 1.414;
      g.beginPath(); g.moveTo(px(base), pz(-CT.CORNER)); g.lineTo(px(zc), pz(-CT.CORNER)); g.stroke();
      g.beginPath(); g.moveTo(px(base), pz(CT.CORNER)); g.lineTo(px(zc), pz(CT.CORNER)); g.stroke();
      const a0 = Math.atan2(CT.CORNER, -s2 * 1.414);
      g.beginPath();
      if (s2 > 0) g.arc(px(hz), pz(0), CT.ARC * FPX, PI - 1.36, PI + 1.36); else g.arc(px(hz), pz(0), CT.ARC * FPX, -1.36, 1.36);
      g.stroke(); void a0;
      // restricted area arc
      g.beginPath(); if (s2 > 0) g.arc(px(hz), pz(0), 1.25 * FPX, PI / 2, PI * 1.5); else g.arc(px(hz), pz(0), 1.25 * FPX, -PI / 2, PI / 2); g.stroke();
      // lane hash marks
      for (const k of [1.75, 2.6, 3.45]) for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(px(base - s2 * k), pz(sx * CT.KEYW)); g.lineTo(px(base - s2 * k), pz(sx * (CT.KEYW + 0.12))); g.stroke(); }
    }
    // the league along both sidelines; the home club's crest and name are decals laid on top (setFloorTeam)
    g.font = 'italic 600 ' + (0.62 * FPX) + 'px ' + F_DISP; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = 'rgba(251,245,236,.82)';
    g.save(); g.translate(px(-7.2), pz(CT.HW + 1.05)); g.fillText(LEAGUE, 0, 0); g.restore();
    g.save(); g.translate(px(7.2), pz(CT.HW + 1.05)); g.fillText(LEAGUE, 0, 0); g.restore();
    // footprints of play: a sheen worn into the lanes and the wings
    const wear = (x, z, r2, a) => { const gr = g.createRadialGradient(px(x), pz(z), 2, px(x), pz(z), r2 * FPX); gr.addColorStop(0, 'rgba(255,230,190,' + a + ')'); gr.addColorStop(1, 'rgba(255,230,190,0)'); g.fillStyle = gr; g.fillRect(px(x) - r2 * FPX, pz(z) - r2 * FPX, r2 * 2 * FPX, r2 * 2 * FPX); };
    wear(10, 0, 4, 0.07); wear(-10, 0, 4, 0.07); wear(0, 0, 3, 0.05);
  }, { clamp: true, flipU: true });
}
function ballTex(gold) {
  return canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = gold ? '#d9a63a' : '#c4622c'; g.fillRect(0, 0, w, h);
    noise(g, w, h, 26, 5);
    g.strokeStyle = gold ? '#4a3208' : '#1e120c'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
    for (const x of [w * 0.25, w * 0.75]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    g.beginPath(); for (let x = 0; x <= w; x += 4) { const y = h / 2 + sin(x / w * TAU * 2) * h * 0.32; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  });
}
function glowTex() {
  return canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,240,220,.55)'); gr.addColorStop(1, 'rgba(255,220,180,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { clamp: true });
}
const LED_TEXT = [LEAGUE.toUpperCase(), 'MAKE SOME NOISE', 'COURT LIGHTS', 'DEFENCE!', 'EVERY POSSESSION COUNTS'];
function ledTex() {
  return canvasTex(2048, 64, (g, w, h) => {
    g.fillStyle = '#05060a'; g.fillRect(0, 0, w, h);
    g.font = '800 40px ' + F_UI; g.textBaseline = 'middle';
    let x = 20, i = 0;
    while (x < w) { const s = LED_TEXT[i % LED_TEXT.length]; const T = TEAMS[i % TEAMS.length]; g.fillStyle = i % 2 ? '#ffb736' : T.c2; g.fillText(s, x, h / 2 + 2); x += g.measureText(s).width + 60; g.fillStyle = '#ff6940'; g.fillRect(x - 36, h / 2 - 5, 10, 10); i++; }
    for (let y = 0; y < h; y += 4) { g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, y, w, 1); }
  }, { repeat: [1, 1] });
}

/* ====================================================================== the arena */
function std(o) { return new THREE.MeshStandardMaterial(o); }
function buildFloor() {
  W.floorMat = std({ map: floorTex(), roughness: 0.34, metalness: 0.0 });
  // canvas x runs along the court's length (z), canvas y across it (x)
  const g = new THREE.PlaneGeometry(FW, FH); g.rotateX(-PI / 2); g.rotateY(PI / 2);
  const floor = new THREE.Mesh(g, W.floorMat); floor.receiveShadow = true; W.arena.add(floor); W.floor = floor; W.floorHome = M.teams[0] || 1;
  // the concourse floor beyond the stands
  const out = new THREE.Mesh(new THREE.PlaneGeometry(90, 90).rotateX(-PI / 2), std({ color: 0x15131a, roughness: 0.9 }));
  out.position.y = -0.02; W.arena.add(out);
  // the home club's crest at centre court and its name under both baskets: small decals, redrawn in a moment
  W.crestC = document.createElement('canvas'); W.crestC.width = W.crestC.height = 256;
  W.crestT = new THREE.CanvasTexture(W.crestC); W.crestT.colorSpace = THREE.SRGBColorSpace;
  const dm = (map) => std({ map, transparent: true, roughness: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  const cg = new THREE.PlaneGeometry(3, 3); cg.rotateX(-PI / 2);
  const crest = new THREE.Mesh(cg, dm(W.crestT)); crest.position.y = 0.003; crest.rotation.y = PI / 2; crest.renderOrder = 1; crest.receiveShadow = true; W.arena.add(crest);
  W.nameC = document.createElement('canvas'); W.nameC.width = 512; W.nameC.height = 96;
  W.nameT = new THREE.CanvasTexture(W.nameC); W.nameT.colorSpace = THREE.SRGBColorSpace;
  for (const s of [-1, 1]) {
    const ng = new THREE.PlaneGeometry(6.4, 1.2); ng.rotateX(-PI / 2);
    const nm = new THREE.Mesh(ng, dm(W.nameT)); nm.position.set(0, 0.003, s * (CT.HL + 1.05)); nm.rotation.y = s > 0 ? PI : 0; nm.renderOrder = 1; W.arena.add(nm);
  }
  W.floorHome = -1; setFloorTeam(M.teams[0] || 1);
}
function setFloorTeam(home) {
  if (!W.crestC || W.floorHome === home) return;
  const T = TEAMS[home];
  const g = W.crestC.getContext('2d'); g.clearRect(0, 0, 256, 256); g.globalAlpha = 0.92; drawCrest(g, T, 128, 128, 112); W.crestT.needsUpdate = true;
  const n = W.nameC.getContext('2d'); n.clearRect(0, 0, 512, 96); n.font = '800 64px ' + F_UI; n.textAlign = 'center'; n.textBaseline = 'middle'; n.fillStyle = T.c2; n.globalAlpha = 0.88; n.fillText(T.name.toUpperCase(), 256, 52); W.nameT.needsUpdate = true;
  W.floorHome = home;
  W.padDunk = null;
}
// stanchion padding: the home club's colour in a game, a quiet charcoal in the dunk contest so the dunk owns the frame
function padTone() {
  const dk = M.kind === 'dunk';
  if (!W.padMats || W.padDunk === dk) return;
  W.padDunk = dk;
  W.padMats.forEach((m) => { if (dk) m.color.setHex(0x26282f); else m.color.set(TEAMS[W.floorHome >= 0 ? W.floorHome : 1].c1).multiplyScalar(0.42); });
}
function buildHoops() {
  W.hoops = [];
  const metal = std({ color: 0x2a2c31, roughness: 0.4, metalness: 0.8 });
  W.padMat = std({ color: TEAMS[M.teams[0] || 1].c1, roughness: 0.8 });
  const glass = std({ color: 0xffffff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.22, depthWrite: false });
  const frame = std({ color: 0xf2efe8, roughness: 0.3, metalness: 0.4, emissive: 0xff2a1a, emissiveIntensity: 0 });
  const rimM = std({ color: 0xff5a1c, roughness: 0.35, metalness: 0.6, emissive: 0xff5a1c, emissiveIntensity: 0.05 });
  W.padMats = [];
  const metal0 = metal, glass0 = glass, frame0 = frame, pad0 = W.padMat;
  for (const s of [-1, 1]) {
    // each basket has its own materials, so the one between the camera and the play can fade on its own
    const metal = metal0.clone(), glass = glass0.clone(), frame = frame0.clone(), padM = pad0.clone();
    for (const m of [metal, padM, frame]) { m.transparent = true; m.opacity = 1; }
    W.padMats.push(padM);
    const g = new THREE.Group(); W.arena.add(g);
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 2.0), metal); base.position.set(0, 0.4, s * (CT.HL + 2.3)); base.castShadow = true; base.receiveShadow = true; g.add(base);
    const bpadF = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.86, 0.12), padM); bpadF.position.set(0, 0.42, s * (CT.HL + 1.3)); g.add(bpadF);
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.34, 3.9, 0.34), metal); pole.position.set(0, 2.9, s * (CT.HL + 1.6)); pole.rotation.x = s * 0.18; pole.castShadow = true; g.add(pole);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.46, 2.0, 0.46), padM); pad.position.set(0, 1.0, s * (CT.HL + 1.35)); pad.castShadow = true; g.add(pad);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 2.4), metal); arm.position.set(0, 4.35, s * (CT.BOARD + 1.3)); arm.castShadow = true; g.add(arm);
    const arm2 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 2.0), metal); arm2.position.set(0, 3.55, s * (CT.BOARD + 1.05)); arm2.rotation.x = s * 0.42; g.add(arm2);
    const bw = CT.BW * 2, bh = CT.BY1 - CT.BY0, by = (CT.BY0 + CT.BY1) / 2, bz = s * (CT.BOARD + 0.02);
    const board = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.03), glass); board.position.set(0, by, bz); board.renderOrder = 4; g.add(board);
    // the frame around the glass (it glows red when the clock runs out) and the inner square
    const fr = new THREE.Group(); g.add(fr);
    const bar = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frame); m.position.set(x, y, bz); fr.add(m); };
    bar(bw + 0.08, 0.05, 0, CT.BY1); bar(bw + 0.08, 0.05, 0, CT.BY0); bar(0.05, bh, -CT.BW, by); bar(0.05, bh, CT.BW, by);
    const sq = (w, h, x, y) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.012), frame); m.position.set(x, y, bz - s * 0.02); g.add(m); };
    sq(0.59, 0.04, 0, CT.RIM_Y + 0.45); sq(0.04, 0.45, -0.275, CT.RIM_Y + 0.25); sq(0.04, 0.45, 0.275, CT.RIM_Y + 0.25);
    const bpad = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.1, 0.1, 0.1), padM); bpad.position.set(0, CT.BY0 - 0.05, bz); g.add(bpad);
    // the shot clock sits on top of the board
    const scCanvas = document.createElement('canvas'); scCanvas.width = 128; scCanvas.height = 64;
    const scTex = new THREE.CanvasTexture(scCanvas); scTex.colorSpace = THREE.SRGBColorSpace;
    const scM = [std({ color: 0x111111 }), std({ color: 0x111111 }), std({ color: 0x111111 }), std({ color: 0x111111 }), std({ map: scTex, emissive: 0xffffff, emissiveMap: scTex, emissiveIntensity: 1.2, color: 0x000000 }), std({ map: scTex, emissive: 0xffffff, emissiveMap: scTex, emissiveIntensity: 1.2, color: 0x000000 })];
    scM.forEach((m) => { m.transparent = true; });
    const sc = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.32, 0.18), scM);
    sc.position.set(0, CT.BY1 + 0.24, bz); g.add(sc);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(CT.RIM_R, 0.012, 8, 36), rimM); rim.rotation.x = PI / 2; rim.position.set(0, CT.RIM_Y, s * CT.HOOP); rim.castShadow = true; g.add(rim);
    const brk = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.2), rimM); brk.position.set(0, CT.RIM_Y - 0.02, s * (CT.HOOP + CT.RIM_R + 0.07)); g.add(brk);
    // the net: twelve strands that a make really moves
    const net = []; for (let i = 0; i < 12; i++) { const st = []; for (let k = 0; k < 6; k++) st.push(new THREE.Vector3()); net.push(st); }
    const pos = new Float32Array(12 * 5 * 3 * 6);
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    const lines = new THREE.LineSegments(ng, new THREE.LineBasicMaterial({ color: 0xf6f2ea, transparent: true, opacity: 0.9 })); lines.frustumCulled = false; g.add(lines);
    const H = { s, g, rim, rimM, frameM: frame, net, pos, lines, swish: 9, wob: 0, sc: { canvas: scCanvas, tex: scTex, last: '' }, board, fade: 0, fadeMats: [metal, padM, frame].concat(scM), glass };
    netRest(H, 0); net.forEach((st, i) => st.forEach((p, k) => p.copy(H.rest[i][k])));
    W.hoops.push(H);
  }
  W.rimM = rimM;
}
function netRest(H, stretch) {
  if (!H.rest) H.rest = H.net.map((s) => s.map(() => new THREE.Vector3()));
  const hz = H.s * CT.HOOP;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU;
    for (let k = 0; k < 6; k++) { const u = k / 5, r = CT.RIM_R * (1 - u * 0.5); H.rest[i][k].set(cos(a + u * 0.25) * r, CT.RIM_Y - u * (0.42 + stretch * 0.16), hz + sin(a + u * 0.25) * r); }
  }
}
function stepNet(H, dt) {
  const sw = clamp(1 - H.swish / 0.5, 0, 1);
  netRest(H, sw);
  const k = 1 - Math.exp(-dt * 11), hz = H.s * CT.HOOP;
  const near = abs(B.z - hz) < 0.8 && B.y < CT.RIM_Y + 0.1 && B.y > CT.RIM_Y - 0.7;
  for (let i = 0; i < 12; i++) for (let j = 0; j < 6; j++) {
    const p = H.net[i][j], t = H.rest[i][j];
    if (j === 0) { p.copy(t); continue; }
    let tx = t.x, ty = t.y, tz = t.z;
    if (near) { const dx = t.x - B.x, dz = t.z - B.z, dy = t.y - B.y, d = hypot(dx, dy, dz); if (d < CT.BR + 0.05) { const push = (CT.BR + 0.05 - d) / (d || 1); tx += dx * push; tz += dz * push; ty += dy * push * 0.4; } }
    p.x = lerp(p.x, tx, k); p.y = lerp(p.y, ty, k); p.z = lerp(p.z, tz, k);
  }
  const a = H.pos; let o = 0;
  const put = (p) => { a[o++] = p.x; a[o++] = p.y; a[o++] = p.z; };
  for (let i = 0; i < 12; i++) { const s = H.net[i], n = H.net[(i + 1) % 12]; for (let q = 0; q < 5; q++) { put(s[q]); put(n[q + 1]); put(n[q]); put(s[q + 1]); put(s[q + 1]); put(n[q + 1]); } }
  H.lines.geometry.attributes.position.needsUpdate = true;
}
// Seating on four sides, raised in tiers; the people come later.
const STANDS = [
  { origin: [CT.HW + 3.4, 0.45, -15.5], along: [0, 1], per: 52, rows: 11, face: [0, 1, 0] },
  { origin: [-CT.HW - 4.0, 0.45, 15.5], along: [0, -1], per: 52, rows: 11, face: [0, 1, 0] },
  { origin: [-9.5, 0.45, CT.HL + 4.2], along: [1, 0], per: 32, rows: 9, face: [0, 1, 0] },
  { origin: [9.5, 0.45, -CT.HL - 4.2], along: [-1, 0], per: 32, rows: 9, face: [0, 1, 0] },
];
function buildStands() {
  const seatM = std({ color: 0x22242c, roughness: 0.75, metalness: 0.1 });
  const n = STANDS.reduce((a, s) => a + s.rows, 0);
  const steps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), seatM, n + 8);
  const o = new THREE.Object3D(); let k = 0;
  for (const s of STANDS) {
    const L = s.per * 0.6, ax = s.along[0], az = s.along[1];
    const bx = -az, bz = ax; // away from the floor
    const sgn = (s.origin[0] * bx + s.origin[2] * bz) > 0 ? 1 : -1;
    for (let j = 0; j < s.rows; j++) {
      const h = 0.45 + j * 0.42;
      const cx = s.origin[0] + ax * L / 2 + bx * sgn * j * 0.85, cz = s.origin[2] + az * L / 2 + bz * sgn * j * 0.85;
      o.position.set(cx, h / 2, cz); o.scale.set(abs(ax) > 0.5 ? L : 0.86, h, abs(az) > 0.5 ? L : 0.86); o.rotation.set(0, 0, 0); o.updateMatrix(); steps.setMatrixAt(k++, o.matrix);
    }
  }
  // the walls of the bowl behind the last row
  [[0, 3.5, -24, 60, 7, 0.5], [0, 3.5, 24, 60, 7, 0.5], [-20.5, 3.5, 0, 0.5, 7, 50], [20.5, 3.5, 0, 0.5, 7, 50]].forEach((b) => { o.position.set(b[0], b[1], b[2]); o.scale.set(b[3], b[4], b[5]); o.updateMatrix(); steps.setMatrixAt(k++, o.matrix); });
  steps.count = k; steps.receiveShadow = true; W.arena.add(steps);
  // LED ribbons along the front of the stands and the baselines
  W.ledTex = ledTex(); W.ledTex.wrapS = THREE.RepeatWrapping;
  const ledM = new THREE.MeshBasicMaterial({ map: W.ledTex, toneMapped: false, color: 0xd8d8d8 });
  W.ledM = ledM;
  const mk = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.7), ledM); m.position.set(x, 0.42, z); m.rotation.y = ry; W.arena.add(m); };
  mk(30, CT.HW + 2.6, 0, -PI / 2); mk(15, 0, CT.HL + 3.2, PI); mk(15, 0, -CT.HL - 3.2, 0);
  const ring = new THREE.Mesh(new THREE.CylinderGeometry(19, 19, 0.6, 48, 1, true), new THREE.MeshBasicMaterial({ map: W.ledTex, toneMapped: false, side: THREE.BackSide, color: 0x9a9a9a }));
  ring.position.y = 6.2; W.arena.add(ring); W.ring = ring;
}
function buildBenches() {
  const benchM = std({ color: 0x2a2f3a, roughness: 0.7 });
  const g = new THREE.Group(); W.arena.add(g);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 5.6), benchM); b.position.set(-CT.HW - 1.75, 0.225, s * 4.3); b.castShadow = true; b.receiveShadow = true; g.add(b);
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.5, 5.6), benchM); back.position.set(-CT.HW - 2.05, 0.7, s * 4.3); g.add(back);
  }
  // the scorer's table with a lit front
  const table = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 3.0), std({ color: 0x1a1c22, roughness: 0.5, metalness: 0.3 })); table.position.set(-CT.HW - 1.9, 0.4, 0); g.add(table);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 0.5), W.ledM); front.position.set(-CT.HW - 1.49, 0.45, 0); front.rotation.y = PI / 2; g.add(front);
  W.benchSeats = (side, i) => ({ x: -CT.HW - 1.75, z: (side === 0 ? -1 : 1) * (2.1 + i * 0.85) });
}
// The roof: trusses, banks of lights, the centre-hung scoreboard and the banners.
function buildRoof() {
  const truss = std({ color: 0x1b1d22, roughness: 0.6, metalness: 0.6 });
  const beams = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), truss, 10);
  const o = new THREE.Object3D(); let k = 0;
  for (let i = -2; i <= 2; i++) { o.position.set(0, 15.5, i * 8); o.scale.set(44, 0.5, 0.6); o.updateMatrix(); beams.setMatrixAt(k++, o.matrix); }
  for (const x of [-11, 11]) { o.position.set(x, 15.2, 0); o.scale.set(0.6, 0.5, 40); o.updateMatrix(); beams.setMatrixAt(k++, o.matrix); }
  beams.count = k; W.arena.add(beams);
  // light banks: bright panels the bloom picks up
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff4e2, toneMapped: false });
  W.lampM = lamp;
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(1.4, 0.25, 0.8), lamp, 16);
  k = 0;
  for (const x of [-9, -4.5, 4.5, 9]) for (const z of [-12, -4, 4, 12]) { o.position.set(x, 14.6, z); o.scale.set(1, 1, 1); o.rotation.set(0, 0, 0); o.updateMatrix(); lamps.setMatrixAt(k++, o.matrix); }
  W.arena.add(lamps);
  // the scoreboard over centre court: four screens
  const jc = document.createElement('canvas'); jc.width = 512; jc.height = 256;
  const jt = new THREE.CanvasTexture(jc); jt.colorSpace = THREE.SRGBColorSpace;
  W.jumbo = { canvas: jc, tex: jt, last: '' };
  const jg = new THREE.Group(); jg.position.set(0, 10.6, 0); W.arena.add(jg); W.jumboG = jg;
  const box = new THREE.Mesh(new THREE.BoxGeometry(5.4, 3.0, 5.4), std({ color: 0x101114, roughness: 0.5, metalness: 0.6 })); jg.add(box);
  const scrM = new THREE.MeshBasicMaterial({ map: jt, toneMapped: false });
  for (let i = 0; i < 4; i++) { const sc = new THREE.Mesh(new THREE.PlaneGeometry(5.0, 2.5), scrM); const a = i * PI / 2; sc.position.set(sin(a) * 2.72, 0, cos(a) * 2.72); sc.rotation.y = a; jg.add(sc); }
  const band = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.4, 32, 1, true), new THREE.MeshBasicMaterial({ map: W.ledTex, toneMapped: false, side: THREE.DoubleSide })); band.position.y = -1.8; jg.add(band);
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 4.4, 4), truss); cable.position.set(0, 3.7, 0); jg.add(cable);
  // banners: every club's crest, and a gold one for each title the player has won
  const bg = new THREE.Group(); W.arena.add(bg); W.banners = bg;
  TEAMS.forEach((T, i) => {
    const tex = canvasTex(128, 256, (g2, w, h) => { g2.fillStyle = T.c3; g2.fillRect(0, 0, w, h); g2.fillStyle = T.c1; g2.fillRect(6, 6, w - 12, h - 12); drawCrest(g2, T, w / 2, h * 0.38, w * 0.38); g2.fillStyle = T.c2; g2.font = '800 18px ' + F_UI; g2.textAlign = 'center'; g2.fillText(T.name.toUpperCase(), w / 2, h * 0.8); }, { clamp: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }));
    const z = (i < 4 ? -1 : 1) * 20.5, x = -6 + (i % 4) * 4;
    m.position.set(x, 11.5, z); m.rotation.y = z > 0 ? PI : 0; bg.add(m);
  });
  const tt = titles();
  tt.slice(-4).forEach((t, i) => {
    const T = TEAMS[t.team];
    const tex = canvasTex(128, 256, (g2, w, h) => { g2.fillStyle = '#d4a446'; g2.fillRect(0, 0, w, h); g2.fillStyle = '#2a1d08'; g2.font = '800 16px ' + F_UI; g2.textAlign = 'center'; g2.fillText('CHAMPIONS', w / 2, 40); drawCrest(g2, T, w / 2, h * 0.5, w * 0.32); g2.fillText(new Date(t.at).getFullYear() + '', w / 2, h * 0.86); }, { clamp: true });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 2.8), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }));
    m.position.set(19.8, 11.5, -6 + i * 4); m.rotation.y = -PI / 2; bg.add(m);
  });
}
// The crowd: four tiers of people, one instanced draw each, front rows first so a slow device keeps only those.
function buildCrowd(i) {
  const s = STANDS[i];
  const members = crowdRows({ origin: s.origin, rows: s.rows, perRow: s.per, seatW: 0.6, rowD: 0.85, rowH: 0.42, along: s.along, face: [0, 0, 0], seed: 21 + i, fill: 0.9 });
  const cols = [TEAMS[M.teams[0] || 1].c1, TEAMS[M.teams[0] || 1].c2, TEAMS[M.teams[1] || 0].c1];
  const crowd = createCrowd({ members, unit: 1, seed: 11 + i, quality: R3.soft ? 0 : R3.q >= 2 ? 2 : 1, lod: R3.q >= 3 ? 'mid' : 'far', colors: cols, teamShare: 0.5 });
  crowd.mesh.frustumCulled = false;
  W.arena.add(crowd.mesh);
  W.crowds = W.crowds || []; W.crowds.push({ c: crowd, full: crowd.count, perRow: s.per });
  crowdQuality();
}
function crowdQuality() {
  if (!W.crowds) return;
  const rows = R3.soft || R3.q === 0 ? 2 : R3.q === 1 ? 5 : 99;
  for (const C of W.crowds) C.c.mesh.count = min(C.full, Math.round(C.perRow * 0.9 * rows));
}
function buildLights() {
  const L = W.lights = {};
  L.hemi = new THREE.HemisphereLight(0xa8b0d0, 0x4a3828, 0.95); W.arena.add(L.hemi);
  const key = new THREE.DirectionalLight(0xfff1de, 3.2);
  key.position.set(4, 22, -3); key.target.position.set(0, 0, 0);
  key.castShadow = true;
  const sc = key.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 11; sc.bottom = -11; sc.near = 4; sc.far = 40;
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.03; key.shadow.mapSize.set(1024, 1024);
  W.arena.add(key); W.arena.add(key.target); L.key = key;
  const fill = new THREE.DirectionalLight(0xc8d4ff, 0.9); fill.position.set(-8, 10, 6); W.arena.add(fill); L.fill = fill;
  // a follow spot for the introductions: always there, dark until it is needed, so no shader ever recompiles
  const spot = new THREE.SpotLight(0xfff0d6, 0, 26, 0.24, 0.5, 1.2); spot.position.set(0, 13, 0); spot.target.position.set(0, 0, 0);
  W.arena.add(spot); W.arena.add(spot.target); L.spot = spot;
  // a cone of light you can see in the haze when the spot is on
  const cg = new THREE.CylinderGeometry(0.15, 3.0, 13, 24, 1, true); cg.translate(0, -6.5, 0);
  L.cone = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: 0xffe7c0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  L.cone.position.set(0, 13, 0); W.arena.add(L.cone);
}
function buildEnv() {
  if (R3.soft) return;
  try {
    const env = new THREE.Scene();
    env.add(new THREE.Mesh(new THREE.SphereGeometry(30, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.07), side: THREE.BackSide })));
    const lamp = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.4, 7.4) });
    for (const x of [-9, -4.5, 4.5, 9]) for (const z of [-12, -4, 4, 12]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), lamp); m.position.set(x * 0.9, 14, z * 0.9); m.rotation.x = PI / 2; env.add(m); }
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(22, 22, 8, 24, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.16, 0.12, 0.12), side: THREE.BackSide })); stand.position.y = 4; env.add(stand);
    const pm = new THREE.PMREMGenerator(R3.renderer);
    W.env = pm.fromScene(env, 0.02).texture; pm.dispose();
    if (R3.venue === 'arena') { R3.scene.environment = R3.q >= 1 ? W.env : null; R3.scene.environmentIntensity = 0.55; }
  } catch (e) { /* plain lighting */ }
}

/* ====================================================================== the players */
// Home clubs wear their light kit, visitors their colour. People are made a couple a frame, kept for reuse.
function kitFor(p, side) {
  const T = TEAMS[side === 0 ? M.teams[0] : side === 1 ? M.teams[1] : p.info.team], home = side === 0;
  const shoes = ['#f4f1ea', '#16171b', home ? T.c1 : T.c2][p.info.seed % 3];
  // home whites: the club's light colour, or a cream if its second colour is dark
  const lum = (h) => { const c = new THREE.Color(h); return c.r * 0.3 + c.g * 0.59 + c.b * 0.11; };
  const light = lum(T.c2) > 0.5 ? T.c2 : '#f1ece2';
  return { top: home ? light : T.c1, top2: home ? T.c1 : T.c2, sleeves: 'none', bottom: home ? light : T.c1, legs: 'long-shorts', socks: home ? T.c1 : '#f2efe8', socksHigh: (p.info.seed % 4) !== 0, shoes, soles: '#e9e6df', number: p.info.num, numberInk: home ? T.c1 : (lum(T.c1) > 0.5 ? '#16171b' : '#f6f1e8') };
}
function humanQ() { return R3.soft ? 0 : R3.q >= 2 ? 3 : R3.q >= 1 ? 2 : 1; }
function makeVis(p, side) {
  const H = createHuman({ seed: p.info.seed, quality: humanQ(), sex: 'm', build: p.info.build, height: p.info.h, hair: p.info.hair, outfit: kitFor(p, side), castShadow: R3.q >= 1 && !R3.soft });
  H.group.visible = false; W.arena.add(H.group);
  const V = { H, id: p.info.id, kit: side, lastAct: '', sit: false, L: { sx: 0, sz: 0, ex: 0, wx: 0 }, R: { sx: 0, sz: 0, ex: 0, wx: 0 }, wL: 0, wR: 0, c: 0, lean: 0, seen: 0, acc: 0 };
  PV.set(p.info.id, V);
  return V;
}
function makeRef(i) {
  const H = createHuman({ seed: 900 + i * 13, quality: humanQ(), sex: 'm', build: 'average', height: 1.78, hair: i ? 'short' : 'bald', outfit: { top: '#2b2d33', top2: '#c9a96e', sleeves: 'short', bottom: '#3c3e44', legs: 'trousers', shoes: '#111214', soles: '#2a2a2a' }, castShadow: R3.q >= 1 && !R3.soft });
  W.arena.add(H.group); return { H, lastAct: '', pointT: 0 };
}
// who should be on screen now, and the people still to be made for them
function wantedPeople() {
  const list = [];
  for (let s = 0; s < 2; s++) for (const p of M.side[s] || []) list.push([p, s]);
  if (M.kind === 'dunk' && M.dk) M.dk.list.forEach((p) => { if (!list.some((x) => x[0] === p)) list.push([p, -1]); });
  return list;
}
function peopleQueue() {
  if (!W.arena || !R3.peopleOn) return;
  const want = wantedPeople();
  let made = 0, budget = M.phase === 'intro' || M.phase === 'tip' ? 3 : 2;
  // the players on the floor first
  want.sort((a, b) => (b[0].court ? 1 : 0) - (a[0].court ? 1 : 0));
  for (const [p, s] of want) {
    if (PV.has(p.info.id)) continue;
    if (made >= budget) break;
    makeVis(p, s); made++;
  }
  if (!W.refs) { W.refs = [makeRef(0), makeRef(1)]; }
  if (PV.size > 30) {
    const keep = new Set(want.map((x) => x[0].info.id));
    for (const [id, V] of PV) { if (!keep.has(id)) { W.arena.remove(V.H.group); V.H.dispose(); PV.delete(id); if (PV.size <= 24) break; } }
  }
}
const _lk = new THREE.Vector3();
function onAct(V, p, prev) {
  const H = V.H, a = p.act;
  if (prev === 'celebrate' || prev === 'slump' || prev === 'stumble') { try { H.stop(); } catch (e) { /* none */ } }
  if (a === 'celebrate') H.play(rnd() < 0.5 ? 'fistPump' : rnd() < 0.5 ? 'celebrate' : 'cheer', { speed: 1.2, intensity: 0.9 });
  else if (a === 'slump') H.play(rnd() < 0.5 ? 'slump' : 'handsOnHead', { speed: 0.9, intensity: 0.8 });
  else if (a === 'stumble') H.play(p.stumT > 0.9 ? 'fall' : 'stumble', { speed: 1.3 });
  else if (a === 'steal') H.play('reach', { target: _v.set(B.x, max(0.5, B.y), B.z), speed: 2.2 });
}
// Arm targets: shoulder pitch, shoulder roll (+ toward the body), elbow, wrist. side 1 = the figure's left (+x).
function arm(A, sx, sz, ex, wx) { A.sx = sx; A.sz = sz; A.ex = ex; A.wx = wx; }
const TL = { sx: 0, sz: 0, ex: 0, wx: 0 }, TR = { sx: 0, sz: 0, ex: 0, wx: 0 };
function posePlayer(V, p, dt, far) {
  const H = V.H, Bn = H.bones;
  if (p.act !== V.lastAct) { onAct(V, p, V.lastAct); V.lastAct = p.act; }
  if (V.sit) { H.stop('sit'); V.sit = false; }
  const holder = replaying() ? !!p.repBall : B.holder === p;
  const spd = hypot(p.vx, p.vz);
  // eyes on the ball, the shooter on the rim, a defender on his man
  if (M.phase === 'intro' && M.kind === 'game') _lk.set(R3.camera.position.x, 1.6, R3.camera.position.z);
  else if (p.act === 'shoot' || p.act === 'ft' || p.act === 'layup' || p.act === 'dunk') _lk.set(0, CT.RIM_Y, M.kind === 'dunk' || M.kind === 'c3' ? CT.HOOP : hoopZ(p.side));
  else _lk.set(B.x, max(0.8, B.y), B.z);
  H.group.position.set(p.x, p.y, p.z);
  H.group.rotation.y = p.yaw;
  H.update(dt, { speed: p.act === 'spin' ? 0 : spd, look: _lk });
  if (far) return;
  const a = p.act, t = p.actT;
  let crouch = 0, wA = 0, legDrive = 0, lean = 0, wide = 0;
  const hand = p.hand > 0 ? 1 : -1; // 1: the figure's left hand dribbles
  const live = M.phase === 'live' || M.kind !== 'game';
  if (a === 'shoot' || a === 'ft') {
    const ad = p.ad || {};
    const rel = !!ad.rel;
    const m = a === 'ft' ? (ad.charging ? clamp(ad.m || 0, 0, 1.1) : 0.2) : clamp(t / RISE, 0, 1.15);
    let ra = clamp(0.25 + m * 0.85, 0, 1), fo = rel ? clamp((t - (ad.relT || t)) / 0.15 + 0.4, 0, 1) : 0;
    if (rel && ad.relT == null) ad.relT = t;
    crouch = a === 'shoot' && t < 0.17 ? 0.5 : (rel ? 0.1 : 0.15 * (1 - m));
    if (a === 'ft' && !ad.charging) { crouch = 0.25; ra = 0.15; }
    const sx = lerp(-0.55, -2.2, ra) - fo * 0.55, ex = lerp(-1.65, -1.45, ra) * (1 - fo) - fo * 0.12;
    arm(TL, sx, 0.3 - fo * 0.12, ex, -0.25 * ra + fo * 0.9); arm(TR, sx, 0.3 - fo * 0.12, ex, -0.25 * ra + fo * 0.9);
    wA = 1;
  } else if (a === 'layup' || a === 'dunk' || a === 'hang' || a === 'tip') {
    const k = a === 'hang' ? 1 : clamp(t / 0.4, 0, 1);
    const tr = p.ad && p.ad.trick;
    if (a === 'layup') { arm(TR, lerp(-1.0, -2.85, k), -0.1, lerp(-1.2, -0.15, k), 0.3); arm(TL, -0.9 * k, -0.25, -0.6, 0); legDrive = k; }
    else if (a === 'tip') { arm(TR, -2.95, -0.1, -0.1, 0.2); arm(TL, -0.6, -0.2, -0.4, 0); }
    else if (tr === 'windmill' && a === 'dunk') { const ph = p.ad.k || 0; arm(TR, -0.5 - ph * 2.6 - sin(ph * PI) * 1.2, -0.25, -0.15, 0.2); arm(TL, -1.4, -0.4, -0.5, 0); legDrive = 0.6; }
    else if (tr === 'legs' && a === 'dunk') { const ph = p.ad.k || 0; const down = sin(clamp(ph * 1.6, 0, 1) * PI); arm(TR, lerp(-2.7, -0.2, down), 0.4 * down, -0.3, 0); arm(TL, lerp(-2.7, -0.2, down), 0.4 * down, -0.3, 0); legDrive = 0.4; wide = down; }
    else { arm(TR, lerp(-1.6, -2.9, k), -0.08, lerp(-1.2, -0.15, k), 0.25); arm(TL, lerp(-1.6, -2.9, k), -0.08, lerp(-1.2, -0.15, k), 0.25); legDrive = a === 'hang' ? 0.2 : 0.55; }
    wA = 1;
  } else if (a === 'block' || a === 'rebound') {
    const k = clamp(t / 0.2, 0, 1);
    arm(TL, lerp(-1.2, -2.95, k), -0.15, -0.12, 0.1); arm(TR, lerp(-1.2, -2.95, k), -0.15, -0.12, 0.1); wA = 1; crouch = t < 0.08 ? 0.35 : 0;
  } else if (a === 'pass' || a === 'inbound') {
    const type = p.ad && p.ad.type, k = a === 'pass' ? clamp(t / 0.14, 0, 1) : 0;
    if (type === 'lob') { arm(TL, lerp(-1.8, -2.6, k), 0.3, lerp(-1.5, -0.3, k), 0.6 * k); arm(TR, lerp(-1.8, -2.6, k), 0.3, lerp(-1.5, -0.3, k), 0.6 * k); }
    else if (type === 'bounce') { arm(TL, lerp(-0.9, -0.7, k), 0.3, lerp(-1.5, -0.1, k), 0.5 * k); arm(TR, lerp(-0.9, -0.7, k), 0.3, lerp(-1.5, -0.1, k), 0.5 * k); }
    else { arm(TL, lerp(-0.9, -1.45, k), 0.3, lerp(-1.5, -0.1, k), 0.5 * k); arm(TR, lerp(-0.9, -1.45, k), 0.3, lerp(-1.5, -0.1, k), 0.5 * k); }
    wA = 1;
  } else if (a === 'catch') { arm(TL, -1.15, 0.2, -0.5, 0); arm(TR, -1.15, 0.2, -0.5, 0); wA = 1; }
  else if (a === 'screen') { arm(TL, -0.35, 0.55, -2.0, 0); arm(TR, -0.35, 0.55, -2.0, 0); wA = 1; crouch = 0.25; wide = 0.6; }
  else if (a === 'steal') { wA = 0; crouch = 0.3; lean = 0.35; }
  else if (a === 'celebrate' || a === 'slump' || a === 'stumble') { wA = 0; }
  else if (holder) {
    if (p.picked || !live || M.phase === 'ft' || a === 'spin' || M.kind === 'dunk' || M.kind === 'c3') { arm(TL, -0.9, 0.28, -1.5, -0.2); arm(TR, -0.9, 0.28, -1.5, -0.2); wA = 1; crouch = a === 'spin' ? 0.35 : 0.12; }
    else {
      // the dribble: the hand on top of the ball as it comes up, pushing it back down
      const ph = p.dribT % 1, bounce = abs(sin(ph * PI));
      const D = hand > 0 ? TL : TR, O = hand > 0 ? TR : TL;
      arm(D, -0.25 - 0.4 * bounce, -0.12, -0.45 - 0.55 * bounce, 0.55 - 0.9 * bounce);
      arm(O, -0.55, -0.4, -1.15, 0);
      if (a === 'cross') { const k = clamp(t / 0.3, 0, 1); lean = -hand * sin(k * PI) * 0.25; }
      wA = 1; crouch = 0.22 + min(0.15, spd * 0.03);
    }
  } else if (live && M.poss >= 0 && M.poss !== p.side && B.holder && (p.def > 0.5 || hypot(B.holder.x - p.x, B.holder.z - p.z) < 1.7) && M.kind === 'game') {
    // the defensive stance: low, arms wide, palms up to the ball
    arm(TL, -0.55, -1.0, -0.5, 0); arm(TR, -0.55, -1.0, -0.5, 0); wA = 0.9; crouch = 0.45;
  } else if (M.phase === 'live' && B.state !== 'held' && hypot(B.x - p.x, B.z - p.z) < 3 && B.y > 1.5) {
    arm(TL, -1.7, -0.1, -0.5, 0); arm(TR, -1.7, -0.1, -0.5, 0); wA = 0.6; crouch = 0.25;
  }
  const k = 1 - Math.exp(-dt * 16);
  V.wA = lerp(V.wA || 0, wA, 1 - Math.exp(-dt * 14));
  for (const [A, T] of [[V.L, TL], [V.R, TR]]) { A.sx = lerp(A.sx, T.sx, k); A.sz = lerp(A.sz, T.sz, k); A.ex = lerp(A.ex, T.ex, k); A.wx = lerp(A.wx, T.wx, k); }
  V.c = lerp(V.c, crouch, k); V.lean = lerp(V.lean, lean, k); V.wide = lerp(V.wide || 0, wide, k); V.leg = lerp(V.leg || 0, legDrive, 1 - Math.exp(-dt * 20));
  const c = V.c, w = V.wA, air = p.y > 0.05 ? 1 : 0;
  Bn.pelvis.position.y -= c * 0.17;
  Bn.hipL.rotation.x += -c * 0.85 - V.leg * 1.25 - air * 0.15; Bn.hipR.rotation.x += -c * 0.85 - air * 0.15;
  Bn.kneeL.rotation.x += c * 1.5 + V.leg * 1.7 + air * 0.35; Bn.kneeR.rotation.x += c * 1.5 + air * 0.35;
  Bn.ankleL.rotation.x += -c * 0.6 + air * 0.4; Bn.ankleR.rotation.x += -c * 0.6 + air * 0.4;
  Bn.hipL.rotation.z += V.wide * 0.22; Bn.hipR.rotation.z -= V.wide * 0.22;
  Bn.spine.rotation.x += c * 0.25 + V.lean * 0; Bn.spine.rotation.z += V.lean;
  if (a === 'steal') { Bn.spine.rotation.x += 0.35; }
  if (w > 0.01) {
    const L = V.L, R = V.R;
    Bn.shoulderL.rotation.x = lerp(Bn.shoulderL.rotation.x, L.sx, w); Bn.shoulderL.rotation.z = lerp(Bn.shoulderL.rotation.z, -L.sz, w); Bn.shoulderL.rotation.y = lerp(Bn.shoulderL.rotation.y, 0, w);
    Bn.elbowL.rotation.x = lerp(Bn.elbowL.rotation.x, L.ex, w); Bn.wristL.rotation.x = lerp(Bn.wristL.rotation.x, L.wx, w);
    Bn.shoulderR.rotation.x = lerp(Bn.shoulderR.rotation.x, R.sx, w); Bn.shoulderR.rotation.z = lerp(Bn.shoulderR.rotation.z, R.sz, w); Bn.shoulderR.rotation.y = lerp(Bn.shoulderR.rotation.y, 0, w);
    Bn.elbowR.rotation.x = lerp(Bn.elbowR.rotation.x, R.ex, w); Bn.wristR.rotation.x = lerp(Bn.wristR.rotation.x, R.wx, w);
  }
}
// The bench: substitutes sit, stand for a big play, and the starters who come off take a seat.
function poseBench(V, p, i, dt) {
  const H = V.H;
  const seat = W.benchSeats(p.side < 0 ? 1 : p.side, i);
  if (!V.sit) { H.play('sit', { hold: true }); V.sit = true; }
  H.group.position.set(seat.x, 0, seat.z); H.group.rotation.y = PI / 2;
  _lk.set(B.x, 1.5, B.z);
  V.acc += dt;
  if (V.acc > (R3.q === 0 ? 0.3 : 0.05) || R3.q >= 2) { H.update(V.acc, { speed: 0, look: _lk }); V.acc = 0; }
}
function poseRefs(dt) {
  if (!W.refs) return;
  for (let i = 0; i < 2; i++) {
    const R = W.refs[i], r = M.refs[i]; if (!r) continue;
    const vis = M.kind === 'game' && M.phase !== 'intro';
    R.H.group.visible = vis; if (!vis) continue;
    R.H.group.position.set(r.x, 0, r.z); R.H.group.rotation.y = r.yaw;
    _lk.set(B.x, max(1, B.y), B.z);
    R.H.update(dt, { speed: hypot(r.vx, r.vz), look: _lk });
  }
}
function refSignal(kind) {
  if (!W.refs) return;
  let best = W.refs[0], bd = 1e9;
  for (let i = 0; i < 2; i++) { const r = M.refs[i]; if (!r) continue; const d = hypot(r.x - B.x, r.z - B.z); if (d < bd) { bd = d; best = W.refs[i]; } }
  best.H.play(kind === 'foul' ? 'point' : 'wave', { speed: 1.2, target: _v.set(B.x, 1.5, B.z) });
}
// every person on screen this frame: the floor, the bench, the refs; anyone not in this game hides
const _seen = new Set();
function updatePeople(dt) {
  _seen.clear();
  const near = R3.camera.position;
  for (let s = 0; s < 2; s++) {
    let bi = 0;
    for (const p of M.side[s] || []) {
      const V = PV.get(p.info.id); if (!V) continue;
      _seen.add(V);
      if (V.kit !== s) { V.H.setOutfit(kitFor(p, s)); V.kit = s; }
      V.H.group.visible = true;
      if (p.court || M.kind === 'roof') {
        const far = R3.q === 0 && hypot(p.x - near.x, p.z - near.z) > 22;
        posePlayer(V, p, dt, far);
      } else if (M.kind === 'game') poseBench(V, p, bi++, dt);
      else { _seen.delete(V); V.H.group.visible = false; }
    }
  }
  if (M.kind === 'dunk' && M.dk) {
    M.dk.list.forEach((p, i) => {
      const V = PV.get(p.info.id); if (!V || _seen.has(V)) return;
      _seen.add(V); V.H.group.visible = true;
      if (V.kit !== -1) { V.H.setOutfit(kitFor(p, -1)); V.kit = -1; }
      if (p === M.dk.list[M.dk.turn]) posePlayer(V, p, dt, false);
      else { if (V.sit) { V.H.stop('sit'); V.sit = false; } V.H.group.position.set(-CT.HW + 0.6, 0, CT.HL - 3 - i * 1.3); V.H.group.rotation.y = PI * 0.8; _lk.set(B.x, 2, B.z); V.H.update(dt, { speed: 0, look: _lk }); }
    });
  }
  for (const V of PV.values()) if (!_seen.has(V)) V.H.group.visible = false;
  poseRefs(dt);
}

/* ====================================================================== ball, racks, boards */
function buildBall() {
  W.ballMat = std({ map: ballTex(false), roughness: 0.62, metalness: 0, emissive: 0xffb736, emissiveIntensity: 0 });
  W.ball = new THREE.Mesh(new THREE.SphereGeometry(CT.BR, 28, 18), W.ballMat); W.ball.castShadow = true; W.arena.add(W.ball);
  W.ballQ = new THREE.Quaternion(); W.bPrev = new THREE.Vector3(); W.bOff = new THREE.Vector3(); W.bVis = new THREE.Vector3(); W.wasHeld = false;
  // the user's man: a ring of light under his feet
  const rg = new THREE.RingGeometry(0.42, 0.52, 40); rg.rotateX(-PI / 2);
  W.ring = new THREE.Mesh(rg, new THREE.MeshBasicMaterial({ color: 0xffb736, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false }));
  W.ring.renderOrder = 3; W.arena.add(W.ring);
  // three-point contest racks: five balls each
  W.rackBalls = new THREE.InstancedMesh(new THREE.SphereGeometry(CT.BR, 16, 10), W.ballMat, 25); W.rackBalls.visible = false; W.rackBalls.castShadow = true; W.arena.add(W.rackBalls);
  const rackM = std({ color: 0x2b2d32, roughness: 0.4, metalness: 0.8 });
  W.racks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.06, 0.35), rackM, 5); W.racks.visible = false; W.arena.add(W.racks);
  const o = new THREE.Object3D();
  for (let i = 0; i < 5; i++) { const r = rackPos(i); const ax = r.x, az = r.z - CT.HOOP, al = hypot(ax, az) || 1; o.position.set(r.x + ax / al * 0.85, 0.75, r.z + az / al * 0.85); o.rotation.y = Math.atan2(ax, az) + PI / 2; o.updateMatrix(); W.racks.setMatrixAt(i, o.matrix); }
}
const _m4 = new THREE.Matrix4(), _o = new THREE.Object3D();
function updateRacks() {
  const on = M.kind === 'c3' && M.c3 && R3.venue === 'arena';
  W.rackBalls.visible = W.racks.visible = on; if (!on) return;
  let k = 0;
  for (let i = 0; i < 5; i++) {
    const r = rackPos(i); const ax = r.x, az = r.z - CT.HOOP, al = hypot(ax, az) || 1;
    for (let j = 0; j < 5; j++) {
      const show = j < M.c3.left[i];
      _o.position.set(r.x + ax / al * 0.85 + (-az / al) * (j - 2) * 0.17, show ? 0.78 + CT.BR : -5, r.z + az / al * 0.85 + (ax / al) * (j - 2) * 0.17);
      _o.scale.setScalar(j === 4 ? 1.02 : 1); _o.updateMatrix(); W.rackBalls.setMatrixAt(k++, _o.matrix);
    }
  }
  W.rackBalls.instanceMatrix.needsUpdate = true;
}
function bonePos(b, out) { b.getWorldPosition(out); return out; }
function placeBall(dt) {
  const bm = W.ball;
  const h = replaying() ? null : B.holder;
  let target = _v2;
  if (h && PV.has(h.info.id) && h.court) {
    const V = PV.get(h.info.id), Bn = V.H.bones, a = h.act;
    V.H.group.updateMatrixWorld(true);
    if (a === 'layup' || a === 'dunk' || a === 'hang' || a === 'tip' || a === 'rebound') {
      bonePos(Bn.fingersR, target); target.y += 0.06;
      if (h.ad && h.ad.trick && a === 'dunk') { bonePos(Bn.fingersR, target); }
    } else if (a === 'shoot' || a === 'ft' || h.picked || a === 'catch' || a === 'pass' || a === 'inbound' || (M.phase !== 'live' && M.kind === 'game') || M.kind === 'dunk' || (M.kind === 'c3' && a === '') || a === 'spin') {
      bonePos(Bn.fingersL, target); bonePos(Bn.fingersR, _v3); target.add(_v3).multiplyScalar(0.5);
      _v3.set(sin(h.yaw), 0, cos(h.yaw)); target.addScaledVector(_v3, 0.1); target.y += a === 'shoot' || a === 'ft' ? 0.08 : 0.02;
    } else target.set(B.x, B.y, B.z);
    W.wasHeld = true;
    bm.position.copy(target);
  } else {
    target.set(B.x, B.y, B.z);
    if (W.wasHeld) { W.bOff.copy(bm.position).sub(target); W.wasHeld = false; if (W.bOff.length() > 1.2) W.bOff.set(0, 0, 0); }
    W.bOff.multiplyScalar(Math.exp(-dt * 14));
    bm.position.copy(target).add(W.bOff);
  }
  // spin: rolling along its travel
  _v.copy(bm.position).sub(W.bPrev); const d = _v.length();
  if (d > 1e-4 && d < 2) { _ax.set(_v.z, 0, -_v.x).normalize(); if (_ax.lengthSq() > 0.5) { _q.setFromAxisAngle(_ax, d / CT.BR * (B.state === 'held' ? 0.4 : 1)); W.ballQ.premultiply(_q); } }
  W.bPrev.copy(bm.position);
  bm.quaternion.copy(W.ballQ);
  const show = M.kind !== 'roof' && !(M.phase === 'intro');
  bm.visible = show;
  // the ring under the user's man
  const c = M.ctrl;
  W.ring.visible = !!c && arc.state === 'play' && M.user >= 0 && !replaying() && M.phase !== 'intro' && M.phase !== 'timeout' && R3.venue === 'arena';
  if (W.ring.visible) { W.ring.position.set(c.x, 0.015, c.z); W.ring.material.opacity = 0.6 + (arc.reducedMotion ? 0 : sin(R3.time * 5) * 0.2); W.ring.material.color.set(M.poss === c.side ? 0xffb736 : 0x7fd1ff); }
}
const fmt = (t) => { t = max(0, t); if (t < 60) return t.toFixed(1); const m = (t / 60) | 0, s = (t | 0) % 60; return m + ':' + (s < 10 ? '0' : '') + s; };
function updateBoards() {
  // the shot clocks over each board
  const sc = M.kind === 'game' ? String(Math.ceil(max(0, M.shot))) : M.kind === 'c3' && M.c3 ? String(Math.ceil(M.c3.t)) : '';
  for (const H of W.hoops) {
    if (H.sc.last !== sc) {
      H.sc.last = sc;
      const g = H.sc.canvas.getContext('2d'); g.fillStyle = '#0a0606'; g.fillRect(0, 0, 128, 64);
      g.font = '700 46px JetBrains Mono, monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = M.kind === 'game' && M.shot <= 5 ? '#ff3b2a' : '#ffb736'; g.fillText(sc, 64, 34);
      H.sc.tex.needsUpdate = true;
    }
    // the red light around the glass at the horn
    H.frameM.emissiveIntensity = lerp(H.frameM.emissiveIntensity, (M.phase === 'qend' || M.phase === 'final') && M.kind === 'game' ? 1.6 : 0, 0.2);
  }
  // the scoreboard over centre court
  const J = W.jumbo; if (!J) return;
  let key;
  if (replaying()) key = 'R' + (M.replay.why || '');
  else if (M.kind === 'game') key = M.teams.join() + M.score.join() + M.q + (M.clock | 0) + M.phase.slice(0, 2);
  else if (M.kind === 'c3' && M.c3) key = 'c3' + M.c3.pts + (M.c3.t | 0);
  else if (M.kind === 'dunk' && M.dk) key = 'dk' + M.dk.turn + M.dk.round + (M.dk.cards ? M.dk.cards.join() : '');
  else key = M.kind;
  if (J.last === key) return; J.last = key;
  const g = J.canvas.getContext('2d'), w = 512, h = 256;
  g.fillStyle = '#06070b'; g.fillRect(0, 0, w, h);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  if (replaying()) { g.fillStyle = '#ff6940'; g.font = '800 64px ' + F_UI; g.fillText('REPLAY', w / 2, h * 0.42); g.fillStyle = '#ffb736'; g.font = 'italic 600 34px ' + F_DISP; g.fillText(M.replay.why || '', w / 2, h * 0.72); }
  else if (M.kind === 'game' && M.teams) {
    const T0 = TEAMS[M.teams[0]], T1 = TEAMS[M.teams[1]];
    g.fillStyle = T0.c1; g.fillRect(0, 0, w / 2, 70); g.fillStyle = T1.c1; g.fillRect(w / 2, 0, w / 2, 70);
    g.font = '800 40px ' + F_UI; g.fillStyle = T0.c2; g.fillText(T0.name.toUpperCase(), w / 4, 38); g.fillStyle = T1.c2; g.fillText(T1.name.toUpperCase(), w * 0.75, 38);
    g.font = '700 110px JetBrains Mono, monospace'; g.fillStyle = '#fbf5ec'; g.fillText(String(M.score[0]), w / 4, 160); g.fillText(String(M.score[1]), w * 0.75, 160);
    g.font = '700 34px JetBrains Mono, monospace'; g.fillStyle = '#ffb736'; g.fillText((M.q <= 4 ? 'Q' + M.q : 'OT') + ' ' + fmt(M.clock), w / 2, 232);
  } else if (M.kind === 'c3' && M.c3) {
    g.fillStyle = '#ffb736'; g.font = '800 40px ' + F_UI; g.fillText('THREE-POINT CONTEST', w / 2, 50);
    g.fillStyle = '#fbf5ec'; g.font = '700 110px JetBrains Mono, monospace'; g.fillText(String(M.c3.pts), w / 2, 150); g.font = '700 34px JetBrains Mono, monospace'; g.fillText(fmt(M.c3.t), w / 2, 225);
  } else if (M.kind === 'dunk' && M.dk) {
    g.fillStyle = '#ffb736'; g.font = '800 46px ' + F_UI; g.fillText('DUNK CONTEST', w / 2, 52);
    g.fillStyle = '#fbf5ec'; g.font = 'italic 600 40px ' + F_DISP; g.fillText(M.dk.list[M.dk.turn].info.name, w / 2, 130);
    if (M.dk.cards) { g.font = '700 54px JetBrains Mono, monospace'; g.fillText(M.dk.cards.join(' '), w / 2, 205); }
  } else { g.fillStyle = '#ffb736'; g.font = '800 44px ' + F_UI; g.fillText(LEAGUE.toUpperCase(), w / 2, h / 2); }
  J.tex.needsUpdate = true;
}

/* ====================================================================== the director */
// Where the camera is, by what is happening: the TV angle, a baseline angle in portrait, close-ups,
// replays. Everything eases; nothing cuts except a replay, which says so with bars and a bug.
const CAM = { pos: new THREE.Vector3(18, 8, 0), look: new THREE.Vector3(0, 1, 0), fov: 40, fx: -1, fz: 0, snap: true, orbit: 0, mode: 'auto' };
const CAMS = ['auto', 'broadcast', 'baseline', 'player'];
function camMode() { const m = R3.cam; if (m !== 'auto') return m; return arc.h > arc.w * 1.05 ? 'baseline' : 'broadcast'; }
function director(dt) {
  const cam = R3.camera, rm = arc.reducedMotion, portrait = arc.h > arc.w * 1.05, asp = arc.w / arc.h;
  let px, py, pz, lx, ly, lz, fov, k = 3.2;
  const bx = B.x, bz = B.z;
  const mode = camMode();
  const userDir = M.user >= 0 ? M.dir[M.user] : (M.poss >= 0 ? M.dir[M.poss] : 1);
  const vfovFor = (hfov) => clamp(2 * Math.atan(Math.tan(hfov * PI / 360) / asp) * 180 / PI, 30, 72);
  if (arc.state === 'menu' || (M.user < 0 && M.kind === 'game')) {
    // the menu: a slow drifting look across the floor at the game underneath
    CAM.orbit += dt * (rm ? 0.02 : 0.05);
    const a = CAM.orbit;
    px = sin(a) * 14; pz = cos(a) * 12; py = 6.5 + sin(a * 0.7) * 1.2; lx = bx * 0.4; ly = 1.4; lz = bz * 0.5; fov = portrait ? 62 : 40; k = 1.6;
  } else if (replaying()) {
    // low at the basket the play finished at, the ball held in frame, a slow dolly in
    const R = M.replay, s = R.hz > 0 ? 1 : -1, u = clamp(R.t / 2.4, 0, 1);
    if (R.side == null) R.side = rnd() < 0.5 ? -1 : 1;
    px = R.side * (portrait ? 3.4 : 4.6) + R.side * sin(u * 1.2) * 0.8; py = 1.2 + u * 0.5; pz = R.hz - s * ((portrait ? 6.8 : 5.6) - u * 1.4);
    lx = lerp(B.x, 0, 0.35); ly = lerp(max(1.2, B.y), CT.RIM_Y, 0.4); lz = lerp(B.z, R.hz, 0.45); fov = portrait ? 60 : 38; k = 3.5;
  } else if (M.kind === 'game' && M.phase === 'intro' && M.intro && M.intro.i >= 0) {
    const p = M.intro.list[M.intro.i];
    const close = M.intro.i < 5;
    px = p.x - (close ? (portrait ? 7.2 : 6.0) : 9); py = close ? 1.5 : 4; pz = p.z + (close ? (p.side === 0 ? 1.4 : -1.4) : 0); lx = p.x; ly = close ? (portrait ? 1.15 : 1.3) : 1.2; lz = p.z; fov = portrait ? (close ? 44 : 70) : (close ? 26 : 44); k = 2.4;
    if (close) { const push = clamp(M.intro.t / 1.5, 0, 1); px += ease(push) * 0.9; }
  } else if (M.kind === 'game' && (M.phase === 'intro' || M.phase === 'tip')) {
    px = portrait ? 0 : 12; py = portrait ? 7 : 5; pz = portrait ? -9 : 0; lx = 0; ly = 2.2; lz = 0; fov = portrait ? 60 : 38;
  } else if (M.kind === 'game' && M.phase === 'timeout') {
    const tz = (M.toSide === 0 ? -1 : 1) * 3.4;
    px = -CT.HW + 3.2; py = 2.4; pz = tz + 3.6; lx = -CT.HW - 1; ly = 1.2; lz = tz; fov = portrait ? 60 : 40;
  } else if (M.kind === 'game' && M.phase === 'final') {
    CAM.orbit += dt * 0.1;
    const a = CAM.orbit; px = sin(a) * 8; pz = cos(a) * 8; py = 3.2; lx = 0; ly = 1.6; lz = 0; fov = portrait ? 62 : 40; k = 1.5;
  } else if ((M.kind === 'game' && M.phase === 'ft' && M.ft) || (M.kind === 'game' && M.phase === 'dead' && M.next && M.next.type === 'ft' && M.phaseT > 0.8)) {
    const sh = M.ft ? M.ft.by : M.next.shooter, d = M.dir[sh.side];
    px = sh.x * 0.4 + (portrait ? 0 : 1.4); py = portrait ? 3.6 : 3.2; pz = d * CT.FT - d * (portrait ? 6.5 : 5.4); lx = 0; ly = 2.7; lz = d * CT.HOOP; fov = portrait ? 56 : 36;
  } else if (M.kind === 'c3' && M.c3) {
    const p = M.c3.me, hz = CT.HOOP, ax = p.x, az = p.z - hz, al = hypot(ax, az) || 1;
    px = p.x + ax / al * (portrait ? 5.6 : 4.5) + (-az / al) * 1.0; py = portrait ? 3.4 : 2.8; pz = p.z + az / al * (portrait ? 5.6 : 4.5) + (ax / al) * 1.0;
    lx = lerp(p.x, 0, 0.6); ly = 2.3; lz = lerp(p.z, hz, 0.6); fov = portrait ? 58 : 38; k = 2.4;
  } else if (M.kind === 'dunk' && M.dk) {
    const p = M.dk.list[M.dk.turn], hz = CT.HOOP;
    const air = M.dk.phase === 'air' || M.dk.phase === 'land' || M.dk.phase === 'judge';
    const sx = p.x > 0 ? -1 : 1;
    if (air) { px = (portrait ? 1.1 : 1.6) * sx; py = 1.75; pz = hz - (portrait ? 6.4 : 5.2); lx = 0; ly = portrait ? 2.55 : 2.75; lz = hz - 0.5; fov = portrait ? 58 : 40; k = 3.2; }
    else {
      // behind the dunker on the run-in, so up on the stick runs at the rim
      const ax = p.x, az = p.z - hz, al = hypot(ax, az) || 1;
      px = p.x + ax / al * (portrait ? 6 : 5) + 0.8; py = portrait ? 3.4 : 2.8; pz = p.z + az / al * (portrait ? 6 : 5); lx = lerp(p.x, 0, 0.7); ly = 2.2; lz = lerp(p.z, hz, 0.7); fov = portrait ? 60 : 40;
    }
    if (M.dk.phase === 'judge') { px = 0; py = 4.5; pz = hz - 9; lx = 0; ly = 2; lz = hz - 1; }
  } else if (mode === 'player' && M.ctrl) {
    const p = M.ctrl, hz = M.poss === p.side ? hoopZ(p.side) : -hoopZ(p.side) * -1;
    const ax = p.x - 0, az = p.z - hz, al = hypot(ax, az) || 1;
    px = p.x + ax / al * 6; py = 3.4; pz = p.z + az / al * 6; lx = lerp(p.x, 0, 0.35); ly = 1.4; lz = lerp(p.z, hz, 0.35); fov = portrait ? 64 : 46;
  } else if (mode === 'baseline') {
    // portrait: the user's attacking hoop at the top of the screen
    const d = userDir;
    // below the centre-hung scoreboard, looking up the floor toward the basket being attacked
    pz = clamp(bz - d * 11, -CT.HL - 7, CT.HL + 7); py = 8.6; px = bx * 0.35;
    const front = clamp((bz * d) / 8, 0, 1);
    lx = bx * 0.55; ly = 0.8; lz = lerp(bz + d * 3.2, d * (CT.HOOP - 2.5), front * 0.6); fov = portrait ? 64 : 48;
    // play at the camera's own end: rise a little and step aside; that basket's stanchion also fades (hoopsUpdate)
    const near = clamp((-bz * d - 4) / 6, 0, 1);
    py += near * 3; px += near * (bx > 0 ? -1.6 : 1.6); pz += d * near * 2.5; lz -= d * near * 2;
  } else {
    // the TV angle from across the floor from the benches
    px = CT.HW + 9.2; py = 9.6; pz = clamp(bz * 0.8, -9.5, 9.5); lx = bx * 0.25 - 1.2; ly = 0.6; lz = clamp(bz * 0.92, -11, 11);
    fov = vfovFor(portrait ? 70 : 64);
  }
  const kk = CAM.snap ? 1 : 1 - Math.exp(-dt * (rm ? min(k, 2.2) : k)); CAM.snap = false;
  CAM.pos.x = lerp(CAM.pos.x, px, kk); CAM.pos.y = lerp(CAM.pos.y, py, kk); CAM.pos.z = lerp(CAM.pos.z, pz, kk);
  CAM.look.x = lerp(CAM.look.x, lx, kk); CAM.look.y = lerp(CAM.look.y, ly, kk); CAM.look.z = lerp(CAM.look.z, lz, kk);
  CAM.fov = lerp(CAM.fov, fov, kk);
  cam.position.copy(CAM.pos);
  cam.position.x += (arc.shakeX || 0) * 0.008; cam.position.y += (arc.shakeY || 0) * 0.008;
  cam.lookAt(CAM.look);
  if (abs(cam.fov - CAM.fov) > 0.01 || abs(cam.aspect - asp) > 0.0001) { cam.fov = CAM.fov; cam.aspect = asp; cam.updateProjectionMatrix(); }
  // the stick follows the screen, smoothed so a camera move never yanks the player
  const fx = CAM.look.x - CAM.pos.x, fz = CAM.look.z - CAM.pos.z, fl = hypot(fx, fz) || 1;
  const s2 = 1 - Math.exp(-dt * 3);
  CAM.fx = lerp(CAM.fx, fx / fl, s2); CAM.fz = lerp(CAM.fz, fz / fl, s2);
  const n = hypot(CAM.fx, CAM.fz) || 1; CAM.fx /= n; CAM.fz /= n;
}
function stick(ax, ay) {
  const fx = CAM.fx, fz = CAM.fz;
  return { x: -fz * ax - fx * ay, z: fx * ax - fz * ay };
}

/* ====================================================================== effects */
const _e = new THREE.Vector3(), _n = new THREE.Vector3(0, 1, 0);
let trailH = null, sndT = 0;
function crowdReact(kind, k) { if (W.crowds) for (const C of W.crowds) C.c.react(kind); void k; }
function ev(type, a, b, c) {
  if (!R3.ok || R3.venue !== 'arena') return;
  const rm = arc.reducedMotion, sfx = arc.sfx, play = arc.state === 'play' && M.user >= 0;
  switch (type) {
    case 'score': {
      const p = a, sh = b; const hz = sh.hz;
      const H = W.hoops[hz > 0 ? 1 : 0]; if (H) H.swish = 0;
      if (VFX) {
        _e.set(0, CT.RIM_Y, hz);
        if (sh.kind === 'dunk') {
          VFX.impact(_e, _n, { kind: 'spark', color: '#ffc070', size: 0.9 }); VFX.ring(_e, '#fff1d6', { size: 1.6, normal: _n, kind: 'shock' });
          if (M.kind === 'dunk') { VFX.burst(_e, { color: '#ffb736', size: 1.0 }); _e.set(0, 1.5, hz - 1.5); VFX.confetti(_e, { count: 120 }); _e.set(0, CT.RIM_Y, hz); }
          if (!rm) { VFX.timeWarp(0.42, 0.55); VFX.shake(0.45); }
          if (POST) { POST.flash(0.22, '#fff1d6'); POST.kick(-5); }
          if (H) H.wob = 1;
        } else if (sh.pts === 3 || sh.money) { VFX.burst(_e, { color: '#ffb736', size: 0.7 }); VFX.ring(_e, '#ffd27a', { size: 1.1, normal: _n, kind: 'shock' }); }
        else VFX.ring(_e, '#fff1d6', { size: 0.7, normal: _n, kind: 'ripple' });
        if (M.kind === 'game' && M.clock <= 0.05) { _e.set(-5, 8, hz * 0.6); VFX.fireworks(_e, { burst: 'peony', size: 1, color: '#ffb736', color2: '#ff6940' }); _e.set(5, 9, hz * 0.6); VFX.fireworks(_e, { burst: 'crackle', size: 0.9, delay: 0.25 }); _e.set(0, 2, hz * 0.8); VFX.goalBurst(_e, { color: TEAMS[M.teams[p.side]].c1, color2: TEAMS[M.teams[p.side]].c2, size: 0.8 }); }
      }
      sfx.noise(0.2, { freq: 3600, filter: 'highpass', vol: 0.06 });
      if (sh.kind === 'dunk') { sfx.noise(0.25, { freq: 220, vol: 0.2 }); sfx.tone(90, 0.3, { type: 'triangle', vol: 0.2, slide: 50 }); if (play) arc.haptic('heavy', 1); arc.shake = Math.max(arc.shake, 8); }
      else if (play && p.side === M.user) arc.haptic('success', 0.6);
      const home = p.side === 0;
      crowdReact(home || M.kind !== 'game' ? 'cheer' : 'groan');
      if (sh.kind === 'dunk' || sh.pts === 3) sfx.noise(1.2, { freq: 700, vol: 0.12 });
      break;
    }
    case 'rim': if (VFX) { _e.set(a, CT.RIM_Y, b); VFX.impact(_e, _n, { kind: 'spark', color: '#ffb070', size: 0.3 }); } sfx.tone(380, 0.06, { type: 'square', vol: 0.06 }); sfx.tone(200, 0.12, { type: 'triangle', vol: 0.05, delay: 0.02 }); { const H = W.hoops[b > 0 ? 1 : 0]; if (H) H.wob = max(H.wob, 0.6); } break;
    case 'board': if (VFX) { _e.set(a, b, (c || 1) * CT.BOARD); VFX.impact(_e, _n, { kind: 'glass', size: 0.25 }); } sfx.tone(300, 0.05, { type: 'square', vol: 0.06 }); break;
    case 'bounce': if (R3.time - sndT > 0.05) { sndT = R3.time; sfx.noise(0.05, { freq: 240, vol: clamp(b / 30, 0.02, 0.1) }); } break;
    case 'dribble': if (a === M.ctrl && R3.time - sndT > 0.12) { sndT = R3.time; sfx.noise(0.04, { freq: 200, vol: 0.05 }); } break;
    case 'shot': case 'pass': {
      if (VFX && (type === 'shot' || (b && b.type === 'lob'))) { if (trailH) trailH.stop(); trailH = VFX.trail(W.ball, { color: type === 'shot' && b.pts === 3 ? '#ffd27a' : '#ffe9c8', width: 0.13, life: 0.3, core: 0.6 }); }
      if (type === 'shot') sfx.tone(240, 0.08, { type: 'triangle', vol: 0.08 });
      break;
    }
    case 'catch': if (trailH) { trailH.stop(); trailH = null; } break;
    case 'block': if (VFX) { _e.set(B.x, B.y, B.z); VFX.impact(_e, _n, { kind: 'dust', size: 0.6 }); VFX.ring(_e, '#cfe8ff', { size: 1.0, normal: _n, kind: 'shock' }); } if (POST) POST.flash(0.12, '#dff0ff'); arc.shake = Math.max(arc.shake, 6); sfx.noise(0.12, { freq: 500, vol: 0.14 }); crowdReact('gasp'); if (play) arc.haptic('hit', 0.9); break;
    case 'steal': if (VFX) { _e.set(B.x, max(0.6, B.y), B.z); VFX.impact(_e, _n, { kind: 'spark', color: '#9fe3ff', size: 0.25 }); } crowdReact(a.side === 0 ? 'cheer' : 'groan'); if (play && a.side === M.user) arc.haptic('hit', 0.6); break;
    case 'ankles': if (VFX) { _e.set(b.x, 0.05, b.z); VFX.dust(_e, { size: 0.8 }); } crowdReact('gasp'); break;
    case 'foul': case 'whistle': case 'violation': sfx.tone(2900, 0.16, { type: 'sine', vol: 0.06 }); sfx.tone(3100, 0.12, { type: 'sine', vol: 0.05, delay: 0.17 }); refSignal(type); break;
    case 'buzzer': sfx.tone(130, 0.9, { type: 'sawtooth', vol: 0.12 }); sfx.tone(131.5, 0.9, { type: 'square', vol: 0.05 }); crowdReact('cheer'); break;
    case 'intro': {
      const p = a, i = b;
      W.spotOn = p;
      if (VFX && i < 5) {
        for (const sx of [-1, 1]) { _e.set(sx * 5.5, 0, p.side === 0 ? -CT.HL + 0.5 : CT.HL - 0.5); VFX.pyro(_e, { size: 0.8, duration: 0.7 }); }
        if (!rm && i === 4) { _e.set(0, 11, 0); VFX.fireworks(_e, { burst: 'chrysanthemum', size: 1.2, color: TEAMS[M.teams[0]].c1, color2: '#ffb736' }); }
      }
      sfx.noise(0.6, { freq: 900, vol: 0.1 }); sfx.tone(160, 0.4, { type: 'sawtooth', vol: 0.08, slide: 320 });
      crowdReact('cheer');
      break;
    }
    case 'introskip': W.spotOn = null; break;
    case 'tip': W.spotOn = null; crowdReact('cheer'); break;
    case 'perfect': if (VFX) { const p = a; _e.set(p.x, p.y + p.h * 1.25, p.z); VFX.ring(_e, '#ffd27a', { size: 0.6, kind: 'energy' }); } sfx.tone(1320, 0.12, { type: 'sine', vol: 0.06 }); break;
    case 'final': {
      const w = a;
      if (VFX && (M.kind !== 'game' || w === 0 || w === M.user)) { _e.set(0, 3, 0); VFX.winBurst(_e, { colors: M.kind === 'game' ? [TEAMS[M.teams[w]].c1, TEAMS[M.teams[w]].c2, '#ffb736'] : ['#ffb736', '#ff6940', '#fff1d6'], size: 0.9 }); }
      crowdReact(w === 0 ? 'cheer' : 'groan');
      break;
    }
    case 'takeoff': if (VFX) { _e.set(a.x, 0.02, a.z); VFX.ring(_e, '#fff1d6', { size: 0.9, kind: 'ripple' }); VFX.dust(_e, { size: 0.6 }); } crowdReact('gasp'); break;
    case 'judge': sfx.tone(660, 0.08, { type: 'square', vol: 0.05 }); crowdReact(a.reduce((x, y) => x + y, 0) > 44 ? 'cheer' : 'clap'); break;
    case 'fifty': if (VFX) { _e.set(-4, 9, CT.HOOP - 2); VFX.fireworks(_e, { burst: 'mixed', size: 1.1 }); _e.set(4, 9, CT.HOOP - 2); VFX.fireworks(_e, { burst: 'palm', size: 1.0, delay: 0.3 }); _e.set(0, 1, CT.HOOP - 1); VFX.goalBurst(_e, { size: 0.8 }); } break;
    case 'miss': crowdReact(a && a.side === 0 ? 'groan' : 'clap'); break;
    case 'replay': if (POST) { POST.letterbox(1); POST.handheld(true); } CAM.orbit = rr(0, TAU); if (trailH) { trailH.stop(); trailH = null; } break;
    case 'replayEnd': if (POST) { POST.letterbox(0); POST.handheld(false); } break;
    case 'step': if (VFX && M.ctrl) { _e.set(M.ctrl.x, 0.05, M.ctrl.z); VFX.ring(_e, '#7fd36a', { size: 1, kind: 'energy' }); } sfx.tone(880, 0.12, { type: 'sine', vol: 0.06 }); sfx.tone(1320, 0.16, { type: 'sine', vol: 0.05, delay: 0.08 }); break;
    case 'land': if (a && a.y === 0 && VFX && R3.q >= 2 && a.court) { _e.set(a.x, 0.02, a.z); VFX.dust(_e, { size: 0.25 }); } break;
    default: break;
  }
}

/* ====================================================================== the venue, lights, crowd */
let roofMod = null, roofLoading = false;
function venue(name) {
  if (!R3.ok) { R3.venue = name; return; }
  R3.venue = name;
  if (name === 'roof' && !roofMod && !roofLoading) {
    roofLoading = true;
    import('/games/court-lights/roof3d.js').then((mod) => {
      roofMod = mod;
      const late = mod.buildRoof({ R3, arc, post: POST, vfx: () => VFX });
      R3.late = R3.late.concat(late);
      applyVenue(); applyQuality();
    }).catch((e) => { try { console.warn(e); } catch (er) { /* ignore */ } roofLoading = false; });
  }
  applyVenue();
}
function applyVenue() {
  const roof = R3.venue === 'roof' && roofMod;
  if (W.arena) W.arena.visible = !roof;
  if (roofMod && roofMod.roofView.group) roofMod.roofView.group.visible = !!roof;
  if (roof) { R3.scene.fog = R3.fogRoof; R3.scene.environment = R3.q >= 1 ? roofMod.roofView.env : null; R3.scene.environmentIntensity = 0.7; R3.renderer.setClearColor(0x120d1c, 1); }
  else { R3.scene.fog = R3.fogArena; R3.scene.environment = R3.q >= 1 ? W.env || null : null; R3.scene.environmentIntensity = 0.55; R3.renderer.setClearColor(0x0c0b10, 1); }
  if (VFX) VFX.setGround(0);
}
// the house lights dip for the introductions and a follow spot picks out each starter
function lightsUpdate(dt) {
  const L = W.lights; if (!L) return;
  const intro = M.kind === 'game' && M.phase === 'intro' && arc.state === 'play';
  const dim = intro ? 0.18 : R3.night ? 0.62 : 1;
  L.dim = lerp(L.dim == null ? 1 : L.dim, dim, 1 - Math.exp(-dt * 3));
  L.key.intensity = 3.2 * L.dim; L.hemi.intensity = 0.95 * (0.3 + 0.7 * L.dim); L.fill.intensity = 0.9 * L.dim;
  const sp = W.spotOn && intro ? W.spotOn : null;
  const dunkLit = M.kind === 'dunk' && arc.state === 'play';
  L.spot.intensity = lerp(L.spot.intensity, sp ? 260 : dunkLit ? 320 : 0, 1 - Math.exp(-dt * 6));
  if (dunkLit && !sp) { L.spot.position.set(-2.5, 13, CT.HOOP - 4); L.spot.target.position.set(0, 2.2, CT.HOOP - 1.2); L.spot.angle = 0.32; }
  else L.spot.angle = 0.24;
  if (sp) { L.spot.position.set(sp.x - 3, 13, sp.z); L.spot.target.position.set(sp.x, 0.5, sp.z); L.cone.position.set(sp.x - 3, 13, sp.z); L.cone.lookAt(sp.x, 0.5, sp.z); L.cone.rotateX(PI / 2); }
  L.cone.material.opacity = lerp(L.cone.material.opacity, sp && R3.q >= 1 ? 0.07 : 0, 1 - Math.exp(-dt * 6));
  if (W.lampM) W.lampM.color.setScalar(0.25 + 0.75 * L.dim);
}
// Night Court (unlocked by winning the dunk contest): the house lights down, coloured beams sweeping the bowl.
function buildLasers() {
  const g = new THREE.Group(); g.visible = false; W.arena.add(g); W.lasers = g;
  const cg = new THREE.CylinderGeometry(0.05, 1.6, 24, 16, 1, true); cg.translate(0, -12, 0);
  ['#ff3d7f', '#36d6ff', '#ffb736', '#9b5cff'].forEach((c, i) => {
    const m = new THREE.Mesh(cg, new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.11, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
    m.position.set((i % 2 ? 1 : -1) * 12, 14.5, (i < 2 ? 1 : -1) * 14); m.userData.ph = i * 1.7; g.add(m);
  });
}
function lasersUpdate() {
  const on = R3.night && R3.venue === 'arena' && M.kind !== 'roof';
  if (!W.lasers) return;
  W.lasers.visible = on && R3.q >= 1; if (!W.lasers.visible) return;
  const t = R3.time * (arc.reducedMotion ? 0.1 : 0.5);
  W.lasers.children.forEach((m) => { m.rotation.x = sin(t + m.userData.ph) * 0.6 + 0.2 * Math.sign(-m.position.z); m.rotation.z = cos(t * 0.8 + m.userData.ph) * 0.5 + 0.35 * Math.sign(m.position.x); });
}
function crowdUpdate(dt) {
  if (!W.crowds) return;
  const ex = clamp(0.15 + M.noise * 0.85 + (M.kind === 'game' && M.phase === 'intro' ? 0.4 : 0), 0, 1);
  _lk.set(B.x, max(1, B.y), B.z);
  for (const C of W.crowds) { C.c.excite(ex); C.c.update(dt, { look: _lk }); }
  if (W.ledTex) W.ledTex.offset.x = (W.ledTex.offset.x + dt * 0.03) % 1;
  // the roar under it all
  W.roarT = (W.roarT || 0) - dt;
  if (W.roarT <= 0 && arc.state === 'play') { W.roarT = 0.45; arc.sfx.noise(0.6, { freq: 500 + M.noise * 500, vol: 0.012 + M.noise * 0.03 }); }
}
function hoopsUpdate(dt) {
  padTone();
  const cz = R3.camera.position.z, lz = CAM.look.z;
  // never film from inside the centre-hung scoreboard
  if (W.jumboG) { const cp = R3.camera.position; W.jumboG.visible = !(cp.y > 7.4 && hypot(cp.x, cp.z) < 4.2); }
  for (const H of W.hoops) {
    // the basket the camera is behind, while it looks at play in front of it, steps out of the way
    const s = H.s, behind = cz * s > CT.BOARD - 1.2 && lz * s < CT.BOARD - 0.4 && !(M.kind === 'dunk' && s > 0);
    H.fade = lerp(H.fade, behind ? 1 : 0, 1 - Math.exp(-dt * 8));
    const op = 1 - H.fade * 0.9;
    for (const m of H.fadeMats) { m.opacity = op; m.depthWrite = op > 0.98; }
    H.glass.opacity = 0.22 * (1 - H.fade * 0.75);
    H.swish += dt; H.wob = max(0, H.wob - dt * 3);
    H.rim.position.y = CT.RIM_Y + (arc.reducedMotion ? 0 : sin(R3.time * 55) * 0.012 * H.wob - H.wob * 0.03);
    stepNet(H, dt);
  }
}
let CS = null;
function shadowsUpdate() {
  if (!CS) return;
  CS.begin();
  for (let s = 0; s < 2; s++) for (const p of M.court[s] || []) CS.put(p.x, p.y, p.z, 0.8, p.y, 0.55);
  if (W.ball.visible) CS.put(W.ball.position.x, W.ball.position.y, W.ball.position.z, 0.28, W.ball.position.y - CT.BR, 0.5);
  CS.end();
}

/* ====================================================================== boot and frame */
function softwareGL() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch (e) { return false; }
}
function initRenderer(a) {
  arc = a;
  try {
    R3.soft = softwareGL();
    const r = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: !R3.soft, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x0c0b10, 1);
    R3.renderer = r; R3.aniso = R3.soft ? 1 : Math.min(8, r.capabilities.getMaxAnisotropy());
    arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
    arc.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
    R3.q = R3.soft ? 0 : (window.matchMedia && matchMedia('(pointer: coarse)').matches ? 2 : 3);
    const qm = /[?&]q=(\d)/.exec(location.search); if (qm) { R3.q = clamp(+qm[1], 0, 3); R3.lock = true; }
    R3.scene = new THREE.Scene();
    R3.fogArena = new THREE.FogExp2(0x15131c, 0.012); R3.fogRoof = new THREE.FogExp2(0x3a2238, 0.0085);
    R3.scene.fog = R3.fogArena;
    R3.camera = new THREE.PerspectiveCamera(42, arc.w / arc.h, 0.1, 400);
    R3.glow = glowTex();
    W.arena = new THREE.Group(); W.arena.name = 'arena'; R3.scene.add(W.arena);
    buildFloor(); buildHoops(); W.floorHome = -1; setFloorTeam(M.teams[0] || 1); buildBall(); buildLights();
    // the rest arrives over the first frames after the menu is up, one piece a frame
    R3.late = [buildStands, buildBenches, buildRoof, buildEnv, () => buildCrowd(0), () => buildCrowd(1), buildVFX, () => buildCrowd(2), () => buildCrowd(3), () => { CS = contactShadow(W.arena, { max: 16, size: 0.8, opacity: 0.5, fade: 2.4 }); }, buildLasers, () => { R3.peopleOn = true; }];
    POST = createPost(r, { arc, soft: R3.soft, intro: { yaw: 0.6, up: 0.35, back: 0.3 }, results: { yaw: 0.22 }, handheld: { menu: false, results: true }, dof: { results: 0.6, radius: 0.22 }, target: (v) => v.copy(R3.venue === 'roof' && roofMod ? roofMod.roofView.camLook : CAM.look), look: { bloom: 0.62, threshold: 0.78, vignette: 0.24, sat: 1.02, contrast: 1.05, lift: [0.006, 0.008, 0.016], gain: [1.02, 1.0, 0.97], grain: 0.025 } });
    applyQuality();
    R3.ok = true;
  } catch (err) {
    R3.ok = false; R3.fail = String((err && err.message) || err);
    try { console.warn('3D unavailable: ' + R3.fail); } catch (e) { /* ignore */ }
  }
}
function buildVFX() {
  try { VFX = createVFX(R3.renderer, R3.scene, R3.camera, { quality: R3.q, unit: 1, groundY: 0, soft: R3.soft, reduced: !!arc.reducedMotion }); VFX.warm(); } catch (e) { VFX = null; }
}
function applyQuality() {
  const r = R3.renderer; if (!r || !arc) return;
  const f = (R3.soft ? [0.45, 0.6, 0.8, 1] : [0.55, 0.72, 0.88, 1])[R3.q];
  const pr = Math.max(0.5, arc.dpr * f);
  r.setPixelRatio(R3.soft && R3.q === 0 ? Math.max(0.3, Math.min(pr, Math.sqrt(150000 / Math.max(1, arc.w * arc.h)))) : pr); r.setSize(arc.w, arc.h, false);
  r.shadowMap.enabled = R3.q >= 1;
  const want = R3.q >= 3 ? 2048 : 1024;
  for (const key of [W.lights && W.lights.key, roofMod && roofMod.roofView.key]) {
    if (!key) continue;
    key.castShadow = R3.q >= 1;
    if (key.shadow.mapSize.x !== want) { key.shadow.mapSize.set(want, want); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
  }
  if (roofMod) roofMod.roofQuality();
  crowdQuality();
  if (R3.venue === 'arena' && R3.scene) R3.scene.environment = R3.q >= 1 ? W.env || null : null;
  if (VFX) VFX.setQuality(R3.q);
}
function arenaFrame(dt) {
  peopleQueue();
  if (M.teams && W.floorMat && M.kind !== 'roof' && M.teams[0] !== W.floorHome && arc.state !== 'over') setFloorTeam(M.teams[0]);
  updatePeople(dt);
  placeBall(dt);
  updateRacks();
  hoopsUpdate(dt);
  updateBoards();
  lightsUpdate(dt);
  crowdUpdate(dt);
  shadowsUpdate();
  lasersUpdate();
  // the ball glows a little in the user's hands when the release is perfect, and in a contest's money ball
  const p = M.ctrl;
  const glow = p && p.ad && p.ad.user && !p.ad.rel && p.act === 'shoot' && abs(p.actT / RISE - 1) <= M.diff.win ? 0.6 : (M.kind === 'c3' && M.c3 && M.c3.money && B.holder ? 0.25 : 0);
  W.ballMat.emissiveIntensity = lerp(W.ballMat.emissiveIntensity, glow, 1 - Math.exp(-dt * 16));
  if (W.ballGold !== !!(UNL.get().goldball && (M.kind === 'c3' || M.kind === 'dunk'))) { W.ballGold = !W.ballGold; const old = W.ballMat.map; W.ballMat.map = ballTex(W.ballGold); W.ballMat.needsUpdate = true; if (old) old.dispose(); }
  director(dt);
  if (VFX) { VFX.setReduced(!!arc.reducedMotion); VFX.update(dt); }
}
function render(c) {
  const now = performance.now();
  const dt = R3.last ? Math.min(0.05, (now - R3.last) / 1000) : 1 / 60;
  R3.realDt = R3.last ? Math.min(0.25, (now - R3.last) / 1000) : 1 / 60;
  R3.last = now;
  if (!R3.ok) { c.fillStyle = '#15131c'; c.fillRect(0, 0, arc.w, arc.h); c.fillStyle = '#FBF5EC'; c.font = '600 14px ' + F_UI; c.textAlign = 'center'; c.fillText('3D graphics are not available on this device', arc.w / 2, arc.h * 0.45); return; }
  if (R3.lost) return;
  if (R3.late && R3.late.length && arc.frame > 2) { try { R3.late.shift()(); if (!R3.late.length) applyQuality(); } catch (e) { try { console.warn(e); } catch (er) { /* ignore */ } } }
  const fdt = arc.state === 'pause' ? 0 : dt;
  try {
    if (R3.venue === 'roof' && roofMod) { roofMod.roofFrame(fdt); }
    else { R3.time += fdt; arenaFrame(fdt); }
    if (POST) { POST.setQuality(R3.q, R3.lock); POST.render(R3.scene, R3.camera); } else R3.renderer.render(R3.scene, R3.camera);
  } catch (e) { R3.ok = false; try { console.warn(e); } catch (er) { /* ignore */ } }
  if (R3.venue === 'roof' && roofMod) roofMod.roofHud(c);
  // quality auto-scale on real frame time
  if (!R3.lock && arc.state === 'play') {
    R3.accT += R3.realDt; R3.accN++;
    if (R3.accT > 1.3 && R3.accN >= 3) {
      const avg = R3.accT / R3.accN; R3.fps = Math.round(1 / avg);
      if (avg > 0.05 && R3.q > 0) { R3.q = Math.max(0, R3.q - 2); applyQuality(); R3.settle = 0; }
      else if (R3.settle > 0) R3.settle--; else if (avg > 0.03 && R3.q > 0) { R3.q--; applyQuality(); R3.settle = 1; }
      R3.accT = 0; R3.accN = 0;
    }
  }
}
const _ts = new THREE.Vector3();
function toScreen(x, y, z) {
  if (!R3.ok) return null;
  const v = _ts.set(x, y, z).project(R3.camera);
  return { x: (v.x * 0.5 + 0.5) * arc.w, y: (-v.y * 0.5 + 0.5) * arc.h, z: v.z };
}
function graphics(level) { if (level === 'auto') { R3.lock = false; return; } R3.lock = true; R3.q = level === 'sharp' ? 3 : 1; applyQuality(); }

coreBoot({
  three: true,
  init: (a) => initRenderer(a),
  render, venue, toScreen, stick, ev,
  timeScale: () => (VFX && R3.venue === 'arena' ? VFX.timeScale || 1 : 1),
  resize: (a) => { arc = a; if (!R3.renderer) return; applyQuality(); R3.camera.aspect = a.w / a.h; R3.camera.updateProjectionMatrix(); },
  graphics,
  night(on) { R3.night = !!on; },
  cycleCam() { const i = CAMS.indexOf(R3.cam); R3.cam = CAMS[(i + 1) % CAMS.length]; arc.toast('Camera: ' + (R3.cam === 'auto' ? 'auto' : R3.cam), null, 1100); },
  dbg: () => ({ quality: R3.q, fps: R3.fps || null, webgl: R3.ok, venue: R3.venue, people: PV.size }),
  dev: {
    quality(q) { R3.q = clamp(q | 0, 0, 3); R3.lock = true; applyQuality(); },
    // jump straight to live play (posters, tests)
    skip() { if (M.kind === 'game' && (M.phase === 'intro' || M.phase === 'tip')) { M.phase = 'tip'; M.tip = { t: 0.6, done: false }; } },
    cam(m) { if (CAMS.indexOf(m) >= 0) R3.cam = m; },
    state: () => M,
    pv: () => [...PV.values()].map((V) => ({ id: V.id, sit: V.sit, playing: V.H.playing('sit'), vis: V.H.group.visible, y: +V.H.bones.pelvis.position.y.toFixed(2) })),
  },
});
