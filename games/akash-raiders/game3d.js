import * as THREE from '/games/vendor/three/three.module.min.js';
import { createFX as createPost } from '/games/shared/fx3d.js';
import { boot, PY, BAR, barX, barY, KITE, BUG, MOTH, DUAL_DX, S_WAIT, clamp, lerp, TAU } from '/games/akash-raiders/core.js';

/*
 * Akash Raiders in 3D. The rules live in core.js; this file builds the night
 * sky, the city below it and every raider, films the fight, and lights it.
 *
 * The camera sits at rooftop height and looks up into the sky, so the whole
 * city lies below the horizon, right under the rocket's flight line, and the
 * field reads like a sheet of sky. Lantern-bugs glow, kites flutter, shots
 * are emissive and bloom, every pop is a small firework.
 *
 * Load speed: init() makes only the renderer, lights and sky, then the menu
 * appears. Everything else is built one small task per frame, and each new
 * material is drawn once (at a speck of a size if it should not show yet) so
 * its shader compiles behind the menu, never in the middle of play.
 * Lights never change in number and materials never change their defines, so
 * nothing recompiles later either.
 */

/* ------------------------------------------------------------ small helpers, all reused */
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q2 = new THREE.Quaternion();
const rand = (a) => (Math.random() - 0.5) * a;
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Bake a primitive in place with one vertex colour, so a whole model merges into one mesh.
function prep(geo, hex, pos, rot, scl) {
  // indexed parts stay indexed: a shared vertex is shaded once, which a software renderer feels
  const g = geo;
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'XYZ'); _q.setFromEuler(_e);
  if (scl == null) _s.set(1, 1, 1); else if (typeof scl === 'number') _s.set(scl, scl, scl); else _s.set(scl[0], scl[1], scl[2]);
  _p.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  _m.compose(_p, _q, _s); g.applyMatrix4(_m);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function merge(list) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), tint = new Float32Array(n).fill(1);
  let o = 0, ni = 0;
  list.forEach((g) => { ni += g.index ? g.index.count : g.attributes.position.count; });
  const idx = new Uint32Array(ni); let io = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); if (g.attributes.aTint) tint.set(g.attributes.aTint.array, o);
    const c = g.attributes.position.count;
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io++] = a[i] + o; } else { for (let i = 0; i < c; i++) idx[io++] = i + o; }
    o += c; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aTint', new THREE.BufferAttribute(tint, 1));
  out.computeBoundingSphere();
  return out;
}
const sph = (r, hex, pos, scl, ws, hs) => prep(new THREE.SphereGeometry(r, ws || 14, hs || 10), hex, pos, null, scl);
const box = (w, h, d, hex, pos, rot) => prep(new THREE.BoxGeometry(w, h, d), hex, pos, rot);
const cyl = (rt, rb, h, seg, hex, pos, rot, scl) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), hex, pos, rot, scl);
function starShape(n, R, r) {
  const s = new THREE.Shape();
  for (let i = 0; i < n * 2; i++) { const a = Math.PI / 2 + i * Math.PI / n, rr = i % 2 ? r : R; if (i) s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  s.closePath(); return s;
}
// On a software renderer every lit material is Lambert instead of PBR, decided once at load, never swapped.
let LITE = false;
function stdMat(o) {
  if (!LITE) return new THREE.MeshStandardMaterial(o);
  const l = {};
  ['color', 'vertexColors', 'emissive', 'emissiveIntensity', 'transparent', 'opacity', 'side', 'depthWrite', 'map'].forEach((k) => { if (o[k] !== undefined) l[k] = o[k]; });
  return new THREE.MeshLambertMaterial(l);
}
function fakeLight() { const o = new THREE.Object3D(); o.intensity = 0; return o; }
function glowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Write an instance matrix: position, a turn about z, a scale. No allocation.
function setZ(mesh, i, x, y, z, rz, sx, sy, sz) {
  const a = mesh.instanceMatrix.array, o = i * 16, c = Math.cos(rz), s = Math.sin(rz);
  a[o] = c * sx; a[o + 1] = s * sx; a[o + 2] = 0; a[o + 3] = 0;
  a[o + 4] = -s * sy; a[o + 5] = c * sy; a[o + 6] = 0; a[o + 7] = 0;
  a[o + 8] = 0; a[o + 9] = 0; a[o + 10] = sz; a[o + 11] = 0;
  a[o + 12] = x; a[o + 13] = y; a[o + 14] = z; a[o + 15] = 1;
}
function setCol(mesh, i, r, g, b) { const a = mesh.instanceColor.array; a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b; }
function mkIM(geo, mat, n, color) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  if (color) { m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3).fill(1), 3); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
  m.frustumCulled = false; m.count = 0;
  return m;
}
function flushIM(m, n) { m.count = n; m.visible = n > 0; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }

