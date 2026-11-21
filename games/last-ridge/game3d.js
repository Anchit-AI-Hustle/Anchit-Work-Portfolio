import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX, createSkyEnv, isSoftRenderer } from '/games/shared/fx3d.js';
import { boot } from './core.js';
import * as S from './sim.js';
import * as D from './data.js';

/*
 * Last Ridge, the 3D view. The world is built from the rules grid: merged
 * walls with world-scaled textures, containers, sandbags, barriers, rocks,
 * masts, tanks and barrels, with the land and the sky beyond the fight.
 * Soldiers are human.js people in helmets and plate carriers holding their
 * rifles; the weapon in your hands is drawn in front of the world. Every hit
 * is sparks and dust from vfx.js; the grade, bloom and letterbox are fx3d.js.
 * Built a piece at a time after the menu is up, tiered by quality.
 */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
const CS = D.CS;
function hash(i) { let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }

// Models: one builder per thing, so a library model can replace each without touching the rest.
//   soldier  rigFor() (human.js rig + kitGeos helmet and vest), buildFallbackFigures() for far or low tiers
//   weapon   buildViewModel() make(id) for first person, buildGuns() for the guns people carry
//   vehicle  buildTruck(), buildHeli(), buildDrone()
//   prop     buildCrate(), buildBarrels(), the map jobs in buildJobs() (walls, cover, decor)
const TIERS = [
  { px: 0.6, shadow: false, map: 512, post: false, rigs: 0, tex: 256, decor: 0.5, weather: 0.35, fx: 0 },
  { px: 0.8, shadow: false, map: 1024, post: true, rigs: 6, tex: 256, decor: 1, weather: 0.6, fx: 1 },
  { px: 0.92, shadow: true, map: 1024, post: true, rigs: 10, tex: 512, decor: 1, weather: 1, fx: 2 },
  { px: 1, shadow: true, map: 2048, post: true, rigs: 14, tex: 512, decor: 1, weather: 1, fx: 3 },
];
let ARC = null, R = null;
const V = { name: '3d', three: true, flat: false, letter: 0, aimOn: false, touch: null };

/* ================================================================ procedural textures */
const TEXC = {};
function noiseField(n, cells, oct, seed) {
  const out = new Float32Array(n * n);
  for (let o = 0, amp = 1, c = cells, tot = 0; o < oct; o++, amp *= 0.5, c *= 2) {
    tot += amp;
    const g = new Float32Array((c + 1) * (c + 1));
    for (let i = 0; i < g.length; i++) g[i] = hash(i * 7919 + seed * 131 + o * 104729);
    for (let i = 0; i < c; i++) g[c * (c + 1) + i] = g[i];
    for (let j = 0; j <= c; j++) g[j * (c + 1) + c] = g[j * (c + 1)];
    for (let y = 0; y < n; y++) {
      const fy = y / n * c, iy = fy | 0, ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < n; x++) {
        const fx = x / n * c, ix = fx | 0, tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const a = g[iy * (c + 1) + ix], b = g[iy * (c + 1) + ix + 1], cc = g[(iy + 1) * (c + 1) + ix], d = g[(iy + 1) * (c + 1) + ix + 1];
        out[y * n + x] += amp * lerp(lerp(a, b, sx), lerp(cc, d, sx), sy);
      }
    }
    if (o === oct - 1) for (let i = 0; i < out.length; i++) out[i] /= tot;
  }
  return out;
}
function makeTex(cv, rep, srgb) {
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = R ? R.aniso : 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (rep) t.repeat.set(rep, rep);
  return t;
}
function normalFrom(h, n, k) {
  const cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d'), im = g.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const l = h[y * n + ((x - 1 + n) % n)], r = h[y * n + ((x + 1) % n)], u = h[((y - 1 + n) % n) * n + x], d = h[((y + 1) % n) * n + x];
    let nx = (l - r) * k, ny = (u - d) * k, nz = 1; const L = Math.hypot(nx, ny, nz); nx /= L; ny /= L; nz /= L;
    const i = (y * n + x) * 4; im.data[i] = (nx * 0.5 + 0.5) * 255; im.data[i + 1] = (ny * 0.5 + 0.5) * 255; im.data[i + 2] = (nz * 0.5 + 0.5) * 255; im.data[i + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return makeTex(cv, 0, false);
}
// kind -> { map, normalMap, roughnessMap } made from one height field
const PAL = {
  snow: [[226, 232, 238], [196, 206, 218], 0.85, 4, 3], wet: [[62, 66, 72], [38, 41, 46], 0.35, 8, 4], cobble: [[136, 118, 98], [92, 80, 68], 0.7, 10, 4], sand: [[204, 160, 112], [168, 126, 84], 0.9, 6, 3],
  road: [[78, 78, 80], [56, 56, 58], 0.8, 12, 4], dirt: [[128, 106, 82], [96, 80, 62], 0.92, 6, 4], plaster: [[198, 182, 160], [158, 140, 118], 0.9, 6, 4], concrete: [[150, 150, 146], [112, 112, 108], 0.85, 8, 4],
  stone: [[168, 150, 126], [118, 104, 88], 0.85, 6, 4], rock: [[118, 116, 112], [74, 72, 70], 0.9, 5, 5], wood: [[134, 98, 62], [92, 66, 40], 0.75, 3, 3], metal: [[120, 124, 128], [80, 84, 88], 0.45, 10, 3],
  sandbag: [[146, 128, 96], [108, 94, 70], 0.95, 8, 4], brick: [[150, 88, 64], [110, 62, 46], 0.85, 8, 3],
};
function texSet(kind, size) {
  const key = kind + size; if (TEXC[key]) return TEXC[key];
  const n = size, P = PAL[kind] || PAL.concrete;
  const h = noiseField(n, P[3], P[4], kind.length * 17 + n);
  const cv = document.createElement('canvas'); cv.width = cv.height = n;
  const g = cv.getContext('2d'), im = g.createImageData(n, n);
  const rc = document.createElement('canvas'); rc.width = rc.height = n;
  const rg = rc.getContext('2d'), ri = rg.createImageData(n, n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const i = y * n + x;
    let v = h[i];
    // per kind structure: planks, bricks, cobbles, ribs, tyre lines
    if (kind === 'wood') v = v * 0.5 + 0.5 * (0.5 + 0.5 * Math.sin((x / n) * TAU * 6 + v * 3)) * ((y % (n / 4)) < 2 ? 0.2 : 1);
    if (kind === 'brick') { const row = Math.floor(y / (n / 8)), off = row % 2 ? n / 8 : 0; const mortar = (y % (n / 8)) < 2 || ((x + off) % (n / 4)) < 2; v = mortar ? 0.15 : v * 0.7 + 0.35; }
    if (kind === 'cobble') { const cx = Math.floor(x / (n / 8)) + (Math.floor(y / (n / 8)) % 2) * 0.5, gx = (x / (n / 8) + (Math.floor(y / (n / 8)) % 2) * 0.5) % 1, gy = (y / (n / 8)) % 1; const e = Math.min(gx, 1 - gx, gy, 1 - gy); v = e < 0.08 ? 0.12 : v * 0.6 + 0.3 + hash(cx * 31 + Math.floor(y / (n / 8))) * 0.2; }
    if (kind === 'metal') v = v * 0.4 + 0.6 * (0.5 + 0.5 * Math.cos((x / n) * TAU * 10));
    if (kind === 'road') { v = v * 0.8 + hash(i * 13) * 0.2; }
    if (kind === 'concrete' || kind === 'plaster') v = v * 0.85 + hash(i * 7) * 0.15;
    if (kind === 'snow') v = v * 0.7 + hash(i * 3) * 0.08 + 0.2;
    if (kind === 'wet') v = v * 0.8 + hash(i * 3) * 0.2;
    v = clamp(v, 0, 1);
    const k = v, o = i * 4;
    im.data[o] = lerp(P[1][0], P[0][0], k); im.data[o + 1] = lerp(P[1][1], P[0][1], k); im.data[o + 2] = lerp(P[1][2], P[0][2], k); im.data[o + 3] = 255;
    const rough = clamp(P[2] + (0.5 - v) * 0.3 + (kind === 'wet' ? (v < 0.45 ? -0.25 : 0) : 0), 0.05, 1) * 255;
    ri.data[o] = ri.data[o + 1] = ri.data[o + 2] = rough; ri.data[o + 3] = 255;
    h[i] = v;
  }
  g.putImageData(im, 0, 0); rg.putImageData(ri, 0, 0);
  const T = { map: makeTex(cv, 0, true), normalMap: normalFrom(h, n, kind === 'snow' ? 2 : kind === 'cobble' || kind === 'brick' ? 6 : 4), roughnessMap: makeTex(rc, 0, false) };
  TEXC[key] = T;
  return T;
}
function windowsTex(lit, wallH) {
  const key = 'win' + lit + wallH; if (TEXC[key]) return TEXC[key];
  const cv = document.createElement('canvas'); cv.width = 128; cv.height = 256;
  const g = cv.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 256);
  // two storeys of windows per 2 m wide, wallH tall face
  for (let f = 0; f < 2; f++) {
    const y = 256 - (f + 1) * 118 + 20;
    const on = lit && hash(f * 3 + lit * 7) > 0.35;
    g.fillStyle = on ? '#ffc070' : '#1a2230'; g.fillRect(40, y, 48, 66);
  }
  const t = makeTex(cv, 0, true); TEXC[key] = t; return t;
}

/* ================================================================ geometry: world UV boxes */
class GB {
  constructor() { this.p = []; this.n = []; this.u = []; this.c = []; this.i = []; }
  quad(a, b, c, d, nx, ny, nz, ua, ub, uc, ud, col) {
    const base = this.p.length / 3;
    this.p.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) { this.n.push(nx, ny, nz); if (col) this.c.push(col[0], col[1], col[2]); }
    this.u.push(...ua, ...ub, ...uc, ...ud);
    this.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  box(x0, y0, z0, x1, y1, z1, us, vs, mask, col) {
    us = us || 2; vs = vs || us; mask = mask == null ? 63 : mask;
    if (mask & 1) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, [z1 / us, y0 / vs], [z0 / us, y0 / vs], [z0 / us, y1 / vs], [z1 / us, y1 / vs], col);
    if (mask & 2) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, [z0 / us, y0 / vs], [z1 / us, y0 / vs], [z1 / us, y1 / vs], [z0 / us, y1 / vs], col);
    if (mask & 4) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, [x0 / us, z1 / us], [x1 / us, z1 / us], [x1 / us, z0 / us], [x0 / us, z0 / us], col);
    if (mask & 8) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, [x0 / us, z0 / us], [x1 / us, z0 / us], [x1 / us, z1 / us], [x0 / us, z1 / us], col);
    if (mask & 16) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, [x0 / us, y0 / vs], [x1 / us, y0 / vs], [x1 / us, y1 / vs], [x0 / us, y1 / vs], col);
    if (mask & 32) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, [x1 / us, y0 / vs], [x0 / us, y0 / vs], [x0 / us, y1 / vs], [x1 / us, y1 / vs], col);
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    if (this.c.length) g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.i); g.computeBoundingSphere();
    return g;
  }
}
function mergeGeos(list) {
  // list of [geometry, matrix, colour]; non indexed merge with vertex colours
  let n = 0; for (const [g] of list) n += (g.index ? g.index.count : g.attributes.position.count);
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0; const v = new THREE.Vector3(), nm = new THREE.Matrix3(), c = new THREE.Color();
  for (const [g0, m, cc] of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    const P = g.attributes.position, N = g.attributes.normal, U = g.attributes.uv;
    nm.getNormalMatrix(m); c.set(cc || '#ffffff');
    for (let i = 0; i < P.count; i++, o++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m); pos[o * 3] = v.x; pos[o * 3 + 1] = v.y; pos[o * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); nor[o * 3] = v.x; nor[o * 3 + 1] = v.y; nor[o * 3 + 2] = v.z;
      col[o * 3] = c.r; col[o * 3 + 1] = c.g; col[o * 3 + 2] = c.b;
      if (U) { uv[o * 2] = U.getX(i); uv[o * 2 + 1] = U.getY(i); }
    }
    if (g !== g0) g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
const M4 = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx || 1, sy == null ? (sx || 1) : sy, sz == null ? (sx || 1) : sz));
const BOX = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const CYL = (a, b, h, s) => new THREE.CylinderGeometry(a, b, h, s || 12);
function std(o) { return new THREE.MeshStandardMaterial(o); }
// snow settles on whatever faces up (the ridge)
function snowy(mat, amt) {
  if (!amt) return mat;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSnow = { value: amt };
    sh.vertexShader = 'varying vec3 vWN;\n' + sh.vertexShader.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvWN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = 'uniform float uSnow;\nvarying vec3 vWN;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\nfloat sk = smoothstep(0.55, 0.85, vWN.y) * uSnow; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.94, 0.97), sk);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.8, smoothstep(0.55, 0.85, vWN.y) * uSnow);');
  };
  mat.customProgramCacheKey = () => 'snow' + amt;
  return mat;
}

