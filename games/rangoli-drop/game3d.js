/*
 * Rangoli Drop in 3D. The rules live in core.js; this file builds the
 * courtyard, the brass frame and the glowing rangoli tiles, and films them.
 *
 * Fast start: the menu and a 2D board (view2d.js) are up before three.js has
 * even loaded. three.js and the shared post pass are then imported, the
 * scene is built a few milliseconds at a time between frames, its shaders
 * are compiled off the main thread (compileAsync), and only then does the 3D
 * board take over, through a short fade. Everything an effect needs, every
 * particle pool and material, exists before the first round, so nothing
 * compiles mid game.
 *
 * Each cell is one instance of a bevelled tile: its face carries a rangoli
 * motif (a different one per shape, so colour is never the only cue) that
 * glows in the piece's colour, the bevels catch an environment light, and
 * a full row flashes white and bursts into colour powder.
 */
import { boot, frozen, COLS, SHAPES, SIZE, PIECE_COL, clamp, TAU, layoutUnits, margins, slotAt, makeAnim, animEvent, animTick, boardTile, paletteOf, ghostOn } from '/games/rangoli-drop/core.js';
import { make2D } from '/games/rangoli-drop/view2d.js';

let THREE = null, createPost = null;
const A = makeAnim();
const V2 = make2D({ anim: A });
const STEP_MS = [], MARKS = [];
const MARK = (n) => { MARKS.push(n + '@' + Math.round(performance.now())); };
let ARC = null, R = null, READY = false, BUILD_MS = 0, PENDING_Q = null, PENDING_LOCK = false, LAST_G = null;

const TIERS = [
  { px: 0.6, budget: 0.32e6, shadow: false, map: 512, fx: 0.45, env: false, hi: false, diyas: 30 },
  { px: 0.85, budget: 0.95e6, shadow: false, map: 1024, fx: 0.75, env: true, hi: true, diyas: 70 },
  { px: 1, budget: 1.7e6, shadow: true, map: 1024, fx: 1, env: true, hi: true, diyas: 110 },
  { px: 1, budget: 3.4e6, shadow: true, map: 2048, fx: 1, env: true, hi: true, diyas: 140 },
];
const SOFT_RE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

