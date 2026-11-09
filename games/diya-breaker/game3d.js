import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX } from '/games/shared/fx3d.js';
import { boot, events, COLS, ROWS, HALF, TOPY, PAD_Y, PAD_H, BALL_R, K_GLASS, K_METAL, K_GOLD, K_FIRE, K_MOVE, POWERS, clamp, lerp, TAU, smooth01 } from '/games/diya-breaker/core.js';

/*
 * Diya Breaker in 3D. The rules live in core.js; this file builds the
 * courtyard, the bricks, the paddle and the lamp-lit ball, and films it.
 *
 * The board lies on a polished stone floor that really reflects: a second,
 * smaller render from a mirrored camera is projected onto the floor. Bricks
 * are bevelled clay, glass and brass instances whose edges glow; the ball
 * carries its own light across the board. Everything the game will ever
 * draw is built and its shaders compiled before play, a little each frame
 * while the menu is already up, so nothing compiles mid-game.
 */

/* ------------------------------------------------------------ helpers */
const zOf = (y) => 8.6 - y;
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _c = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const now = () => performance.now();
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const ALL_TEX = [];
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  ALL_TEX.push(t);
  return t;
}
// Bake a primitive into one merged mesh: placed, one vertex colour, an emissive weight.
function prep(geo, hex, pos, rot, scl, ex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  ['uv', 'uv1'].forEach((k) => { if (g.attributes[k]) g.deleteAttribute(k); });
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  if (scl == null) _s.set(1, 1, 1); else if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
  _v1.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  _m.compose(_v1, _q, _s); g.applyMatrix4(_m);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), e = new Float32Array(n);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; e[i] = ex || 0; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEx', new THREE.BufferAttribute(e, 1));
  return g;
}
function merge(list) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), ex = new Float32Array(n);
  let o = 0;
  list.forEach((g) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); ex.set(g.attributes.aEx.array, o); o += g.attributes.position.count; g.dispose(); });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aEx', new THREE.BufferAttribute(ex, 1));
  out.computeBoundingSphere();
  return out;
}
const box = (w, h, d, hex, pos, rot, ex) => prep(new THREE.BoxGeometry(w, h, d), hex, pos, rot, null, ex);
const cyl = (rt, rb, h, seg, hex, pos, rot, ex) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), hex, pos, rot, null, ex);
const sph = (r, hex, pos, scl, ex, ws, hs) => prep(new THREE.SphereGeometry(r, ws || 14, hs || 10), hex, pos, null, scl, ex);
const cone = (r, h, seg, hex, pos, rot, ex) => prep(new THREE.ConeGeometry(r, h, seg), hex, pos, rot, null, ex);
const torus = (r, t, hex, pos, rot, ex, arc, scl) => prep(new THREE.TorusGeometry(r, t, 6, 20, arc || TAU), hex, pos, rot, scl || null, ex);
// vertex colour + aEx glow, for every merged prop
function propMat(o) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.6, metalness: 0.1 }, o || {}));
  m.userData.glow = { value: 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGlow = m.userData.glow;
    sh.vertexShader = 'attribute float aEx;\nvarying float vEx;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vEx = aEx;');
    sh.fragmentShader = 'uniform float uGlow;\nvarying float vEx;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * vEx * uGlow;');
  };
  return m;
}

/* ------------------------------------------------------------ looks, one per act */
const LOOKS = [
  { name: 'dusk', top: '#1d1433', mid: '#7a3550', hor: '#f0874a', sun: '#ffcf8a', sunDir: [-0.35, 0.16, -1], stars: 0.15, clouds: 0.5,
    hemiSky: '#ffd6b8', hemiGround: '#4a2c1c', hemiI: 1.25, key: '#ffdcb4', keyI: 3.2, keyPos: [-9, 16, 6], fill: '#9a8ae8', fillI: 0.6,
    fog: '#4a2a3a', fogD: 0.016, floor: '#4a382e', court: '#5a4232', refl: 0.9, rough: 0.28, wall: '#c99a6a', inlay: '#ffb04a', glow: '#ffb24a', exposure: 1.12, rain: 0, lanterns: 0.35, bg: 0.4 },
  { name: 'monsoon', top: '#0f1a26', mid: '#2f4a5c', hor: '#8fb2b8', sun: '#cfe4ff', sunDir: [0.4, 0.3, -1], stars: 0, clouds: 1,
    hemiSky: '#c4dcff', hemiGround: '#24343a', hemiI: 1.3, key: '#dceaff', keyI: 2.8, keyPos: [8, 15, 5], fill: '#ffb070', fillI: 0.55,
    fog: '#2a3e48', fogD: 0.019, floor: '#33403f', court: '#3a4a4c', refl: 1.15, rough: 0.1, wall: '#a39f92', inlay: '#5fe0ff', glow: '#5fd8ff', exposure: 1.15, rain: 1, lanterns: 0.25, bg: 0.25 },
  { name: 'night', top: '#04040e', mid: '#140f33', hor: '#3c2552', sun: '#c8d0ff', sunDir: [0.25, 0.45, -1], stars: 1, clouds: 0.15,
    hemiSky: '#8a88e0', hemiGround: '#2a1828', hemiI: 1.1, key: '#c0caff', keyI: 2.2, keyPos: [-7, 16, 4], fill: '#ff9a50', fillI: 0.8,
    fog: '#120c22', fogD: 0.015, floor: '#2c2436', court: '#33283a', refl: 1.0, rough: 0.16, wall: '#94809a', inlay: '#ff6ad0', glow: '#ff7ad8', exposure: 1.18, rain: 0, lanterns: 1, bg: 1 }
];

const SKY_VS = 'varying vec3 vDir;\nvoid main(){ vDir = normalize(position); vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; gl_Position.z = gl_Position.w; }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uSun; uniform vec3 uSunDir; uniform float uStars; uniform float uClouds; uniform float uTime; uniform float uFlash;',
  'varying vec3 vDir;',
  'float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }',
  'float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y); }',
  'void main(){',
  ' vec3 d = normalize(vDir); float y = d.y;',
  ' vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.22, y)); c = mix(c, uTop, smoothstep(0.18, 0.75, y));',
  ' float s = max(dot(d, normalize(uSunDir)), 0.0); c += uSun * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35 + pow(s, 3.0) * 0.12);',
  ' vec2 sp = d.xz / max(0.12, d.y + 0.25);',
  ' float cl = n2(sp * 0.9 + vec2(uTime * 0.01, 0.0)) * 0.6 + n2(sp * 2.3 - vec2(uTime * 0.02, 0.0)) * 0.4;',
  ' c = mix(c, mix(uMid, uHor, 0.5) * 1.15, smoothstep(0.45, 0.85, cl) * uClouds * smoothstep(0.0, 0.25, y) * 0.55);',
  ' vec2 g = floor(d.xz / (d.y + 0.6) * 160.0); float st = step(0.996, h21(g)) * smoothstep(0.1, 0.4, y);',
  ' c += vec3(st) * uStars * (0.6 + 0.4 * sin(uTime * 3.0 + h21(g + 3.1) * 40.0));',
  ' c += uFlash * vec3(0.9, 0.95, 1.0) * 0.6;',
  ' gl_FragColor = vec4(c, 1.0);',
  ' #include <tonemapping_fragment>',
  ' #include <colorspace_fragment>',
  '}'
].join('\n');

const PTS_VS = [
  'attribute float aSize; attribute float aAlpha; attribute vec3 aCol; uniform float uScale;',
  'varying vec3 vCol; varying float vA;',
  'void main(){ vCol = aCol; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.5, -mv.z); gl_Position = projectionMatrix * mv; }'
].join('\n');
const PTS_FS_ADD = [
  'varying vec3 vCol; varying float vA;',
  'void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; float a = pow(1.0 - d * 2.0, 1.8) * vA; gl_FragColor = vec4(vCol * a, a);',
  ' #include <tonemapping_fragment>',
  ' #include <colorspace_fragment>',
  '}'
].join('\n');
const PTS_FS_SOFT = [
  'varying vec3 vCol; varying float vA;',
  'void main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); if (d > 0.5) discard; float a = smoothstep(0.5, 0.1, d) * vA; gl_FragColor = vec4(vCol, a);',
  ' #include <tonemapping_fragment>',
  ' #include <colorspace_fragment>',
  '}'
].join('\n');

/* ------------------------------------------------------------ quality tiers */
const TIERS = [
  { px: 0.5, budget: 0.17e6, shadow: false, map: 512, refl: 0, post: false, fx: 0.4, decor: false },
  { px: 0.8, budget: 0.9e6, shadow: false, map: 1024, refl: 0, post: true, fx: 0.7, decor: true },
  { px: 1.0, budget: 1.5e6, shadow: true, map: 1024, refl: 0.45, post: true, fx: 1, decor: true },
  { px: 1.0, budget: 2.4e6, shadow: true, map: 2048, refl: 0.6, post: true, fx: 1, decor: true }
];

/* ------------------------------------------------------------ the stage */
const R = {
  ready: false, building: false, tasks: [], compiling: false, renderer: null, scene: null, camera: null, fx: null,
  quality: -1, lockQ: false, fps: 60, qT: 0, qN: 0, qWarm: 0, soft: false, lost: false, lastNow: 0, time: 0,
  look: -1, G: null, levelKey: '', evRead: 0, a: null, failed: false,
  cam: { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), basePos: new THREE.Vector3(), baseTgt: new THREE.Vector3(), fov: 45, baseFov: 45, px: 0, punch: 0, dip: 0, intro: 0, orbit: 0, init: false },
  line: { x0: 0, x1: 1 }, taskLog: [], shakeT: 0, flashSky: 0, bgFw: 3
};
let ARC = null;
const GLINFO = { soft: false };

function setupRenderer(a) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: !GLINFO.soft, powerPreference: 'high-performance' }); } catch (e) { return false; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !GLINFO.soft; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;
  R.renderer = renderer;
  R.soft = GLINFO.soft;
  a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.lost = true; });
  a.canvas.addEventListener('webglcontextrestored', () => { R.lost = false; });
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#4a2a3a', 0.018);
  R.scene = scene;
  R.camera = new THREE.PerspectiveCamera(45, Math.max(0.1, a.w / a.h), 0.3, 400);
  R.baseCam = new THREE.PerspectiveCamera(45, Math.max(0.1, a.w / a.h), 0.3, 400);
  R.hemi = new THREE.HemisphereLight('#ffd0b0', '#3a2418', 0.75); scene.add(R.hemi);
  const key = new THREE.DirectionalLight('#ffd8b0', 2.3);
  key.position.set(-9, 16, 6); key.target.position.set(0, 0, 0.5);
  key.castShadow = !GLINFO.soft; key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera; sc.left = -9.5; sc.right = 9.5; sc.top = 11; sc.bottom = -11; sc.near = 4; sc.far = 40;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.025; key.shadow.radius = 2.5;
  scene.add(key, key.target); R.key = key;
  R.fill = new THREE.DirectionalLight('#8a7ad8', 0.35); R.fill.position.set(8, 6, -10);
  // the ball's own light, and a second for a second ball; both always present so the light count never changes.
  // A software renderer gets only the two main lights: every light is paid for on every pixel there.
  R.ballL = [new THREE.PointLight('#ffc77a', 0, 8, 1.5), new THREE.PointLight('#ffc77a', 0, 6, 1.6)];
  R.flashL = new THREE.PointLight('#ffb050', 0, 10, 1.6);
  if (!GLINFO.soft) { scene.add(R.fill); R.ballL.forEach((l) => { scene.add(l); l.layers.enable(1); }); scene.add(R.flashL); R.flashL.layers.enable(1); }
  [R.hemi, key, R.fill].forEach((l) => l.layers.enable(1));
  return true;
}