/* ================================================================ renderer, sky, post */
function softProbe() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch (e) { return false; }
}
function pxFor(a, q) {
  // a software renderer draws every pixel on the CPU: hold it to a pixel budget instead of a ratio
  const pr = a.dpr * TIERS[Math.max(0, q)].px;
  if (!R || !R.soft || R.lockQ) return pr;
  const budget = q <= 0 ? 150000 : q === 1 ? 260000 : 420000;
  return Math.max(0.3, Math.min(pr, Math.sqrt(budget / Math.max(1, a.w * a.h))));
}
function setup(arc) {
  let renderer;
  const soft0 = softProbe();
  try { renderer = new THREE.WebGLRenderer({ canvas: arc.canvas, antialias: !soft0, powerPreference: 'high-performance' }); } catch (e) { return false; }
  if (!renderer.getContext()) return false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#c4ccd6', 0.012);
  const camera = new THREE.PerspectiveCamera(72, 1, 0.04, 700); camera.rotation.order = 'YXZ';
  scene.add(camera);
  const hemi = new THREE.HemisphereLight('#c9d6e6', '#6a5a48', 1.2); scene.add(hemi);
  const sun = new THREE.DirectionalLight('#ffd2a8', 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -36; sc.right = 36; sc.top = 36; sc.bottom = -36; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.05;
  scene.add(sun, sun.target);
  const flashL = new THREE.PointLight('#ffc27a', 0, 9, 2); scene.add(flashL);
  const soft = soft0 || isSoftRenderer(renderer);
  R = { renderer, scene, camera, hemi, sun, flashL, soft, q: -1, lockQ: false, fps: 60, ft: 0, fn: 0, qT: 0, aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()), time: 0, last: 0, lost: false,
    camPos: new THREE.Vector3(), map: null, jobs: [], fx: null, env: null, vfx: null, vfxState: 0, hu: null, huState: 0, rigs: [], tracers: null, holes: null, built: '', look: null, rs: 1, up: 0, progPending: false,
    lamps: [new THREE.PointLight('#ffd8a8', 0, 30, 1.6), new THREE.PointLight('#ffd8a8', 0, 30, 1.6)] };
  R.fx = createFX(renderer, { arc, preset: 'natural', intro: { dist: 14 }, results: { dist: 14 }, handheld: { amount: 0.6 }, dof: { results: 0.6 } });
  arc.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.lost = true; });
  arc.canvas.addEventListener('webglcontextrestored', () => { R.lost = false; });
  buildDynamic();
  setQuality(soft ? 0 : arc.device === 'desktop' ? 3 : arc.device === 'tablet' ? 2 : 1);
  return true;
}
// At quality 0 (and on a software renderer) the world wears simple diffuse materials; full ones come back above it.
const CHEAP = new Map();
function cheapOf(m) {
  let c = CHEAP.get(m); if (c) return c;
  c = new THREE.MeshLambertMaterial({ map: m.map || null, color: m.color, vertexColors: m.vertexColors, emissive: m.emissive, emissiveMap: m.emissiveMap || null, side: m.side, transparent: m.transparent, opacity: m.opacity, flatShading: false });
  CHEAP.set(m, c); return c;
}
function applyCheap(root) {
  const cheap = R.q === 0;
  root.traverse((o) => {
    if (!o.isMesh || !o.material || Array.isArray(o.material)) return;
    if (o.material.userData && o.material.userData.keepMat) return;
    if (!o.userData.full) { if (!o.material.isMeshStandardMaterial) return; o.userData.full = o.material; }
    o.material = cheap ? cheapOf(o.userData.full) : o.userData.full;
  });
}
// Quality, split by what it costs. Resolution, shadow map size and the dynamic scale change at any time.
// Anything that changes a shader program (shadows on or off, the lamp lights, cheap materials, the post
// chain and the effect pools) waits for a moment off play: the menu, a pause or the results.
function setQuality(q, pin) {
  q = clamp(q | 0, 0, 3); if (pin) R.lockQ = true;
  if (R.q === q) return;
  R.q = q; const T = TIERS[q];
  if (T.shadow && R.sun.shadow.mapSize.x !== T.map) { R.sun.shadow.mapSize.set(T.map, T.map); if (R.sun.shadow.map) { R.sun.shadow.map.dispose(); R.sun.shadow.map = null; } }
  if (ARC) resize(ARC);
  R.progPending = true; applyProgram();
}
function applyProgram(force) {
  if (!R.progPending || (!force && ARC && ARC.state === 'play')) return;
  R.progPending = false;
  const T = TIERS[R.q];
  R.renderer.shadowMap.enabled = T.shadow; R.sun.castShadow = T.shadow;
  R.fx.setQuality(T.post ? R.q : 0, R.lockQ);
  if (R.vfx) R.vfx.setQuality(R.q);
  const lamps = R.q >= 1;
  for (const L of R.lamps) { if (lamps && !L.parent) R.scene.add(L); if (!lamps && L.parent) R.scene.remove(L); }
  applyCheap(R.scene);
  prewarm();
}
// compile every program the round can use, hidden objects included, so nothing compiles after Play
function prewarm() {
  if (!R || R.lost) return;
  // everything hidden or off camera is shown for one draw into a single pixel: a real draw compiles the
  // exact program a frame of play will ask for (renderer.compile alone can miss a variant)
  const hid = [], fc = [], r = R.renderer;
  R.scene.traverse((o) => { if (o.isLight) return; if (!o.visible) { hid.push(o); o.visible = true; } if (o.frustumCulled) { fc.push(o); o.frustumCulled = false; } });
  try { r.compile(R.scene, R.camera); } catch (e) { R.warmErr = 'compile ' + e.message; }
  try { r.setRenderTarget(null); r.setScissorTest(true); r.setScissor(0, 0, 1, 1); r.render(R.scene, R.camera); } catch (e) { R.warmErr = 'draw ' + e.message; }
  R.warmN = (R.warmN || 0) + 1;
  r.setScissorTest(false);
  for (const o of hid) o.visible = false;
  for (const o of fc) o.frustumCulled = true;
}
function resize(a) {
  if (!R) return;
  R.renderer.setPixelRatio(pxFor(a, R.q) * R.rs);
  R.renderer.setSize(a.w, a.h, false);
  R.camera.aspect = a.w / Math.max(1, a.h); R.camera.updateProjectionMatrix();
}
// dynamic resolution first: the picture gets softer before a whole quality tier goes
function measureFps(dt) {
  if (R.lockQ || R.soft) return;
  R.ft += dt; R.fn++;
  if (R.ft < 1) return;
  R.fps = R.fn / R.ft; R.ft = 0; R.fn = 0;
  if (R.fps < 46) {
    R.up = 0;
    if (R.rs > 0.66) { R.rs = Math.max(0.65, R.rs * 0.88); resize(ARC); }
    else if (R.fps < 36 && R.q > 0) { R.rs = 0.85; setQuality(R.q - 1); }
  } else if (R.fps > 57) {
    R.up++;
    if (R.rs < 1 && R.up >= 2) { R.up = 0; R.rs = Math.min(1, R.rs * 1.08); resize(ARC); }
    else if (R.rs >= 1 && R.up >= 6 && R.q < (ARC.device === 'desktop' ? 3 : 2)) { R.up = 0; setQuality(R.q + 1); }
  } else R.up = 0;
}
function applyLook(L) {
  const sc = R.scene;
  const top = new THREE.Color(L.sky[0]), mid = new THREE.Color(L.sky[1]), hor = new THREE.Color(L.sky[2]);
  sc.fog.color.copy(new THREE.Color(L.fog)); sc.fog.density = L.fogD;
  R.hemi.color.set(L.hemi[0]); R.hemi.groundColor.set(L.hemi[1]); R.hemi.intensity = L.hemi[2];
  R.sun.color.set(L.sun); R.sun.intensity = L.sunI;
  const el = L.sunEl, az = L.sunAz;
  R.sunDir = new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)).normalize();
  R.renderer.toneMappingExposure = L.exposure;
  const sky = { top: '#' + top.getHexString(), horizon: '#' + hor.getHexString(), ground: L.hemi[1], sun: { dir: [R.sunDir.x, R.sunDir.y, R.sunDir.z], color: L.sun, size: L.night ? 0.012 : 0.028, intensity: L.night ? 1.5 : 5 }, intensity: L.env, haze: 1, dome: 500, exponent: 0.5 };
  void mid;
  if (R.env) { R.env.update({ top: sky.top, horizon: sky.horizon, ground: sky.ground, sun: sky.sun, intensity: sky.intensity }); }
  else { R.env = createSkyEnv(R.renderer, sc, Object.assign({ quality: R.q }, sky)); }
  R.fx.setLook(L.grade === 'night' ? { sat: 0.92, contrast: 1.06, bloom: 0.55, threshold: 0.66, vignette: 0.32 } : { sat: 0.96, contrast: 1.04, bloom: 0.38, threshold: 0.74, vignette: 0.26 });
  R.look = L;
}

/* ================================================================ dynamic pools: tracers, holes, smoke, people kit */
function buildDynamic() {
  const sc = R.scene;
  // tracers: thin glowing streaks, instanced
  const tg = new THREE.PlaneGeometry(1, 1); tg.translate(0, 0.5, 0);
  const tm = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 0.78, 0.45).multiplyScalar(3), transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, fog: false });
  const ti = new THREE.InstancedMesh(tg, tm, 64); ti.frustumCulled = false; ti.count = 0; ti.renderOrder = 6; sc.add(ti);
  R.tracers = { im: ti, list: [], pool: [] };
  for (let i = 0; i < 64; i++) R.tracers.pool.push({ on: false, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, t: 0, life: 0.07, w: 0.03 });
  // bullet holes and scuffs
  const hc = document.createElement('canvas'); hc.width = hc.height = 64; const hg = hc.getContext('2d');
  const gr = hg.createRadialGradient(32, 32, 2, 32, 32, 30); gr.addColorStop(0, 'rgba(10,9,8,0.95)'); gr.addColorStop(0.25, 'rgba(30,26,22,0.8)'); gr.addColorStop(0.6, 'rgba(60,54,46,0.25)'); gr.addColorStop(1, 'rgba(60,54,46,0)');
  hg.fillStyle = gr; hg.fillRect(0, 0, 64, 64);
  const hm = new THREE.MeshStandardMaterial({ map: new THREE.CanvasTexture(hc), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, roughness: 1 });
  const hi = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.14, 0.14), hm, 120); hi.frustumCulled = false; hi.count = 0; sc.add(hi);
  R.holes = { im: hi, n: 0, i: 0 };
  // smoke grenade clouds: soft lit puffs
  const sCv = document.createElement('canvas'); sCv.width = sCv.height = 128; const sg = sCv.getContext('2d');
  for (let k = 0; k < 18; k++) { const x = 30 + hash(k) * 68, y = 30 + hash(k + 40) * 68, r = 18 + hash(k + 80) * 26; const g2 = sg.createRadialGradient(x, y, 0, x, y, r); g2.addColorStop(0, 'rgba(255,255,255,0.32)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); sg.fillStyle = g2; sg.fillRect(0, 0, 128, 128); }
  const smat = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(sCv), color: '#c8ccce', transparent: true, depthWrite: false, opacity: 0.9 });
  const smk = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), smat, 120); smk.frustumCulled = false; smk.count = 0; smk.renderOrder = 7; sc.add(smk);
  R.smoke = { im: smk, seeds: Array.from({ length: 120 }, (_, i) => [hash(i * 3), hash(i * 3 + 1), hash(i * 3 + 2)]) };
  // grenades, rockets, crates, drones, the heli, trucks, flags
  R.nadeMesh = new THREE.InstancedMesh(mergeGeos([[new THREE.SphereGeometry(0.055, 10, 8), M4(0, 0, 0, 0, 0, 0, 1, 1.25, 1), '#4a5240'], [CYL(0.02, 0.02, 0.05, 8), M4(0, 0.075, 0), '#8a8a80']]), std({ vertexColors: true, roughness: 0.6, metalness: 0.3 }), 16);
  R.nadeMesh.count = 0; R.nadeMesh.frustumCulled = false; sc.add(R.nadeMesh);
  R.rocketMesh = new THREE.InstancedMesh(mergeGeos([[CYL(0.04, 0.05, 0.5, 8), M4(0, 0, 0, Math.PI / 2, 0, 0), '#4b5338'], [new THREE.ConeGeometry(0.05, 0.14, 8), M4(0, 0, -0.32, -Math.PI / 2, 0, 0), '#2e3324']]), std({ vertexColors: true, roughness: 0.5, metalness: 0.4, emissive: '#000' }), 8);
  R.rocketMesh.count = 0; R.rocketMesh.frustumCulled = false; sc.add(R.rocketMesh);
  R.crate = buildCrate(); sc.add(R.crate); R.crate.visible = false;
  R.crates = [R.crate];
  R.drone = buildDrone(); sc.add(R.drone); R.drone.visible = false;
  R.drone2 = buildDrone(); sc.add(R.drone2); R.drone2.visible = false;
  R.heli = buildHeli(); sc.add(R.heli); R.heli.visible = false;
  R.trucks = [buildTruck(true), buildTruck(false), buildTruck(false)]; R.trucks.forEach((t) => { t.visible = false; sc.add(t); });
  R.muzzle = buildMuzzleSprite(); sc.add(R.muzzle.mesh);
  R.vm = buildViewModel(); R.camera.add(R.vm.root);
  { const VM = R.vm; VM.muzzleW = new THREE.Object3D(); VM.gun.add(VM.muzzleW); VM.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), R.muzzle.mesh.material); VM.flash.renderOrder = 51; VM.flash.onBeforeRender = vmBefore; VM.flash.onAfterRender = vmAfter; VM.flash.frustumCulled = false; VM.flash.visible = false; VM.gun.add(VM.flash); }
  R.fallback = buildFallbackFigures();
  { const w = new THREE.Mesh(R.fallback.geos[0], R.fallback.mat); w.visible = false; w.castShadow = true; sc.add(w); } // compiled with the rest, never drawn
  R.guns = buildGuns();
}
function buildMuzzleSprite() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
  g.translate(64, 64);
  for (let k = 0; k < 6; k++) { g.rotate(TAU / 6 + hash(k) * 0.3); const gr = g.createLinearGradient(0, 0, 60, 0); gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.4, 'rgba(255,170,70,0.7)'); gr.addColorStop(1, 'rgba(255,120,40,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(0, -5); g.lineTo(60, 0); g.lineTo(0, 5); g.fill(); }
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, 34); rg.addColorStop(0, 'rgba(255,250,230,1)'); rg.addColorStop(1, 'rgba(255,160,60,0)'); g.fillStyle = rg; g.fillRect(-64, -64, 128, 128);
  const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), color: new THREE.Color(2.2, 1.7, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  const im = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, 24); im.frustumCulled = false; im.count = 0; im.renderOrder = 8;
  return { mesh: im, list: [] };
}
function buildCrate() {
  const g = new THREE.Group();
  const box = new THREE.Mesh(mergeGeos([[BOX(1.2, 0.8, 0.9), M4(0, 0.4, 0), '#5a6448'], [BOX(1.24, 0.08, 0.94), M4(0, 0.1, 0), '#3c4430'], [BOX(1.24, 0.08, 0.94), M4(0, 0.7, 0), '#3c4430'], [BOX(0.5, 0.3, 0.02), M4(0, 0.45, 0.46), '#d8d0b0']]), std({ vertexColors: true, roughness: 0.8 }));
  box.castShadow = true; g.add(box);
  const chute = new THREE.Mesh(new THREE.SphereGeometry(2.6, 16, 8, 0, TAU, 0, Math.PI * 0.42), std({ color: '#c9b37a', roughness: 0.9, side: THREE.DoubleSide }));
  chute.position.y = 5; g.add(chute); g.userData.chute = chute;
  const smoke = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial({ color: '#9de07a', transparent: true, opacity: 0.5, depthWrite: false })); smoke.position.y = 1.1; g.add(smoke); g.userData.smoke = smoke;
  return g;
}
function buildDrone() {
  const g = new THREE.Group();
  const parts = [[BOX(0.5, 0.12, 0.5), M4(0, 0, 0), '#2e3236'], [BOX(1.2, 0.04, 0.06), M4(0, 0.02, 0, 0, Math.PI / 4, 0), '#3a3f44'], [BOX(1.2, 0.04, 0.06), M4(0, 0.02, 0, 0, -Math.PI / 4, 0), '#3a3f44'], [new THREE.SphereGeometry(0.09, 10, 8), M4(0, -0.1, 0.12), '#111']];
  for (const [x, z] of [[0.42, 0.42], [-0.42, 0.42], [0.42, -0.42], [-0.42, -0.42]]) parts.push([CYL(0.24, 0.24, 0.01, 16), M4(x, 0.06, z), '#55595e']);
  g.add(new THREE.Mesh(mergeGeos(parts), std({ vertexColors: true, roughness: 0.5, metalness: 0.4 })));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.3, 0.2), toneMapped: false })); led.position.set(0, -0.08, -0.22); g.add(led);
  g.scale.setScalar(1.4);
  return g;
}
function buildHeli() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(mergeGeos([
    [new THREE.CapsuleGeometry(1.3, 5.2, 6, 14), M4(0, 1.6, 0, Math.PI / 2, 0, 0, 1, 1, 1), '#4a5240'], [BOX(1.0, 0.8, 5.5), M4(0, 2.1, 5.5), '#4a5240'], [BOX(0.15, 1.8, 1.2), M4(0, 2.8, 8.0), '#3e4536'],
    [new THREE.SphereGeometry(1.05, 14, 10), M4(0, 1.9, -3.4, 0, 0, 0, 1, 0.9, 1.1), '#1c2630'], [BOX(3.6, 0.12, 0.3), M4(0, 0.05, -1.2), '#2a2e26'], [BOX(3.6, 0.12, 0.3), M4(0, 0.05, 1.8), '#2a2e26'],
    [CYL(0.35, 0.35, 0.6, 10), M4(0, 3.2, 0), '#2a2e26'],
  ]), std({ vertexColors: true, roughness: 0.65, metalness: 0.3 }));
  body.castShadow = true; g.add(body);
  const rotor = new THREE.Mesh(mergeGeos([[BOX(14, 0.06, 0.4), M4(0, 0, 0), '#1a1c1e'], [BOX(0.4, 0.06, 14), M4(0, 0, 0), '#1a1c1e']]), std({ vertexColors: true, roughness: 0.6, transparent: true, opacity: 0.9 }));
  rotor.position.y = 3.55; g.add(rotor); g.userData.rotor = rotor;
  const tail = new THREE.Mesh(BOX(0.06, 2.4, 0.2), std({ color: '#1a1c1e' })); tail.position.set(0.25, 2.9, 8.1); g.add(tail); g.userData.tail = tail;
  return g;
}
function buildTruck(lead) {
  const g = new THREE.Group();
  const parts = [
    [BOX(2.4, 1.0, 6.2), M4(0, 1.05, 0), '#4f5641'], [BOX(2.3, 1.5, 1.9), M4(0, 2.1, -2.0), '#4a513d'], [BOX(2.2, 0.7, 1.0), M4(0, 2.3, -3.05, 0.35, 0, 0), '#1e262e'],
    [BOX(2.42, 0.6, 3.8), M4(0, 1.8, 1.15), '#454b38'], [BOX(2.5, 0.2, 0.3), M4(0, 0.7, -3.15), '#2a2c26'], [BOX(0.3, 0.2, 0.1), M4(0.8, 1.2, -3.15), '#ffe7b0'], [BOX(0.3, 0.2, 0.1), M4(-0.8, 1.2, -3.15), '#ffe7b0'],
  ];
  if (lead) parts.push([CYL(0.5, 0.6, 0.3, 14), M4(0, 2.25, 0.2), '#3a3f32'], [BOX(1.4, 0.7, 0.08), M4(0, 2.7, -0.3), '#3a3f32']);
  const body = new THREE.Mesh(mergeGeos(parts), std({ vertexColors: true, roughness: 0.7, metalness: 0.25 })); body.castShadow = true; g.add(body);
  const wg = CYL(0.55, 0.55, 0.4, 16); wg.rotateZ(Math.PI / 2);
  const wheels = new THREE.InstancedMesh(wg, std({ color: '#1a1a1b', roughness: 0.9 }), 6);
  [[1.15, -2.0], [-1.15, -2.0], [1.15, 1.2], [-1.15, 1.2], [1.15, 2.4], [-1.15, 2.4]].forEach(([x, z], i) => wheels.setMatrixAt(i, M4(x, 0.55, z)));
  g.add(wheels); g.userData.wheels = wheels;
  return g;
}
// the weapon a soldier carries in the third person: a rifle and a pistol shape
function buildGuns() {
  const rifle = mergeGeos([[BOX(0.05, 0.08, 0.5), M4(0, 0, 0.05), '#2c2e2a'], [CYL(0.012, 0.012, 0.34, 8), M4(0, 0.015, -0.36, Math.PI / 2, 0, 0), '#1c1d1c'], [BOX(0.035, 0.14, 0.06), M4(0, -0.08, -0.02, 0.25, 0, 0), '#262724'], [BOX(0.04, 0.09, 0.2), M4(0, -0.01, 0.34), '#3a3c34'], [BOX(0.03, 0.08, 0.04), M4(0, -0.08, 0.14, -0.2, 0, 0), '#262724']]);
  const mat = std({ vertexColors: true, roughness: 0.5, metalness: 0.55 });
  const im = new THREE.InstancedMesh(rifle, mat, 24); im.frustumCulled = false; im.count = 0; im.castShadow = true; R.scene.add(im);
  return { im };
}
// soldiers when people are off (quality 0, a software renderer) or still loading: one merged figure each
function buildFallbackFigures() {
  const mk = (kit) => mergeGeos([
    [BOX(0.42, 0.58, 0.26), M4(0, 1.22, 0), kit.top], [BOX(0.46, 0.4, 0.3), M4(0, 1.27, 0), kit.vest], [BOX(0.36, 0.22, 0.24), M4(0, 0.86, 0), kit.bottom],
    [BOX(0.15, 0.8, 0.17), M4(-0.1, 0.42, 0), kit.bottom], [BOX(0.15, 0.8, 0.17), M4(0.1, 0.42, 0), kit.bottom], [BOX(0.16, 0.1, 0.28), M4(-0.1, 0.05, -0.04), kit.shoes], [BOX(0.16, 0.1, 0.28), M4(0.1, 0.05, -0.04), kit.shoes],
    [BOX(0.12, 0.5, 0.13), M4(-0.27, 1.2, -0.12, -0.7, 0, 0), kit.top], [BOX(0.12, 0.5, 0.13), M4(0.27, 1.2, -0.12, -0.9, 0, 0), kit.top],
    [new THREE.SphereGeometry(0.11, 12, 10), M4(0, 1.66, 0, 0, 0, 0, 0.9, 1.08, 1), '#b07a54'], [new THREE.SphereGeometry(0.135, 12, 8, 0, TAU, 0, Math.PI * 0.55), M4(0, 1.7, 0), kit.helmet],
  ]);
  const mat = std({ vertexColors: true, roughness: 0.85 });
  return { geos: [mk(D.FACTIONS[0].kit), mk(D.FACTIONS[1].kit), mk(D.FFA_KIT)], mat, meshes: [] };
}
// a combat helmet and a plate carrier the people wear
let KIT = null;
function kitGeos() {
  if (KIT) return KIT;
  const helmet = mergeGeos([[new THREE.SphereGeometry(0.128, 18, 10, 0, TAU, 0, Math.PI * 0.52), M4(0, 0.1, 0.005, 0, 0, 0, 1.05, 0.98, 1.1), '#ffffff'], [CYL(0.142, 0.15, 0.03, 18), M4(0, 0.085, 0.01, 0, 0, 0, 1, 1, 1.12), '#ffffff'], [BOX(0.06, 0.03, 0.02), M4(0, 0.17, 0.13), '#3a3a3a']]);
  const vest = mergeGeos([[BOX(0.36, 0.34, 0.07), M4(0, 0.05, 0.13), '#ffffff'], [BOX(0.36, 0.34, 0.07), M4(0, 0.05, -0.12), '#ffffff'], [BOX(0.11, 0.09, 0.05), M4(-0.11, -0.06, 0.18), '#d8d8d8'], [BOX(0.11, 0.09, 0.05), M4(0.0, -0.06, 0.18), '#d8d8d8'], [BOX(0.11, 0.09, 0.05), M4(0.11, -0.06, 0.18), '#d8d8d8'], [BOX(0.07, 0.04, 0.24), M4(-0.15, 0.22, 0.0), '#cfcfcf'], [BOX(0.07, 0.04, 0.24), M4(0.15, 0.22, 0.0), '#cfcfcf']]);
  KIT = { helmet, vest, mats: [0, 1, 2].map((t) => { const k = t === 2 ? D.FFA_KIT : D.FACTIONS[t].kit; return { helmet: std({ color: k.helmet, vertexColors: true, roughness: 0.78 }), vest: std({ color: k.vest, vertexColors: true, roughness: 0.88 }) }; }) };
  KIT.mats.forEach((m) => { m.helmet.userData.keepMat = true; m.vest.userData.keepMat = true; });
  return KIT;
}

