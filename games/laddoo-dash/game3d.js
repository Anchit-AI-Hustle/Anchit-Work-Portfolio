import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX as createPost } from '/games/shared/fx3d.js';
import { boot, SPIRITS, BONUS, WALL, TAU, clamp, DX, DY } from '/games/laddoo-dash/core.js';

/*
 * Laddoo Dash in 3D. The rules live in core.js; this file builds the maze of
 * dark glass edged with neon, the hero and the four spirits, and films them
 * with a tilted camera that follows on a phone held upright.
 *
 * Boot is split into small steps run a few per frame, so the menu is live at
 * once and no single frame does heavy work. Each step builds its meshes and
 * compiles their shaders straight away, so nothing compiles mid-game.
 */

/* ------------------------------------------------------------ helpers (nothing here runs per frame) */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color(), _v = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), ZERO_M = new THREE.Matrix4().makeScale(0, 0, 0);
// Colours used every frame are parsed once, here, never in the loop.
const COLS = new Map();
function col(hex) { let c = COLS.get(hex); if (!c) { c = new THREE.Color(hex); COLS.set(hex, c); } return c; }
function hashf(i) { let x = Math.imul((i | 0) ^ 0x9e3779b9, 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return (x >>> 0) / 4294967296; }
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Bake a primitive into world space with one vertex colour, so a model merges into a single mesh.
function part(geo, hex, pos, rot, scl) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  ['uv', 'uv1'].forEach((k) => { if (g.attributes[k]) g.deleteAttribute(k); });
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  if (scl == null) _s.set(1, 1, 1); else if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
  _p.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  g.applyMatrix4(_m4.compose(_p, _q, _s));
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function merge(list) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  list.forEach((g) => { pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; g.dispose(); });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
// Flagstones: an uneven grid of stones, each its own tone, with mortar, grit and chipped edges.
function stoneFlags(g, w, nx, seed, base) {
  const r = rng(seed), cs = w / nx;
  g.fillStyle = '#120c0a'; g.fillRect(0, 0, w, w);
  for (let j = 0; j < nx; j++) for (let i = 0; i < nx; i++) {
    const off = (j % 2) * cs * 0.5, x = i * cs + off - (j % 2 && i === nx - 1 ? 0 : 0), y = j * cs;
    const v = 0.78 + r() * 0.4;
    _c.set(base).multiplyScalar(v); _c.r = Math.min(1, _c.r * (0.96 + r() * 0.1)); _c.b *= 0.94 + r() * 0.08;
    g.fillStyle = '#' + _c.getHexString();
    const pad = 3 + r() * 2;
    for (let k = -1; k <= 0; k++) g.fillRect(x + pad + k * w, y + pad, cs - pad * 2, cs - pad * 2);
    if (off) g.fillRect(x + pad - w, y + pad, cs - pad * 2, cs - pad * 2);
    for (let q = 0; q < 6; q++) { g.fillStyle = 'rgba(0,0,0,' + (0.05 + r() * 0.08) + ')'; const cx = x + r() * cs, cy = y + r() * cs, rr = cs * (0.12 + r() * 0.3); g.beginPath(); g.ellipse(cx % w, cy, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, TAU); g.fill(); }
  }
  for (let i = 0; i < 5000; i++) { const v = r(); g.fillStyle = v < 0.5 ? 'rgba(255,236,214,' + (0.03 + r() * 0.06) + ')' : 'rgba(0,0,0,' + (0.06 + r() * 0.1) + ')'; g.fillRect(r() * w, r() * w, 1 + r() * 1.5, 1 + r() * 1.5); }
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1;
  for (let i = 0; i < 40; i++) { const x = r() * w, y = r() * w; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); g.stroke(); }
}
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = o.aniso || 4;
  return t;
}

/* ------------------------------------------------------------ quality tiers */
const TIERS = [
  { px: 0.55, budget: 170000, post: false, mirror: false, fx: 0.5, light: false, map: 1024 },
  { px: 0.75, budget: 700000, post: true, mirror: true, fx: 0.75, light: false, map: 1024 },
  { px: 0.9, budget: 1300000, post: true, mirror: true, fx: 1, light: true, map: 1024 },
  { px: 1, budget: 2300000, post: true, mirror: true, fx: 1, light: true, map: 2048 }
];
const R = {
  renderer: null, scene: null, camera: null, post: null, ok: false, lost: false, soft: false, gpu: '',
  q: -1, lockQ: false, startQ: 3, fps: 60, fT: 0, fN: 0, good: 0, lastNow: 0, longest: 0,
  M: null, ox: 0, oz: 0, ready: false, queue: [], built: {}, ARC: null, G: null,
  cam: { tx: 0, tz: 0, dist: 20, pitch: 1.02, init: false, oT: 0, oB: 0, oL: 0, oR: 0, fitFor: '', push: 0, yaw: 0 },
  time: 0, taskLog: [], holds: [], wallFlash: 0, flashCol: new THREE.Color(), hero: null, sp: null, pel: null, fruit: null, glow: null, parts: null, diyas: null
};

/* ------------------------------------------------------------ shaders */
const SKY_VS = 'varying vec3 vDir;\nvoid main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = [
  'uniform float uTime; uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uGlow;',
  'varying vec3 vDir;',
  'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'void main(){',
  '  vec3 d = normalize(vDir); float y = d.y;',
  '  vec3 c = mix(uHor, uTop, smoothstep(-0.05, 0.6, y));',
  '  c += uGlow * exp(-abs(y - 0.05) * 9.0) * (0.55 + 0.45 * sin(d.x * 3.0 + uTime * 0.15));',
  '  if (y > 0.04) { vec2 g = d.xz / (y + 0.3) * 150.0; vec2 id = floor(g); float h = h21(id); vec2 f = fract(g) - 0.5; c += vec3(1.0, 0.92, 0.85) * step(0.982, h) * smoothstep(0.14, 0.0, length(f)) * (0.55 + 0.45 * sin(uTime * 2.0 + h * 50.0)) * smoothstep(0.04, 0.35, y) * 1.8; }',
  '  gl_FragColor = vec4(c, 1.0);',
  '}'
].join('\n');
const PART_VS = [
  'attribute float aSize; attribute vec4 aCol; uniform float uScale; varying vec4 vCol;',
  'void main(){ vCol = aCol; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }'
].join('\n');
const PART_FS = 'varying vec4 vCol;\nvoid main(){ vec2 q = gl_PointCoord - 0.5; float d = length(q); float a = smoothstep(0.5, 0.0, d); a *= a; gl_FragColor = vec4(vCol.rgb * a * vCol.a, 1.0); }';

/* ------------------------------------------------------------ renderer and the first, cheap frame */
function initRenderer(a) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: true, powerPreference: 'high-performance', stencil: false });
  } catch (e) { return false; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.setClearColor('#05030a');
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    R.gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R.soft = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i.test(R.gpu);
  } catch (e) { R.soft = false; }
  renderer.shadowMap.enabled = !R.soft;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.lost = true; }, false);
  a.canvas.addEventListener('webglcontextrestored', () => { R.lost = false; }, false);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#0a0614', 0.022);
  const camera = new THREE.PerspectiveCamera(36, Math.max(0.2, a.w / a.h), 0.3, 400);
  camera.position.set(0, 20, 12); camera.lookAt(0, 0, 0);
  const hemi = new THREE.HemisphereLight('#8a7cff', '#1c0c22', R.soft ? 1.5 : 0.75);
  const key = new THREE.DirectionalLight('#f1e6ff', 1.7);
  key.position.set(-7, 16, 9); key.castShadow = !R.soft;
  key.shadow.mapSize.set(1024, 1024); key.shadow.bias = -0.0006; key.shadow.normalBias = 0.02; key.shadow.radius = 3;
  scene.add(hemi, key, key.target);
  // The hero carries a warm light on a GPU. A software renderer would pay for it on every pixel even at zero, so it gets none.
  const heroLight = new THREE.PointLight('#ffc45a', 0, 5.5, 2);
  if (!R.soft) scene.add(heroLight);
  Object.assign(R, { renderer, scene, camera, hemi, key, heroLight, ok: true, ARC: a });
  // the sky: a gradient with a glow on the horizon and a field of stars
  const skyU = { uTime: { value: 0 }, uTop: { value: new THREE.Color('#05030f') }, uHor: { value: new THREE.Color('#2a0f3a') }, uGlow: { value: new THREE.Color('#ff3d8b').multiplyScalar(0.25) } };
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 12), new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false }));
  sky.frustumCulled = false; sky.renderOrder = -10; scene.add(sky);
  R.sky = sky; R.skyU = skyU;
  // the far ground: a dark glossy plain with a fading neon grid, so the maze floats in a place
  // the courtyard the maze stands in: worn sandstone flags, mortar lines, grit and a little wear
  // a software renderer pays for every texel it filters: a smaller picture and no anisotropic filtering there
  const groundTex = R.soft ? canvasTex(256, 256, (g, w) => stoneFlags(g, w, 4, 5, '#5e4c42'), { aniso: 1 }) : canvasTex(512, 512, (g, w) => stoneFlags(g, w, 4, 5, '#5e4c42'), { aniso: 8 });
  groundTex.repeat.set(40, 40); R.groundTex = groundTex;
  // ?q=0..3 pins a quality level (posters, tests). Full detail at 2 or 3 also means the lit materials, even on a software renderer.
  const qp = (location.search.match(/[?&]q=(\d)/) || [])[1];
  R.forceQ = qp == null ? -1 : clamp(+qp, 0, 3);
  R.cheap = R.soft && !(R.forceQ >= 2);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(160, 160).rotateX(-Math.PI / 2), R.cheap ? new THREE.MeshBasicMaterial({ map: groundTex, color: '#ffffff' }) : new THREE.MeshStandardMaterial({ map: groundTex, color: '#ffffff', roughness: 0.82, metalness: 0.0 }));
  ground.position.y = -1.1; ground.receiveShadow = false; scene.add(ground);
  R.ground = ground;
  R.post = createPost(renderer, { arc: a, intro: { dist: 16, yaw: 0.55, dur: 2.0 }, results: { dist: 16 }, target: (v) => { v.set(R.cam.tx, 0, R.cam.tz); return true; }, look: { bloom: 0.66, bloomWide: 0.45, threshold: 0.62, knee: 0.25, vignette: 0.36, grain: 0.032, sat: 0.97, contrast: 1.05, lift: [0.012, 0.012, 0.026], gain: [1.04, 1.0, 0.96] } });
  return true;
}