/* textures */
let TX = null;
// brick detail, one channel each: R an engraved rosette and border, G cracks, B firecracker stripes
function texMotif() {
  TX.motif = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = 'rgb(255,0,0)'; g.lineWidth = 3;
    g.strokeRect(14, 14, w - 28, h - 28);
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.ellipse(cx + Math.cos(a) * 18, cy + Math.sin(a) * 18, 14, 6, a, 0, TAU); g.stroke(); }
    g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fillStyle = 'rgb(255,0,0)'; g.fill();
    for (let i = 0; i < 4; i++) { const x = i < 2 ? 34 : w - 34, y = i % 2 ? h - 34 : 34; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); }
    const r = rng(5);
    g.strokeStyle = 'rgb(0,255,0)'; g.lineWidth = 2.2;
    for (let k = 0; k < 7; k++) {
      let x = cx + (r() - 0.5) * 30, y = cy + (r() - 0.5) * 20, a = r() * TAU;
      g.beginPath(); g.moveTo(x, y);
      for (let s = 0; s < 9; s++) { a += (r() - 0.5) * 1.1; x += Math.cos(a) * 14; y += Math.sin(a) * 9; g.lineTo(x, y); }
      g.stroke();
    }
    g.fillStyle = 'rgb(0,0,255)';
    for (let x = -h; x < w + h; x += 44) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 18, 0); g.lineTo(x + 18 + h * 0.6, h); g.lineTo(x + h * 0.6, h); g.closePath(); g.fill(); }
  }, { data: true, clamp: true });
}
// the board floor: dark polished stone with a faint inlaid rangoli
function texBoard() {
  TX.board = canvasTex(512, 672, (g, w, h) => {
    const r = rng(9);
    g.fillStyle = '#7f7f7f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) { const v = (r() - 0.5) * 0.16; g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    for (let i = 0; i < 26; i++) { g.strokeStyle = 'rgba(255,255,255,' + (0.03 + r() * 0.05) + ')'; g.lineWidth = 0.6 + r(); g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 70; y += (r() - 0.5) * 70; g.lineTo(x, y); } g.stroke(); }
    const cx = w / 2, cy = h * 0.4;
    g.strokeStyle = 'rgba(255,230,190,0.16)'; g.lineWidth = 2;
    for (let k = 1; k <= 5; k++) { g.beginPath(); g.arc(cx, cy, k * 42, 0, TAU); g.stroke(); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.beginPath(); g.ellipse(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120, 40, 14, a, 0, TAU); g.stroke(); }
    for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; g.beginPath(); g.arc(cx + Math.cos(a) * 205, cy + Math.sin(a) * 205, 6, 0, TAU); g.stroke(); }
    g.strokeStyle = 'rgba(255,230,190,0.12)'; g.lineWidth = 3; g.strokeRect(10, 10, w - 20, h - 20);
    g.lineWidth = 1; g.strokeRect(20, 20, w - 40, h - 40);
  });
}
function texBoardGlow() {
  TX.boardGlow = canvasTex(512, 672, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.4;
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2.5;
    for (let k = 2; k <= 5; k += 3) { g.beginPath(); g.arc(cx, cy, k * 42, 0, TAU); g.stroke(); }
    g.lineWidth = 2;
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.beginPath(); g.ellipse(cx + Math.cos(a) * 120, cy + Math.sin(a) * 120, 40, 14, a, 0, TAU); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; g.beginPath(); g.arc(cx + Math.cos(a) * 205, cy + Math.sin(a) * 205, 3.5, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
    for (let i = 0; i < 9; i++) { const x = 20 + (w - 40) * i / 8; g.beginPath(); g.arc(x, h - 20, 5, 0, TAU); g.stroke(); }
  }, { clamp: true });
}
function texGlow() {
  TX.glow = canvasTex(64, 64, (g, w, h) => {
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { clamp: true });
}
function texCourt() {
  TX.court = canvasTex(256, 256, (g, w, h) => {
    const r = rng(21);
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { const v = 0.85 + r() * 0.3; g.fillStyle = 'rgba(' + (v > 1 ? 255 : 0) + ',' + (v > 1 ? 255 : 0) + ',' + (v > 1 ? 255 : 0) + ',' + Math.abs(v - 1) * 0.6 + ')'; g.fillRect(x * 128, y * 128, 128, 128); }
    for (let i = 0; i < 1800; i++) { const v = (r() - 0.5) * 0.2; g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; g.strokeRect(0, 0, 128, 128); g.strokeRect(128, 0, 128, 128); g.strokeRect(0, 128, 128, 128); g.strokeRect(128, 128, 128, 128);
    g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.beginPath(); g.arc(128, 128, 40, 0, TAU); g.stroke();
  }, { repeat: [10, 10] });
}
function texWall() {
  TX.wall = canvasTex(256, 128, (g, w, h) => {
    const r = rng(33);
    g.fillStyle = '#bfbfbf'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) { const v = (r() - 0.5) * 0.22; g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(0, h * 0.45, w, 4); g.fillRect(0, h * 0.82, w, 3);
    g.strokeStyle = 'rgba(0,0,0,0.22)'; g.lineWidth = 2;
    for (let x = 16; x < w; x += 32) { g.beginPath(); g.arc(x, h * 0.25, 9, 0, TAU); g.stroke(); g.beginPath(); g.moveTo(x, h * 0.55); g.lineTo(x, h * 0.78); g.stroke(); }
  }, { repeat: [1, 1] });
}
function texDrum() {
  TX.drum = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#e8d2a8'; g.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h / 2;
    const gr = g.createRadialGradient(cx, cy, 10, cx, cy, 128); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(120,80,40,0.35)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b8402a'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 100, 0, TAU); g.stroke();
    g.lineWidth = 4;
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.ellipse(cx + Math.cos(a) * 62, cy + Math.sin(a) * 62, 24, 9, a, 0, TAU); g.stroke(); }
    g.fillStyle = '#2a1a12'; g.beginPath(); g.arc(cx, cy, 32, 0, TAU); g.fill();
    g.fillStyle = '#f2b632'; g.beginPath(); g.arc(cx, cy, 14, 0, TAU); g.fill();
  }, { clamp: true });
}

/* reflections: a mirrored camera renders the bright things into a texture the floor reads */
const REFL = { rt: null, cam: new THREE.PerspectiveCamera(), mat: new THREE.Matrix4(), u: null, w: 0, h: 0, on: false };
function reflMaterial(color, map, rough, strength, repeat) {
  const m = new THREE.MeshStandardMaterial({ color, map, roughness: rough, metalness: 0.1 });
  if (repeat) map.repeat.set(repeat[0], repeat[1]);
  m.userData.refl = { value: strength };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tRefl = REFL.u.tex; sh.uniforms.uReflMat = REFL.u.mat; sh.uniforms.uReflOn = REFL.u.on; sh.uniforms.uRefl = m.userData.refl;
    sh.vertexShader = 'uniform mat4 uReflMat;\nvarying vec4 vRefl;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vRefl = uReflMat * modelMatrix * vec4(transformed, 1.0);');
    sh.fragmentShader = 'uniform sampler2D tRefl; uniform float uRefl; uniform float uReflOn; varying vec4 vRefl;\n' + sh.fragmentShader.replace('#include <opaque_fragment>', [
      'if (uReflOn > 0.5) {',
      '  vec2 ruv = vRefl.xy / vRefl.w;',
      '  vec2 o = vec2(0.003, 0.002) * (1.0 + roughnessFactor * 4.0);',
      '  vec3 rc = texture2D(tRefl, ruv).rgb * 0.36 + (texture2D(tRefl, ruv + o).rgb + texture2D(tRefl, ruv - o).rgb + texture2D(tRefl, ruv + vec2(o.x, -o.y)).rgb + texture2D(tRefl, ruv + vec2(-o.x, o.y)).rgb) * 0.16;',
      '  float fr = 0.42 + 0.58 * pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 4.0);',
      '  outgoingLight += rc * uRefl * fr * (1.0 - roughnessFactor * 0.6) * (0.6 + 0.4 * diffuseColor.r * 2.0);',
      '}',
      '#include <opaque_fragment>'
    ].join('\n'));
  };
  return m;
}
function sizeRefl() {
  const t = TIERS[Math.max(0, R.quality)];
  REFL.on = t.refl > 0 && !R.lost;
  // The shell can resize before the floor material that owns these uniforms is built.
  if (!REFL.u) return;
  REFL.u.on.value = REFL.on ? 1 : 0;
  if (!REFL.on) return;
  const gl = R.renderer.getContext();
  const w = Math.max(16, Math.round(gl.drawingBufferWidth * t.refl)), h = Math.max(16, Math.round(gl.drawingBufferHeight * t.refl));
  if (REFL.rt && REFL.w === w && REFL.h === h) return;
  REFL.w = w; REFL.h = h;
  if (REFL.rt) REFL.rt.setSize(w, h);
  else {
    const half = R.renderer.extensions.has('EXT_color_buffer_float') || R.renderer.extensions.has('EXT_color_buffer_half_float');
    REFL.rt = new THREE.WebGLRenderTarget(w, h, { type: half ? THREE.HalfFloatType : THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false, depthBuffer: true });
    REFL.u.tex.value = REFL.rt.texture;
  }
}
const _rp = new THREE.Vector3(), _rt = new THREE.Vector3(), _ru = new THREE.Vector3(), BIAS = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
function renderRefl(cam) {
  if (!REFL.on || !REFL.rt) return;
  cam.updateMatrixWorld();
  _rp.setFromMatrixPosition(cam.matrixWorld);
  _rt.set(0, 0, -1).applyQuaternion(cam.quaternion).add(_rp);
  _ru.set(0, 1, 0).applyQuaternion(cam.quaternion);
  const V = REFL.cam;
  V.position.set(_rp.x, -_rp.y, _rp.z);
  V.up.set(_ru.x, -_ru.y, _ru.z);
  V.lookAt(_rt.x, -_rt.y, _rt.z);
  V.fov = cam.fov; V.aspect = cam.aspect; V.near = cam.near; V.far = cam.far;
  V.projectionMatrix.copy(cam.projectionMatrix);
  V.updateMatrixWorld(); V.matrixWorldInverse.copy(V.matrixWorld).invert();
  REFL.mat.copy(BIAS).multiply(V.projectionMatrix).multiply(V.matrixWorldInverse);
  V.layers.set(1);
  const r = R.renderer, fogWas = R.scene.fog;
  r.setRenderTarget(REFL.rt); r.clear();
  r.render(R.scene, V);
  r.setRenderTarget(null);
  R.scene.fog = fogWas;
}

/* the board, walls and the courtyard */
function buildBoard() {
  const S = R.scene, L = LOOKS[0];
  REFL.u = { tex: { value: null }, mat: { value: REFL.mat }, on: { value: 0 } };
  const bw = HALF * 2 + 0.6, bl = TOPY + 1.8;
  R.boardMat = reflMaterial(L.floor, TX.board, L.rough, L.refl);
  R.boardMat.emissiveMap = TX.boardGlow; R.boardMat.emissive.set(L.glow); R.boardMat.emissiveIntensity = 0.32;
  const board = new THREE.Mesh(new THREE.PlaneGeometry(bw, bl), R.boardMat);
  board.rotation.x = -Math.PI / 2; board.position.set(0, 0, zOf(TOPY / 2 - 0.6));
  board.receiveShadow = true; S.add(board); R.board = board;
  R.courtMat = reflMaterial(L.court, TX.court, 0.45, L.refl * 0.6);
  const court = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), R.courtMat);
  court.rotation.x = -Math.PI / 2; court.position.set(0, -0.01, -6); court.receiveShadow = true; S.add(court); R.court = court;
  // walls of carved sandstone with a glowing inlay on the inner edge
  R.wallMat = new THREE.MeshStandardMaterial({ color: L.wall, map: TX.wall, roughness: 0.75, metalness: 0.05 });
  const zt = zOf(TOPY), zb = zOf(-1.4), len = zb - zt + 0.5;
  const parts = [
    [0.5, 0.62, len, -HALF - 0.25, 0.31, (zt + zb) / 2 - 0.25],
    [0.5, 0.62, len, HALF + 0.25, 0.31, (zt + zb) / 2 - 0.25],
    [HALF * 2 + 1, 0.62, 0.5, 0, 0.31, zt - 0.25]
  ];
  R.walls = [];
  parts.forEach((p) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p[0], p[1], p[2]), R.wallMat);
    m.position.set(p[3], p[4], p[5]); m.castShadow = true; m.receiveShadow = true; m.layers.enable(1); S.add(m); R.walls.push(m);
  });
  // corner posts
  const posts = [];
  [[-HALF - 0.25, zt - 0.25], [HALF + 0.25, zt - 0.25], [-HALF - 0.25, zb - 0.3], [HALF + 0.25, zb - 0.3]].forEach((p) => {
    posts.push(box(0.8, 0.95, 0.8, '#a07650', [p[0], 0.47, p[1]]));
    posts.push(box(0.95, 0.12, 0.95, '#c79a62', [p[0], 0.98, p[1]]));
    posts.push(cyl(0.18, 0.3, 0.3, 10, '#8a3a20', [p[0], 1.18, p[1]]));
  });
  R.propMat = propMat({ roughness: 0.62 });
  const pm = new THREE.Mesh(merge(posts), R.propMat); pm.castShadow = true; pm.receiveShadow = true; pm.layers.enable(1); S.add(pm);
  R.inlayMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(L.inlay).multiplyScalar(2.4), toneMapped: true });
  const inl = [];
  inl.push(new THREE.BoxGeometry(0.05, 0.03, len).translate(-HALF - 0.01, 0.63, (zt + zb) / 2 - 0.25));
  inl.push(new THREE.BoxGeometry(0.05, 0.03, len).translate(HALF + 0.01, 0.63, (zt + zb) / 2 - 0.25));
  inl.push(new THREE.BoxGeometry(HALF * 2, 0.03, 0.05).translate(0, 0.63, zt + 0.01));
  const inlay = new THREE.Mesh(mergeSimple(inl), R.inlayMat); inlay.layers.enable(1); S.add(inlay);
  // a soft glow line along the bottom edge where the ball is lost
  R.dangerMat = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5030').multiplyScalar(1.2), transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const danger = new THREE.Mesh(new THREE.PlaneGeometry(HALF * 2, 0.12), R.dangerMat);
  danger.rotation.x = -Math.PI / 2; danger.position.set(0, 0.012, zOf(-0.6)); S.add(danger); R.danger = danger;
}
function mergeSimple(list) {
  let n = 0; const ng = list.map((g) => { const x = g.index ? g.toNonIndexed() : g; n += x.attributes.position.count; return x; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  ng.forEach((g) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); o += g.attributes.position.count; g.dispose(); });
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.computeBoundingSphere();
  return out;
}

/* the rim of little diyas: lit one by one as the level is cleared */
function buildRimLamps() {
  const S = R.scene, spots = [];
  const zt = zOf(TOPY), zb = zOf(-0.6);
  for (let i = 0; i < 14; i++) { const z = lerp(zt + 0.4, zb, i / 13); spots.push([-HALF - 0.25, z], [HALF + 0.25, z]); }
  for (let i = 0; i < 9; i++) spots.push([lerp(-HALF + 0.9, HALF - 0.9, i / 8), zt - 0.25]);
  R.lampSpots = spots;
  const bowl = new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.13, 0.02), new THREE.Vector2(0.17, 0.08), new THREE.Vector2(0.14, 0.1), new THREE.Vector2(0.03, 0.06)], 10);
  R.lampMat = new THREE.MeshStandardMaterial({ color: '#b65a34', roughness: 0.6 });
  R.lamps = new THREE.InstancedMesh(bowl, R.lampMat, spots.length);
  const fl = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.05, 0.04), new THREE.Vector2(0.045, 0.1), new THREE.Vector2(0.0, 0.2)], 8);
  R.flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.1, 0.6), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  R.flames = new THREE.InstancedMesh(fl, R.flameMat, spots.length);
  spots.forEach((p, i) => { _m.makeTranslation(p[0], 0.62, p[1]); R.lamps.setMatrixAt(i, _m); R.flames.setMatrixAt(i, _zero); });
  R.lamps.castShadow = true; R.lamps.layers.enable(1); R.flames.layers.enable(1);
  S.add(R.lamps, R.flames);
  R.lampLit = new Float32Array(spots.length);
}