/* ================================================================ the weapon in your hands */
function buildViewModel() {
  const root = new THREE.Group(), gun = new THREE.Group();
  root.add(gun);
  const mat = std({ vertexColors: true, roughness: 0.42, metalness: 0.7 });
  const glove = std({ color: '#2b2a24', roughness: 0.75 }), sleeve = std({ color: '#5d6448', roughness: 0.9 });
  const meshes = {};
  const make = (id) => {
    const w = D.WEAPONS[id], b = w.body, a = w.acc;
    let parts;
    if (id === 'p11' || id === 'bk2') parts = [[BOX(0.035, 0.05, 0.2), M4(0, 0.02, -0.06), b], [BOX(0.03, 0.11, 0.05), M4(0, -0.05, 0.02, 0.25, 0, 0), a], [CYL(0.008, 0.008, 0.04, 8), M4(0, 0.025, -0.18, Math.PI / 2, 0, 0), '#111'], [BOX(0.006, 0.012, 0.01), M4(0, 0.052, -0.14), '#d8d8d8']].concat(id === 'bk2' ? [[BOX(0.025, 0.12, 0.03), M4(0, -0.1, 0.0), '#222']] : []);
    else if (id === 'rk3') parts = [[CYL(0.055, 0.055, 0.95, 16), M4(0, 0.02, -0.18, Math.PI / 2, 0, 0), b], [CYL(0.065, 0.06, 0.12, 16), M4(0, 0.02, -0.66, Math.PI / 2, 0, 0), a], [BOX(0.03, 0.1, 0.05), M4(0, -0.07, 0.02), a], [BOX(0.05, 0.05, 0.1), M4(-0.06, 0.07, -0.1), '#222']];
    else if (id === 'turret') parts = [[BOX(0.12, 0.14, 0.7), M4(0, 0, -0.05), b], [CYL(0.024, 0.024, 0.9, 10), M4(0, 0.03, -0.85, Math.PI / 2, 0, 0), '#151515'], [CYL(0.04, 0.04, 0.5, 10), M4(0, 0.03, -0.6, Math.PI / 2, 0, 0), '#2a2c26'], [BOX(0.9, 0.6, 0.04), M4(0, 0.1, -0.55), '#3f4535'], [BOX(0.18, 0.08, 0.04), M4(0, 0.16, -0.58), '#101418'], [BOX(0.05, 0.14, 0.05), M4(-0.18, -0.08, 0.2), '#222'], [BOX(0.05, 0.14, 0.05), M4(0.18, -0.08, 0.2), '#222']];
    else {
      const L = w.len;
      parts = [
        [BOX(0.05, 0.075, 0.36), M4(0, 0, -0.02), b], [BOX(0.048, 0.03, 0.34), M4(0, 0.05, -0.03), a], [BOX(0.044, 0.06, L * 0.42), M4(0, -0.005, -0.2 - L * 0.21), id === 'tr12' ? '#5a4a3a' : b],
        [CYL(0.011, 0.011, L * 0.55, 10), M4(0, 0.012, -0.18 - L * 0.5, Math.PI / 2, 0, 0), '#151515'], [BOX(0.03, 0.11, 0.05), M4(0, -0.085, 0.07, 0.3, 0, 0), '#222'],
        [BOX(0.04, 0.07, 0.24), M4(0, -0.01, 0.27), id === 'tr12' ? '#5a4a3a' : a],
      ];
      if (id !== 'tr12' && id !== 'lw8') parts.push([BOX(0.03, 0.13, 0.06), M4(0, -0.09, -0.06, -0.15, 0, 0), '#1e1e1e']);
      if (id === 'hm40') parts.push([BOX(0.09, 0.1, 0.12), M4(0.02, -0.08, -0.06), '#3a3c30'], [CYL(0.012, 0.012, 0.18, 6), M4(0.0, -0.05, -0.42, 0.6, 0, 0), '#222']);
      if (id === 'tr12') parts.push([CYL(0.014, 0.014, L * 0.5, 10), M4(0, -0.02, -0.18 - L * 0.45, Math.PI / 2, 0, 0), '#202020']);
      if (w.scope) parts.push([CYL(0.022, 0.022, 0.24, 12), M4(0, 0.1, -0.05, Math.PI / 2, 0, 0), '#141414'], [CYL(0.03, 0.026, 0.05, 12), M4(0, 0.1, -0.19, Math.PI / 2, 0, 0), '#141414'], [BOX(0.02, 0.04, 0.02), M4(0, 0.075, -0.05), '#141414']);
    }
    const g = new THREE.Mesh(mergeGeos(parts), mat);
    return g;
  };
  for (const id in D.WEAPONS) { meshes[id] = make(id); meshes[id].visible = false; gun.add(meshes[id]); }
  // optics and mods, shown on the current weapon
  const optics = {
    pip: new THREE.Mesh(mergeGeos([[BOX(0.035, 0.035, 0.05), M4(0, 0, 0), '#151515'], [CYL(0.016, 0.016, 0.006, 12), M4(0, 0.005, -0.026, Math.PI / 2, 0, 0), '#3a6a7a']]), mat),
    ring: new THREE.Mesh(mergeGeos([[BOX(0.05, 0.01, 0.07), M4(0, -0.02, 0), '#151515'], [new THREE.TorusGeometry(0.026, 0.004, 6, 18), M4(0, 0.01, -0.03), '#151515']]), mat),
    scout: new THREE.Mesh(mergeGeos([[CYL(0.02, 0.02, 0.16, 12), M4(0, 0, 0, Math.PI / 2, 0, 0), '#151515'], [CYL(0.026, 0.022, 0.04, 12), M4(0, 0, -0.09, Math.PI / 2, 0, 0), '#151515']]), mat),
  };
  for (const k in optics) { optics[k].position.set(0, 0.085, -0.04); optics[k].visible = false; gun.add(optics[k]); }
  const mods = { quiet: new THREE.Mesh(CYL(0.02, 0.02, 0.16, 12), std({ color: '#1a1a1a', roughness: 0.5, metalness: 0.6 })), grip: new THREE.Mesh(BOX(0.025, 0.08, 0.03), std({ color: '#222', roughness: 0.7 })), laser: new THREE.Mesh(BOX(0.025, 0.025, 0.06), std({ color: '#222' })), mag: new THREE.Mesh(BOX(0.03, 0.09, 0.05), std({ color: '#1e1e1e' })) };
  mods.quiet.rotation.x = Math.PI / 2;
  for (const k in mods) { mods[k].visible = false; gun.add(mods[k]); }
  // gloved hands and sleeves
  const handG = mergeGeos([[new THREE.SphereGeometry(1, 12, 8), M4(0.015, -0.1, 0.09, 0.3, 0, 0, 0.04, 0.05, 0.035), '#ffffff'], [new THREE.CapsuleGeometry(0.012, 0.045, 3, 8), M4(-0.012, -0.08, 0.05, 0.3, 0, Math.PI / 2), '#ffffff']]);
  const handR = new THREE.Mesh(handG, glove), handL = new THREE.Mesh(handG, glove);
  handL.position.set(-0.01, 0.03, -0.25); handL.rotation.set(0, 0, -0.4);
  const armG = CYL(0.045, 0.055, 0.42, 12);
  const armR = new THREE.Mesh(armG, sleeve), armL = new THREE.Mesh(armG, sleeve);
  gun.add(handR, handL, armR, armL);
  root.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.castShadow = false; o.renderOrder = 50; o.onBeforeRender = vmBefore; o.onAfterRender = vmAfter; } });
  return { root, gun, meshes, optics, mods, handR, handL, armR, armL, mat, cur: '', bob: 0, swayX: 0, swayY: 0, kick: 0, lower: 0, sprintK: 0, adsK: 0, prevYaw: 0, prevPitch: 0, glove, sleeve };
}
// the gun is drawn into the nearest sliver of depth, so a wall never cuts through it
function vmBefore(r) { const gl = r.getContext(); gl.depthRange(0, 0.012); }
function vmAfter(r) { const gl = r.getContext(); gl.depthRange(0, 1); }
const VMPOS = { hip: new THREE.Vector3(0.17, -0.2, -0.36), ads: new THREE.Vector3(0, -0.08, -0.42), sprint: new THREE.Vector3(0.12, -0.26, -0.3) };