/* ------------------------------------------------------------ textures */
const TX = {};
function makeTextures() {
  TX.glow = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  }, { clamp: true });
  TX.skirt = canvasTex(8, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { clamp: true });
  // a rangoli pattern etched into the glass tops of the walls: white lines on black (an emissive map), four tiles a repeat
  TX.rangoli = canvasTex(256, 256, (g, w) => {
    g.fillStyle = R.cheap ? '#9a9a9a' : '#000000'; g.fillRect(0, 0, w, w);
    const line = R.cheap ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.8)';
    g.strokeStyle = line; g.fillStyle = line; g.lineWidth = 2;
    const motif = (cx, cy, r) => {
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        g.beginPath(); g.ellipse(cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.55, r * 0.42, r * 0.17, a, 0, TAU); g.stroke();
        g.beginPath(); g.arc(cx + Math.cos(a + Math.PI / 8) * r * 0.95, cy + Math.sin(a + Math.PI / 8) * r * 0.95, 2.2, 0, TAU); g.fill();
      }
      g.beginPath(); g.arc(cx, cy, r * 0.16, 0, TAU); g.stroke();
      g.beginPath(); g.arc(cx, cy, r * 1.12, 0, TAU); g.stroke();
    };
    motif(w / 2, w / 2, w * 0.3);
    [[0, 0], [w, 0], [0, w], [w, w]].forEach((q) => motif(q[0], q[1], w * 0.14));
    g.fillStyle = R.cheap ? '#9a9a9a' : '#000000'; g.fillRect(0, 0, 6, 6);
  });
  // the maze floor: smoked glass tiles with fine seams and a faint sheen
  TX.floor = canvasTex(256, 256, (g, w) => {
    const r = rng(9);
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 1400; i++) { const v = (r() - 0.5) * 0.08; g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.fillRect(r() * w, r() * w, 1 + r() * 2, 1 + r() * 2); }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 3;
    for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * w / 4, 0); g.lineTo(k * w / 4, w); g.moveTo(0, k * w / 4); g.lineTo(w, k * w / 4); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 1;
    for (let k = 0; k <= 4; k++) { g.beginPath(); g.moveTo(k * w / 4 + 2, 0); g.lineTo(k * w / 4 + 2, w); g.moveTo(0, k * w / 4 + 2); g.lineTo(w, k * w / 4 + 2); g.stroke(); }
  });
}

/* ------------------------------------------------------------ the maze: glass slabs, neon edges, light spill */
// The wall outline sits a margin m inside each wall tile wherever it borders an open tile, so corridors look wide
// and corners stay crisp. Each tile is split 3x3 (m, 1-2m, m) and a sub-cell is wall unless an open neighbour covers it.
const MARGIN = 0.2, WALL_H = 0.55;
function openish(M, x, y) {
  if (y < 0 || y >= M.H || x < 0 || x >= M.W) return false;
  const c = M.cells[y * M.W + x];
  return c !== WALL;
}
function buildMazeGeo(M) {
  const W = M.W, H = M.H, FW = W * 3, FH = H * 3;
  const fill = new Uint8Array(FW * FH);
  const S = [[-1, 0], [0], [0, 1]];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (M.cells[y * W + x] !== WALL) continue;
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      let open = false;
      for (const dy of S[j]) for (const dx of S[i]) { if ((dx || dy) && openish(M, x + dx, y + dy)) open = true; }
      if (!open) fill[(y * 3 + j) * FW + (x * 3 + i)] = 1;
    }
  }
  const edge = (k) => Math.floor(k / 3) - 0.5 + [0, MARGIN, 1 - MARGIN][k % 3];
  const ex = (k) => (k >= FW ? W - 0.5 : edge(k)), ez = (k) => (k >= FH ? H - 0.5 : edge(k));
  const ox = R.ox, oz = R.oz;
  const P = [], N = [], C = [], I = [], UV = [];
  const top = new THREE.Color(M.glass).lerp(new THREE.Color(M.neon2), 0.18), side = new THREE.Color(M.glass), low = new THREE.Color(M.glass).multiplyScalar(0.45);
  if (R.cheap) { top.lerp(new THREE.Color(M.neon), 0.3).multiplyScalar(1.25); side.lerp(new THREE.Color(M.neon), 0.2); low.lerp(new THREE.Color(M.neon), 0.08); }
  const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz, nx, ny, nz, c0, c1) => {
    const b = P.length / 3;
    P.push(ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz);
    for (let k = 0; k < 4; k++) N.push(nx, ny, nz);
    const cs = [c0, c1, c1, c0];
    for (let k = 0; k < 4; k++) C.push(cs[k].r, cs[k].g, cs[k].b);
    if (ny > 0.5) UV.push(ax / 4, -az / 4, bx / 4, -bz / 4, cx / 4, -cz / 4, dx / 4, -dz / 4);
    else UV.push(0.01, 0.99, 0.01, 0.99, 0.01, 0.99, 0.01, 0.99);
    I.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // tops, merged along rows
  for (let j = 0; j < FH; j++) {
    let i = 0;
    while (i < FW) {
      if (!fill[j * FW + i]) { i++; continue; }
      let e = i; while (e + 1 < FW && fill[j * FW + e + 1]) e++;
      const x0 = ex(i) + ox, x1 = ex(e + 1) + ox, z0 = ez(j) + oz, z1 = ez(j + 1) + oz;
      quad(x0, WALL_H, z0, x0, WALL_H, z1, x1, WALL_H, z1, x1, WALL_H, z0, 0, 1, 0, top, top);
      i = e + 1;
    }
  }
  // sides, neon strips along their top edges and a glow skirt on the floor in front of them
  const neon = [];
  const runs = (isEdge, len, other, emit) => {
    for (let o = 0; o < other; o++) {
      let k = 0;
      while (k < len) {
        if (!isEdge(k, o)) { k++; continue; }
        let e = k; while (e + 1 < len && isEdge(e + 1, o)) e++;
        emit(k, e + 1, o); k = e + 1;
      }
    }
  };
  const f = (i, j) => (i < 0 || j < 0 || i >= FW || j >= FH ? 0 : fill[j * FW + i]);
  // faces looking +z (south) and -z (north)
  runs((i, j) => f(i, j) && !f(i, j + 1), FW, FH, (a, b, j) => { const z = ez(j + 1) + oz, x0 = ex(a) + ox, x1 = ex(b) + ox; quad(x0, WALL_H, z, x0, 0, z, x1, 0, z, x1, WALL_H, z, 0, 0, 1, side, low); neon.push(x0, z, x1, z, 0, 1); });
  runs((i, j) => f(i, j) && !f(i, j - 1), FW, FH, (a, b, j) => { const z = ez(j) + oz, x0 = ex(a) + ox, x1 = ex(b) + ox; quad(x1, WALL_H, z, x1, 0, z, x0, 0, z, x0, WALL_H, z, 0, 0, -1, side, low); neon.push(x0, z, x1, z, 0, -1); });
  runs((j, i) => f(i, j) && !f(i + 1, j), FH, FW, (a, b, i) => { const x = ex(i + 1) + ox, z0 = ez(a) + oz, z1 = ez(b) + oz; quad(x, WALL_H, z1, x, 0, z1, x, 0, z0, x, WALL_H, z0, 1, 0, 0, side, low); neon.push(x, z0, x, z1, 1, 0); });
  runs((j, i) => f(i, j) && !f(i - 1, j), FH, FW, (a, b, i) => { const x = ex(i) + ox, z0 = ez(a) + oz, z1 = ez(b) + oz; quad(x, WALL_H, z0, x, 0, z0, x, 0, z1, x, WALL_H, z1, -1, 0, 0, side, low); neon.push(x, z0, x, z1, -1, 0); });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(UV, 2));
  geo.setIndex(I); geo.computeBoundingSphere();
  // neon tubes: a thin square bar just outside each face, along its top edge
  const nP = [], nI = [], nC = [], sP = [], sU = [], sI = [];
  const c1 = new THREE.Color(M.neon), c2 = new THREE.Color(M.neon2).multiplyScalar(0.7);
  const T = R.cheap ? 0.06 : 0.045;
  for (let k = 0; k < neon.length; k += 6) {
    let x0 = neon[k], z0 = neon[k + 1], x1 = neon[k + 2], z1 = neon[k + 3];
    const nx = neon[k + 4], nz = neon[k + 5];
    if (x0 === x1) { z0 -= T; z1 += T; } else { x0 -= T; x1 += T; }
    const cx0 = x0 + nx * T, cz0 = z0 + nz * T, cx1 = x1 + nx * T, cz1 = z1 + nz * T;
    // a lit bar: its top and its outward face are all the camera ever sees
    const b = nP.length / 3, y0 = WALL_H - T * 1.4, y1 = WALL_H + T * 0.5;
    const ax = nx * T, az = nz * T;
    nP.push(cx0 - ax, y1, cz0 - az, cx1 - ax, y1, cz1 - az, cx1 + ax, y1, cz1 + az, cx0 + ax, y1, cz0 + az,
      cx0 + ax, y0, cz0 + az, cx1 + ax, y0, cz1 + az);
    nI.push(b, b + 1, b + 2, b, b + 2, b + 3, b + 3, b + 2, b + 5, b + 3, b + 5, b + 4);
    for (let q = 0; q < 6; q++) nC.push(c1.r, c1.g, c1.b);
    // the glow skirt on the floor
    const sb = sP.length / 3, L = 0.62;
    sP.push(x0 + nx * 0.02, 0.012, z0 + nz * 0.02, x1 + nx * 0.02, 0.012, z1 + nz * 0.02, x1 + nx * L, 0.012, z1 + nz * L, x0 + nx * L, 0.012, z0 + nz * L);
    sU.push(0.5, 0, 0.5, 0, 0.5, 1, 0.5, 1);
    sI.push(sb, sb + 1, sb + 2, sb, sb + 2, sb + 3);
  }
  // a neon rim round the edge of the glass platform
  {
    const hx = W / 2 + 1, hz = H / 2 + 1, y = 0.03, w = 0.04, rim = [[-hx, -hz, hx, -hz], [-hx, hz, hx, hz], [-hx, -hz, -hx, hz], [hx, -hz, hx, hz]];
    rim.forEach((q) => { const b = nP.length / 3, h = q[1] === q[3]; const dx = h ? 0 : w, dz = h ? w : 0; nP.push(q[0] - dx, y, q[1] - dz, q[2] - dx, y, q[3] - dz, q[2] + dx, y, q[3] + dz, q[0] + dx, y, q[1] + dz); nI.push(b, b + 1, b + 2, b, b + 2, b + 3); for (let k = 0; k < 4; k++) nC.push(c2.r, c2.g, c2.b); });
  }
  const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.Float32BufferAttribute(nP, 3)); ng.setAttribute('color', new THREE.Float32BufferAttribute(nC, 3)); ng.setIndex(nI); ng.computeVertexNormals(); ng.computeBoundingSphere();
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(sP, 3)); sg.setAttribute('uv', new THREE.Float32BufferAttribute(sU, 2)); sg.setIndex(sI); sg.computeBoundingSphere();
  // the platform's sides, from the glass floor down to the plain below
  const pw = W / 2 + 1, ph = H / 2 + 1, D = 1.1;
  const plat = merge([
    part(new THREE.PlaneGeometry(pw * 2, D), M.glass, [0, -D / 2, ph]),
    part(new THREE.PlaneGeometry(pw * 2, D), M.glass, [0, -D / 2, -ph], [0, Math.PI, 0]),
    part(new THREE.PlaneGeometry(ph * 2, D), M.glass, [pw, -D / 2, 0], [0, Math.PI / 2, 0]),
    part(new THREE.PlaneGeometry(ph * 2, D), M.glass, [-pw, -D / 2, 0], [0, -Math.PI / 2, 0])
  ]);
  { const n = plat.attributes.position.count, pa = plat.attributes.position, u = new Float32Array(n * 2); for (let i = 0; i < n; i++) { u[i * 2] = (pa.getX(i) + pa.getZ(i)) * 0.45; u[i * 2 + 1] = pa.getY(i) * 0.45; } plat.setAttribute('uv', new THREE.BufferAttribute(u, 2)); }
  return { geo, ng, sg, plat };
}
function buildMaze(M) {
  const B = R.built;
  R.M = M; R.ox = -(M.W - 1) / 2; R.oz = -(M.H - 1) / 2;
  const { geo, ng, sg, plat } = buildMazeGeo(M);
  if (!B.walls) {
    // A software renderer gets unlit glass (its shading is baked into the vertex colours); a GPU gets lit, glossy glass.
    const wallMat = R.cheap ? new THREE.MeshBasicMaterial({ vertexColors: true, map: TX.rangoli }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 0.55, emissive: '#ffffff', emissiveMap: TX.rangoli });
    const neonMat = new THREE.MeshBasicMaterial({ color: '#ffffff', vertexColors: true, toneMapped: false, fog: false, side: THREE.DoubleSide });
    const skirtMat = new THREE.MeshBasicMaterial({ color: '#ffffff', map: TX.skirt, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false, side: THREE.DoubleSide });
    const floorMat = R.cheap ? new THREE.MeshBasicMaterial({ map: TX.floor, color: '#ffffff' }) : new THREE.MeshStandardMaterial({ map: TX.floor, color: '#ffffff', roughness: 0.22, metalness: 0.45, transparent: true, opacity: 0.86 });
    const doorMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false, fog: false });
    B.walls = new THREE.Mesh(geo, wallMat); B.walls.castShadow = true; B.walls.receiveShadow = true;
    B.neon = new THREE.Mesh(ng, neonMat); B.skirt = new THREE.Mesh(sg, skirtMat); B.skirt.renderOrder = 2;
    B.floor = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), floorMat); B.floor.receiveShadow = true; B.floor.renderOrder = 1;
    B.door = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 0.08), doorMat);
    // the light spill is many overlapping see-through strips: lovely on a GPU, slow on a software renderer
    B.skirt.visible = !R.cheap;
    // the maze stands on a sandstone plinth in the courtyard, not on more glass
    const pt = R.groundTex ? R.groundTex.clone() : null; if (pt) { pt.repeat.set(1, 1); pt.needsUpdate = true; }
    const platMat = R.cheap ? new THREE.MeshBasicMaterial({ map: pt, color: '#b8a89c' }) : new THREE.MeshStandardMaterial({ map: pt, color: '#d8c4b4', roughness: 0.86, metalness: 0.0 });
    B.plat = new THREE.Mesh(plat, platMat); B.plat.receiveShadow = true;
    B.group = new THREE.Group(); B.group.add(B.walls, B.neon, B.skirt, B.floor, B.door, B.plat);
    // the reflection: the same meshes drawn upside down under the glass floor
    B.mirror = new THREE.Group(); B.mirror.scale.y = -1;
    B.mWalls = new THREE.Mesh(geo, wallMat); B.mNeon = new THREE.Mesh(ng, neonMat);
    B.mirror.add(B.mWalls, B.mNeon);
    R.scene.add(B.group, B.mirror);
    B.wallMat = wallMat; B.neonMat = neonMat; B.skirtMat = skirtMat; B.floorMat = floorMat; B.doorMat = doorMat;
  } else {
    B.walls.geometry.dispose(); B.neon.geometry.dispose(); B.skirt.geometry.dispose(); B.plat.geometry.dispose(); B.plat.geometry = plat;
    B.walls.geometry = geo; B.neon.geometry = ng; B.skirt.geometry = sg; B.mWalls.geometry = geo; B.mNeon.geometry = ng;
  }
  B.neonCol = new THREE.Color(1.9, 1.9, 1.9); B.neonMat.color.copy(B.neonCol);
  B.skirtMat.color.set(M.neon).multiplyScalar(0.45);
  B.doorMat.color.set('#ff8ad8').multiplyScalar(1.6);
  if (B.wallMat.emissive) B.wallMat.emissive.set(M.neon2).multiplyScalar(0.32);
  B.floorMat.color.set(M.floor).lerp(_c.set(R.cheap ? M.neon : '#ffffff'), R.cheap ? 0.1 : 0.12);
  TX.floor.repeat.set((M.W + 2) / 4, (M.H + 2) / 4); TX.floor.offset.set(0.5 / 4 * 0, 0);
  B.floor.scale.set(M.W + 2, 1, M.H + 2); B.floor.position.set(0, 0, 0);
  B.door.position.set(M.door.x + R.ox, WALL_H * 0.55, M.door.y + R.oz);
  placeLamps(M);
  R.skyU.uGlow.value.set(M.neon).multiplyScalar(0.22);
  R.scene.fog.color.set(M.floor).lerp(_c.set('#0a0614'), 0.5);
  // fit the key light's shadow to the maze
  const k = R.key, hw = M.W / 2 + 1, hh = M.H / 2 + 1;
  k.shadow.camera.left = -hw * 1.15; k.shadow.camera.right = hw * 1.15; k.shadow.camera.top = hh * 1.2; k.shadow.camera.bottom = -hh * 1.2;
  k.shadow.camera.near = 2; k.shadow.camera.far = 50; k.shadow.camera.updateProjectionMatrix();
  k.position.set(-7, 16, 9); k.target.position.set(0, 0, 0);
  R.cam.fitFor = '';
  applyTier();
}