/* courtyard decor: pillars, marigold garlands, a temple gateway, floating sky lanterns */
function buildDecor() {
  const S = R.scene, r = rng(77), parts = [];
  for (let i = 0; i < 6; i++) {
    const z = -10 + i * 4.2;
    [-1, 1].forEach((s) => {
      const x = s * 11.6;
      parts.push(box(1.0, 0.35, 1.0, '#9a7452', [x, 0.17, z]));
      parts.push(cyl(0.26, 0.32, 2.6, 12, '#b58a5e', [x, 1.6, z]));
      parts.push(box(0.8, 0.25, 0.8, '#c79a62', [x, 3.0, z]));
      parts.push(cyl(0.12, 0.2, 0.25, 10, '#8a3a20', [x, 3.25, z]));
      parts.push(cone(0.07, 0.22, 6, '#ffd070', [x, 3.5, z], null, 3));
    });
  }
  // the gateway beyond the top wall
  const gz = -17.5;
  for (let k = 0; k < 6; k++) { const w = 9 - k * 1.25, h = 1.6 - k * 0.12, y = 0.8 + k * 1.55; parts.push(box(w, h, 3 - k * 0.3, k % 2 ? '#a5764e' : '#bf8f60', [0, y + h / 2 - 0.8, gz])); for (let j = -2; j <= 2; j++) parts.push(cyl(0.09, 0.09, 0.14, 6, '#ffd070', [j * w * 0.18, y + h - 0.7, gz + 1.55 - k * 0.15], null, 2.2)); }
  parts.push(box(3, 3.2, 3.4, '#2a1810', [0, 1.6, gz + 0.1]));
  parts.push(sph(0.7, '#e8b04a', [0, 10.4, gz], [1, 1.3, 1], 0.25));
  parts.push(cone(0.4, 1.0, 10, '#f2c050', [0, 11.5, gz], null, 0.4));
  [-1, 1].forEach((s) => { parts.push(box(2.6, 7, 2.6, '#9e7550', [s * 6.2, 3.5, gz + 0.8])); parts.push(cone(1.5, 2.4, 4, '#b8865a', [s * 6.2, 8.2, gz + 0.8], [0, Math.PI / 4, 0])); });
  R.decor = new THREE.Mesh(merge(parts), R.propMat); R.decor.castShadow = false; R.decor.receiveShadow = true; S.add(R.decor);
  // marigold garlands strung between the pillars
  const N = 360;
  R.garland = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.13, 0), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.7 }), N);
  const cols = ['#f2a020', '#ffcf3a', '#e8641e'];
  let k = 0;
  for (let i = 0; i < 5; i++) for (const s of [-1, 1]) {
    const z0 = -10 + i * 4.2, z1 = z0 + 4.2;
    for (let j = 0; j < 36 && k < N; j++, k++) {
      const t = j / 35, x = s * 11.6, y = 2.95 - Math.sin(t * Math.PI) * 0.9, z = lerp(z0, z1, t);
      _m.makeTranslation(x, y, z); R.garland.setMatrixAt(k, _m); R.garland.setColorAt(k, _c.set(cols[(j + i) % 3]));
    }
  }
  R.garland.count = k; S.add(R.garland);
  // sky lanterns drifting up behind the gateway
  const SL = 40;
  R.skyLan = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.17, 0.42, 7), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.5, 0.5) }), SL);
  R.skyLanData = [];
  for (let i = 0; i < SL; i++) R.skyLanData.push({ x: (r() - 0.5) * 60, y: 2 + r() * 20, z: -22 - r() * 30, s: 0.3 + r() * 0.5, ph: r() * 6 });
  S.add(R.skyLan);
  // sky
  const L = LOOKS[0];
  R.skyU = { uTop: { value: new THREE.Color(L.top) }, uMid: { value: new THREE.Color(L.mid) }, uHor: { value: new THREE.Color(L.hor) }, uSun: { value: new THREE.Color(L.sun) }, uSunDir: { value: new THREE.Vector3().fromArray(L.sunDir).normalize() }, uStars: { value: 0 }, uClouds: { value: 0 }, uTime: { value: 0 }, uFlash: { value: 0 } };
  R.sky = new THREE.Mesh(new THREE.SphereGeometry(180, 32, 16), new THREE.ShaderMaterial({ uniforms: R.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
  R.sky.frustumCulled = false; R.sky.renderOrder = 1; R.sky.layers.enable(1); S.add(R.sky);
}

/* bricks: one instanced mesh for clay, brass and gold, one for glass */
const MAXB = ROWS * COLS + 40;
function brickMaterial(glass) {
  const m = glass
    ? new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.55, depthWrite: false, envMapIntensity: 2.2 })
    : new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.5, metalness: 0.05, envMapIntensity: 1.0 });
  m.userData.time = R.uTime;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.tMotif = { value: TX.motif }; sh.uniforms.uTime = R.uTime;
    sh.vertexShader = 'attribute vec4 aState;\nvarying vec4 vState;\nvarying vec3 vLoc;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vLoc = position; vState = aState;');
    let f = 'uniform sampler2D tMotif; uniform float uTime;\nvarying vec4 vState;\nvarying vec3 vLoc;\n' + sh.fragmentShader;
    f = f.replace('#include <color_fragment>', [
      '#include <color_fragment>',
      'vec2 muv = vec2(vLoc.x / 0.94 + 0.5, vLoc.z / 0.44 + 0.5);',
      'vec3 mot = texture2D(tMotif, muv).rgb;',
      'float topF = smoothstep(0.33, 0.405, vLoc.y);',
      'float eTop = min(0.47 - abs(vLoc.x), 0.22 - abs(vLoc.z));',
      'float rim = (1.0 - smoothstep(0.0, 0.075, eTop)) * topF + smoothstep(0.30, 0.41, vLoc.y) * (1.0 - topF) * 0.6;',
      'float style = vState.w;',
      'float isMet = step(2.5, style) * step(style, 4.5);',
      'float isGold = step(3.5, style) * step(style, 4.5);',
      'float isFire = step(0.5, style) * step(style, 1.5);',
      'float crk = mot.g * step(0.01, vState.y) * smoothstep(0.0, 1.0, vState.y * 1.4);',
      'diffuseColor.rgb *= mix(1.0, 0.82 + mot.r * 0.3, topF);',
      'diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.98, 0.78, 0.25), isFire * mot.b * topF * 0.9);',
      'diffuseColor.rgb *= 1.0 - crk * 0.7;'
    ].join('\n'));
    f = f.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, mix(0.34, 0.2, isGold) - mot.r * 0.08 * topF, isMet);');
    f = f.replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.92, isMet);');
    f = f.replace('#include <emissivemap_fragment>', [
      '#include <emissivemap_fragment>',
      'float flick = 0.75 + 0.25 * sin(uTime * 17.0 + vLoc.x * 9.0) * sin(uTime * 7.0);',
      'float glow = vState.z;',
      glass
        ? 'float fres = pow(1.0 - abs(dot(normalize(vViewPosition), normal)), 2.5);\n totalEmissiveRadiance += vColor.rgb * (0.35 + rim * 2.2 + fres * 1.1 + mot.r * topF * 0.5) * glow;\n diffuseColor.a = clamp(diffuseColor.a + rim * 0.4 + fres * 0.35, 0.0, 1.0);'
        : 'totalEmissiveRadiance += vColor.rgb * (rim * (1.35 + isGold * 0.5) + mot.r * topF * 0.32 * (1.0 - isMet) + 0.06) * glow;\n totalEmissiveRadiance += vec3(1.0, 0.45, 0.08) * crk * 2.5;\n totalEmissiveRadiance += vec3(1.0, 0.6, 0.2) * isFire * (mot.b * topF * 0.6 + rim * 0.8) * flick * glow;',
      glass ? '' : 'totalEmissiveRadiance += vColor.rgb * isMet * (0.1 + isGold * 0.12) * glow;',
      'totalEmissiveRadiance += vec3(1.0, 0.92, 0.8) * vState.x * 1.6;'
    ].join('\n'));
    sh.fragmentShader = f;
  };
  return m;
}
function buildBricks() {
  const S = R.scene;
  const shape = new THREE.Shape(), w = 0.86, h = 0.36, rr = 0.07, x0 = -w / 2, y0 = -h / 2;
  shape.moveTo(x0 + rr, y0); shape.lineTo(x0 + w - rr, y0); shape.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rr); shape.lineTo(x0 + w, y0 + h - rr); shape.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rr, y0 + h);
  shape.lineTo(x0 + rr, y0 + h); shape.quadraticCurveTo(x0, y0 + h, x0, y0 + h - rr); shape.lineTo(x0, y0 + rr); shape.quadraticCurveTo(x0, y0, x0 + rr, y0);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.04, bevelSegments: 2, curveSegments: 3 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, 0.06, 0); geo.computeVertexNormals();
  R.uTime = { value: 0 };
  R.brickGeo = geo;
  const mk = (glass) => {
    const im = new THREE.InstancedMesh(geo, brickMaterial(glass), MAXB);
    const st = new THREE.InstancedBufferAttribute(new Float32Array(MAXB * 4), 4); st.setUsage(THREE.DynamicDrawUsage);
    im.geometry = geo.clone(); im.geometry.setAttribute('aState', st);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < MAXB; i++) { im.setMatrixAt(i, _zero); im.setColorAt(i, _c.set('#ffffff')); }
    im.count = 0; im.frustumCulled = false; im.layers.enable(1);
    im.castShadow = !glass; im.receiveShadow = !glass;
    S.add(im);
    return im;
  };
  R.bOp = mk(false); R.bGl = mk(true); R.bGl.renderOrder = 2;
  R.slot = new Int32Array(MAXB * 2); // brick id -> mesh * MAXB + index
  R.bv = []; // per brick view state
  for (let i = 0; i < MAXB; i++) R.bv.push({ delay: 0, rise: 1, wob: 0, hidden: false, sx: 0, sz: 0 });
}

/* the paddle: a lacquered body with brass caps, a glowing inlay, laser turrets */
function buildPaddle() {
  const S = R.scene, g = new THREE.Group();
  R.padBodyMat = new THREE.MeshStandardMaterial({ color: '#4a2416', roughness: 0.32, metalness: 0.25, envMapIntensity: 1.2 });
  R.padBrass = new THREE.MeshStandardMaterial({ color: '#e0a54a', roughness: 0.26, metalness: 0.95, envMapIntensity: 1.4 });
  R.padInlay = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffc65a').multiplyScalar(2.6) });
  const mid = new THREE.Mesh(new THREE.CylinderGeometry(PAD_H, PAD_H, 1, 24, 1, false), R.padBodyMat); mid.rotation.z = Math.PI / 2;
  const capG = new THREE.SphereGeometry(PAD_H * 1.02, 20, 12);
  const capL = new THREE.Mesh(capG, R.padBrass), capR = new THREE.Mesh(capG, R.padBrass);
  const ringG = new THREE.TorusGeometry(PAD_H * 1.02, 0.035, 8, 24);
  const ringL = new THREE.Mesh(ringG, R.padBrass), ringR = new THREE.Mesh(ringG, R.padBrass); ringL.rotation.y = ringR.rotation.y = Math.PI / 2;
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(1, 0.03, 0.1), R.padInlay); inlay.position.y = PAD_H * 0.94;
  const turG = new THREE.CylinderGeometry(0.07, 0.1, 0.46, 10);
  const turL = new THREE.Mesh(turG, R.padBrass), turR = new THREE.Mesh(turG, R.padBrass);
  R.turTipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.9, 0.6) });
  const tipG = new THREE.SphereGeometry(0.085, 10, 8);
  const tipL = new THREE.Mesh(tipG, R.turTipMat), tipR = new THREE.Mesh(tipG, R.turTipMat);
  [mid, capL, capR, ringL, ringR, inlay, turL, turR, tipL, tipR].forEach((m) => { m.castShadow = m !== inlay && m !== tipL && m !== tipR; m.layers.enable(1); g.add(m); });
  S.add(g);
  R.padGlowMat = new THREE.MeshBasicMaterial({ map: TX.glow, color: '#ffb050', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  R.padGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), R.padGlowMat); R.padGlow.rotation.x = -Math.PI / 2; R.padGlow.layers.enable(1); S.add(R.padGlow);
  R.pad = { g, mid, capL, capR, ringL, ringR, inlay, turL, turR, tipL, tipR, lean: 0, laser: 0 };
}