/* ================================================================ the map */
function mapKey(W) { return W.mapId + ':' + (W.mapId === 'road' ? W.cfg.seed : '') + ':' + (W.look ? W.look.sky[0] : ''); }
function setWorld(W) {
  const k = mapKey(W);
  applyLook(W.look);
  if (!W.attract && R.fx) R.fx.intro(2.2);
  if (R.built === k && R.map) { refreshGrid(W); return; }
  if (R.map) { R.scene.remove(R.map.group); R.map.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
  R.built = k;
  for (const L of R.lamps) L.intensity = 0;
  const group = new THREE.Group(); R.scene.add(group);
  R.map = { group, W, barrelIdx: new Map(), lowIdx: new Map(), flags: [], sites: [], weather: null, extras: [] };
  R.jobs = buildJobs(W);
  R.compiled = false;
}
function refreshGrid(W) {
  // barrels and roadblocks that are already gone stay gone (a new match rebuilds the grid)
  const M = R.map; M.W = W;
  if (M.barrels) { for (const [i, list] of M.barrelIdx) { const on = W.G.kind[i] === 'e'; for (const j of list) { M.barrels.getMatrixAt(j, _m); if (!on) M.barrels.setMatrixAt(j, ZERO); else M.barrels.setMatrixAt(j, M.barrelM[j]); } } M.barrels.instanceMatrix.needsUpdate = true; }
  if (M.low) { for (const [i, j] of M.lowIdx) M.low.setMatrixAt(j, W.G.kind[i] === 'c' ? M.lowM[j] : ZERO); M.low.instanceMatrix.needsUpdate = true; }
  buildObjectives(W);
}
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0), _m = new THREE.Matrix4();
function buildJobs(W) {
  const G = W.G, M = W.M, look = W.look, T = TIERS[R.q], sz = T.tex;
  const jobs = [];
  const floorKind = M.floor === 'snow' ? 'snow' : M.floor === 'wet' ? 'wet' : M.floor === 'cobble' ? 'cobble' : M.floor === 'sand' ? 'sand' : M.floor === 'road' ? 'road' : 'dirt';
  const wallKind = W.mapId === 'town' ? 'plaster' : W.mapId === 'docks' ? 'concrete' : W.mapId === 'refinery' ? 'concrete' : W.mapId === 'road' ? 'brick' : W.mapId === 'range' ? 'wood' : 'stone';
  const snow = look.snow ? 0.85 : 0;
  const g = R.map.group;
  const W0 = G.gw * CS, H0 = G.gh * CS;
  jobs.push(() => {
    // the ground: the play field and land beyond it
    const t = texSet(floorKind, sz);
    const mat = std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1, metalness: 0, normalScale: new THREE.Vector2(0.6, 0.6) });
    const rep = (W0 + 240) / 4;
    for (const k of ['map', 'normalMap', 'roughnessMap']) { mat[k] = mat[k].clone(); mat[k].needsUpdate = true; mat[k].repeat.set(rep, rep * (H0 + 240) / (W0 + 240)); }
    if (W.mapId === 'docks') { mat.roughness = 0.75; mat.metalness = 0.1; mat.envMapIntensity = 1.4; }
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(W0 + 240, H0 + 240), mat);
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; g.add(ground);
    if (W.mapId === 'road') {
      // the carriageway and its painted lines
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(8 * CS, H0), std({ color: '#3e3f42', roughness: 0.85, map: texSet('road', sz).map }));
      lane.rotation.x = -Math.PI / 2; lane.position.set(S.cw(G, 8), 0.01, 0); lane.receiveShadow = true; g.add(lane);
      const dash = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.15, 2.2), std({ color: '#d8d2b8', roughness: 0.7 }), 60);
      for (let i = 0; i < 60; i++) dash.setMatrixAt(i, M4(S.cw(G, 8), 0.02, -H0 / 2 + i * (H0 / 60), -Math.PI / 2, 0, 0)); g.add(dash);
    }
    if (W.mapId === 'docks' || W.mapId === 'road') {
      // the sea
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), std({ color: W.mapId === 'docks' ? '#121a22' : '#3a4a52', roughness: 0.12, metalness: 0.4, envMapIntensity: 1.2 }));
      sea.rotation.x = -Math.PI / 2; sea.position.y = W.mapId === 'docks' ? -0.6 : -1.2;
      if (W.mapId === 'docks') sea.position.z = -H0 / 2 - 450 + 2;
      else { sea.position.z = -H0 / 2 - 450 + 6 * CS; }
      g.add(sea);
    }
  });
  jobs.push(() => {
    // walls: rows of cells merged into long boxes, world scaled textures
    const gb = new GB(), rk = new GB();
    for (let z = 0; z < G.gh; z++) {
      let x = 0;
      while (x < G.gw) {
        const k = G.kind[z * G.gw + x];
        if (k !== '#' && k !== 'H') { x++; continue; }
        let x2 = x; while (x2 + 1 < G.gw && G.kind[z * G.gw + x2 + 1] === k) x2++;
        const x0 = S.cw(G, x), x1 = S.cw(G, x2 + 1), z0 = S.cwz(G, z), z1 = S.cwz(G, z + 1);
        if (k === '#') gb.box(x0, 0, z0, x1, G.wallH + (W.mapId === 'town' ? hash(z * 37 + x) * 1.6 : 0), z1, 2, W.mapId === 'town' ? G.wallH : 2);
        else rk.box(x0, 0, z0, x1, 4 + hash(z * 13 + x) * 3, z1, 3, 3);
        x = x2 + 1;
      }
    }
    if (gb.p.length) {
      const t = texSet(wallKind, sz);
      const mat = snowy(std({ map: t.map, normalMap: t.normalMap, roughnessMap: t.roughnessMap, roughness: 1 }), snow);
      if (W.mapId === 'town' || W.mapId === 'road') { mat.emissiveMap = windowsTex(look.night ? 1 : 0, G.wallH); mat.emissive = new THREE.Color(look.night ? '#ffb060' : '#000'); }
      const m = new THREE.Mesh(gb.geo(), mat); m.castShadow = true; m.receiveShadow = true; g.add(m);
      if (W.mapId === 'town' || W.mapId === 'road') {
        // windows dark by day: a second pass would be a draw; a trim band does the job
        const trim = new GB();
        for (let z = 0; z < G.gh; z++) for (let x = 0; x < G.gw; x++) if (G.kind[z * G.gw + x] === '#') { const x0 = S.cw(G, x), z0 = S.cwz(G, z); trim.box(x0 - 0.06, G.wallH - 0.25, z0 - 0.06, x0 + CS + 0.06, G.wallH - 0.05, z0 + CS + 0.06, 2, 1); }
        const tm = new THREE.Mesh(trim.geo(), std({ color: W.mapId === 'town' ? '#8a6a52' : '#5a524a', roughness: 0.9 })); tm.castShadow = false; g.add(tm);
      }
    }
    if (rk.p.length) {
      const t = texSet('rock', sz);
      const m = new THREE.Mesh(rk.geo(), snowy(std({ map: t.map, normalMap: t.normalMap, roughness: 0.95 }), snow)); m.castShadow = true; m.receiveShadow = true; g.add(m);
    }
  });
  jobs.push(() => buildCover(W, sz, snow));
  jobs.push(() => buildPillars(W, sz, snow));
  jobs.push(() => buildBarrels(W));
  jobs.push(() => buildDecor(W, sz, snow));
  jobs.push(() => { buildObjectives(W); buildWeather(W); });
  return jobs;
}
function cellsOf(G, k) { const out = []; for (let z = 0; z < G.gh; z++) for (let x = 0; x < G.gw; x++) if (G.kind[z * G.gw + x] === k) out.push([x, z]); return out; }
function buildCover(W, sz, snow) {
  const G = W.G, g = R.map.group;
  // tall cover: containers on the docks, crate stacks elsewhere
  const tall = cellsOf(G, 'b');
  if (tall.length) {
    let geo, mat;
    if (W.mapId === 'docks' || W.mapId === 'refinery') {
      const t = texSet('metal', sz);
      geo = new THREE.BoxGeometry(CS, D.TALL_H, CS); geo.translate(0, D.TALL_H / 2, 0);
      mat = std({ map: t.map, normalMap: t.normalMap, roughness: 0.6, metalness: 0.45 });
    } else {
      const t = texSet('wood', sz);
      geo = mergeGeos([[BOX(1.9, 1.2, 1.9), M4(0, 0.6, 0), '#ffffff'], [BOX(1.6, 1.25, 1.6), M4(0.1, 1.84, -0.05, 0, 0.3, 0), '#e8e0d0'], [BOX(1.96, 0.1, 0.1), M4(0, 1.15, 0.92), '#b8a888'], [BOX(1.96, 0.1, 0.1), M4(0, 0.05, 0.92), '#b8a888']]);
      mat = snowy(std({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: 0.85 }), snow);
    }
    const im = new THREE.InstancedMesh(geo, mat, tall.length);
    const cols = ['#7a3226', '#2f5470', '#6b6a34', '#3d5a44', '#8a6a2a', '#5a5c60', '#704a2a'];
    tall.forEach(([x, z], i) => {
      im.setMatrixAt(i, M4(S.cw(G, x + 0.5), 0, S.cwz(G, z + 0.5), 0, (W.mapId === 'docks' ? 0 : hash(i) * 0.2)));
      im.setColorAt(i, new THREE.Color(W.mapId === 'docks' || W.mapId === 'refinery' ? cols[(hash(x * 7 + z * 3) * cols.length) | 0] : '#ffffff'));
    });
    im.castShadow = true; im.receiveShadow = true; g.add(im);
  }
  // low cover: sandbag walls, concrete barriers, stone walls, the range's wooden walls
  const low = cellsOf(G, 'c');
  if (low.length) {
    let geo, mat;
    if (W.mapId === 'docks' || W.mapId === 'refinery') {
      const sh = new THREE.Shape(); sh.moveTo(-0.32, 0); sh.lineTo(0.32, 0); sh.lineTo(0.2, 0.25); sh.lineTo(0.12, D.LOW_H); sh.lineTo(-0.12, D.LOW_H); sh.lineTo(-0.2, 0.25); sh.closePath();
      const ex = new THREE.ExtrudeGeometry(sh, { depth: 1.95, bevelEnabled: false }); ex.translate(0, 0, -0.975);
      geo = ex; const t = texSet('concrete', sz); mat = std({ map: t.map, normalMap: t.normalMap, roughness: 0.9, color: '#c9c4ba' });
    } else if (W.mapId === 'town') {
      const t = texSet('stone', sz);
      geo = BOX(1.95, D.LOW_H, 0.55); geo.translate(0, D.LOW_H / 2, 0); mat = std({ map: t.map, normalMap: t.normalMap, roughness: 0.9 });
    } else {
      // sandbags, three courses
      const parts = [];
      const bag = new THREE.CapsuleGeometry(0.17, 0.4, 2, 7); bag.rotateZ(Math.PI / 2); bag.scale(1, 0.75, 1.15);
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) parts.push([bag, M4(-0.62 + k * 0.62 + (r % 2 ? 0.3 : 0) - (r % 2 && k === 2 ? 1.86 : 0), 0.16 + r * 0.3, (r % 2 ? 0.05 : -0.05), 0, (hash(r * 3 + k) - 0.5) * 0.2, 0), '#ffffff']);
      geo = mergeGeos(parts); const t = texSet('sandbag', sz); mat = snowy(std({ map: t.map, normalMap: t.normalMap, vertexColors: true, roughness: 0.95 }), snow);
    }
    const im = new THREE.InstancedMesh(geo, mat, low.length);
    R.map.lowM = [];
    low.forEach(([x, z], i) => {
      const hor = (G.kind[z * G.gw + x - 1] === 'c' || G.kind[z * G.gw + x + 1] === 'c') ? 1 : (G.kind[(z - 1) * G.gw + x] === 'c' || G.kind[(z + 1) * G.gw + x] === 'c') ? 0 : (hash(x + z * 9) < 0.5 ? 1 : 0);
      const m = M4(S.cw(G, x + 0.5), 0, S.cwz(G, z + 0.5), 0, (W.mapId === 'docks' || W.mapId === 'refinery') ? (hor ? Math.PI / 2 : 0) : (hor ? 0 : Math.PI / 2));
      R.map.lowM[i] = m; im.setMatrixAt(i, m); R.map.lowIdx.set(z * G.gw + x, i);
    });
    im.castShadow = true; im.receiveShadow = true; g.add(im); R.map.low = im;
  }
  // rocks and boulders
  const rocks = cellsOf(G, 't');
  if (rocks.length) {
    const rg = new THREE.IcosahedronGeometry(1, 1);
    // displace by the corner's position, not its index: the faces do not share vertices, and an index would tear them apart
    const p = rg.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); const k = 0.78 + hash(Math.round(x * 97) * 7 + Math.round(y * 97) * 131 + Math.round(z * 97) * 1031) * 0.4; p.setXYZ(i, x * k, y * k * 0.8, z * k); }
    rg.computeVertexNormals();
    const t = texSet('rock', sz);
    const im = new THREE.InstancedMesh(rg, snowy(std({ map: t.map, normalMap: t.normalMap, roughness: 0.95, flatShading: true }), snow), rocks.length);
    rocks.forEach(([x, z], i) => im.setMatrixAt(i, M4(S.cw(G, x + 0.5), 0.6, S.cwz(G, z + 0.5), hash(i) * 3, hash(i + 5) * 6, 0, 1.25 + hash(i + 9) * 0.3, 1.4 + hash(i + 2) * 0.6, 1.25)));
    im.castShadow = true; im.receiveShadow = true; g.add(im);
  }
  // rubble where barrels or roadblocks were
  const rub = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(0.22, 0), std({ color: '#4a443e', roughness: 1, flatShading: true }), 160);
  rub.count = 0; g.add(rub); R.map.rubble = rub;
}
function buildPillars(W, sz, snow) {
  const G = W.G, g = R.map.group, seen = new Uint8Array(G.gw * G.gh);
  const comps = [];
  for (let z = 0; z < G.gh; z++) for (let x = 0; x < G.gw; x++) {
    const i = z * G.gw + x; if (G.kind[i] !== 'o' || seen[i]) continue;
    let x2 = x, z2 = z; while (x2 + 1 < G.gw && G.kind[z * G.gw + x2 + 1] === 'o') x2++; while (z2 + 1 < G.gh && G.kind[(z2 + 1) * G.gw + x] === 'o') z2++;
    for (let a = z; a <= z2; a++) for (let b = x; b <= x2; b++) seen[a * G.gw + b] = 1;
    comps.push({ x0: x, z0: z, x1: x2 + 1, z1: z2 + 1 });
  }
  const metal = std({ color: '#8a8e92', roughness: 0.45, metalness: 0.75 });
  for (const c of comps) {
    const cx = S.cw(G, (c.x0 + c.x1) / 2), cz = S.cwz(G, (c.z0 + c.z1) / 2), w = (c.x1 - c.x0) * CS, d = (c.z1 - c.z0) * CS;
    if (W.mapId === 'refinery') {
      const r = Math.min(w, d) * 0.48, h = 6 + (w > 4 ? 3 : 0);
      const tank = new THREE.Mesh(mergeGeos([[CYL(r, r, h, 28), M4(0, h / 2, 0), '#d8d4ca'], [new THREE.SphereGeometry(r, 28, 10, 0, TAU, 0, Math.PI / 2), M4(0, h, 0, 0, 0, 0, 1, 0.3, 1), '#cfcac0'], [CYL(r + 0.05, r + 0.05, 0.25, 28), M4(0, h * 0.33, 0), '#9a3a2a'], [CYL(r + 0.05, r + 0.05, 0.25, 28), M4(0, h * 0.66, 0), '#9a3a2a'], [BOX(0.1, h, 0.3), M4(r + 0.1, h / 2, 0), '#555']]), std({ vertexColors: true, roughness: 0.5, metalness: 0.5 }));
      tank.position.set(cx, 0, cz); tank.castShadow = true; tank.receiveShadow = true; g.add(tank);
    } else if (W.mapId === 'ridge') {
      // the relay mast: a lattice tower with dishes and a blinking light
      const h = 18, parts = [];
      for (const [sx, sz2] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) parts.push([CYL(0.07, 0.12, h, 6), M4(sx * 0.8, h / 2, sz2 * 0.8, sz2 * 0.04, 0, -sx * 0.04), '#9a9ea2']);
      for (let k = 0; k < 9; k++) { const y = 1 + k * 2, s = 0.85 - k * 0.04; parts.push([BOX(s * 2, 0.05, 0.05), M4(0, y, s), '#8a8e92'], [BOX(s * 2, 0.05, 0.05), M4(0, y, -s), '#8a8e92'], [BOX(0.05, 0.05, s * 2), M4(s, y, 0), '#8a8e92'], [BOX(0.05, 0.05, s * 2), M4(-s, y, 0), '#8a8e92']); }
      parts.push([CYL(0.6, 0.15, 0.25, 16), M4(0.6, 13, 0.2, 0, 0, Math.PI / 2), '#dcdcd8'], [CYL(0.5, 0.12, 0.2, 16), M4(-0.5, 10, -0.2, 0, 0, -Math.PI / 2), '#dcdcd8'], [BOX(1.4, 1.2, 1.0), M4(0, 0.6, 0), '#4a5240']);
      const mast = new THREE.Mesh(mergeGeos(parts), snowy(std({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), snow));
      mast.position.set(cx, 0, cz); mast.castShadow = true; g.add(mast);
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 0.4, 0.2), toneMapped: false })); lamp.position.set(cx, h + 0.2, cz); g.add(lamp);
      R.map.extras.push({ k: 'blink', m: lamp });
    } else if (W.mapId === 'docks') {
      // crane legs: yellow steel to the gantry above
      const leg = new THREE.Mesh(mergeGeos([[BOX(0.7, 16, 0.7), M4(0, 8, 0), '#d8a02a'], [BOX(0.3, 0.3, 4), M4(0, 3, 0, 0.6, 0, 0), '#c08a22'], [BOX(1.6, 0.8, 1.6), M4(0, 0.4, 0), '#3a3a3a']]), std({ vertexColors: true, roughness: 0.55, metalness: 0.5 }));
      leg.position.set(cx, 0, cz); leg.castShadow = true; g.add(leg);
    } else {
      // a fountain or a stone pillar
      const fountain = new THREE.Mesh(mergeGeos([[CYL(0.9, 1.0, 0.7, 20), M4(0, 0.35, 0), '#b8a890'], [CYL(0.3, 0.35, 2.2, 14), M4(0, 1.4, 0), '#a8987c'], [new THREE.SphereGeometry(0.4, 14, 10), M4(0, 2.6, 0), '#a8987c']]), std({ vertexColors: true, roughness: 0.85, map: texSet('stone', sz).map }));
      fountain.position.set(cx, 0, cz); fountain.castShadow = true; fountain.receiveShadow = true; g.add(fountain);
    }
  }
  // the docks' gantry beams overhead and floodlights
  if (W.mapId === 'docks') {
    const lamps = [];
    for (let i = 0; i < 6; i++) { const x = S.cw(G, i < 3 ? 1 : 31), z = S.cwz(G, 4 + (i % 3) * 12); lamps.push([x, z]); }
    const pole = new THREE.InstancedMesh(mergeGeos([[CYL(0.12, 0.16, 12, 8), M4(0, 6, 0), '#5a5e62'], [BOX(1.2, 0.3, 0.5), M4(0, 12, 0), '#2a2c2e']]), std({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), lamps.length);
    const head = new THREE.InstancedMesh(BOX(1.1, 0.2, 0.42), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.6, 3.8), toneMapped: false }), lamps.length);
    lamps.forEach(([x, z], i) => { pole.setMatrixAt(i, M4(x, 0, z)); head.setMatrixAt(i, M4(x, 11.84, z)); });
    g.add(pole, head);
    // a few soft pools of light on the wet quay
    const pool = new THREE.InstancedMesh(new THREE.CircleGeometry(6, 24), new THREE.MeshBasicMaterial({ color: '#ffe2b0', transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false }), lamps.length);
    lamps.forEach(([x, z], i) => pool.setMatrixAt(i, M4(x + (x < 0 ? 4 : -4), 0.03, z, -Math.PI / 2, 0, 0))); g.add(pool);
    [0, 4].forEach((k, j) => { const L = R.lamps[j]; L.position.set(lamps[k][0] + (lamps[k][0] < 0 ? 2 : -2), 10, lamps[k][1]); L.intensity = 60; });
  }
}
function buildBarrels(W) {
  const G = W.G, list = G.barrels; if (!list.length) return;
  const geo = mergeGeos([[CYL(0.3, 0.3, 0.9, 16), M4(0, 0.45, 0), '#a83224'], [CYL(0.31, 0.31, 0.04, 16), M4(0, 0.3, 0), '#6a1e16'], [CYL(0.31, 0.31, 0.04, 16), M4(0, 0.62, 0), '#6a1e16'], [CYL(0.29, 0.29, 0.02, 16), M4(0, 0.91, 0), '#7a2a1e'], [BOX(0.2, 0.01, 0.12), M4(0, 0.6, 0.3), '#f0d050']]);
  const im = new THREE.InstancedMesh(geo, std({ vertexColors: true, roughness: 0.5, metalness: 0.5 }), list.length * 3);
  R.map.barrelM = [];
  let n = 0;
  for (const i of list) {
    const x = S.cw(G, i % G.gw + 0.5), z = S.cwz(G, ((i / G.gw) | 0) + 0.5), js = [];
    for (let k = 0; k < 3; k++) { const a = k * 2.1 + hash(i) * 2, r = k ? 0.4 : 0; const m = M4(x + Math.cos(a) * r, 0, z + Math.sin(a) * r, 0, hash(i + k) * 6, 0); R.map.barrelM[n] = m; im.setMatrixAt(n, G.kind[i] === 'e' ? m : ZERO); js.push(n); n++; }
    R.map.barrelIdx.set(i, js);
  }
  im.castShadow = true; R.map.group.add(im); R.map.barrels = im;
}
function buildDecor(W, sz, snow) {
  const G = W.G, g = R.map.group, look = W.look;
  const W0 = G.gw * CS, H0 = G.gh * CS;
  const ring = (n, r0, r1, f) => { for (let i = 0; i < n; i++) { const a = i / n * TAU + hash(i) * 0.3, r = r0 + hash(i + 7) * (r1 - r0); f(Math.cos(a) * r * (W0 / 64), Math.sin(a) * r * (H0 / 64), i, a); } };
  if (W.mapId === 'ridge') {
    // mountains all round, snow on the peaks
    const mg = new THREE.ConeGeometry(1, 1, 7, 3); const p = mg.attributes.position; for (let i = 0; i < p.count; i++) { if (p.getY(i) < 0.49) { p.setX(i, p.getX(i) * (0.8 + hash(i) * 0.4)); p.setZ(i, p.getZ(i) * (0.8 + hash(i + 3) * 0.4)); } } mg.computeVertexNormals();
    const mm = snowy(std({ color: '#6a6e74', roughness: 1, flatShading: true }), 1.0);
    const im = new THREE.InstancedMesh(mg, mm, 26);
    ring(26, 120, 260, (x, z, i) => im.setMatrixAt(i, M4(x, 18 + hash(i) * 30, z, 0, hash(i) * 6, 0, 60 + hash(i + 1) * 60, 60 + hash(i + 2) * 80, 60 + hash(i + 4) * 50)));
    g.add(im);
    // the slope falls away below the outpost
    const slope = new THREE.Mesh(new THREE.CylinderGeometry(W0 * 0.9, W0 * 2.6, 40, 16, 1, true), snowy(std({ color: '#d8dde4', roughness: 1, side: THREE.BackSide }), 0));
    slope.position.y = -20; g.add(slope);
    // pine trees on the shoulders
    const tg = mergeGeos([[new THREE.ConeGeometry(1.4, 3.2, 8), M4(0, 3.0, 0), '#2e4434'], [new THREE.ConeGeometry(1.1, 2.6, 8), M4(0, 4.6, 0), '#34503c'], [CYL(0.15, 0.2, 1.6, 6), M4(0, 0.8, 0), '#4a3a2a']]);
    const trees = new THREE.InstancedMesh(tg, snowy(std({ vertexColors: true, roughness: 0.9 }), 0.7), 60);
    ring(60, 38, 70, (x, z, i) => trees.setMatrixAt(i, M4(x, 0, z, 0, hash(i) * 6, 0, 0.9 + hash(i + 3) * 0.8)));
    trees.castShadow = TIERS[R.q].shadow; g.add(trees);
  } else if (W.mapId === 'docks') {
    // the far quay: cranes, a ship and warehouses
    const cr = new THREE.InstancedMesh(mergeGeos([[BOX(1, 30, 1), M4(-6, 15, 0), '#c09030'], [BOX(1, 30, 1), M4(6, 15, 0), '#c09030'], [BOX(14, 1.5, 1.5), M4(0, 30, 0), '#c09030'], [BOX(1.4, 1.4, 40), M4(0, 32, -10), '#b08028']]), std({ vertexColors: true, roughness: 0.6, metalness: 0.5 }), 5);
    for (let i = 0; i < 5; i++) cr.setMatrixAt(i, M4(-60 + i * 30, 0, -H0 / 2 - 30 - hash(i) * 30));
    g.add(cr);
    const ship = new THREE.Mesh(mergeGeos([[BOX(80, 12, 18), M4(0, 2, 0), '#2a3038'], [BOX(16, 12, 14), M4(28, 13, 0), '#d8d8d0'], [BOX(60, 6, 16), M4(-8, 11, 0), '#6a3a2a']]), std({ vertexColors: true, roughness: 0.7 }));
    ship.position.set(20, -1, -H0 / 2 - 60); g.add(ship);
    const wh = new THREE.InstancedMesh(BOX(1, 1, 1), std({ color: '#3a4048', roughness: 0.9 }), 14);
    for (let i = 0; i < 14; i++) { const side = i % 2 ? 1 : -1; wh.setMatrixAt(i, M4(side * (W0 / 2 + 14 + hash(i) * 20), 6, -H0 / 2 + (i >> 1) * 12, 0, 0, 0, 16, 12 + hash(i + 3) * 10, 10)); }
    g.add(wh);
  } else if (W.mapId === 'town' || W.mapId === 'road') {
    // more of the town: roofs past the edge and the hills behind
    const n = W.mapId === 'road' ? 40 : 30;
    const hs = new THREE.InstancedMesh(mergeGeos([[BOX(1, 1, 1), M4(0, 0.5, 0), '#c8b498'], [new THREE.ConeGeometry(0.78, 0.45, 4), M4(0, 1.22, 0, 0, Math.PI / 4, 0), '#8a3e2a']]), std({ vertexColors: true, roughness: 0.9 }), n);
    ring(n, 46, 80, (x, z, i) => { const s = 7 + hash(i) * 6; hs.setMatrixAt(i, M4(W.mapId === 'road' ? (i % 2 ? 1 : -1) * (W0 / 2 + 6 + hash(i) * 14) : x, 0, W.mapId === 'road' ? -H0 / 2 + (i / n) * H0 : z, 0, hash(i + 2) * 0.5, 0, s, s * (0.8 + hash(i + 1)), s)); });
    g.add(hs);
    const hills = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2), std({ color: '#6a7a4a', roughness: 1 }), 12);
    ring(12, 170, 260, (x, z, i) => hills.setMatrixAt(i, M4(x, -2, z, 0, 0, 0, 60 + hash(i) * 50, 25 + hash(i + 1) * 30, 60)));
    g.add(hills);
    if (W.mapId === 'road') {
      // the bridge at the end of the road
      const br = new THREE.Mesh(mergeGeos([[BOX(8 * CS + 2, 0.6, 6 * CS), M4(0, -0.3, 0), '#7a746a'], [BOX(0.4, 1.1, 6 * CS), M4(4 * CS + 0.8, 0.55, 0), '#8a847a'], [BOX(0.4, 1.1, 6 * CS), M4(-4 * CS - 0.8, 0.55, 0), '#8a847a']]), std({ vertexColors: true, roughness: 0.9 }));
      br.position.set(S.cw(G, 8), 0, S.cwz(G, 3)); g.add(br);
    }
  } else if (W.mapId === 'refinery') {
    const dunes = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 8, 0, TAU, 0, Math.PI / 2), std({ color: '#c8935e', roughness: 1 }), 18);
    ring(18, 90, 220, (x, z, i) => dunes.setMatrixAt(i, M4(x, -1, z, 0, hash(i) * 3, 0, 40 + hash(i) * 40, 8 + hash(i + 1) * 14, 30 + hash(i + 2) * 30)));
    g.add(dunes);
    const stacks = new THREE.InstancedMesh(mergeGeos([[CYL(1.2, 1.6, 30, 14), M4(0, 15, 0), '#8a8680'], [CYL(1.25, 1.25, 1, 14), M4(0, 26, 0), '#a83224']]), std({ vertexColors: true, roughness: 0.7 }), 4);
    for (let i = 0; i < 4; i++) stacks.setMatrixAt(i, M4(-40 + i * 26, 0, -H0 / 2 - 30 - hash(i) * 20));
    g.add(stacks); R.map.extras.push({ k: 'stacks', pos: [[-40, 30, -H0 / 2 - 30], [-14, 30, -H0 / 2 - 40]] });
    // pipe racks along the yard
    const pipe = new THREE.InstancedMesh(mergeGeos([[CYL(0.25, 0.25, 30, 10), M4(0, 3.4, 0, Math.PI / 2, 0, 0), '#9a968e'], [CYL(0.18, 0.18, 30, 10), M4(0.7, 3.4, 0, Math.PI / 2, 0, 0), '#b8b0a0']]), std({ vertexColors: true, roughness: 0.5, metalness: 0.6 }), 2);
    pipe.setMatrixAt(0, M4(-W0 / 2 - 4, 0, 0)); pipe.setMatrixAt(1, M4(W0 / 2 + 4, 0, 0)); g.add(pipe);
  } else if (W.mapId === 'range') {
    // earth berms and the range flags
    const berm = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 16, 8, 0, TAU, 0, Math.PI / 2), std({ color: '#7a6a4e', roughness: 1 }), 8);
    ring(8, 40, 70, (x, z, i) => berm.setMatrixAt(i, M4(x, -1, z, 0, 0, 0, 30, 10 + hash(i) * 6, 30)));
    g.add(berm);
  }
  void look; void sz; void snow;
}
function buildObjectives(W) {
  const M = R.map, g = M.group;
  for (const f of M.flags) g.remove(f.g);
  for (const s of M.sites) g.remove(s);
  M.flags = []; M.sites = [];
  if (W.flags) for (const f of W.flags) {
    const fg = new THREE.Group();
    const pole = new THREE.Mesh(CYL(0.05, 0.05, 4, 8), std({ color: '#c8c8c0', metalness: 0.6, roughness: 0.4 })); pole.position.y = 2; fg.add(pole);
    const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 8, 4), std({ color: '#e8e2d6', side: THREE.DoubleSide, roughness: 0.9 })); cloth.position.set(0.72, 3.5, 0); fg.add(cloth);
    const ringM = new THREE.Mesh(new THREE.RingGeometry(f.r - 0.15, f.r, 48), new THREE.MeshBasicMaterial({ color: '#e8e2d6', transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide })); ringM.rotation.x = -Math.PI / 2; ringM.position.y = 0.04; fg.add(ringM);
    fg.position.set(f.x, 0, f.z); g.add(fg); M.flags.push({ g: fg, cloth, ring: ringM, f });
  }
  if (W.dem) for (let i = 0; i < 2; i++) {
    const s = new THREE.Group();
    const pad = new THREE.Mesh(new THREE.CircleGeometry(1.6, 32), new THREE.MeshBasicMaterial({ color: '#ffd36a', transparent: true, opacity: 0.22, depthWrite: false })); pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03; s.add(pad);
    const box = new THREE.Mesh(BOX(0.8, 0.6, 0.6), std({ color: '#3a4030', roughness: 0.8 })); box.position.y = 0.3; box.castShadow = true; s.add(box);
    M.sites.push(s); g.add(s); s.userData.i = i;
  }
  if (W.targets && !M.targets) {
    const tg = mergeGeos([[BOX(0.56, 1.55, 0.04), M4(0, 1.08, 0), '#d8c8a0'], [new THREE.CircleGeometry(0.12, 16), M4(0, 1.6, 0.025), '#a83224'], [new THREE.RingGeometry(0.18, 0.22, 20), M4(0, 1.1, 0.025), '#3a3a3a'], [BOX(0.06, 0.3, 0.06), M4(0, 0.15, 0), '#4a3a2a']]);
    const im = new THREE.InstancedMesh(tg, std({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), W.targets.length);
    im.frustumCulled = false; im.castShadow = true; g.add(im); M.targets = im;
  }
}
function buildWeather(W) {
  const look = W.look, T = TIERS[R.q], g = R.map.group;
  if (look.snow || look.rain || look.dust) {
    const n = Math.round((look.rain ? 1600 : 1000) * T.weather * (look.snow || 1));
    const geo = new THREE.BufferGeometry(); const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (hash(i) - 0.5) * 60; pos[i * 3 + 1] = hash(i + n) * 24; pos[i * 3 + 2] = (hash(i + 2 * n) - 0.5) * 60; }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: look.rain ? '#b8c8d8' : look.snow ? '#ffffff' : '#e8c89a', size: look.rain ? 0.05 : look.snow ? 0.09 : 0.05, transparent: true, opacity: look.rain ? 0.55 : look.snow ? 0.85 : 0.35, depthWrite: false, sizeAttenuation: true });
    const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; g.add(pts);
    R.map.weather = { pts, n, pos, rain: !!look.rain, snow: look.snow || 0 };
  }
}
function runJobs(budget) {
  const t0 = performance.now();
  while (R.jobs.length && performance.now() - t0 < budget) { const j = R.jobs.shift(); try { j(); } catch (e) { console.warn(e); } }
  if (!R.jobs.length && !R.compiled) {
    R.compiled = true; applyCheap(R.scene); prewarm();
  }
}