/* ------------------------------------------------------------ pellets: laddoos and golden jalebis */
function buildPellets() {
  // a laddoo: a lumpy ball of tiny grains, golden saffron
  const lg = new THREE.IcosahedronGeometry(0.14, R.cheap ? 0 : 1);
  const pa = lg.attributes.position, n = pa.count, col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    _v.fromBufferAttribute(pa, i);
    const h = hashf(Math.round(_v.x * 1e4) * 73856093 ^ Math.round(_v.y * 1e4) * 19349663 ^ Math.round(_v.z * 1e4) * 83492791);
    _v.multiplyScalar(0.94 + h * 0.12); pa.setXYZ(i, _v.x, _v.y, _v.z);
    _c.set(h > 0.82 ? '#ffd27a' : h < 0.2 ? '#c96a12' : '#f39a2a');
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  lg.setAttribute('color', new THREE.BufferAttribute(col, 3)); lg.computeVertexNormals();
  const lm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.05, emissive: '#ff7a10', emissiveIntensity: R.cheap ? 0.9 : 0.55 });
  lm.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; R.pelShader = sh;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float ph = dot(instanceMatrix[3].xz, vec2(0.71, 0.93));\n transformed.y += sin(uTime * 2.6 + ph) * 0.02;');
  };
  lm.customProgramCacheKey = () => 'ld-laddoo';
  const MAX = 600;
  const pel = new THREE.InstancedMesh(lg, lm, MAX); pel.count = 0; pel.frustumCulled = false; pel.castShadow = true;
  const mpel = new THREE.InstancedMesh(lg, lm, MAX); mpel.instanceMatrix = pel.instanceMatrix; mpel.count = 0; mpel.frustumCulled = false;
  // a jalebi: a glossy golden spiral, standing up and turning
  const pts = []; for (let i = 0; i <= 80; i++) { const t = i / 80, ang = t * 2.4 * TAU, r = 0.03 + t * 0.21; pts.push(new THREE.Vector3(Math.cos(ang) * r, Math.sin(t * 40) * 0.006, Math.sin(ang) * r)); }
  const jg0 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), R.cheap ? 60 : 110, 0.036, R.cheap ? 5 : 7, false);
  jg0.rotateX(Math.PI / 2 - 0.45);
  const jg = part(jg0, '#ffb428', null, null, 1);
  const jm = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.15, emissive: '#ff8a00', emissiveIntensity: 0.75 });
  const jal = new THREE.InstancedMesh(jg, jm, 8); jal.count = 0; jal.frustumCulled = false; jal.castShadow = true;
  const mjal = new THREE.InstancedMesh(jg, jm, 8); mjal.instanceMatrix = jal.instanceMatrix; mjal.count = 0; mjal.frustumCulled = false;
  R.scene.add(pel, jal); R.built.mirror.add(mpel, mjal);
  R.pel = { pel, mpel, jal, mjal, map: new Int16Array(64 * 64), jcells: new Int16Array(8), jn: 0 };
}
function syncPellets(G) {
  if (!R.pel || !G || !G.M) return;
  const P = R.pel, M = G.M; let n = 0, jn = 0;
  P.map.fill(-1);
  for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
    const i = y * M.W + x, v = M.pel0[i];
    if (!v) continue;
    if (v === 1) {
      P.map[i] = n;
      _m4.makeTranslation(x + R.ox, 0.24, y + R.oz);
      P.pel.setMatrixAt(n, G.pel[i] ? _m4 : ZERO_M); n++;
    } else if (jn < 8) { P.jcells[jn++] = i; }
  }
  P.pel.count = P.mpel.count = n; P.jn = jn; P.jal.count = P.mjal.count = jn;
  P.pel.instanceMatrix.needsUpdate = true;
}
function eatPellet(i) {
  const P = R.pel; if (!P) return;
  const k = P.map[i]; if (k < 0) return;
  P.pel.setMatrixAt(k, ZERO_M); P.pel.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------ the hero: a round, golden, always-hungry fellow */
function buildHero() {
  const r = 0.4;
  const upper = [], lower = [];
  upper.push(part(new THREE.SphereGeometry(r, 30, 15, 0, TAU, 0, Math.PI / 2), '#ffc928'));
  upper.push(part(new THREE.CircleGeometry(r * 0.97, 30), '#7a1028', [0, -0.002, 0], [Math.PI / 2, 0, 0]));
  lower.push(part(new THREE.SphereGeometry(r * 0.985, 30, 15, 0, TAU, Math.PI / 2, Math.PI / 2), '#ffb81c'));
  lower.push(part(new THREE.CircleGeometry(r * 0.95, 30), '#6a0c22', [0, 0.002, 0], [-Math.PI / 2, 0, 0]));
  lower.push(part(new THREE.SphereGeometry(0.15, 14, 8), '#ff5a7a', [0, 0.012, 0.13], null, [1, 0.25, 1.1]));
  // a little saffron tilak and a tuft of hair on top
  upper.push(part(new THREE.SphereGeometry(0.03, 8, 6), '#e8261c', [0, Math.sin(0.78) * r, Math.cos(0.78) * r * 0.98], null, [1, 1.5, 0.5]));
  upper.push(part(new THREE.ConeGeometry(0.06, 0.2, 8), '#2a1608', [0, r + 0.05, -0.12], [-0.7, 0, 0]));
  // eyes and brows are parts of their own, so they blink, look where the hero is about to go, and frown
  const ey = Math.sin(0.62) * r, ez = Math.cos(0.62) * r * 0.86, exA = Math.sin(0.42) * r * 0.82;
  const whites = [], pupils = [];
  [-1, 1].forEach((s) => {
    const ex = exA * s;
    whites.push(part(new THREE.SphereGeometry(0.095, 14, 10), '#ffffff', [ex, 0, 0], [0, s * 0.42, 0], [1, 1.18, 0.62]));
    pupils.push(part(new THREE.SphereGeometry(0.052, 12, 8), '#1a1028', [ex + s * 0.008, -0.006, 0.05], null, [1, 1.15, 0.6]));
    pupils.push(part(new THREE.SphereGeometry(0.017, 8, 6), '#ffffff', [ex + s * 0.02 + 0.012, 0.026, 0.08]));
  });
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0.08, emissive: '#ff9d1a', emissiveIntensity: R.cheap ? 0.5 : 0.1 });
  R.heroUpGeo = merge(upper); R.heroLoGeo = merge(lower);
  R.heroEyeGeo = merge(whites); R.heroPupGeo = merge(pupils);
  R.heroBrowGeo = part(new THREE.BoxGeometry(0.11, 0.022, 0.03), '#5a2a10');
  const mk = (brows) => {
    const g = new THREE.Group(), body = new THREE.Group();
    const up = new THREE.Mesh(R.heroUpGeo, mat), lo = new THREE.Mesh(R.heroLoGeo, mat);
    up.castShadow = lo.castShadow = true;
    const eyes = new THREE.Group(); eyes.position.set(0, ey, ez);
    const wh = new THREE.Mesh(R.heroEyeGeo, mat), pu = new THREE.Mesh(R.heroPupGeo, mat);
    eyes.add(wh, pu); up.add(eyes);
    const bl = [];
    if (brows) [-1, 1].forEach((s) => { const b2 = new THREE.Mesh(R.heroBrowGeo, mat); b2.position.set(exA * s, 0.14, -0.03); b2.rotation.set(0.4, s * 0.42, -s * 0.18, 'YXZ'); b2.userData.s = s; up.add(b2); bl.push(b2); });
    body.add(up, lo); g.add(body);
    return { g, body, up, lo, eyes, pu, bl };
  };
  const H = mk(true); R.scene.add(H.g);
  const MH = mk(false); MH.up.castShadow = MH.lo.castShadow = false; R.built.mirror.add(MH.g);
  // the animation state: squash on turns and stops, a lean into the run, blinks and glances
  R.hero = { H, MH, mat, squash: 0, hop: 0, dir: -9, moving: false, turn: 0, stop: 0, lean: 0, roll: 0, lastAng: 0, blinkT: 2 + Math.random() * 3, blink: 0, look: 0, lookY: 0, brow: 0, ex: exA };
}
const HS = { sx: 1, sy: 1, sz: 1, pitch: 0, roll: 0, blink: 0, look: 0, lookY: 0, brow: 0 };
function poseHeroMesh(o, x, y, z, ang, mouth, scale, spin, squash) {
  o.g.position.set(x, y, z);
  o.g.rotation.set(0, ang + spin, 0);
  o.g.scale.setScalar(Math.max(0.0001, scale * 1.1));
  o.body.scale.set((1 + squash * 0.08) * HS.sx, (1 - squash * 0.1) * HS.sy, (1 + squash * 0.04) * HS.sz);
  o.body.rotation.set(HS.pitch, 0, HS.roll);
  const m = 0.04 + mouth * 0.62;
  o.up.rotation.x = -m; o.lo.rotation.x = m * 0.85;
  o.eyes.scale.y = Math.max(0.08, 1 - HS.blink * 0.92);
  o.pu.position.set(HS.look * 0.03, HS.lookY * 0.02, 0);
  for (let i = 0; i < o.bl.length; i++) { const b = o.bl[i], s = b.userData.s; b.rotation.z = -s * (0.18 + HS.brow * 0.32); b.position.y = 0.14 + HS.brow * (HS.brow > 0 ? 0.025 : 0.02); }
}
// the hero's body language for this frame, from what it is doing and what is near it
function heroAct(G, Hp, ang, dt, cut, rm) {
  const HR = R.hero, h = G.hero;
  const playing = G.phase === 'play' && !cut;
  if (HR.dir === -9) HR.lastAng = ang;
  // a change of direction: squash first, then stretch out of it (anticipation and follow through)
  if (h.dir !== HR.dir) { if (HR.dir >= 0 && playing) HR.turn = 1; HR.dir = h.dir; }
  if (HR.moving && !Hp.moving && playing) HR.stop = 1;
  HR.moving = Hp.moving;
  HR.turn *= Math.exp(-dt * 9); HR.stop *= Math.exp(-dt * 10);
  let dA = ang - HR.lastAng; while (dA > Math.PI) dA -= TAU; while (dA < -Math.PI) dA += TAU; HR.lastAng = ang;
  const turnRate = dt > 0 ? clamp(dA / dt, -12, 12) : 0;
  HR.lean += ((Hp.moving ? 0.13 : 0) - HR.lean) * Math.min(1, dt * 8);
  HR.roll += (-turnRate * 0.028 - HR.roll) * Math.min(1, dt * 10);
  const tp = Math.sin(Math.min(1, 1 - HR.turn) * Math.PI) * HR.turn, sp = HR.stop;
  const k = rm ? 0.4 : 1;
  HS.sx = 1 + (0.1 * HR.turn - 0.04 * tp + 0.06 * sp) * k;
  HS.sy = 1 + (-0.13 * HR.turn + 0.06 * tp + 0.05 * sp) * k;
  HS.sz = 1 + (0.06 * HR.turn + 0.05 * (Hp.moving ? 1 : 0) - 0.16 * sp) * k;
  HS.pitch = (HR.lean - sp * 0.12) * k; HS.roll = HR.roll * k;
  // blinks: every 2 to 6 s, sometimes twice; shut tight when caught
  HR.blinkT -= dt;
  if (HR.blinkT <= 0) { HR.blink = 0.001; HR.blinkT = 2 + Math.random() * 4; if (Math.random() < 0.18) HR.blinkT = 0.32; }
  if (HR.blink > 0) { HR.blink += dt / 0.15; if (HR.blink >= 1) HR.blink = 0; }
  const shut = G.phase === 'caught' || G.phase === 'dead' ? 1 : 0;
  HS.blink = Math.max(shut, HR.blink > 0 ? Math.sin(HR.blink * Math.PI) : 0);
  // a happy squint and a little bounce after gulping a spirit
  HR.joy = (HR.joy || 0) * Math.exp(-dt * 2.2);
  if (HR.joy > 0.02) { HS.blink = Math.max(HS.blink, HR.joy * 0.6); HS.sy *= 1 + Math.sin(HR.joy * 18) * 0.06 * HR.joy * k; }
  // where the eyes go: toward a queued turn first, then toward the nearest spirit if one is close
  let lookA = 0, lookY = 0, brow = 0, best = 3.4 * 3.4;
  if (playing && h.want >= 0 && h.want !== h.dir) { lookA = Math.atan2(DX[h.want], DY[h.want]) - ang; }
  else if (playing) {
    for (let i = 0; i < 4; i++) {
      const S = G.pose.sp[i]; if (!S.vis || S.eyes) continue;
      const dx = S.x - Hp.x, dz = S.y - Hp.y, d2 = dx * dx + dz * dz;
      if (d2 < best) { best = d2; lookA = Math.atan2(dx, dz) - ang; brow = S.fright ? -0.6 : 0.8; lookY = 0.3; }
    }
    if (!brow && G.fright > 0) brow = -0.5;
  }
  while (lookA > Math.PI) lookA -= TAU; while (lookA < -Math.PI) lookA += TAU;
  const lx = clamp(Math.sin(lookA) * 1.3, -1, 1) * (Math.cos(lookA) < -0.2 ? 1.2 : 1);
  HR.look += (clamp(lx, -1, 1) - HR.look) * Math.min(1, dt * 18);
  HR.lookY += (lookY - HR.lookY) * Math.min(1, dt * 10);
  if (HR.joy > 0.2) brow = 0.3;
  HR.brow += (brow - HR.brow) * Math.min(1, dt * 7);
  HS.look = HR.look; HS.lookY = HR.lookY; HS.brow = HR.brow;
}