/* balls, capsules, lasers, embers */
function buildMovers() {
  const S = R.scene;
  R.ballMat = new THREE.MeshStandardMaterial({ color: '#fff4dc', emissive: '#ffd58a', emissiveIntensity: 2.6, roughness: 0.25 });
  R.ballFire = new THREE.MeshStandardMaterial({ color: '#ffb070', emissive: '#ff5a14', emissiveIntensity: 3.6, roughness: 0.3 });
  const bg = new THREE.SphereGeometry(BALL_R, 24, 16);
  R.balls = [];
  for (let i = 0; i < 12; i++) { const m = new THREE.Mesh(bg, R.ballMat); m.castShadow = true; m.layers.enable(1); m.visible = false; S.add(m); R.balls.push(m); }
  // halo: one point per ball
  const hp = new Float32Array(12 * 3), hs = new Float32Array(12), ha = new Float32Array(12), hc = new Float32Array(12 * 3);
  const hgeo = new THREE.BufferGeometry();
  hgeo.setAttribute('position', new THREE.BufferAttribute(hp, 3)); hgeo.setAttribute('aSize', new THREE.BufferAttribute(hs, 1)); hgeo.setAttribute('aAlpha', new THREE.BufferAttribute(ha, 1)); hgeo.setAttribute('aCol', new THREE.BufferAttribute(hc, 3));
  R.haloMat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 300 } }, vertexShader: PTS_VS, fragmentShader: PTS_FS_ADD, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  R.halo = new THREE.Points(hgeo, R.haloMat); R.halo.frustumCulled = false; R.halo.layers.enable(1); S.add(R.halo);
  // a pool of light on the floor under every ball, so it lights the board even with no point lights
  const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
  R.ballGlow = new THREE.InstancedMesh(pg, new THREE.MeshBasicMaterial({ map: TX.glow, color: '#ffffff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 12);
  R.ballGlow.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < 12; i++) { R.ballGlow.setMatrixAt(i, _zero); R.ballGlow.setColorAt(i, _c.set('#ffb860')); }
  R.ballGlow.frustumCulled = false; S.add(R.ballGlow);
  // power-up capsules
  const capG = new THREE.CapsuleGeometry(0.15, 0.5, 6, 14); capG.rotateZ(Math.PI / 2);
  const cm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.25, metalness: 0.3 });
  cm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 0.9;'); };
  R.caps = new THREE.InstancedMesh(capG, cm, 8); R.caps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (let i = 0; i < 8; i++) { R.caps.setMatrixAt(i, _zero); R.caps.setColorAt(i, _c.set('#ffffff')); }
  R.caps.castShadow = true; R.caps.frustumCulled = false; R.caps.layers.enable(1); S.add(R.caps);
  // laser bolts and boss embers
  R.bolts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.07, 0.07, 0.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 1.1, 0.7), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 24);
  R.embers = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.17, 1), new THREE.MeshBasicMaterial({ color: new THREE.Color(4.5, 1.6, 0.35) }), 16);
  [R.bolts, R.embers].forEach((im) => { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < im.count; i++) im.setMatrixAt(i, _zero); im.frustumCulled = false; im.layers.enable(1); S.add(im); });
}

/* particles, shards, shockwave rings */
function makePool(n, additive) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 300 } }, vertexShader: PTS_VS, fragmentShader: additive ? PTS_FS_ADD : PTS_FS_SOFT, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.layers.enable(1);
  return { n, pos, col, size, alpha, geo, mat, pts, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), s0: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n), a0: new Float32Array(n), grow: new Float32Array(n), head: 0, live: 0 };
}
const FX = { add: null, soft: null, density: 1 };
function emit(P, x, y, z, vx, vy, vz, life, size, hex, a0, grav, drag, grow) {
  if (FX.density < 1 && Math.random() > FX.density) return;
  const i = P.head; P.head = (P.head + 1) % P.n;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.life[i] = P.max[i] = life; P.s0[i] = size; P.a0[i] = a0 == null ? 1 : a0; P.grav[i] = grav || 0; P.drag[i] = drag || 0; P.grow[i] = grow || 0;
  _c.set(hex); P.col[i * 3] = _c.r; P.col[i * 3 + 1] = _c.g; P.col[i * 3 + 2] = _c.b;
}
function emitC(P, x, y, z, vx, vy, vz, life, size, r, g, b, a0, grav, drag, grow) {
  if (FX.density < 1 && Math.random() > FX.density) return;
  const i = P.head; P.head = (P.head + 1) % P.n;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.life[i] = P.max[i] = life; P.s0[i] = size; P.a0[i] = a0 == null ? 1 : a0; P.grav[i] = grav || 0; P.drag[i] = drag || 0; P.grow[i] = grow || 0;
  P.col[i * 3] = r; P.col[i * 3 + 1] = g; P.col[i * 3 + 2] = b;
}
function stepPool(P, dt) {
  const n = P.n;
  for (let i = 0; i < n; i++) {
    if (P.life[i] <= 0) { if (P.alpha[i] !== 0) { P.alpha[i] = 0; P.size[i] = 0; } continue; }
    P.life[i] -= dt;
    const i3 = i * 3, dr = Math.exp(-P.drag[i] * dt);
    P.vel[i3 + 1] -= P.grav[i] * dt;
    P.vel[i3] *= dr; P.vel[i3 + 1] *= dr; P.vel[i3 + 2] *= dr;
    P.pos[i3] += P.vel[i3] * dt; P.pos[i3 + 1] += P.vel[i3 + 1] * dt; P.pos[i3 + 2] += P.vel[i3 + 2] * dt;
    if (P.pos[i3 + 1] < 0.02 && P.vel[i3 + 1] < 0) { P.pos[i3 + 1] = 0.02; P.vel[i3 + 1] *= -0.35; P.vel[i3] *= 0.7; P.vel[i3 + 2] *= 0.7; }
    const f = Math.max(0, P.life[i] / P.max[i]);
    P.alpha[i] = P.a0[i] * (f < 0.3 ? f / 0.3 : 1);
    P.size[i] = P.s0[i] * (1 + P.grow[i] * (1 - f));
  }
  P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aCol.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; P.geo.attributes.aAlpha.needsUpdate = true;
}
function buildEffects() {
  const S = R.scene;
  FX.add = makePool(2400, true); FX.soft = makePool(700, false);
  S.add(FX.add.pts, FX.soft.pts);
  // shards: clay and brass chips tumble and bounce; glass ones glint
  const NS = 360, sg = new THREE.TetrahedronGeometry(0.11, 0);
  const smat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.45, metalness: 0.2 });
  smat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vColor.rgb * 0.28;'); };
  R.shards = new THREE.InstancedMesh(sg, smat, NS);
  R.gshards = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(0.1, 0), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }), 220);
  [R.shards, R.gshards].forEach((im) => { im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); for (let i = 0; i < im.count; i++) { im.setMatrixAt(i, _zero); im.setColorAt(i, _c.set('#ffffff')); } im.frustumCulled = false; im.layers.enable(1); S.add(im); });
  R.shards.castShadow = true;
  const sh = (n) => ({ n, head: 0, p: new Float32Array(n * 3), v: new Float32Array(n * 3), r: new Float32Array(n * 3), w: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), s: new Float32Array(n), dirty: false });
  R.sh = sh(NS); R.gsh = sh(220);
  // shockwave rings on the floor
  R.rings = [];
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 48), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.rotation.x = -Math.PI / 2; m.visible = false; m.layers.enable(1); S.add(m); R.rings.push({ m, t: 9, dur: 1, max: 3, col: new THREE.Color() });
  }
}
function shard(P, x, y, z, vx, vy, vz, s, life, hex, im) {
  const i = P.head; P.head = (P.head + 1) % P.n;
  P.p[i * 3] = x; P.p[i * 3 + 1] = y; P.p[i * 3 + 2] = z; P.v[i * 3] = vx; P.v[i * 3 + 1] = vy; P.v[i * 3 + 2] = vz;
  P.r[i * 3] = Math.random() * 6; P.r[i * 3 + 1] = Math.random() * 6; P.r[i * 3 + 2] = Math.random() * 6;
  P.w[i * 3] = (Math.random() - 0.5) * 18; P.w[i * 3 + 1] = (Math.random() - 0.5) * 18; P.w[i * 3 + 2] = (Math.random() - 0.5) * 18;
  P.life[i] = P.max[i] = life; P.s[i] = s; P.dirty = true;
  im.setColorAt(i, _c.set(hex)); im.instanceColor.needsUpdate = true;
}
function stepShards(P, im, dt) {
  if (!P.dirty) return;
  let any = false;
  for (let i = 0; i < P.n; i++) {
    if (P.life[i] <= 0) continue;
    P.life[i] -= dt; any = true;
    const i3 = i * 3;
    if (P.life[i] <= 0) { im.setMatrixAt(i, _zero); continue; }
    P.v[i3 + 1] -= 16 * dt;
    P.p[i3] += P.v[i3] * dt; P.p[i3 + 1] += P.v[i3 + 1] * dt; P.p[i3 + 2] += P.v[i3 + 2] * dt;
    if (P.p[i3 + 1] < 0.05) { P.p[i3 + 1] = 0.05; P.v[i3 + 1] = Math.abs(P.v[i3 + 1]) * 0.35; P.v[i3] *= 0.6; P.v[i3 + 2] *= 0.6; P.w[i3] *= 0.6; P.w[i3 + 2] *= 0.6; }
    P.r[i3] += P.w[i3] * dt; P.r[i3 + 1] += P.w[i3 + 1] * dt; P.r[i3 + 2] += P.w[i3 + 2] * dt;
    const f = P.life[i] / P.max[i], sc = P.s[i] * (f < 0.25 ? f / 0.25 : 1);
    _e.set(P.r[i3], P.r[i3 + 1], P.r[i3 + 2]); _q.setFromEuler(_e); _s.set(sc * 1.3, sc * 0.7, sc); _v1.set(P.p[i3], P.p[i3 + 1], P.p[i3 + 2]);
    _m.compose(_v1, _q, _s); im.setMatrixAt(i, _m);
  }
  im.instanceMatrix.needsUpdate = true;
  if (!any) P.dirty = false;
}
function ring(x, y, z, hex, max, dur, vertical) {
  let s = R.rings[0];
  for (let i = 1; i < R.rings.length; i++) if (R.rings[i].t / R.rings[i].dur > s.t / s.dur) s = R.rings[i];
  s.t = 0; s.dur = dur || 0.6; s.max = max || 2.5; s.m.visible = true; s.col.set(hex).multiplyScalar(1.1);
  s.m.position.set(x, y, z);
  if (vertical) s.m.rotation.set(0, vertical === 'x' ? Math.PI / 2 : 0, 0); else s.m.rotation.set(-Math.PI / 2, 0, 0);
}

/* the three bosses, built once, shown on their level */
function buildBosses() {
  const S = R.scene;
  R.bossMat = propMat({ roughness: 0.45, metalness: 0.35 });
  R.boss = {};
  // the brass drum: a kettle drum with a painted skin and a cheeky face
  {
    const g = new THREE.Group(), parts = [];
    const lathe = new THREE.LatheGeometry([new THREE.Vector2(0.0, 0), new THREE.Vector2(0.9, 0.02), new THREE.Vector2(1.35, 0.35), new THREE.Vector2(1.5, 0.8), new THREE.Vector2(1.45, 1.1), new THREE.Vector2(1.42, 1.18)], 32);
    parts.push(prep(lathe, '#c88a3a', [0, 0, 0]));
    parts.push(torus(1.43, 0.07, '#f2c060', [0, 1.18, 0], [Math.PI / 2, 0, 0], 0.3));
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; parts.push(box(0.05, 0.75, 0.05, '#7a2a18', [Math.cos(a) * 1.47, 0.72, Math.sin(a) * 1.47], [0, -a, (i % 2 ? 0.35 : -0.35)])); }
    [-1, 1].forEach((s) => { parts.push(sph(0.2, '#ffffff', [s * 0.42, 0.85, 1.32], [1, 1.2, 0.6], 0.2)); parts.push(sph(0.1, '#ff7a1a', [s * 0.42, 0.85, 1.43], [1, 1.2, 0.6], 3.5)); });
    parts.push(torus(0.28, 0.05, '#3a1208', [0, 0.52, 1.36], [0, 0, Math.PI], 0, Math.PI));
    const body = new THREE.Mesh(merge(parts), R.bossMat); body.castShadow = true; body.layers.enable(1);
    const skinMat = new THREE.MeshStandardMaterial({ map: TX.drum, roughness: 0.7, emissive: '#ffaa40', emissiveMap: TX.drum, emissiveIntensity: 0.0 });
    const skin = new THREE.Mesh(new THREE.CircleGeometry(1.4, 40), skinMat); skin.rotation.x = -Math.PI / 2; skin.position.y = 1.19; skin.layers.enable(1); skin.receiveShadow = true;
    g.add(body, skin); g.visible = false; S.add(g);
    R.boss.drum = { g, body, skin, skinMat };
  }
  // the paper dragon: a head and a string of lantern segments
  {
    const g = new THREE.Group(), parts = [];
    parts.push(box(1.4, 0.9, 1.5, '#d8322b', [0, 0.75, 0]));
    parts.push(box(1.1, 0.5, 0.9, '#f2b632', [0, 0.55, 0.95]));
    parts.push(box(1.0, 0.18, 0.7, '#ffffff', [0, 0.3, 1.05], null, 0.4));
    [-1, 1].forEach((s) => {
      parts.push(sph(0.2, '#ffffff', [s * 0.38, 1.12, 0.62], [1, 1, 0.7], 0.3)); parts.push(sph(0.1, '#2a9d4a', [s * 0.38, 1.15, 0.75], null, 3));
      parts.push(cone(0.12, 0.9, 6, '#f2b632', [s * 0.55, 1.5, -0.3], [-0.6, 0, s * 0.4]));
      parts.push(box(0.04, 0.04, 1.1, '#ffcf5a', [s * 0.7, 0.55, 1.2], [0, s * 0.5, 0], 1.2));
    });
    for (let i = 0; i < 5; i++) parts.push(cone(0.18, 0.45, 4, '#2a9d4a', [0, 1.3, -0.5 + i * 0.25], [0.2, 0, 0]));
    const head = new THREE.Mesh(merge(parts), R.bossMat); head.castShadow = true; head.layers.enable(1);
    g.add(head); g.visible = false; S.add(g);
    const segG = merge([sph(0.6, '#ffffff', [0, 0.65, 0], [1, 0.85, 1], 0.15, 16, 10), torus(0.58, 0.05, '#7a2a18', [0, 0.65, 0], [Math.PI / 2, 0, 0], 0), torus(0.45, 0.04, '#7a2a18', [0, 0.95, 0], [Math.PI / 2, 0, 0], 0), cone(0.16, 0.4, 4, '#2a9d4a', [0, 1.25, 0])]);
    const segs = new THREE.InstancedMesh(segG, R.bossMat, 8); segs.castShadow = true; segs.layers.enable(1); segs.frustumCulled = false;
    const sc = ['#d8322b', '#f2b632', '#d6527e', '#26a69a'];
    for (let i = 0; i < 8; i++) { segs.setMatrixAt(i, _zero); segs.setColorAt(i, _c.set(sc[i % 4])); }
    segs.visible = false; S.add(segs);
    R.boss.dragon = { g, head, segs };
  }
  // the night lantern: a great paper globe with a glowing heart
  {
    const g = new THREE.Group(), parts = [];
    for (let i = 0; i < 6; i++) parts.push(torus(1.68, 0.05, '#5a2a1a', [0, 1.9, 0], [0, i / 6 * Math.PI, 0], 0, TAU, [1, 0.82, 1]));
    parts.push(torus(1.2, 0.08, '#e0a54a', [0, 3.15, 0], [Math.PI / 2, 0, 0], 0.4)); parts.push(torus(1.2, 0.08, '#e0a54a', [0, 0.65, 0], [Math.PI / 2, 0, 0], 0.4));
    parts.push(cyl(0.3, 0.5, 0.4, 12, '#e0a54a', [0, 3.5, 0])); parts.push(cyl(0.5, 0.25, 0.35, 12, '#e0a54a', [0, 0.35, 0]));
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU; parts.push(box(0.05, 0.6, 0.05, '#ff6ad0', [Math.cos(a) * 0.4, -0.05, Math.sin(a) * 0.4], null, 1.5)); }
    const frame = new THREE.Mesh(merge(parts), R.bossMat); frame.castShadow = true; frame.layers.enable(1);
    const shellMat = new THREE.MeshStandardMaterial({ color: '#ff8a3a', emissive: '#ff6a20', emissiveIntensity: 1.2, transparent: true, opacity: 0.72, roughness: 0.8, depthWrite: false });
    const shell = new THREE.Mesh(new THREE.SphereGeometry(1.66, 28, 18), shellMat); shell.position.y = 1.9; shell.scale.set(1, 0.82, 1); shell.layers.enable(1); shell.renderOrder = 3;
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 18, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3, 1.2) })); core.position.y = 1.9; core.layers.enable(1);
    g.add(frame, shell, core); g.visible = false; S.add(g);
    R.boss.lantern = { g, frame, shell, shellMat, core };
  }
}