/* ================================================================ people */
function loadPeople() {
  if (R.huState || (R.soft && !R.lockQ)) return; // a software renderer gets the light figures unless a quality is pinned
  R.huState = 1;
  import('/games/shared/human.js').then((m) => { R.hu = m; R.huState = 2; }).catch(() => { R.huState = -1; });
}
function loadVfx() {
  if (R.vfxState) return;
  R.vfxState = 1;
  import('/games/shared/vfx.js').then((m) => { R.vfxMod = m; R.vfxState = 3; }).catch(() => { R.vfxState = -1; });
}
// the effect library compiles its shaders when it is made: only make it off play (menu, pause, results)
function makeVfx() {
  if (R.vfxState !== 3 || (ARC && ARC.state === 'play' && !R.devForce)) return;
  R.vfx = R.vfxMod.createVFX(R.renderer, R.scene, R.camera, { quality: R.q, unit: 1, groundY: 0, reduced: ARC.reducedMotion });
  try { R.vfx.warm(); } catch (e) { /* first use compiles */ }
  R.vfxState = 2; prewarm();
}
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _s = new THREE.Vector3(1, 1, 1), _mm = new THREE.Matrix4(), _c = new THREE.Color();
const kitOf = (W, c) => (W.ffa && !c.isPlayer ? 2 : c.team === 0 ? 0 : 1);
function rigFor(W, i, c) {
  let r = R.rigs[i];
  const key = c.uid + ':' + kitOf(W, c);
  if (r && r.key === key) return r;
  if (!r) {
    const q = R.q >= 3 ? 3 : 2;
    const h = R.hu.createHuman({ seed: 300 + i * 41, unit: 1, quality: q, lod: q >= 3 ? 'full' : 'mid', build: i % 3 === 0 ? 'athletic' : i % 3 === 1 ? 'average' : 'slim', hair: 'buzz', sex: 'm' });
    h.group.visible = false; R.scene.add(h.group);
    const K = kitGeos();
    const helmet = new THREE.Mesh(K.helmet, K.mats[0].helmet), vest = new THREE.Mesh(K.vest, K.mats[0].vest);
    h.bones.head.add(helmet); h.bones.chest.add(vest);
    helmet.position.set(0, 0, 0); vest.position.set(0, 0.02, 0);
    r = R.rigs[i] = { h, helmet, vest, key: '', vR: new THREE.Vector3(), vL: new THREE.Vector3(), crouch: false, down: false, slide: false, hit: 0, cheer: false, downT: 0 };
  }
  const k = kitOf(W, c), kit = k === 2 ? D.FFA_KIT : D.FACTIONS[k].kit, K = kitGeos();
  r.h.setOutfit({ top: kit.top, top2: kit.top2, sleeves: 'long', bottom: kit.bottom, legs: 'trousers', shoes: kit.shoes, soles: kit.soles, gloves: kit.gloves, number: null });
  r.helmet.material = K.mats[k].helmet; r.vest.material = K.mats[k].vest;
  const cs = R.q >= 2; r.h.mesh.castShadow = cs; r.helmet.castShadow = cs; r.vest.castShadow = cs;
  r.key = key; r.crouch = r.down = r.slide = r.cheer = false; r.h.stop(); r.h.aim('right', null); r.h.aim('left', null);
  return r;
}
function poseRig(W, i, c, dt, show) {
  const r = rigFor(W, i, c), h = r.h, g = h.group;
  if (!show) { g.visible = false; return false; }
  g.visible = true;
  const fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw), cp = Math.cos(c.pitch), fy = Math.sin(c.pitch), rx = Math.cos(c.yaw), rz = -Math.sin(c.yaw);
  const prone = c.alive && c.stance === 'prone' && c.stanceK > 0.5;
  g.position.set(c.x - (prone ? fx * 0.8 : 0), c.y + (prone ? 0.18 : 0), c.z - (prone ? fz * 0.8 : 0));
  g.rotation.set(prone ? -Math.PI / 2 * clamp(c.stanceK, 0, 1) : 0, c.yaw + Math.PI, c.alive ? -c.leanK * 0.22 : 0, 'YXZ');
  if (!c.alive) {
    // knocked down: a fall that ends on the back and stays there
    if (!r.down) { r.down = true; r.downT = 0; h.aim('right', null); h.aim('left', null); h.stop(); h.play('fall', { intensity: 1 }); }
    r.downT += dt;
    if (r.downT > 1.05 && !r.held) { r.held = true; h.play('fall', { from: 0.66, speed: 0.004, hold: true }); }
    h.setMood(-0.6);
    h.update(dt, { speed: 0 });
    return true;
  }
  if (r.down) { r.down = false; r.held = false; h.stop(); }
  // both hands on the rifle: right at the grip, left out under the handguard
  h.bones.shoulderR.getWorldPosition(_v);
  r.vR.set(_v.x + fx * cp * 0.42 - rx * 0.05, _v.y + fy * 0.42 - 0.22, _v.z + fz * cp * 0.42 - rz * 0.05);
  h.bones.shoulderL.getWorldPosition(_v);
  r.vL.set(_v.x + fx * cp * 0.72 + rx * 0.22, _v.y + fy * 0.72 - 0.12, _v.z + fz * cp * 0.72 + rz * 0.22);
  const rel = S.curW(c).reloadT > 0 ? 1 : 0;
  h.aim('right', r.vR, { elbow: 1.35 - c.adsK * 0.25 });
  if (c.cheerT > 0.6 && !W.ffa) { if (!r.cheer) { r.cheer = true; h.aim('left', null); h.play('fistPump', { side: 'left' }); } }
  else { r.cheer = false; h.aim('left', r.vL, { elbow: 0.6 + rel * 0.7 }); }
  const cr = c.stance === 'crouch' || c.stance === 'prone';
  if (cr !== r.crouch) { r.crouch = cr; if (cr) h.play('crouch'); else h.stop('crouch'); }
  const sl = c.stance === 'slide';
  if (sl && !r.slide) { r.slide = true; h.play('slide'); } else if (!sl) r.slide = false;
  if (c.flinch > 0.95 && r.hit <= 0) { h.play('stumble', { intensity: 0.25 }); r.hit = 0.6; }
  r.hit -= dt;
  const T = c.bot && c.bot.vis && c.bot.target ? c.bot.target : null;
  if (T) h.lookAt(_v2.set(T.x, T.y + 1.5, T.z)); else h.lookAt(null);
  h.setMood(c.cheerT > 0 ? 0.7 : c.suppress > 0.5 ? -0.4 : 0);
  h.update(dt, { speed: Math.hypot(c.vx, c.vz) });
  return true;
}
function placeGun(c, i, rig) {
  // the rifle in the right hand, along the aim
  const im = R.guns.im;
  if (rig) { rig.h.group.updateMatrixWorld(true); rig.h.bones.wristR.getWorldPosition(_v); }
  else { _v.set(c.x + Math.cos(c.yaw) * 0.22 - Math.sin(c.yaw) * 0.25, S.chestY(c) + 0.05, c.z - Math.sin(c.yaw) * 0.22 - Math.cos(c.yaw) * 0.25); }
  const rel = S.curW(c).reloadT > 0 ? 0.5 : 0;
  _e.set(c.pitch - rel, c.yaw, 0); _q.setFromEuler(_e);
  _mm.compose(_v, _q, _s.set(1, 1, 1)); _mm.multiply(M_GUN);
  im.setMatrixAt(i, _mm);
}
const M_GUN = new THREE.Matrix4().makeTranslation(0, 0.03, -0.12);
function poseFallback(W, i, c) {
  const F = R.fallback;
  let m = F.meshes[i];
  const k = kitOf(W, c);
  if (!m) { m = F.meshes[i] = new THREE.Mesh(F.geos[k], R.q === 0 ? cheapOf(F.mat) : F.mat); m.userData.full = F.mat; m.castShadow = R.q >= 2; R.scene.add(m); m.userData.k = k; }
  if (m.userData.k !== k) { m.geometry = F.geos[k]; m.userData.k = k; }
  m.visible = true;
  const prone = c.alive && c.stance === 'prone';
  const sy = c.alive ? (prone ? 1 : 1 - c.stanceK * 0.32) : 1;
  m.position.set(c.x, c.y + (prone ? 0.25 : 0), c.z);
  m.rotation.set(!c.alive ? Math.PI / 2 * clamp(c.downT * 2, 0, 1) * -1 : prone ? -Math.PI / 2 : 0, c.yaw, c.alive ? c.leanK * 0.2 : 0, 'YXZ');
  m.scale.set(1, sy, 1);
}
function updatePeople(W, dt, firstPerson) {
  const T = TIERS[R.q], P = W.P, cam = R.camera.position;
  const useRigs = R.huState === 2 && T.rigs > 0 && R.rigWarm;
  // nearest people get full rigs, the rest the light figure
  const order = W.chars.map((c, i) => [i, (c.x - cam.x) * (c.x - cam.x) + (c.z - cam.z) * (c.z - cam.z)]).sort((a, b) => a[1] - b[1]);
  const rank = new Array(W.chars.length);
  order.forEach(([i], k) => { rank[i] = k; });
  let gn = 0; R.newRigs = 0;
  for (let i = 0; i < W.chars.length; i++) {
    const c = W.chars[i];
    const hide = (c === P && firstPerson) || c.gone || (!c.alive && c.downT > 8) || c.mount;
    let rig = useRigs && rank[i] < T.rigs && !hide;
    if (rig && !R.rigs[i]) { if (R.newRigs >= 1) rig = false; else R.newRigs++; }
    if (R.rigs[i] && !rig) R.rigs[i].h.group.visible = false;
    if (R.fallback.meshes[i] && (rig || hide)) R.fallback.meshes[i].visible = false;
    if (hide) continue;
    if (rig) poseRig(W, i, c, dt, true); else poseFallback(W, i, c);
    if (c.alive) placeGun(c, gn++, rig ? R.rigs[i] : null);
  }
  for (let i = W.chars.length; i < R.rigs.length; i++) if (R.rigs[i]) R.rigs[i].h.group.visible = false;
  for (let i = W.chars.length; i < R.fallback.meshes.length; i++) if (R.fallback.meshes[i]) R.fallback.meshes[i].visible = false;
  R.guns.im.count = gn; R.guns.im.instanceMatrix.needsUpdate = true;
}