/* ------------------------------------------------------------ the spirits */
function buildSpirits() {
  const prof = [];
  for (let i = 0; i <= 9; i++) { const a = (i / 9) * Math.PI / 2; prof.push(new THREE.Vector2(Math.sin(a) * 0.4 + 0.0001, 0.56 + Math.cos(a) * 0.4)); }
  prof.push(new THREE.Vector2(0.41, 0.36), new THREE.Vector2(0.42, 0.18), new THREE.Vector2(0.44, 0.06), new THREE.Vector2(0.4, 0.02));
  const bg = new THREE.LatheGeometry(prof, 28);
  const bm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.28, metalness: 0.1, side: THREE.DoubleSide, transparent: true, opacity: 0.94 });
  bm.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; R.spShader = sh;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n float phi = atan(position.z, position.x);\n float hem = smoothstep(0.3, 0.02, position.y);\n float idf = float(gl_InstanceID);\n transformed.y += hem * (0.05 * cos(phi * 7.0 + uTime * 9.0 + idf * 1.7) - 0.02);\n transformed.xz *= 1.0 + hem * 0.06 * sin(phi * 7.0 + uTime * 9.0 + idf * 1.7);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.2);\n totalEmissiveRadiance += vColor.rgb * (0.32 + rim * 1.25);');
  };
  bm.customProgramCacheKey = () => 'ld-spirit';
  const body = new THREE.InstancedMesh(bg, bm, 4); body.frustumCulled = false; body.castShadow = true;
  for (let i = 0; i < 4; i++) body.setColorAt(i, _c.set(SPIRITS[i].col));
  const sg = new THREE.SphereGeometry(0.12, 16, 12), pg = new THREE.SphereGeometry(0.066, 12, 8);
  const sm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.2, emissive: '#ffffff', emissiveIntensity: 0.25 });
  const pm = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.15, emissive: '#000000' });
  const scl = new THREE.InstancedMesh(sg, sm, 8), pup = new THREE.InstancedMesh(pg, pm, 8);
  scl.frustumCulled = pup.frustumCulled = false;
  for (let i = 0; i < 8; i++) pup.setColorAt(i, _c.set('#1d36ff'));
  const mbody = new THREE.InstancedMesh(bg, bm, 4); mbody.instanceMatrix = body.instanceMatrix; mbody.instanceColor = body.instanceColor; mbody.frustumCulled = false;
  R.scene.add(body, scl, pup); R.built.mirror.add(mbody);
  const st = [0, 1, 2, 3].map((i) => ({ dir: -1, turn: 0, pitch: 0, roll: 0, look: 0, gT: 1 + i * 1.3, gOn: 0, bf: [3.2, 2.7, 3.7, 2.3][i], ba: [0.05, 0.065, 0.04, 0.058][i], agile: [12, 9, 15, 8][i] }));
  R.sp = { body, mbody, scl, pup, st, face: new Float32Array(4), cols: SPIRITS.map((s) => new THREE.Color(s.col)), blue: new THREE.Color('#3554ff'), white: new THREE.Color('#e8ecff'), blueEye: new THREE.Color('#1d36ff') };
}
function poseSpirit(i, x, y, z, ang, S, t) {
  const P = R.sp;
  const showBody = !S.eyes;
  _e.set(S.pitch || 0, ang, S.roll || 0, 'YXZ'); _q.setFromEuler(_e);
  if (showBody) { _m4.compose(_p.set(x, y, z), _q, _s.set(1, 1, 1)); P.body.setMatrixAt(i, _m4); }
  else P.body.setMatrixAt(i, ZERO_M);
  const col = S.fright ? (S.flash ? P.white : P.blue) : P.cols[i];
  P.body.setColorAt(i, col);
  // eyes: big and looking where it goes; small and pale when frightened
  const fr = S.fright && !S.eyes;
  const es = fr ? 0.55 : 1;
  for (let k = 0; k < 2; k++) {
    const s = k ? 1 : -1;
    _v.set(s * 0.15, 0.6 + (fr ? 0.04 : 0), 0.31).applyQuaternion(_q);
    _m4.compose(_p.set(x + _v.x, y + _v.y, z + _v.z), _q, _s.set(0.95 * es, 1.18 * es, 0.75 * es));
    P.scl.setMatrixAt(i * 2 + k, _m4);
    if (fr) P.pup.setMatrixAt(i * 2 + k, ZERO_M);
    else {
      // the pupils lead the body: they are already on the next way before it turns
      _v.set(s * 0.15 + (S.look || 0) * 0.07, 0.6 + (S.lookY || 0) * 0.04, 0.39 - Math.abs(S.look || 0) * 0.025).applyQuaternion(_q);
      _m4.compose(_p.set(x + _v.x, y + _v.y - 0.01, z + _v.z), _q, _s.set(1, 1.15, 0.7));
      P.pup.setMatrixAt(i * 2 + k, _m4);
    }
  }
  void t;
}

