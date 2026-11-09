import * as THREE from '/games/vendor/three/three.module.min.js';
import { boot, TABLE, BR, DMD, rampAt, clamp, lerp, TAU } from '/games/mela-pinball/core.js';
import { createFX } from '/games/shared/fx3d.js';

/*
 * Mela Pinball in 3D. core.js plays the game; this file builds the table and
 * films it. A glossy playfield painted in code with the night fair's art,
 * chrome balls in a procedural environment of fairground lights, glowing
 * inserts, pop bumpers capped like diyas, a ferris wheel geared to the
 * spinner, a carousel and a juggler at the back, and a dot matrix display on
 * the backbox. A planar reflection puts the balls, bumpers and toys in the
 * playfield's clear coat at the higher detail levels.
 *
 * Boot is incremental: init builds the renderer, lights and a plain table so
 * the menu is up at once, then one small job a frame paints textures, builds
 * the parts and compiles their shaders, so no single task blocks the page and
 * nothing compiles for the first time in the middle of a game.
 */

/* ------------------------------------------------------------ helpers */
const OZ = 50; // table y to world z
const WX = (x) => x, WZ = (y) => OZ - y;
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _c = new THREE.Color();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _o = { x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0 };
function rngf(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Bake a primitive in place with one vertex colour so many parts merge into one mesh.
function prep(geo, hex, pos, rot, scl) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  if (scl == null) _s3.set(1, 1, 1); else if (typeof scl === 'number') _s3.set(scl, scl, scl); else _s3.set(scl[0], scl[1], scl[2]);
  _p3.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  _m4.compose(_p3, _q, _s3); g.applyMatrix4(_m4);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
  return g;
}
function mergeG(list) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  return out;
}
const boxG = (w, h, d, hex, pos, rot) => prep(new THREE.BoxGeometry(w, h, d), hex, pos, rot);
const cylG = (rt, rb, h, seg, hex, pos, rot, scl) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), hex, pos, rot, scl);
const sphG = (r, hex, pos, scl, ws, hs) => prep(new THREE.SphereGeometry(r, ws || 14, hs || 10), hex, pos, null, scl);
const coneG = (r, h, seg, hex, pos, rot) => prep(new THREE.ConeGeometry(r, h, seg), hex, pos, rot);
const torG = (r, t, hex, pos, rot, seg) => prep(new THREE.TorusGeometry(r, t, 6, seg || 32), hex, pos, rot);
// a slab standing along a table segment: from (ax, ay) to (bx, by), thickness th, height h, from z0
function wallG(ax, ay, bx, by, th, h, hex, z0) {
  const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
  return boxG(L + th * 0.6, h, th, hex, [WX((ax + bx) / 2), (z0 || 0) + h / 2, WZ((ay + by) / 2)], [0, Math.atan2(dy, dx), 0]);
}
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = R && R.aniso ? R.aniso : 4;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(o.repeat[0], o.repeat[1]); }
  return t;
}
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* ------------------------------------------------------------ state */
let R = null, ARC = null, FX = null;
// budget: drawn pixels at most (the pixel ratio follows it); cheap: Lambert, matcap ball, no shadow map
const TIERS = [
  { budget: 260000, soft: 100000, cheap: true, shadow: 512, refl: 0, fx: 0, parts: 0.4, glow: 0 },
  { budget: 700000, cheap: false, shadow: 1024, refl: 0, fx: 1, parts: 0.7, glow: 1 },
  { budget: 1300000, cheap: false, shadow: 1024, refl: 0.5, fx: 2, parts: 1, glow: 1 },
  { budget: 2600000, cheap: false, shadow: 2048, refl: 0.5, fx: 3, parts: 1, glow: 1 },
];
function pixelRatio(a, t) { const area = Math.max(1, a.w * a.h); return Math.max(0.35, Math.min(a.dpr, Math.sqrt(((R.soft && t.soft) ? t.soft : t.budget) / area))); }
// The cheap tier swaps every lit material for a Lambert twin (cached), so the fill cost drops several times.
const cheapCache = new Map();
function cheapOf(m) {
  if (!m.isMeshStandardMaterial) return m;
  let c = cheapCache.get(m);
  if (!c) {
    c = new THREE.MeshLambertMaterial({ color: m.color.clone(), map: m.map, vertexColors: m.vertexColors, emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, side: m.side, transparent: m.transparent, opacity: m.opacity, depthWrite: m.depthWrite });
    if (m === R.ballMat && R.matcap) c = new THREE.MeshMatcapMaterial({ matcap: R.matcap, color: '#ffffff' });
    c.userData.full = m; cheapCache.set(m, c);
  }
  return c;
}
function swapMaterials(cheap) {
  R.scene.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh) || !o.material || o.material.isShaderMaterial || o.material.isMeshBasicMaterial) return;
    const full = o.material.userData && o.material.userData.full ? o.material.userData.full : o.material;
    const want = cheap ? cheapOf(full) : full;
    if (o.material !== want) o.material = want;
  });
}
// playfield texture mapping (table cm to canvas)
const XA = -24.5, XB = 27.0, YA = -6.5, YB = 102.5;

function setup(a) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { return false; }
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.22;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#0a0714');
  scene.fog = new THREE.Fog('#0b0716', 160, 420);
  const camera = new THREE.PerspectiveCamera(38, 1, 2, 900);
  camera.position.set(0, 120, 120); camera.lookAt(0, 0, 0);
  const hemi = new THREE.HemisphereLight('#a99cff', '#3a1830', 1.0);
  const key = new THREE.DirectionalLight('#fff1dc', 2.7);
  key.position.set(-30, 90, 40);
  key.castShadow = true;
  const sc = key.shadow.camera; sc.left = -34; sc.right = 34; sc.top = 62; sc.bottom = -62; sc.near = 20; sc.far = 200;
  key.shadow.bias = -0.0012; key.shadow.normalBias = 0.12; key.shadow.mapSize.set(1024, 1024);
  key.target.position.set(0, 0, 0);
  const rim = new THREE.DirectionalLight('#ff7ad0', 0.55); rim.position.set(40, 30, -80);
  [hemi, key, rim].forEach((l) => l.layers.enable(1));
  scene.add(hemi, key, key.target, rim);
  let soft = false;
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER))); } catch (e) { soft = false; }
  R = {
    renderer, scene, camera, hemi, key, rim, soft, aniso: Math.min(8, renderer.capabilities.getMaxAnisotropy()),
    jobs: [], jobLog: [], jobsDone: 0, ready: false, built: {}, mats: {}, quality: -1, lockQ: false, fps: 60, qT: 0, qN: 0, qWarm: 0, upT: 0, lost: false,
    lastNow: 0, t: 0, cam: { mode: 'attract', blend: 1, from: new THREE.Vector3(), fromQ: new THREE.Quaternion(), pos: new THREE.Vector3(0, 120, 120), look: new THREE.Vector3(), fov: 38, followZ: 0, push: 0, pushX: 0, pushZ: 0, moment: null, momentT: 0, dip: 0 },
    world: null, dmdVer: -1, shake: 0, tableShake: 0, blackTex: null, buildMs: 0, longest: 0,
  };
  a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.lost = true; }, false);
  a.canvas.addEventListener('webglcontextrestored', () => { R.lost = false; }, false);
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true; R.blackTex = black;
  // the first frame already shows a table and a cabinet; the rest is built a job at a time
  buildBase();
  queueJobs();
  try {
    FX = createFX(renderer, { arc: a, intro: false, results: { dist: 60, yaw: 0.22, rise: 0.1, speed: 0.2 }, target: (v) => { v.set(0, 0, WZ(46)); return true; }, look: { bloom: 0.75, bloomWide: 0.45, threshold: 0.6, knee: 0.25, vignette: 0.36, grain: 0.03, sat: 1.1, contrast: 1.06 } });
  } catch (e) { FX = null; }
  return true;
}

/* ------------------------------------------------------------ materials */
function M() {
  if (R.mats.ok) return R.mats;
  const m = R.mats; m.ok = true;
  m.vc = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 });
  m.vcGloss = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22, metalness: 0.0 });
  m.chrome = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.16, metalness: 1.0 });
  m.wood = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0.0 });
  m.rubber = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.0 });
  m.plastic = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.0, transparent: true, opacity: 0.78, emissive: '#ffffff', emissiveIntensity: 0.0 });
  m.glow = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
  return m;
}
function track(mesh, refl, shadow) {
  if (refl) mesh.layers.enable(1);
  if (shadow) { mesh.castShadow = true; }
  return mesh;
}

/* ------------------------------------------------------------ the first frame */
function buildBase() {
  const s = R.scene, m = M();
  // cabinet: dark lacquered wood, side rails, the front lockdown bar
  const parts = [];
  parts.push(boxG(64, 14, 128, '#2a1424', [1.2, -7.5, WZ(48)]));
  m.cabinet = new THREE.Mesh(mergeG(parts), m.wood); m.cabinet.receiveShadow = true; s.add(m.cabinet);
  // the playfield, a flat colour until its art is painted
  R.pfMat = new THREE.MeshStandardMaterial({ color: '#2a1550', roughness: 0.28, metalness: 0.0 });
  const pf = new THREE.Mesh(new THREE.PlaneGeometry(XB - XA, YB - YA), R.pfMat);
  pf.rotation.x = -Math.PI / 2; pf.position.set((XA + XB) / 2, 0, WZ((YA + YB) / 2)); pf.receiveShadow = true;
  s.add(pf); R.pf = pf;
  // night sky dome with a soft horizon glow
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uT: { value: 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; uniform float uT; float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); } void main(){ float y = vP.y; vec3 top = vec3(0.025,0.02,0.07); vec3 hor = vec3(0.22,0.07,0.16); vec3 c = mix(hor, top, smoothstep(-0.05, 0.55, y)); vec2 g = floor(vP.xz / max(0.15, y + 0.2) * 260.0); float s = step(0.9975, h(g)) * smoothstep(0.1, 0.5, y); c += s * vec3(0.9,0.85,1.0) * (0.6 + 0.4 * sin(uT * 2.0 + h(g + 3.0) * 30.0)); gl_FragColor = vec4(c, 1.0); }',
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 24, 12), skyMat);
  s.add(sky); R.sky = sky; R.skyMat = skyMat;
}

/* ------------------------------------------------------------ jobs */
function queueJobs() {
  const J = R.jobs;
  J.push(paintPlayfield1, paintPlayfield2, paintPlayfield3, uploadPlayfield, buildWalls, buildPosts, buildFlippers, buildBumpers, buildSlings, buildTargetsSpinnerGates, buildRamp, buildLamps, buildBalls, buildFerris, buildCarousel, buildJuggler, paintBackglass, buildBackbox, buildCabinet, buildBackdrop, buildParticles, buildReflection);
  // the detailed look (environment reflections, shadows) and the cheap one both get compiled before play,
  // so the auto-scaler can move between them without a hitch; a software renderer only ever needs the cheap one
  if (!R.soft) J.push(buildEnv, precompileOther);
}
function runJobs(budget) {
  const t0 = performance.now();
  while (R.jobs.length && performance.now() - t0 < budget) {
    const j = R.jobs.shift();
    const s = performance.now();
    try { j(); } catch (e) { console.warn('mela-pinball build', j.name, e); }
    // compile what this job added now, not when it first appears in play
    try { if (TIERS[Math.max(0, R.quality)].cheap) swapMaterials(true); R.renderer.compile(R.scene, R.camera); } catch (e) { /* lost context */ }
    const d = performance.now() - s; R.buildMs += d; if (d > R.longest) R.longest = d;
    R.jobLog.push(j.name + ':' + Math.round(d));
    R.jobsDone++;
    if (d > budget * 0.6) break;
  }
  if (!R.jobs.length && !R.ready) { R.ready = true; applyTier(); }
}