/* ------------------------------------------------------------ shaders */
// The sky: the gradient is worked out per vertex (cheap even on a software renderer), the nebula is one
// lookup into a painted texture, and the moon's detail is only computed inside its disc.
const SKY_VS = [
  'uniform float uTime;',
  'varying vec3 vDir; varying vec3 vCol; varying vec2 vUv; varying float vBand;',
  'void main(){',
  '  vDir = position; vec3 d = normalize(position); float y = d.y;',
  '  vUv = vec2(uv.x * 3.0, uv.y * 2.5 + uTime * 0.004);',
  '  vBand = smoothstep(0.02, 0.3, y) * (1.0 - smoothstep(0.7, 1.0, y));',
  '  vec3 top = vec3(0.006, 0.007, 0.04), mid = vec3(0.035, 0.018, 0.11), hor = vec3(0.3, 0.08, 0.2), glow = vec3(1.0, 0.38, 0.2);',
  '  vec3 c = mix(hor, mid, smoothstep(0.0, 0.09, y));',
  '  c = mix(c, top, smoothstep(0.08, 0.6, y));',
  '  c += glow * pow(1.0 - clamp(abs(y) * 2.2, 0.0, 1.0), 12.0) * 0.6;',
  '  if (y < 0.0) c = mix(hor * 0.9, vec3(0.08, 0.03, 0.08), smoothstep(0.0, -0.25, y));',
  // filmic curve and display encoding here, per vertex, so each pixel only adds the nebula and moon
  '  c *= 0.8; c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);',
  '  vCol = pow(clamp(c, 0.0, 1.0), vec3(0.4545));',
  '  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww;',
  '}'
].join('\n');
const SKY_FS = [
  'uniform float uNeb; uniform vec3 uMoon; uniform sampler2D tNeb;',
  'varying vec3 vDir; varying vec3 vCol; varying vec2 vUv; varying float vBand;',
  'void main(){',
  '  vec3 c = vCol + texture2D(tNeb, vUv).rgb * vBand * uNeb;',
  '  float md = dot(vDir, uMoon) / length(vDir);',
  '  if (md > 0.86) {',
  '    c += vec3(0.9, 0.78, 0.66) * (pow(md, 900.0) * 0.55 + pow(md, 60.0) * 0.16);',
  '    if (md > 0.9994) {',
  '      vec2 q = normalize(vDir).xy * 260.0; float m = fract(sin(dot(floor(q), vec2(12.9898, 78.233))) * 43758.5453);',
  '      c = mix(c, vec3(1.0, 0.97, 0.9) * (0.9 + 0.1 * m), smoothstep(0.99955, 0.99968, md));',
  '    }',
  '  }',
  '  gl_FragColor = vec4(c, 1.0);',
  '}'
].join('\n');
// A nebula painted once on a small canvas: soft teal and rose clouds that wrap around the sky.
function nebulaTex() {
  const W = 512, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(23);
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'lighter';
  const cols = ['rgba(20,90,120,', 'rgba(110,20,90,', 'rgba(50,30,120,', 'rgba(140,50,60,'];
  for (let i = 0; i < 70; i++) {
    const x = r() * W, y = H * (0.15 + r() * 0.75), rad = 20 + r() * 70, col = cols[i % 4], a = 0.08 + r() * 0.12;
    for (let k = -1; k <= 1; k++) {
      const gr = g.createRadialGradient(x + k * W, y, 0, x + k * W, y, rad);
      gr.addColorStop(0, col + a + ')'); gr.addColorStop(1, col + '0)');
      g.fillStyle = gr; g.fillRect(x + k * W - rad, y - rad, rad * 2, rad * 2);
    }
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.MirroredRepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// The far city: skyline silhouettes painted on a canvas, two layers on big planes behind the towers.
function skylineTex(seed, lit) {
  const W = 1024, H = 128, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'), r = rng(seed);
  let x = 0;
  while (x < W) {
    const w = 7 + r() * 23, h = H * (0.3 + r() * 0.6), top = H - h;
    g.fillStyle = '#000'; g.fillRect(x, top, w - 1, h);
    const k = r();
    if (k > 0.86) { g.beginPath(); g.arc(x + w / 2, top, w * 0.4, Math.PI, 0); g.fill(); }
    else if (k > 0.78) { g.beginPath(); g.moveTo(x + w * 0.25, top); g.lineTo(x + w / 2, top - h * 0.35); g.lineTo(x + w * 0.75, top); g.fill(); }
    else if (k > 0.72) g.fillRect(x + w * 0.45, top - h * 0.25, 2, h * 0.25);
    for (let wy = top + 2; wy < H; wy += 3) for (let wx = x + 2; wx < x + w - 2; wx += 3) {
      if (r() < lit) { const q = r(); g.fillStyle = q < 0.75 ? '#ff9a3c' : q < 0.9 ? '#9fe0ff' : '#ff6ab0'; g.fillRect(wx, wy, 1, 2); }
    }
    x += w;
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const FAR_FS = [
  'uniform sampler2D tMap; uniform vec3 uBody; uniform vec3 uFog; uniform float uFogK; uniform float uTime; varying vec2 vUv;',
  'void main(){',
  '  vec4 t = texture2D(tMap, vUv);',
  '  if (t.a < 0.5) discard;',
  '  vec3 win = t.rgb * (0.75 + 0.25 * step(0.5, fract(sin(dot(floor(vUv * vec2(512.0, 51.0)), vec2(12.9, 78.2))) * 437.5 + uTime * 0.05)));',
  '  vec3 c = uBody + win * 1.1;',
  '  c = mix(c, uFog, uFogK * (0.6 + 0.4 * (1.0 - vUv.y)));',
  '  gl_FragColor = vec4(sqrt(c), 1.0);',
  '}'
].join('\n');
// Stars stream down past the rocket in three layers; the GPU wraps them, nothing moves on the CPU.
const STAR_VS = [
  'attribute float aSeed; attribute float aLayer;',
  'uniform float uTime; uniform float uScale; uniform float uSpeed;',
  'varying float vTw; varying float vB;',
  'void main(){',
  '  vec3 p = position;',
  '  float sp = aLayer < 0.5 ? 2.2 : aLayer < 1.5 ? 1.0 : 0.45;',
  '  p.y = mod(p.y - uTime * sp * uSpeed, 240.0) + 1.0;',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  vB = 0.45 + fract(aSeed * 7.13) * 0.9;',
  '  vTw = 0.65 + 0.35 * sin(uTime * (1.5 + fract(aSeed * 3.7) * 4.0) + aSeed * 40.0);',
  '  gl_PointSize = (1.2 + fract(aSeed * 13.1) * 2.6) * uScale * (aLayer < 0.5 ? 1.3 : 1.0);',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');
const STAR_FS = 'varying float vTw; varying float vB; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(vec3(0.9, 0.93, 1.0) * vB * vTw * a * a, 1.0); }';
// Buildings: one instanced box drawn with windows worked out from world position, so every tower has
// windows of the same size whatever its scale. Lit by the moon and the city's own glow, fogged by distance.
const CITY_VS = [
  'uniform float uFogD;',
  'varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vSeed; varying float vFog;',
  'void main(){',
  '  mat4 im = instanceMatrix;',
  '  vec4 wp = modelMatrix * im * vec4(position, 1.0);',
  '  vW = wp.xyz; vN = normalize(mat3(modelMatrix * im) * normal);',
  '  vCol = instanceColor; vSeed = im[3].x * 1.37 + im[3].z * 0.71;',
  '  float fd = length(wp.xyz - cameraPosition); vFog = clamp(1.0 - exp(-uFogD * uFogD * fd * fd), 0.0, 1.0);',
  '  gl_Position = projectionMatrix * viewMatrix * wp;',
  '}'
].join('\n');
const CITY_FS = [
  'uniform float uTime; uniform vec3 uFog; uniform float uFogD; uniform float uLit;',
  'varying vec3 vW; varying vec3 vN; varying vec3 vCol; varying float vSeed; varying float vFog;',
  'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'void main(){',
  '  vec3 n = normalize(vN);',
  '  vec3 base = vCol;',
  '  float moon = max(dot(n, normalize(vec3(0.4, 0.6, 0.7))), 0.0) * 0.35 + 0.25;',
  '  vec3 c = base * moon;',
  '  if (n.y < 0.5) {',
  '    vec2 q = abs(n.z) > abs(n.x) ? vec2(vW.x, vW.y) : vec2(vW.z, vW.y);',
  '    vec2 cell = floor(q / vec2(0.62, 0.86)); vec2 f = fract(q / vec2(0.62, 0.86));',
  '    float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.2, f.y) * step(f.y, 0.72);',
  '    float r = h21(cell + vSeed);',
  '    float lit = step(1.0 - uLit, r) * win;',
  '    vec3 wc = r > 0.93 ? vec3(0.55, 0.85, 1.0) : r > 0.86 ? vec3(1.0, 0.55, 0.7) : vec3(1.0, 0.72, 0.38);',
  '    float flick = r > 0.985 ? 0.4 + 0.6 * step(0.5, fract(uTime * 0.7 + r * 9.0)) : 1.0;',
  '    c += wc * lit * flick * (0.85 + 0.3 * h21(cell * 1.7 + vSeed));',
  '    c += base * win * (1.0 - lit) * 0.15;',
  '  } else { c *= 0.7; c += vec3(0.6, 0.2, 0.1) * step(0.985, h21(floor(vW.xz * 2.0) + vSeed)) ; }',
  // the street glow from below
  '  c += vec3(0.9, 0.35, 0.18) * smoothstep(-14.0, -30.0, vW.y) * 0.25;',
  '  c = mix(c, uFog, vFog);',
  '  gl_FragColor = vec4(sqrt(c), 1.0);',
  '}'
].join('\n');
// Traffic and street lights: points that drift along the avenues, animated on the GPU.
const LIGHTS_VS = [
  'attribute float aSeed; attribute vec3 aColor; attribute float aSize;',
  'uniform float uTime; uniform float uScale;',
  'varying vec3 vCol; varying float vA;',
  'void main(){',
  '  vec3 p = position;',
  '  float sp = aSeed > 0.5 ? (aSeed - 0.5) * 22.0 + 4.0 : 0.0;',
  '  float dir = fract(aSeed * 91.7) > 0.5 ? 1.0 : -1.0;',
  '  if (sp > 0.0) p.x = mod(p.x + uTime * sp * dir + 160.0, 320.0) - 160.0;',
  '  vec4 mv = modelViewMatrix * vec4(p, 1.0);',
  '  vCol = aColor; vA = sp > 0.0 ? 1.0 : 0.6 + 0.4 * sin(uTime * 2.0 + aSeed * 80.0);',
  '  gl_PointSize = aSize * uScale / -mv.z;',
  '  gl_Position = projectionMatrix * mv;',
  '}'
].join('\n');
const LIGHTS_FS = 'varying vec3 vCol; varying float vA; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); gl_FragColor = vec4(vCol * vA * (a * a + 0.6 * pow(a, 8.0)), 1.0); }';
const PART_VS = [
  'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; attribute float aSpin;',
  'uniform float uScale;',
  'varying vec3 vColor; varying float vAlpha; varying float vSpin;',
  'void main(){ vColor = aColor; vAlpha = aAlpha; vSpin = aSpin;',
  '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
  '  gl_PointSize = aAlpha > 0.001 ? aSize * uScale / -mv.z : 0.0;',
  '  gl_Position = projectionMatrix * mv; }'
].join('\n');
const PART_ADD = 'varying vec3 vColor; varying float vAlpha; varying float vSpin; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d); a *= a; gl_FragColor = vec4(vColor * vAlpha * (a + pow(a, 6.0) * 1.5), 1.0); }';
const PART_SOFT = 'varying vec3 vColor; varying float vAlpha; varying float vSpin; void main(){ float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.1, d); gl_FragColor = vec4(vColor, a * a * vAlpha); }';
const PART_CONF = [
  'varying vec3 vColor; varying float vAlpha; varying float vSpin;',
  'void main(){',
  '  vec2 p = gl_PointCoord - 0.5; float c = cos(vSpin), s = sin(vSpin);',
  '  p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);',
  '  float flip = abs(cos(vSpin * 1.7));',
  '  if (abs(p.x) > 0.42 || abs(p.y) > 0.16 + 0.1 * flip) discard;',
  '  gl_FragColor = vec4(vColor * (0.55 + 0.6 * flip), vAlpha);',
  '}'
].join('\n');
const FLAME_VS = 'varying vec2 vUv; uniform float uTime; void main(){ vUv = uv; vec3 p = position; float w = 1.0 + 0.12 * sin(uTime * 40.0 + p.y * 9.0); p.xz *= w; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }';
const FLAME_FS = [
  'uniform float uTime; uniform vec3 uCol; uniform float uPow; varying vec2 vUv;',
  'void main(){',
  '  float y = vUv.y;',
  '  float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;',
  '  float a = pow(y, 1.6) * (0.55 + 0.45 * sin(uTime * 55.0 + vUv.x * 30.0 + y * 12.0)) * uPow;',
  '  vec3 c = mix(uCol, vec3(1.0, 0.95, 0.8), pow(y, 4.0));',
  '  gl_FragColor = vec4(c * a * (0.6 + 0.4 * edge), 1.0);',
  '}'
].join('\n');
const FRES_VS = 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }';
const FRES_FS = 'uniform vec3 uCol; uniform float uA; uniform float uTime; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4); float hex = 0.75 + 0.25 * sin(vN.x * 30.0 + uTime * 3.0) * sin(vN.y * 30.0 - uTime * 2.0); gl_FragColor = vec4(uCol * (f * hex + 0.06) * uA, 1.0); }';
const BEAM_FS = [
  'uniform float uTime; uniform float uA; varying vec2 vUv;',
  'void main(){',
  '  float bands = 0.5 + 0.5 * sin((vUv.y * 22.0 + uTime * 9.0));',
  '  float rim = pow(abs(sin(vUv.x * 3.14159 * 2.0)), 0.6);',
  '  float fade = smoothstep(0.0, 0.25, vUv.y);',
  '  vec3 c = mix(vec3(0.55, 0.35, 1.0), vec3(0.4, 0.95, 1.0), vUv.y);',
  '  gl_FragColor = vec4(c * (0.18 + 0.5 * bands * bands) * (0.4 + 0.6 * rim) * fade * uA, 1.0);',
  '}'
].join('\n');
const BEAM_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';

/* ------------------------------------------------------------ quality tiers */
const TIERS = [
  { px: 0.5, budget: 330000, post: 0, fx: 0.45, stars: 0.5, city: 0.55 },
  { px: 0.8, budget: 950000, post: 1, fx: 0.7, stars: 0.8, city: 0.8 },
  { px: 0.92, budget: 1500000, post: 2, fx: 1, stars: 1, city: 1 },
  { px: 1, budget: 2400000, post: 3, fx: 1, stars: 1, city: 1 }
];

/* ------------------------------------------------------------ state */
const R = { ready: false, built: false, taskMs: [], q: -1, lock: false, fps: 60, fN: 0, fT: 0, warm: 0, soft: false, lost: false, last: 0, time: 0, tasks: [], ti: 0, warmList: [], scale: 1,
  base: { pos: new THREE.Vector3(0, 1, 60), look: new THREE.Vector3(0, 14, 0) }, camPos: new THREE.Vector3(), camLook: new THREE.Vector3(), camInit: false, kick: 0, blast: 0, shells: [], queue: [], longest: 0 };
let ARC = null, POST = null, FX = null, renderer = null, scene = null, camera = null;
const view = {
  name: '3d', three: true, ready: false, pxPerUnit: 20, fieldCx: 0,
  init, resize, graphics, render, project, fx: effect, newGame, debug,
  dev: { quality: (q) => { R.lock = true; setQuality(q); }, setQuality: (q) => { R.lock = true; setQuality(q); }, stage: () => R }
};

/* ------------------------------------------------------------ init: only what the menu needs */
function init(a) {
  ARC = a;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: !GLINFO.soft, powerPreference: 'high-performance', stencil: false });
  } catch (e) { return fail(a); }
  R.soft = GLINFO.soft; LITE = R.soft && !/[?&](q=3|hq=1)/.test(location.search);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor('#0a0616');
  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#2a1030', 0.0045);
  camera = new THREE.PerspectiveCamera(34, 1, 0.5, 3000);
  R.gl = { renderer, scene, camera };
  // Lights: made once and never added or removed, so no material ever needs a new shader.
  R.hemi = new THREE.HemisphereLight('#6b78d8', '#ff7a4a', 1.15); scene.add(R.hemi);
  R.moon = new THREE.DirectionalLight('#dfe4ff', 1.8); R.moon.position.set(14, 40, 40); scene.add(R.moon, R.moon.target);
  // Moving lights for the engine, blasts and the boss, except on a software renderer, where every
  // lit pixel would pay for all three: there the halos and bloom sprites carry the glow alone.
  R.engine = LITE ? fakeLight() : new THREE.PointLight('#ff9a4a', 0, 9, 1.6); scene.add(R.engine);
  R.blastL = LITE ? fakeLight() : new THREE.PointLight('#ffd0a0', 0, 16, 1.6); scene.add(R.blastL);
  R.bossL = LITE ? fakeLight() : new THREE.PointLight('#ff7a3a', 0, 22, 1.4); scene.add(R.bossL);
  R.skyU = { uTime: { value: 0 }, uNeb: { value: 1 }, uMoon: { value: new THREE.Vector3(0.42, 0.5, -1).normalize() }, tNeb: { value: nebulaTex() } };
  R.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 64, 48), new THREE.ShaderMaterial({ uniforms: R.skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false }));
  R.sky.frustumCulled = false; R.sky.renderOrder = -10; scene.add(R.sky);
  a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.lost = true; }, false);
  a.canvas.addEventListener('webglcontextrestored', () => { R.lost = false; }, false);
  POST = createPost(renderer, { arc: a, intro: false, results: { dist: 40, yaw: 0.18, rise: 0.05, speed: 0.2 }, target: (v) => { v.set(0, 14, 0); return true; }, look: { bloom: 0.66, bloomWide: 0.42, threshold: 0.64, knee: 0.25, vignette: 0.36, grain: 0.034, sat: 0.97, contrast: 1.05, lift: [0.012, 0.013, 0.028], gain: [1.04, 1.0, 0.96] } });
  const q = /[?&]q=(\d)/.exec(location.search);
  if (q) R.lock = true;
  setQuality(q ? +q[1] : R.soft ? 0 : a.device === 'desktop' ? 3 : 2);
  queueBuild();
  resize(a);
  return true;
}
function fail(a) {
  a.panel({ eyebrow: 'Akash Raiders', title: '3D graphics <em>unavailable</em>', html: '<p>This browser could not start WebGL. The 2D edition of the game will load instead.</p>', actions: [{ label: 'Play in 2D', primary: true, on: () => { location.reload(); } }, { label: 'All games', href: '/games' }] });
  return false;
}
function setQuality(q) {
  q = clamp(q | 0, 0, 3);
  if (q === R.q) return;
  R.q = q;
  const t = TIERS[q];
  if (POST) POST.setQuality(t.post, R.lock);
  if (VFX) VFX.setQuality(q);
  if (FX) FX.density = t.fx;
  if (R.stars) R.stars.geometry.setDrawRange(0, Math.floor(R.starN * t.stars));
  if (R.city) R.city.count = Math.floor(R.cityN * t.city);
  if (ARC) resize(ARC);
}
function graphics(level) { if (level === 'auto') { R.lock = false; return; } R.lock = true; setQuality(level === 'sharp' ? 3 : 1); }