/* ------------------------------------------------------------ the build queue: a little each frame */
function queueBuild(a) {
  R.building = true;
  R.tasks = [
    () => { if (!setupRenderer(a)) { R.failed = true; R.tasks.length = 0; } },
    () => { TX = {}; texMotif(); },
    () => { texBoard(); },
    () => { texBoardGlow(); texGlow(); },
    () => { texCourt(); },
    () => { texWall(); texDrum(); },
    () => { buildBoard(); },
    () => { buildRimLamps(); buildBricks(); },
    () => { buildPaddle(); buildMovers(); },
    () => { buildEffects(); },
    () => { buildDecor(); },
    () => { buildBosses(); },
    () => { if (!R.soft) buildEnv(); },
    () => {
      R.fx = createFX(R.renderer, { arc: a, intro: false, results: { dist: 14, yaw: 0.3, rise: 0.12, speed: 0.2 }, target: (v) => { v.set(0, 0.5, zOf(9)); return true; }, look: { bloom: 0.6, bloomWide: 0.4, threshold: 0.62, knee: 0.25, vignette: 0.34, grain: 0.03, sat: 1.08, contrast: 1.06, lift: [0.015, 0.01, 0.025], gain: [1.03, 1.0, 0.97] } });
    },
    () => { setQuality(R.qWant != null ? R.qWant : R.soft ? 0 : a.device === 'desktop' ? 3 : 2); },
    () => { setLook(0, true); resize3D(a); },
    () => { warm(a); }
  ];
}
function buildEnv() {
  // a simple glowing room for metals and glass to reflect: warm lamps on a dusk gradient
  const pm = new THREE.PMREMGenerator(R.renderer);
  const es = new THREE.Scene();
  const skyM = new THREE.MeshBasicMaterial({ side: THREE.BackSide, vertexColors: true });
  const sg = new THREE.SphereGeometry(20, 24, 12), col = new Float32Array(sg.attributes.position.count * 3);
  for (let i = 0; i < sg.attributes.position.count; i++) { const y = sg.attributes.position.getY(i) / 20; _c.set(y > 0.2 ? '#3a2a5a' : y > -0.1 ? '#c86a4a' : '#2a1a14'); col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  sg.setAttribute('color', new THREE.BufferAttribute(col, 3));
  es.add(new THREE.Mesh(sg, skyM));
  const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 3.6, 1.6) });
  for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.BoxGeometry(2.5, 1.2, 0.2), lampM); const a = i / 8 * TAU; m.position.set(Math.cos(a) * 12, 4 + (i % 2) * 3, Math.sin(a) * 12); m.lookAt(0, 0, 0); es.add(m); }
  const top = new THREE.Mesh(new THREE.PlaneGeometry(10, 10), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.4, 1.8), side: THREE.DoubleSide })); top.position.y = 15; top.rotation.x = Math.PI / 2; es.add(top);
  R.env = pm.fromScene(es, 0.04).texture;
  pm.dispose();
  es.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  R.scene.environment = R.env;
  R.scene.environmentIntensity = 0.55;
}
// show every pool once, compile its shaders one object per slice, draw one hidden frame, then hide them again
function warm(a) {
  const S = R.scene;
  const shown = [];
  const show = (o) => { if (!o) return; shown.push([o, o.visible, o.isInstancedMesh ? o.count : -1]); o.visible = true; if (o.isInstancedMesh && o.count === 0) o.count = 1; };
  R.balls.forEach((b) => { show(b); b.position.set(0, -2, 0); });
  R.balls[1].material = R.ballFire;
  [R.caps, R.bolts, R.embers, R.shards, R.gshards, R.bOp, R.bGl, R.boss.dragon.segs, R.flames, R.skyLan].forEach(show);
  ['drum', 'dragon', 'lantern'].forEach((k) => { show(R.boss[k].g); R.boss[k].g.position.set(0, -4, 0); });
  R.rings.forEach((r) => show(r.m));
  R.pad.turL.visible = R.pad.turR.visible = R.pad.tipL.visible = R.pad.tipR.visible = true;
  R.camera.position.set(0, 18, 18); R.camera.lookAt(0, 0, 0); R.camera.updateMatrixWorld();
  sizeRefl();
  // one task per object: each links only its own programs, so no single slice of the boot runs long
  S.children.slice().forEach((o) => {
    R.tasks.push(() => {
      try {
        const mats = R.renderer.compile(o, R.camera, S);
        // ask for each program's uniforms now: that waits for the driver to finish linking it, here, in this slice
        mats.forEach((m) => { const p = R.renderer.properties.get(m).currentProgram; if (p) p.getUniforms(); });
      } catch (e) { /* compiled at first draw instead */ }
    });
  });
  // upload every texture ahead of the first frame, one per slice
  ALL_TEX.forEach((t) => { R.tasks.push(() => { try { R.renderer.initTexture(t); } catch (e) { /* uploaded at first draw instead */ } }); });
  if (R.env) R.tasks.push(() => { try { R.renderer.initTexture(R.env); } catch (e) { /* uploaded at first draw */ } });
  // draw each object once on its own: a driver that builds its pipeline at the first draw does it here, a little at a time
  const objs = S.children.filter((o) => !o.isLight), wv = objs.map((o) => o.visible);
  objs.forEach((o, i) => {
    if (!wv[i]) return;
    R.tasks.push(() => {
      try {
        for (let k = 0; k < objs.length; k++) objs[k].visible = k === i;
        R.renderer.shadowMap.needsUpdate = true; R.renderer.setRenderTarget(null); R.renderer.render(S, R.camera);
      } catch (e) { /* lost context */ }
      for (let k = 0; k < objs.length; k++) objs[k].visible = wv[k];
    });
  });
  R.tasks.push(() => { try { renderRefl(R.camera); } catch (e) { /* lost context */ } });
  R.tasks.push(() => {
    try { R.renderer.shadowMap.needsUpdate = true; R.fx.render(S, R.camera); } catch (e) { /* lost context */ }
    shown.forEach((s) => { s[0].visible = s[1]; if (s[2] >= 0) s[0].count = s[2]; });
    R.balls[1].material = R.ballMat;
    R.ready = true; R.building = false;
    R.readyAt = now(); R.ff = [];
    if (R.G) newLevel(R.G);
  });
}

/* ------------------------------------------------------------ quality */
function setQuality(q) {
  q = clamp(q | 0, 0, 3);
  R.qWant = q;
  if (!R.renderer || !R.fx) return;
  if (q === R.quality) return;
  const t = TIERS[q], r = R.renderer;
  R.quality = q;
  const shadow = t.shadow && !R.soft;
  if (r.shadowMap.enabled !== shadow) { r.shadowMap.enabled = shadow; R.key.castShadow = shadow; }
  if (R.key.shadow.mapSize.x !== t.map) { R.key.shadow.mapSize.set(t.map, t.map); if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; } }
  r.shadowMap.type = q >= 3 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  FX.density = t.fx;
  if (R.decor) { R.decor.visible = t.decor; R.garland.visible = t.decor; }
  R.fx.setQuality(t.post ? q : 0, R.lockQ);
  R.fx.setEnabled(t.post);
  resize3D(ARC);
}
function resize3D(a) {
  if (!R.renderer || !a) return;
  const t = TIERS[Math.max(0, R.quality)];
  const pr = Math.min(a.dpr * t.px, Math.sqrt(t.budget / Math.max(1, a.w * a.h)));
  R.renderer.setPixelRatio(Math.max(0.35, pr));
  R.renderer.setSize(a.w, a.h, false);
  R.camera.aspect = a.w / Math.max(1, a.h); R.camera.updateProjectionMatrix();
  frameCamera(a);
  sizeRefl();
}
function measureFps(dt) {
  if (R.qWarm < 20) { R.qWarm++; return; }
  R.qT += dt; R.qN++;
  if (R.qT >= 1.5) {
    R.fps = R.qN / R.qT; R.qT = 0; R.qN = 0;
    if (!R.lockQ && R.fps < 45 && R.quality > 0) { setQuality(R.fps < 22 ? R.quality - 2 : R.quality - 1); R.qWarm = 0; }
  }
}

/* ------------------------------------------------------------ the look of each act */
function setLook(act, force) {
  if (!R.renderer) return;
  act = clamp(act | 0, 0, 2);
  if (act === R.look && !force) return;
  R.look = act;
  const L = LOOKS[act];
  const u = R.skyU;
  u.uTop.value.set(L.top); u.uMid.value.set(L.mid); u.uHor.value.set(L.hor); u.uSun.value.set(L.sun); u.uSunDir.value.fromArray(L.sunDir).normalize(); u.uStars.value = L.stars; u.uClouds.value = L.clouds;
  R.scene.fog.color.set(L.fog); R.scene.fog.density = L.fogD;
  R.hemi.color.set(L.hemiSky); R.hemi.groundColor.set(L.hemiGround); R.hemi.intensity = L.hemiI;
  R.key.color.set(L.key); R.key.intensity = L.keyI; R.key.position.fromArray(L.keyPos);
  R.fill.color.set(L.fill); R.fill.intensity = L.fillI;
  R.boardMat.color.set(L.floor); R.boardMat.roughness = L.rough; R.boardMat.userData.refl.value = L.refl; R.boardMat.emissive.set(L.glow);
  R.courtMat.color.set(L.court); R.courtMat.roughness = Math.min(0.6, L.rough + 0.15); R.courtMat.userData.refl.value = L.refl * 0.6;
  R.wallMat.color.set(L.wall);
  R.inlayMat.color.set(L.inlay).multiplyScalar(2.4);
  R.renderer.toneMappingExposure = L.exposure;
  R.propMat.userData.glow.value = act === 2 ? 1.6 : 1;
}