/* ------------------------------------------------------------ playfield art */
function px(x, W) { return (x - XA) / (XB - XA) * W; }
function py(y, H) { return (YB - y) / (YB - YA) * H; }
function paintPlayfield1() {
  const W = 1024, H = 2048;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  R.pfCanvas = c;
  const sx = W / (XB - XA), sy = H / (YB - YA);
  const P = (x, y) => [px(x, W), py(y, H)];
  // night: deep indigo at the top, plum and rose toward the flippers
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1a1450'); bg.addColorStop(0.45, '#2e1a66'); bg.addColorStop(0.8, '#4a1a62'); bg.addColorStop(1, '#5a1848');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  const r = rngf(11);
  // stars and a soft milky band across the top
  for (let i = 0; i < 520; i++) { const x = r() * W, y = r() * H * 0.55, s = r() * 1.6 + 0.4; g.fillStyle = 'rgba(255,240,220,' + (0.15 + r() * 0.5) + ')'; g.fillRect(x, y, s, s); }
  // the big rangoli under the pop bumpers
  const [cx, cy] = P(1, 66);
  for (let ring = 0; ring < 7; ring++) {
    const rr = (5 + ring * 4.3) * sx, petals = 8 + ring * 4;
    g.strokeStyle = ring % 2 ? 'rgba(255,183,54,0.42)' : 'rgba(255,79,160,0.38)'; g.lineWidth = 2.2;
    for (let p = 0; p < petals; p++) {
      const a0 = p / petals * TAU, a1 = (p + 1) / petals * TAU, am = (a0 + a1) / 2;
      g.beginPath(); g.moveTo(cx + Math.cos(a0) * rr, cy + Math.sin(a0) * rr);
      g.quadraticCurveTo(cx + Math.cos(am) * (rr + 3.6 * sx), cy + Math.sin(am) * (rr + 3.6 * sx), cx + Math.cos(a1) * rr, cy + Math.sin(a1) * rr); g.stroke();
      if (ring % 2 === 0) { g.fillStyle = 'rgba(47,224,200,0.28)'; g.beginPath(); g.arc(cx + Math.cos(am) * (rr + 1.8 * sx), cy + Math.sin(am) * (rr + 1.8 * sx), 2.6, 0, TAU); g.fill(); }
    }
  }
  const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 34 * sx); rg.addColorStop(0, 'rgba(255,140,60,0.25)'); rg.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = rg; g.fillRect(cx - 40 * sx, cy - 40 * sy, 80 * sx, 80 * sy);
  // bunting strung across the table
  const bunting = (y0, sag, cols) => {
    g.strokeStyle = 'rgba(255,230,200,0.55)'; g.lineWidth = 2;
    g.beginPath();
    for (let x = -22; x <= 22.5; x += 0.5) { const yy = y0 - Math.sin((x + 22) / 44.5 * Math.PI) * sag; const p = P(x, yy); if (x === -22) g.moveTo(p[0], p[1]); else g.lineTo(p[0], p[1]); }
    g.stroke();
    for (let x = -21, i = 0; x <= 21.5; x += 2.2, i++) {
      const yy = y0 - Math.sin((x + 22) / 44.5 * Math.PI) * sag; const p = P(x, yy);
      g.fillStyle = cols[i % cols.length]; g.beginPath(); g.moveTo(p[0] - 0.8 * sx, p[1]); g.lineTo(p[0] + 0.8 * sx, p[1]); g.lineTo(p[0], p[1] + 2.2 * sy); g.closePath(); g.fill();
    }
  };
  bunting(91, 3, ['#ff4fa0', '#ffb02e', '#2fe0c8', '#8a6bff', '#ff6a2a']);
  bunting(50, 2.4, ['#ffb02e', '#ff4fa0', '#33d6ff', '#4dff9a']);
  // marigold garland along the walls
  const garland = (x0, y0, x1, y1) => {
    const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.9);
    for (let i = 0; i <= n; i++) { const t = i / n; const p = P(lerp(x0, x1, t), lerp(y0, y1, t)); g.fillStyle = i % 3 === 0 ? '#ff8a1e' : i % 3 === 1 ? '#ffc21a' : '#ff5e1a'; g.beginPath(); g.arc(p[0], p[1], 6, 0, TAU); g.fill(); g.fillStyle = 'rgba(120,40,0,0.5)'; g.beginPath(); g.arc(p[0] + 1.5, p[1] + 1.5, 2, 0, TAU); g.fill(); }
  };
  garland(-21.3, 4, -21.3, 88); garland(21.1, 30, 21.1, 60);
  R.pfDraw = { g, W, H, sx, sy, P };
}
function paintPlayfield2() {
  const { g, W, H, sx, sy, P } = R.pfDraw;
  const T = TABLE;
  const label = (s, x, y, size, col, rot, font) => {
    const p = P(x, y); g.save(); g.translate(p[0], p[1]); g.rotate(rot || 0);
    g.font = (font || '800 ') + Math.round(size * sy) + 'px system-ui, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 4; g.strokeStyle = 'rgba(10,4,20,0.75)'; g.strokeText(s, 0, 0); g.fillStyle = col; g.fillText(s, 0, 0); g.restore();
  };
  // shooter lane: pale wood with arrow marks
  const [lx0] = P(T.LANE[0], 0), [lx1] = P(T.LANE[1], 0);
  const wg = g.createLinearGradient(lx0, 0, lx1, 0); wg.addColorStop(0, '#6b4a2c'); wg.addColorStop(0.5, '#8a6440'); wg.addColorStop(1, '#5c3e24');
  g.fillStyle = wg; g.fillRect(lx0, py(84, H), lx1 - lx0, H);
  for (let y = 12; y < 80; y += 8) { const p = P(23.65, y); g.fillStyle = 'rgba(255,200,120,0.5)'; g.beginPath(); g.moveTo(p[0], p[1] - 10); g.lineTo(p[0] + 8, p[1] + 4); g.lineTo(p[0] - 8, p[1] + 4); g.closePath(); g.fill(); }
  // top lanes: letters M E L A
  T.laneX.forEach((x, i) => { label('MELA'[i], x, 81.6, 3.2, ['#ff7cc0', '#ffc35a', '#6ff0dc', '#b39bff'][i]); });
  // shot labels
  label('JUGGLER RAMP', 6.75, 38.0, 1.25, '#ffb366');
  label('WHEEL ORBIT', -10.5, 38.8, 1.15, '#7fe6ff', -0.95);
  label('LANTERNS', -11.0, 34.4, 1.0, '#ffe08a', -Math.PI / 2);
  label('CAROUSEL', 15.6, 48.6, 1.15, '#d4a8ff', -0.7);
  label('SHOOT AGAIN', 0, 15.3, 0.95, '#ffb0b8');
  label('BALL SAVE', 0, 22.5, 0.75, '#a8ffcc');
  ['2x', '3x', '4x', '5x', '6x'].forEach((s, i) => label(s, -5.2 + i * 2.6, 26.0, 0.8, '#fff2d8'));
  ['FRENZY', 'WHEEL', 'LANTERN', 'BUMPER'].forEach((s, i) => label(s, -4.8 + i * 3.2, 28.6 + (i === 1 || i === 2 ? 1.2 : 0), 0.62, '#ffd9a8'));
  label('JACKPOT', 6.75, 27.7, 0.8, '#ffe066');
  label('MULTIBALL', 6.75, 33.2, 0.7, '#ffd36a');
  // big logo between the slingshots
  const [lgx, lgy] = P(0, 35.5);
  g.save(); g.translate(lgx, lgy);
  g.font = '900 ' + Math.round(3.1 * sy) + 'px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lgg = g.createLinearGradient(0, -30, 0, 30); lgg.addColorStop(0, '#ffe7a3'); lgg.addColorStop(1, '#ff8a1e');
  g.lineWidth = 6; g.strokeStyle = 'rgba(40,6,30,0.85)'; g.strokeText('MELA', 0, 0); g.fillStyle = lgg; g.fillText('MELA', 0, 0);
  g.restore();
}
function paintPlayfield3() {
  const { g, W, H, sx, sy, P } = R.pfDraw;
  const T = TABLE;
  // insert sockets: a dark well and a coloured rim for every lamp (the light itself is a separate mesh)
  T.lamps.forEach((lp) => {
    const p = P(lp.x, lp.y), rr = (lp.shape === 2 ? 0.75 : 1.15) * lp.size * sx;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.beginPath(); g.arc(p[0], p[1], rr * 1.35, 0, TAU); g.fill();
    g.strokeStyle = lp.col; g.globalAlpha = 0.5; g.lineWidth = 2; g.beginPath(); g.arc(p[0], p[1], rr * 1.35, 0, TAU); g.stroke(); g.globalAlpha = 1;
  });
  // shadows painted where walls stand, so they sit into the wood
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 9; g.lineCap = 'round';
  T.segs.forEach((s) => { if (s.mat === 'wood') return; const a = P(s.ax, s.ay), b = P(s.bx, s.by); g.beginPath(); g.moveTo(a[0] + 3, a[1] + 4); g.lineTo(b[0] + 3, b[1] + 4); g.stroke(); });
  // the drain: a dark mouth between the flippers
  const dg = g.createRadialGradient(...P(0, 0), 0, ...P(0, 0), 12 * sx); dg.addColorStop(0, 'rgba(0,0,0,0.75)'); dg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = dg; g.fillRect(0, py(12, H), W, H - py(12, H));
  // clear coat: a broad sheen
  const sh = g.createLinearGradient(0, 0, W, H); sh.addColorStop(0, 'rgba(255,255,255,0.05)'); sh.addColorStop(0.5, 'rgba(255,255,255,0)'); sh.addColorStop(1, 'rgba(255,255,255,0.03)');
  g.fillStyle = sh; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(R.pfCanvas);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = R.aniso;
  R.pfMat.map = t; R.pfMat.color.set('#ffffff'); R.pfMat.roughness = 0.22; R.pfMat.needsUpdate = true;
  const cheapPf = cheapCache.get(R.pfMat); if (cheapPf) { cheapPf.map = t; cheapPf.color.set('#ffffff'); cheapPf.needsUpdate = true; }
  // the reflection is mixed into the clear coat here; strength 0 until the tier turns it on
  R.reflU = { tRefl: { value: R.blackTex }, uReflMat: { value: new THREE.Matrix4() }, uReflStr: { value: 0 }, uReflTx: { value: new THREE.Vector2(0.002, 0.002) } };
  R.pfMat.onBeforeCompile = (sh2) => {
    Object.assign(sh2.uniforms, R.reflU);
    sh2.vertexShader = 'uniform mat4 uReflMat; varying vec4 vRefl;\n' + sh2.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vRefl = uReflMat * modelMatrix * vec4(transformed, 1.0);');
    sh2.fragmentShader = 'uniform sampler2D tRefl; uniform float uReflStr; uniform vec2 uReflTx; varying vec4 vRefl;\n' + sh2.fragmentShader.replace('#include <tonemapping_fragment>', 'vec2 ruv = vRefl.xy / vRefl.w; vec3 rfl = texture2D(tRefl, ruv).rgb * 0.28 + (texture2D(tRefl, ruv + vec2(uReflTx.x, 0.0)).rgb + texture2D(tRefl, ruv - vec2(uReflTx.x, 0.0)).rgb + texture2D(tRefl, ruv + vec2(0.0, uReflTx.y)).rgb + texture2D(tRefl, ruv - vec2(0.0, uReflTx.y)).rgb) * 0.18; gl_FragColor.rgb += rfl * uReflStr;\n#include <tonemapping_fragment>');
  };
  R.pfMat.customProgramCacheKey = () => 'mp-pf';
  R.pfDraw = null;
  R.pfTex = t;
}
// upload the big texture (and its mipmaps) in a job of its own, not inside the first frame that shows it
function uploadPlayfield() { if (R.pfTex) R.renderer.initTexture(R.pfTex); }

/* ------------------------------------------------------------ walls, posts */
function buildWalls() {
  const m = M(), T = TABLE;
  const wood = [], metal = [], plastic = [], ramp = [];
  T.segs.forEach((s) => {
    if (!s.draw || s.kind === 'gate' || s.kind === 'target' || s.kind === 'sling') return;
    if (s.mat === 'wood') {
      // the cabinet's inner wall: a thick lacquered rail with a light trim on top
      // the outline runs clockwise, so its left side is outside: the slab's inner face sits on the line
      const nx = -(s.by - s.ay), ny = s.bx - s.ax, l = Math.hypot(nx, ny) || 1;
      const ox = nx / l * 0.9, oy = ny / l * 0.9;
      wood.push(wallG(s.ax + ox, s.ay + oy, s.bx + ox, s.by + oy, 1.8, 3.4, '#5a2448'));
      wood.push(wallG(s.ax + ox, s.ay + oy, s.bx + ox, s.by + oy, 1.9, 0.25, '#e8c27a', 3.4));
    } else if (s.mat === 'metal') metal.push(wallG(s.ax, s.ay, s.bx, s.by, Math.max(0.3, s.r * 2), s.h, '#cfd3dc'));
    else if (s.mat === 'ramp') ramp.push(wallG(s.ax, s.ay, s.bx, s.by, 0.5, s.h, '#ff7a3a'));
    else plastic.push(wallG(s.ax, s.ay, s.bx, s.by, Math.max(0.35, s.r * 2), s.h, '#ffd6f0'));
  });
  const s = R.scene;
  const add = (list, mat, refl) => { if (!list.length) return null; const mesh = new THREE.Mesh(mergeG(list), mat); mesh.castShadow = true; mesh.receiveShadow = true; if (refl) mesh.layers.enable(1); s.add(mesh); return mesh; };
  add(wood, m.wood, false); add(metal, m.chrome, true); add(plastic, m.vcGloss, true); add(ramp, m.vcGloss, true);
}
function buildPosts() {
  const m = M(), T = TABLE;
  // every round post: a chrome pin, and on the rubber ones a ring
  const pins = T.circs.filter((c) => c.kind !== 'bumper');
  const pinGeo = mergeG([cylG(0.32, 0.32, 3.0, 10, '#e4e6ec', [0, 1.5, 0]), cylG(0.5, 0.5, 0.25, 12, '#f2f2f5', [0, 3.05, 0])]);
  const pinMesh = new THREE.InstancedMesh(pinGeo, m.chrome, pins.length);
  const ringGeo = mergeG([prep(new THREE.TorusGeometry(1, 0.32, 8, 20), '#ffffff', [0, 0, 0], [Math.PI / 2, 0, 0])]);
  const rubberPins = pins.filter((c) => c.mat === 'rubber');
  const ringMesh = new THREE.InstancedMesh(ringGeo, m.rubber, Math.max(1, rubberPins.length));
  pins.forEach((c, i) => { _m4.makeTranslation(WX(c.x), 0, WZ(c.y)); pinMesh.setMatrixAt(i, _m4); });
  rubberPins.forEach((c, i) => {
    const rr = Math.max(0.2, c.r - 0.2);
    _m4.compose(_p3.set(WX(c.x), 1.25, WZ(c.y)), _q.identity(), _s3.set(rr + 0.32, 1.6, rr + 0.32));
    ringMesh.setMatrixAt(i, _m4);
    ringMesh.setColorAt(i, _c.set(i % 3 === 0 ? '#e83a5a' : '#1a1418'));
  });
  if (ringMesh.instanceColor) ringMesh.instanceColor.needsUpdate = true;
  pinMesh.castShadow = ringMesh.castShadow = true; pinMesh.layers.enable(1); ringMesh.layers.enable(1);
  R.scene.add(pinMesh, ringMesh);
}