/* ------------------------------------------------------------ the camera: rooftop height, looking up into the sky */
const _pj = new THREE.Vector3();
function ndcY(y) { _pj.set(0, y, 0).project(camera); return _pj.y; }
function ndcX(x, y) { _pj.set(x, y, 0).project(camera); return _pj.x; }
function place(D, Ty) { camera.position.set(0, 0.9, D); camera.lookAt(0, Ty, 0); camera.updateMatrixWorld(); }
function fitCamera(a) {
  camera.aspect = a.w / a.h;
  camera.fov = a.w / a.h < 0.7 ? 38 : 34;
  camera.updateProjectionMatrix();
  const pad = a.hudPad();
  // where the field's top (y 30.6) and bottom (y -0.8) should land, in NDC
  const dTop = 1 - 2 * (pad.top + 50) / a.h, dBot = -1 + 2 * (pad.bottom + 46) / a.h;
  const solveTy = (D, anchorBottom) => {
    let lo = -20, hi = 60;
    for (let i = 0; i < 30; i++) {
      const m = (lo + hi) / 2; place(D, m);
      const v = anchorBottom ? ndcY(-0.8) - dBot : (ndcY(30.6) + ndcY(-0.8)) / 2 - (dTop + dBot) / 2;
      if (v > 0) lo = m; else hi = m; // looking higher moves the field down the screen
    }
    return (lo + hi) / 2;
  };
  let lo = 20, hi = 400, D, Ty;
  for (let i = 0; i < 26; i++) {
    D = (lo + hi) / 2; Ty = solveTy(D, false); place(D, Ty);
    const span = ndcY(30.6) - ndcY(-0.8);
    if (span > dTop - dBot) lo = D; else hi = D;
  }
  D = (lo + hi) / 2; Ty = solveTy(D, false); place(D, Ty);
  const xmax = 1 - 2 * 8 / a.w;
  if (Math.abs(ndcX(10.7, -0.8)) > xmax || Math.abs(ndcX(10.7, 30.6)) > xmax) {
    lo = D; hi = 600;
    for (let i = 0; i < 26; i++) {
      const m = (lo + hi) / 2; const ty = solveTy(m, true); place(m, ty);
      if (Math.max(Math.abs(ndcX(10.7, -0.8)), Math.abs(ndcX(10.7, 30.6))) > xmax) lo = m; else hi = m;
    }
    D = hi; Ty = solveTy(D, true); place(D, Ty);
  }
  R.base.pos.copy(camera.position); R.base.look.set(0, Ty, 0);
  // the scale the core uses to turn finger and mouse movement into field units
  _pj.set(0, PY, 0).project(camera); const x0 = (_pj.x * 0.5 + 0.5) * a.w;
  _pj.set(1, PY, 0).project(camera); const x1 = (_pj.x * 0.5 + 0.5) * a.w;
  view.pxPerUnit = Math.max(4, x1 - x0); view.fieldCx = x0;
  R.camInit = false;
}
function resize(a) {
  if (!renderer || !a) return;
  const t = TIERS[Math.max(0, R.q)];
  const pr = Math.min(a.dpr * t.px, Math.sqrt(t.budget / Math.max(1, a.w * a.h)));
  renderer.setPixelRatio(Math.max(0.35, pr));
  renderer.setSize(a.w, a.h, false);
  R.scale = a.h * renderer.getPixelRatio() * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
  fitCamera(a);
  R.scale = a.h * renderer.getPixelRatio() * 0.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
}

/* ------------------------------------------------------------ the build queue: one small job per frame behind the menu */
function task(fn) { R.tasks.push(fn); }
function warm(obj) { R.warmList.push(obj); }
function queueBuild() {
  task(buildStars);
  task(buildCityA);
  task(buildCityB);
  // two far layers of skyline on big planes, fogged toward the horizon glow, one per frame
  task(() => { R.far1 = R.farMk(31, 0.22, -150, 560, -1.4, '#1a1232', 0.45); });
  task(() => { R.far2 = R.farMk(47, 0.15, -260, 980, -1.0, '#241640', 0.7); });
  task(buildRocket);
  task(buildFlames);
  task(buildEnemyBodies);
  task(buildEnemyParts);
  task(buildShots);
  task(buildPickups);
  task(buildBarriers);
  task(buildParticles);
  task(buildRings);
  task(buildBeam);
  task(buildBossA);
  task(buildBossB);
  if (!LITE) task(buildEnv);
}
function pump() {
  // Undo last frame's warm-up draws: objects that should not show yet go back to hidden.
  for (let i = 0; i < R.warmList.length; i++) { const o = R.warmList[i]; if (o.userData.warmed) { o.visible = !!o.userData.show; o.scale.copy(o.userData.s0); o.userData.warmed = false; o.userData.done = true; } }
  if (R.warmList.length && R.warmList.every((o) => o.userData.done)) R.warmList.length = 0;
  if (R.ti < R.tasks.length) {
    const t0 = performance.now();
    R.tasks[R.ti++]();
    R.taskMs.push(Math.round(performance.now() - t0));
    // anything just made that should stay hidden is drawn once, at a speck of a size, so its shader compiles now
    for (let i = 0; i < R.warmList.length; i++) { const o = R.warmList[i]; if (o.userData.done || o.userData.warmed) continue; o.userData.s0 = o.scale.clone(); o.userData.show = o.visible; o.visible = true; o.scale.setScalar(1e-4); o.userData.warmed = true; if (o.isInstancedMesh && o.count === 0) { setZ(o, 0, 0, 0, 0, 0, 0, 0, 0); o.count = 1; o.instanceMatrix.needsUpdate = true; } }
    R.longest = Math.max(R.longest, performance.now() - t0);
    return;
  }
  if (!R.built) {
    R.built = true;
    const done = () => { R.ready = true; view.ready = true; loadVFX(); };
    try {
      // Every material has already been drawn once by now, so this only catches stragglers.
      if (renderer.extensions.has('KHR_parallel_shader_compile')) renderer.compileAsync(scene, camera).then(done).catch(done);
      else { renderer.compile(scene, camera); done(); }
    } catch (e) { done(); }
  }
}