/* ------------------------------------------------------------ treats */
function buildFruit() {
  const L = [];
  // samosa: a golden pyramid with a crimped seam
  L.push(merge([part(new THREE.ConeGeometry(0.3, 0.44, 3), '#d99a3c', [0, 0.22, 0], [0, 0.4, 0]), part(new THREE.TorusGeometry(0.2, 0.025, 6, 18), '#b67524', [0, 0.04, 0], [Math.PI / 2, 0, 0], [1, 1, 0.6])]));
  // mango: a ripe blush from yellow to orange, a stem and a leaf
  { const g = new THREE.SphereGeometry(0.22, 18, 14); g.scale(1, 1.18, 0.92); const m = part(g, '#ffb21a', [0, 0.28, 0]); const c = m.attributes.color, p = m.attributes.position; for (let i = 0; i < p.count; i++) { const t = clamp((p.getY(i) - 0.05) / 0.5, 0, 1); _c.set('#ff5a1a').lerp(col('#ffd23a'), t); c.setXYZ(i, _c.r, _c.g, _c.b); }
    L.push(merge([m, part(new THREE.CylinderGeometry(0.02, 0.02, 0.08, 6), '#5a3a12', [0, 0.56, 0]), part(new THREE.SphereGeometry(0.1, 10, 6), '#2fae4a', [0.08, 0.58, 0], [0, 0, -0.6], [1.4, 0.25, 0.6])])); }
  // chai: a cutting glass of tea on a saucer
  L.push(merge([part(new THREE.CylinderGeometry(0.17, 0.13, 0.3, 18, 1, true), '#f2e6d4', [0, 0.2, 0]), part(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 18), '#a8632a', [0, 0.32, 0]), part(new THREE.CylinderGeometry(0.13, 0.13, 0.02, 18), '#e8dcc8', [0, 0.05, 0]), part(new THREE.TorusGeometry(0.07, 0.02, 6, 12), '#f2e6d4', [0.18, 0.2, 0], [0, 0, 0]), part(new THREE.CylinderGeometry(0.26, 0.24, 0.03, 22), '#c9b8a2', [0, 0.02, 0])]));
  // kulfi on a stick: pistachio and cream
  L.push(merge([part(new THREE.ConeGeometry(0.16, 0.42, 14), '#e8f2d0', [0, 0.36, 0], [Math.PI, 0, 0]), part(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 14), '#9ccf6a', [0, 0.56, 0]), part(new THREE.BoxGeometry(0.05, 0.22, 0.015), '#d2a86a', [0, 0.07, 0])]));
  // kaju katli: a silver-topped diamond
  L.push(merge([part(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 4), '#e6d2b0', [0, 0.18, 0], [0, 0, 0], [1, 1, 0.75]), part(new THREE.CylinderGeometry(0.25, 0.25, 0.01, 4), '#f4f6ff', [0, 0.22, 0], [0, 0, 0], [1, 1, 0.75])]));
  const mat = R.hero.mat;
  const meshes = L.map((g) => { const m = new THREE.Mesh(g, mat); m.visible = false; m.castShadow = true; R.scene.add(m); return m; });
  R.fruit = { meshes, on: -1 };
}

/* ------------------------------------------------------------ light pools, particles, sky lanterns */
const GLOW_N = 40, DIYA_N = 22;
function buildGlow() {
  const m = new THREE.MeshBasicMaterial({ map: TX.glow, color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false });
  const g = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m, GLOW_N);
  g.frustumCulled = false; g.renderOrder = 3; g.count = GLOW_N;
  for (let i = 0; i < GLOW_N; i++) { g.setMatrixAt(i, ZERO_M); g.setColorAt(i, _c.set('#000000')); }
  R.scene.add(g); R.glow = { g, n: 0 };
}
function glowAt(x, y, z, size, hex, k) {
  const G = R.glow; if (!G || G.n >= GLOW_N) return;
  _m4.compose(_p.set(x, y, z), _q.identity(), _s.set(size, 1, size)); G.g.setMatrixAt(G.n, _m4);
  _c.copy(hex).multiplyScalar(k); G.g.setColorAt(G.n, _c); G.n++;
}
const PN = 900;
function buildParticles() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(PN * 3), col = new Float32Array(PN * 4), size = new Float32Array(PN);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aCol', new THREE.BufferAttribute(col, 4).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 400 } }, vertexShader: PART_VS, fragmentShader: PART_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  R.scene.add(pts);
  R.parts = { pts, mat, pos, col, size, vel: new Float32Array(PN * 3), life: new Float32Array(PN), max: new Float32Array(PN), sz: new Float32Array(PN), rgb: new Float32Array(PN * 3), grav: new Float32Array(PN), drag: new Float32Array(PN), next: 0, density: 1 };
}
function emit(x, y, z, vx, vy, vz, life, sz, hex, grav, drag) {
  const P = R.parts; if (!P) return;
  const i = P.next; P.next = (P.next + 1) % PN;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.life[i] = P.max[i] = life; P.sz[i] = sz; P.grav[i] = grav == null ? 6 : grav; P.drag[i] = drag == null ? 1.5 : drag;
  const c = typeof hex === 'string' ? col(hex) : hex; P.rgb[i * 3] = c.r; P.rgb[i * 3 + 1] = c.g; P.rgb[i * 3 + 2] = c.b;
}
const rnd = (s) => (Math.random() * 2 - 1) * s;
function burst(x, y, z, n, sp, hexes, life, sz, grav, up) {
  n = Math.round(n * (R.parts ? R.parts.density : 1));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, e = Math.random() * 0.9 + 0.1, s = sp * (0.35 + Math.random() * 0.75);
    emit(x, y, z, Math.cos(a) * s * Math.cos(e), (up == null ? 1 : up) * Math.sin(e) * s, Math.sin(a) * s * Math.cos(e), life * (0.6 + Math.random() * 0.6), sz * (0.6 + Math.random() * 0.8), hexes[i % hexes.length], grav);
  }
}
function stepParticles(dt) {
  const P = R.parts; if (!P) return;
  for (let i = 0; i < PN; i++) {
    if (P.life[i] <= 0) { P.size[i] = 0; continue; }
    P.life[i] -= dt;
    const k = Math.exp(-P.drag[i] * dt);
    P.vel[i * 3] *= k; P.vel[i * 3 + 2] *= k; P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * k - P.grav[i] * dt;
    P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
    if (P.pos[i * 3 + 1] < 0.02) { P.pos[i * 3 + 1] = 0.02; P.vel[i * 3 + 1] *= -0.4; }
    const f = Math.max(0, P.life[i] / P.max[i]), a = f < 0.5 ? f * 2 : 1;
    P.col[i * 4] = P.rgb[i * 3]; P.col[i * 4 + 1] = P.rgb[i * 3 + 1]; P.col[i * 4 + 2] = P.rgb[i * 3 + 2]; P.col[i * 4 + 3] = a * 1.6;
    P.size[i] = P.sz[i] * (0.4 + 0.6 * f);
  }
  const g = P.pts.geometry;
  g.attributes.position.needsUpdate = true; g.attributes.aCol.needsUpdate = true; g.attributes.aSize.needsUpdate = true;
}
function buildDiyas() {
  // paper sky lanterns drifting up around the maze, warm and slow
  const geo = merge([part(new THREE.CylinderGeometry(0.16, 0.12, 0.34, 10, 1), '#ff9a32', [0, 0, 0]), part(new THREE.CylinderGeometry(0.12, 0.12, 0.02, 10), '#5a2a10', [0, -0.18, 0])]);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.4, 1.7, 1.1), toneMapped: false });
  const m = new THREE.InstancedMesh(geo, mat, DIYA_N); m.frustumCulled = false;
  const r = rng(31), seeds = new Float32Array(DIYA_N * 4);
  for (let i = 0; i < DIYA_N; i++) { seeds[i * 4] = r(); seeds[i * 4 + 1] = r(); seeds[i * 4 + 2] = r(); seeds[i * 4 + 3] = r(); }
  R.scene.add(m); R.diyas = { m, seeds };
}
function stepDiyas(t, M) {
  const D = R.diyas; if (!D || !M) return;
  const hw = M.W / 2 + 0.6, hh = M.H / 2 + 0.6;
  for (let i = 0; i < DIYA_N; i++) {
    const s = D.seeds, a = s[i * 4], b = s[i * 4 + 1], c = s[i * 4 + 2], d = s[i * 4 + 3];
    // a spot around the edge of the maze, a little outside it
    const side = (a * 4) | 0, u = b * 2 - 1, out = 1.2 + c * 3.5;
    let x, z;
    if (side === 0) { x = u * (hw + 2); z = -hh - out; } else if (side === 1) { x = u * (hw + 2); z = hh + out; } else if (side === 2) { x = -hw - out; z = u * (hh + 2); } else { x = hw + out; z = u * (hh + 2); }
    const life = 16 + d * 10, ph = ((t / life + d) % 1);
    const y = 0.4 + ph * 7.5;
    x += Math.sin(t * 0.4 + a * 20) * 0.5; z += Math.cos(t * 0.33 + b * 20) * 0.5;
    const sc = Math.min(1, ph * 6, (1 - ph) * 5) * (0.8 + c * 0.6);
    _m4.compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, t * 0.3 + a * 6), _s.set(sc, sc, sc)); D.m.setMatrixAt(i, _m4);
  }
  D.m.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------ clay diyas round the plinth */