/* ------------------------------------------------------------ flippers */
function flipperShape(f) {
  const s = new THREE.Shape(), L = f.len, a = Math.asin((f.rb - f.rt) / L);
  s.absarc(0, 0, f.rb, Math.PI / 2 + a, Math.PI * 1.5 - a, false);
  s.absarc(L, 0, f.rt, -Math.PI / 2 - a, Math.PI / 2 + a, false);
  s.closePath();
  return s;
}
function buildFlippers() {
  const m = M();
  R.flip = TABLE.flippers.map((f) => {
    const grp = new THREE.Group();
    const body = new THREE.ExtrudeGeometry(flipperShape(f), { depth: 1.5, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, bevelSegments: 2, curveSegments: 10 });
    body.rotateX(-Math.PI / 2); body.translate(0, 0.35, 0);
    const big = { len: f.len, rb: f.rb + 0.16, rt: f.rt + 0.16 };
    const rub = new THREE.ExtrudeGeometry(flipperShape(big), { depth: 0.75, bevelEnabled: false, curveSegments: 10 });
    rub.rotateX(-Math.PI / 2); rub.translate(0, 0.65, 0);
    const bm = new THREE.Mesh(prep(body, '#fbf3e4'), m.vcGloss), rm = new THREE.Mesh(prep(rub, '#e0233f'), m.rubber);
    const cap = new THREE.Mesh(mergeG([cylG(0.45, 0.45, 0.3, 12, '#e8e8ee', [0, 2.15, 0])]), m.chrome);
    [bm, rm, cap].forEach((x) => { x.castShadow = true; x.receiveShadow = true; x.layers.enable(1); grp.add(x); });
    grp.position.set(WX(f.px), 0, WZ(f.py));
    R.scene.add(grp);
    return grp;
  });
}

/* ------------------------------------------------------------ bumpers */
function buildBumpers() {
  const m = M(), B = TABLE.bumpers, n = B.length;
  // base and skirt, the chrome ring that slams down, and the glowing diya cap
  const base = new THREE.InstancedMesh(mergeG([cylG(2.7, 2.9, 0.5, 24, '#1a1230', [0, 0.25, 0]), cylG(2.2, 2.4, 2.0, 24, '#f3e6ff', [0, 1.4, 0]), cylG(0.6, 0.6, 3.6, 8, '#d8d8e0', [0, 1.8, 0])]), m.vcGloss, n);
  const ring = new THREE.InstancedMesh(mergeG([cylG(2.6, 2.6, 0.32, 24, '#e8eaf0', [0, 0, 0], null)]), m.chrome, n);
  const capTex = canvasTex(256, 256, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, '#fff7d8'); gr.addColorStop(0.35, '#ffd27a'); gr.addColorStop(0.75, '#ff7a2a'); gr.addColorStop(1, '#a8203a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,20,40,0.6)'; g.lineWidth = 5;
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 30, h / 2 + Math.sin(a) * 30); g.quadraticCurveTo(w / 2 + Math.cos(a + 0.26) * 90, h / 2 + Math.sin(a + 0.26) * 90, w / 2 + Math.cos(a) * 122, h / 2 + Math.sin(a) * 122); g.stroke(); }
    g.fillStyle = '#fffbe8'; g.beginPath(); g.ellipse(w / 2, h / 2, 16, 26, 0, 0, TAU); g.fill();
  });
  const capGeo = new THREE.SphereGeometry(2.55, 24, 10, 0, TAU, 0, Math.PI * 0.42); capGeo.scale(1, 0.55, 1); capGeo.translate(0, 2.25, 0);
  // planar uv from above, so the painted diya sits on the dome
  const pa = capGeo.attributes.position, uv = capGeo.attributes.uv;
  for (let i = 0; i < pa.count; i++) uv.setXY(i, pa.getX(i) / 5.4 + 0.5, pa.getZ(i) / 5.4 + 0.5);
  R.capMat = new THREE.MeshBasicMaterial({ map: capTex, toneMapped: false, color: '#ffffff' });
  const cap = new THREE.InstancedMesh(capGeo, R.capMat, n);
  for (let i = 0; i < n; i++) { _m4.makeTranslation(WX(B[i].x), 0, WZ(B[i].y)); base.setMatrixAt(i, _m4); cap.setMatrixAt(i, _m4); cap.setColorAt(i, _c.setRGB(0.6, 0.6, 0.6)); }
  base.castShadow = ring.castShadow = true; base.receiveShadow = true;
  [base, ring, cap].forEach((x) => { x.layers.enable(1); R.scene.add(x); });
  R.bump = { base, ring, cap, n };
  updateBumpers(null);
}
function updateBumpers(W) {
  const b = R.bump; if (!b) return;
  const B = TABLE.bumpers;
  for (let i = 0; i < b.n; i++) {
    const st = W ? W.bump[i] : null, k = st ? st.flash : 0, rk = st ? st.ring : 0;
    _m4.makeTranslation(WX(B[i].x), 2.75 - rk * 1.6, WZ(B[i].y)); b.ring.setMatrixAt(i, _m4);
    const glow = 0.55 + (W && W.attract ? 0.25 * Math.max(0, Math.sin(R.t * 4 + i * 2)) : 0) + k * 1.6;
    b.cap.setColorAt(i, _c.setRGB(glow, glow * 0.92, glow * 0.85));
  }
  b.ring.instanceMatrix.needsUpdate = true; if (b.cap.instanceColor) b.cap.instanceColor.needsUpdate = true;
}

/* ------------------------------------------------------------ slingshots */
function buildSlings() {
  const m = M();
  R.sling = TABLE.slings.map((S) => {
    const sh = new THREE.Shape();
    const ins = (p, k) => [lerp(p[0], (S.a[0] + S.b[0] + S.c[0]) / 3, k), lerp(p[1], (S.a[1] + S.b[1] + S.c[1]) / 3, k)];
    const A = ins(S.a, -0.08), Bp = ins(S.b, -0.08), C = ins(S.c, -0.08);
    sh.moveTo(WX(A[0]), -WZ(A[1])); sh.lineTo(WX(Bp[0]), -WZ(Bp[1])); sh.lineTo(WX(C[0]), -WZ(C[1])); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.35, bevelEnabled: false });
    g.rotateX(-Math.PI / 2); g.translate(0, 2.9, 0);
    const top = new THREE.Mesh(prep(g, S.side ? '#2fe0c8' : '#ff4fa0'), m.plastic.clone());
    top.material.emissive.set(S.side ? '#2fe0c8' : '#ff4fa0');
    // the rubber band across the kicker face, which bows when it fires
    const dx = S.c[0] - S.a[0], dy = S.c[1] - S.a[1], L = Math.hypot(dx, dy);
    const band = new THREE.Mesh(mergeG([boxG(L, 0.9, 0.42, '#ffffff', [0, 0, 0])]), m.rubber.clone());
    band.material.color.set('#f2f2f2');
    band.position.set(WX((S.a[0] + S.c[0]) / 2), 1.1, WZ((S.a[1] + S.c[1]) / 2)); band.rotation.y = Math.atan2(dy, dx);
    const nx = -dy / L * (S.side ? -1 : 1), ny = dx / L * (S.side ? -1 : 1);
    band.userData.n = [nx, ny]; band.userData.p = [band.position.x, band.position.z];
    [top, band].forEach((x) => { x.castShadow = true; x.layers.enable(1); R.scene.add(x); });
    return { top, band };
  });
}

/* ------------------------------------------------------------ targets, spinner, gates */
function buildTargetsSpinnerGates() {
  const m = M(), T = TABLE;
  const faceTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#2a0d1e'; g.fillRect(0, 0, w, h);
    const gr = g.createRadialGradient(w / 2, h * 0.55, 6, w / 2, h * 0.55, 56); gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.5, '#ff9a2a'); gr.addColorStop(1, '#a8203a');
    g.fillStyle = gr; g.beginPath(); g.ellipse(w / 2, h * 0.55, 38, 46, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(80,10,20,0.6)'; g.lineWidth = 3; for (let i = -2; i <= 2; i++) { g.beginPath(); g.ellipse(w / 2, h * 0.55, Math.abs(i) * 9 + 3, 46, 0, 0, TAU); g.stroke(); }
    g.fillStyle = '#ffcf4a'; g.fillRect(w / 2 - 20, 8, 40, 10); g.fillRect(w / 2 - 20, h - 18, 40, 10);
  });
  R.tgtMat = new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.35, emissive: '#ff8a2a', emissiveMap: faceTex, emissiveIntensity: 0.3 });
  const tg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.55, 2.6, 2.5), R.tgtMat, T.targets.length);
  tg.castShadow = true; tg.layers.enable(1); R.scene.add(tg); R.tg = tg;
  // spinner: a little ferris wheel plate on a wire across the orbit lane
  const sp = T.spinner;
  const spTex = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#e9e2d0'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#b8203a'; g.lineWidth = 3; g.beginPath(); g.arc(w / 2, h / 2, 26, 0, TAU); g.stroke();
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * 26, h / 2 + Math.sin(a) * 26); g.stroke(); g.fillStyle = ['#ff4fa0', '#ffb02e', '#2fe0c8', '#8a6bff'][i % 4]; g.fillRect(w / 2 + Math.cos(a) * 26 - 4, h / 2 + Math.sin(a) * 26 - 3, 8, 6); }
  });
  const spGrp = new THREE.Group();
  spGrp.position.set(WX((sp.x0 + sp.x1) / 2), 2.5, WZ(sp.y));
  const plate = new THREE.Mesh(new THREE.BoxGeometry(sp.x1 - sp.x0 - 0.4, 1.9, 0.12), new THREE.MeshStandardMaterial({ map: spTex, roughness: 0.3, metalness: 0.2 }));
  plate.position.y = -1.0; plate.castShadow = true; plate.layers.enable(1);
  const piv = new THREE.Group(); piv.add(plate); spGrp.add(piv);
  const wire = new THREE.Mesh(mergeG([cylG(0.12, 0.12, sp.x1 - sp.x0 + 0.4, 6, '#d0d4dc', [0, 0, 0], [0, 0, Math.PI / 2]), cylG(0.15, 0.15, 2.6, 6, '#d0d4dc', [-(sp.x1 - sp.x0) / 2 - 0.1, -1.3, 0]), cylG(0.15, 0.15, 2.6, 6, '#d0d4dc', [(sp.x1 - sp.x0) / 2 + 0.1, -1.3, 0])]), m.chrome);
  spGrp.add(wire); R.scene.add(spGrp); R.spin = piv;
  // gates: flaps hanging from a wire, they swing as a ball goes through
  R.gates = T.gates.map((s) => {
    const grp = new THREE.Group(); const L = Math.hypot(s.bx - s.ax, s.by - s.ay);
    grp.position.set(WX((s.ax + s.bx) / 2), 2.2, WZ((s.ay + s.by) / 2)); grp.rotation.y = Math.atan2(s.by - s.ay, s.bx - s.ax);
    const piv2 = new THREE.Group(); grp.add(piv2);
    const flap = new THREE.Mesh(mergeG([boxG(L - 0.2, 1.8, 0.1, '#d6dae2', [0, -0.95, 0])]), m.chrome); flap.castShadow = true; flap.layers.enable(1);
    piv2.add(flap); grp.add(new THREE.Mesh(mergeG([cylG(0.1, 0.1, L + 0.3, 6, '#c8ccd4', [0, 0, 0], [0, 0, Math.PI / 2])]), m.chrome));
    R.scene.add(grp);
    return piv2;
  });
}