/* ------------------------------------------------------------ stars */
function buildStars() {
  const n = 2400, pos = new Float32Array(n * 3), seed = new Float32Array(n), layer = new Float32Array(n), r = rng(11);
  for (let i = 0; i < n; i++) {
    const L = i % 3, z = L === 0 ? -150 : L === 1 ? -260 : -420, w = L === 0 ? 170 : L === 1 ? 270 : 420;
    pos[i * 3] = (r() - 0.5) * w; pos[i * 3 + 1] = r() * 240; pos[i * 3 + 2] = z + (r() - 0.5) * 40;
    seed[i] = r(); layer[i] = L;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aLayer', new THREE.BufferAttribute(layer, 1));
  R.starU = { uTime: { value: 0 }, uScale: { value: 1 }, uSpeed: { value: 1 } };
  const m = new THREE.ShaderMaterial({ uniforms: R.starU, vertexShader: STAR_VS, fragmentShader: STAR_FS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
  R.stars = new THREE.Points(g, m); R.stars.frustumCulled = false; R.stars.renderOrder = -5; R.starN = n;
  R.stars.geometry.setDrawRange(0, Math.floor(n * TIERS[R.q].stars));
  scene.add(R.stars);
}

/* ------------------------------------------------------------ the city: towers, domes, spires and traffic below the horizon */
function buildCityA() {
  const r = rng(77), list = [];
  // rows of towers, lower with distance so every roof stays under the horizon
  const add = (x, z, w, d, top, col) => list.push({ x, z, w, d, top, col });
  const pal = ['#2a2350', '#30244a', '#1f2246', '#3a2a52', '#262a4e', '#2f2038'];
  for (let z = -4; z > -70; z -= 3.6 + (-z) * 0.08) {
    const dist = -z, spread = 24 + dist * 1.1;
    let x = -spread;
    while (x < spread) {
      const w = 1.4 + r() * 3.4 + dist * 0.02, d = 1.5 + r() * 3;
      const top = -0.3 - r() * (2.2 + dist * 0.04);
      if (r() > 0.12) add(x + w / 2, z - r() * 2, w, d, top, pal[(r() * pal.length) | 0]);
      x += w + 0.2 + r() * 1.2;
    }
  }
  const n = list.length;
  const geo = new THREE.BoxGeometry(1, 1, 1); geo.translate(0, 0.5, 0);
  R.cityU = { uTime: { value: 0 }, uFog: { value: new THREE.Color('#2a1030') }, uFogD: { value: 0.0045 }, uLit: { value: 0.36 } };
  const mat = new THREE.ShaderMaterial({ uniforms: R.cityU, vertexShader: CITY_VS, fragmentShader: CITY_FS, fog: false });
  const im = new THREE.InstancedMesh(geo, mat, n);
  im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
  // nearest first, so the lower tiers keep the towers that matter
  list.sort((p, q) => q.z - p.z);
  const base = -60;
  list.forEach((b, i) => {
    _p.set(b.x, base, b.z); _q.identity(); _s.set(b.w, b.top - base, b.d);
    _m.compose(_p, _q, _s); im.setMatrixAt(i, _m);
    _c.set(b.col); im.setColorAt(i, _c);
  });
  im.frustumCulled = false; R.city = im; R.cityN = n; im.count = Math.floor(n * TIERS[R.q].city);
  scene.add(im);
  R.roofTops = list.slice(0, 140);
}
function buildCityB() {
  // domes, minarets, a temple spire and water tanks on the near roofs: one merged mesh
  const r = rng(5), parts = [];
  const tops = R.roofTops || [];
  for (let i = 0; i < tops.length; i++) {
    const b = tops[i]; if (r() > 0.32 || b.z < -60) continue;
    const k = r(), x = b.x, y = b.top, z = b.z;
    if (k < 0.3) { parts.push(sph(Math.min(b.w, b.d) * 0.42, '#3b2c5c', [x, y, z], [1, 0.8, 1], 12, 8)); parts.push(cyl(0.05, 0.05, 0.9, 5, '#ffcf6a', [x, y + Math.min(b.w, b.d) * 0.36 + 0.3, z])); }
    else if (k < 0.55) { parts.push(cyl(0.18, 0.24, 2.6, 8, '#33284f', [x + b.w * 0.3, y + 1.3, z])); parts.push(prep(new THREE.ConeGeometry(0.3, 0.6, 8), '#ffb04a', [x + b.w * 0.3, y + 2.9, z])); }
    else if (k < 0.72) { parts.push(prep(new THREE.ConeGeometry(Math.min(b.w, b.d) * 0.35, 2.8, 6), '#3a2848', [x, y + 1.4, z])); }
    else { parts.push(cyl(0.5, 0.5, 0.7, 10, '#41365e', [x - b.w * 0.2, y + 0.9, z])); for (let L = 0; L < 4; L++) parts.push(cyl(0.04, 0.04, 0.6, 4, '#2a2340', [x - b.w * 0.2 + (L % 2 ? 0.35 : -0.35), y + 0.3, z + (L < 2 ? 0.35 : -0.35)])); }
  }
  if (parts.length) {
    const m = new THREE.Mesh(merge(parts), stdMat({ vertexColors: true, roughness: 0.8, metalness: 0.05 }));
    scene.add(m); R.props = m;
  }
  R.farMk = (seed, lit, z, w, top, body, fogK) => {
    const u = { tMap: { value: skylineTex(seed, lit) }, uBody: { value: new THREE.Color(body) }, uFog: { value: new THREE.Color('#5a1f48') }, uFogK: { value: fogK }, uTime: R.cityU.uTime };
    u.tMap.value.repeat.set(1, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 70), new THREE.ShaderMaterial({ uniforms: u, vertexShader: BEAM_VS, fragmentShader: FAR_FS }));
    m.position.set(0, top - 35, z); scene.add(m); return m;
  };
  // street lights, traffic streams and festival lights strung across the near roofs
  const n = 900, pos = new Float32Array(n * 3), col = new Float32Array(n * 3), seed = new Float32Array(n), size = new Float32Array(n);
  const warmC = new THREE.Color('#ffb060'), redC = new THREE.Color('#ff4a40'), whiteC = new THREE.Color('#fff1d0'), pinkC = new THREE.Color('#ff6ad0'), cyanC = new THREE.Color('#6ee7ff');
  for (let i = 0; i < n; i++) {
    let x, y, z, c, s, sd;
    if (i < 420) { // traffic on three avenues
      const lane = i % 3; z = lane === 0 ? -16 : lane === 1 ? -42 : -95; y = lane === 0 ? -9 : lane === 1 ? -14 : -26;
      x = (r() - 0.5) * 320; sd = 0.5 + r() * 0.5; c = r() < 0.5 ? redC : whiteC; s = lane === 0 ? 0.4 : lane === 1 ? 0.7 : 1.4;
    } else if (i < 700) { // lit streets, static
      z = -6 - r() * 150; y = -6 - r() * 18 - (-z) * 0.08; x = (r() - 0.5) * (40 + -z * 1.5); sd = r() * 0.45; c = warmC; s = 0.45 + (-z) * 0.012;
    } else { // festival strings on the parapet
      const k = i - 700, strand = Math.floor(k / 50), t = (k % 50) / 49;
      x = -30 + strand * 12 + t * 12; z = -3.2; y = -1.6 - Math.sin(t * Math.PI) * 0.7; sd = r() * 0.45; c = k % 3 === 0 ? pinkC : k % 3 === 1 ? warmC : cyanC; s = 0.16;
    }
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; seed[i] = sd; size[i] = s;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  R.lightU = { uTime: { value: 0 }, uScale: { value: 1 } };
  R.lights = new THREE.Points(g, new THREE.ShaderMaterial({ uniforms: R.lightU, vertexShader: LIGHTS_VS, fragmentShader: LIGHTS_FS, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  R.lights.frustumCulled = false; scene.add(R.lights);
}

/* ------------------------------------------------------------ the rocket */
function rocketGeo() {
  const prof = [[0, 1.18], [0.1, 1.1], [0.2, 0.92], [0.29, 0.62], [0.34, 0.25], [0.35, -0.15], [0.32, -0.5], [0.25, -0.7], [0, -0.7]].map((p) => new THREE.Vector2(p[0], p[1]));
  const body = new THREE.LatheGeometry(prof, 20).toNonIndexed();
  const n = body.attributes.position.count, col = new Float32Array(n * 3), cs = new THREE.Color('#ff7a2a'), cw = new THREE.Color('#f3efe8'), ct = new THREE.Color('#1fb7b0');
  for (let i = 0; i < n; i++) { const y = body.attributes.position.getY(i); const c = y > 0.7 ? cs : (y > -0.32 && y < -0.18) ? ct : cw; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  body.setAttribute('color', new THREE.BufferAttribute(col, 3)); body.deleteAttribute('uv');
  const parts = [body];
  const fin = new THREE.Shape(); fin.moveTo(0, 0.1); fin.lineTo(0.48, -0.55); fin.lineTo(0.48, -0.85); fin.lineTo(0, -0.62); fin.closePath();
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.05, bevelEnabled: false }); fg.translate(0.26, 0, -0.025);
    parts.push(prep(fg, '#1fb7b0', [0, 0, 0], [0, a, 0]));
  }
  parts.push(cyl(0.2, 0.27, 0.22, 14, '#3a3a46', [0, -0.8, 0]));
  parts.push(cyl(0.36, 0.36, 0.06, 20, '#ffcf6a', [0, 0.25, 0]));
  return merge(parts);
}
function buildRocket() {
  const geo = rocketGeo();
  const env = LITE ? 0 : 1;
  R.rocketMat = stdMat({ vertexColors: true, metalness: 0.35, roughness: 0.3, envMapIntensity: env });
  R.captiveMat = stdMat({ vertexColors: true, metalness: 0.35, roughness: 0.3, color: '#c68bff', emissive: '#3a1060', envMapIntensity: env });
  // the window and the nozzle ring glow
  // the pilot: a helmeted head and shoulders seen against the lit window
  const glowGeo = merge([sph(0.13, '#7ff2ff', [0, 0.38, 0.27], [1, 1, 0.55]), cyl(0.21, 0.21, 0.04, 14, '#ffd9a0', [0, -0.92, 0]),
    sph(0.055, '#10161e', [0, 0.405, 0.318], [1, 1.08, 0.5]), sph(0.075, '#141a22', [0, 0.315, 0.318], [1.3, 0.55, 0.45]), sph(0.016, '#ffe9c0', [0.018, 0.42, 0.347], [1, 0.6, 0.4])]);
  R.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.2, 2.2, 2.2) });
  R.rockets = [];
  for (let i = 0; i < 4; i++) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(geo, i >= 2 ? R.captiveMat : R.rocketMat);
    const glow = new THREE.Mesh(glowGeo, R.glowMat);
    g.add(body, glow); g.visible = i === 0; g.userData = { body, glow };
    g.scale.setScalar(1.12);
    scene.add(g); R.rockets.push(g);
    warm(g);
  }
  // shield bubble
  R.shieldU = { uCol: { value: new THREE.Color(0.35, 0.95, 1.3) }, uA: { value: 0 }, uTime: { value: 0 } };
  R.shield = new THREE.Mesh(new THREE.SphereGeometry(1.25, 28, 18), new THREE.ShaderMaterial({ uniforms: R.shieldU, vertexShader: FRES_VS, fragmentShader: FRES_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  R.shield.visible = false; scene.add(R.shield); warm(R.shield);
}
function buildFlames() {
  const geo = new THREE.ConeGeometry(0.21, 1, 16, 1, true); geo.rotateX(Math.PI); geo.translate(0, -0.5, 0);
  R.flames = [];
  for (let i = 0; i < 4; i++) {
    const u = { uTime: { value: 0 }, uCol: { value: new THREE.Color(1.0, 0.45, 0.12) }, uPow: { value: 1 } };
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: u, vertexShader: FLAME_VS, fragmentShader: FLAME_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    m.position.y = -0.9; m.userData.u = u;
    R.rockets[i].add(m); R.flames.push(m);
  }
  // halo sprites: shots, lanterns, gifts and glints, one additive draw
  R.glow = glowTex();
  R.haloMat = new THREE.MeshBasicMaterial({ map: R.glow, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, toneMapped: false });
  R.halo = mkIM(new THREE.PlaneGeometry(1, 1), R.haloMat, 420, true); R.halo.renderOrder = 4; scene.add(R.halo); warm(R.halo);
}

/* ------------------------------------------------------------ the raiders */
function kiteGeo() {
  const parts = [];
  const g = new THREE.BufferGeometry();
  const T = [0, 1.0, 0], B = [0, -0.92, 0], L = [-0.74, 0.12, 0], Rr = [0.74, 0.12, 0], F = [0, 0.1, 0.24], K = [0, 0.1, -0.1];
  const tri = [];
  const push = (a, b, c) => tri.push(...a, ...b, ...c);
  push(T, L, F); push(T, F, Rr); push(B, F, L); push(B, Rr, F);
  push(T, K, L); push(T, Rr, K); push(B, L, K); push(B, K, Rr);
  g.setAttribute('position', new THREE.Float32BufferAttribute(tri, 3)); g.computeVertexNormals();
  const n = tri.length / 3, col = new Float32Array(n * 3);
  const shade = [1, 0.72, 0.72, 1, 0.5, 0.5, 0.5, 0.5];
  for (let f = 0; f < 8; f++) for (let v = 0; v < 3; v++) { const i = f * 3 + v; col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = shade[f]; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  parts.push(g);
  parts.push(box(0.045, 1.9, 0.05, '#3a2418', [0, 0.04, 0.12]));
  parts.push(box(1.42, 0.045, 0.05, '#3a2418', [0, 0.12, 0.12]));
  // the tail of little bows, trailing behind the way it flies
  for (let k = 0; k < 3; k++) {
    const y = 1.2 + k * 0.32, x = Math.sin(k * 1.4) * 0.12;
    parts.push(prep(new THREE.ConeGeometry(0.11, 0.2, 4), '#ffffff', [x - 0.1, y, 0], [0, 0, Math.PI / 2]));
    parts.push(prep(new THREE.ConeGeometry(0.11, 0.2, 4), '#ffffff', [x + 0.1, y, 0], [0, 0, -Math.PI / 2]));
  }
  parts.push(cyl(0.012, 0.012, 1.1, 3, '#f0e0d0', [0, 1.45, 0]));
  return merge(parts);
}
function bugGeo(moth) {
  const p = [];
  const s = moth ? 1.15 : 1;
  p.push(sph(0.36 * s, '#ffffff', [0, -0.32 * s, 0], [1, 0.95, 1], 12, 8));
  p.push(sph(0.3 * s, '#d8d8d8', [0, 0.02, 0], [1, 0.9, 0.9], 10, 7));
  // ribs round the lantern belly
  for (let k = 0; k < 3; k++) p.push(prep(new THREE.TorusGeometry(0.3 * s - k * 0.04, 0.035, 4, 12), '#3a2a20', [0, 0.22 + k * 0.17, 0], [Math.PI / 2, 0, 0], [1, 1, 1]));
  // antennae
  for (const d of [-1, 1]) {
    p.push(cyl(0.025, 0.025, 0.55 * s, 4, '#2a1d2a', [d * 0.2 * s, -0.78 * s, 0.05], [0, 0, d * 0.5]));
    p.push(sph(0.07 * s, moth ? '#ffd36a' : '#ffffff', [d * 0.34 * s, -1.02 * s, 0.05], 1, 5, 4));
  }
  if (moth) {
    p.push(prep(new THREE.TorusGeometry(0.34, 0.12, 6, 14), '#f4ecff', [0, -0.08, 0], [Math.PI / 2, 0, 0]));
    for (let k = 0; k < 5; k++) { const a = -0.8 + k * 0.4; p.push(prep(new THREE.ConeGeometry(0.06, 0.28, 5), '#ffcf6a', [Math.sin(a) * 0.32, -0.7 - Math.cos(a) * 0.06, 0.12], [0, 0, Math.PI + a])); }
  }
  return merge(p);
}
function faceGeo() {
  const p = [];
  for (const d of [-1, 1]) {
    p.push(sph(0.17, '#ffffff', [d * 0.19, 0, 0], [1, 1.12, 0.62], 10, 7));
    p.push(sph(0.095, '#14101c', [d * 0.19, -0.03, 0.075], [1, 1.15, 0.6], 8, 5));
    p.push(sph(0.034, '#ffffff', [d * 0.19 + 0.035, 0.03, 0.135], 1, 4, 3));
    p.push(sph(0.08, '#ff7aa8', [d * 0.38, -0.17, 0.0], [1, 0.6, 0.3], 6, 4));
  }
  p.push(prep(new THREE.TorusGeometry(0.06, 0.016, 3, 6, Math.PI), '#14101c', [0, -0.16, 0.06], [0, 0, Math.PI]));
  return merge(p);
}
// The eyes ride in the body mesh, masked so the instance colour paints the body and never the eyes.
function withFace(body, pos, sc) {
  const f = faceGeo(); f.attributes.aTint.array.fill(0);
  _m.compose(_p.set(pos[0], pos[1], pos[2]), _q.identity(), _s.set(sc, sc, sc)); f.applyMatrix4(_m);
  return merge([body, f]);
}
function tintMask(m) {
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aTint;')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n vColor.xyz = mix(color.xyz, vColor.xyz, aTint);\n#endif');
  };
  m.customProgramCacheKey = () => 'tintmask';
  return m;
}
function buildEnemyBodies() {
  const env = LITE ? 0 : 0.8;
  R.kiteIM = mkIM(withFace(kiteGeo(), [0, 0.12, 0.25], 0.9), tintMask(stdMat({ vertexColors: true, roughness: 0.55, metalness: 0.05, side: THREE.DoubleSide, envMapIntensity: env, emissive: '#2a0f20' })), 56, true);
  R.bugIM = mkIM(withFace(bugGeo(false), [0, -0.32, 0.33], 0.85), tintMask(stdMat({ vertexColors: true, roughness: 0.35, metalness: 0.15, envMapIntensity: env })), 56, true);
  R.mothIM = mkIM(withFace(bugGeo(true), [0, -0.37, 0.38], 0.87), tintMask(stdMat({ vertexColors: true, roughness: 0.4, metalness: 0.15, envMapIntensity: env })), 12, true);
  scene.add(R.kiteIM, R.bugIM, R.mothIM); warm(R.kiteIM); warm(R.bugIM); warm(R.mothIM);
}
function buildEnemyParts() {
  const env = LITE ? 0 : 0.8;
  const wg = new THREE.CircleGeometry(1, 20); wg.scale(0.62, 0.34, 1); wg.translate(0.58, 0, 0); wg.rotateZ(0.35);
  R.wingIM = mkIM(wg, stdMat({ color: '#ffffff', roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false, emissive: '#30205a', envMapIntensity: env }), 140, true);
  R.wingIM.renderOrder = 2;
  R.lampIM = mkIM(new THREE.SphereGeometry(1, 10, 7), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 72, true);
  scene.add(R.wingIM, R.lampIM); warm(R.wingIM); warm(R.lampIM);
}

/* ------------------------------------------------------------ shots, pickups, shields */
function buildShots() {
  const bolt = new THREE.CapsuleGeometry(0.075, 0.85, 3, 8);
  R.boltIM = mkIM(bolt, new THREE.MeshBasicMaterial({ color: new THREE.Color(0.75, 1, 1), toneMapped: false }), 48, false);
  R.orbIM = mkIM(new THREE.SphereGeometry(0.2, 12, 8), new THREE.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), 180, true);
  R.orbIM.renderOrder = 5;
  scene.add(R.boltIM, R.orbIM); warm(R.boltIM); warm(R.orbIM);
}
function buildPickups() {
  const env = LITE ? 0 : 1;
  const mk = (geo, hex) => { const m = mkIM(geo, stdMat({ color: hex, emissive: hex, emissiveIntensity: 1.3, metalness: 0.5, roughness: 0.25, envMapIntensity: env }), 6, false); scene.add(m); warm(m); return m; };
  const star = new THREE.ExtrudeGeometry(starShape(5, 0.46, 0.2), { depth: 0.14, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 1 }); star.center();
  R.puIM = [mk(new THREE.OctahedronGeometry(0.42), '#ffb736'), mk(new THREE.IcosahedronGeometry(0.42, 1), '#5ee8ff'), mk(new THREE.TorusGeometry(0.32, 0.11, 8, 22), '#a58bff'), mk(star, '#ff6ad0')];
}
function buildBarriers() {
  const g = new THREE.BoxGeometry(BAR.cs * 0.9, BAR.cs * 0.9, 0.34);
  R.cellIM = mkIM(g, stdMat({ color: '#ff9a52', emissive: '#ff4a12', emissiveIntensity: 0.65, roughness: 0.45, metalness: 0.0 }), BAR.n * BAR.rows * BAR.cols, true);
  scene.add(R.cellIM); warm(R.cellIM);
}

/* ------------------------------------------------------------ particles: sparks, smoke and confetti */
function makePool(n, kind) {
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), spin = new Float32Array(n);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSpin', new THREE.BufferAttribute(spin, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 1 } }, vertexShader: PART_VS, fragmentShader: kind === 'add' ? PART_ADD : kind === 'conf' ? PART_CONF : PART_SOFT, transparent: true, depthWrite: false, blending: kind === 'add' ? THREE.AdditiveBlending : THREE.NormalBlending });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = kind === 'soft' ? 3 : 6;
  return { n, kind, pos, col, size, alpha, spin, geo, mat, pts, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), s0: new Float32Array(n), grow: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n), a0: new Float32Array(n), tw: new Float32Array(n), head: 0, live: 0 };
}
function buildParticles() {
  FX = { add: makePool(1600, 'add'), soft: makePool(420, 'soft'), conf: makePool(700, 'conf'), density: TIERS[R.q].fx };
  scene.add(FX.add.pts, FX.soft.pts, FX.conf.pts);
}
function emit(pool, x, y, z, vx, vy, vz, life, size, r, g, b, alpha, grav, drag, grow, tw) {
  const P = FX[pool]; const i = P.head; P.head = (P.head + 1) % P.n;
  P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
  P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
  P.col[i * 3] = r; P.col[i * 3 + 1] = g; P.col[i * 3 + 2] = b;
  P.life[i] = life; P.max[i] = life; P.s0[i] = size; P.size[i] = size; P.a0[i] = alpha; P.alpha[i] = alpha;
  P.grav[i] = grav; P.drag[i] = drag; P.grow[i] = grow; P.spin[i] = Math.random() * 6; P.tw[i] = tw || 0;
}
function stepPool(P, dt) {
  let any = false;
  for (let i = 0; i < P.n; i++) {
    if (P.life[i] <= 0) { if (P.alpha[i] !== 0) { P.alpha[i] = 0; any = true; } continue; }
    any = true;
    P.life[i] -= dt;
    const f = Math.max(0, P.life[i] / P.max[i]), dr = Math.exp(-P.drag[i] * dt), i3 = i * 3;
    P.vel[i3] *= dr; P.vel[i3 + 1] = P.vel[i3 + 1] * dr - P.grav[i] * dt; P.vel[i3 + 2] *= dr;
    if (P.kind === 'conf') { P.spin[i] += dt * 8; P.vel[i3] += Math.sin(P.spin[i] * 0.9) * dt * 3; }
    P.pos[i3] += P.vel[i3] * dt; P.pos[i3 + 1] += P.vel[i3 + 1] * dt; P.pos[i3 + 2] += P.vel[i3 + 2] * dt;
    P.size[i] = P.s0[i] * (1 + P.grow[i] * (1 - f));
    let a = P.a0[i] * (P.kind === 'add' ? f : Math.min(1, f * 2.5));
    if (P.tw[i] > 0) a *= 0.35 + 0.65 * (Math.sin(P.life[i] * 40 + i) > 0 ? 1 : 0.2);
    P.alpha[i] = a;
  }
  if (any) { P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aColor.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; P.geo.attributes.aAlpha.needsUpdate = true; if (P.kind === 'conf') P.geo.attributes.aSpin.needsUpdate = true; }
}
function buildRings() {
  R.rings = [];
  const geo = new THREE.RingGeometry(0.86, 1, 64);
  for (let i = 0; i < 8; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    m.visible = false; scene.add(m); R.rings.push({ m, t: 9, dur: 1, max: 3 });
  }
  warm(R.rings[0].m);
  // background firework shells
  for (let i = 0; i < 10; i++) R.shells.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, t: 0, fuse: 1, hue: 0 });
}
function ringAt(x, y, z, r, g, b, max, dur) {
  let s = R.rings[0];
  for (let i = 0; i < R.rings.length; i++) if (R.rings[i].t / R.rings[i].dur > s.t / s.dur) s = R.rings[i];
  s.t = 0; s.dur = dur || 0.6; s.max = max || 3; s.m.visible = true; s.m.position.set(x, y, z);
  s.m.material.color.setRGB(r, g, b);
}
function buildBeam() {
  const geo = new THREE.CylinderGeometry(0.2, 1, 1, 32, 1, true); geo.translate(0, -0.5, 0);
  R.beamU = { uTime: { value: 0 }, uA: { value: 0 } };
  R.beam = new THREE.Mesh(geo, new THREE.ShaderMaterial({ uniforms: R.beamU, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  R.beam.visible = false; R.beam.renderOrder = 3; scene.add(R.beam); warm(R.beam);
}

/* ------------------------------------------------------------ Rani Kandil, the lantern queen */
function buildBossA() {
  const g = new THREE.Group();
  const env = LITE ? 0 : 1;
  const starG = new THREE.ExtrudeGeometry(starShape(8, 2.75, 1.8), { depth: 0.9, bevelEnabled: true, bevelThickness: 0.22, bevelSize: 0.16, bevelSegments: 2, curveSegments: 1 }); starG.translate(0, 0, -0.45);
  R.bossPaper = stdMat({ color: '#d42a46', emissive: '#ff4a22', emissiveIntensity: 0.75, roughness: 0.6, metalness: 0.05, envMapIntensity: env });
  const star = new THREE.Mesh(starG, R.bossPaper);
  const gold = stdMat({ color: '#ffcf6a', metalness: 0.95, roughness: 0.22, envMapIntensity: env, emissive: '#3a2000' });
  const rim = new THREE.Mesh(merge([prep(new THREE.TorusGeometry(2.05, 0.11, 8, 56), '#ffffff', [0, 0, 0.62]), prep(new THREE.TorusGeometry(1.25, 0.08, 8, 40), '#ffffff', [0, 0, 0.66]), cyl(0.06, 0.06, 2.6, 6, '#ffffff', [0, -3.2, 0]), sph(0.2, '#ffffff', [0, -4.4, 0])]), gold);
  const spin = new THREE.Group(); spin.add(star, rim);
  R.heartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 0.8), toneMapped: false });
  const heart = new THREE.Mesh(new THREE.SphereGeometry(1.0, 24, 16), R.heartMat); heart.position.z = 0.25; heart.scale.set(1, 1, 0.55);
  const face = new THREE.Mesh(faceGeo(), stdMat({ vertexColors: true, roughness: 0.22, envMapIntensity: env }));
  face.scale.setScalar(2.5); face.position.set(0, 0.15, 0.95);
  g.add(spin, heart, face);
  g.userData = { spin, heart, face };
  g.visible = false; scene.add(g); R.boss = g; warm(g);
}
function buildBossB() {
  const env = LITE ? 0 : 1;
  const lantern = merge([cyl(0.52, 0.52, 0.95, 14, '#ffd0a8', [0, 0, 0]), cyl(0.3, 0.4, 0.16, 12, '#ffcf6a', [0, 0.55, 0]), cyl(0.4, 0.3, 0.16, 12, '#ffcf6a', [0, -0.55, 0]), cyl(0.03, 0.03, 0.5, 4, '#ffcf6a', [0, -0.85, 0])].concat([0, 1, 2, 3, 4, 5].map((k) => box(0.04, 0.95, 0.04, '#7a2a18', [Math.cos(k * Math.PI / 3) * 0.53, 0, Math.sin(k * Math.PI / 3) * 0.53]))));
  R.podIM = mkIM(lantern, stdMat({ vertexColors: true, emissive: '#ff6a22', emissiveIntensity: 0.85, roughness: 0.5, envMapIntensity: env }), 4, true);
  scene.add(R.podIM); warm(R.podIM);
  R.bossShieldU = { uCol: { value: new THREE.Color(0.4, 0.9, 1.4) }, uA: { value: 0 }, uTime: { value: 0 } };
  R.bossShield = new THREE.Mesh(new THREE.SphereGeometry(3.3, 32, 20), new THREE.ShaderMaterial({ uniforms: R.bossShieldU, vertexShader: FRES_VS, fragmentShader: FRES_FS, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  R.bossShield.visible = false; scene.add(R.bossShield); warm(R.bossShield);
}
function buildEnv() {
  // image based light: this sky plus a warm city band, so paint and metal catch the night
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(50, 24, 12), R.sky.material));
  const band = new THREE.Mesh(new THREE.CylinderGeometry(40, 40, 6, 32, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 0.55, 0.3), side: THREE.BackSide }));
  band.position.y = -6; es.add(band);
  const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 4.8, 4.4) })); moon.position.set(18, 22, -40); es.add(moon);
  scene.environment = pm.fromScene(es, 0.02, 0.1, 200).texture;
  scene.environmentIntensity = 0.8;
  pm.dispose();
}