/* ================================================================ effects from the world's events */
const tmpN = new THREE.Vector3(), tmpP = new THREE.Vector3();
function addTracer(ax, ay, az, bx, by, bz, w) {
  const T = R.tracers; const p = T.pool.find((x) => !x.on); if (!p) return;
  // a tracer lights a few metres out from the muzzle, so it never reads as a beam out of the gun
  const len = Math.hypot(bx - ax, by - ay, bz - az); if (len < 1.5) return;
  const off = Math.min(3.5, len * 0.3) / len; ax += (bx - ax) * off; ay += (by - ay) * off; az += (bz - az) * off;
  p.on = true; p.ax = ax; p.ay = ay; p.az = az; p.bx = bx; p.by = by; p.bz = bz; p.t = 0; p.w = w || 0.022; p.life = Math.min(0.12, Math.hypot(bx - ax, by - ay, bz - az) / 380 + 0.03);
}
function addHole(x, y, z, nx, ny, nz) {
  const H = R.holes, i = H.i; H.i = (H.i + 1) % 120; H.n = Math.min(120, H.n + 1);
  tmpN.set(nx, ny, nz); if (tmpN.lengthSq() < 0.1) tmpN.set(0, 1, 0);
  _q.setFromUnitVectors(ZAX, tmpN.normalize());
  _mm.compose(tmpP.set(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01), _q, _s.set(0.7 + hash(i) * 0.6, 0.7 + hash(i) * 0.6, 1));
  H.im.setMatrixAt(i, _mm); H.im.count = H.n; H.im.instanceMatrix.needsUpdate = true;
}
const ZAX = new THREE.Vector3(0, 0, 1);
function muzzleAt(W, c, big) {
  const M = R.muzzle;
  if (M.list.length > 20) return;
  let x, y, z;
  if (c.isPlayer && R.firstPerson && c === W.P) { R.vm.flashT = 0.05; return; }
  S.eyePos(c, _v); S.aimDir(c.yaw, c.pitch, _v2);
  x = _v.x + _v2.x * 0.75 + Math.cos(c.yaw) * 0.12; y = _v.y - 0.18 + _v2.y * 0.75; z = _v.z + _v2.z * 0.75 - Math.sin(c.yaw) * 0.12;
  M.list.push({ x, y, z, t: 0, s: big ? 0.6 : 0.42, r: hash(M.list.length + W.t * 100) * TAU });
  if (R.q >= 1 && !ARC.reducedMotion) { R.flashL.position.set(x, y, z); R.flashL.intensity = 6; }
}
function handleEvents(W) {
  const vx = R.vfxState === 2 ? R.vfx : null, P = W.P;
  for (const e of W.ev) {
    switch (e.k) {
      case 'shot': {
        const c = W.chars[e.c];
        const fromMe = c === P && R.firstPerson;
        if (e.tracer) {
          let ax = e.ox, ay = e.oy - 0.1, az = e.oz;
          if (fromMe && R.vm.muzzleW) { R.vm.muzzleW.getWorldPosition(_v3); ax = _v3.x; ay = _v3.y; az = _v3.z; }
          else { S.aimDir(c.yaw, c.pitch, _v2); ax += _v2.x * 0.8; ay += _v2.y * 0.8 - 0.1; az += _v2.z * 0.8; }
          if (!(D.WEAPONS[e.w] && D.WEAPONS[e.w].quiet)) addTracer(ax, ay, az, e.ex, e.ey, e.ez, fromMe ? 0.016 : 0.026);
        }
        const d2 = (e.ex - R.camera.position.x) ** 2 + (e.ez - R.camera.position.z) ** 2;
        if (e.hit === 'wall' || e.hit === 'floor' || e.hit === 'barrel' || e.hit === 'truck') {
          if (d2 < 2500 && !e.replay) addHole(e.ex, e.ey, e.ez, e.nx, e.ny, e.nz);
          if (vx && d2 < 3600) {
            const metal = e.hit === 'barrel' || e.hit === 'truck' || W.mapId === 'docks' && e.hit === 'wall' && e.ey > 0.2 && e.ey < 2.5;
            tmpN.set(e.nx, e.ny, e.nz);
            if (metal || Math.random() < 0.3) vx.impact(tmpP.set(e.ex, e.ey, e.ez), tmpN, { kind: 'spark', size: 0.35 });
            if (!metal) vx.impact(tmpP.set(e.ex, e.ey, e.ez), tmpN, { kind: 'dust', size: 0.4, color: W.look.snow && e.hit === 'floor' ? '#e8eef4' : W.mapId === 'refinery' || W.mapId === 'town' ? '#b89a78' : '#8a8478' });
          }
        } else if (e.hit === 'target' && vx) vx.impact(tmpP.set(e.ex, e.ey, e.ez), tmpN.set(0, 0, 1), { kind: 'dust', size: 0.5, color: '#c8b890' });
        break;
      }
      case 'hit': if (vx) { const c = W.chars[e.c]; tmpN.set(0, 1, 0); vx.impact(tmpP.set(e.x, e.y, e.z), tmpN, { kind: 'spark', size: 0.28, color: '#ffd8a0' }); vx.impact(tmpP.set(e.x, e.y, e.z), tmpN, { kind: 'dust', size: 0.3, color: '#8a8270' }); void c; } break;
      case 'muzzle': { const c = W.chars[e.c]; if (c && !e.quiet) muzzleAt(W, c, D.WEAPONS[e.w] && (D.WEAPONS[e.w].pellets || D.WEAPONS[e.w].id === 'lw8')); break; }
      case 'boom': if (vx) { vx.explosion(tmpP.set(e.x, e.y, e.z), { size: e.size || 1, debrisColor: '#4a4036' }); if (e.big) vx.smokePlume(tmpP.set(e.x, 0, e.z), { size: 2.5, duration: 30, fire: true }); } if (R.fx && !ARC.reducedMotion) { const d = Math.hypot(e.x - R.camera.position.x, e.z - R.camera.position.z); if (d < 30) R.fx.flash(0.25 * (1 - d / 30), '#ffd8a0'); } break;
      case 'plume': if (vx) vx.smokePlume(tmpP.set(e.x, 0, e.z), { size: 3, duration: 40, fire: true }); break;
      case 'flash': if (vx) { vx.impact(tmpP.set(e.x, e.y, e.z), tmpN.set(0, 1, 0), { kind: 'spark', size: 1.2, color: '#ffffff' }); vx.ring(tmpP.set(e.x, 0.05, e.z), '#ffffff', { size: 1.5, kind: 'shock' }); } break;
      case 'smoke': if (vx) vx.dust(tmpP.set(e.x, 0.1, e.z), { size: 1.5, color: '#b8bcbe' }); break;
      case 'dust': if (vx) vx.dust(tmpP.set(e.x, 0.1, e.z), { size: 1.2 }); break;
      case 'barrel': hideBarrel(W, e.i); break;
      case 'grid': if (R.map) refreshGrid(W); break;
      case 'recoil': R.vm.kick = Math.min(1.4, R.vm.kick + 0.5 + e.kick * 0.1); break;
      case 'swap': R.vm.lower = 1; break;
      case 'melee': if (W.chars[e.c] === P) R.vm.melee = 0.35; break;
      default: break;
    }
  }
}
function hideBarrel(W, i) {
  const M = R.map; if (!M) return;
  const G = W.G;
  if (M.barrels && M.barrelIdx.has(i)) { for (const j of M.barrelIdx.get(i)) M.barrels.setMatrixAt(j, ZERO); M.barrels.instanceMatrix.needsUpdate = true; }
  if (M.low && M.lowIdx.has(i)) { M.low.setMatrixAt(M.lowIdx.get(i), ZERO); M.low.instanceMatrix.needsUpdate = true; }
  const rb = M.rubble; if (rb && rb.count < 156) { const x = S.cw(G, i % G.gw + 0.5), z = S.cwz(G, ((i / G.gw) | 0) + 0.5); for (let k = 0; k < 4; k++) rb.setMatrixAt(rb.count++, M4(x + (hash(i + k) - 0.5) * 1.6, 0.08, z + (hash(i + k + 9) - 0.5) * 1.6, hash(k) * 3, hash(k + 1) * 3, 0, 0.6 + hash(k + i) * 0.8)); rb.instanceMatrix.needsUpdate = true; }
}
function updatePools(W, dt) {
  // tracers stream from the muzzle to the hit
  const T = R.tracers; let n = 0;
  const cam = R.camera.position;
  for (const p of T.pool) {
    if (!p.on) continue;
    p.t += dt; if (p.t > p.life) { p.on = false; continue; }
    const k0 = clamp(p.t / p.life - 0.35, 0, 1), k1 = clamp(p.t / p.life + 0.35, 0, 1);
    const ax = lerp(p.ax, p.bx, k0), ay = lerp(p.ay, p.by, k0), az = lerp(p.az, p.bz, k0), bx = lerp(p.ax, p.bx, k1), by = lerp(p.ay, p.by, k1), bz = lerp(p.az, p.bz, k1);
    _v.set(bx - ax, by - ay, bz - az); const L = _v.length(); if (L < 0.01) continue; _v.divideScalar(L);
    // a ribbon along the shot, turned to face the camera
    _v2.set((ax + bx) / 2 - cam.x, (ay + by) / 2 - cam.y, (az + bz) / 2 - cam.z).normalize();
    _v3.crossVectors(_v, _v2).normalize();
    const zc = _v2.crossVectors(_v3, _v).normalize();
    _mm.makeBasis(_v3, _v, zc); _mm.scale(_s.set(p.w * (1 + p.t * 6), L, 1)); _mm.setPosition(ax, ay, az);
    T.im.setMatrixAt(n++, _mm);
  }
  T.im.count = n; if (n) T.im.instanceMatrix.needsUpdate = true;
  // muzzle stars
  const M = R.muzzle; let m = 0;
  for (let i = M.list.length - 1; i >= 0; i--) { const f = M.list[i]; f.t += dt; if (f.t > 0.05) { M.list.splice(i, 1); continue; } }
  for (const f of M.list) { _q.copy(R.camera.quaternion); _q.multiply(_q2.setFromAxisAngle(ZAX, f.r)); _mm.compose(_v.set(f.x, f.y, f.z), _q, _s.set(f.s, f.s, f.s)); M.mesh.setMatrixAt(m++, _mm); }
  M.mesh.count = m; if (m) M.mesh.instanceMatrix.needsUpdate = true;
  R.flashL.intensity = damp(R.flashL.intensity, 0, 30, dt);
  // grenades, rockets
  let k = 0; for (const nd of W.nades) { if (k >= 16) break; _e.set(nd.spin, nd.spin * 0.7, 0); _q.setFromEuler(_e); _mm.compose(_v.set(nd.x, nd.y, nd.z), _q, _s.set(1, 1, 1)); R.nadeMesh.setMatrixAt(k++, _mm); }
  R.nadeMesh.count = k; if (k) R.nadeMesh.instanceMatrix.needsUpdate = true;
  k = 0; for (const r of W.rockets) { if (k >= 8) break; _v2.set(r.dx, r.dy, r.dz); _q.setFromUnitVectors(_v3.set(0, 0, -1), _v2); _mm.compose(_v.set(r.x, r.y, r.z), _q, _s.set(1, 1, 1)); R.rocketMesh.setMatrixAt(k++, _mm); if (R.vfxState === 2 && Math.random() < 0.6) R.vfx.dust(_v, { size: 0.4, color: '#c8c4bc' }); }
  R.rocketMesh.count = k; if (k) R.rocketMesh.instanceMatrix.needsUpdate = true;
  // smoke clouds: puffs that hang and roll
  const SM = R.smoke; let s = 0;
  for (const cl of W.smokes) {
    const per = Math.min(36, Math.round(16 + 20 * TIERS[R.q].weather));
    for (let j = 0; j < per && s < 120; j++) {
      const sd = SM.seeds[(s * 7) % 120], a = sd[0] * TAU + cl.t * 0.05, rr = Math.sqrt(sd[1]) * cl.r * 0.85, hy = 0.4 + sd[2] * cl.r * 0.55;
      const size = cl.r * (0.7 + sd[2] * 0.5);
      _v.set(cl.x + Math.cos(a) * rr, hy, cl.z + Math.sin(a) * rr);
      _q.copy(R.camera.quaternion); _q.multiply(_q2.setFromAxisAngle(ZAX, sd[0] * 6 + cl.t * 0.1 * (sd[1] - 0.5)));
      _mm.compose(_v, _q, _s.set(size, size, size)); SM.im.setMatrixAt(s++, _mm);
    }
  }
  SM.im.count = s; if (s) SM.im.instanceMatrix.needsUpdate = true;
  // crates on parachutes, drones, the heli, trucks
  for (let i = 0; i < R.crates.length; i++) R.crates[i].visible = false;
  W.crates.forEach((cr, i) => {
    let m2 = R.crates[i]; if (!m2) { m2 = R.crate.clone(); R.scene.add(m2); R.crates[i] = m2; }
    m2.visible = true; m2.position.set(cr.x, cr.y, cr.z); m2.children[1].visible = !cr.landed; m2.rotation.y = i * 1.3;
  });
  const dr = W.drones;
  R.drone.visible = !!dr[0]; R.drone2.visible = !!dr[1];
  if (dr[0]) R.drone.position.set(dr[0].x + Math.cos(dr[0].a) * 18, 26, dr[0].z + Math.sin(dr[0].a) * 18);
  if (dr[1]) R.drone2.position.set(dr[1].x + Math.cos(-dr[1].a) * 18, 28, dr[1].z + Math.sin(-dr[1].a) * 18);
  if (W.heli) { R.heli.visible = true; R.heli.position.set(W.heli.x, W.heli.y, W.heli.z); R.heli.rotation.y = Math.PI; R.heli.userData.rotor.rotation.y += dt * 24; R.heli.userData.tail.rotation.x += dt * 30; if (W.heli.state === 'down' && R.vfxState === 2 && Math.random() < 0.3) R.vfx.dust(_v.set(W.heli.x + (Math.random() - 0.5) * 8, 0.2, W.heli.z + (Math.random() - 0.5) * 8), { size: 1.6, color: W.look.snow ? '#e8eef4' : '#b0a088' }); }
  else R.heli.visible = false;
  R.trucks.forEach((t, i) => { const tr = W.convoy && W.convoy.trucks[i]; t.visible = !!tr; if (tr) { t.position.set(tr.x, 0, tr.z); t.rotation.y = 0; } });
  // flags fly the owner's colour
  if (R.map) {
    for (const F of R.map.flags) { const f = F.f, col = f.owner < 0 ? '#e8e2d6' : f.owner === W.P.team ? D.FACTIONS[0].tag : D.FACTIONS[1].tag; F.cloth.material.color.set(col); F.ring.material.color.set(f.contested ? '#ff6a4a' : col); F.cloth.rotation.y = Math.sin(W.t * 2 + f.x) * 0.2; }
    if (W.dem) R.map.sites.forEach((s, i) => { const st = W.demSites[i]; s.position.set(st.x, 0, st.z); s.visible = true; });
    if (R.map.targets && W.targets) { W.targets.forEach((tg, i) => { _e.set(-(1 - tg.k) * Math.PI / 2, Math.atan2(W.P.x - tg.x, W.P.z - tg.z), 0); _q.setFromEuler(_e); _mm.compose(_v.set(tg.x, tg.y, tg.z), _q, _s.set(1, 1, 1)); R.map.targets.setMatrixAt(i, _mm); }); R.map.targets.instanceMatrix.needsUpdate = true; }
    for (const x of R.map.extras) { if (x.k === 'blink') x.m.visible = Math.sin(W.t * 4) > 0; else if (x.k === 'stacks' && R.vfxState === 2 && !x.on) { x.on = true; for (const p of x.pos) R.vfx.smokePlume(_v.set(p[0], p[1], p[2]), { size: 3, duration: 0, color: '#6a645c' }); } }
    const wt = R.map.weather;
    if (wt) {
      const P2 = wt.pos, fall = wt.rain ? 16 : wt.snow ? 1.4 : 0.3;
      for (let i = 0; i < wt.n; i++) {
        let y = P2[i * 3 + 1] - fall * dt * (0.7 + hash(i) * 0.6); let x = P2[i * 3] + (wt.snow ? Math.sin(W.t + i) * 0.3 * dt : 0.4 * dt);
        if (y < 0) y += 24;
        P2[i * 3] = x; P2[i * 3 + 1] = y;
      }
      wt.pts.geometry.attributes.position.needsUpdate = true;
      wt.pts.position.set(Math.round(cam.x / 30) * 30 - 0, 0, Math.round(cam.z / 30) * 30);
      // keep the field around the camera
      for (let i = 0; i < wt.n; i += 7) { const ox = P2[i * 3] + wt.pts.position.x - cam.x, oz = P2[i * 3 + 2] + wt.pts.position.z - cam.z; if (ox > 30) P2[i * 3] -= 60; else if (ox < -30) P2[i * 3] += 60; if (oz > 30) P2[i * 3 + 2] -= 60; else if (oz < -30) P2[i * 3 + 2] += 60; }
    }
  }
}
const _q2 = new THREE.Quaternion();