/* ------------------------------------------------------------ the juggler ramp */
function buildRamp() {
  const m = M(), Rp = TABLE.ramp;
  // a clear orange channel along the path: floor and two low walls, with chrome rails on the edges
  const N = 90, pos = [], nor = [], col = [], idx = [];
  const fr = [];
  for (let i = 0; i <= N; i++) {
    rampAt(Rp, Rp.L * i / N, _o);
    const tx = _o.tx, ty = _o.ty; const l = Math.hypot(tx, ty) || 1;
    fr.push({ x: _o.x, y: _o.y, z: _o.z, sx: -ty / l, sy: tx / l });
  }
  const wF = 2.15, wallH = 1.5;
  const ring = [[-wF - 0.15, wallH], [-wF, 0], [wF, 0], [wF + 0.15, wallH]];
  for (let i = 0; i <= N; i++) {
    const f = fr[i];
    ring.forEach((r2) => {
      const X = f.x + f.sx * r2[0], Y = f.y + f.sy * r2[0];
      pos.push(WX(X), f.z - 0.2 + r2[1], WZ(Y)); nor.push(0, 1, 0);
      const k = i / N; col.push(1.0, 0.32 + 0.18 * k, 0.08 + 0.08 * k);
    });
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < 3; j++) { const a = i * 4 + j, b = a + 1, c = a + 4, d = c + 1; idx.push(a, c, b, b, c, d); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx); g.computeVertexNormals();
  const rmat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.0, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false, emissive: '#ff5a1a', emissiveIntensity: 0.18 });
  const mesh = new THREE.Mesh(g, rmat); mesh.layers.enable(1); mesh.renderOrder = 2;
  R.rampMat = rmat; R.rampMesh = mesh;
  // rails and supports
  const rails = [];
  [-wF - 0.2, wF + 0.2].forEach((off) => {
    const pts = fr.map((f) => new THREE.Vector3(WX(f.x + f.sx * off), f.z + wallH - 0.1, WZ(f.y + f.sy * off)));
    rails.push(prep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 120, 0.16, 5, false), '#e6e8ee'));
  });
  for (let i = 12; i < N - 6; i += 13) { const f = fr[i]; if (f.z < 2.5) continue; rails.push(cylG(0.18, 0.18, f.z, 6, '#c8ccd4', [WX(f.x + f.sx * (wF + 0.4)), f.z / 2, WZ(f.y + f.sy * (wF + 0.4))])); }
  const railMesh = new THREE.Mesh(mergeG(rails), m.chrome); railMesh.castShadow = true; railMesh.layers.enable(1);
  R.scene.add(mesh, railMesh);
}

/* ------------------------------------------------------------ inserts */
function buildLamps() {
  const T = TABLE, L = T.lamps;
  const shapes = [new THREE.CircleGeometry(1.0, 24), arrowGeo(), new THREE.CircleGeometry(0.75, 18), starGeo()];
  shapes.forEach((g) => g.rotateX(-Math.PI / 2));
  R.lampMat = new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
  R.lampCol = L.map((lp) => new THREE.Color(lp.col));
  R.lampSets = shapes.map((g, si) => {
    const list = L.map((lp, i) => (lp.shape === si ? i : -1)).filter((i) => i >= 0);
    const mesh = new THREE.InstancedMesh(g, R.lampMat, Math.max(1, list.length));
    list.forEach((li, k) => {
      const lp = L[li];
      _m4.compose(_p3.set(WX(lp.x), 0.03, WZ(lp.y)), _q.setFromAxisAngle(_up, lp.rot), _s3.set(lp.size, 1, lp.size));
      mesh.setMatrixAt(k, _m4); mesh.setColorAt(k, _c.set(lp.col).multiplyScalar(0.1));
    });
    mesh.count = list.length; mesh.layers.enable(1); R.scene.add(mesh);
    return { mesh, list };
  });
  // a soft light pool round every insert, added on top of the playfield
  const glowTex = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  R.glowTex = glowTex;
  R.glowMat = new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const gg = new THREE.PlaneGeometry(1, 1); gg.rotateX(-Math.PI / 2);
  const glow = new THREE.InstancedMesh(gg, R.glowMat, L.length);
  L.forEach((lp, i) => { _m4.compose(_p3.set(WX(lp.x), 0.06, WZ(lp.y)), _q.identity(), _s3.set(lp.size * 7, 1, lp.size * 7)); glow.setMatrixAt(i, _m4); glow.setColorAt(i, _c.set('#000000')); });
  glow.renderOrder = 3; R.scene.add(glow); R.lampGlow = glow;
}
function arrowGeo() {
  const s = new THREE.Shape(); s.moveTo(0, 1.5); s.lineTo(1.05, 0.15); s.lineTo(0.45, 0.15); s.lineTo(0.45, -1.2); s.lineTo(-0.45, -1.2); s.lineTo(-0.45, 0.15); s.lineTo(-1.05, 0.15); s.closePath();
  const g = new THREE.ShapeGeometry(s); g.rotateZ(-Math.PI / 2); return g;
}
function starGeo() {
  const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const a = i / 10 * TAU + Math.PI / 2, r = i % 2 ? 0.45 : 1.05; if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
  s.closePath(); return new THREE.ShapeGeometry(s);
}
function updateLamps(W) {
  if (!R.lampSets) return;
  const L = TABLE.lamps, V = W.lampV;
  for (let s = 0; s < R.lampSets.length; s++) {
    const set = R.lampSets[s];
    for (let k = 0; k < set.list.length; k++) { const li = set.list[k], v = V[li]; _c.copy(R.lampCol[li]).multiplyScalar(0.12 + v * 2.2); set.mesh.setColorAt(k, _c); }
    if (set.mesh.instanceColor) set.mesh.instanceColor.needsUpdate = true;
  }
  if (R.lampGlow && R.lampGlow.visible) {
    for (let i = 0; i < L.length; i++) { _c.copy(R.lampCol[i]).multiplyScalar(V[i] * V[i] * 0.55); R.lampGlow.setColorAt(i, _c); }
    if (R.lampGlow.instanceColor) R.lampGlow.instanceColor.needsUpdate = true;
  }
}

/* ------------------------------------------------------------ balls */
function buildBalls() {
  R.ballMat = new THREE.MeshStandardMaterial({ color: '#f4f6fb', metalness: 1.0, roughness: 0.07 });
  // a painted chrome sphere for the cheap tier: fairground lights in a dark room
  R.matcap = canvasTex(128, 128, (g, w, h) => {
    const bg = g.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, w * 0.5); bg.addColorStop(0, '#d8d8e4'); bg.addColorStop(0.7, '#6a6478'); bg.addColorStop(0.95, '#2a2030'); bg.addColorStop(1, '#120a14');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const spot = (x, y, r, c) => { const s2 = g.createRadialGradient(x, y, 0, x, y, r); s2.addColorStop(0, c); s2.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = s2; g.fillRect(x - r, y - r, r * 2, r * 2); };
    spot(w * 0.36, h * 0.3, 22, 'rgba(255,250,235,1)'); spot(w * 0.72, h * 0.62, 18, 'rgba(255,79,160,0.8)'); spot(w * 0.25, h * 0.7, 16, 'rgba(47,224,200,0.7)'); spot(w * 0.62, h * 0.2, 12, 'rgba(255,190,90,0.9)');
  });
  const bm = new THREE.InstancedMesh(new THREE.SphereGeometry(BR, 32, 20), R.ballMat, 4);
  bm.castShadow = true; bm.layers.enable(1); bm.frustumCulled = false; bm.count = 0;
  R.scene.add(bm); R.balls = bm;
  // a contact shadow under each ball, for the tiers without shadow maps detail
  const ao = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.85)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
  const aog = new THREE.PlaneGeometry(1, 1); aog.rotateX(-Math.PI / 2);
  R.aoMesh = new THREE.InstancedMesh(aog, new THREE.MeshBasicMaterial({ map: ao, transparent: true, depthWrite: false, opacity: 0.7 }), 4);
  R.aoMesh.renderOrder = 1; R.aoMesh.frustumCulled = false; R.aoMesh.count = 0; R.scene.add(R.aoMesh);
  const hg = new THREE.PlaneGeometry(1, 1); hg.rotateX(-Math.PI / 2);
  R.halo = new THREE.InstancedMesh(hg, new THREE.MeshBasicMaterial({ map: R.glowTex, color: '#ffe9c8', transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }), 4);
  R.halo.renderOrder = 3; R.halo.frustumCulled = false; R.halo.count = 0; R.scene.add(R.halo);
  // the plunger rod and its spring
  const pl = new THREE.Group(); pl.position.set(WX(23.65), 1.35, WZ(4.25));
  const coil = []; for (let i = 0; i < 9; i++) coil.push(prep(new THREE.TorusGeometry(0.7, 0.1, 5, 14), '#c8ccd6', [0, 0, 0.4 + i * 0.36]));
  const rod = new THREE.Mesh(mergeG([cylG(0.6, 0.6, 0.5, 12, '#f0f0f4', [0, 0, 0.25], [Math.PI / 2, 0, 0]), cylG(0.28, 0.28, 13, 8, '#d0d4dc', [0, 0, 6.8], [Math.PI / 2, 0, 0]), cylG(1.0, 1.0, 1.6, 16, '#e8243f', [0, 0, 14.0], [Math.PI / 2, 0, 0])].concat(coil)), M().chrome);
  rod.castShadow = true; pl.add(rod); R.scene.add(pl); R.plunger = rod;
}
const _bp = new THREE.Vector3();
function updateBalls(W) {
  if (!R.balls) return;
  let n = 0;
  const a = W.alpha;
  for (let i = 0; i < W.balls.length; i++) {
    const b = W.balls[i]; if (!b.on) continue;
    const x = lerp(b.px, b.x, a), y = lerp(b.py, b.y, a), z = lerp(b.pz, b.z, a);
    let sink = 0;
    if (b.st === 'scoop') sink = -Math.min(1.4, b.hold * 6);
    _m4.makeTranslation(WX(x), BR + z + sink, WZ(y));
    R.balls.setMatrixAt(n, _m4);
    _m4.compose(_p3.set(WX(x) + 0.5, 0.05 + (z > 0.3 ? z - 0.2 : 0), WZ(y) - 0.3), _q.identity(), _s3.set(4.6, 1, 4.6));
    R.aoMesh.setMatrixAt(n, _m4);
    _m4.compose(_p3.set(WX(x), 0.08 + z, WZ(y)), _q.identity(), _s3.set(7.5, 1, 7.5)); R.halo.setMatrixAt(n, _m4);
    n++;
  }
  R.balls.count = n; R.aoMesh.count = n; R.halo.count = n;
  R.balls.instanceMatrix.needsUpdate = true; R.aoMesh.instanceMatrix.needsUpdate = true; R.halo.instanceMatrix.needsUpdate = true;
  if (R.plunger) { const p = lerp(W.plunger.ppull, W.plunger.pull, a); R.plunger.position.z = p * 2.8 + (W.plunger.fireT > 0 ? -0.6 * (W.plunger.fireT / 0.12) : 0); }
}