/* ------------------------------------------------------------ effects the core asks for */
const PAL = {
  kite: [[1.6, 0.7, 0.2], [1.6, 0.35, 0.8], [0.3, 1.3, 1.2], [1.6, 1.3, 0.3]],
  bug: [[1.6, 1.1, 0.35], [0.3, 1.3, 1.2], [1.4, 1.4, 1.4]],
  moth: [[1.0, 0.5, 1.6], [1.6, 0.4, 0.9], [1.6, 1.4, 0.5]]
};
function sparks(x, y, z, n, speed, cols, life, size, tw) {
  if (!FX) return;
  const k = Math.max(1, Math.round(n * FX.density));
  for (let i = 0; i < k; i++) {
    const a = Math.random() * TAU, e = (Math.random() - 0.5) * 1.2, s = speed * (0.35 + Math.random() * 0.75), c = cols[i % cols.length];
    emit('add', x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(a) * Math.cos(e) * s, Math.sin(e) * s * 0.6, (life || 0.8) * (0.6 + Math.random() * 0.6), (size || 0.32) * (0.7 + Math.random() * 0.6), c[0], c[1], c[2], 1, 3.5, 2.2, -0.3, tw && Math.random() < 0.5 ? 1 : 0);
  }
}
function confetti(x, y, z, n, speed) {
  if (!FX) return;
  const k = Math.max(1, Math.round(n * FX.density));
  for (let i = 0; i < k; i++) {
    const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.8), c = CONF[i % CONF.length];
    emit('conf', x, y, z, Math.cos(a) * s, Math.sin(a) * s + 2, rand(2), 1.6 + Math.random() * 1.2, 0.34, c[0], c[1], c[2], 1, 4, 1.6, 0);
  }
}
const CONF = [[1, 0.35, 0.55], [0.25, 0.85, 0.8], [1, 0.8, 0.2], [0.6, 0.45, 1], [1, 1, 1]];
function smoke(x, y, z, n, sz, r, g, b) {
  if (!FX) return;
  const k = Math.max(1, Math.round(n * FX.density));
  for (let i = 0; i < k; i++) emit('soft', x + rand(0.6), y + rand(0.6), z + rand(0.4), rand(1.5), rand(1.5), rand(0.5), 1 + Math.random() * 0.8, sz || 1.2, r == null ? 0.35 : r, g == null ? 0.3 : g, b == null ? 0.42 : b, 0.4, -0.4, 1.4, 1.8);
}
function blast(x, y, z, k) { R.blastL.position.set(x, y, z + 1.5); R.blast = Math.max(R.blast, k); }
function firework(x, y, z, big) {
  const h = Math.random(), c1 = [CONF[(h * 5) | 0][0] * 2, CONF[(h * 5) | 0][1] * 2, CONF[(h * 5) | 0][2] * 2];
  sparks(x, y, z, big ? 110 : 60, big ? 16 : 11, [c1, [2, 1.8, 1.4], c1], big ? 1.6 : 1.2, big ? 1.4 : 0.9, true);
}
/* ------------------------------------------------------------ spectacle (shared VFX, loaded once the sky is built) */
// Moths and lantern pods go up in real fireballs with smoke and falling debris, the rocket's loss is a big
// blast and shockwave, a shield crackles with lightning, and the lantern queen dies in a chain of
// explosions in slow motion. Loaded only after the build; it adds no lights (the blast light is ours).
let VFX = null;
const _xv = new THREE.Vector3(), _xw = new THREE.Vector3(), _xn = new THREE.Vector3(0, 0, 1);
function loadVFX() {
  if (VFX !== null) return; VFX = false;
  import('/games/shared/vfx.js').then((m) => {
    try { const v = m.createVFX(renderer, scene, camera, { quality: Math.max(0, R.q), unit: 1, groundY: -14, lights: 0, reduced: ARC ? ARC.reducedMotion : false }); v.warm(); VFX = v; window.__vfxState = 'ok'; } catch (e) { VFX = false; window.__vfxState = 'create: ' + (e && e.message); }
  }).catch((e) => { VFX = false; window.__vfxState = 'import: ' + (e && e.message); });
}
function crackle(x, y, n, r) {
  if (!VFX) return;
  for (let i = 0; i < n; i++) { const a = Math.random() * TAU; VFX.lightning(_xv.set(x, y, 0.4), _xw.set(x + Math.cos(a) * r, y + Math.sin(a) * r, 0.4), { color: '#9fdcff', size: 0.35, duration: 0.3, branches: 1 }); }
}
function effect(type, x, y, p1, p2) {
  if (!FX || !R.ready) return;
  const rm = ARC && ARC.reducedMotion;
  switch (type) {
    case 'pop': {
      const pal = p1 === KITE ? PAL.kite : p1 === BUG ? PAL.bug : PAL.moth;
      sparks(x, y, 0.2, p1 === MOTH ? 46 : 30, p1 === MOTH ? 11 : 8, pal, 0.9, 0.34, true);
      confetti(x, y, 0.2, p1 === MOTH ? 18 : 10, 5);
      smoke(x, y, -0.2, 2, 1.0);
      ringAt(x, y, 0.3, 1.6, 1.2, 0.8, p1 === MOTH ? 3.2 : 2.2, 0.45);
      blast(x, y, 0, p1 === MOTH ? 1 : 0.6);
      if (VFX && p1 === MOTH) VFX.explosion(_xv.set(x, y, 0.2), { size: 0.38, color: '#c58bff' });
      if (p2) { sparks(x, y, 0.2, 30, 10, [[2, 1.6, 0.5]], 1.1, 0.4, true); }
      break;
    }
    case 'hit': sparks(x, y, 0.3, 8, 5, [[2, 1.8, 1.2]], 0.35, 0.26); break;
    case 'bosshit': sparks(x, y, 0.8, 18, 9, [[2, 1.2, 0.4], [2, 1.8, 1.2]], 0.6, 0.4); smoke(x, y, 0.5, 2, 1.6, 0.5, 0.25, 0.25); break;
    case 'muzzle': if (Math.random() < 0.5) emit('add', x + rand(0.2), y, 0.3, rand(1), 3, 0, 0.12, 0.6, 0.8, 1.6, 1.8, 1, 0, 0, 0, 0); break;
    case 'player':
      sparks(x, y, 0.3, 90, 13, [[2, 2, 2], [0.6, 1.8, 2], [2, 1.2, 0.4]], 1.3, 0.5, true);
      confetti(x, y, 0.3, 30, 7); smoke(x, y, 0, 10, 2.2, 0.4, 0.35, 0.5);
      ringAt(x, y, 0.3, 2, 2, 2, 6, 0.7); blast(x, y, 0, 2.2);
      if (VFX) { VFX.explosion(_xv.set(x, y, 0.3), { size: 0.75 }); VFX.ring(_xv.set(x, y, 0.4), '#9fdcff', { size: 3, normal: _xn, kind: 'shock' }); }
      if (POST && !rm) { POST.flash(0.35); POST.kick(5); }
      break;
    case 'cell': sparks(x, y, 0.2, p1 ? 4 : 9, 4, [[2, 1.3, 0.6]], 0.5, 0.24); if (!p1) smoke(x, y, 0, 1, 0.7, 0.6, 0.45, 0.35); break;
    case 'fizz': sparks(x, y, 0.3, 4, 3, [[2, 0.6, 1.4]], 0.3, 0.22); break;
    case 'shield': sparks(x, y, 0.5, 5, 4, [[0.6, 1.8, 2.2]], 0.3, 0.24); crackle(x, y, 1, 1.3); break;
    case 'shieldpop': sparks(x, y, 0.3, 40, 9, [[0.5, 1.8, 2.2]], 0.7, 0.34); ringAt(x, y, 0.3, 0.4, 1.6, 2, 3.2, 0.5); crackle(x, y, 4, 2.2); break;
    case 'pod': if (VFX) VFX.explosion(_xv.set(x, y, 0.5), { size: 0.6 }); sparks(x, y, 0.5, 70, 12, PAL.kite, 1.1, 0.45, true); confetti(x, y, 0.5, 20, 6); ringAt(x, y, 0.5, 2, 1.4, 0.6, 4.5, 0.6); blast(x, y, 0, 2); if (POST && !rm) POST.kick(3); break;
    case 'bosscrack': if (VFX) VFX.explosion(_xv.set(x, y, 0.8), { size: 0.8 }); ringAt(x, y, 0.8, 2, 1.6, 1, 8, 0.8); if (POST && !rm) { POST.flash(0.5, '#ffe0b0'); POST.kick(6); } blast(x, y, 0, 3); break;
    case 'bossdie':
      for (let i = 0; i < 6; i++) R.queue.push({ t: i * 0.16, x: x + rand(7), y: y + rand(5), big: i === 0, boom: true });
      if (VFX) { VFX.explosion(_xv.set(x, y, 0.8), { size: 1.4 }); VFX.timeWarp(0.35, 1.8); VFX.ring(_xv.set(x, y, 0.8), '#ffd27a', { size: 6, normal: _xn, kind: 'shock' }); }
      confetti(x, y, 0.8, 120, 12); ringAt(x, y, 0.8, 2, 2, 2, 14, 1.1); blast(x, y, 0, 4);
      if (POST && !rm) { POST.flash(0.7, '#fff2d0'); POST.kick(8); POST.letterbox(1, 1.6); }
      break;
    case 'bossin': if (POST && !rm) POST.letterbox(1, 3.0); break;
    case 'ring': ringAt(x, y, 0.6, 2, 0.5, 1.2, 3.5, 0.5); break;
    case 'nova': if (VFX) VFX.ring(_xv.set(x, y, 0.4), '#ff9af0', { size: 6, normal: _xn, kind: 'shock' }); ringAt(x, y, 0.4, 2, 0.6, 1.6, 15, 0.65); ringAt(x, y, 0.4, 1, 1.6, 2, 11, 0.55); sparks(x, y, 0.3, 50, 18, [[2, 0.7, 1.7], [1.8, 1.8, 2]], 0.8, 0.45); if (POST && !rm) { POST.flash(0.25, '#ffb0f0'); POST.kick(-3); } break;
    case 'pickup': ringAt(x, y, 0.4, 1, 1.8, 2, 3, 0.45); sparks(x, y, 0.3, 26, 7, [[2, 1.8, 1]], 0.6, 0.3, true); break;
    case 'dock': ringAt(x, y, 0.4, 0.6, 1.8, 2, 3.4, 0.6); sparks(x, y, 0.3, 30, 7, [[0.6, 1.8, 2], [2, 2, 2]], 0.7, 0.32, true); break;
    case 'capture': sparks(x, y, 0.3, 20, 5, [[1.2, 0.8, 2]], 0.8, 0.3); break;
    case 'launch': smoke(x, y, 0.5, 20, 1.6, 0.55, 0.45, 0.5); sparks(x, y, 0.4, 40, 6, [[2, 1.4, 0.5]], 0.7, 0.35); blast(x, y + 1, 0, 1.6); break;
    case 'fireworks':
      for (let i = 0; i < 5; i++) launchShell(rand(40), -40 - Math.random() * 70);
      for (let i = 0; i < 3; i++) R.queue.push({ t: 0.2 + i * 0.35, x: rand(14), y: 16 + Math.random() * 10, big: false });
      break;
  }
}
function launchShell(x, z) {
  let s = null; for (let i = 0; i < R.shells.length; i++) if (!R.shells[i].on) { s = R.shells[i]; break; }
  if (!s) return;
  s.on = true; s.x = x; s.z = z; s.y = -10; s.vx = rand(3); s.vy = 22 + Math.random() * 8; s.t = 0; s.fuse = 1.1 + Math.random() * 0.6; s.hue = Math.random();
}