/* ------------------------------------------------------------ build helpers */
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = R.aniso;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  R.textures.push(t);
  return t;
}
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function grain(g, w, h, base, n, amp, seed) {
  const r = rng(seed); g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = Math.round(128 + (r() - 0.5) * amp * 255); g.fillStyle = 'rgba(' + v + ',' + v + ',' + v + ',' + (0.12 + r() * 0.25).toFixed(2) + ')'; const s = 1 + r() * 2.2; g.fillRect(r() * w, r() * h, s, s); }
}
function rrPath(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function rrShape(w, h, r, cx, cy) {
  const s = new THREE.Shape(), x = (cx || 0) - w / 2, y = (cy || 0) - h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r); s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function rrPathShape(w, h, r) { const p = new THREE.Path(), x = -w / 2, y = -h / 2; p.moveTo(x + r, y); p.lineTo(x + w - r, y); p.quadraticCurveTo(x + w, y, x + w, y + r); p.lineTo(x + w, y + h - r); p.quadraticCurveTo(x + w, y + h, x + w - r, y + h); p.lineTo(x + r, y + h); p.quadraticCurveTo(x, y + h, x, y + h - r); p.lineTo(x, y + r); p.quadraticCurveTo(x, y, x + r, y); return p; }
// Average flat normals across shared corners within an angle, so bevels shade smooth.
function smoothNormals(geo, deg) {
  const pos = geo.attributes.position.array, nor = geo.attributes.normal.array, n = pos.length / 3, cosT = Math.cos(deg * Math.PI / 180);
  const map = new Map();
  for (let i = 0; i < n; i++) { const key = Math.round(pos[i * 3] * 1e4) + ',' + Math.round(pos[i * 3 + 1] * 1e4) + ',' + Math.round(pos[i * 3 + 2] * 1e4); let l = map.get(key); if (!l) map.set(key, l = []); l.push(i); }
  const out = new Float32Array(nor.length);
  map.forEach((l) => {
    for (let a = 0; a < l.length; a++) {
      const i = l[a]; let x = 0, y = 0, z = 0;
      for (let b = 0; b < l.length; b++) { const j = l[b]; const d = nor[i * 3] * nor[j * 3] + nor[i * 3 + 1] * nor[j * 3 + 1] + nor[i * 3 + 2] * nor[j * 3 + 2]; if (d >= cosT) { x += nor[j * 3]; y += nor[j * 3 + 1]; z += nor[j * 3 + 2]; } }
      const L = Math.hypot(x, y, z) || 1; out[i * 3] = x / L; out[i * 3 + 1] = y / L; out[i * 3 + 2] = z / L;
    }
  });
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
}
function mergeGeos(list) {
  const flat = list.map((g0) => { if (!g0.index) return g0; const g = g0.toNonIndexed(); g0.dispose(); return g; });
  let n = 0; flat.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  flat.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}

/* ------------------------------------------------------------ textures */
// The emissive atlas: one rangoli motif per shape (4 x 2 cells), the eighth is the ghost's outline.
function drawMotif(g, m, S) {
  g.save();
  g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  const c = S / 2, W = (a) => 'rgba(255,248,236,' + a + ')';
  g.strokeStyle = W(0.95); g.fillStyle = W(0.95); g.lineCap = 'round';
  // a dotted border, shared by all, like a rangoli's edge
  const ring = (inset, n, r) => { const a = inset * S, b = S - inset * S, L = b - a; for (let i = 0; i < n; i++) { const t = i / n, side = Math.floor(t * 4), u = (t * 4 - side) * L; const x = side === 0 ? a + u : side === 1 ? b : side === 2 ? b - u : a; const y = side === 0 ? a : side === 1 ? a + u : side === 2 ? b : b - u; g.beginPath(); g.arc(x, y, r * S, 0, TAU); g.fill(); } };
  if (m === 7) {
    g.lineWidth = S * 0.05; rrPath(g, S * 0.1, S * 0.1, S * 0.8, S * 0.8, S * 0.14); g.stroke();
    ring(0.22, 24, 0.018); g.restore(); return;
  }
  ring(0.13, 28, 0.017);
  g.lineWidth = S * 0.028;
  g.globalAlpha = 0.95;
  if (m === 0) { // lotus
    for (let i = 0; i < 8; i++) { const an = i * TAU / 8; g.beginPath(); g.ellipse(c + Math.cos(an) * S * 0.17, c + Math.sin(an) * S * 0.17, S * 0.12, S * 0.055, an, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(c, c, S * 0.06, 0, TAU); g.fill();
  } else if (m === 1) { // kolam: dots with loops round them
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) { g.beginPath(); g.arc(c + i * S * 0.17, c + j * S * 0.17, S * 0.025, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(c, c, S * 0.26, 0, TAU); g.stroke();
    for (let i = 0; i < 4; i++) { const an = i * TAU / 4 + TAU / 8; g.beginPath(); g.arc(c + Math.cos(an) * S * 0.24, c + Math.sin(an) * S * 0.24, S * 0.08, 0, TAU); g.stroke(); }
  } else if (m === 2) { // sun
    g.beginPath(); g.arc(c, c, S * 0.11, 0, TAU); g.stroke();
    for (let i = 0; i < 12; i++) { const an = i * TAU / 12; g.beginPath(); g.moveTo(c + Math.cos(an - 0.13) * S * 0.15, c + Math.sin(an - 0.13) * S * 0.15); g.lineTo(c + Math.cos(an) * S * 0.31, c + Math.sin(an) * S * 0.31); g.lineTo(c + Math.cos(an + 0.13) * S * 0.15, c + Math.sin(an + 0.13) * S * 0.15); g.stroke(); }
    g.beginPath(); g.arc(c, c, S * 0.04, 0, TAU); g.fill();
  } else if (m === 3) { // nested diamonds
    for (let k = 1; k <= 3; k++) { const r = S * 0.1 * k; g.beginPath(); g.moveTo(c, c - r); g.lineTo(c + r, c); g.lineTo(c, c + r); g.lineTo(c - r, c); g.closePath(); g.stroke(); }
    g.beginPath(); g.arc(c, c, S * 0.035, 0, TAU); g.fill();
  } else if (m === 4) { // four petals and four seeds
    for (let i = 0; i < 4; i++) { const an = i * TAU / 4; g.beginPath(); g.ellipse(c + Math.cos(an) * S * 0.15, c + Math.sin(an) * S * 0.15, S * 0.14, S * 0.07, an, 0, TAU); g.stroke(); const b = an + TAU / 8; g.beginPath(); g.arc(c + Math.cos(b) * S * 0.25, c + Math.sin(b) * S * 0.25, S * 0.03, 0, TAU); g.fill(); }
    g.beginPath(); g.arc(c, c, S * 0.05, 0, TAU); g.fill();
  } else if (m === 5) { // wheel
    g.beginPath(); g.arc(c, c, S * 0.27, 0, TAU); g.stroke(); g.beginPath(); g.arc(c, c, S * 0.08, 0, TAU); g.stroke();
    for (let i = 0; i < 8; i++) { const an = i * TAU / 8; g.beginPath(); g.moveTo(c + Math.cos(an) * S * 0.08, c + Math.sin(an) * S * 0.08); g.lineTo(c + Math.cos(an) * S * 0.27, c + Math.sin(an) * S * 0.27); g.stroke(); }
  } else if (m === 6) { // peacock eye
    for (let k = 1; k <= 3; k++) { g.beginPath(); g.ellipse(c, c + S * 0.02 * k, S * 0.08 * k, S * 0.1 * k, 0, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(c, c + S * 0.02, S * 0.05, 0, TAU); g.fill();
  }
  // a soft bloom at the heart so the tile glows from inside
  g.globalAlpha = 1;
  const gr = g.createRadialGradient(c, c, 0, c, c, S * 0.42); gr.addColorStop(0, 'rgba(255,240,220,0.32)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
  g.globalCompositeOperation = 'lighter'; g.fillStyle = gr; g.fillRect(0, 0, S, S);
  g.restore();
}

/* ------------------------------------------------------------ shaders */
// The courtyard sky: a gradient worked out per pixel, and a mandala drawn once into a grey texture
// that the shader tints with the level's colours and turns slowly (rings one way, petals the other).
const BG_VS = [
  'uniform vec2 uSz; uniform vec2 uC; uniform float uRot;',
  'varying vec2 vP; varying vec2 vA; varying vec2 vB;',
  'void main(){',
  '  vP = (uv - 0.5 - uC) * uSz * 2.0;',
  '  float c = cos(uRot), s = sin(uRot), c2 = cos(-uRot * 1.6), s2 = sin(-uRot * 1.6);',
  '  vA = vec2(c * vP.x - s * vP.y, s * vP.x + c * vP.y) / 2.9 + 0.5;',
  '  vB = vec2(c2 * vP.x - s2 * vP.y, s2 * vP.x + c2 * vP.y) / 2.9 + 0.5;',
  '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
  '}',
].join('\n');
const BG_FS = [
  'uniform vec3 uBg0; uniform vec3 uBg1; uniform vec3 uLine; uniform float uEnergy; uniform sampler2D tMand;',
  'varying vec2 vP; varying vec2 vA; varying vec2 vB;',
  'void main(){',
  '  float r = length(vP);',
  '  vec3 col = mix(uBg1, uBg0, smoothstep(0.0, 1.25, r));',
  '  float m = texture2D(tMand, vA).r + texture2D(tMand, vB).g * 0.8;',
  '  col += uLine * m * (0.2 + uEnergy * 0.14) * smoothstep(1.6, 0.25, r);',
  '  col += uLine * 0.05 * smoothstep(0.9, 0.0, r);',
  '  gl_FragColor = vec4(col, 1.0);',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');
const TRAIL_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const PT_VS = [
  'attribute vec3 aCol; attribute float aSize; attribute float aAlpha; attribute float aRot;',
  'uniform float uScale;',
  'varying vec3 vCol; varying float vA; varying float vRot;',
  'void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.0, aSize * uScale / -mv.z); vCol = aCol; vA = aAlpha; vRot = aRot; }',
].join('\n');
const PT_GLOW_FS = [
  'varying vec3 vCol; varying float vA; varying float vRot;',
  'void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float a = pow(1.0 - d, 2.2); gl_FragColor = vec4(vCol * (a * vA), 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');
const PT_POWDER_FS = [
  'varying vec3 vCol; varying float vA; varying float vRot;',
  'float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
  'void main(){',
  '  vec2 q = gl_PointCoord - 0.5; float a;',
  '  if (vRot > -50.0) { float c = cos(vRot), s = sin(vRot); q = vec2(c * q.x - s * q.y, s * q.x + c * q.y); float d = length(q * vec2(1.0, 2.6)) * 2.0; if (d > 1.0) discard; a = smoothstep(1.0, 0.6, d); }',
  '  else { float d = length(q) * 2.0; if (d > 1.0) discard; a = pow(1.0 - d, 1.6) * (0.75 + 0.25 * h(floor(gl_PointCoord * 7.0) + vRot)); }',
  '  gl_FragColor = vec4(vCol, a * vA);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');
const DIYA_VS = [
  'attribute vec4 aSeed; uniform float uTime; uniform float uScale; uniform float uY; varying float vA;',
  'void main(){ vec3 p = position; float y = mod(aSeed.x + uTime * aSeed.y, 52.0) - 26.0; p.y = y + uY;',
  '  float fl = 0.82 + 0.18 * sin(uTime * 7.0 + aSeed.z * 31.0);',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = aSeed.w * fl * uScale / -mv.z;',
  '  vA = smoothstep(-26.0, -19.0, y) * (1.0 - smoothstep(16.0, 26.0, y)) * fl; }',
].join('\n');
const DIYA_FS = [
  'uniform vec3 uCol; varying float vA;',
  'void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; if (d > 1.0) discard; float core = smoothstep(0.3, 0.0, d); float halo = pow(1.0 - d, 3.0) * 0.55;',
  '  gl_FragColor = vec4((uCol * halo + vec3(1.0, 0.86, 0.6) * core * 1.6) * vA, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');
const TRAIL_FS = [
  'uniform vec3 uCol; uniform float uA; varying vec2 vUv;',
  'void main(){ float e = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x); float v = pow(1.0 - vUv.y, 1.6); gl_FragColor = vec4(uCol * e * v * uA, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');

/* ------------------------------------------------------------ particles */
function makePool(cap, frag, blending) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(cap * 3), col = new Float32Array(cap * 3), size = new Float32Array(cap), alpha = new Float32Array(cap), rot = new Float32Array(cap);
  const add = (name, arr, n) => { const at = new THREE.BufferAttribute(arr, n); at.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, at); return at; };
  const P = { cap, n: 0, geo, aPos: add('position', pos, 3), aCol: add('aCol', col, 3), aSize: add('aSize', size, 1), aAlpha: add('aAlpha', alpha, 1), aRot: add('aRot', rot, 1),
    vx: new Float32Array(cap), vy: new Float32Array(cap), vz: new Float32Array(cap), life: new Float32Array(cap), max: new Float32Array(cap), s0: new Float32Array(cap), grow: new Float32Array(cap), drag: new Float32Array(cap), grav: new Float32Array(cap), spin: new Float32Array(cap), a0: new Float32Array(cap) };
  geo.setDrawRange(0, 0);
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  const mat = new THREE.ShaderMaterial({ vertexShader: PT_VS, fragmentShader: frag, uniforms: { uScale: { value: 400 } }, transparent: true, depthWrite: false, blending });
  P.mat = mat; P.pts = new THREE.Points(geo, mat); P.pts.frustumCulled = false;
  return P;
}
function emit(P, x, y, z, vx, vy, vz, life, size, grow, col, alpha, drag, grav, rot, spin) {
  if (P.n >= P.cap || !(R.density > 0)) return;
  const i = P.n++;
  P.aPos.array[i * 3] = x; P.aPos.array[i * 3 + 1] = y; P.aPos.array[i * 3 + 2] = z;
  P.vx[i] = vx; P.vy[i] = vy; P.vz[i] = vz; P.life[i] = life; P.max[i] = life; P.s0[i] = size; P.grow[i] = grow;
  P.aCol.array[i * 3] = col.r; P.aCol.array[i * 3 + 1] = col.g; P.aCol.array[i * 3 + 2] = col.b;
  P.a0[i] = alpha; P.drag[i] = drag; P.grav[i] = grav; P.aRot.array[i] = rot == null ? -99 : rot; P.spin[i] = spin || 0;
  P.aSize.array[i] = size; P.aAlpha.array[i] = alpha;
}
function stepPool(P, dt) {
  const pos = P.aPos.array, col = P.aCol.array, sz = P.aSize.array, al = P.aAlpha.array, rot = P.aRot.array;
  for (let i = P.n - 1; i >= 0; i--) {
    P.life[i] -= dt;
    if (P.life[i] <= 0) {
      const j = --P.n;
      if (i !== j) {
        pos[i * 3] = pos[j * 3]; pos[i * 3 + 1] = pos[j * 3 + 1]; pos[i * 3 + 2] = pos[j * 3 + 2];
        col[i * 3] = col[j * 3]; col[i * 3 + 1] = col[j * 3 + 1]; col[i * 3 + 2] = col[j * 3 + 2];
        P.vx[i] = P.vx[j]; P.vy[i] = P.vy[j]; P.vz[i] = P.vz[j]; P.life[i] = P.life[j]; P.max[i] = P.max[j]; P.s0[i] = P.s0[j]; P.grow[i] = P.grow[j];
        P.a0[i] = P.a0[j]; P.drag[i] = P.drag[j]; P.grav[i] = P.grav[j]; rot[i] = rot[j]; P.spin[i] = P.spin[j]; sz[i] = sz[j]; al[i] = al[j];
      }
      continue;
    }
    const d = Math.exp(-P.drag[i] * dt);
    P.vx[i] *= d; P.vy[i] = P.vy[i] * d - P.grav[i] * dt; P.vz[i] *= d;
    pos[i * 3] += P.vx[i] * dt; pos[i * 3 + 1] += P.vy[i] * dt; pos[i * 3 + 2] += P.vz[i] * dt;
    const f = P.life[i] / P.max[i];
    sz[i] = P.s0[i] + P.grow[i] * (1 - f) * P.max[i];
    al[i] = P.a0[i] * Math.min(1, f * 2.2) * Math.min(1, (1 - f) * 12 + 0.2);
    if (rot[i] > -50) rot[i] += P.spin[i] * dt;
  }
  P.geo.setDrawRange(0, P.n);
  if (P.n) { P.aPos.needsUpdate = true; P.aCol.needsUpdate = true; P.aSize.needsUpdate = true; P.aAlpha.needsUpdate = true; P.aRot.needsUpdate = true; }
}

/* ------------------------------------------------------------ the build, a slice at a time */
function buildRenderer(a) {
  const canvas = a.canvas;
  let renderer;
  const soft = (() => { try { const g = document.createElement('canvas').getContext('webgl2'); const e = g && g.getExtension('WEBGL_debug_renderer_info'); const n = g ? String(g.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : g.RENDERER)) : ''; const x = g && g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return SOFT_RE.test(n); } catch (er) { return false; } })();
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: !soft, powerPreference: 'high-performance', alpha: false, stencil: false }); } catch (e) { return false; }
  renderer.debug.checkShaderErrors = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = false; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor(0x05040a, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, Math.max(0.1, a.w / a.h), 2, 400);
  R = {
    renderer, scene, camera, soft, q: soft ? 0 : a.device === 'desktop' ? 3 : 2, lock: false, fps: 60, fT: 0, fN: 0, warm: 0, lost: false,
    tJs: 0, tGl: 0, textures: [], aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()), density: 1, last: 0, time: 0,
    base: { pos: new THREE.Vector3(0, 0, 50), tgt: new THREE.Vector3(), D: 50 }, U: null, layoutKey: '',
    v1: new THREE.Vector3(), v2: new THREE.Vector3(), pal0: new THREE.Color(), pal1: new THREE.Color(), palC: [new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color(), new THREE.Color()],
    TCOL: PIECE_COL.map((h) => new THREE.Color(h)), white: new THREE.Color(1, 0.95, 0.85), gold: new THREE.Color('#ffcf5a'), lampTint: new THREE.Color(),
  };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); if (R) R.lost = true; }, false);
  canvas.addEventListener('webglcontextrestored', () => { if (!R) return; R.lost = false; R.textures.forEach((t) => { t.needsUpdate = true; }); }, false);
  scene.fog = new THREE.Fog(0x0a0610, 70, 170);
  const hemi = new THREE.HemisphereLight('#c9a2b8', '#120c12', 0.55); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff0dc', 2.1);
  key.position.set(-9, 15, 24); key.target.position.set(0, 0, 0);
  const sc = key.shadow.camera; sc.left = -13; sc.right = 13; sc.top = 14; sc.bottom = -14; sc.near = 8; sc.far = 70;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02; key.shadow.radius = 3; key.shadow.mapSize.set(1024, 1024);
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#9fb4ff', 0.55); rim.position.set(12, -6, 10); scene.add(rim);
  const pieceLight = new THREE.PointLight('#ffffff', 0, 8, 2); pieceLight.position.set(0, 0, 1.6); scene.add(pieceLight);
  Object.assign(R, { hemi, key, rim, pieceLight });
  return true;
}
function buildTextures() {
  const lo = R.soft;
  R.powder = canvasTex(lo ? 64 : 128, lo ? 64 : 128, (g, w, h) => grain(g, w, h, '#e9e1d8', lo ? 500 : 2200, 0.6, 11));
  const pw = lo ? 200 : 400, ph = lo ? 400 : 800;
  R.plate = canvasTex(pw, ph, (g, w, h) => {
    grain(g, w, h, '#2a2533', lo ? 1500 : 6000, 0.5, 5);
    const r = rng(9); g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1;
    for (let i = 0; i < 18; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 80; y += r() * 90; g.lineTo(x, y); } g.stroke(); }
  }, { clamp: true });
  R.plateGlow = canvasTex(pw, ph, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cs = w / 10;
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1;
    for (let x = 0; x <= 10; x++) { g.beginPath(); g.moveTo(x * cs, 0); g.lineTo(x * cs, h); g.stroke(); }
    for (let y = 0; y <= 20; y++) { g.beginPath(); g.moveTo(0, y * cs); g.lineTo(w, y * cs); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let y = 0; y <= 20; y++) for (let x = 0; x <= 10; x++) { g.beginPath(); g.arc(x * cs, y * cs, Math.max(1.2, cs * 0.045), 0, TAU); g.fill(); }
  }, { clamp: true });
  R.plateLo = canvasTex(pw, ph, (g, w, h) => {
    g.drawImage(R.plate.image, 0, 0, w, h); g.fillStyle = 'rgba(10,8,16,0.45)'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.5; g.drawImage(R.plateGlow.image, 0, 0, w, h);
  }, { clamp: true });
}
function buildAtlas(from, to) {
  const S = R.soft ? 128 : 256;
  if (!R.atlasCanvas) { R.atlasCanvas = document.createElement('canvas'); R.atlasCanvas.width = S * 4; R.atlasCanvas.height = S * 2; }
  const g = R.atlasCanvas.getContext('2d');
  for (let m = from; m < to; m++) {
    g.save(); g.translate((m % 4) * S, (1 - Math.floor(m / 4)) * S);
    g.beginPath(); g.rect(0, 0, S, S); g.clip();
    drawMotif(g, m, S); g.restore();
  }
  if (to >= 8) {
    const t = new THREE.CanvasTexture(R.atlasCanvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = R.aniso; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    R.textures.push(t); R.atlas = t;
  }
}
function tileGeometry(hi) {
  const h = 0.375, rad = 0.1;
  const geo = new THREE.ExtrudeGeometry(rrShape(h * 2, h * 2, rad), { depth: 0.22, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.07, bevelOffset: 0, bevelSegments: hi ? 3 : 1, curveSegments: hi ? 4 : 1 });
  geo.translate(0, 0, -0.11);
  const pos = geo.attributes.position.array, uv = geo.attributes.uv.array, span = (h + 0.07) * 2;
  for (let i = 0, j = 0; i < pos.length; i += 3, j += 2) { uv[j] = clamp(pos[i] / span + 0.5, 0.01, 0.99); uv[j + 1] = clamp(pos[i + 1] / span + 0.5, 0.01, 0.99); }
  if (hi) smoothNormals(geo, 50);
  geo.computeBoundingSphere();
  return geo;
}
function tileMaterial(ghost, cheap) {
  const o = { color: 0xffffff, map: R.powder, emissive: 0xffffff, emissiveMap: R.atlas, transparent: !!ghost, opacity: ghost ? 0.3 : 1, depthWrite: !ghost };
  const m = cheap ? new THREE.MeshLambertMaterial(o) : new THREE.MeshStandardMaterial(Object.assign(o, { roughness: 0.36, metalness: 0.06 }));
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec4 aFx;\nvarying vec4 vFx;')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvFx = aFx;\n#ifdef USE_EMISSIVEMAP\nvEmissiveMapUv = (vEmissiveMapUv + vec2(mod(aFx.w, 4.0), floor(aFx.w / 4.0 + 0.01))) * vec2(0.25, 0.5);\n#endif');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec4 vFx;')
      .replace('#include <color_fragment>', '#include <color_fragment>\nfloat lumG = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumG * 0.32), vFx.z);\ndiffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), vFx.y * 0.55);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance = totalEmissiveRadiance * vColor.rgb * vFx.x * 1.9 + vColor.rgb * vFx.x * 0.12 + vec3(1.0, 0.94, 0.84) * vFx.y * 1.4;\ntotalEmissiveRadiance *= 1.0 - vFx.z * 0.85;');
  };
  m.customProgramCacheKey = () => (ghost ? 'rd-tile-ghost' : 'rd-tile') + (cheap ? '-lo' : '');
  return m;
}
function instanced(geo, mat, cap) {
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const fx = new THREE.InstancedBufferAttribute(new Float32Array(cap * 4), 4); fx.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aFx', fx);
  mesh.count = 0; mesh.frustumCulled = false;
  return mesh;
}
function buildTiles() {
  R.geoHi = R.soft ? null : tileGeometry(true); R.geoLo = tileGeometry(false);
  // each geometry carries its own aFx; the meshes swap geometry with the tier
  R.tileMat = tileMaterial(false); R.ghostMat = tileMaterial(true);
  R.tileMatLo = tileMaterial(false, true); R.ghostMatLo = tileMaterial(true, true);
  const g0 = R.geoHi || R.geoLo;
  R.tiles = instanced(g0, R.tileMat, 320); R.tiles.castShadow = true; R.tiles.receiveShadow = true;
  R.ghostGeo = g0.clone();
  R.ghost = instanced(R.ghostGeo, R.ghostMat, 4); R.ghost.renderOrder = 2;
  if (R.geoHi) R.geoLo.setAttribute('aFx', R.tiles.geometry.attributes.aFx);
  R.scene.add(R.tiles, R.ghost);
}
function buildFrame() {
  const sc = R.scene;
  R.brass = new THREE.MeshStandardMaterial({ color: '#d4a552', metalness: 0.9, roughness: 0.3, bumpMap: R.powder, bumpScale: 0.6 });
  R.plateMat = new THREE.MeshStandardMaterial({ color: '#ffffff', map: R.plate, roughness: 0.4, metalness: 0.12, emissive: '#ffb04a', emissiveMap: R.plateGlow, emissiveIntensity: 0.22 });
  R.panelMat = new THREE.MeshStandardMaterial({ color: '#221c2c', roughness: 0.45, metalness: 0.15, bumpMap: R.powder, bumpScale: 0.3 });
  // the light tier: the same look with lighting baked or cheaper, for weak or software graphics
  R.brassLo = new THREE.MeshLambertMaterial({ color: '#c99a4a', emissive: '#3a2810' });
  R.plateMatLo = new THREE.MeshBasicMaterial({ map: R.plateLo });
  R.panelMatLo = new THREE.MeshBasicMaterial({ color: '#1c1724' });
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(10.1, 20.1), R.plateMat); plate.position.set(0, 0, -0.27); plate.receiveShadow = true; sc.add(plate); R.plate3 = plate;
  // brass frame, open at the top like a courtyard well, with a dome finial on each post
  const f = 0.6, s = new THREE.Shape();
  s.moveTo(-5 - f, 10.3); s.lineTo(-5 - f, -10 - f + 0.5); s.quadraticCurveTo(-5 - f, -10 - f, -5 - f + 0.5, -10 - f); s.lineTo(5 + f - 0.5, -10 - f); s.quadraticCurveTo(5 + f, -10 - f, 5 + f, -10 - f + 0.5); s.lineTo(5 + f, 10.3);
  s.lineTo(5.05, 10.3); s.lineTo(5.05, -10.05); s.lineTo(-5.05, -10.05); s.lineTo(-5.05, 10.3); s.lineTo(-5 - f, 10.3);
  const frame = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.07, bevelSize: 0.06, bevelSegments: R.soft ? 1 : 2, curveSegments: 6 });
  frame.translate(0, 0, -0.33);
  if (!R.soft) smoothNormals(frame, 45);
  const parts = [frame];
  const prof = [[0, 0], [0.44, 0], [0.48, 0.1], [0.42, 0.28], [0.3, 0.46], [0.16, 0.62], [0.07, 0.85], [0.02, 1.05], [0, 1.12]].map((p) => new THREE.Vector2(p[0], p[1]));
  [-1, 1].forEach((sd) => {
    const d = new THREE.LatheGeometry(prof, R.soft ? 10 : 18); d.translate(sd * (5 + f / 2 + 0.025), 10.3, 0.0); parts.push(d);
    const b = new THREE.CylinderGeometry(0.5, 0.5, 0.16, R.soft ? 10 : 18); b.translate(sd * (5 + f / 2 + 0.025), 10.36, 0); parts.push(b);
  });
  const med = new THREE.CylinderGeometry(0.62, 0.62, 0.2, 6); med.rotateX(Math.PI / 2); med.translate(0, -10.3, 0.34); parts.push(med);
  R.frame = new THREE.Mesh(mergeGeos(parts), R.brass); R.frame.castShadow = true; R.frame.receiveShadow = true; sc.add(R.frame);
  // a thin glowing inlay along the inside of the frame, in the level's colour
  R.inlayMat = new THREE.MeshBasicMaterial({ color: '#ffb04a' });
  const il = [new THREE.BoxGeometry(0.07, 20.35, 0.04), new THREE.BoxGeometry(0.07, 20.35, 0.04), new THREE.BoxGeometry(10.24, 0.07, 0.04)];
  il[0].translate(-5.12, 0.12, 0.3); il[1].translate(5.12, 0.12, 0.3); il[2].translate(0, -10.12, 0.3);
  R.inlay = new THREE.Mesh(mergeGeos(il), R.inlayMat); sc.add(R.inlay);
  R.panels = new THREE.Mesh(new THREE.BufferGeometry(), R.panelMat); R.panels.receiveShadow = true;
  R.rims = new THREE.Mesh(new THREE.BufferGeometry(), R.brass); R.rims.castShadow = true;
  sc.add(R.panels, R.rims);
}
function buildPanels(U) {
  const plates = [], rims = [];
  [U.hold, U.next].forEach((rc) => {
    const w = rc.w, h = rc.h, cx = rc.cx, cy = rc.cy;
    const p = new THREE.ExtrudeGeometry(rrShape(w, h, 0.35), { depth: 0.1, bevelEnabled: false, curveSegments: 6 }); p.translate(cx, cy, -0.32); plates.push(p);
    const ring = rrShape(w + 0.34, h + 0.34, 0.5); ring.holes.push(rrPathShape(w - 0.02, h - 0.02, 0.34));
    const r = new THREE.ExtrudeGeometry(ring, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: R.soft ? 1 : 2, curveSegments: 6 }); r.translate(cx, cy, -0.3); rims.push(r);
  });
  R.panels.geometry.dispose(); R.rims.geometry.dispose();
  R.panels.geometry = mergeGeos(plates); R.rims.geometry = mergeGeos(rims);
}
function buildBackdrop() {
  const sc = R.scene;
  // the mandala: rings and dots in red, a ring of petals in green, on black
  const S = R.soft ? 512 : 1024;
  R.mandala = canvasTex(S, S, (g, w) => { g.fillStyle = '#000'; g.fillRect(0, 0, w, w); drawMandala(g, w, '#f00', '#0f0');   }, { clamp: true, data: true });
  R.bgU = { uBg0: { value: new THREE.Color() }, uBg1: { value: new THREE.Color() }, uLine: { value: new THREE.Color() }, uRot: { value: 0 }, uSz: { value: new THREE.Vector2(1, 1) }, uDetail: { value: 1 }, uEnergy: { value: 0 }, uC: { value: new THREE.Vector2() }, tMand: { value: R.mandala } };
  R.bgMat = new THREE.ShaderMaterial({ vertexShader: BG_VS, fragmentShader: BG_FS, uniforms: R.bgU, depthWrite: false, fog: false, toneMapped: false });
  // the light tier's sky: the same gradient and mandala baked into one small picture, one lookup a pixel
  const bc = document.createElement('canvas'); bc.width = bc.height = 256;
  R.bgLoTex = new THREE.CanvasTexture(bc); R.bgLoTex.colorSpace = THREE.SRGBColorSpace; R.bgLoTex.generateMipmaps = false; R.bgLoTex.minFilter = THREE.LinearFilter; R.bgLoTex.wrapS = R.bgLoTex.wrapT = THREE.ClampToEdgeWrapping;
  R.textures.push(R.bgLoTex); R.bgLoLevel = -1;
  R.bgMatLo = new THREE.MeshBasicMaterial({ map: R.bgLoTex, depthWrite: false, fog: false, toneMapped: false });
  R.bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), R.bgMat);
  R.bg.renderOrder = -10; R.bg.frustumCulled = false; sc.add(R.bg);
  const N = 140, pos = new Float32Array(N * 3), seed = new Float32Array(N * 4), r = rng(77);
  for (let i = 0; i < N; i++) {
    const z = -6 - r() * 26, side = r() < 0.5 ? -1 : 1, x = side * (7 + r() * 22) * (0.4 + (-z) / 32);
    pos[i * 3] = x; pos[i * 3 + 2] = z;
    seed[i * 4] = r() * 52; seed[i * 4 + 1] = 0.35 + r() * 0.9; seed[i * 4 + 2] = r(); seed[i * 4 + 3] = 0.5 + r() * 0.7;
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 4));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
  R.diyaU = { uTime: { value: 0 }, uScale: { value: 400 }, uY: { value: 0 }, uCol: { value: new THREE.Color('#ffb35c') } };
  R.diyas = new THREE.Points(g, new THREE.ShaderMaterial({ vertexShader: DIYA_VS, fragmentShader: DIYA_FS, uniforms: R.diyaU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  R.diyas.frustumCulled = false; sc.add(R.diyas);
}
function drawMandala(g, w, ca, cb) {
    const c = w / 2, u = w / 2.9;
    g.lineCap = 'round';
    const wavy = (r0, amp, n, lw, col) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); for (let i = 0; i <= 360; i++) { const a = i / 360 * TAU, r = (r0 + amp * Math.pow(Math.abs(Math.cos(a * n / 2)), 2)) * u; i ? g.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r) : g.moveTo(c + Math.cos(a) * r, c + Math.sin(a) * r); } g.stroke(); };
    wavy(0.5, 0.07, 16, w / 260, ca); wavy(0.78, 0.05, 24, w / 330, ca);
    g.strokeStyle = ca; g.lineWidth = w / 420; g.beginPath(); g.arc(c, c, 1.05 * u, 0, TAU); g.stroke();
    g.fillStyle = ca; for (let i = 0; i < 64; i++) { const a = i / 64 * TAU; g.beginPath(); g.arc(c + Math.cos(a) * 1.17 * u, c + Math.sin(a) * 1.17 * u, w / 300, 0, TAU); g.fill(); }
    g.strokeStyle = cb; g.lineWidth = w / 380;
    for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.beginPath(); g.ellipse(c + Math.cos(a) * 0.64 * u, c + Math.sin(a) * 0.64 * u, 0.075 * u, 0.03 * u, a, 0, TAU); g.stroke(); }
    g.fillStyle = cb; for (let i = 0; i < 48; i++) { const a = (i + 0.5) / 48 * TAU; g.beginPath(); g.arc(c + Math.cos(a) * 0.92 * u, c + Math.sin(a) * 0.92 * u, w / 420, 0, TAU); g.fill(); }
}
function bakeBgLo(level) {
  const pal = paletteOf(level), c = R.bgLoTex.image, g = c.getContext('2d'), w = c.width, h = w / 2, u = w / 2.9;
  g.fillStyle = pal.bg0; g.fillRect(0, 0, w, w);
  const gr = g.createRadialGradient(h, h, 0, h, h, 1.25 * u); gr.addColorStop(0, pal.bg1); gr.addColorStop(1, pal.bg0);
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
  g.globalAlpha = 0.26; drawMandala(g, w, pal.line, pal.line); g.globalAlpha = 1;
  R.bgLoTex.needsUpdate = true; R.bgLoLevel = level;
}
function buildEffects() {
  const sc = R.scene;
  R.glow = makePool(700, PT_GLOW_FS, THREE.AdditiveBlending);
  R.powderP = makePool(1100, PT_POWDER_FS, THREE.NormalBlending);
  R.powderP.pts.renderOrder = 3; R.glow.pts.renderOrder = 4;
  sc.add(R.powderP.pts, R.glow.pts);
  R.sweeps = [];
  for (let i = 0; i < 4; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(10.6, 1.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 2.1, 1.7), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
    m.position.z = 0.45; m.renderOrder = 5; sc.add(m); R.sweeps.push(m);
  }
  R.trailU = { uCol: { value: new THREE.Color() }, uA: { value: 0 } };
  R.trail = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({ vertexShader: TRAIL_VS, fragmentShader: TRAIL_FS, uniforms: R.trailU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  R.trail.renderOrder = 5; R.trail.position.z = 0.3; sc.add(R.trail);
  const ring = (col) => { const m = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 96), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })); m.renderOrder = 6; m.position.z = 0.5; sc.add(m); return m; };
  R.shock = ring(new THREE.Color(3, 2.4, 1.4)); R.lvRing = ring(new THREE.Color(1.6, 1.6, 1.6));
}
function buildPost(a) {
  try {
    R.post = createPost(R.renderer, {
      arc: a, soft: R.soft, intro: { dist: 46, back: 0.55, up: 0.3, yaw: 0.5, dur: 1.9 }, results: { yaw: 0.14, rise: 0.05, speed: 0.22 },
      target: (v) => v.copy(R.base.tgt),
      look: { bloom: 0.6, bloomWide: 0.42, threshold: 0.6, knee: 0.24, vignette: 0.38, grain: 0.03, sat: 1.08, contrast: 1.05, lift: [0.01, 0.006, 0.02], gain: [1.02, 0.99, 0.98] },
    });
  } catch (e) { R.post = null; }
}
// The environment the bevels and brass reflect: warm lamps above, a cool rim to one side.
function buildEnv() {
  if (R.env || (R.soft && !R.lock) || R.lost) return;
  const tiles = !!R.tiles;
  try {
    const es = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 24, 12), new THREE.MeshBasicMaterial({ side: THREE.BackSide, color: '#1a1420' })); es.add(sky);
    const panel = (col, i, x, y, z, w, h) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(i), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    panel('#ffd8a0', 6, -4, 6, 5, 5, 3); panel('#ffb070', 3, 5, 3, 6, 3, 4); panel('#8fa8ff', 2.5, 7, -2, -2, 3, 5); panel('#ffffff', 2, 0, 9, 0, 6, 2); panel('#ff9050', 1.5, -6, -5, 4, 4, 2);
    const pm = new THREE.PMREMGenerator(R.renderer);
    R.env = pm.fromScene(es, 0.03).texture;
    pm.dispose();
    es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
    if (tiles && R.applied) applyTier();
  } catch (e) { R.env = null; }
}