/* ------------------------------------------------------------ toys */
function buildFerris() {
  const m = M();
  // behind the top left corner, geared to the spinner
  const grp = new THREE.Group(); grp.position.set(WX(-15.5), 0, WZ(103.8));
  const Rw = 7.2, cz = Rw + 1.6;
  const frame = [];
  [-1.1, 1.1].forEach((zz) => {
    frame.push(cylG(0.28, 0.32, Math.hypot(Rw * 0.62, cz) + 0.5, 6, '#c8ccd8', [-Rw * 0.31, cz / 2, zz], [0, 0, -Math.atan2(Rw * 0.62, cz)]));
    frame.push(cylG(0.28, 0.32, Math.hypot(Rw * 0.62, cz) + 0.5, 6, '#c8ccd8', [Rw * 0.31, cz / 2, zz], [0, 0, Math.atan2(Rw * 0.62, cz)]));
  });
  frame.push(cylG(0.35, 0.35, 2.6, 8, '#d8dce4', [0, cz, 0], [Math.PI / 2, 0, 0]));
  frame.push(boxG(Rw * 1.6, 0.5, 4, '#3a1c38', [0, 0.25, 0]));
  grp.add(new THREE.Mesh(mergeG(frame), m.chrome));
  const wheel = new THREE.Group(); wheel.position.y = cz; grp.add(wheel);
  const wp = [];
  [-0.7, 0.7].forEach((zz) => { wp.push(torG(Rw, 0.16, '#f2f2f6', [0, 0, zz])); wp.push(torG(Rw * 0.55, 0.1, '#f2f2f6', [0, 0, zz])); });
  for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; [-0.7, 0.7].forEach((zz) => wp.push(cylG(0.07, 0.07, Rw, 4, '#e8e8f0', [Math.cos(a) * Rw / 2, Math.sin(a) * Rw / 2, zz], [0, 0, a - Math.PI / 2]))); }
  wheel.add(new THREE.Mesh(mergeG(wp), m.chrome));
  // bulbs on the rim
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.28, 8, 6), R.lampMat || new THREE.MeshBasicMaterial({ toneMapped: false }), 32);
  for (let i = 0; i < 32; i++) { const a = i / 32 * TAU; _m4.makeTranslation(Math.cos(a) * Rw, Math.sin(a) * Rw, i % 2 ? 0.7 : -0.7); bulbs.setMatrixAt(i, _m4); bulbs.setColorAt(i, _c.set('#ffd36a')); }
  wheel.add(bulbs);
  // gondolas, kept upright as the wheel turns
  const gond = new THREE.InstancedMesh(mergeG([boxG(1.5, 1.1, 1.3, '#ff4fa0', [0, -0.8, 0]), coneG(1.0, 0.6, 4, '#ffb02e', [0, 0.0, 0], [0, Math.PI / 4, 0])]), m.vcGloss, 8);
  for (let i = 0; i < 8; i++) gond.setColorAt(i, _c.set(['#ff4fa0', '#ffb02e', '#2fe0c8', '#8a6bff'][i % 4]));
  wheel.add(gond); grp.add(gond);
  wheel.remove(gond);
  gond.position.y = cz;
  [wheel, grp].forEach((x) => x.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.layers.enable(1); } }));
  R.scene.add(grp);
  R.ferris = { wheel, bulbs, gond, Rw, a: 0 };
}
function buildCarousel() {
  const m = M();
  const grp = new THREE.Group(); grp.position.set(WX(17.6), 0, WZ(103.6));
  const parts = [];
  parts.push(cylG(4.3, 4.5, 0.8, 28, '#5a2448', [0, 0.4, 0]));
  parts.push(cylG(0.35, 0.35, 7, 8, '#ffd36a', [0, 4.2, 0]));
  const canopy = new THREE.ConeGeometry(4.8, 2.6, 16, 1, true);
  const cc = prep(canopy, '#ffffff', [0, 8.2, 0]);
  const cols = cc.attributes.color, cp = cc.attributes.position;
  for (let i = 0; i < cp.count; i++) { const a = Math.atan2(cp.getZ(i), cp.getX(i)); const k = Math.floor((a + Math.PI) / TAU * 16) % 2; _c.set(k ? '#ff4fa0' : '#fff2e0'); cols.setXYZ(i, _c.r, _c.g, _c.b); }
  parts.push(cc);
  parts.push(cylG(4.9, 4.9, 0.45, 16, '#ffb02e', [0, 6.8, 0]));
  parts.push(sphG(0.6, '#ffd36a', [0, 9.7, 0]));
  const spin = new THREE.Group(); spin.add(new THREE.Mesh(mergeG(parts), m.vcGloss));
  // horses on poles that bob up and down
  const horse = mergeG([boxG(0.6, 0.8, 1.9, '#fff6ea', [0, 0, 0]), boxG(0.5, 1.1, 0.6, '#fff6ea', [0, 0.7, 0.85], [-0.4, 0, 0]), boxG(0.62, 0.3, 1.2, '#ff4fa0', [0, 0.45, -0.1]), cylG(0.12, 0.12, 6.2, 5, '#ffd36a', [0, 1.2, 0])]);
  const horses = new THREE.InstancedMesh(horse, m.vcGloss, 6);
  spin.add(horses);
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 5), R.lampMat || new THREE.MeshBasicMaterial({ toneMapped: false }), 24);
  for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; _m4.makeTranslation(Math.cos(a) * 4.9, 6.8, Math.sin(a) * 4.9); bulbs.setMatrixAt(i, _m4); bulbs.setColorAt(i, _c.set('#ffe8a0')); }
  spin.add(bulbs);
  grp.add(spin);
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.layers.enable(1); } });
  R.scene.add(grp);
  R.carousel = { spin, horses, bulbs, a: 0, w: 0.3 };
}
function buildJuggler() {
  const m = M();
  const grp = new THREE.Group(); grp.position.set(WX(1.0), 0, WZ(104.6));
  const body = [];
  body.push(cylG(3.0, 3.3, 1.4, 20, '#ffb02e', [0, 0.7, 0]));
  body.push(cylG(0.55, 0.55, 2.2, 8, '#2a1840', [-0.5, 2.5, 0])); body.push(cylG(0.55, 0.55, 2.2, 8, '#2a1840', [0.5, 2.5, 0]));
  body.push(cylG(1.2, 1.5, 3.0, 12, '#e8243f', [0, 5.0, 0]));
  body.push(cylG(1.6, 1.6, 0.4, 12, '#ffd36a', [0, 3.6, 0]));
  body.push(sphG(0.95, '#c88a5a', [0, 7.25, 0]));
  body.push(sphG(1.15, '#ffb02e', [0, 8.0, 0], [1, 0.6, 1]));
  body.push(sphG(0.3, '#ff4fa0', [0, 8.45, 0.9]));
  const torso = new THREE.Mesh(mergeG(body), m.vcGloss);
  const armL = new THREE.Group(), armR = new THREE.Group();
  armL.position.set(-1.3, 6.1, 0); armR.position.set(1.3, 6.1, 0);
  const armG = mergeG([cylG(0.32, 0.28, 2.4, 6, '#e8243f', [0, -1.0, 0]), sphG(0.38, '#c88a5a', [0, -2.2, 0])]);
  armL.add(new THREE.Mesh(armG, m.vcGloss)); armR.add(new THREE.Mesh(armG, m.vcGloss));
  grp.add(torso, armL, armR);
  const orbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.55, 12, 8), R.lampMat || new THREE.MeshBasicMaterial({ toneMapped: false }), 3);
  for (let i = 0; i < 3; i++) orbs.setColorAt(i, _c.set(['#ff4fa0', '#ffd36a', '#2fe0c8'][i]).multiplyScalar(2));
  grp.add(orbs);
  grp.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.layers.enable(1); } });
  R.scene.add(grp);
  R.jug = { armL, armR, orbs, grp, speed: 1, t: 0 };
}

/* ------------------------------------------------------------ backbox and DMD */
function paintBackglass() {
  // backglass art: the title, a ferris wheel and the lights of the fair
  R.backArt = canvasTex(1024, 512, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#190a35'); bg.addColorStop(1, '#4a0f3a'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    const r = rngf(5);
    for (let i = 0; i < 260; i++) { g.fillStyle = 'rgba(255,240,220,' + (0.2 + r() * 0.6) + ')'; const s = r() * 2 + 0.5; g.fillRect(r() * w, r() * h * 0.6, s, s); }
    // ferris wheel silhouette with bulbs
    const cx = w * 0.82, cy = h * 0.52, rr = h * 0.36;
    g.strokeStyle = 'rgba(255,210,140,0.55)'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.stroke();
    for (let i = 0; i < 16; i++) { const a = i / 16 * TAU; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); g.stroke(); g.fillStyle = ['#ff4fa0', '#ffd36a', '#2fe0c8'][i % 3]; g.beginPath(); g.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 6, 0, TAU); g.fill(); }
    // tents
    for (let i = 0; i < 6; i++) { const x0 = i * w / 6 - 20, ww = w / 6 + 40; g.fillStyle = i % 2 ? '#3a1250' : '#2c0f3e'; g.beginPath(); g.moveTo(x0, h); g.lineTo(x0 + ww / 2, h * 0.68); g.lineTo(x0 + ww, h); g.fill(); g.fillStyle = 'rgba(255,79,160,0.35)'; for (let k = 0; k < 6; k++) { g.beginPath(); g.moveTo(x0 + ww / 2, h * 0.68); g.lineTo(x0 + ww * (k / 6), h); g.lineTo(x0 + ww * ((k + 0.5) / 6), h); g.fill(); } }
    // title in lit letters
    g.save(); g.translate(w * 0.4, h * 0.38);
    g.font = '900 150px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 16; g.strokeStyle = '#3a0820'; g.strokeText('MELA', 0, 0);
    const tg = g.createLinearGradient(0, -70, 0, 70); tg.addColorStop(0, '#fff3b8'); tg.addColorStop(0.5, '#ffb02e'); tg.addColorStop(1, '#ff4f2a');
    g.fillStyle = tg; g.fillText('MELA', 0, 0);
    g.font = '800 64px system-ui, Arial, sans-serif'; g.fillStyle = '#ffd9f0'; g.lineWidth = 8; g.strokeText('PINBALL', 0, 104); g.fillText('PINBALL', 0, 104);
    g.restore();
    for (let i = 0; i < 26; i++) { const x = 60 + i * 30; g.fillStyle = i % 2 ? '#ffd36a' : '#ff4fa0'; g.beginPath(); g.arc(x, 22, 6, 0, TAU); g.fill(); }
  });
  R.renderer.initTexture(R.backArt);
}
function buildBackbox() {
  const m = M();
  const grp = new THREE.Group();
  // stands behind the table, leaning back a little toward the player's eye
  grp.position.set(1.4, 13, WZ(112)); grp.rotation.x = -0.12;
  const W = 58, Hh = 36;
  const box = [];
  box.push(boxG(W + 2, Hh + 2, 6, '#2a1424', [0, Hh / 2, -3.2]));
  box.push(boxG(W + 2.4, 1.0, 6.4, '#e8c27a', [0, Hh + 1.0, -3.2]));
  box.push(boxG(W + 2.4, 0.8, 6.4, '#e8c27a', [0, -0.4, -3.2]));
  grp.add(new THREE.Mesh(mergeG(box), m.wood));
  const art = R.backArt;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh * 0.62), new THREE.MeshBasicMaterial({ map: art, toneMapped: false, color: '#c8c8c8' }));
  glass.position.set(0, Hh * 0.66, 0.05);
  // the dot matrix display: one byte a dot from core.js, drawn as round lit dots by a small shader
  const dtex = new THREE.DataTexture(DMD.buf, DMD.w, DMD.h, THREE.RedFormat, THREE.UnsignedByteType);
  dtex.magFilter = THREE.NearestFilter; dtex.minFilter = THREE.NearestFilter; dtex.generateMipmaps = false; dtex.needsUpdate = true;
  R.dmdTex = dtex;
  R.dmdMat = new THREE.ShaderMaterial({
    toneMapped: false,
    uniforms: { tD: { value: dtex }, uRes: { value: new THREE.Vector2(DMD.w, DMD.h) }, uCol: { value: new THREE.Color('#ff9a2a') }, uGain: { value: 1.6 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform sampler2D tD; uniform vec2 uRes; uniform vec3 uCol; uniform float uGain; varying vec2 vUv; void main(){ vec2 cell = vUv * uRes; vec2 c = (floor(cell) + 0.5) / uRes; float v = texture2D(tD, vec2(c.x, 1.0 - c.y)).r; float d = length(fract(cell) - 0.5); float dotm = smoothstep(0.47, 0.33, d); vec3 off = vec3(0.09, 0.035, 0.02); vec3 col = mix(off, uCol * uGain, v) * dotm; gl_FragColor = vec4(col, 1.0); }',
  });
  const dmdW = W * 0.82, dmdH = dmdW / 4;
  const dmd = new THREE.Mesh(new THREE.PlaneGeometry(dmdW, dmdH), R.dmdMat);
  dmd.position.set(0, dmdH / 2 + 1.6, 0.08);
  const bezel = new THREE.Mesh(mergeG([boxG(dmdW + 1.6, dmdH + 1.6, 0.6, '#0c0a10', [0, dmdH / 2 + 1.6, -0.25])]), m.vc);
  // flasher domes on the top corners and a row of lanterns along the top
  const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(1.4, 16, 10, 0, TAU, 0, Math.PI / 2), R.lampMat || new THREE.MeshBasicMaterial({ toneMapped: false }), 2);
  [[-W / 2 + 2, Hh + 1.5], [W / 2 - 2, Hh + 1.5]].forEach((p, i) => { _m4.makeTranslation(p[0], p[1], -1.5); fl.setMatrixAt(i, _m4); fl.setColorAt(i, _c.set(i ? '#2fe0c8' : '#ff4fa0')); });
  const lant = new THREE.InstancedMesh(mergeG([sphG(1.1, '#ffffff', [0, 0, 0], [1, 1.25, 1], 12, 8), cylG(0.6, 0.6, 0.35, 8, '#ffffff', [0, 1.45, 0]), cylG(0.6, 0.6, 0.35, 8, '#ffffff', [0, -1.45, 0])]), R.lampMat || new THREE.MeshBasicMaterial({ toneMapped: false }), 7);
  for (let i = 0; i < 7; i++) { _m4.makeTranslation(-W / 2 + 5 + i * (W - 10) / 6, Hh + 5 + (i % 2) * 1.2, -1.8); lant.setMatrixAt(i, _m4); lant.setColorAt(i, _c.set(['#ff4fa0', '#ffb02e', '#2fe0c8', '#ff6a2a', '#8a6bff', '#ffd36a', '#ff4fa0'][i]).multiplyScalar(1.3)); }
  const wire = new THREE.Mesh(mergeG([cylG(0.06, 0.06, W, 4, '#d0d0d8', [0, Hh + 6.6, -1.8], [0, 0, Math.PI / 2])]), m.chrome);
  grp.add(glass, bezel, dmd, fl, lant, wire);
  R.scene.add(grp);
  R.backbox = { grp, fl, lant, dmd };
}
function buildCabinet() {
  const m = M();
  const parts = [];
  // side rails, the lockdown bar, the apron with its instruction cards
  parts.push(boxG(3.4, 4.8, 114, '#3d1a36', [WX(-25.1), 1.8, WZ(48)]));
  parts.push(boxG(3.4, 4.8, 114, '#3d1a36', [WX(27.6), 1.8, WZ(48)]));
  parts.push(boxG(3.6, 0.45, 114, '#e8c27a', [WX(-25.1), 4.4, WZ(48)]));
  parts.push(boxG(3.6, 0.45, 114, '#e8c27a', [WX(27.6), 4.4, WZ(48)]));
  parts.push(boxG(56, 3.0, 4, '#3d1a36', [1.2, 1.4, WZ(-8)]));
  parts.push(boxG(55, 2.6, 6, '#3d1a36', [1.2, 1.2, WZ(105.5)]));
  R.scene.add(new THREE.Mesh(mergeG(parts), m.wood));
  const bar = new THREE.Mesh(mergeG([boxG(55, 1.0, 2.4, '#e6e8ee', [1.2, 3.4, WZ(-8.5)])]), m.chrome);
  R.scene.add(bar);
  const apronTex = canvasTex(512, 160, (g, w, h) => {
    const bg = g.createLinearGradient(0, 0, 0, h); bg.addColorStop(0, '#5a1450'); bg.addColorStop(1, '#2a0a30'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd36a'; g.font = '800 26px system-ui, Arial'; g.textAlign = 'center'; g.fillText('MELA PINBALL', w / 2, 40);
    g.fillStyle = '#f7e6ff'; g.font = '600 15px system-ui, Arial';
    ['Lanterns light the carousel modes', 'Three juggler ramps light multiball', 'Ramp and orbit for jackpots'].forEach((s, i) => g.fillText(s, w / 2, 76 + i * 24));
    g.strokeStyle = '#ffb02e'; g.lineWidth = 4; g.strokeRect(6, 6, w - 12, h - 12);
  });
  // the apron covers the bottom of the table below the flippers' pivots, either side of the drain
  const apronShape = new THREE.Shape();
  apronShape.moveTo(-22.2, 6.0); apronShape.lineTo(-9.6, 6.0); apronShape.lineTo(-6.5, 1.2); apronShape.lineTo(6.5, 1.2); apronShape.lineTo(9.6, 6.0); apronShape.lineTo(22.0, 6.0); apronShape.lineTo(22.0, -6.5); apronShape.lineTo(-22.2, -6.5); apronShape.closePath();
  const ag = new THREE.ExtrudeGeometry(apronShape, { depth: 0.6, bevelEnabled: false });
  ag.rotateX(-Math.PI / 2); ag.translate(0, 0.9, OZ);
  const auv = ag.attributes.uv, apos = ag.attributes.position;
  for (let i = 0; i < apos.count; i++) auv.setXY(i, (apos.getX(i) + 22.2) / 44.2, (OZ - apos.getZ(i) + 6.5) / 12.5);
  const apron = new THREE.Mesh(ag, new THREE.MeshStandardMaterial({ map: apronTex, roughness: 0.4 }));
  apron.receiveShadow = true; R.scene.add(apron);
  // string lights along both side rails, chasing in attract and on big moments
  const n = 48;
  const bulbs = new THREE.InstancedMesh(new THREE.SphereGeometry(0.42, 8, 6), R.lampMat || new THREE.MeshBasicMaterial({ toneMapped: false }), n);
  for (let i = 0; i < n; i++) { const side = i < n / 2 ? -1 : 1, k = (i % (n / 2)) / (n / 2 - 1); _m4.makeTranslation(side < 0 ? WX(-25.1) : WX(27.6), 4.9, WZ(-6 + k * 108)); bulbs.setMatrixAt(i, _m4); bulbs.setColorAt(i, _c.set('#ffd36a')); }
  R.scene.add(bulbs); R.railBulbs = bulbs;
}
function buildBackdrop() {
  // the fair beyond the cabinet: tents, a distant wheel and out of focus lights
  const tex = canvasTex(1024, 384, (g, w, h) => {
    g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, w, h);
    const r = rngf(9);
    for (let i = 0; i < 160; i++) { const x = r() * w, y = h * (0.15 + r() * 0.55), s = 3 + r() * 16; const col = ['255,180,80', '255,90,170', '80,230,210', '160,120,255', '255,220,140'][i % 5]; const gr = g.createRadialGradient(x, y, 0, x, y, s); gr.addColorStop(0, 'rgba(' + col + ',0.55)'); gr.addColorStop(1, 'rgba(' + col + ',0)'); g.fillStyle = gr; g.fillRect(x - s, y - s, s * 2, s * 2); }
    g.fillStyle = '#07040c';
    for (let i = 0; i < 9; i++) { const x0 = i * w / 9 - 30, ww = w / 9 + 60, top = h * (0.55 + r() * 0.15); g.beginPath(); g.moveTo(x0, h); g.lineTo(x0 + ww / 2, top); g.lineTo(x0 + ww, h); g.fill(); }
    g.strokeStyle = 'rgba(255,200,120,0.3)'; g.lineWidth = 2; g.beginPath(); g.arc(w * 0.2, h * 0.45, h * 0.3, 0, TAU); g.stroke();
  });
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false });
  const geo = new THREE.CylinderGeometry(380, 380, 220, 40, 1, true, Math.PI * 0.55, Math.PI * 0.9);
  const mesh = new THREE.Mesh(geo, mat); mesh.material.side = THREE.BackSide; mesh.position.set(0, 60, 0);
  R.scene.add(mesh);
  // floor
  const fl = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshStandardMaterial({ color: '#120a14', roughness: 0.9 }));
  fl.rotation.x = -Math.PI / 2; fl.position.y = -60; R.scene.add(fl);
}
function buildEnv() {
  // a small room of coloured fair lights, blurred into the reflections of every chrome part
  const es = new THREE.Scene();
  // the room: a warm ceiling of lamps above a dim plum floor, so chrome reads as polished silver
  const roomMat = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: {}, vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }', fragmentShader: 'varying vec3 vP; void main(){ float y = vP.y; vec3 c = mix(vec3(0.16,0.08,0.16), vec3(0.62,0.55,0.66), smoothstep(-0.2, 0.7, y)); gl_FragColor = vec4(c, 1.0); }' });
  const room = new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), roomMat);
  es.add(room);
  const panel = (col, x, y, z, w, h, k) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k || 3), side: THREE.DoubleSide })); p.position.set(x, y, z); p.lookAt(0, 0, 0); es.add(p); };
  panel('#fff1dc', 0, 46, 0, 46, 30, 4);
  panel('#ffe2b8', 0, 30, 30, 34, 10, 3);
  panel('#ff4fa0', -40, 12, -10, 14, 22, 3);
  panel('#2fe0c8', 40, 10, -15, 14, 20, 3);
  panel('#ffb02e', 0, 14, -42, 40, 10, 3.5);
  panel('#8a6bff', -15, 8, 40, 20, 8, 2);
  panel('#ffd36a', 25, 25, 30, 12, 6, 4);
  const pm = new THREE.PMREMGenerator(R.renderer);
  const env = pm.fromScene(es, 0.03, 0.1, 100).texture;
  pm.dispose();
  R.env = env; R.scene.environment = TIERS[Math.max(0, R.quality)].cheap ? null : env;
  R.scene.environmentIntensity = 0.9;
  es.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
}