/* ------------------------------------------------------------ newGame */
function newGame() {
  if (FX) { FX.add.life.fill(0); FX.soft.life.fill(0); FX.conf.life.fill(0); }
  R.queue.length = 0; R.camInit = false; R.warm = 0;
}

/* ------------------------------------------------------------ per frame: sync the scene to the core */
const KC = [[1.0, 0.55, 0.18], [1.0, 0.3, 0.62], [0.25, 0.85, 0.8], [1.0, 0.8, 0.2]];
const COL_MOTH = [0.45, 0.32, 1.0], COL_MOTH_HURT = [1.0, 0.3, 0.75], COL_BUG = [0.12, 0.72, 0.62];
const WING_MOTH = [0.85, 0.65, 1.5], WING_MOTH_HURT = [1.4, 0.6, 1.2], WING_BUG = [0.6, 1.2, 1.3];
const PU_N = [0, 0, 0, 0], PCOL = [[0.8, 0.5, 0.1], [0.2, 0.7, 0.85], [0.5, 0.35, 0.9], [0.85, 0.25, 0.65]];
let haloN = 0;
function halo(x, y, z, s, r, g, b) { if (haloN >= 420) return; setZ(R.halo, haloN, x, y, z, 0, s, s, s); setCol(R.halo, haloN, r, g, b); haloN++; }
function sync(a, G, dt) {
  const al = G.alpha, t = R.time, P = G.P;
  haloN = 0;
  // the rocket(s)
  const r0 = R.rockets[0], r1 = R.rockets[1];
  const showP = P.alive || P.state === 'launch';
  const blink = P.inv > 0 && !a.reducedMotion && Math.floor(t * 14) % 2 === 0 && P.state !== 'launch';
  const px = lerp(P.px, P.x, al), py = lerp(P.py, P.y, al);
  const thrust = G.phase === 'launch' ? 1.8 : 1 + Math.abs(P.vx) * 0.02;
  if (showP && !blink) {
    if (P.dual) { placeRocket(r0, px - DUAL_DX, py, P.lean, thrust, t); placeRocket(r1, px + DUAL_DX, py, P.lean, thrust, t + 1); r1.visible = true; }
    else { placeRocket(r0, px, py, P.lean, thrust, t); r1.visible = false; }
    r0.visible = true;
    R.engine.position.set(px, py - 1.2, 0.8); R.engine.intensity = 14 * thrust;
    halo(px, py - 1.15, 0.3, 1.8, 0.9, 0.45, 0.15);
    if (P.dual) halo(px + DUAL_DX, py - 1.15, 0.3, 1.6, 0.9, 0.45, 0.15);
    if (a.state === 'play' || G.cfg.attract) {
      const ex = P.dual ? px + (Math.random() < 0.5 ? -DUAL_DX : DUAL_DX) : px;
      if (Math.random() < FX.density * 1.6) emit('add', ex + rand(0.15), py - 1.35, 0, rand(0.8), -5 - Math.random() * 4, 0, 0.32, 0.42, 1.8, 0.9, 0.35, 1, 0, 1, -0.5, 0);
      if (Math.random() < FX.density * (G.phase === 'launch' ? 1 : 0.18)) emit('soft', ex + rand(0.3), py - 1.6, -0.2, rand(0.6), -2.5, 0, 1.2, 0.9, 0.5, 0.42, 0.55, 0.32, -0.6, 1.2, 2.2);
    }
  } else { r0.visible = false; r1.visible = false; R.engine.intensity = 0; }
  if (P.state === 'captured') { const c = R.rockets[2]; c.visible = true; c.userData.body.material = R.captiveMat; c.position.set(P.x, P.cy, 0); c.rotation.set(0, P.spin, Math.sin(P.spin) * 0.4); R.flames[2].visible = false; }
  // shield
  R.shield.visible = P.shield > 0 && showP;
  if (R.shield.visible) { R.shield.position.set(px, py, 0); R.shield.scale.set(P.dual ? 1.75 : 1, 1.05, 1); R.shieldU.uA.value = Math.min(1, P.shield) * (0.8 + 0.2 * Math.sin(t * 8)); R.shieldU.uTime.value = t; }
  // captives on moths, the rescued rocket, a lost rocket
  let cap = P.state === 'captured' ? 3 : 2;
  if (P.state !== 'captured') R.rockets[2].visible = false;
  R.rockets[3].visible = false;
  // raiders
  let kN = 0, bN = 0, mN = 0, wN = 0, lN = 0;
  for (let i = 0; i < G.E.length; i++) {
    const e = G.E[i]; if (!e.on || e.st === S_WAIT) continue;
    let x = lerp(e.px, e.x, al), y = lerp(e.py, e.y, al) + (e.dive ? 0 : Math.sin(t * (2.0 + (e.seed % 1) * 0.5) + e.seed) * 0.07);
    let ang = lerp(e.pang, e.ang, al);
    // a raider winds up before it peels off (a little rise and a shiver), and when the rocket goes down the
    // whole formation bobs with glee; each keeps its own timing
    if (e.dive && e.t < 0.32 && !a.reducedMotion) { const w = Math.sin(e.t / 0.32 * Math.PI); y += w * 0.28; ang += Math.sin(e.t * 60 + e.seed) * 0.12 * w; }
    if (!e.dive && P.state === 'dead' && !a.reducedMotion) y += Math.abs(Math.sin(t * (7 + (e.seed % 3)) + e.seed)) * 0.22;
    const fl = e.flash;
    if (e.type === KITE) {
      ang += Math.sin(t * 3 + e.seed) * 0.13;
      const c = KC[(e.col + e.row + G.stage) % 4];
      setZ(R.kiteIM, kN, x, y, 0, ang, 0.95, 0.95, 0.95);
      setCol(R.kiteIM, kN, lerp(c[0], 4, fl), lerp(c[1], 4, fl), lerp(c[2], 4, fl)); kN++;
      setZ(R.lampIM, lN, x + Math.sin(ang) * -0.1, y + Math.cos(ang) * 0.1, 0.24, 0, 0.09, 0.09, 0.09); setCol(R.lampIM, lN, 2.2, 1.8, 1.0); lN++;
    } else {
      const moth = e.type === MOTH, sc = moth ? 1.12 : 0.95;
      const hurt = moth && e.hp < e.maxHp;
      const base = moth ? (hurt ? COL_MOTH_HURT : COL_MOTH) : COL_BUG;
      const im = moth ? R.mothIM : R.bugIM, n = moth ? mN++ : bN++;
      setZ(im, n, x, y, 0, ang, sc, sc, sc); setCol(im, n, lerp(base[0], 4, fl), lerp(base[1], 4, fl), lerp(base[2], 4, fl));
      // the glowing lantern belly
      const ca = Math.cos(ang), sa = Math.sin(ang), ly = 0.36 * sc;
      const lx2 = x - sa * ly, ly2 = y + ca * ly, pulse = 0.85 + 0.15 * Math.sin(t * 4 + e.seed);
      const lr = moth ? 0.24 : 0.27;
      setZ(R.lampIM, lN, lx2, ly2, 0.02, 0, lr * sc, lr * sc, lr * sc);
      if (moth) setCol(R.lampIM, lN, 1.6 * pulse, 0.9 * pulse, 2.4 * pulse); else setCol(R.lampIM, lN, 2.6 * pulse, 1.6 * pulse, 0.5 * pulse);
      lN++;
      halo(lx2, ly2, -0.1, moth ? 2.4 : 2.0, moth ? 0.35 : 0.5, moth ? 0.2 : 0.3, moth ? 0.5 : 0.08);
      // wings
      const flap = Math.sin(t * (moth ? 10 : 18) + e.seed) * 0.75;
      const wc = moth ? (hurt ? WING_MOTH_HURT : WING_MOTH) : WING_BUG;
      for (let d = -1; d <= 1; d += 2) {
        _q.setFromAxisAngle(_v.set(0, 0, 1), ang);
        _p.set(d * 0.18 * sc, 0.0, -0.06).applyQuaternion(_q).add(_v2.set(x, y, 0));
        _q2.setFromEuler(_e.set(0, d * flap, 0, 'XYZ')); _q.multiply(_q2);
        _s.set(d * sc * (moth ? 1.35 : 0.88), sc * (moth ? 1.3 : 0.86), sc);
        _m.compose(_p, _q, _s); R.wingIM.setMatrixAt(wN, _m); setCol(R.wingIM, wN, wc[0], wc[1], wc[2]); wN++;
      }
      if (moth && e.captive) {
        const c = R.rockets[cap < 4 ? cap++ : 3];
        c.visible = true; c.position.set(x, y + 1.35, 0); c.rotation.set(0, t * 0.8, Math.PI + ang * 0.5); R.flames[R.rockets.indexOf(c)].visible = false; c.userData.body.material = R.captiveMat;
      }
    }
    if (e.gift) halo(x, y, -0.3, 3.2 + Math.sin(t * 5) * 0.4, 0.55, 0.42, 0.1);
  }
  flushIM(R.kiteIM, kN); flushIM(R.bugIM, bN); flushIM(R.mothIM, mN); flushIM(R.wingIM, wN);
  // a rescued rocket glides down, a lost one flies away
  const Rs = G.rescue;
  if (Rs.on) { const c = R.rockets[3]; c.visible = true; c.position.set(lerp(Rs.px, Rs.x, al), lerp(Rs.py, Rs.y, al), 0); c.rotation.set(0, Rs.spin, Math.sin(Rs.spin) * 0.3); R.flames[3].visible = true; c.userData.body.material = R.rocketMat; }
  else if (G.lost.on) { const c = R.rockets[3]; c.visible = true; c.position.set(G.lost.x, G.lost.y, 0); c.rotation.set(0, G.lost.spin, Math.PI); R.flames[3].visible = false; c.userData.body.material = R.captiveMat; }
  // boss
  const B = G.boss, bg = R.boss;
  if (B.on) {
    const bx = lerp(B.px, B.x, al), by = lerp(B.py, B.y, al);
    bg.visible = true; bg.position.set(bx, by, 0);
    bg.userData.spin.rotation.z = B.rot * 0.35;
    const dy = B.dying > 0 ? B.dying : 0;
    bg.userData.spin.scale.setScalar(1 + dy * 0.05);
    R.bossPaper.emissiveIntensity = 0.75 + B.flash * 1.8 + dy * 0.8 + 0.12 * Math.sin(t * 3);
    const hk = 1 + B.flash * 1.5 + dy;
    R.heartMat.color.setRGB(2.2 * hk, 1.6 * hk, 0.8 * hk);
    bg.userData.face.rotation.y = clamp((px - bx) * 0.03, -0.3, 0.3);
    bg.userData.face.position.y = 0.15 + Math.sin(t * 2) * 0.05;
    R.bossL.position.set(bx, by, 3); R.bossL.intensity = 40 + B.flash * 60;
    let pN = 0;
    for (let i = 0; i < 4; i++) {
      const p = B.pods[i]; if (p.hp <= 0) continue;
      const qx = lerp(p.px, p.x, al), qy = lerp(p.py, p.y, al);
      setZ(R.podIM, pN, qx, qy, 0.3, Math.sin(t * 2 + i) * 0.15, 1, 1, 1);
      const fk = p.flash * 3; setCol(R.podIM, pN, 1 + fk, 1 + fk, 1 + fk); pN++;
      halo(qx, qy, 0.1, 3.4, 0.7, 0.32, 0.08);
    }
    flushIM(R.podIM, pN);
    R.bossShield.visible = B.shield > 0.03; R.bossShield.position.set(bx, by, 0.3); R.bossShieldU.uA.value = B.shield * (0.7 + 0.3 * Math.sin(t * 5)); R.bossShieldU.uTime.value = t;
    halo(bx, by, 0.6, 7 + Math.sin(t * 3), 0.6, 0.3, 0.1);
  } else {
    bg.visible = false; flushIM(R.podIM, 0); R.bossShield.visible = false; R.bossL.intensity = 0;
  }
  // the tractor beam
  const bm = G.beam;
  if (bm.on && G.E[bm.e] && G.E[bm.e].on) {
    const e = G.E[bm.e], x = lerp(e.px, e.x, al), y = lerp(e.py, e.y, al) - 0.6;
    R.beam.visible = true; R.beam.position.set(x, y, 0); R.beam.scale.set(bm.w, y + 0.6, bm.w * 0.6); R.beamU.uA.value = bm.open; R.beamU.uTime.value = t;
    halo(x, y, 0.5, 2.5 * bm.open, 0.5, 0.35, 0.9);
  } else R.beam.visible = false;
  // shots
  let n = 0;
  for (let i = 0; i < G.PB.length; i++) {
    const b = G.PB[i]; if (!b.on) continue;
    const x = lerp(b.px, b.x, al), y = lerp(b.py, b.y, al);
    setZ(R.boltIM, n++, x, y, 0.1, -Math.atan2(b.vx, b.vy), 1, 1, 1);
    halo(x, y - 0.1, 0.05, 1.3, 0.25, 0.55, 0.6);
  }
  flushIM(R.boltIM, n);
  n = 0;
  for (let i = 0; i < G.EB.length; i++) {
    const b = G.EB[i]; if (!b.on) continue;
    const x = lerp(b.px, b.x, al), y = lerp(b.py, b.y, al), big = b.k ? 1.35 : 1, pu = 0.85 + 0.15 * Math.sin(t * 20 + i);
    setZ(R.orbIM, n, x, y, 0.2, 0, big * pu, big * pu, big * pu);
    if (b.k) setCol(R.orbIM, n, 1.0, 0.55, 0.95); else setCol(R.orbIM, n, 1.0, 0.72, 0.55);
    n++;
    if (b.k) halo(x, y, 0.15, 2.1, 0.75, 0.15, 0.6); else halo(x, y, 0.15, 1.7, 0.85, 0.28, 0.12);
  }
  flushIM(R.orbIM, n);
  // pickups
  const pc = PU_N; pc[0] = pc[1] = pc[2] = pc[3] = 0;
  for (let i = 0; i < G.PU.length; i++) {
    const p = G.PU[i]; if (!p.on) continue;
    const im = R.puIM[p.k], x = lerp(p.px, p.x, al), y = lerp(p.py, p.y, al);
    _q.setFromEuler(_e.set(t * 1.3, t * 2.1, 0, 'XYZ')); _p.set(x, y, 0.5); _s.set(1, 1, 1);
    _m.compose(_p, _q, _s); im.setMatrixAt(pc[p.k]++, _m);
    const c = PCOL[p.k]; halo(x, y, 0.2, 2.6 + Math.sin(t * 6) * 0.3, c[0], c[1], c[2]);
  }
  for (let k = 0; k < 4; k++) flushIM(R.puIM[k], pc[k]);
  // shields
  n = 0;
  for (let b = 0; b < BAR.n; b++) for (let r = 0; r < BAR.rows; r++) for (let c = 0; c < BAR.cols; c++) {
    const hp = G.cells[(b * BAR.rows + r) * BAR.cols + c]; if (!hp) continue;
    const s = hp > 1 ? 1 : 0.78, w = 0.9 + 0.1 * Math.sin(t * 2 + c + r * 2);
    setZ(R.cellIM, n, barX(b, c), barY(r), -0.1, hp > 1 ? 0 : 0.2, s, s, s);
    const ck = (c + r) % 2 ? 1 : 0.78;
    setCol(R.cellIM, n, hp > 1 ? w * ck : 0.45, hp > 1 ? w * 0.8 * ck : 0.3, hp > 1 ? w * 0.6 * ck : 0.32); n++;
  }
  flushIM(R.cellIM, n);
  flushIM(R.lampIM, lN);
  // the nova ring keeps its own halo ring
  if (G.nova.on) { const N = G.nova; for (let k = 0; k < 18; k++) { const aa = k / 18 * TAU + t; halo(N.x + Math.cos(aa) * N.r, N.y + Math.sin(aa) * N.r, 0.3, 2.2, 0.8, 0.25, 0.65); } }
  flushIM(R.halo, haloN);
}
function placeRocket(g, x, y, lean, thrust, t) {
  g.visible = true; g.position.set(x, y, 0);
  g.rotation.set(0, -lean * 1.3, lean * 0.22);
  const f = R.flames[R.rockets.indexOf(g)];
  f.visible = true; f.scale.set(1, (0.8 + 0.25 * Math.sin(t * 31)) * thrust * 1.1, 1); f.userData.u.uTime.value = t; f.userData.u.uPow.value = 1.2;
  g.userData.body.material = R.rocketMat;
}