/* ------------------------------------------------------------ quality and layout */
function applyTier() {
  if (!R || !R.tiles) return;
  const t = TIERS[R.q], r = R.renderer;
  r.shadowMap.enabled = t.shadow; R.key.castShadow = t.shadow;
  if (R.key.shadow.mapSize.x !== t.map) { R.key.shadow.mapSize.set(t.map, t.map); if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; } }
  const geo = t.hi && R.geoHi ? R.geoHi : R.geoLo;
  if (R.tiles.geometry !== geo) R.tiles.geometry = geo;
  const lo = R.q === 0;
  R.tiles.material = lo ? R.tileMatLo : R.tileMat; R.ghost.material = lo ? R.ghostMatLo : R.ghostMat;
  R.plate3.material = lo ? R.plateMatLo : R.plateMat; R.panels.material = lo ? R.panelMatLo : R.panelMat;
  R.frame.material = R.rims.material = lo ? R.brassLo : R.brass;
  R.bg.material = lo ? R.bgMatLo : R.bgMat;
  R.scene.environment = t.env && R.env ? R.env : null;
  const env = !!R.scene.environment;
  R.brass.metalness = env ? 0.9 : 0.55; R.brass.roughness = env ? 0.3 : 0.42; R.brass.color.set(env ? '#d4a552' : '#c99a4a');
  R.hemi.intensity = env ? 0.5 : 0.95;
  R.diyas.geometry.setDrawRange(0, t.diyas);
  R.density = t.fx;
  if (R.post) R.post.setQuality(R.q, R.lock);
  resize3D(ARC);
}
function setQuality(q) {
  if (!R) return;
  q = clamp(q | 0, 0, 3);
  if (q === R.q && R.applied) return;
  R.q = q; R.applied = true; applyTier();
  if (READY && TIERS[q].env && !R.env && (!R.soft || R.lock)) buildEnv();
}
function resize3D(a) {
  if (!R || !a || !R.tiles) return;
  const t = TIERS[R.q];
  const pr = Math.min(a.dpr * t.px, Math.sqrt(t.budget / Math.max(1, a.w * a.h)));
  R.renderer.setPixelRatio(Math.max(0.35, pr));
  R.renderer.setSize(a.w, a.h, false);
  fitCamera(a);
}
// Frame the board, the hold and next panels, and leave room for the HUD strip and the touch controls.
function fitCamera(a) {
  const cam = R.camera, U = layoutUnits(a.w, a.h), M = margins(a, U);
  const key = (U.tall ? 't' : U.portrait ? 'p' : 'l');
  if (key !== R.layoutKey) { R.layoutKey = key; buildPanels(U); }
  R.U = U;
  cam.fov = U.portrait ? 30 : 28; cam.aspect = a.w / a.h; cam.updateProjectionMatrix();
  const tanH = Math.tan(cam.fov * Math.PI / 360);
  const bw = U.xmax - U.xmin, bh = U.ymax - U.ymin, aw = Math.max(40, a.w - M.left - M.right), ah = Math.max(40, a.h - M.top - M.bottom);
  const k = Math.max(bw / aw, bh / ah) * 1.035;
  const D = (a.h * k) / (2 * tanH);
  const rcx = M.left + aw / 2, rcy = M.top + ah / 2;
  const tx = (U.xmin + U.xmax) / 2 + (a.w / 2 - rcx) * k, ty = (U.ymin + U.ymax) / 2 + (rcy - a.h / 2) * k;
  const tilt = 0.06;
  R.base.tgt.set(tx, ty, 0); R.base.D = D;
  R.base.pos.set(tx, ty + Math.sin(tilt) * D, Math.cos(tilt) * D);
  // backdrop: a plane far behind, big enough to fill the view
  // three times the view, so the establishing swing never shows its edge
  const bz = -36, dist = D + 36, vh0 = 2 * dist * tanH, vw0 = vh0 * cam.aspect, vh = vh0 * 3, vw = vw0 * 3;
  R.bg.position.set(tx, ty, bz); R.bg.scale.set(vw, vh, 1);
  const m = Math.min(vw0, vh0) * 1.25 * 0.62; R.bgU.uSz.value.set(vw / m, vh / m); R.bgU.uC.value.set(-tx / vw, -ty / vh);
  const rx = vw / m * 2 / 2.9, ry = vh / m * 2 / 2.9;
  R.bgLoTex.repeat.set(rx, ry); R.bgLoTex.offset.set(0.5 - (0.5 - tx / vw) * rx, 0.5 - (0.5 - ty / vh) * ry);
  R.diyaU.uY.value = ty;
  const scale = a.h * R.renderer.getPixelRatio() * 0.5 / tanH;
  R.glow.mat.uniforms.uScale.value = scale; R.powderP.mat.uniforms.uScale.value = scale; R.diyaU.uScale.value = scale;
  // the HUD's anchors, projected once from the resting camera
  cam.position.copy(R.base.pos); cam.lookAt(R.base.tgt); cam.updateMatrixWorld();
  const L = LAYOUT, P = (x, y, out) => { R.v1.set(x, y, 0.3).project(cam); out.x = (R.v1.x * 0.5 + 0.5) * a.w; out.y = (0.5 - R.v1.y * 0.5) * a.h; };
  const p = { x: 0, y: 0 }, q = { x: 0, y: 0 };
  P(-5, 10, p); P(5, -10, q); L.bx0 = p.x; L.by0 = p.y; L.bx1 = q.x; L.by1 = q.y; L.cell = (q.x - p.x) / 10; L.portrait = U.portrait; L.tall = U.tall;
  P(0, U.ymax, p); L.ty = p.y;
  [[U.hold, L.hold], [U.next, L.next]].forEach(([rc, o]) => { P(rc.cx - rc.w / 2, rc.cy + rc.h / 2 + 0.15, p); P(rc.cx + rc.w / 2, rc.cy - rc.h / 2, q); o.x = p.x; o.y = p.y; o.w = q.x - p.x; o.h = q.y - p.y; });
}
const LAYOUT = { cell: 0, bx0: 0, by0: 0, bx1: 0, by1: 0, ty: 0, portrait: true, tall: false, hold: { x: 0, y: 0, w: 0, h: 0 }, next: { x: 0, y: 0, w: 0, h: 0 } };