/* ================================================================ the viewmodel */
function updateViewModel(W, dt, show) {
  const VM = R.vm, P = W.P;
  VM.root.visible = show;
  if (!show) return;
  const s = S.curW(P), d = s.def;
  const id = d.id;
  if (VM.cur !== id) {
    for (const k in VM.meshes) VM.meshes[k].visible = k === id;
    VM.cur = id;
    const L = d.len || 0.6, pistol = d.slot === 1 && id !== 'rk3';
    for (const k in VM.optics) VM.optics[k].visible = !pistol && !d.scope && id !== 'turret' && d.optic === k;
    for (const k in VM.mods) VM.mods[k].visible = false;
    if (!pistol && id !== 'turret' && id !== 'rk3') {
      if (d.mod === 'quiet') { VM.mods.quiet.visible = true; VM.mods.quiet.position.set(0, 0.012, -0.18 - L * 0.78 - 0.08); }
      if (d.mod === 'grip') { VM.mods.grip.visible = true; VM.mods.grip.position.set(0, -0.07, -0.25); }
      if (d.mod === 'laser') { VM.mods.laser.visible = true; VM.mods.laser.position.set(0.035, 0.0, -0.3); }
      if (d.mod === 'mag') { VM.mods.mag.visible = true; VM.mods.mag.position.set(0, -0.15, -0.06); }
    }
    const len = id === 'turret' ? 1.3 : pistol ? 0.22 : id === 'rk3' ? 0.7 : 0.18 + L * 0.78 + (d.mod === 'quiet' ? 0.16 : 0);
    if (!VM.muzzleW) { VM.muzzleW = new THREE.Object3D(); VM.gun.add(VM.muzzleW); VM.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), R.muzzle.mesh.material); VM.flash.renderOrder = 51; VM.flash.onBeforeRender = vmBefore; VM.flash.onAfterRender = vmAfter; VM.flash.frustumCulled = false; VM.gun.add(VM.flash); }
    VM.muzzleW.position.set(0, 0.012, -len); VM.flash.position.set(0, 0.012, -len - 0.04);
    VM.handL.position.set(pistol ? -0.012 : -0.01, pistol ? -0.06 : 0.0, pistol ? 0.03 : -0.24);
    VM.handL.visible = id !== 'turret'; VM.handR.visible = id !== 'turret';
    VM.armR.visible = id !== 'turret'; VM.armL.visible = id !== 'turret';
    // kit colours on the sleeves and gloves
    const kit = D.FACTIONS[0].kit; VM.sleeve.color.set(kit.top); VM.glove.color.set(kit.gloves);
  }
  // sway against the look, bob with the stride, recoil, reload, sprint
  const dyaw = angDiff(VM.prevYaw, P.yaw), dp = P.pitch - VM.prevPitch; VM.prevYaw = P.yaw; VM.prevPitch = P.pitch;
  const adsK = P.adsK, still = 1 - adsK * 0.85;
  VM.swayX = damp(VM.swayX, clamp(dyaw * 3, -0.06, 0.06) * still, 9, dt); VM.swayY = damp(VM.swayY, clamp(-dp * 3, -0.05, 0.05) * still, 9, dt);
  const sp = Math.hypot(P.vx, P.vz);
  VM.bob += dt * (P.sprint ? 12 : 8) * clamp(sp / 4.5, 0, 1.5);
  VM.sprintK = damp(VM.sprintK, P.sprint ? 1 : 0, 8, dt);
  VM.kick = damp(VM.kick, 0, 14, dt); VM.lower = damp(VM.lower, 0, 7, dt); VM.melee = Math.max(0, (VM.melee || 0) - dt);
  const reload = s.reloadT > 0 ? Math.sin(clamp(1 - s.reloadT / Math.max(0.01, s.reloadDur), 0, 1) * Math.PI) : 0;
  const cook = P.cookT >= 0 || P.throwT > 0 ? 1 : 0;
  const bobA = clamp(sp / 4.5, 0, 1.4) * (1 - adsK * 0.9) * (P.onGround ? 1 : 0.2);
  const base = _v.copy(VMPOS.hip).lerp(VMPOS.ads, adsK).lerp(VMPOS.sprint, VM.sprintK);
  if (d.slot === 1) base.y += 0.02 * (1 - adsK);
  // a tall portrait screen is narrow: keep the hip weapon inside it
  if (R.camera.aspect < 1) base.x *= Math.max(0.45, R.camera.aspect);
  if (d.id === 'turret') base.set(0, -0.36, -0.75);
  if (d.scope && adsK > 0.85) base.y -= 0.4;
  const g = VM.gun;
  g.position.set(base.x + VM.swayX + Math.sin(VM.bob) * 0.012 * bobA, base.y + VM.swayY - Math.abs(Math.cos(VM.bob)) * 0.014 * bobA - VM.lower * 0.25 - reload * 0.08 - cook * 0.18 - (W.land || 0) * 0.04, base.z + VM.kick * 0.045 + VM.melee * -0.15);
  g.rotation.set(VM.kick * 0.06 + reload * 0.55 + VM.sprintK * -0.35 - cook * 0.4 + VM.lower * -0.6, VM.sprintK * 0.55 + VM.swayX * 2, reload * 0.4 + VM.sprintK * 0.25 + P.leanK * 0.15, 'YXZ');
  // arms reach back from the hands toward the shoulders
  VM.armR.position.set(0.05, -0.17, 0.27); VM.armR.rotation.set(1.15, 0, 0.25);
  VM.armL.position.set(d.slot === 1 ? 0.02 : -0.06, d.slot === 1 ? -0.16 : -0.1, d.slot === 1 ? 0.2 : 0.0); VM.armL.rotation.set(1.25, 0, -0.55);
  // the field of view changes with the zoom: keep the gun the same size on screen
  const k = Math.tan(R.camera.fov * Math.PI / 360) / Math.tan(R.baseFov * Math.PI / 360);
  VM.root.scale.setScalar(k);
  VM.flash.visible = (VM.flashT || 0) > 0 && !d.quiet;
  if (VM.flash.visible) { VM.flash.rotation.z = Math.random() * TAU; VM.flash.scale.setScalar(0.8 + Math.random() * 0.6); if (R.q >= 1 && !ARC.reducedMotion) { VM.muzzleW.getWorldPosition(_v2); R.flashL.position.copy(_v2); R.flashL.intensity = 5; } }
  VM.flashT = Math.max(0, (VM.flashT || 0) - dt);
}