/* ------------------------------------------------------------ particles */
const PN = 640;
function buildParticles() {
  const geo = new THREE.BufferGeometry();
  const P = { pos: new Float32Array(PN * 3), col: new Float32Array(PN * 3), size: new Float32Array(PN), vel: new Float32Array(PN * 3), life: new Float32Array(PN), max: new Float32Array(PN), kind: new Uint8Array(PN), base: new Float32Array(PN * 3), head: 0 };
  geo.setAttribute('position', new THREE.BufferAttribute(P.pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(P.col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(P.size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 400);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uScale: { value: 400 } },
    vertexShader: 'attribute float size; attribute vec3 color; varying vec3 vC; uniform float uScale; void main(){ vC = color; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uScale / -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(vC * a, 1.0); }',
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 4;
  R.scene.add(pts);
  R.P = P; R.pts = pts; R.ptsMat = mat;
}
function emit(x, y, z, vx, vy, vz, life, size, hex, kind) {
  const P = R.P; if (!P) return;
  const i = P.head; P.head = (P.head + 1) % PN;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.life[i] = life; P.max[i] = life; P.size[i] = size; P.kind[i] = kind || 0;
  const cc = colorOf(hex); P.base[i * 3] = cc.r; P.base[i * 3 + 1] = cc.g; P.base[i * 3 + 2] = cc.b;
}
const SPARK = ['#fff3c0', '#ffb02e', '#ff6a2a'];
const CCACHE = new Map();
function colorOf(hex) { let c = CCACHE.get(hex); if (!c) { c = new THREE.Color(hex); CCACHE.set(hex, c); } return c; }
function burst(tx, ty, n, speed, cols, kind, up) {
  if (!R.P) return;
  const k = TIERS[Math.max(0, R.quality)].parts;
  n = Math.max(1, Math.round(n * k));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = speed * (0.35 + Math.random() * 0.8);
    emit(WX(tx), 1.4, WZ(ty), Math.cos(a) * s, (up || 0.4) * s * (0.5 + Math.random()), Math.sin(a) * s, kind === 1 ? 2.2 + Math.random() : 0.35 + Math.random() * 0.35, kind === 1 ? 0.9 : 0.5 + Math.random() * 0.4, cols[i % cols.length], kind);
  }
}
function updateParticles(dt) {
  const P = R.P; if (!P) return;
  for (let i = 0; i < PN; i++) {
    if (P.life[i] <= 0) { if (P.size[i] !== 0) { P.size[i] = 0; } continue; }
    P.life[i] -= dt;
    const k = Math.max(0, P.life[i] / P.max[i]);
    const conf = P.kind[i] === 1;
    P.vel[i * 3 + 1] -= (conf ? 18 : 60) * dt;
    if (conf) { P.vel[i * 3] *= 1 - dt * 1.5; P.vel[i * 3 + 2] *= 1 - dt * 1.5; P.vel[i * 3 + 1] = Math.max(P.vel[i * 3 + 1], -14); }
    P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
    if (P.pos[i * 3 + 1] < 0.2) { P.pos[i * 3 + 1] = 0.2; P.vel[i * 3 + 1] *= -0.3; P.vel[i * 3] *= 0.6; P.vel[i * 3 + 2] *= 0.6; }
    const f = conf ? (0.6 + 0.4 * Math.sin(P.life[i] * 18 + i)) * Math.min(1, k * 3) : k * k;
    P.col[i * 3] = P.base[i * 3] * f * 2; P.col[i * 3 + 1] = P.base[i * 3 + 1] * f * 2; P.col[i * 3 + 2] = P.base[i * 3 + 2] * f * 2;
    if (P.life[i] <= 0) P.size[i] = 0;
  }
  const g = R.pts.geometry;
  g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true; g.attributes.size.needsUpdate = true;
}

/* ------------------------------------------------------------ reflection */
function buildReflection() {
  R.reflCam = new THREE.PerspectiveCamera();
  R.reflCam.layers.set(1);
  R.reflRT = null;
}
const _rp = new THREE.Vector3(), _rt = new THREE.Vector3(), _ru = new THREE.Vector3(), _bias = new THREE.Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
function renderReflection() {
  const t = TIERS[Math.max(0, R.quality)];
  if (!t.refl || !R.reflCam || !R.reflU) { if (R.reflU) R.reflU.uReflStr.value = 0; return; }
  const r = R.renderer, cam = R.camera;
  const w = Math.max(16, Math.round(r.domElement.width * t.refl)), h = Math.max(16, Math.round(r.domElement.height * t.refl));
  if (!R.reflRT || R.reflRT.width !== w || R.reflRT.height !== h) {
    if (R.reflRT) R.reflRT.dispose();
    R.reflRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: true });
    R.reflU.tRefl.value = R.reflRT.texture; R.reflU.uReflTx.value.set(1.6 / w, 1.6 / h);
  }
  // mirror the camera in the playfield plane
  const rc = R.reflCam;
  cam.getWorldDirection(_rt).add(cam.position);
  _rp.copy(cam.position); _rp.y = -_rp.y; _rt.y = -_rt.y;
  _ru.set(0, 1, 0).applyQuaternion(cam.quaternion); _ru.y = -_ru.y;
  rc.position.copy(_rp); rc.up.copy(_ru); rc.lookAt(_rt);
  rc.fov = cam.fov; rc.aspect = cam.aspect; rc.near = cam.near; rc.far = cam.far; rc.updateProjectionMatrix(); rc.updateMatrixWorld();
  R.reflU.uReflMat.value.copy(_bias).multiply(rc.projectionMatrix).multiply(rc.matrixWorldInverse);
  R.pf.visible = false;
  const fog = R.scene.fog, bg = R.scene.background; R.scene.fog = null; R.scene.background = null;
  const sky = R.sky.visible; R.sky.visible = false;
  const au = r.shadowMap.autoUpdate; r.shadowMap.autoUpdate = false;
  r.setRenderTarget(R.reflRT); r.setClearColor(0x000000, 1); r.clear(); r.render(R.scene, rc); r.setRenderTarget(null);
  r.shadowMap.autoUpdate = au;
  R.scene.fog = fog; R.scene.background = bg; R.sky.visible = sky; R.pf.visible = true;
  R.reflU.uReflStr.value = 0.32;
}