/* ------------------------------------------------------------ per frame */
let NI = 0;
function put(mesh, i, type, x, y, z, s, sz, rz, glow, white, grey, motif) {
  const e = mesh.instanceMatrix.array, o = i * 16;
  const c = Math.cos(rz) * s, sn = Math.sin(rz) * s;
  e[o] = c; e[o + 1] = sn; e[o + 2] = 0; e[o + 3] = 0;
  e[o + 4] = -sn; e[o + 5] = c; e[o + 6] = 0; e[o + 7] = 0;
  e[o + 8] = 0; e[o + 9] = 0; e[o + 10] = s * sz; e[o + 11] = 0;
  e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
  const col = R.TCOL[type], ca = mesh.instanceColor.array;
  ca[i * 3] = col.r; ca[i * 3 + 1] = col.g; ca[i * 3 + 2] = col.b;
  const f = mesh.geometry.attributes.aFx.array;
  f[i * 4] = glow; f[i * 4 + 1] = white; f[i * 4 + 2] = grey; f[i * 4 + 3] = motif;
}
function miniPiece(type, cx, cy, s, glow, rz) {
  const sh = SHAPES[type][0];
  let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
  for (let i = 0; i < 8; i += 2) { x0 = Math.min(x0, sh[i]); x1 = Math.max(x1, sh[i]); y0 = Math.min(y0, sh[i + 1]); y1 = Math.max(y1, sh[i + 1]); }
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
  for (let i = 0; i < 8; i += 2) put(R.tiles, NI++, type, cx + (sh[i] - mx) * s, cy + (sh[i + 1] - my) * s, 0, s, 1, rz || 0, glow, 0, 0, type);
}
const _col = { r: 0, g: 0, b: 0 };
const SLOT = { x: 0, y: 0, s: 1 };
function burst(x, y, type, n, big) {
  const c = R.TCOL[type];
  for (let i = 0; i < n; i++) {
    const an = Math.random() * TAU, sp = (big ? 3.5 : 2) + Math.random() * (big ? 7 : 4.5);
    const k = 0.7 + Math.random() * 0.6; _col.r = c.r * k; _col.g = c.g * k; _col.b = c.b * k;
    emit(R.powderP, x + (Math.random() - 0.5) * 0.7, y + (Math.random() - 0.5) * 0.7, 0.2 + Math.random() * 0.5, Math.cos(an) * sp, Math.sin(an) * sp + 2.5, 1 + Math.random() * 3.2, 0.9 + Math.random() * 1.2, 0.45 + Math.random() * 0.55, 0.9 + Math.random() * 1.2, _col, 0.85, 2.4, 3.5, null, 0);
  }
  for (let i = 0; i < Math.ceil(n * 0.6); i++) {
    const an = Math.random() * TAU, sp = 4 + Math.random() * 8;
    _col.r = c.r * 2.4 + 0.6; _col.g = c.g * 2.4 + 0.5; _col.b = c.b * 2.4 + 0.4;
    emit(R.glow, x, y, 0.4, Math.cos(an) * sp, Math.sin(an) * sp + 2, (Math.random() - 0.5) * 3, 0.35 + Math.random() * 0.4, 0.22 + Math.random() * 0.18, 0, _col, 1, 3, 9, null, 0);
  }
}
const PETAL = ['#ffb21f', '#ff7a1a', '#ffd34a', '#ff4fb0', '#fff1d6'].map((h) => ({ r: 0, g: 0, b: 0, h }));
function petals(x, y, n, sp0) {
  for (let i = 0; i < n; i++) {
    const p = PETAL[i % PETAL.length];
    if (!p.ok) { const c = new THREE.Color(p.h); p.r = c.r; p.g = c.g; p.b = c.b; p.ok = true; }
    const an = Math.random() * TAU, sp = sp0 * (0.4 + Math.random() * 0.8);
    emit(R.powderP, x, y, 0.8 + Math.random(), Math.cos(an) * sp, Math.sin(an) * sp + sp0 * 0.6, (Math.random() - 0.2) * 4, 1.8 + Math.random() * 1.6, 0.42, 0, p, 1, 1.2, 4.5, Math.random() * TAU, (Math.random() - 0.5) * 10);
  }
}
function palMix(out, ha, hb, k) { R.pal0.set(ha); R.pal1.set(hb); return out.copy(R.pal0).lerp(R.pal1, k); }
function glLost() { if (!READY || !R || R.lost) return true; try { return R.renderer.getContext().isContextLost(); } catch (e) { return true; } }
let LAST2D = 0;
function frame3D(a, G, dt) {
  const rm = a.reducedMotion, cam = R.camera;
  R.time += dt;
  animTick(A, dt, G);
  // camera: resting framing, a slow breath, the lock dip, a punch on a Chauka, and the shell's shake
  const b = R.base, br = rm ? 0 : 1;
  cam.position.copy(b.pos);
  cam.position.x += (Math.sin(R.time * 0.29) * 0.22 + Math.sin(R.time * 0.13) * 0.12) * br;
  cam.position.y += (Math.sin(R.time * 0.21 + 1) * 0.16) * br + (rm ? 0 : A.dip * 0.09);
  cam.position.z += (Math.sin(R.time * 0.17) * 0.25 - A.punch * A.punch * b.D * 0.035) * br;
  R.v2.copy(b.tgt);
  if (G.has && !rm) R.v2.x += (A.px - 3.5) * 0.02;
  R.v2.y += rm ? 0 : A.dip * 0.05;
  cam.lookAt(R.v2);
  if (!rm) { cam.rotateZ(Math.sin(R.time * 0.11) * 0.0035); cam.position.x += a.shakeX * 0.012; cam.position.y -= a.shakeY * 0.012; }
  // palette, blended over a second when the level changes
  const pa = paletteOf(A.palFrom || G.level), pb = paletteOf(A.palTo || G.level), k = A.levelK * A.levelK * (3 - 2 * A.levelK);
  palMix(R.bgU.uBg0.value, pa.bg0, pb.bg0, k); palMix(R.bgU.uBg1.value, pa.bg1, pb.bg1, k); palMix(R.bgU.uLine.value, pa.line, pb.line, k);
  palMix(R.palC[0], pa.inlay, pb.inlay, k); R.inlayMat.color.copy(R.palC[0]).multiplyScalar(2.2 + Math.sin(R.time * 2) * 0.25 + (1 - A.levelK) * 3);
  R.plateMat.emissive.copy(R.palC[0]); R.plateMat.emissiveIntensity = 0.2 + (1 - A.levelK) * 0.5;
  palMix(R.diyaU.uCol.value, pa.diya, pb.diya, k); palMix(R.palC[1], pa.sky, pb.sky, k); R.hemi.color.copy(R.palC[1]);
  palMix(R.palC[2], pa.bg0, pb.bg0, k); R.scene.fog.color.copy(R.palC[2]);
  R.bgU.uEnergy.value = clamp((G.level - 1) / 14, 0, 1);
  if (R.bg.material === R.bgMatLo && R.bgLoLevel !== (A.palTo || G.level)) bakeBgLo(A.palTo || G.level);
  if (!rm) R.bgU.uRot.value += dt * (0.025 + R.bgU.uEnergy.value * 0.03);
  R.diyaU.uTime.value = R.time;
  // tiles
  NI = 0;
  const T0 = R.tiles;
  for (let y = 0; y < 22; y++) for (let x = 0; x < COLS; x++) {
    const v = G.board[y * COLS + x]; if (!v) continue;
    const T = boardTile(A, G, x, y, rm);
    if (T.burstNow) burst(T.x - 4.5, T.y - 9.5, v - 1, G.clearN === 4 ? 9 : 6, G.clearN === 4);
    if (T.hide || NI >= 300) continue;
    put(T0, NI++, v - 1, T.x - 4.5, T.y - 9.5, T.z, T.s, T.sz, T.rz, T.glow, T.white, T.grey, v - 1);
  }
  let pl = 0;
  if (G.has && G.phase === 'live') {
    const c = G.cur, sh = SHAPES[c.t][c.r], n = SIZE[c.t], cs = Math.cos(A.rot), sn = Math.sin(A.rot), ps = 0.75 + 0.25 * A.pop, glow = 1.05 + A.glow * 0.7;
    const pcx = A.px + n / 2 - 5, pcy = A.py + n / 2 - 10;
    for (let i = 0; i < 8; i += 2) {
      const lx = (sh[i] + 0.5 - n / 2) * ps, ly = (sh[i + 1] + 0.5 - n / 2) * ps;
      put(T0, NI++, c.t, pcx + lx * cs - ly * sn, pcy + lx * sn + ly * cs, 0.08, ps, 1, A.rot, glow, A.glow * 0.12, 0, c.t);
    }
    R.pieceLight.position.set(pcx, pcy, 1.7); R.pieceLight.color.copy(R.TCOL[c.t]); pl = 9;
    // ghost
    let gi = 0;
    if (ghostOn() && G.ghostY < c.y) for (let i = 0; i < 8; i += 2) put(R.ghost, gi++, c.t, c.x + sh[i] - 4.5, G.ghostY + sh[i + 1] - 9.5, -0.02, 0.96, 0.55, 0, 1.1, 0, 0, 7);
    R.ghost.count = gi;
  } else R.ghost.count = 0;
  R.pieceLight.intensity += (pl - R.pieceLight.intensity) * Math.min(1, dt * 12);
  const U = R.U;
  if (G.hold >= 0) miniPiece(G.hold, U.hold.cx, U.hold.cy - (U.tall ? 0.12 : 0), U.holdS * (1 + A.holdPop * 0.25), G.holdUsed ? 0.3 : 0.95, rm ? 0 : A.holdPop * 0.6);
  for (let i = 0; i < 5; i++) {
    const t = G.queue[i]; if (t == null) break;
    slotAt(U, i, rm ? 0 : A.nextShift, SLOT);
    miniPiece(t, SLOT.x, SLOT.y, SLOT.s, i === 0 ? 1.05 : 0.75, 0);
  }
  T0.count = NI;
  T0.instanceMatrix.needsUpdate = true; T0.instanceColor.needsUpdate = true; T0.geometry.attributes.aFx.needsUpdate = true;
  if (R.ghost.count) { R.ghost.instanceMatrix.needsUpdate = true; R.ghost.instanceColor.needsUpdate = true; R.ghost.geometry.attributes.aFx.needsUpdate = true; }
  // hard drop trail
  if (A.trailT < 0.3) {
    const y0 = A.trailY0 + 3 - 9.5, y1 = A.trailY1 - 10, h = Math.max(0.5, y0 - y1);
    R.trail.visible = true; R.trail.scale.set(A.trailX1 - A.trailX0 + 1, h, 1); R.trail.position.set((A.trailX0 + A.trailX1) / 2 - 4.5, y1 + h / 2, 0.3);
    const k = 1 - A.trailT / 0.3; R.trailU.uCol.value.copy(R.TCOL[A.trailType]).multiplyScalar(0.55); R.trailU.uA.value = k * k * k;
  } else R.trail.visible = false;
  for (let i = 0; i < 4; i++) {
    const m = R.sweeps[i], on = i < A.sweepN && A.sweep[i] < 0.5;
    m.visible = on;
    if (on) { const t = A.sweep[i] / 0.5; m.position.set(0, A.sweepRow[i] - 9.5, 0.45); m.material.opacity = (1 - t) * (rm ? 0.4 : 0.9); m.scale.set(1 + t * 0.15, 1 - t * 0.6, 1); }
  }
  if (A.shockT < 0.9 && !rm) { const t = A.shockT / 0.9, r = 1.5 + t * 16; R.shock.visible = true; R.shock.scale.set(r, r, 1); R.shock.position.set(0, -4, 0.5); R.shock.material.opacity = (1 - t) * (1 - t); } else R.shock.visible = false;
  if (A.ringT < 1.1 && !rm) { const t = A.ringT / 1.1, r = 2 + t * 22; R.lvRing.visible = true; R.lvRing.scale.set(r, r, 1); R.lvRing.position.set(0, 0, -0.1); R.lvRing.material.color.copy(R.palC[0]).multiplyScalar(2); R.lvRing.material.opacity = (1 - t) * 0.8; } else R.lvRing.visible = false;
  stepPool(R.powderP, dt); stepPool(R.glow, dt);
  // embers rising off the board now and then, more at higher levels
  if (!rm && R.density > 0 && Math.random() < dt * (2 + G.level * 0.4)) {
    R.lampTint.copy(R.palC[0]).multiplyScalar(1.6);
    emit(R.glow, (Math.random() - 0.5) * 10, -10 + Math.random() * 4, 0.6, (Math.random() - 0.5) * 0.4, 1 + Math.random() * 1.5, 0, 2.5 + Math.random() * 2, 0.16, 0, R.lampTint, 0.7, 0.3, -0.2, null, 0);
  }
}
function measure(dt) {
  if (R.warm < 90) { R.warm++; return; }
  R.fT += dt; R.fN++;
  if (R.fT >= 1.5) {
    R.fps = R.fN / R.fT; R.fT = 0; R.fN = 0;
    if (!R.lock && R.fps < 40 && R.q > 0) { setQuality(R.fps < 22 ? Math.max(0, R.q - 2) : R.q - 1); R.warm = 30; }
  }
}