/* ------------------------------------------------------------ camera per frame */
const _look = new THREE.Vector3(), _cq = new THREE.Quaternion(), _bq = new THREE.Quaternion(), _tmpCam = new THREE.PerspectiveCamera();
function cameraFrame(a, G, dt) {
  const rm = a.reducedMotion, B = R.base, P = G.P;
  const px = lerp(P.px, P.x, G.alpha);
  // the shot the game is filmed from: a touch of follow on the rocket for parallax
  _p.copy(B.pos); _look.copy(B.look);
  if (!rm) { _p.x += px * 0.035; _look.x += px * 0.02; }
  let blend = 0;
  if (G.phase === 'launch' && !G.cfg.attract) {
    // launch: start close behind the rocket on the roof, then pull back to the battle view
    const k = clamp(G.pt / 2.5, 0, 1), e = k * k * (3 - 2 * k);
    blend = rm ? 0 : 1 - e;
    _v.set(px + 2.4, lerp(P.y, PY, 0.2) - 0.8, 5.5);
    _v2.set(px, P.y + 1.2, 0);
    _tmpCam.position.copy(_v); _tmpCam.lookAt(_v2); _cq.copy(_tmpCam.quaternion);
  } else if (G.phase === 'bossIntro' && G.boss.on) {
    const k = clamp(G.pt / 3.3, 0, 1);
    blend = rm ? 0 : Math.sin(k * Math.PI) * 0.55;
    _v.set(G.boss.x * 0.5, G.boss.y - 3, 26);
    _v2.set(G.boss.x, G.boss.y, 0);
    _tmpCam.position.copy(_v); _tmpCam.lookAt(_v2); _cq.copy(_tmpCam.quaternion);
  } else if (G.boss.on && G.boss.dying > 0) {
    blend = rm ? 0 : Math.min(0.35, G.boss.dying * 0.4);
    _v.set(G.boss.x * 0.6, G.boss.y - 2, 30); _v2.set(G.boss.x, G.boss.y, 0);
    _tmpCam.position.copy(_v); _tmpCam.lookAt(_v2); _cq.copy(_tmpCam.quaternion);
  }
  _tmpCam.position.copy(_p); _tmpCam.lookAt(_look); _bq.copy(_tmpCam.quaternion);
  if (blend > 0.001) { _p.lerp(_v, blend); _bq.slerp(_cq, blend); }
  if (!R.camInit) { R.camPos.copy(_p); R.camInit = true; }
  else R.camPos.lerp(_p, 1 - Math.exp(-dt * 10));
  camera.position.copy(R.camPos);
  camera.quaternion.copy(_bq);
  if (!rm) { camera.position.x += (a.shakeX || 0) * 0.035; camera.position.y += (a.shakeY || 0) * 0.035; }
  camera.updateMatrixWorld();
  R.sky.position.copy(camera.position);
}