/* ------------------------------------------------------------ quality */
function precompileOther() {
  const cheapNow = TIERS[Math.max(0, R.quality)].cheap;
  setLook(!cheapNow); swapMaterials(!cheapNow);
  try { R.renderer.compile(R.scene, R.camera); } catch (e) { /* lost */ }
  setLook(cheapNow); swapMaterials(cheapNow);
}
function setLook(cheap) {
  const r = R;
  r.renderer.shadowMap.enabled = !cheap; r.key.castShadow = !cheap;
  r.scene.environment = cheap ? null : r.env || null;
  if (r.aoMesh) r.aoMesh.material.opacity = cheap ? 0.8 : 0.45;
}
function applyTier() {
  const r = R, t = TIERS[Math.max(0, r.quality)];
  const a = ARC;
  if (!t.cheap && !r.env && !r.jobs.length) { try { buildEnv(); } catch (e) { /* no env */ } }
  if (a) { r.renderer.setPixelRatio(pixelRatio(a, t)); r.renderer.setSize(a.w, a.h, false); }
  setLook(t.cheap); swapMaterials(t.cheap);
  const ms = t.shadow;
  if (r.key.shadow.mapSize.x !== ms) { r.key.shadow.mapSize.set(ms, ms); if (r.key.shadow.map) { r.key.shadow.map.dispose(); r.key.shadow.map = null; } }
  if (r.lampGlow) r.lampGlow.visible = !!t.glow;
  if (FX) FX.setQuality(t.fx, r.lockQ);
  if (r.reflU && !t.refl) r.reflU.uReflStr.value = 0;
}
function setQuality(q) { if (!R) return; q = clamp(q | 0, 0, 3); if (q === R.quality) return; R.quality = q; applyTier(); }
function measureFps(dt) {
  const r = R;
  if (!r.ready) return;
  if (r.qWarm < 20) { r.qWarm++; return; }
  r.qT += dt; r.qN++;
  if (r.qT >= 1.5) {
    r.fps = r.qN / r.qT; r.qT = 0; r.qN = 0;
    if (!r.lockQ) {
      if (r.fps < 40 && r.quality > 0) { setQuality(r.fps < 22 ? 0 : r.quality - 1); r.qWarm = 0; r.upT = 0; }
      else if (r.fps > 57 && r.quality < 3 && !r.soft) { r.upT += 1; if (r.upT >= 4) { setQuality(r.quality + 1); r.upT = 0; r.qWarm = 0; } }
    }
  }
}

/* ------------------------------------------------------------ camera */
const CAM = { pos: new THREE.Vector3(), look: new THREE.Vector3(), tmp: new THREE.Vector3(), q0: new THREE.Quaternion(), q1: new THREE.Quaternion(), m: new THREE.Matrix4() };
// The full table shot is fitted once per screen size: a binary search on distance and on where the
// camera aims, so the table (and in portrait the backbox) fills the frame with even margins.
const FIT_TABLE = [[-24.5, -8.5, 0], [27.5, -8.5, 0], [-24.5, 101, 3], [27.5, 101, 3], [-24.5, 46, 0], [27.5, 46, 0]];
const FIT_BOX = [[-27, 112, 50], [30, 112, 50]];
const SHOT = { key: '', pos: new THREE.Vector3(), look: new THREE.Vector3(), dist: 100, pitch: 0.9 };
function fitShot(a, portrait) {
  const cam = R.camera;
  const pitch = portrait ? 0.98 : 0.66, fov = portrait ? 44 : 34;
  cam.fov = fov; cam.aspect = a.w / a.h; cam.updateProjectionMatrix();
  const pts = portrait ? FIT_TABLE.concat(FIT_BOX) : FIT_TABLE;
  const dir = CAM.tmp.set(0, Math.sin(pitch), Math.cos(pitch));
  const top = portrait ? 0.9 : 0.94, bot = portrait ? -0.97 : -0.96, side = portrait ? 0.985 : 0.97;
  let lookZ = WZ(50), d = 120;
  const bounds = (lz, dist, out) => {
    CAM.look.set(1.4, 0, lz); cam.position.copy(CAM.look).addScaledVector(dir, dist); cam.lookAt(CAM.look); cam.updateMatrixWorld();
    let x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (let k = 0; k < pts.length; k++) { _v1.set(WX(pts[k][0]), pts[k][2], WZ(pts[k][1])).project(cam); if (_v1.x < x0) x0 = _v1.x; if (_v1.x > x1) x1 = _v1.x; if (_v1.y < y0) y0 = _v1.y; if (_v1.y > y1) y1 = _v1.y; }
    out[0] = x0; out[1] = x1; out[2] = y0; out[3] = y1;
  };
  const b = [0, 0, 0, 0];
  for (let pass = 0; pass < 4; pass++) {
    let lo = 20, hi = 500;
    for (let it = 0; it < 20; it++) { const m = (lo + hi) / 2; bounds(lookZ, m, b); const fits = b[0] >= -side && b[1] <= side && b[3] <= top && b[2] >= bot; if (fits) hi = m; else lo = m; }
    d = hi; bounds(lookZ, d, b);
    // centre the content between the vertical margins
    const want = (top + bot) / 2, have = (b[3] + b[2]) / 2;
    const hh = d * Math.tan(fov * Math.PI / 360);
    lookZ = clamp(lookZ - (have - want) * hh / Math.max(0.3, Math.sin(pitch)) * 0.8, WZ(95), WZ(5));
  }
  SHOT.look.set(1.4, 0, lookZ); SHOT.pos.copy(SHOT.look).addScaledVector(dir, d); SHOT.dist = d; SHOT.pitch = pitch; SHOT.fov = fov;
}
function tableShot(out, look, a, W) {
  const portrait = a.h > a.w * 1.05;
  const cfg = W && W.cfg ? W.cfg.cam : 'auto';
  const key = a.w + 'x' + a.h;
  if (SHOT.key !== key) { SHOT.key = key; fitShot(a, portrait); }
  const cam = R.camera;
  if (cam.fov !== SHOT.fov || Math.abs(cam.aspect - a.w / a.h) > 1e-4) { cam.fov = SHOT.fov; cam.aspect = a.w / a.h; cam.updateProjectionMatrix(); }
  look.copy(SHOT.look); out.copy(SHOT.pos);
  const follow = cfg === 'follow' || (cfg === 'auto' && !portrait);
  if (!follow || !W) return;
  // follow: a little closer, sliding up and down the table after the balls
  let by = 0, bx = 0, n = 0;
  for (let i = 0; i < W.balls.length; i++) { const b = W.balls[i]; if (b.on) { by += b.y; bx += b.x; n++; } }
  const target = n ? clamp(by / n, 8, 92) : 30;
  const C = R.cam;
  C.fy = C.fy == null ? target : lerp(C.fy, target, 0.035);
  C.fx = C.fx == null ? 0 : lerp(C.fx, n ? bx / n : 0, 0.03);
  const zoom = portrait ? 0.8 : 0.9;
  const dz = (50 - C.fy) * (portrait ? 0.5 : 0.3);
  look.z = SHOT.look.z + dz; look.x = SHOT.look.x + C.fx * 0.15;
  out.copy(look).addScaledVector(CAM.tmp.set(0, Math.sin(SHOT.pitch), Math.cos(SHOT.pitch)), SHOT.dist * zoom);
}
// a slow flight round the fair, through a loop of viewpoints
const FLY = [
  [[-60, 40, 70], [0, 0, 10]], [[-40, 22, -20], [-12, 6, -45]], [[0, 16, -30], [0, 8, -55]], [[45, 25, -10], [16, 5, -48]],
  [[60, 50, 40], [0, 0, 0]], [[20, 90, 95], [0, 0, 5]], [[-30, 30, 60], [6, 2, 0]],
];
function flyShot(t, pos, look) {
  const n = FLY.length, k = (t * 0.07) % n, i = Math.floor(k), f = easeIO(k - i);
  const A = FLY[i], B = FLY[(i + 1) % n];
  pos.set(lerp(A[0][0], B[0][0], f), lerp(A[0][1], B[0][1], f), lerp(A[0][2], B[0][2], f));
  look.set(lerp(A[1][0], B[1][0], f), lerp(A[1][1], B[1][1], f), lerp(A[1][2], B[1][2], f));
}
function updateCamera(a, W, dt) {
  const cam = R.camera, C = R.cam;
  const rm = a.reducedMotion;
  const playing = !W.attract;
  if (!playing && a.state === 'menu') {
    if (rm) tableShot(CAM.pos, CAM.look, a, W);
    else flyShot(R.t, CAM.pos, CAM.look);
    cam.fov = 40; cam.aspect = a.w / a.h; cam.updateProjectionMatrix();
    cam.position.copy(CAM.pos); cam.lookAt(CAM.look);
    C.mode = 'attract';
    return;
  }
  tableShot(CAM.pos, CAM.look, a, W);
  // a moment: push toward a point of interest for a beat, then settle back
  if (C.moment && !rm) {
    C.momentT += dt;
    const m = C.moment, k = clamp(C.momentT / m.dur, 0, 1), env = Math.sin(k * Math.PI);
    CAM.tmp.set(WX(m.x), m.h, WZ(m.y));
    CAM.pos.lerp(CAM.tmp.add(_v2.set(m.ox, m.oy, m.oz)), env * m.amt);
    CAM.look.lerp(_v3.set(WX(m.x), 0, WZ(m.y)), env * m.amt * 0.8);
    if (k >= 1) C.moment = null;
  }
  // from the attract flight into the table shot: a smooth glide, never a cut
  if (C.mode === 'attract') { C.mode = 'glide'; C.blend = 0; C.from.copy(cam.position); C.fromQ.copy(cam.quaternion); }
  cam.position.copy(CAM.pos); cam.lookAt(CAM.look);
  if (C.mode === 'glide') {
    C.blend = Math.min(1, C.blend + dt / (rm ? 0.3 : 1.5));
    const k = easeIO(C.blend);
    CAM.q1.copy(cam.quaternion);
    cam.position.lerpVectors(C.from, CAM.pos, k);
    cam.quaternion.copy(C.fromQ).slerp(CAM.q1, k);
    if (C.blend >= 1) C.mode = 'table';
  }
  // the whole cabinet jolts on a nudge; small shakes from the shell
  cam.position.x += (a.shakeX || 0) * 0.06; cam.position.y += (a.shakeY || 0) * 0.06;
  cam.updateMatrixWorld();
}

/* ------------------------------------------------------------ events from the core */
function handleEvents(W) {
  const ev = W.ev;
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    switch (e.type) {
      case 'bumper': burst(e.x, e.y, 14, 34, SPARK, 0, 0.6); break;
      case 'sling': burst(e.x, e.y, 9, 26, ['#ffffff', e.a ? '#2fe0c8' : '#ff4fa0'], 0, 0.5); break;
      case 'target': burst(e.x + 0.6, e.y, 10, 22, ['#ffcf4a', '#ff8a2a'], 0, 0.7); break;
      case 'flipball': if (e.a > 200) burst(e.x, e.y, 4, 14, ['#ffffff'], 0, 0.3); break;
      case 'post': case 'wall': if (e.a > 180) burst(e.x, e.y, 3, 12, ['#ffffff', '#ffe0b0'], 0, 0.4); break;
      case 'jackpot': burst(e.x, e.y, 70, 40, ['#ffd36a', '#ff4fa0', '#2fe0c8', '#ffffff'], 1, 1.2); if (FX) { FX.flash(0.35, '#ffe2a0'); FX.kick(-5); } break;
      case 'super': burst(e.x, e.y, 140, 50, ['#ffd36a', '#ff4fa0', '#2fe0c8', '#8a6bff', '#ffffff'], 1, 1.4); if (FX) { FX.flash(0.55, '#ffffff'); FX.kick(-8); FX.letterbox(1, 1.6); } break;
      case 'multiball': burst(e.x, e.y, 90, 42, ['#ff4fa0', '#ffb02e', '#2fe0c8'], 1, 1.3); if (FX) { FX.flash(0.4, '#ff9ad0'); FX.letterbox(1, 2.0); } break;
      case 'skill': burst(e.x, e.y, 40, 30, ['#ffffff', '#ffd36a'], 1, 1); if (FX) FX.flash(0.25); break;
      case 'mode': burst(e.x, e.y, 40, 30, ['#b46bff', '#ffd36a'], 1, 1); if (R.carousel) R.carousel.w = 4; break;
      case 'scoop': if (R.carousel) R.carousel.w = Math.max(R.carousel.w, 2.2); break;
      case 'kick': burst(e.x, e.y, 10, 24, SPARK, 0, 0.6); break;
      case 'ramp': if (R.jug) R.jug.speed = 3; burst(-16.6, 32, 16, 22, ['#ff8a3a', '#ffd36a'], 0, 0.8); break;
      case 'combo': burst(e.x, e.y, 20 + e.a * 6, 28, ['#33d6ff', '#ffffff'], 1, 1); break;
      case 'launch': burst(23.65, 6, 8, 18, ['#ffffff', '#ffb02e'], 0, 0.5); break;
      case 'nudge': R.tableShake = 0.6; break;
      case 'drain': burst(e.x, 1, 12, 16, ['#ff3d4f', '#ff8a2a'], 0, 0.8); break;
      case 'search': burst(e.x, e.y, 6, 14, ['#ffffff'], 0, 0.5); break;
      default: break;
    }
  }
  ev.length = 0;
}