// Little oil lamps on the courtyard stones. Each flame breathes on its own, a gust now and then makes it
// gutter, and its warm pool of light on the flags rises and falls with it; no real light is used, so this
// costs three draws however many there are.
const LAMP_N = 36;
function buildLamps() {
  const prof = [new THREE.Vector2(0.001, 0), new THREE.Vector2(0.1, 0.0), new THREE.Vector2(0.15, 0.03), new THREE.Vector2(0.17, 0.075), new THREE.Vector2(0.155, 0.08), new THREE.Vector2(0.12, 0.045), new THREE.Vector2(0.001, 0.04)];
  const bowl = new THREE.LatheGeometry(prof, 14);
  const bm = R.cheap ? new THREE.MeshLambertMaterial({ color: '#8a4a2a' }) : new THREE.MeshStandardMaterial({ color: '#8a4628', roughness: 0.92, metalness: 0, emissive: '#ff6a1a', emissiveIntensity: 0.08 });
  const bowls = new THREE.InstancedMesh(bowl, bm, LAMP_N);
  const fg = new THREE.SphereGeometry(0.07, 10, 8); fg.translate(0, 0.07, 0);
  const fm = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 1.75, 0.6), toneMapped: false, fog: false });
  const flames = new THREE.InstancedMesh(fg, fm, LAMP_N);
  const pm = new THREE.MeshBasicMaterial({ map: TX.glow, color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), pm, LAMP_N);
  [bowls, flames, pools].forEach((m) => { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); });
  pools.renderOrder = 2;
  const r = rng(77), ph = new Float32Array(LAMP_N * 3), pos = new Float32Array(LAMP_N * 2);
  for (let i = 0; i < LAMP_N; i++) { ph[i * 3] = r() * 100; ph[i * 3 + 1] = 0.8 + r() * 0.5; ph[i * 3 + 2] = 0; pools.setColorAt(i, _c.set('#000000')); }
  R.scene.add(bowls, flames, pools);
  R.lamps = { bowls, flames, pools, ph, pos, n: 0, gust: 0, gustAt: 3 };
  if (R.M) placeLamps(R.M);
}
function placeLamps(M) {
  const L = R.lamps; if (!L) return;
  const pw = M.W / 2 + 1, ph = M.H / 2 + 1, gap = 0.55, y = -1.1;
  // spaced along the foot of the plinth, a little irregular, the way people actually set them out
  const per = 2 * (pw * 2 + ph * 2), step = per / LAMP_N, r = rng(13 + M.W * 7 + M.H);
  for (let i = 0; i < LAMP_N; i++) {
    let d = (i + 0.5) * step + (r() - 0.5) * step * 0.4, x, z;
    if (d < pw * 2) { x = -pw + d; z = -ph - gap; } else if ((d -= pw * 2) < ph * 2) { x = pw + gap; z = -ph + d; } else if ((d -= ph * 2) < pw * 2) { x = pw - d; z = ph + gap; } else { d -= pw * 2; x = -pw - gap; z = ph - d; }
    x += (r() - 0.5) * 0.18; z += (r() - 0.5) * 0.18;
    L.pos[i * 2] = x; L.pos[i * 2 + 1] = z;
    _m4.compose(_p.set(x, y, z), _q.setFromAxisAngle(UP, r() * 6), _s.set(1, 1, 1)); L.bowls.setMatrixAt(i, _m4);
  }
  L.bowls.instanceMatrix.needsUpdate = true; L.n = LAMP_N; L.y = y;
}
function stepLamps(t, dt, rm) {
  const L = R.lamps; if (!L || !L.n || !L.flames.visible) return;
  // a breath of wind every few seconds runs round the courtyard and makes the flames lean and dip
  L.gustAt -= dt; if (L.gustAt <= 0) { L.gust = 1; L.gustAt = 4 + Math.random() * 6; L.gx = Math.random() < 0.5 ? -1 : 1; }
  L.gust *= Math.exp(-dt * 1.6);
  const pools = L.pools.visible;
  for (let i = 0; i < L.n; i++) {
    const p = L.ph[i * 3], sp = L.ph[i * 3 + 1], x = L.pos[i * 2], z = L.pos[i * 2 + 1];
    const wave = L.gust * Math.max(0, Math.sin(t * 2.2 - (x * L.gx) * 0.35));
    const n = Math.sin(t * 9.1 * sp + p) * 0.5 + Math.sin(t * 13.7 * sp + p * 1.7) * 0.3 + Math.sin(t * 23.3 + p * 2.3) * 0.2;
    const fl = rm ? 1 : clamp(1 + n * 0.12 - wave * 0.35, 0.45, 1.25);
    const lean = rm ? 0 : (wave * 0.5 + Math.sin(t * 3.1 + p) * 0.06) * (L.gx || 1);
    _e.set(0, 0, lean); _q.setFromEuler(_e);
    _m4.compose(_p.set(x, L.y + 0.07, z), _q, _s.set(0.9 + n * 0.04, fl * (1.3 + wave * 0.2), 0.9)); L.flames.setMatrixAt(i, _m4);
    if (!pools) continue;
    _m4.compose(_p.set(x, L.y + 0.012, z), _q.identity(), _s.set(2.8 * (0.9 + fl * 0.1), 1, 2.8 * (0.9 + fl * 0.1))); L.pools.setMatrixAt(i, _m4);
    _c.setRGB(1.0, 0.5, 0.16).multiplyScalar(0.62 * fl); L.pools.setColorAt(i, _c);
  }
  L.flames.instanceMatrix.needsUpdate = true; if (pools) { L.pools.instanceMatrix.needsUpdate = true; L.pools.instanceColor.needsUpdate = true; }
}

/* ------------------------------------------------------------ the intermission stage */
function buildStage() {
  const g = new THREE.Group(); g.visible = false;
  const mat = new THREE.MeshStandardMaterial({ color: '#160a24', roughness: 0.2, metalness: 0.5 });
  const run = new THREE.Mesh(new THREE.BoxGeometry(40, 0.1, 3.4), mat); run.position.y = -0.05; run.receiveShadow = true; g.add(run);
  const rail = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff3d8b').multiplyScalar(2), toneMapped: false });
  [-1.7, 1.7].forEach((z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(40, 0.06, 0.06), rail); b.position.set(0, 0.04, z); g.add(b); });
  // a row of arches behind, like a mela gate seen from the road
  const arch = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffa21f').multiplyScalar(1.8), toneMapped: false });
  for (let i = -4; i <= 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.5, 0.06, 6, 24, Math.PI), arch); t.position.set(i * 3.6, 0, -4.2); g.add(t); }
  // lanterns strung between the arches
  const lan = new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff5a3d').multiplyScalar(1.8), toneMapped: false });
  for (let i = -16; i <= 16; i++) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), i % 2 ? lan : arch); l.position.set(i * 0.9, 2.1 + Math.cos(i * 0.9) * 0.15, -4.2); g.add(l); }
  R.scene.add(g); R.stage = g;
}

/* ------------------------------------------------------------ the boot queue */
// A new object waits on a hidden camera layer for a few frames after its shaders are sent to compile, so the
// browser's GPU process finishes linking them in the background before the first draw asks whether they are ready.
function hold(obj, frames) { obj.traverse((o) => o.layers.set(1)); R.holds.push(obj, frames == null ? 10 : frames); }
function stepHolds() {
  const H = R.holds;
  for (let i = H.length - 2; i >= 0; i -= 2) {
    if (--H[i + 1] > 0) continue;
    H[i].traverse((o) => o.layers.set(0)); H.splice(i, 2);
  }
}
function queueBuild() {
  const Q = R.queue;
  const compile = (obj) => { hold(obj); try { R.renderer.compile(obj, R.camera, R.scene); } catch (e) { /* compile at first draw instead */ } };
  Q.push(() => { makeTextures(); });
  Q.push(() => { if (R.pending) { buildMaze(R.pending); R.pending = null; } else if (!R.built.walls && R.G) buildMaze(R.G.M); compile(R.built.group); compile(R.built.mirror); });
  Q.push(() => { buildPellets(); syncPellets(R.G); compile(R.pel.pel); hold(R.pel.mpel); });
  Q.push(() => { compile(R.pel.jal); hold(R.pel.mjal); });
  Q.push(() => { buildHero(); compile(R.hero.H.g); hold(R.hero.MH.g); });
  Q.push(() => { buildSpirits(); compile(R.sp.body); hold(R.sp.mbody); });
  Q.push(() => { compile(R.sp.scl); compile(R.sp.pup); });
  Q.push(() => { buildGlow(); compile(R.glow.g); });
  Q.push(() => { buildParticles(); compile(R.parts.pts); });
  Q.push(() => { buildFruit(); R.fruit.meshes.forEach((m) => hold(m)); });
  Q.push(() => { buildDiyas(); compile(R.diyas.m); });
  Q.push(() => { buildLamps(); compile(R.lamps.bowls); compile(R.lamps.flames); compile(R.lamps.pools); });
  Q.push(() => { buildStage(); R.stage.visible = true; compile(R.stage); R.stage.visible = false; });
  // The post pass compiles its shaders the first time it draws: do that now, behind the menu, not mid-game.
  Q.push(() => { if (!R.soft) { R.warmPost = 2; } });
  Q.push(() => { R.ready = true; applyTier(); loadVFX(); });
}
function runQueue() {
  const t0 = performance.now();
  // one heavy step a frame keeps every frame short
  while (R.queue.length) {
    const f = R.queue.shift();
    const t1 = performance.now();
    try { f(); } catch (e) { console.warn(e); }
    R.taskLog.push(Math.round(performance.now() - t1));
    if (performance.now() - t0 > 6) break;
  }
}

/* ------------------------------------------------------------ quality */
function applyTier() {
  if (!R.ok) return;
  const t = TIERS[Math.max(0, R.q)];
  const B = R.built;
  if (B.mirror) B.mirror.visible = t.mirror;
  if (B.floorMat && !R.cheap) B.floorMat.opacity = t.mirror ? 0.84 : 1;
  if (R.key.castShadow && R.key.shadow.mapSize.x !== t.map) { R.key.shadow.mapSize.set(t.map, t.map); if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; } }
  if (R.parts) R.parts.density = t.fx;
  if (R.post) R.post.setQuality(R.q, R.lockQ);
  if (VFX) VFX.setQuality(R.q);
  resize(R.ARC);
}
function setQuality(q) { q = clamp(q | 0, 0, 3); if (q === R.q) return; R.q = q; applyTier(); }
function resize(a) {
  if (!R.ok || !a) return;
  const t = TIERS[Math.max(0, R.q)];
  const pr = Math.min(a.dpr * t.px, Math.sqrt(t.budget / Math.max(1, a.w * a.h)));
  R.renderer.setPixelRatio(Math.max(0.35, pr));
  R.renderer.setSize(a.w, a.h, false);
  R.camera.aspect = a.w / Math.max(1, a.h); R.camera.updateProjectionMatrix();
  if (R.parts) R.parts.mat.uniforms.uScale.value = (a.h * R.renderer.getPixelRatio()) / (2 * Math.tan(R.camera.fov * Math.PI / 360)) * 0.12;
  R.cam.fitFor = '';
}
function autoQuality(a, now) {
  if (R.lockQ || a.state !== 'play') { R.fT = 0; R.fN = 0; return; }
  const dt = R.lastNow ? (now - R.lastNow) / 1000 : 0;
  if (dt <= 0 || dt > 0.25) return;
  R.fT += dt; R.fN++;
  if (R.fT >= 1.5) {
    R.fps = R.fN / R.fT; R.fT = 0; R.fN = 0;
    if (R.fps < 44 && R.q > 0) { setQuality(R.fps < 22 ? Math.max(0, R.q - 2) : R.q - 1); R.good = 0; }
    else if (R.fps > 58 && R.q < R.startQ) { if (++R.good >= 4) { setQuality(R.q + 1); R.good = 0; } }
  }
}