/* ------------------------------------------------------------ the view the core talks to */
let readyWaiters = [];
const view = {
  name: '3d', three: true, layout: V2.layout,
  whenReady: () => (READY ? Promise.resolve() : new Promise((res) => { readyWaiters.push(res); })),
  init(a) {
    ARC = a;
    V2.init(a);
    view.layout = V2.layout;
    // three.js and the post pass load after the menu is up; the scene is built in slices.
    setTimeout(() => {
      MARK('import');
      Promise.all([import('/games/vendor/three/three.module.min.js'), import('/games/shared/fx3d.js')]).then((m) => {
        MARK('imported');
        THREE = m[0]; createPost = m[1].createFX;
        build(a);
      }).catch((e) => { console.warn('3D unavailable, staying in 2D', e); });
    }, 0);
    return true;
  },
  resize(a) { V2.resize(a); if (READY) resize3D(a); },
  graphics(level) {
    if (!R) { PENDING_LOCK = level !== 'auto'; PENDING_Q = level === 'sharp' ? 3 : level === 'smooth' ? 1 : null; return; }
    if (level === 'auto') { R.lock = false; if (R.post) R.post.setQuality(R.q, false); return; }
    R.lock = true; setQuality(level === 'sharp' ? 3 : 1);
  },
  newGame(G) {
    Object.assign(A, makeAnim());
    animEvent(A, 'level', { level: G.level, snap: true }, G);
    V2.newGame(G);
    if (R && R.glow) { R.glow.n = 0; R.powderP.n = 0; }
    LAST_G = G;
  },
  event(type, d, G) {
    animEvent(A, type, d, G);
    if (!READY || R.lost) { V2.event(type, d, G); return; }
    const rm = ARC && ARC.reducedMotion;
    if (type === 'drop') {
      const n = clamp((d.y0 - d.y1) * 1.2, 4, 18);
      for (let i = 0; i < n; i++) {
        const x = A.trailX0 - 4.5 + Math.random() * (A.trailX1 - A.trailX0 + 1) - 0.5;
        const c = R.TCOL[d.t]; _col.r = c.r * 2 + 0.5; _col.g = c.g * 2 + 0.5; _col.b = c.b * 2 + 0.5;
        emit(R.glow, x, d.y1 - 9.7, 0.4, (Math.random() - 0.5) * 7, Math.random() * 3.5, Math.random() * 2, 0.35 + Math.random() * 0.25, 0.2, 0, _col, 1, 4, 10, null, 0);
      }
      _col.r = 0.55; _col.g = 0.5; _col.b = 0.48;
      for (let i = 0; i < 6; i++) emit(R.powderP, A.trailX0 - 4.5 + Math.random() * (A.trailX1 - A.trailX0 + 1) - 0.5, d.y1 - 9.9, 0.4, (Math.random() - 0.5) * 3, Math.random() * 1.2, 0.5, 0.7, 0.4, 1.4, _col, 0.35, 3, 0.5, null, 0);
      if (!rm && ARC) ARC.shake = Math.max(ARC.shake || 0, clamp((d.y0 - d.y1) * 0.25, 1, 3.5));
    } else if (type === 'clear') {
      if (!R.post) return;
      if (d.n === 4 || d.allClear) {
        R.post.flash(0.26, '#ffe8c0'); R.post.kick(-4.5);
        if (!rm && ARC) ARC.shake = Math.max(ARC.shake || 0, 7);
        petals(0, d.rows[0] - 8, 90, 9);
      } else if (d.n > 0) { R.post.kick(-0.8 - d.n * 0.6); }
      if (d.tw) { R.post.flash(0.14, '#c48bff'); petals(0, d.n ? d.rows[0] - 9 : 0, 24, 6); }
    } else if (type === 'level') {
      if (!d.snap && R.post) R.post.flash(0.1, '#fff0d0');
    } else if (type === 'end') {
      if (d.kind !== 'topout') { petals(-3, 2, 120, 11); petals(3, 2, 120, 11); }
      else if (R.post) R.post.kick(2);
    } else if (type === 'hold') {
      const U = R.U; _col.r = 1.6; _col.g = 1.4; _col.b = 1.1;
      for (let i = 0; i < 10; i++) emit(R.glow, U.hold.cx + (Math.random() - 0.5) * 2, U.hold.cy + (Math.random() - 0.5) * 1.5, 0.5, (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 3, 1, 0.4, 0.18, 0, _col, 0.8, 3, 0, null, 0);
    }
  },
  render(a, G, ctx) {
    LAST_G = G;
    if (glLost()) {
      // the 2D board stands in while 3D loads, or if the graphics context is lost
      const now = performance.now(), d = LAST2D ? clamp((now - LAST2D) / 1000, 0, 0.05) : 1 / 60; LAST2D = now;
      animTick(A, a.state === 'pause' || frozen() ? 0 : d, G);
      view.layout = V2.layout;
      return V2.render(a, G, ctx);
    }
    LAST2D = 0;
    // the touch controls in use decide how much room the board leaves at the bottom
    if (a.touchStyle !== R.ts || a.touchMode !== R.tm) { R.ts = a.touchStyle; R.tm = a.touchMode; fitCamera(a); }
    view.layout = LAYOUT;
    const now = performance.now(), raw = R.last ? (now - R.last) / 1000 : 1 / 60; R.last = now;
    const dt = a.state === 'pause' || frozen() ? 0 : clamp(raw, 0, 0.05);
    measure(raw);
    if (MARKS.length < 8) MARK('frame');
    const j0 = performance.now();
    frame3D(a, G, dt);
    const j1 = performance.now();
    if (R.post) R.post.render(R.scene, R.camera); else R.renderer.render(R.scene, R.camera);
    const j2 = performance.now();
    R.tJs = R.tJs * 0.9 + (j1 - j0) * 0.1; R.tGl = R.tGl * 0.9 + (j2 - j1) * 0.1;
    return true;
  },
  debug() {
    if (!R || !READY) return { quality: -1, ready: false, build: Math.round(BUILD_MS), steps: STEP_MS.join(','), marks: MARKS.join(' ') };
    const info = R.renderer.info.render;
    return { quality: R.q, fps: Math.round(R.fps), soft: R.soft, post: !!(R.post && R.post.enabled), calls: info.calls, tris: info.triangles, tiles: R.tiles.count, particles: R.powderP.n + R.glow.n, ready: true, js: +R.tJs.toFixed(2), gl: +R.tGl.toFixed(2), env: !!R.scene.environment, build: Math.round(BUILD_MS), steps: STEP_MS.join(','), marks: MARKS.join(' ') };
  },
  dev: {
    quality: (q) => { if (R && READY) { R.lock = true; setQuality(q); } else { PENDING_Q = q; PENDING_LOCK = true; } },
    setQuality: (q) => view.dev.quality(q),
    ready: () => READY,
    // the poster: no establishing swing, so a still frame is the game's own framing
    still: () => { if (R && R.post) R.post.intro(0.001); },
    stage: () => R,
  },
};

// The scene, built a slice at a time so no single task holds the main thread.
function build(a) {
  const steps = [
    () => buildRenderer(a),
    () => buildTextures(),
    () => buildAtlas(0, 3), () => buildAtlas(3, 6), () => buildAtlas(6, 8),
    () => buildTiles(),
    () => buildFrame(),
    () => buildBackdrop(),
    () => buildEffects(),
    () => buildPost(a),
    () => { if (!R.soft && TIERS[PENDING_Q != null ? PENDING_Q : R.q].env) buildEnv(); },
    () => {
      if (PENDING_Q != null) { R.lock = PENDING_LOCK; R.q = PENDING_Q; }
      R.applied = false; setQuality(R.q);
      if (R.post) R.post.setQuality(R.q, R.lock);
      R.camera.position.copy(R.base.pos); R.camera.lookAt(R.base.tgt);
    },
  ];
  let i = 0;
  const t0 = performance.now();
  const next = () => {
    const s0 = performance.now();
    try {
      while (i < steps.length) {
        const st0 = performance.now();
        const ok = steps[i++]();
        STEP_MS.push(Math.round(performance.now() - st0));
        if (ok === false) { console.warn('3D could not start; the 2D board plays on'); return; }
        if (performance.now() - s0 > 8) break;
      }
    } catch (e) { console.warn('3D build stopped; the 2D board plays on', e); R = null; return; }
    BUILD_MS += performance.now() - s0;
    if (i < steps.length) { setTimeout(next, 0); return; }
    compile(a, t0);
  };
  next();
}
// Compile every shader before the 3D board shows: the tiles in both tiers, shadows, every effect.
function compile(a, t0) {
  MARK('compile');
  const r = R.renderer, sc = R.scene;
  const hidden = [];
  sc.traverse((o) => { if (!o.visible) { hidden.push(o); o.visible = true; } });
  const done = () => {
    hidden.forEach((o) => { o.visible = false; });
    if (!R) return;
    READY = true; MARK('ready');
    readyWaiters.forEach((f) => f()); readyWaiters = [];
    R.warm = 0; R.last = 0;
    if (LAST_G) { animEvent(A, 'level', { level: LAST_G.level, snap: true }, LAST_G); }
    if (typeof a.fade === 'function' && a.state !== 'play') a.fade(200);
  };
  // The light family too when starting high, so a later drop to it never compiles mid round.
  const swapLo = (on) => {
    R.tiles.material = on ? R.tileMatLo : R.tileMat; R.ghost.material = on ? R.ghostMatLo : R.ghostMat;
    R.plate3.material = on ? R.plateMatLo : R.plateMat; R.panels.material = on ? R.panelMatLo : R.panelMat; R.frame.material = R.rims.material = on ? R.brassLo : R.brass;
    R.bg.material = on ? R.bgMatLo : R.bgMat;
  };
  const both = R.q > 0;
  try {
    if (r.compileAsync) {
      r.compileAsync(sc, R.camera).then(() => {
        if (!both) return done();
        swapLo(true);
        return r.compileAsync(sc, R.camera).then(() => { swapLo(false); done(); });
      }).catch(() => { swapLo(R.q === 0); done(); });
    } else { r.compile(sc, R.camera); setTimeout(done, 0); }
  } catch (e) { done(); }
}

boot(view);