/* ------------------------------------------------------------ per frame */
function updateWorld(W, dt) {
  const a = W.alpha;
  if (R.flip) for (let i = 0; i < 2; i++) { const f = W.fl[i], d = f.def, th = lerp(f.pth, f.th, a); R.flip[i].rotation.y = d.side > 0 ? th : Math.PI - th; }
  updateBalls(W);
  updateBumpers(W);
  updateLamps(W);
  if (R.sling) for (let i = 0; i < 2; i++) {
    const s = W.sling[i], o = R.sling[i];
    o.top.material.emissiveIntensity = s.flash * 1.4;
    const k = s.kick * 0.45; o.band.position.x = o.band.userData.p[0] + o.band.userData.n[0] * k; o.band.position.z = o.band.userData.p[1] - o.band.userData.n[1] * k;
  }
  if (R.tg) {
    for (let i = 0; i < TABLE.targets.length; i++) {
      const T = TABLE.targets[i], st = W.tgt[i];
      const drop = st.down ? clamp(st.t / 0.12, 0, 1) * 2.75 : Math.max(0, 1 - st.t / 0.15) * 2.75 * (W.t > 0.3 ? 1 : 0);
      _m4.makeTranslation(WX(T.x) - 0.3, 1.3 - drop, WZ((T.y0 + T.y1) / 2)); R.tg.setMatrixAt(i, _m4);
    }
    R.tg.instanceMatrix.needsUpdate = true;
    R.tg.material.emissiveIntensity = 0.25 + (W.modeOn === 2 ? 0.5 + 0.5 * Math.sin(R.t * 8) : 0);
  }
  if (R.spin) R.spin.rotation.x = lerp(W.spin.pa, W.spin.a, a);
  if (R.gates) for (let k = 0; k < 2; k++) R.gates[k].rotation.x = -lerp(W.gates[k].pa || 0, W.gates[k].a, a) * (k ? -1 : 1) * 1.1;
  // toys
  if (R.ferris) {
    const F = R.ferris; F.a += (0.12 + Math.abs(W.spin.w) * 0.035) * dt * Math.sign(W.spin.w || 1);
    F.wheel.rotation.z = F.a;
    for (let i = 0; i < 8; i++) { const ang = F.a + i / 8 * TAU; _m4.makeTranslation(Math.cos(ang) * F.Rw, Math.sin(ang) * F.Rw - 0.6, 0); F.gond.setMatrixAt(i, _m4); }
    F.gond.instanceMatrix.needsUpdate = true;
    const chase = R.t * (2 + Math.abs(W.spin.w) * 0.2);
    for (let i = 0; i < 32; i++) { const v = 0.25 + 0.75 * (Math.sin(i * 0.8 - chase * 3) > 0.3 ? 1 : 0.15); _c.copy(colorOf(i % 3 === 0 ? '#ff4fa0' : i % 3 === 1 ? '#ffd36a' : '#2fe0c8')).multiplyScalar(v * 1.6); F.bulbs.setColorAt(i, _c); }
    F.bulbs.instanceColor.needsUpdate = true;
  }
  if (R.carousel) {
    const C = R.carousel; C.w = lerp(C.w, W.modeOn >= 0 || W.attract ? 1.4 : 0.35, dt * 0.6); C.a += C.w * dt; C.spin.rotation.y = C.a;
    for (let i = 0; i < 6; i++) { const ang = i / 6 * TAU; _m4.makeTranslation(Math.cos(ang) * 3.1, 2.2 + Math.sin(R.t * 3 + i * 1.7) * 0.6, Math.sin(ang) * 3.1); _q.setFromAxisAngle(_up, -ang); _m4.compose(_p3.setFromMatrixPosition(_m4), _q, _s3.set(1, 1, 1)); C.horses.setMatrixAt(i, _m4); }
    C.horses.instanceMatrix.needsUpdate = true;
    for (let i = 0; i < 24; i++) { const v = W.modeOn >= 0 ? (Math.sin(i * 1.3 + R.t * 9) > 0 ? 1.8 : 0.3) : 0.9 + 0.3 * Math.sin(i + R.t * 2); _c.copy(colorOf('#ffe8a0')).multiplyScalar(v); C.bulbs.setColorAt(i, _c); }
    C.bulbs.instanceColor.needsUpdate = true;
  }
  if (R.jug) {
    const J = R.jug; J.speed = lerp(J.speed, W.mb ? 2.4 : 1, dt * 1.5); J.t += dt * J.speed;
    J.armL.rotation.z = -0.4 + Math.sin(J.t * 6) * 0.35; J.armR.rotation.z = 0.4 - Math.sin(J.t * 6 + Math.PI) * 0.35;
    for (let i = 0; i < 3; i++) { const ph = J.t * 2.0 + i / 3 * TAU; const x = Math.cos(ph) * 1.8, y = 8.6 + Math.abs(Math.sin(ph)) * 3.2; _m4.makeTranslation(x, y, 0.6); J.orbs.setMatrixAt(i, _m4); }
    J.orbs.instanceMatrix.needsUpdate = true;
  }
  if (R.railBulbs) {
    const n = 48, big = W.mb || W.attract;
    for (let i = 0; i < n; i++) { const k = i % 24; const v = big ? (Math.sin(k * 0.9 - R.t * (W.mb ? 10 : 4)) > 0.2 ? 1.6 : 0.2) : 0.55 + 0.2 * Math.sin(k * 0.5 + R.t); _c.copy(colorOf(k % 2 ? '#ffd36a' : '#ff8ad0')).multiplyScalar(v); R.railBulbs.setColorAt(i, _c); }
    R.railBulbs.instanceColor.needsUpdate = true;
  }
  if (R.backbox) {
    const B = R.backbox, f = W.mb || W.superLit ? (Math.sin(R.t * 14) > 0 ? 2.5 : 0.2) : 0.6 + 0.3 * Math.sin(R.t * 1.4);
    B.fl.setColorAt(0, _c.copy(colorOf('#ff4fa0')).multiplyScalar(f)); B.fl.setColorAt(1, _c.copy(colorOf('#2fe0c8')).multiplyScalar(W.mb ? 2.5 - f : f)); B.fl.instanceColor.needsUpdate = true;
  }
  // the DMD texture: upload only when the display changed
  if (R.dmdTex && R.dmdVer !== DMD.ver) { R.dmdVer = DMD.ver; R.dmdTex.needsUpdate = true; }
  if (R.rampMesh) R.rampMesh.material.emissiveIntensity = W.mb || W.modeOn === 0 ? 0.25 + 0.2 * Math.sin(R.t * 8) : 0.12;
  // ball trail sparkles when the ball flies
  for (let i = 0; i < W.balls.length; i++) {
    const b = W.balls[i];
    if (b.on && b.speed > 300 && Math.random() < 0.5 * TIERS[Math.max(0, R.quality)].parts) emit(WX(b.x), BR + b.z, WZ(b.y), 0, 1, 0, 0.25, 0.45, b.speed > 450 ? '#ffd9a0' : '#9fd8ff', 0);
  }
}

/* ------------------------------------------------------------ the view */
const _pv = new THREE.Vector3(), _cf = new THREE.Vector3();
const view = {
  three: true,
  get hudScore() { return false; },
  init(a) {
    ARC = a;
    if (!setup(a)) return false;
    const q = /[?&]q=(\d)/.exec(location.search);
    setQuality(q ? +q[1] : R.soft ? 0 : a.device === 'desktop' ? 3 : 2);
    if (q) R.lockQ = true;
    view.resize(a);
    return true;
  },
  resize(a) {
    if (!R) return;
    const t = TIERS[Math.max(0, R.quality)];
    R.renderer.setPixelRatio(pixelRatio(a, t));
    R.renderer.setSize(a.w, a.h, false);
    R.camera.aspect = a.w / a.h; R.camera.updateProjectionMatrix();
  },
  graphics(level) { if (!R) return; if (level === 'auto') { R.lockQ = false; return; } R.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  newGame(W) { if (!R) return; R.world = W; if (R.P) R.P.life.fill(0); R.cam.moment = null; },
  moment(kind, b) {
    if (!R || !ARC || ARC.reducedMotion) return;
    const C = R.cam;
    const set = (x, y, h, amt, dur, ox, oy, oz) => { C.moment = { x, y, h, amt, dur, ox: ox || 0, oy: oy || 0, oz: oz || 0 }; C.momentT = 0; };
    if (kind === 'jackpot') set(b ? b.x : 0, b ? b.y : 60, 26, 0.38, 1.3, 0, 18, 28);
    else if (kind === 'super') set(TABLE.scoop.x, TABLE.scoop.y, 22, 0.5, 2.0, -10, 16, 24);
    else if (kind === 'multiball') set(1, 92, 18, 0.55, 2.4, 0, 14, 34);
    else if (kind === 'mode') set(17.6, 96, 20, 0.4, 2.0, -6, 12, 30);
    else if (kind === 'drain') set(0, 8, 30, 0.22, 1.2, 0, 22, 30);
    else if (kind === 'over') set(1, 60, 40, 0.3, 3.2, 0, 30, 60);
    if (FX && (kind === 'launch')) FX.kick(2.5);
  },
  render(a, W, ctx) {
    const r = R; if (!r) return false;
    const now = performance.now(), dtRaw = r.lastNow ? (now - r.lastNow) / 1000 : 1 / 60, dt = clamp(dtRaw, 0.001, 0.1); r.lastNow = now;
    let lost = r.lost;
    try { lost = lost || r.renderer.getContext().isContextLost(); } catch (e) { lost = true; }
    if (lost) {
      ctx.fillStyle = 'rgba(6,5,8,.9)'; ctx.fillRect(0, 0, a.w, a.h);
      ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = '#fbf5ec'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Graphics paused. Restoring...', a.w / 2, a.h / 2);
      return false;
    }
    if (r.jobs.length) runJobs(a.state === 'play' ? 8 : 22);
    measureFps(dtRaw);
    const live = a.state !== 'pause';
    r.t += live ? dt : 0;
    if (r.skyMat) r.skyMat.uniforms.uT.value = r.t;
    handleEvents(W);
    updateWorld(W, live ? dt : 0);
    if (live) updateParticles(dt);
    if (r.ptsMat) r.ptsMat.uniforms.uScale.value = a.h * r.renderer.getPixelRatio() * 0.5 / Math.tan(r.camera.fov * Math.PI / 360);
    updateCamera(a, W, live ? dt : 0);
    // a nudge jolts the table a centimetre
    if (r.tableShake > 0) { r.tableShake = Math.max(0, r.tableShake - dt * 3); }
    if (r.ready) renderReflection();
    if (FX) FX.render(r.scene, r.camera); else { r.renderer.setRenderTarget(null); r.renderer.render(r.scene, r.camera); }
    // letterbox the results and the big moments a touch more on landscape
    return true;
  },
  project(x, y, z, out) {
    if (!R) return false;
    const cam = R.camera;
    _cf.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _pv.set(WX(x) - cam.position.x, z - cam.position.y, WZ(y) - cam.position.z);
    if (_pv.dot(_cf) < 0.5) return false;
    _pv.set(WX(x), z, WZ(y)).project(cam);
    out.x = (_pv.x * 0.5 + 0.5) * ARC.w; out.y = (0.5 - _pv.y * 0.5) * ARC.h;
    out.on = true;
    return true;
  },
  info() {
    if (!R) return null;
    const i = R.renderer.info.render;
    return { quality: R.quality, fps: Math.round(R.fps), soft: R.soft, ready: R.ready, jobs: R.jobs.length, buildMs: Math.round(R.buildMs), longestJob: Math.round(R.longest), jobLog: R.jobLog.join(' '), pr: +R.renderer.getPixelRatio().toFixed(2), calls: i.calls, tris: i.triangles, post: FX ? FX.enabled : false, refl: TIERS[Math.max(0, R.quality)].refl > 0 };
  },
  dev: {
    quality: (q) => { if (R) R.lockQ = true; setQuality(q); },
    setQuality: (q) => { if (R) R.lockQ = true; setQuality(q); },
    stage: () => R,
    finish: () => { if (R) while (R.jobs.length) runJobs(1000); },
  },
};

// A last check that this browser can really draw 3D; if not, the 2D edition plays instead.
function canGL() {
  try { const c = document.createElement('canvas'); const gl = c.getContext('webgl2'); if (!gl) return false; const x = gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); return true; } catch (e) { return false; }
}
if (canGL()) boot(view);
else { const s = document.createElement('script'); s.src = '/games/mela-pinball/game.js'; document.body.appendChild(s); }