/* ------------------------------------------------------------ camera: fit the maze, follow on a tall phone */
const NDC = new THREE.Vector3(), RAY = new THREE.Vector3(), CPOS = new THREE.Vector3();
function placeCam(tx, tz, dist, pitch, yaw) {
  const c = R.camera;
  c.position.set(tx + Math.sin(yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, tz + Math.cos(yaw) * Math.cos(pitch) * dist);
  c.lookAt(tx, 0, tz); c.updateMatrixWorld(true);
}
// Where a screen point (NDC) lands on the ground plane, relative to the camera target.
function groundHit(nx, ny, out) {
  const c = R.camera;
  NDC.set(nx, ny, 0.5).unproject(c);
  CPOS.setFromMatrixPosition(c.matrixWorld);
  RAY.copy(NDC).sub(CPOS).normalize();
  if (RAY.y > -1e-4) return false;
  const t = -CPOS.y / RAY.y;
  out.set(CPOS.x + RAY.x * t, 0, CPOS.z + RAY.z * t);
  return true;
}
const HT = new THREE.Vector3(), HB = new THREE.Vector3(), HL = new THREE.Vector3(), HR = new THREE.Vector3();
function fitCamera(a, M) {
  const key = a.w + 'x' + a.h + ':' + M.id + ':' + (a.touchMode ? 1 : 0);
  if (R.cam.fitFor === key) return;
  R.cam.fitFor = key;
  const port = a.h > a.w * 1.15;
  const pitch = port ? 1.16 : 1.08;
  R.cam.pitch = pitch;
  const topPx = 76, botPx = a.touchMode ? 66 : 58, sidePx = port ? 6 : 24;
  const nyT = 1 - 2 * topPx / a.h, nyB = -1 + 2 * botPx / a.h, nxS = 1 - 2 * sidePx / a.w;
  // a tall phone shows about 14 tiles across and follows the hero; anything wider shows the whole maze
  const wantW = port ? clamp(a.w / 27, 13.4, M.W + 2.4) : M.W + 2.4;
  const fits = (d) => {
    placeCam(0, 0, d, pitch, 0);
    if (!groundHit(-nxS, (nyT + nyB) / 2, HL) || !groundHit(nxS, (nyT + nyB) / 2, HR)) return false;
    if (!groundHit(0, nyT, HT) || !groundHit(0, nyB, HB)) return false;
    if (HR.x - HL.x < wantW) return false;
    if (!port && HB.z - HT.z < M.H + 2.4) return false;
    return true;
  };
  let lo = 4, hi = 120;
  for (let i = 0; i < 22; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  R.cam.dist = hi; fits(hi);
  R.cam.oT = HT.z; R.cam.oB = HB.z; R.cam.oL = HL.x; R.cam.oR = HR.x;
  R.cam.init = false;
}
function camTarget(px, pz, M, out) {
  const C = R.cam, hw = M.W / 2 + 1.1, hh = M.H / 2 + 1.1;
  const vw = C.oR - C.oL, vh = C.oB - C.oT;
  // centre what fits, follow (clamped to the maze) what does not
  let tx, tz;
  if (vw >= hw * 2) tx = -(C.oL + C.oR) / 2; else tx = clamp(px - (C.oL + C.oR) / 2, -hw - C.oL, hw - C.oR);
  if (vh >= hh * 2) tz = -(C.oT + C.oB) / 2; else tz = clamp(pz - (C.oT + C.oB) / 2, -hh - C.oT, hh - C.oB);
  out.set(tx, 0, tz);
}
const CT = new THREE.Vector3();
function updateCamera(a, G, dt) {
  const C = R.cam, M = G.M, cam = R.camera;
  if (G.phase === 'cut') {
    // side-on to the runway, far enough back that the chase fits across the screen (on a tall phone, most of it)
    const th = Math.tan(cam.fov * Math.PI / 360) * cam.aspect;
    const want = clamp((a.h > a.w ? 7.5 : 12.5) / th, 14, 70);
    placeCam(0, 0, want, 0.3, 0); cam.position.y += 0.8; cam.lookAt(0, 0.8, 0);
    if (a.shakeX || a.shakeY) { cam.position.x += a.shakeX * 0.02; cam.position.y += a.shakeY * 0.02; }
    return;
  }
  fitCamera(a, M);
  const H = G.pose.hero;
  camTarget(H.x + R.ox, H.y + R.oz, M, CT);
  const k = C.init ? 1 - Math.exp(-dt * 3.2) : 1;
  C.tx += (CT.x - C.tx) * k; C.tz += (CT.z - C.tz) * k; C.init = true;
  // a slow push in on a catch and a clear, and a breath of drift so it never feels frozen
  const push = G.phase === 'dead' || G.phase === 'caught' ? 0.92 : G.phase === 'clear' ? 0.96 : 1;
  C.push += (push - C.push) * (1 - Math.exp(-dt * 2.2)) || 0;
  if (!C.push) C.push = 1;
  const rm = a.reducedMotion;
  const yaw = rm ? 0 : Math.sin(R.time * 0.21) * 0.025 + (G.phase === 'clear' ? Math.sin(G.pt * 1.3) * 0.05 : 0);
  placeCam(C.tx, C.tz, C.dist * C.push, C.pitch, yaw);
  if (a.shakeX || a.shakeY) { cam.position.x += a.shakeX * 0.02; cam.position.y += a.shakeY * 0.02; }
}

/* ------------------------------------------------------------ the frame */
const SPS = { fright: false, flash: false, eyes: false, pitch: 0, roll: 0, look: 0, lookY: 0 };
function render(a, G, ctx) {
  if (!R.ok) return false;
  const now = performance.now();
  const dt = R.lastNow ? Math.min(0.1, (now - R.lastNow) / 1000) : 1 / 60;
  if (R.lost) { R.lastNow = now; ctx.fillStyle = '#07060a'; ctx.fillRect(0, 0, a.w, a.h); return false; }
  autoQuality(a, now);
  R.lastNow = now;
  R.time += a.state === 'pause' ? 0 : dt;
  R.G = G;
  if (R.holds.length) stepHolds();
  if (R.queue.length) runQueue();
  if (G.M !== R.M && R.built.walls) { buildMaze(G.M); syncPellets(G); }
  const M = R.M || G.M;
  if (!R.M) { R.ox = -(M.W - 1) / 2; R.oz = -(M.H - 1) / 2; }
  const t = R.time, pause = a.state === 'pause';
  const cut = G.phase === 'cut';
  if (R.built.group) { R.built.group.visible = !cut; R.built.mirror.visible = !cut && TIERS[Math.max(0, R.q)].mirror; }
  if (R.stage) R.stage.visible = cut;
  if (R.glow) R.glow.n = 0;
  // the maze: neon flashes white on a clear
  if (R.built.neonMat) {
    if (G.phase === 'clear' && G.pt > 0.5 && !a.reducedMotion) { const on = ((G.pt * 6) | 0) % 2 === 0; R.built.neonMat.color.copy(col(on ? '#ffffff' : '#6a8cff')).multiplyScalar(on ? 4 : 1.4); }
    else R.built.neonMat.color.copy(R.built.neonCol).multiplyScalar(0.92 + 0.08 * Math.sin(t * 2.2));
    R.built.doorMat.color.copy(col('#ff8ad8')).multiplyScalar(1.3 + 0.5 * Math.sin(t * 4));
  }
  // pellets and jalebis
  if (R.pel) {
    if (R.pelShader) R.pelShader.uniforms.uTime.value = t;
    const P = R.pel;
    for (let k = 0; k < P.jn; k++) {
      const i = P.jcells[k], on = G.pel[i] === 2 && !cut;
      if (!on) { P.jal.setMatrixAt(k, ZERO_M); continue; }
      const x = (i % M.W) + R.ox, z = ((i / M.W) | 0) + R.oz, pulse = 1 + 0.12 * Math.sin(t * 6 + k);
      _q.setFromAxisAngle(UP, t * 1.8 + k);
      _m4.compose(_p.set(x, 0.32 + Math.sin(t * 3 + k) * 0.05, z), _q, _s.set(pulse, pulse, pulse)); P.jal.setMatrixAt(k, _m4);
      glowAt(x, 0.02, z, 1.5 + 0.3 * Math.sin(t * 6 + k), col('#ffaa22'), 0.75);
    }
    P.jal.instanceMatrix.needsUpdate = true;
  }
  // the hero
  if (R.hero) {
    const Hp = G.pose.hero, HR = R.hero;
    let x, z, y = 0.42, ang = Hp.ang, mouth = Hp.mouth, sc = Hp.scale, spin = Hp.spin, vis = Hp.vis;
    if (cut) { const C = G.cut.hero; vis = C.vis; x = C.x; z = 0; y = 0.42 * C.scale + C.y; ang = C.dir === 1 ? -Math.PI / 2 : Math.PI / 2; mouth = Math.abs(Math.sin(C.chomp)); sc = C.scale; spin = 0; }
    else { x = Hp.x + R.ox; z = Hp.y + R.oz; }
    HR.hop = Hp.moving && !cut ? Math.abs(Math.sin(t * 13)) * 0.035 : 0;
    HR.squash = cut ? 0 : (Hp.moving ? mouth * 0.5 : 0);
    if (!pause) heroAct(G, Hp, ang, dt, cut, a.reducedMotion);
    HR.H.g.visible = vis; HR.MH.g.visible = vis;
    if (vis) {
      poseHeroMesh(HR.H, x, y + HR.hop, z, ang, mouth, sc, spin, HR.squash);
      poseHeroMesh(HR.MH, x, y + HR.hop, z, ang, mouth, sc, spin, HR.squash);
      if (!cut) glowAt(x, 0.02, z, 2.2 * Math.max(0.3, sc), col('#ffc93a'), 0.55);
      R.heroLight.position.set(x, 0.9, z);
    }
    R.heroLight.intensity = vis && !cut && TIERS[Math.max(0, R.q)].light ? 5.5 : 0;
    if (G.phase === 'dead' && G.pt < 1.5 && !pause && Math.random() < 0.7) emit(x + rnd(0.3), 0.5, z + rnd(0.3), rnd(1.5), 1 + Math.random() * 2, rnd(1.5), 0.8, 0.5, Math.random() < 0.5 ? '#ffd65a' : '#ffffff', -0.5, 1);
  }
  // the spirits
  if (R.sp) {
    if (R.spShader) R.spShader.uniforms.uTime.value = t;
    const P = R.sp;
    for (let i = 0; i < 4; i++) {
      const S = G.pose.sp[i];
      let x, z, y, vis = S.vis, dir = S.dir, flash = S.flash, fright = S.fright, eyes = S.eyes;
      const PS = P.st[i];
      if (cut) { const C = G.cut.sp[i]; vis = C.vis; x = C.x; z = 0; y = 0.04 + C.y; dir = C.dir; fright = C.fright; flash = C.flash; eyes = false; }
      else {
        // each spirit floats to its own rhythm, never in step with the others
        x = S.x + R.ox; z = S.y + R.oz; y = 0.06 + Math.sin(t * PS.bf + i * 1.7) * PS.ba + Math.sin(t * PS.bf * 0.37 + i) * 0.012;
        // frightened ones tremble; the one that catches the hero gives a little hop of glee
        if (fright && !flash && !a.reducedMotion) { x += Math.sin(t * 37 + i * 3) * 0.018; z += Math.cos(t * 41 + i) * 0.014; }
        if (G.phase === 'caught' && !fright) y += Math.abs(Math.sin(G.pt * 11 + i)) * 0.16;
      }
      if (!vis) { P.body.setMatrixAt(i, ZERO_M); P.scl.setMatrixAt(i * 2, ZERO_M); P.scl.setMatrixAt(i * 2 + 1, ZERO_M); P.pup.setMatrixAt(i * 2, ZERO_M); P.pup.setMatrixAt(i * 2 + 1, ZERO_M); continue; }
      const want = Math.atan2(dir === 1 ? -1 : dir === 3 ? 1 : 0, dir === 0 ? -1 : dir === 2 ? 1 : 0);
      let da = want - P.face[i]; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
      // a turn: the eyes swing first, the body follows a beat later with a little brake and a lean
      if (dir !== PS.dir) { if (PS.dir >= 0 && !cut) PS.turn = 1; PS.dir = dir; }
      PS.turn *= Math.exp(-dt * 6);
      const prevFace = P.face[i];
      P.face[i] += da * Math.min(1, dt * (fright ? 14 : PS.agile));
      let rate = P.face[i] - prevFace; while (rate > Math.PI) rate -= TAU; while (rate < -Math.PI) rate += TAU;
      const moving = !cut && G.phase === 'play' && S.st === 'active';
      PS.roll += (clamp(-rate / Math.max(1e-3, dt) * 0.035, -0.35, 0.35) - PS.roll) * Math.min(1, dt * 10);
      PS.pitch += (((moving ? 0.14 : 0.02) - PS.turn * 0.22) - PS.pitch) * Math.min(1, dt * 9);
      // now and then a spirit glances over at the hero, each on its own clock
      PS.gT -= dt;
      if (PS.gT <= 0) { PS.gOn = PS.gOn > 0 ? 0 : 0.45 + Math.random() * 0.5; PS.gT = PS.gOn > 0 ? PS.gOn : 2.5 + Math.random() * 5; }
      let lk = da;
      if (PS.gOn > 0 && moving && !fright) { const hp = G.pose.hero; lk = Math.atan2(hp.x - S.x, hp.y - S.y) - P.face[i]; }
      while (lk > Math.PI) lk -= TAU; while (lk < -Math.PI) lk += TAU;
      PS.look += (clamp(Math.sin(lk) * 1.4, -1, 1) - PS.look) * Math.min(1, dt * 16);
      SPS.pitch = a.reducedMotion ? PS.pitch * 0.4 : PS.pitch; SPS.roll = a.reducedMotion ? PS.roll * 0.4 : PS.roll; SPS.look = PS.look; SPS.lookY = fright ? 0 : (PS.gOn > 0 ? 0.3 : 0);
      let tumble = 0;
      if (cut && G.cut.sp[i].tumble) tumble = G.cut.sp[i].tumble;
      SPS.fright = fright; SPS.flash = flash; SPS.eyes = eyes;
      poseSpirit(i, x, y, z, P.face[i] + tumble * 2.6, SPS, t);
      if (!eyes) glowAt(x, 0.02, z, 1.7, fright ? P.blue : P.cols[i], fright ? 0.5 : 0.42);
      else if (!pause && Math.random() < 0.5) emit(x + rnd(0.15), 0.6, z + rnd(0.15), 0, 0.2, 0, 0.45, 0.35, SPIRITS[i].glow, 0, 2);
    }
    P.body.instanceMatrix.needsUpdate = true; if (P.body.instanceColor) P.body.instanceColor.needsUpdate = true;
    P.scl.instanceMatrix.needsUpdate = true; P.pup.instanceMatrix.needsUpdate = true;
  }
  // intermission props
  if (cut && R.pel) {
    const C = G.cut;
    if (C.jalebi.vis) { _m4.compose(_p.set(C.jalebi.x, 0.9 + C.jalebi.y, 0), _q.setFromAxisAngle(UP, t * 3), _s.set(3, 3, 3)); R.pel.jal.setMatrixAt(0, _m4); R.pel.jal.count = Math.max(1, R.pel.jn); R.pel.jal.instanceMatrix.needsUpdate = true; }
  }
  // the treat
  if (R.fruit) {
    const F = R.fruit, want = G.fruit.on && !cut ? G.fruit.kind : -1;
    if (F.on !== want) { if (F.on >= 0) F.meshes[F.on].visible = false; if (want >= 0) F.meshes[want].visible = true; F.on = want; }
    if (want >= 0) {
      const m = F.meshes[want], bx = M.bonus.x + R.ox, bz = M.bonus.y + R.oz, blink = G.fruit.t < 2 && ((G.fruit.t * 6) | 0) % 2 === 0;
      m.visible = !blink; m.position.set(bx, 0.12 + Math.sin(t * 3) * 0.06, bz); m.rotation.set(0.25, t * 1.5, 0); m.scale.setScalar(1.35);
      glowAt(bx, 0.02, bz, 1.6, col(BONUS[want].col), 0.6);
      if (want === 2 && !pause && Math.random() < 0.25) emit(bx + rnd(0.08), 0.5, bz + rnd(0.08), rnd(0.1), 0.6, rnd(0.1), 1.2, 0.5, '#d8d0c8', -0.3, 0.5);
    }
  }
  if (R.glow) { const g = R.glow; for (let i = g.n; i < GLOW_N; i++) g.g.setMatrixAt(i, ZERO_M); g.g.instanceMatrix.needsUpdate = true; if (g.g.instanceColor) g.g.instanceColor.needsUpdate = true; }
  if (R.lamps) { const lv = !cut && (!R.soft || R.q >= 2); R.lamps.bowls.visible = lv; R.lamps.flames.visible = lv; R.lamps.pools.visible = lv && !R.soft && R.q >= 1; }
  if (R.diyas && !pause) stepDiyas(t, M);
  if (!pause) stepLamps(t, dt, a.reducedMotion);
  if (!pause) stepParticles(dt);
  R.skyU.uTime.value = t;
  // The play camera looks down too steeply to see the sky: draw it only for the intermission, the opening swing and the results.
  R.sky.visible = cut || a.state === 'over' || (R.post && R.post.introActive) || a.state === 'menu' && !R.cheap;
  updateCamera(a, G, dt);
  if (R.post) {
    R.post.letterbox(cut ? 1 : 0);
    if (R.warmPost) { R.post.setQuality(Math.max(1, R.q), true); R.warmPost--; if (!R.warmPost) R.post.setQuality(R.q, R.lockQ); }
  }
  const t0 = performance.now();
  if (VFX) { VFX.setReduced(a.reducedMotion); VFX.update(pause ? 0 : dt); VFX.applyShake(R.camera); }
  try { if (R.post) R.post.render(R.scene, R.camera); else R.renderer.render(R.scene, R.camera); }
  catch (e) { if (VFX) VFX.removeShake(R.camera); if (!R.lost) console.warn(e); return false; }
  if (VFX) VFX.removeShake(R.camera);
  R.longest = Math.max(R.longest * 0.98, performance.now() - t0);
  return true;
}

/* ------------------------------------------------------------ spectacle (shared VFX, loaded after the maze is built) */
// A golden jalebi sends an energy ring and a glow out from the hero, a gulped spirit bursts in its own
// colour, and a cleared maze fires fireworks over the courtyard. Loaded only after the build, no lights.
let VFX = null;
const _vp = new THREE.Vector3();
function loadVFX() {
  if (VFX !== null) return; VFX = false;
  import('/games/shared/vfx.js').then((m) => {
    try { const v = m.createVFX(R.renderer, R.scene, R.camera, { quality: Math.max(0, R.q), unit: 0.7, groundY: 0, lights: 0, reduced: R.ARC ? R.ARC.reducedMotion : false }); v.warm(); VFX = v; window.__vfxState = 'ok'; } catch (e) { VFX = false; window.__vfxState = 'create: ' + (e && e.message); }
  }).catch((e) => { VFX = false; window.__vfxState = 'import: ' + (e && e.message); });
}

/* ------------------------------------------------------------ effects */
function fxEvent(type, d, G) {
  if (!R.ok) return;
  const M = G.M, x = d.x + R.ox, z = d.y + R.oz;
  const rm = R.ARC && R.ARC.reducedMotion;
  switch (type) {
    case 'eat':
      if (d.kind === 1) { eatPellet(d.i); burst(x, 0.26, z, 5, 1.8, ['#ffc04a', '#ff9a2a', '#fff0b0'], 0.35, 0.22, 4); }
      else { burst(x, 0.3, z, 46, 6, ['#ffd23a', '#ffaa22', '#ffffff'], 0.8, 0.5, 2, 0.6); if (R.post && !rm) { R.post.flash(0.22, '#ffcf6a'); R.post.kick(4); } if (VFX) { VFX.ring(_vp.set(x, 0.12, z), '#ffc93a', { size: 1.6 }); VFX.burst(_vp.set(x, 0.5, z), { color: '#ffd23a', size: 0.7 }); } }
      break;
    case 'power': break;
    case 'spirit': {
      const col = SPIRITS[d.i].col;
      burst(x, 0.5, z, 40, 7, [col, '#ffffff', SPIRITS[d.i].glow], 0.7, 0.55, 3);
      if (R.hero) R.hero.joy = 1;
      if (VFX) { VFX.burst(_vp.set(x, 0.5, z), { color: col, size: 0.8 }); VFX.ring(_vp.set(x, 0.1, z), col, { size: 1.2, kind: 'shock' }); }
      if (R.post && !rm) { R.post.flash(0.16, '#d8e4ff'); R.post.kick(-3); }
      break;
    }
    case 'caught': break;
    case 'death':
      burst(x, 0.5, z, 70, 4.5, ['#ffd65a', '#ffb21a', '#ffffff'], 1.4, 0.55, -0.5, 1);
      if (R.post && !rm) R.post.flash(0.12, '#ff9a6a');
      break;
    case 'clear':
      syncPellets(G);
      for (let i = 0; i < 5; i++) burst(rnd(M.W / 2), 4 + Math.random() * 2, rnd(M.H / 2), 40, 4, [M.neon, M.neon2, '#ffffff', '#ffd23a'], 2.4, 1.1, 3);
      if (VFX) VFX.fireworks(_vp.set(0, 8, 0), { count: 5, size: 1.1, launch: true, color: M.neon, color2: M.neon2 });
      break;
    case 'fruit': burst(x, 0.4, z, 30, 4, [BONUS[d.kind].col, '#ffffff'], 0.8, 0.5, 2); break;
    case 'fruitShow': burst(x, 0.4, z, 14, 2.5, ['#ffffff', BONUS[d.kind].col], 0.6, 0.4, 0); break;
    case 'cut': break;
  }
}

/* ------------------------------------------------------------ the view */
const PV = new THREE.Vector3();
const view = {
  name: '3d', three: true,
  init(a) {
    if (!initRenderer(a)) {
      a.panel({ eyebrow: 'Laddoo Dash', title: 'Graphics <em>unavailable</em>', html: '<p>This browser could not start its 3D graphics. Try another browser or turn on hardware acceleration.</p>', actions: [{ label: 'All games', href: '/games', primary: true }] });
      return false;
    }
    R.startQ = R.soft ? 0 : a.device === 'desktop' ? 3 : 2;
    if (R.forceQ >= 0) { R.startQ = R.forceQ; R.lockQ = true; }
    R.q = -1; setQuality(R.startQ);
    queueBuild();
    return true;
  },
  resize(a) { resize(a); },
  setMaze(M, G) { R.G = G; if (TX.floor) { buildMaze(M); syncPellets(G); } else R.pending = M; },
  newGame(G) { R.G = G; R.cam.init = false; R.cam.push = 1; if (TX.floor) { if (G.M !== R.M) buildMaze(G.M); syncPellets(G); } if (R.parts) R.parts.life.fill(0); },
  render,
  project(x, y, h, out) {
    if (!R.ok) return false;
    PV.set(x + R.ox, h, y + R.oz).project(R.camera);
    if (PV.z > 1) return false;
    const a = R.ARC;
    out.x = (PV.x * 0.5 + 0.5) * a.w; out.y = (-PV.y * 0.5 + 0.5) * a.h; out.on = true;
    return true;
  },
  fx: fxEvent,
  graphics(level) { if (!R.ok) return; if (level === 'auto') { R.lockQ = false; return; } R.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  debug() {
    if (!R.ok) return null;
    const i = R.renderer.info.render;
    return { quality: R.q, fps: Math.round(R.fps), soft: R.soft, calls: i.calls, tris: i.triangles, post: !!(R.post && R.post.enabled), ready: R.ready, queue: R.queue.length, gpu: R.gpu.slice(0, 40) };
  },
  skipCine() { if (R.post) R.post.intro(0.001); },
  dev: { quality(q) { R.lockQ = true; setQuality(q); }, unlock() { R.lockQ = false; }, R: () => R }
};
boot(view);