/* ------------------------------------------------------------ camera */
const CORN = [];
for (const x of [-HALF - 0.3, HALF + 0.3]) for (const z of [zOf(TOPY) - 0.6, zOf(-0.9)]) for (const y of [0, 0.7]) CORN.push(new THREE.Vector3(x, y, z));
function frameCamera(a) {
  const cam = R.baseCam, portrait = a.h > a.w * 1.05;
  const pad = a.hudPad ? a.hudPad() : { top: 12, bottom: 52 };
  cam.aspect = a.w / Math.max(1, a.h);
  const fov = portrait ? 46 : 40, pitch = portrait ? 72 : 56;
  cam.fov = fov; cam.updateProjectionMatrix();
  const topNdc = 1 - 2 * ((pad.top + (a.w < 520 ? 92 : 104)) / a.h), botNdc = -1 + 2 * (Math.max(18, a.touchMode ? 34 : 24) / a.h), sideNdc = portrait ? 0.985 : 0.95;
  const dir = _v3.set(0, Math.sin(pitch * Math.PI / 180), Math.cos(pitch * Math.PI / 180));
  let zt = zOf(8.4), dist = 26;
  const fits = (d) => {
    cam.position.set(0, 0, zt).addScaledVector(dir, d); cam.lookAt(0, 0, zt); cam.updateMatrixWorld();
    let ymin = 9, ymax = -9, xm = 0;
    for (let i = 0; i < CORN.length; i++) { _v1.copy(CORN[i]).project(cam); ymin = Math.min(ymin, _v1.y); ymax = Math.max(ymax, _v1.y); xm = Math.max(xm, Math.abs(_v1.x)); }
    return { ok: xm <= sideNdc && ymax <= topNdc && ymin >= botNdc, ymin, ymax, xm };
  };
  for (let it = 0; it < 4; it++) {
    let lo = 6, hi = 90;
    for (let k = 0; k < 26; k++) { const mid = (lo + hi) / 2; if (fits(mid).ok) hi = mid; else lo = mid; }
    dist = hi;
    const f = fits(dist);
    // centre the board between the HUD and the bottom edge
    const want = (topNdc + botNdc) / 2, have = (f.ymax + f.ymin) / 2;
    zt -= (have - want) * dist * 0.35;
  }
  fits(dist);
  R.cam.basePos.copy(cam.position); R.cam.baseTgt.set(0, 0, zt); R.cam.baseFov = fov;
  // the screen line the paddle travels on, for mouse and touch
  _v1.set(-HALF, PAD_H, zOf(PAD_Y)).project(cam); _v2.set(HALF, PAD_H, zOf(PAD_Y)).project(cam);
  R.line.x0 = (_v1.x * 0.5 + 0.5) * a.w; R.line.x1 = (_v2.x * 0.5 + 0.5) * a.w;
}
function updateCamera(a, G, dt) {
  const C = R.cam, cam = R.camera, rm = a.reducedMotion;
  const P = G.paddle, attract = G.cfg.attract;
  _v1.copy(C.basePos); _v2.copy(C.baseTgt);
  let fov = C.baseFov;
  // a gentle drift toward the paddle gives depth without moving the play field much
  C.px += ((attract ? 0 : P.x) - C.px) * Math.min(1, dt * 3);
  const par = a.h > a.w ? 0.25 : 1;
  _v1.x += C.px * 0.12 * par; _v2.x += C.px * 0.05 * par;
  const D = _v3.copy(_v1).sub(_v2);
  if (attract || a.state === 'menu') {
    // behind the menu: a slow orbit over the courtyard
    C.orbit += dt * (rm ? 0.02 : 0.07);
    const yaw = Math.sin(C.orbit) * 0.42;
    D.applyAxisAngle(_up, yaw); D.multiplyScalar(1.08);
    _v1.copy(_v2).add(D);
  } else if (G.phase === 'intro' && !rm) {
    // the level intro: sweep from high over the far wall down onto the board
    const k = smooth01(G.pt / Math.max(0.1, G.introDur * 0.92));
    const e = 1 - Math.pow(1 - k, 3);
    D.applyAxisAngle(_up, (1 - e) * 0.9 * (G.level % 2 ? 1 : -1));
    D.multiplyScalar(1 + (1 - e) * 0.45);
    D.y += (1 - e) * 9;
    _v1.copy(_v2).add(D);
    _v2.z -= (1 - e) * 4;
    fov += (1 - e) * 8;
  } else if (G.phase === 'clear' && !rm) {
    const k = smooth01(G.pt / 3);
    const pk = a.h > a.w ? 0.35 : 1;
    D.applyAxisAngle(_up, Math.sin(k * 1.6) * 0.18 * pk);
    D.multiplyScalar(1 - k * 0.12 * pk);
    _v1.copy(_v2).add(D);
  }
  // punches for big moments, a dip when the ball is lost
  C.punch *= Math.exp(-dt * 5); C.dip *= Math.exp(-dt * 3);
  if (!rm && C.punch > 0.001) { _v1.lerp(_v2, C.punch * 0.08); }
  if (!rm && C.dip > 0.001) { _v1.y -= C.dip * 0.6; }
  if (!C.init) { C.pos.copy(_v1); C.tgt.copy(_v2); C.fov = fov; C.init = true; }
  const k = 1 - Math.exp(-dt * (G.phase === 'intro' ? 9 : 5));
  C.pos.lerp(_v1, k); C.tgt.lerp(_v2, k); C.fov += (fov - C.fov) * k;
  cam.position.copy(C.pos);
  if (!rm) { cam.position.x += (a.shakeX || 0) * 0.02; cam.position.y += (a.shakeY || 0) * 0.02; }
  cam.lookAt(C.tgt);
  if (Math.abs(cam.fov - C.fov) > 0.01) { cam.fov = C.fov; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}
const _up = new THREE.Vector3(0, 1, 0);

/* ------------------------------------------------------------ level setup: which brick sits in which instance */
function newLevel(G) {
  R.G = G;
  if (!R.ready) return;
  const key = G.cfg.attract + '|' + G.cfg.mode + '|' + G.level + '|' + (G.lv ? G.lv.name : '');
  const fresh = key !== R.levelKey;
  R.levelKey = key;
  let no = 0, ng = 0;
  for (let i = 0; i < G.bricks.length; i++) {
    const b = G.bricks[i], glass = b.kind === K_GLASS;
    const im = glass ? R.bGl : R.bOp, idx = glass ? ng++ : no++;
    R.slot[i] = (glass ? MAXB : 0) + idx;
    im.setColorAt(idx, _c.set(b.col));
    const v = R.bv[i];
    if (fresh || v.fresh === undefined) {
      // bricks rise out of the floor row by row, rippling out from the centre
      v.delay = G.cfg.attract ? 0 : 0.15 + b.r * 0.045 + Math.abs(b.x) * 0.03;
      v.rise = 0; v.wob = 0; v.fresh = true;
    }
    const st = im.geometry.attributes.aState;
    st.setXYZW(idx, 0, 0, 1, b.kind === K_FIRE ? 1 : b.kind === K_MOVE ? 2 : b.kind === K_METAL ? 3 : b.kind === K_GOLD ? 4 : 0);
  }
  R.nOp = no; R.nGl = ng;
  // boss shield slots follow the level's bricks
  R.shOp = no; R.shGl = ng;
  const B = G.boss;
  if (B) { for (let i = 0; i < B.shields.length; i++) { const glass = B.kind === 'lantern'; const im = glass ? R.bGl : R.bOp, idx = (glass ? R.shGl : R.shOp) + i; im.setColorAt(idx, _c.set(glass ? '#6a9cff' : ['#c9553b', '#e98a35', '#f2b632'][i % 3])); im.geometry.attributes.aState.setXYZW(idx, 0, 0, 1, glass ? 0 : 0); } }
  R.bOp.count = no + (B && B.kind !== 'lantern' ? B.shields.length : 0);
  R.bGl.count = ng + (B && B.kind === 'lantern' ? B.shields.length : 0);
  R.bOp.instanceColor.needsUpdate = true; R.bGl.instanceColor.needsUpdate = true;
  R.bOp.geometry.attributes.aState.needsUpdate = true; R.bGl.geometry.attributes.aState.needsUpdate = true;
  if (fresh) {
    ['drum', 'dragon', 'lantern'].forEach((k) => { R.boss[k].g.visible = false; });
    R.boss.dragon.segs.visible = false;
    for (let i = 0; i < R.lampLit.length; i++) R.lampLit[i] = 0;
  }
  setLook(G.lv ? G.lv.act || 0 : 0);
}

/* ------------------------------------------------------------ per frame */
function syncBricks(G, dt, rm) {
  const intro = G.phase === 'intro';
  const oS = R.bOp.geometry.attributes.aState, gS = R.bGl.geometry.attributes.aState;
  const t = R.time;
  for (let i = 0; i < G.bricks.length; i++) {
    const b = G.bricks[i], v = R.bv[i], s = R.slot[i], glass = s >= MAXB, idx = glass ? s - MAXB : s, im = glass ? R.bGl : R.bOp;
    if (!b.alive) { if (!v.hidden) { im.setMatrixAt(idx, _zero); v.hidden = true; } continue; }
    v.hidden = false;
    if (v.rise < 1) {
      if (intro || G.cfg.attract || G.phase === 'serve') v.rise = Math.min(1, v.rise + (G.pt > v.delay || rm ? dt * 3.2 : 0));
      else v.rise = 1;
    }
    const k = rm ? 1 : v.rise, e = k < 1 ? 1 - Math.pow(1 - k, 3) : 1;
    const pulse = b.flash * 0.07;
    _v1.set(b.x, -0.5 * (1 - e) + (b.flash > 0.6 ? 0.03 : 0), zOf(b.y));
    _e.set((1 - e) * 0.6, 0, (1 - e) * 0.25 * (b.c % 2 ? 1 : -1)); _q.setFromEuler(_e);
    const sc = (0.6 + 0.4 * e) * (1 + pulse);
    _s.set(sc, (0.3 + 0.7 * e) * (1 + pulse * 1.5), sc);
    _m.compose(_v1, _q, _s); im.setMatrixAt(idx, _m);
    const st = glass ? gS : oS;
    const glow = b.kind === K_FIRE ? 1 : b.kind === K_MOVE ? 0.8 + 0.3 * Math.sin(t * 4 + i) : b.kind === K_GOLD ? 0.7 : 1;
    st.setXYZW(idx, b.flash, b.crack, glow * (0.4 + 0.6 * e), st.getW(idx));
  }
  const B = G.boss;
  if (B) {
    const glass = B.kind === 'lantern', im = glass ? R.bGl : R.bOp, st = glass ? gS : oS, base = glass ? R.shGl : R.shOp;
    for (let i = 0; i < B.shields.length; i++) {
      const sh = B.shields[i];
      if (!sh.alive || B.dead) { im.setMatrixAt(base + i, _zero); continue; }
      _v1.set(sh.x, 0.15 + (glass ? 0.9 : 0.1), zOf(sh.y)); _e.set(0, Math.atan2(sh.y - B.y, sh.x - B.x) + Math.PI / 2, 0); _q.setFromEuler(_e);
      _s.set(0.72, 0.9 + sh.flash * 0.4, 1.4); _m.compose(_v1, _q, _s); im.setMatrixAt(base + i, _m);
      st.setXYZW(base + i, sh.flash, 0, 1.2, 0);
    }
  }
  R.bOp.instanceMatrix.needsUpdate = true; R.bGl.instanceMatrix.needsUpdate = true;
  oS.needsUpdate = true; gS.needsUpdate = true;
}
function syncPaddle(G, dt, rm) {
  const P = G.paddle, D = R.pad, x = lerp(P.px, P.x, G.alpha);
  const half = P.w, len = Math.max(0.01, half * 2 - PAD_H * 2);
  const sq = rm ? 0 : P.squash;
  D.g.position.set(x, PAD_H + 0.04 - sq * 0.03, zOf(PAD_Y));
  D.lean += (clamp(-P.vx * 0.01, -0.12, 0.12) - D.lean) * Math.min(1, dt * 10);
  D.g.rotation.z = rm ? 0 : D.lean;
  D.g.scale.set(1 + sq * 0.05, 1 - sq * 0.15, 1 + sq * 0.08);
  D.mid.scale.set(1, len, 1);
  D.inlay.scale.x = len * 0.92;
  D.capL.position.x = -len / 2; D.capR.position.x = len / 2;
  D.ringL.position.x = -len / 2 + 0.02; D.ringR.position.x = len / 2 - 0.02;
  const laserOn = P.mode === 'laser';
  D.laser += ((laserOn ? 1 : 0) - D.laser) * Math.min(1, dt * 8);
  const lv = D.laser > 0.02;
  D.turL.visible = D.turR.visible = D.tipL.visible = D.tipR.visible = lv;
  if (lv) {
    const tx = half - 0.28;
    D.turL.position.set(-tx, 0.12 + D.laser * 0.16, 0); D.turR.position.set(tx, 0.12 + D.laser * 0.16, 0);
    D.tipL.position.set(-tx, 0.36 + D.laser * 0.16, 0); D.tipR.position.set(tx, 0.36 + D.laser * 0.16, 0);
    D.turL.scale.setScalar(D.laser); D.turR.scale.setScalar(D.laser); D.tipL.scale.setScalar(D.laser * (1 + (P.cool > 0.18 ? 0.6 : 0))); D.tipR.scale.copy(D.tipL.scale);
  }
  R.padGlow.position.set(x, 0.015, zOf(PAD_Y) + 0.05); R.padGlow.scale.set(half * 2 + 1.6, 1.6, 1);
  const col = P.stun > 0 ? '#6a6a7a' : P.mode === 'laser' ? '#ff4a3a' : P.mode === 'catch' ? '#35e6d6' : G.heavyT > 0 ? '#8a94a8' : '#ffc65a';
  R.padInlay.color.set(col).multiplyScalar(P.stun > 0 ? 0.8 : 1.5 + Math.sin(R.time * 6) * 0.2);
  R.padGlowMat.color.set(col).multiplyScalar(0.55 + (rm ? 0 : sq * 0.6));
}
function syncBalls(G, dt, a) {
  const hp = R.halo.geometry.attributes.position, hs = R.halo.geometry.attributes.aSize, ha = R.halo.geometry.attributes.aAlpha, hc = R.halo.geometry.attributes.aCol;
  const fire = G.fireT > 0;
  let li = 0;
  for (let i = 0; i < 12; i++) {
    const b = G.balls[i], m = R.balls[i];
    if (!b.alive || G.phase === 'clear' && G.pt > 1.5) { m.visible = false; ha.array[i] = 0; R.ballGlow.setMatrixAt(i, _zero); continue; }
    m.visible = true;
    const x = lerp(b.px, b.x, G.alpha), y = lerp(b.py, b.y, G.alpha), z = zOf(y);
    m.position.set(x, BALL_R + 0.06, z);
    m.rotation.y = b.ang;
    m.material = fire ? R.ballFire : R.ballMat;
    hp.array[i * 3] = x; hp.array[i * 3 + 1] = BALL_R + 0.06; hp.array[i * 3 + 2] = z;
    _m.makeScale(fire ? 3.4 : 2.8, 1, fire ? 3.4 : 2.8); _m.setPosition(x, 0.02, z); R.ballGlow.setMatrixAt(i, _m); R.ballGlow.setColorAt(i, _c.set(fire ? '#ff6a20' : '#ffb860'));
    hs.array[i] = fire ? 2.4 : 1.7; ha.array[i] = 0.75;
    if (fire) { hc.array[i * 3] = 1; hc.array[i * 3 + 1] = 0.4; hc.array[i * 3 + 2] = 0.1; } else { hc.array[i * 3] = 1; hc.array[i * 3 + 1] = 0.72; hc.array[i * 3 + 2] = 0.35; }
    if (li < 2) { const L = R.ballL[li]; L.position.set(x, 0.75, z); L.intensity = (li === 0 ? 9 : 5) * (R.quality >= (li === 0 ? 1 : 3) ? 1 : 0); L.color.set(fire ? '#ff7a30' : '#ffc77a'); li++; }
    // the trail
    if (!b.stuck && a.state !== 'pause') {
      const sp = Math.hypot(b.vx, b.vy);
      b.trail += dt * (20 + sp * 3);
      while (b.trail > 1) {
        b.trail -= 1;
        if (fire) emitC(FX.add, x + (Math.random() - 0.5) * 0.1, BALL_R + 0.06, z + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5), 0.8 + Math.random(), (Math.random() - 0.5), 0.35, 0.55, 1, 0.42, 0.1, 0.9, -1.5, 1, 0.8);
        else emitC(FX.add, x, BALL_R + 0.06, z, 0, 0, 0, 0.22, 0.42, 1, 0.75, 0.38, 0.55, 0, 0, -0.4);
      }
    }
  }
  for (let k = li; k < 2; k++) R.ballL[k].intensity = 0;
  R.ballGlow.instanceMatrix.needsUpdate = true; R.ballGlow.instanceColor.needsUpdate = true;
  hp.needsUpdate = hs.needsUpdate = ha.needsUpdate = hc.needsUpdate = true;
}
function syncProps(G, dt) {
  // capsules
  for (let i = 0; i < 8; i++) {
    const c = G.caps[i];
    if (!c.alive) { R.caps.setMatrixAt(i, _zero); continue; }
    _v1.set(lerp(c.px, c.x, G.alpha), 0.34, zOf(lerp(c.py, c.y, G.alpha))); _e.set(c.rot, 0, 0); _q.setFromEuler(_e); _s.set(1, 1, 1);
    _m.compose(_v1, _q, _s); R.caps.setMatrixAt(i, _m); R.caps.setColorAt(i, _c.set(POWERS[c.type].col));
    if (Math.random() < dt * 14) emit(FX.add, _v1.x + (Math.random() - 0.5) * 0.6, 0.34, _v1.z, 0, 0.4, 0.6, 0.4, 0.35, POWERS[c.type].col, 0.6, 0, 1);
  }
  R.caps.instanceMatrix.needsUpdate = true; R.caps.instanceColor.needsUpdate = true;
  for (let i = 0; i < 24; i++) {
    const L = G.bolts[i];
    if (!L.alive) { R.bolts.setMatrixAt(i, _zero); continue; }
    _m.makeTranslation(L.x, 0.42, zOf(lerp(L.py, L.y, G.alpha))); R.bolts.setMatrixAt(i, _m);
  }
  R.bolts.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < 16; i++) {
    const e = G.embers[i];
    if (!e.alive) { R.embers.setMatrixAt(i, _zero); continue; }
    const x = lerp(e.px, e.x, G.alpha), z = zOf(lerp(e.py, e.y, G.alpha));
    _s.setScalar(1 + Math.sin(R.time * 30 + i) * 0.15); _v1.set(x, 0.5, z); _q.identity(); _m.compose(_v1, _q, _s); R.embers.setMatrixAt(i, _m);
    if (Math.random() < dt * 40) emitC(FX.add, x, 0.5, z, (Math.random() - 0.5) * 0.6, 0.3, (Math.random() - 0.5) * 0.6, 0.4, 0.5, 1, 0.45, 0.1, 0.8, 0, 1, 0.5);
  }
  R.embers.instanceMatrix.needsUpdate = true;
}
function syncBoss(G, dt, rm) {
  const B = G.boss;
  if (!B) return;
  const V = R.boss[B.kind];
  const bx = lerp(B.px, B.x, G.alpha), by = lerp(B.py, B.y, G.alpha);
  const dying = B.dead ? clamp(B.deadT / 1.2, 0, 1) : 0;
  const show = !B.dead || dying < 1;
  V.g.visible = show;
  const hit = B.inv > 0 ? 1 : 0, glow = 1 + B.mood * 2.5 + hit * 2;
  R.bossMat.userData.glow.value = glow;
  const shake = B.dead && !rm ? (Math.random() - 0.5) * 0.25 : 0;
  const sink = dying * dying * 2.2;
  if (B.kind === 'drum') {
    V.g.position.set(bx + shake, -sink, zOf(by));
    V.g.rotation.y = Math.sin(R.time * 1.3) * 0.15;
    V.skinMat.emissiveIntensity = 0.25 + B.mood * 2;
    V.g.scale.setScalar(1 - dying * 0.3);
  } else if (B.kind === 'dragon') {
    const hx = B.hist[Math.min(2, B.hist.length - 1)];
    V.g.position.set(bx + shake, 0.1 - sink + Math.sin(R.time * 3) * 0.08, zOf(by));
    V.g.rotation.y = Math.atan2(bx - hx.x, -(by - hx.y)) || 0;
    V.segs.visible = show;
    for (let i = 0; i < 8; i++) {
      if (i >= B.segs.length || !show) { V.segs.setMatrixAt(i, _zero); continue; }
      const s = B.segs[i];
      _v1.set(s.x, -sink + Math.sin(R.time * 3 - i * 0.6) * 0.1, zOf(s.y)); _q.identity(); _s.setScalar(s.r / 0.6 * (1 - dying * 0.4)); _m.compose(_v1, _q, _s); V.segs.setMatrixAt(i, _m);
    }
    V.segs.instanceMatrix.needsUpdate = true;
  } else {
    V.g.position.set(bx + shake, 0.15 + Math.sin(R.time * 1.4) * 0.12 - sink, zOf(by));
    V.g.rotation.y = R.time * 0.25;
    V.shellMat.emissiveIntensity = 1 + B.mood * 2 + Math.sin(R.time * 2) * 0.2;
    V.core.scale.setScalar(1 + Math.sin(R.time * 5) * 0.08 + B.mood * 0.3);
  }
  if (!B.dead && Math.random() < dt * 12) emitC(FX.add, bx + (Math.random() - 0.5) * B.r * 2, 0.5 + Math.random() * 1.5, zOf(by) + (Math.random() - 0.5) * B.r, 0, 0.6, 0, 0.8, 0.35, 1, 0.65, 0.25, 0.5, -0.2, 0.5);
  if (B.dead && dying < 1 && Math.random() < dt * 30) { const x = bx + (Math.random() - 0.5) * 2.4, z = zOf(by) + (Math.random() - 0.5) * 2; burst(x, 0.8, z, 10, 4, 1, 0.7, 0.3); }
}
function syncLamps(G, dt) {
  const lit = G.total > 0 ? 1 - G.breakable / G.total : 1;
  const n = R.lampSpots.length, want = G.phase === 'clear' || G.phase === 'win' || G.cfg.attract ? n : Math.floor(lit * n + 1e-6);
  const order = (i) => (i * 7) % n; // light them around the rim, not one side first
  for (let k = 0; k < n; k++) {
    const i = order(k), on = k < want;
    const prev = R.lampLit[i];
    R.lampLit[i] += ((on ? 1 : 0) - prev) * Math.min(1, dt * 6);
    if (on && prev < 0.05 && R.lampLit[i] >= 0.05) { const p = R.lampSpots[i]; burst(p[0], 0.85, p[1], 6, 2, 1, 0.75, 0.3); }
    const s = R.lampLit[i];
    if (s < 0.02) { R.flames.setMatrixAt(i, _zero); continue; }
    const p = R.lampSpots[i], fl = 1 + Math.sin(R.time * 13 + i * 2.1) * 0.12 + Math.sin(R.time * 7.3 + i) * 0.08;
    _v1.set(p[0], 0.7, p[1]); _q.identity(); _s.set(s, s * fl, s); _m.compose(_v1, _q, _s); R.flames.setMatrixAt(i, _m);
  }
  R.flames.instanceMatrix.needsUpdate = true;
}
function burst(x, y, z, n, sp, r, g, b) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, e = Math.random() * 1.2, s = sp * (0.4 + Math.random() * 0.8);
    emitC(FX.add, x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + 1, Math.sin(a) * Math.cos(e) * s, 0.35 + Math.random() * 0.4, 0.22 + Math.random() * 0.2, r, g, b, 1, 6, 1.5, 0);
  }
}
const FW_COLS = [[1, 0.55, 0.15], [1, 0.3, 0.55], [0.4, 0.75, 1], [0.5, 1, 0.55], [1, 0.9, 0.4], [0.85, 0.5, 1]];
function firework(x, y, z, big) {
  const c = FW_COLS[(Math.random() * FW_COLS.length) | 0], c2 = FW_COLS[(Math.random() * FW_COLS.length) | 0];
  const n = big ? 110 : 60, sp = big ? 7 : 5;
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * TAU, rr = Math.sqrt(1 - u * u), s = sp * (0.85 + Math.random() * 0.3);
    const cc = i % 3 ? c : c2;
    emitC(FX.add, x, y, z, Math.cos(a) * rr * s, u * s, Math.sin(a) * rr * s, 1.4 + Math.random() * 0.8, 0.55, cc[0], cc[1], cc[2], 1, 2.2, 1.6, -0.3);
  }
  emitC(FX.add, x, y, z, 0, 0, 0, 0.35, 6, 1, 0.9, 0.7, 1, 0, 0, 0.5);
  R.flashSky = Math.max(R.flashSky, big ? 0.4 : 0.2);
}