/* ------------------------------------------------------------ render */
function measure(dtRaw, a) {
  if (R.warm < 20) { R.warm++; return; }
  R.fT += dtRaw; R.fN++;
  if (R.fT >= 1.5) {
    R.fps = R.fN / R.fT; R.fT = 0; R.fN = 0;
    if (!R.lock && R.ready && R.fps < 42 && R.q > 0) { setQuality(R.fps < 24 ? Math.max(0, R.q - 2) : R.q - 1); R.warm = 0; }
  }
}
function render(a, G, ctx) {
  if (!renderer) return false;
  const now = performance.now(), dtRaw = R.last ? (now - R.last) / 1000 : 1 / 60, dt = clamp(dtRaw, 0.001, 0.05); R.last = now;
  let lost = R.lost;
  try { lost = lost || renderer.getContext().isContextLost(); } catch (e) { lost = true; }
  if (lost) {
    ctx.fillStyle = 'rgba(6,5,12,.9)'; ctx.fillRect(0, 0, a.w, a.h);
    ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = '#fbf5ec'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Graphics paused. Restoring...', a.w / 2, a.h / 2);
    return false;
  }
  pump();
  if (R.ready) measure(dtRaw, a);
  const paused = a.state === 'pause';
  const sdt = paused ? 0 : dt * (G.slowmo > 0 && !a.reducedMotion ? 0.45 : 1);
  if (!paused) R.time += dt;
  const t = R.time;
  R.skyU.uTime.value = t; R.skyU.uNeb.value = 1;
  if (R.starU) { R.starU.uTime.value = t; R.starU.uScale.value = renderer.getPixelRatio(); R.starU.uSpeed.value = G.phase === 'launch' ? 1 + 4 * (1 - clamp(G.pt / 2.6, 0, 1)) : G.boss.on ? 1.6 : 1; }
  if (R.cityU) R.cityU.uTime.value = t;
  if (R.lightU) { R.lightU.uTime.value = t; R.lightU.uScale.value = R.scale; }
  cameraFrame(a, G, dt);
  if (R.ready) {
    sync(a, G, sdt);
    // effects queued by the core: staggered fireworks
    for (let i = R.queue.length - 1; i >= 0; i--) { const q = R.queue[i]; q.t -= sdt; if (q.t <= 0) { firework(q.x, q.y, 0.4, q.big); blast(q.x, q.y, 0, 1.5); if (q.boom && VFX) VFX.explosion(_xv.set(q.x, q.y, 0.6), { size: 0.9 }); R.queue.splice(i, 1); } }
    // background shells over the city, now and then, and for every clear
    if (!paused && Math.random() < sdt * (a.state === 'menu' ? 0.35 : 0.08)) launchShell(rand(120), -60 - Math.random() * 120);
    for (let i = 0; i < R.shells.length; i++) {
      const s = R.shells[i]; if (!s.on) continue;
      s.t += sdt; s.vy -= 9 * sdt; s.x += s.vx * sdt; s.y += s.vy * sdt;
      if (FX && Math.random() < 0.7) emit('add', s.x, s.y, s.z, rand(0.5), -1, 0, 0.5, 1.6, 1.6, 1.0, 0.5, 0.8, 1, 1, 0, 0);
      if (s.t >= s.fuse) { s.on = false; const c = CONF[(s.hue * 5) | 0]; sparks(s.x, s.y, s.z, 70, 14, [[c[0] * 2, c[1] * 2, c[2] * 2], [2, 1.9, 1.6]], 1.6, 3.2, true); }
    }
    stepPool(FX.add, sdt); stepPool(FX.soft, sdt); stepPool(FX.conf, sdt);
    FX.add.mat.uniforms.uScale.value = R.scale; FX.soft.mat.uniforms.uScale.value = R.scale; FX.conf.mat.uniforms.uScale.value = R.scale;
    for (let i = 0; i < R.rings.length; i++) {
      const s = R.rings[i]; if (s.t >= s.dur) { s.m.visible = false; continue; }
      s.t += sdt; const k = s.t / s.dur, e = 1 - Math.pow(1 - k, 3);
      s.m.scale.setScalar(0.2 + s.max * e); s.m.material.opacity = (1 - k) * (1 - k);
      if (k >= 1) s.m.visible = false;
    }
    R.blast *= Math.exp(-sdt * 9); R.blastL.intensity = R.blast * 60;
  }
  if (VFX) { VFX.setReduced(a.reducedMotion); VFX.update(paused ? 0 : dt); VFX.applyShake(camera); }
  try { if (POST) POST.render(scene, camera); else renderer.render(scene, camera); } catch (e) { if (VFX) VFX.removeShake(camera); return false; }
  if (VFX) VFX.removeShake(camera);
  return true;
}
const _pv = new THREE.Vector3();
function project(x, y, z, out) {
  _pv.set(x, y, z).project(camera);
  out.x = (_pv.x * 0.5 + 0.5) * ARC.w; out.y = (0.5 - _pv.y * 0.5) * ARC.h;
  out.on = _pv.z < 1; return out.on;
}
function debug() {
  if (!renderer) return null;
  const info = renderer.info.render;
  return { quality: R.q, lock: R.lock, fps: Math.round(R.fps), soft: R.soft, post: !!(POST && POST.enabled), calls: info.calls, tris: info.triangles, ready: R.ready, tasks: R.ti + '/' + R.tasks.length, longestTask: Math.round(R.longest), taskMs: R.taskMs.join(','), pr: +renderer.getPixelRatio().toFixed(2), programs: renderer.info.programs ? renderer.info.programs.length : 0 };
}

// A last check that this browser can really draw 3D; if not, the 2D edition plays instead.
const GLINFO = { soft: false };
function canGL() {
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
else { const s = document.createElement('script'); s.src = '/games/akash-raiders/game.js'; document.body.appendChild(s); }