/* ================================================================ cameras */
function baseFov(a) { const asp = a.w / Math.max(1, a.h); return asp >= 1.25 ? 72 : clamp(2 * Math.atan(Math.tan(40 * Math.PI / 180) / asp) * 180 / Math.PI, 72, 92); }
const camT = new THREE.Vector3();
function updateCamera(W, dt, a) {
  const cam = R.camera, P = W.P;
  R.baseFov = baseFov(a);
  let fov = R.baseFov;
  R.firstPerson = false;
  if (W.attract) {
    // a slow cinematic orbit over the field
    const long = W.G.gh > W.G.gw * 1.8, t = W.t * 0.05 + 0.6, r = long ? 26 : Math.max(W.G.gw, W.G.gh) * CS * 0.42;
    const ox = long ? W.P.x : 0, oz = long ? W.P.z : 0;
    cam.position.set(ox + Math.cos(t) * r, 15 + Math.sin(W.t * 0.07) * 3, oz + Math.sin(t) * r);
    camT.set(ox + Math.cos(t + 1.6) * r * 0.15, 1.5, oz + Math.sin(t + 1.6) * r * 0.15);
    cam.lookAt(camT); fov = 55;
  } else if (W.phase === 'killcam' && W.kc) {
    const K = W.chars[W.kc.ko.killer], Vt = W.chars[W.kc.ko.victim];
    if (K) {
      const fx = -Math.sin(K.yaw), fz = -Math.cos(K.yaw), rx = Math.cos(K.yaw), rz = -Math.sin(K.yaw);
      const ey = S.eyeY(K);
      const near = Math.abs(W.kc.t - W.kc.ko.t) < 0.6;
      const back = near ? 2.3 : 3.1;
      _v.set(K.x - fx * back + rx * 0.85, ey + 0.45, K.z - fz * back + rz * 0.85);
      cam.position.lerp(_v, Math.min(1, dt * 8));
      if (Vt && near) camT.set(Vt.x, S.chestY(Vt), Vt.z); else { S.aimDir(K.yaw, K.pitch, _v2); camT.set(K.x + _v2.x * 12, ey + _v2.y * 12, K.z + _v2.z * 12); }
      cam.lookAt(camT); fov = near ? 50 : 62;
    }
  } else if (W.phase === 'results') {
    // an establishing shot over the field behind the results panel
    const t = W.t * 0.04;
    cam.position.set(Math.cos(t) * 26, 11, Math.sin(t) * 26 + P.z * 0.3); camT.set(P.x * 0.3, 1.2, P.z * 0.3); cam.lookAt(camT); fov = 55;
  } else if (!P.alive && W.downCam) {
    // the down cam: up and away from the body, toward whoever did it
    const DC = W.downCam, K = DC.killer >= 0 ? W.chars[DC.killer] : null;
    const k = clamp(DC.t / 1.2, 0, 1);
    let tx = DC.x, tz = DC.z;
    if (W.dem && DC.t > 3) { const mate = W.chars.find((c) => c.alive && c.team === P.team); if (mate) { _v.set(mate.x + Math.sin(mate.yaw) * 2.6, mate.y + 2.2, mate.z + Math.cos(mate.yaw) * 2.6); cam.position.lerp(_v, Math.min(1, dt * 4)); camT.set(mate.x - Math.sin(mate.yaw) * 6, 1.4, mate.z - Math.cos(mate.yaw) * 6); cam.lookAt(camT); fov = 64; } }
    else {
      const ang = K ? Math.atan2(K.x - DC.x, K.z - DC.z) : P.yaw;
      _v.set(DC.x - Math.sin(ang) * (1.5 + k * 2.5), 0.6 + k * 2.8, DC.z - Math.cos(ang) * (1.5 + k * 2.5));
      cam.position.lerp(_v, Math.min(1, dt * 5));
      if (K) camT.lerp(_v2.set(K.x, S.chestY(K), K.z), Math.min(1, dt * 4)); else camT.set(tx, 0.4, tz);
      cam.lookAt(camT); fov = 60 - k * 10;
    }
  } else {
    // first person: the eye, a bob, the landing dip, lean roll, the zoom
    R.firstPerson = true;
    S.eyePos(P, _v);
    const sp = Math.hypot(P.vx, P.vz), bob = P.onGround && !P.mount ? Math.sin(P.phase * 2) * 0.03 * clamp(sp / 5, 0, 1.3) * (1 - P.adsK * 0.8) : 0;
    cam.position.set(_v.x, _v.y + bob - (W.land || 0) * 0.12, _v.z);
    if (!a.reducedMotion) cam.position.x += a.shakeX * 0.012, cam.position.y += a.shakeY * 0.012;
    cam.rotation.set(P.pitch, P.yaw, -P.leanK * 0.2 + (P.stance === 'slide' ? 0.06 : 0), 'YXZ');
    const d = S.curW(P).def;
    fov = R.baseFov / lerp(1, d.zoom, P.adsK) + (P.sprint ? 5 : 0) + (P.stance === 'slide' ? 8 : 0);
    if (d.scope && P.adsK > 0.85) fov = R.baseFov / d.zoom / 1.15;
  }
  if (Math.abs(cam.fov - fov) > 0.05) { cam.fov = damp(cam.fov, fov, R.firstPerson ? 18 : 4, dt); cam.updateProjectionMatrix(); }
  // the sun's shadow follows the action
  const T = TIERS[R.q];
  const f = R.firstPerson ? P : { x: cam.position.x * 0.3, z: cam.position.z * 0.3, y: 0 };
  R.sun.position.set(f.x + R.sunDir.x * 80, R.sunDir.y * 80 + 10, f.z + R.sunDir.z * 80); R.sun.target.position.set(f.x, 0, f.z); R.sun.target.updateMatrixWorld();
  void T;
}

/* ================================================================ the frame */
const PRJ = new THREE.Vector3();
V.init = (a) => { ARC = a; if (!setup(a)) return false; resize(a); return true; };
V.resize = (a) => resize(a);
V.setWorld = (W) => { setWorld(W); };
V.fov = () => R.camera.fov;
V.project = (x, y, z, out) => {
  PRJ.set(x, y, z).project(R.camera);
  const front = PRJ.z < 1 && PRJ.z > -1;
  out.x = (PRJ.x * 0.5 + 0.5) * ARC.w; out.y = (-PRJ.y * 0.5 + 0.5) * ARC.h; out.front = front;
  // behind the camera: mirror so off-screen arrows point the right way
  _v.set(x, y, z).sub(R.camera.position); R.camera.getWorldDirection(_v2);
  if (_v.dot(_v2) < 0) { out.front = false; }
  return out.front;
};
// the dev hook (screenshot and poster tooling) applies at once, even mid-round; players change it from a menu or pause
V.quality = (q, pin) => { R.lockQ = !!pin; R.devForce = true; setQuality(q, pin); applyProgram(true); };
V.graphics = (level) => { if (level === 'auto') { R.lockQ = false; return; } R.lockQ = true; setQuality(level === 'sharp' ? 3 : 1, true); };
V.debug = () => ({ quality: R.q, fps: Math.round(R.fps), soft: R.soft, calls: R.renderer.info.render.calls, tris: R.renderer.info.render.triangles, post: TIERS[Math.max(0, R.q)].post, people: R.huState, vfx: R.vfxState, jobs: R.jobs.length });
V.dev = { r3: () => R, prewarm: () => prewarm() };
V.render = (a, W, ctx) => {
  const now = performance.now(), raw = R.last ? (now - R.last) / 1000 : 1 / 60, dt = clamp(raw, 0.001, 0.1); R.last = now;
  let lost = R.lost; try { lost = lost || R.renderer.getContext().isContextLost(); } catch (e) { lost = true; }
  if (lost) { ctx.fillStyle = 'rgba(6,6,8,0.85)'; ctx.fillRect(0, 0, a.w, a.h); return false; }
  if (W.ev.length || true) { /* events below */ }
  R.time += dt;
  if (!W.attract && a.state === 'play') measureFps(raw); else applyProgram();
  runJobs(R.jobs.length > 3 ? 14 : 9);
  if (R.time > 1.2) loadPeople();
  if (R.time > 0.4) loadVfx();
  if (R.vfxState === 3) makeVfx();
  if (R.huState === 2 && !R.rigWarm && (a.state !== 'play' || R.devForce) && TIERS[R.q].rigs > 0 && W.chars.length) { const r = rigFor(W, 0, W.chars[0]); r.h.group.visible = false; R.rigWarm = true; prewarm(); }
  if (R.map && R.map.W !== W) { R.map.W = W; }
  const paused = a.state === 'pause';
  const sdt = paused ? 0 : dt * (W.phase === 'final' ? 0.3 : W.phase === 'killcam' && W.kc ? W.kc.slow : 1);
  handleEvents(W);
  updateCamera(W, paused ? 0 : dt, a);
  updatePeople(W, sdt, R.firstPerson);
  updatePools(W, sdt);
  updateViewModel(W, dt, R.firstPerson && !W.attract && a.state !== 'menu');
  if (R.vfxState === 2) { R.vfx.setReduced(a.reducedMotion); R.vfx.update(sdt); }
  R.renderer.info.reset();
  if (R.vfxState === 2 && !R.firstPerson) R.vfx.applyShake(R.camera);
  R.fx.render(R.scene, R.camera);
  if (R.vfxState === 2 && !R.firstPerson) R.vfx.removeShake(R.camera);
  return true;
};
V.newIntro = () => { if (R.fx) R.fx.intro(1.9); };
boot(V);