/* ------------------------------------------------------------ what the core's events look like */
function onEvent(e) {
  const G = R.G, a = ARC, rm = a.reducedMotion, x = e.x, z = zOf(e.y);
  switch (e.type) {
    case 'break': {
      const kind = e.a, col = e.s;
      _c.set(col);
      const cr = _c.r, cg = _c.g, cb = _c.b;
      if (kind === K_GLASS) {
        for (let i = 0; i < 14; i++) shard(R.gsh, x + (Math.random() - 0.5) * 0.8, 0.25 + Math.random() * 0.15, z + (Math.random() - 0.5) * 0.35, (Math.random() - 0.5) * 6, 3 + Math.random() * 4, (Math.random() - 0.5) * 6, 0.9 + Math.random() * 0.6, 0.9 + Math.random() * 0.5, col, R.gshards);
        for (let i = 0; i < 16; i++) emitC(FX.add, x + (Math.random() - 0.5) * 0.8, 0.3, z, (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 0.5, 0.3, 0.8 + cr * 0.2, 0.9 + cg * 0.1, 1, 1, 4, 1, 0);
      } else {
        const n = kind === K_METAL ? 10 : 8;
        for (let i = 0; i < n; i++) shard(R.sh, x + (Math.random() - 0.5) * 0.8, 0.2 + Math.random() * 0.2, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 5, 2.5 + Math.random() * 3.5, (Math.random() - 0.5) * 5, 0.9 + Math.random() * 0.6, 1.1 + Math.random() * 0.6, col, R.shards);
        for (let i = 0; i < 6; i++) emit(FX.soft, x + (Math.random() - 0.5) * 0.8, 0.2, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 1.2, 0.4 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 0.9 + Math.random() * 0.5, 0.9, '#b8a090', 0.4, -0.2, 2, 2.2);
        burst(x, 0.3, z, 10, 3.2, Math.min(1, cr * 1.4 + 0.3), Math.min(1, cg * 1.2 + 0.2), cb * 0.8 + 0.1);
      }
      if (e.k === 1) burst(x, 0.3, z, 8, 4, 1, 0.45, 0.1);
      ring(x, 0.03, z, col, 1.4, 0.4);
      if (e.b >= 10 && e.b % 5 === 0 && !rm) { R.cam.punch = Math.min(1, R.cam.punch + 0.35); R.fx && R.fx.kick(1.5); }
      break;
    }
    case 'crack': case 'gold': {
      for (let i = 0; i < 6; i++) emitC(FX.add, x + (Math.random() - 0.5) * 0.8, 0.45, z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3, 0.3, 0.2, 1, 0.85, 0.5, 1, 6, 1, 0);
      break;
    }
    case 'boom': {
      burst(x, 0.4, z, 36, 7, 1, 0.55, 0.15);
      for (let i = 0; i < 10; i++) emit(FX.soft, x + (Math.random() - 0.5) * 1.2, 0.3, z + (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 2, 0.8 + Math.random(), (Math.random() - 0.5) * 2, 1.3 + Math.random(), 1.6, '#5a4a40', 0.55, -0.3, 1.5, 2.5);
      for (let i = 0; i < 14; i++) emitC(FX.add, x, 0.5, z, (Math.random() - 0.5) * 9, 3 + Math.random() * 6, (Math.random() - 0.5) * 9, 0.7 + Math.random() * 0.5, 0.18, 1, 0.8, 0.3, 1, 12, 0.5, 0);
      ring(x, 0.04, z, '#ffb040', 3.2, 0.55);
      R.flashL.position.set(x, 1.2, z); R.flashL.intensity = 30;
      if (!rm) { a.shake = Math.min(14, (a.shake || 0) + 3.5); R.cam.punch = Math.min(1, R.cam.punch + 0.3); }
      break;
    }
    case 'chain': {
      if (!rm) { R.cam.punch = 1; a.shake = Math.min(18, (a.shake || 0) + 4 + e.a * 0.4); if (R.fx) { R.fx.kick(Math.min(8, 2 + e.a * 0.4)); R.fx.flash(Math.min(0.4, 0.08 + e.a * 0.02), '#ffd9a0'); } }
      break;
    }
    case 'paddle': {
      const sp = e.a;
      burst(x, 0.3, zOf(PAD_Y) - 0.25, 6, 2.5, 1, 0.8, 0.5);
      ring(x, 0.03, zOf(PAD_Y) - 0.2, '#ffd08a', 0.9 + sp * 0.03, 0.35);
      break;
    }
    case 'wall': {
      for (let i = 0; i < 5; i++) emitC(FX.add, x, 0.3, z, e.a * (1 + Math.random() * 2) + (Math.random() - 0.5), 0.5 + Math.random(), -e.b * (1 + Math.random() * 2) + (Math.random() - 0.5), 0.3, 0.2, 1, 0.75, 0.4, 1, 4, 1, 0);
      break;
    }
    case 'launch': ring(x, 0.03, z, '#ffe0a0', 1.2, 0.4); break;
    case 'laser': {
      const P = G.paddle;
      for (const s of [-1, 1]) emitC(FX.add, P.x + s * (P.w - 0.28), 0.6, zOf(PAD_Y), 0, 1, -0.5, 0.15, 0.6, 1, 0.3, 0.2, 1, 0, 0, 0);
      break;
    }
    case 'zap': burst(x, 0.4, z, 8, 3, 1, 0.35, 0.25); break;
    case 'capSpawn': ring(x, 0.03, z, POWERS[e.s].col, 1, 0.4); break;
    case 'power': {
      const col = POWERS[e.s].col; _c.set(col);
      for (let i = 0; i < 26; i++) { const ang = i / 26 * TAU; emitC(FX.add, x + Math.cos(ang) * 0.5, 0.3, zOf(PAD_Y) + Math.sin(ang) * 0.3, Math.cos(ang) * 2.5, 1.5 + Math.random(), Math.sin(ang) * 1.5, 0.6, 0.3, _c.r, _c.g, _c.b, 1, 2, 1, 0); }
      ring(x, 0.03, zOf(PAD_Y), col, 2.4, 0.5);
      if (e.a && R.fx) R.fx.flash(0.08, col);
      break;
    }
    case 'catch': ring(x, 0.03, zOf(PAD_Y), '#35e6d6', 1.2, 0.35); break;
    case 'lost': {
      burst(x, 0.3, zOf(PAD_Y) + 1.2, 30, 4, 1, 0.4, 0.2);
      R.cam.dip = 1;
      if (R.fx && !rm) R.fx.flash(0.18, '#401010');
      break;
    }
    case 'clear': {
      R.fwT = 0; R.fwN = G.cfg.attract ? 2 : 7;
      if (R.fx && !rm) { R.fx.letterbox(1, 2.6); R.fx.flash(0.2, '#fff0c8'); }
      break;
    }
    case 'bossHit': {
      burst(x, 0.8, z, 22, 5, 1, 0.6, 0.2);
      ring(x, 0.05, z, '#ffb040', 2.4, 0.4);
      if (!rm) { a.shake = Math.min(14, (a.shake || 0) + 3); if (R.fx) R.fx.kick(2); }
      break;
    }
    case 'bossDown': {
      for (let i = 0; i < 5; i++) firework(x + (Math.random() - 0.5) * 4, 3 + Math.random() * 3, z + (Math.random() - 0.5) * 3, true);
      for (let i = 0; i < 40; i++) shard(R.sh, x + (Math.random() - 0.5) * 2, 0.5 + Math.random(), z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 9, 4 + Math.random() * 6, (Math.random() - 0.5) * 9, 1.6, 1.5, '#e0a54a', R.shards);
      if (!rm) { a.shake = 20; R.cam.punch = 1; if (R.fx) { R.fx.kick(7); R.fx.flash(0.45, '#ffe0b0'); R.fx.letterbox(1, 2.4); } }
      break;
    }
    case 'bossFire': burst(x, 0.8, z, 12, 2.5, 1, 0.5, 0.15); break;
    case 'stun': burst(x, 0.4, zOf(PAD_Y), 24, 4, 1, 0.5, 0.15); if (!rm) a.shake = Math.min(14, (a.shake || 0) + 5); break;
    case 'shield': shard(R.sh, x, 0.4, z, 0, 3, 0, 1, 1, e.s || '#c9553b', R.shards); burst(x, 0.4, z, 10, 3, 1, 0.7, 0.4); break;
    case 'spawnRow': ring(x, 0.05, z, '#6a9cff', 4, 0.8); break;
    case 'level': R.cam.init = R.cam.init && !(G && !G.cfg.attract); break;
    case 'comboEnd': break;
  }
}

function frame(a, G, dt) {
  const rm = a.reducedMotion;
  R.time += dt;
  R.uTime.value = R.time;
  R.skyU.uTime.value = R.time;
  if (G.version !== R.seenVersion || G !== R.G) { R.seenVersion = G.version; newLevel(G); }
  R.evRead = events(G, Math.max(R.evRead, G.evN - 400), onEvent);
  updateCamera(a, G, dt);
  syncBricks(G, dt, rm);
  syncPaddle(G, dt, rm);
  syncBalls(G, dt, a);
  syncProps(G, dt);
  syncBoss(G, dt, rm);
  syncLamps(G, dt);
  // rings
  for (let i = 0; i < R.rings.length; i++) {
    const s = R.rings[i]; if (!s.m.visible) continue;
    s.t += dt; const k = s.t / s.dur;
    if (k >= 1) { s.m.visible = false; continue; }
    const e = 1 - Math.pow(1 - k, 3);
    s.m.scale.setScalar(0.2 + e * s.max);
    s.m.material.color.copy(s.col).multiplyScalar((1 - k) * (1 - k));
  }
  // fireworks after a clear, and now and then on festival night
  if (R.fwN > 0) { R.fwT -= dt; if (R.fwT <= 0) { R.fwN--; R.fwT = 0.32 + Math.random() * 0.25; firework((Math.random() - 0.5) * 10, 5 + Math.random() * 4, zOf(9 + Math.random() * 6), true); } }
  if (R.look === 2 && !G.cfg.attract && TIERS[R.quality].decor) { R.bgFw -= dt; if (R.bgFw <= 0) { R.bgFw = 3 + Math.random() * 5; firework((Math.random() - 0.5) * 30, 10 + Math.random() * 6, -24 - Math.random() * 8, false); } }
  // monsoon rain
  if (R.look === 1 && dt > 0) {
    const n = Math.floor(dt * 90 * FX.density + Math.random());
    for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 18, z = zOf(Math.random() * 19 - 1); emitC(FX.soft, x, 6 + Math.random() * 3, z, -0.6, -14, 0, 0.45, 0.18, 0.75, 0.82, 0.95, 0.45, 0, 0, -0.6); if (Math.random() < 0.3) emitC(FX.add, x, 0.03, z, 0, 0.3, 0, 0.25, 0.25, 0.5, 0.6, 0.75, 0.6, 0, 0, 1.5); }
  }
  // sky lanterns
  if (R.skyLan.visible) {
    const show = R.look === 2 ? 1 : R.look === 0 ? 0.35 : 0.1;
    for (let i = 0; i < R.skyLanData.length; i++) {
      const d = R.skyLanData[i];
      d.y += dt * d.s * 0.8; if (d.y > 30) d.y = 2;
      const s = i / R.skyLanData.length < show ? 1 : 0;
      _v1.set(d.x + Math.sin(R.time * 0.3 + d.ph) * 0.8, d.y, d.z); _q.identity(); _s.setScalar(s * (0.8 + 0.2 * Math.sin(R.time * 4 + d.ph)));
      _m.compose(_v1, _q, _s); R.skyLan.setMatrixAt(i, _m);
    }
    R.skyLan.instanceMatrix.needsUpdate = true;
  }
  R.flashL.intensity *= Math.exp(-dt * 9);
  R.flashSky *= Math.exp(-dt * 3); R.skyU.uFlash.value = rm ? 0 : R.flashSky;
  R.dangerMat.opacity = 0.22 + 0.12 * Math.sin(R.time * 3) + (G.phase === 'lost' ? 0.4 * Math.max(0, 1 - G.pt) : 0);
  stepPool(FX.add, dt); stepPool(FX.soft, dt);
  stepShards(R.sh, R.shards, dt); stepShards(R.gsh, R.gshards, dt);
}
function render(a, G) {
  const r = R.renderer, cam = R.camera;
  R.sky.position.copy(cam.position);
  const scale = a.h * r.getPixelRatio() * 0.5 / Math.tan(cam.fov * Math.PI / 360);
  FX.add.mat.uniforms.uScale.value = scale; FX.soft.mat.uniforms.uScale.value = scale; R.haloMat.uniforms.uScale.value = scale;
  r.shadowMap.needsUpdate = false;
  if (REFL.on) { const st = R.skyU.uStars.value; R.skyU.uStars.value = 0; renderRefl(cam); R.skyU.uStars.value = st; }
  r.shadowMap.needsUpdate = r.shadowMap.enabled;
  R.fx.render(R.scene, cam);
}

/* ------------------------------------------------------------ the view the core talks to */
const _pv = new THREE.Vector3();
const view = {
  three: true,
  init(a) { ARC = a; queueBuild(a); return true; },
  resize(a) { if (R.ready || R.renderer) resize3D(a); },
  graphics(level) { if (level === 'auto') { R.lockQ = false; if (R.fx) R.fx.setQuality(TIERS[Math.max(0, R.quality)].post ? R.quality : 0, false); return; } R.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  newLevel(G) { newLevel(G); },
  render(a, G, ctx) {
    const t0 = now();
    const dtRaw = R.lastNow ? (t0 - R.lastNow) / 1000 : 1 / 60, dt = clamp(dtRaw, 0.0005, 0.1); R.lastNow = t0;
    if (!R.ready) {
      if (R.failed) { if (!R.told) { R.told = true; fallback2D(); } return false; }
      // build a slice of the stage each frame, so the menu stays responsive
      while (R.tasks.length && now() - t0 < 12) {
        const task = R.tasks.shift(), ts = now();
        try { task(); } catch (e) { console.warn('diya-breaker build', e && e.message); R.failed = R.failed || !R.renderer; }
        R.taskLog.push(Math.round(now() - ts));
      }
      return false;
    }
    let lost = R.lost;
    try { lost = lost || r().getContext().isContextLost(); } catch (e) { lost = true; }
    if (lost) {
      ctx.fillStyle = 'rgba(8,6,5,.9)'; ctx.fillRect(0, 0, a.w, a.h);
      ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = '#fbf5ec'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Graphics paused. Restoring...', a.w / 2, a.h / 2);
      return true;
    }
    measureFps(dtRaw);
    const fdt = a.state === 'pause' ? 0 : dt;
    const tA = now();
    if (R.ff && R.ff.length < 8) R.ff.push(0);
    frame(a, G, fdt);
    const tB = now();
    render(a, G);
    R.prof = (R.prof || 0) * 0.9 + (tB - tA) * 0.1; R.prof2 = (R.prof2 || 0) * 0.9 + (now() - tB) * 0.1;
    if (R.ff && R.ff.length <= 8 && R.ff[R.ff.length - 1] === 0) R.ff[R.ff.length - 1] = Math.round(now() - tA);
    return true;
  },
  project(gx, gy, h, out) {
    if (!R.ready) { out.x = a2x(gx); out.y = 0; out.on = false; return false; }
    _pv.set(gx, h, zOf(gy)).project(R.camera);
    out.x = (_pv.x * 0.5 + 0.5) * ARC.w; out.y = (0.5 - _pv.y * 0.5) * ARC.h;
    out.on = _pv.z < 1 && out.x > -20 && out.x < ARC.w + 20 && out.y > -20 && out.y < ARC.h + 20;
    return true;
  },
  paddleLine() {
    if (!R.ready || R.line.x1 - R.line.x0 < 4) return { x0: ARC.w * 0.05, x1: ARC.w * 0.95 };
    return R.line;
  },
  debug() {
    if (!R.ready) return { quality: R.quality, fps: 0, ready: false };
    const inf = R.renderer.info.render;
    return { quality: R.quality, fps: Math.round(R.fps), soft: R.soft, post: !!(R.fx && R.fx.enabled), refl: REFL.on, calls: inf.calls, tris: inf.triangles, ready: true, tasks: R.taskLog.join(','), ff: R.ff ? R.ff.join(',') : '', prof: Math.round(R.prof), prof2: Math.round(R.prof2) };
  },
  dev: { quality: (q) => { R.lockQ = true; setQuality(q); }, setQuality: (q) => { R.lockQ = true; setQuality(q); }, stage: () => R }
};
const r = () => R.renderer;
const a2x = (gx) => (ARC ? ARC.w / 2 + gx * ARC.w / 15 : 0);
function fallback2D() {
  // WebGL refused to start after all: reload into the 2D edition
  try { sessionStorage.setItem('diya-breaker.2d', '1'); } catch (e) { /* private mode */ }
  if (ARC) ARC.panel({ eyebrow: 'Diya Breaker', title: '3D graphics <em>unavailable</em>', html: '<p>This browser could not start WebGL. The 2D edition of the game will load instead.</p>', actions: [{ label: 'Play in 2D', primary: true, on: () => { location.reload(); } }, { label: 'All games', href: '/games' }] });
}

// A last check that this browser can really draw 3D; if not, the 2D edition plays instead.
function canGL() {
  try {
    if (sessionStorage.getItem('diya-breaker.2d') === '1') { sessionStorage.removeItem('diya-breaker.2d'); return false; }
  } catch (e) { /* private mode */ }
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return false;
    try { const e = gl.getExtension('WEBGL_debug_renderer_info'); GLINFO.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(e ? String(gl.getParameter(e.UNMASKED_RENDERER_WEBGL)) : ''); } catch (err) { GLINFO.soft = false; }
    const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext();
    return true;
  } catch (e) { return false; }
}
if (canGL()) boot(view);
else { const s = document.createElement('script'); s.src = '/games/diya-breaker/game.js'; document.body.appendChild(s); }
