/*
 * Spectacle VFX for the 3D arcade games: explosions, fire, smoke, sparks,
 * fireworks, confetti, trails, lightning, shockwaves, paint and powder.
 *
 *   import { createVFX } from '/games/shared/vfx.js';
 *   const vfx = createVFX(renderer, scene, camera, { quality: q, unit: 1, groundY: 0 });
 *   vfx.warm();                          // once, before play: compiles every shader (returns a promise)
 *   // each frame:
 *   const k = vfx.update(rawDt);         // simulates everything; k = slow-motion factor (1 normally)
 *   const dt = rawDt * k;                // optional: run your own game in the same slow motion
 *   vfx.applyShake(camera); fx.render(scene, camera); vfx.removeShake(camera);
 *
 * Construction. createVFX(renderer, scene, camera, o):
 *   o.quality  0..3 tier (default 2). vfx.setQuality(q) changes it live.
 *   o.unit     world units per metre (default 1). Every size, speed and gravity is in metres times unit.
 *   o.groundY  ground height: a number, or a function (x, z) -> y. Particles bounce and settle on it,
 *              rings and decals sit on it, and billboards fade softly where they meet it.
 *   o.reduced  reduced motion (default: the prefers-reduced-motion media query). No flashes, no shake,
 *              no slow motion, no speed lines, smaller bursts. Effects still play.
 *   o.soft     software renderer (default: detected). Treated as tier 0 unless o.force.
 *   o.force    full quality even on a software renderer. For screenshot tooling: add ?vfx=full to the
 *              page address (or set window.__VFX_FULL = true before the game loads) and every VFX instance
 *              runs at tier 3 with force on, and ignores setQuality.
 *   o.lights   number of real point lights for explosions and bursts (default 1 at tier >= 1 on a
 *              GPU, 0 otherwise). They are added to the scene at creation with intensity 0 so the light
 *              count never changes later (no shader recompiles). Create the VFX before your own
 *              compile step, or call vfx.warm() after it.
 *   o.lighting { dir: [x,y,z] towards the sun, sun: '#hex', ambient: '#hex' } for the smoke shading.
 *              Default: read from the first DirectionalLight in the scene. vfx.setLighting() later.
 *
 * One-shot presets (pos is a THREE.Vector3 or {x,y,z}; all options optional):
 *   vfx.explosion(pos, { size: 1, color })          flash, fireball, rolling lit smoke, bouncing sparks,
 *                                                   smoking debris, ground shockwave, dust skirt,
 *                                                   scorch mark, a real light, camera trauma
 *   vfx.impact(pos, normal, { kind, color, size })  kind: 'spark' | 'dust' | 'paint' | 'water' | 'glass' | 'powder'
 *   vfx.muzzle(pos, dir, { color, size })           paintball marker puff (air and paint mist, never fire)
 *   vfx.splat(pos, normal, { color, size })         paint impact: droplets, a splat decal, a little powder
 *   vfx.confetti(pos, { count, size, colors })
 *   vfx.fireworks(pos, { burst, count, size, color, color2, launch: true, delay })
 *        burst: 'peony' | 'chrysanthemum' | 'willow' | 'ring' | 'palm' | 'crackle' | 'mixed' (default)
 *        pos is where the shell bursts; with launch it rises from the ground below on a spark trail.
 *   vfx.goalBurst(pos, { color, color2, size })     stadium goal: confetti cannons, pyro jets, fireworks,
 *                                                   a team-colour shockwave
 *   vfx.winBurst(pos, { colors, size })             victory: more of the same, plus a gold shower
 *   vfx.ring(pos, color, { size, normal, kind })    energy / pickup ring; kind 'energy' (default) | 'shock' | 'ripple'
 *   vfx.dust(pos, { size, color, vel })
 *   vfx.splash(pos, { size })                       water crown, jet, mist, ripples
 *   vfx.lightning(a, b, { color, size, duration, branches })
 *   vfx.shatter(mesh, { pieces, color, force, origin, size, hide: true })
 *        breaks a simple mesh into tumbling shards and hides it (set mesh.visible = true to restore)
 *   vfx.burst(pos, { color, size })                 a generic colourful power burst (sparkle + ring + glow)
 *
 * Continuous effects return a handle (pooled, no allocation): handle.stop(), handle.set(level 0..1),
 * and handle.active. Release them with stop().
 *   vfx.trail(target, { color, width, life, offset, core })   ribbon trail; target is an Object3D or a
 *                                                   Vector3 you keep updating. offset is local [x,y,z].
 *   vfx.nitro(object, { color, offset, dir, size })  flame jet + heat glow + exhaust smoke; offset is the
 *                                                   nozzle in local space, dir the local exhaust direction
 *                                                   (default [0,0,-1]); handle.set(0..1) throttles it
 *   vfx.smokePlume(pos, { size, duration, color, fire }) rising lit smoke column (duration 0 = until stop)
 *   vfx.pyro(pos, { size, duration, color })        a stage flame jet
 *   vfx.speedLines(camera, amount)                  screen-edge streaks, amount 0..1 (eases), call any time
 *   vfx.godRays(lightPos, { color, strength })      soft light shafts from a bright source (one at a time)
 *   vfx.lensFlare(lightPos, { color, strength })    ghosts and a streak for a sun or floodlight (one at a time)
 *
 * Time and camera:
 *   vfx.timeWarp(scale, seconds)  slow motion (eases in and out); returns the current factor. update()
 *                                 returns it each frame; vfx.timeScale reads it. Always 1 under reduced motion.
 *   vfx.shake(amount)             add camera trauma (0..1). Presets add their own.
 *   vfx.applyShake(camera) / vfx.removeShake(camera)  offset the camera just for the draw.
 *
 * Scrolling worlds (the street moves under a fixed camera): vfx.translate(dx, dy, dz) moves every live
 *   effect by that amount this frame, or vfx.setWorldOffset(vec3) with the world's total offset (it moves
 *   effects by the change since the last call). Nitro jets and trails already follow their objects.
 *
 * Other: vfx.setQuality(q), vfx.setReduced(b), vfx.setCamera(cam), vfx.setGround(y | fn),
 *   vfx.setLighting(o), vfx.clear(), vfx.stats(), vfx.dispose(), vfx.meshes (everything it added).
 *
 * How it is built. Six instanced draw calls at most for all particles: an additive layer (glows,
 * streaked sparks, noise flames with a blackbody ramp, lens-glare flashes), an alpha layer (lit noise
 * smoke and dust sorted back to front, water droplets, powder), 3D confetti, lit debris chunks and
 * shards (MeshStandardMaterial, so they take the scene's own light), ground rings and decals. Trails and
 * lightning are camera-facing ribbons, speed lines and flares one screen-space instanced mesh.
 * Everything is pre-allocated at creation: fixed pools, typed arrays, no allocation per frame. The
 * simulation (gravity, drag, buoyancy, turbulence, ground bounce and settle) runs on the CPU, the
 * shapes and shading on the GPU. Billboards fade where they cross the ground plane and near the
 * camera, so there are no hard intersections; every shape is procedural (no textures, no square
 * edges). Pools overflow by dropping new particles, never by stealing visible ones.
 *
 * Quality tiers: particle counts x0.3 / 0.55 / 0.8 / 1, noise octaves 1 / 2 / 3 / 4, firework trail
 * sparks only at tier 2+, real lights only when o.lights > 0. Tier 0 and a software renderer still
 * show every effect, just thinner.
 *
 * Limits: no scene depth buffer is read, so particles fade against the ground plane only (not against
 * walls); god rays and flares are not occluded by geometry; the alpha layer is sorted within itself
 * only. Fireworks, flares and rays are one shared screen mesh (one light source at a time).
 */
// VFX_API: stable
import * as THREE from '/games/vendor/three/three.module.min.js';
import { isSoftRenderer } from '/games/shared/fx3d.js';

const TAU = Math.PI * 2;
const rnd = (a, b) => a + Math.random() * (b - a);
const rr = (r) => r[0] + Math.random() * (r[1] - r[0]);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeOut = (t) => 1 - (1 - t) * (1 - t) * (1 - t);

/* ------------------------------------------------------------------ shaders */

const NOISE = [
  'uniform int uOct;',
  'float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }',
  'float vnoise(vec3 x) {',
  '  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);',
  '  return mix(mix(mix(h31(i), h31(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 0.0)), h31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),',
  '             mix(mix(h31(i + vec3(0.0, 0.0, 1.0)), h31(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h31(i + vec3(0.0, 1.0, 1.0)), h31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);',
  '}',
  'float fbm(vec3 p) {',
  '  float s = 0.0, a = 0.5, t = 0.0;',
  '  for (int i = 0; i < 4; i++) { if (i >= uOct) break; s += a * vnoise(p); t += a; p = p * 2.07 + vec3(3.1, 1.7, 5.3); a *= 0.5; }',
  '  return s / t;',
  '}',
  'vec3 heatCol(float t) {',
  '  t = clamp(t, 0.0, 1.6);',
  '  vec3 c = vec3(0.5, 0.05, 0.02) * smoothstep(0.0, 0.22, t);',
  '  c = mix(c, vec3(1.0, 0.3, 0.05), smoothstep(0.12, 0.42, t));',
  '  c = mix(c, vec3(1.0, 0.6, 0.15), smoothstep(0.38, 0.68, t));',
  '  c = mix(c, vec3(1.0, 0.86, 0.52), smoothstep(0.62, 1.0, t));',
  '  return mix(c, vec3(1.0, 0.98, 0.93), smoothstep(1.0, 1.5, t));',
  '}',
  'uniform vec3 uFogCol; uniform vec3 uFog;',
  'float fogF(float d) {',
  '  if (uFog.x < 0.5) return 0.0;',
  '  if (uFog.x < 1.5) return smoothstep(uFog.y, uFog.z, d);',
  '  float k = uFog.y * d; return 1.0 - exp(-k * k);',
  '}',
].join('\n');

// camera-facing billboards; a positive stretch turns them into streaks along their screen motion
const BB_VS = [
  'attribute vec3 aPos; attribute vec3 aVel; attribute vec4 aCol; attribute vec4 aSz; attribute vec4 aDat; attribute float aGnd;',
  'uniform float uNear; uniform float uMinPx; uniform float uResY;',
  'varying vec2 vUv; varying vec4 vCol; varying vec4 vDat; varying float vMode; varying float vStr; varying float vGap; varying float vNear; varying float vDepth;',
  'void main() {',
  '  vUv = uv; vCol = aCol; vDat = aDat; vMode = aSz.w;',
  '  vec4 mv = viewMatrix * vec4(aPos, 1.0);',
  '  vec2 c = position.xy; float s = max(aSz.x, 1e-5); vec2 off; vStr = 1.0;',
  // sparks and glows never shrink below a few pixels, so a distant burst still reads
  '  if (aSz.w < 1.5 && uMinPx > 0.0) { float px = 2.0 * max(-mv.z, 1e-3) / (projectionMatrix[1][1] * max(uResY, 1.0)); s = max(s, uMinPx * px); }',
  '  if (aSz.z > 0.0) {',
  '    vec3 vv = mat3(viewMatrix) * aVel; float sp = length(vv.xy);',
  '    vec2 d = sp > 1e-5 ? vv.xy / sp : vec2(1.0, 0.0);',
  '    float len = s + sp * aSz.z; vStr = len / s;',
  '    off = d * (c.x * len) + vec2(-d.y, d.x) * (c.y * s);',
  '  } else {',
  '    float sn = sin(aSz.y), cs = cos(aSz.y);',
  '    off = vec2(c.x * cs - c.y * sn, c.x * sn + c.y * cs) * s;',
  '  }',
  '  mv.xy += off;',
  '  float wy = aPos.y + off.x * viewMatrix[1][0] + off.y * viewMatrix[1][1];',
  '  vGap = (wy - aGnd) / (s * 0.3);',
  '  vDepth = -mv.z;',
  '  vNear = smoothstep(uNear, uNear * 4.0, vDepth);',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');

const ADD_FS = [
  'varying vec2 vUv; varying vec4 vCol; varying vec4 vDat; varying float vMode; varying float vStr; varying float vGap; varying float vNear; varying float vDepth;',
  NOISE,
  'void main() {',
  '  vec2 p = vUv * 2.0 - 1.0; vec3 col;',
  '  if (vMode < 1.5) {',
  // glow (0) and streak spark (1): a capsule with a hot core; streaks are brighter at the head
  '    float L = vStr - 1.0; float qx = p.x * vStr;',
  '    float d = length(vec2(max(abs(qx) - L, 0.0), p.y));',
  '    float f = max(1.0 - d, 0.0);',
  '    float glow = f * f * f * 1.15;',
  '    float core = pow(f, 9.0) * 1.6;',
  '    float head = vMode > 0.5 ? mix(0.18, 1.0, clamp(qx / max(vStr, 1.0) * 0.5 + 0.5, 0.0, 1.0)) : 1.0;',
  '    col = (vCol.rgb * glow + vec3(1.0) * core * vDat.z) * head;',
  '  } else if (vMode < 2.5) {',
  // flame: noise-eroded blob, temperature mapped through a blackbody ramp (or tinted)
  '    float t = vDat.y; float sd = vDat.x * 17.0;',
  '    float n = fbm(vec3(p * 1.6 + vec2(sd, sd * 0.5 - t * 2.4), sd + t * 1.4));',
  '    float n2 = vnoise(vec3(p * 4.2 + vec2(0.0, -t * 5.0), sd * 2.0 + t * 3.0));',
  '    float r = length(p * vec2(1.05, 0.88) + vec2(0.0, 0.1));',
  '    float shape = (1.0 - smoothstep(0.15, 0.95, r + (n - 0.5) * 0.9 + (n2 - 0.5) * 0.25)) * (1.0 - smoothstep(0.75, 1.0, length(p)));',
  '    float T = shape * vDat.z * (0.55 + 0.95 * n);',
  '    vec3 hc = heatCol(T * 1.15);',
  '    col = mix(hc, vCol.rgb * (0.3 + T * 1.1) + vec3(1.0) * pow(max(T - 0.7, 0.0), 2.0) * 1.5, vDat.w) * smoothstep(0.02, 0.3, T) * 1.3;',
  '  } else {',
  // flash: a soft core with a few thin glare rays, like a real lens sees a sudden bright source
  '    float r = length(p); float a = atan(p.y, p.x) + vDat.x * 6.2831;',
  '    float rays = (pow(abs(cos(a * 2.0)), 60.0) + 0.5 * pow(abs(cos(a * 3.0 + 0.7)), 90.0)) * pow(max(1.0 - r, 0.0), 1.5);',
  '    float g = exp(-r * r * 7.0); float h = exp(-r * r * 55.0);',
  '    col = vCol.rgb * (g * 0.85 + rays * 0.9) + vec3(1.0) * h * 1.2;',
  '    col *= 1.0 - smoothstep(0.8, 1.0, r);',
  '  }',
  '  float fg = (vMode > 1.5 && vMode < 2.5) ? fogF(vDepth) : fogF(vDepth) * (1.0 - step(0.5, vDat.w));',
  '  col *= vCol.a * clamp(vGap, 0.0, 1.0) * vNear * (1.0 - fg);',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n');

const ALPHA_FS = [
  'uniform vec3 uLightV; uniform vec3 uSun; uniform vec3 uAmb;',
  'varying vec2 vUv; varying vec4 vCol; varying vec4 vDat; varying float vMode; varying float vStr; varying float vGap; varying float vNear; varying float vDepth;',
  NOISE,
  'void main() {',
  '  vec2 p = vUv * 2.0 - 1.0; float r = length(p); vec3 col; float a;',
  '  if (vMode < 0.5) {',
  // billowing smoke, dust or powder: two noise scales erode a soft ball, shaded by a fake normal
  '    float t = vDat.y; float sd = vDat.x * 23.0;',
  '    float n = fbm(vec3(p * 1.25 + sd, sd * 0.37 + t * 0.85));',
  '    float n2 = vnoise(vec3(p * 3.6 - sd, t * 1.6 + sd));',
  '    float e = r + (n - 0.5) * 0.8 + (n2 - 0.5) * 0.22;',
  '    float e0 = 0.3 + 0.18 * t;',
  '    float dens = (1.0 - smoothstep(e0, e0 + 0.32, e)) * (1.0 - smoothstep(0.72, 1.0, r));',
  '    dens *= 0.7 + 0.6 * n;',
  '    vec3 nr = normalize(vec3(p * 0.9 + vec2(n - 0.5, n2 - 0.5) * 1.1, 0.45 + 0.7 * dens));',
  '    float lit = clamp(dot(nr, uLightV) * 0.6 + 0.4, 0.0, 1.0); lit = lit * lit;',
  '    vec3 shade = mix(vec3(1.0), uAmb * 0.8 + uSun * lit * 1.25, vDat.w);',
  '    col = vCol.rgb * shade * mix(1.0, 0.7 + 0.3 * (1.0 - dens), vDat.w);',
  '    col += heatCol(vDat.z * (0.7 + 0.6 * n)) * vDat.z * (1.15 - 0.7 * lit) * (0.5 + n);',
  '    a = dens;',
  '  } else if (vMode < 1.5) {',
  // a droplet: a soft capsule along its motion with a small highlight
  '    float L = vStr - 1.0; float qx = p.x * vStr;',
  '    float d = length(vec2(max(abs(qx) - L, 0.0), p.y));',
  '    a = 1.0 - smoothstep(0.3, 1.0, d);',
  '    float hl = pow(max(0.0, 1.0 - length(vec2(qx - L * 0.6 - 0.15, p.y + 0.35)) * 1.6), 3.0);',
  '    col = vCol.rgb * mix(vec3(1.0), uAmb + uSun * 0.85, vDat.w * 0.7) + vec3(hl * 0.55);',
  '  } else {',
  '    a = pow(max(1.0 - r, 0.0), 1.6);',
  '    col = vCol.rgb * mix(vec3(1.0), uAmb + uSun * 0.8, vDat.w);',
  '  }',
  '  col = mix(col, uFogCol, fogF(vDepth));',
  '  gl_FragColor = vec4(col, clamp(a * vCol.a * clamp(vGap, 0.0, 1.0) * vNear, 0.0, 1.0));',
  '}',
].join('\n');

// confetti: real paper rectangles tumbling in 3D, shaded by their facing; foil pieces glint
const CONF_VS = [
  'attribute vec3 aPos; attribute vec4 aAx; attribute vec4 aCol; attribute vec4 aSz;',
  'varying vec3 vN; varying vec4 vCol; varying float vMetal; varying vec3 vV; varying float vDepth;',
  'vec3 rotA(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }',
  'void main() {',
  '  vec3 k = normalize(aAx.xyz + vec3(1e-4));',
  '  vec3 lp = rotA(vec3(position.x * aSz.x, position.y * aSz.y, 0.0), k, aAx.w);',
  '  vN = rotA(vec3(0.0, 0.0, 1.0), k, aAx.w);',
  '  vec3 wp = aPos + lp;',
  '  vV = normalize(cameraPosition - wp); vCol = aCol; vMetal = aSz.z;',
  '  vec4 mv = viewMatrix * vec4(wp, 1.0); vDepth = -mv.z;',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');
const CONF_FS = [
  'uniform vec3 uLightW; uniform vec3 uSun; uniform vec3 uAmb;',
  'varying vec3 vN; varying vec4 vCol; varying float vMetal; varying vec3 vV; varying float vDepth;',
  NOISE,
  'void main() {',
  '  vec3 n = normalize(vN); float f = abs(dot(n, vV)); float l = abs(dot(n, uLightW));',
  '  vec3 col = vCol.rgb * (uAmb * 0.85 + uSun * (0.3 + 0.7 * l)) * (0.6 + 0.4 * f);',
  '  vec3 h = normalize(uLightW + vV); float sp = pow(abs(dot(n, h)), 28.0) * (0.2 + vMetal * 2.2);',
  '  col += sp * mix(vec3(1.0), vCol.rgb, vMetal * 0.6);',
  '  col = mix(col, uFogCol, fogF(vDepth));',
  '  gl_FragColor = vec4(col, vCol.a);',
  '}',
].join('\n');

// oriented instanced quads: rings (additive) and decals (alpha) share the vertex shader
const ORI_VS = [
  'attribute vec3 aPos; attribute vec3 aNrm; attribute vec4 aCol; attribute vec4 aPar;',
  'varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vDepth;',
  'void main() {',
  '  vec3 n = normalize(aNrm + vec3(0.0, 1e-5, 0.0));',
  '  vec3 up = abs(n.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0);',
  '  vec3 t = normalize(cross(up, n)); vec3 b = cross(n, t);',
  '  float sn = sin(aPar.w * 6.2831), cs = cos(aPar.w * 6.2831);',
  '  vec2 c = vec2(position.x * cs - position.y * sn, position.x * sn + position.y * cs);',
  '  float R = aPar.x * (1.0 + 2.0 * aPar.y);',
  '  vec3 wp = aPos + (t * c.x + b * c.y) * 2.0 * R;',
  '  vUv = uv; vCol = aCol; vPar = aPar;',
  '  vec4 mv = viewMatrix * vec4(wp, 1.0); vDepth = -mv.z;',
  '  gl_Position = projectionMatrix * mv;',
  '}',
].join('\n');
const RING_FS = [
  'varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vDepth;',
  NOISE,
  'void main() {',
  '  vec2 q = vUv * 2.0 - 1.0; float th = max(vPar.y, 0.01);',
  '  vec2 p = q * (1.0 + 2.0 * th); float r = length(p); float d = (r - 1.0) / th;',
  '  float m = vPar.z; float band; vec3 col;',
  '  if (m < 0.5) {',
  // shockwave: a broken, dusty bright front with a faint wake inside it
  '    float n = fbm(vec3(normalize(p + 1e-4) * 2.6 + vPar.w * 9.0, r * 2.5 + vPar.w * 3.0));',
  '    band = exp(-d * d * 2.4) * (0.35 + 1.1 * n) + (d < 0.0 ? exp(d * 0.35) * 0.12 * n : 0.0);',
  '    col = vCol.rgb * band;',
  '  } else if (m < 1.5) {',
  // energy: a crisp ring with a white core, a soft halo and an inner echo
  '    float d2 = (r - 0.78) / th;',
  '    band = exp(-d * d * 9.0) * 1.1 + exp(-d * d * 0.9) * 0.35 + exp(-d2 * d2 * 14.0) * 0.45;',
  '    col = vCol.rgb * band + vec3(1.0) * exp(-d * d * 45.0) * 0.9;',
  '  } else {',
  // ripple on water: thin, soft and pale
  '    band = exp(-d * d * 5.0) * 0.7 + exp(-(d + 2.5) * (d + 2.5) * 4.0) * 0.25;',
  '    col = vCol.rgb * band;',
  '  }',
  '  col *= vCol.a * (1.0 - smoothstep(0.9, 1.0, length(q))) * (1.0 - fogF(vDepth));',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n');
const DECAL_FS = [
  'varying vec2 vUv; varying vec4 vCol; varying vec4 vPar; varying float vDepth;',
  NOISE,
  'void main() {',
  '  vec2 q = vUv * 2.0 - 1.0; float th = max(vPar.y, 0.01); vec2 p = q * (1.0 + 2.0 * th); float r = length(p);',
  '  vec2 dir = p / max(r, 1e-4); float sd = vPar.w * 13.0; float a; vec3 col;',
  '  if (vPar.z < 0.5) {',
  // paint: a lumpy blob with radial drips, satellite specks and a thicker rim
  '    float n1 = fbm(vec3(dir * 1.4 + sd, sd * 1.7));',
  '    float n2 = vnoise(vec3(dir * 4.8 + sd, sd * 3.1));',
  '    float edge = 0.42 + 0.26 * n1 + 0.5 * pow(n2, 3.5);',
  '    float body = 1.0 - smoothstep(edge - 0.035, edge, r);',
  '    float sp = smoothstep(0.74, 0.8, vnoise(vec3(p * 6.0, sd * 5.0))) * (1.0 - smoothstep(0.7, 0.98, r)) * step(edge, r);',
  '    a = max(body, sp);',
  '    col = vCol.rgb * (0.8 + 0.3 * vnoise(vec3(p * 3.5, sd)));',
  '    col *= 1.0 - 0.28 * smoothstep(edge - 0.14, edge, r) * body;',
  '    col += vec3(0.22) * pow(max(0.0, 1.0 - length(p - vec2(-0.18, 0.2)) * 3.0), 3.0) * body;',
  '  } else {',
  // scorch: burnt centre, sooty ragged edge
  '    float n = fbm(vec3(p * 2.2 + sd, sd));',
  '    a = (1.0 - smoothstep(0.1, 0.95, r + (n - 0.5) * 0.55)) * 0.82;',
  '    col = mix(vec3(0.02, 0.018, 0.016), vec3(0.16, 0.12, 0.09), smoothstep(0.0, 0.85, r + (n - 0.5) * 0.3));',
  '  }',
  '  col = mix(col, uFogCol, fogF(vDepth));',
  '  gl_FragColor = vec4(col, a * vCol.a * (1.0 - smoothstep(0.92, 1.0, length(q))));',
  '}',
].join('\n');

// ribbons: trails and lightning (world-space strips built facing the camera each frame)
const RIB_VS = [
  'attribute float aSide; attribute float aT;',
  'varying float vSide; varying float vT; varying float vDepth;',
  'void main() { vSide = aSide; vT = aT; vec4 mv = modelViewMatrix * vec4(position, 1.0); vDepth = -mv.z; gl_Position = projectionMatrix * mv; }',
].join('\n');
const RIB_FS = [
  'uniform vec3 uColor; uniform float uAlpha; uniform float uCore; uniform float uFade;',
  'varying float vSide; varying float vT; varying float vDepth;',
  NOISE,
  'void main() {',
  '  float x = abs(vSide);',
  '  float f = max(exp(-x * x * 3.2) - 0.04, 0.0) / 0.96; float c = exp(-x * x * 26.0);',
  '  float tail = pow(clamp(1.0 - vT, 0.0, 1.0), uFade);',
  '  vec3 col = (uColor * f + vec3(1.0) * c * uCore) * tail * uAlpha * (1.0 - fogF(vDepth));',
  '  gl_FragColor = vec4(col, 1.0);',
  '}',
].join('\n');

// screen-space: speed lines, lens flare ghosts, god rays, the flare source glow and streak
const SCR_VS = [
  'attribute vec4 aI; attribute vec4 aJ;',
  'uniform float uTime; uniform float uSpeed; uniform float uFlare; uniform float uRays; uniform float uAspect;',
  'uniform vec3 uLight; uniform vec3 uLightCol; uniform vec3 uLineCol;',
  'varying vec2 vUv; varying float vKind; varying float vA; varying vec3 vC;',
  'void main() {',
  '  vUv = uv; vKind = aI.x; vec2 c = position.xy; vec2 pos = vec2(0.0); vA = 0.0; vC = vec3(1.0);',
  '  if (aI.x < 0.5) {',
  '    float th = aI.y * 6.2831853; float spd = 0.7 + aI.w * 0.9;',
  '    float ph = fract(aI.y * 7.31 + aI.z * 3.7 + uTime * spd * 1.7);',
  '    float r = 0.55 + aI.z * 0.45 + ph * 0.95;',
  '    vec2 d = vec2(cos(th), sin(th));',
  '    vec2 ds = normalize(vec2(d.x * uAspect, d.y));',
  '    float len = (0.12 + 0.34 * aI.w) * (0.35 + uSpeed);',
  '    float w = 0.0018 + 0.0032 * aI.z;',
  '    vec2 o = ds * (c.x * len) + vec2(-ds.y, ds.x) * (c.y * w * 2.0);',
  '    pos = d * r + vec2(o.x / uAspect, o.y);',
  '    vA = uSpeed * sin(ph * 3.14159) * smoothstep(0.62, 1.0, r); vC = uLineCol;',
  '  } else {',
  '    vec4 L = projectionMatrix * viewMatrix * vec4(uLight, 1.0);',
  '    if (L.w > 0.0) {',
  '      vec2 l = L.xy / L.w;',
  '      float vis = 1.0 - smoothstep(0.8, 1.2, max(abs(l.x), abs(l.y)));',
  '      if (aI.x < 1.5) {',
  '        vec2 gp = mix(l, -l, aI.y); float sz = aI.z;',
  '        pos = gp + vec2(c.x * sz / uAspect, c.y * sz) * 2.0;',
  '        vA = uFlare * vis * aI.w; vC = aJ.rgb * uLightCol;',
  '      } else if (aI.x < 2.5) {',
  '        float th = aI.y * 6.2831853 + uTime * 0.05 * (aI.z - 0.5);',
  '        vec2 d = vec2(cos(th), sin(th)); float len = 0.35 + aI.z * 0.75;',
  '        float u = c.x + 0.5;',
  '        vec2 o = d * u * len + vec2(-d.y, d.x) * c.y * (0.08 + 0.14 * aI.w) * (0.2 + u);',
  '        pos = l + vec2(o.x / uAspect, o.y);',
  '        vA = uRays * vis * 0.3 * (0.55 + 0.45 * sin(uTime * 0.8 + aI.y * 23.0)); vC = uLightCol;',
  '      } else if (aI.x < 3.5) {',
  '        pos = l + vec2(c.x * aI.z / uAspect, c.y * aI.z) * 2.0;',
  '        vA = max(uFlare, uRays) * vis; vC = uLightCol;',
  '      } else {',
  '        pos = l + vec2(c.x * aI.z / uAspect, c.y * aI.z * 0.035) * 2.0;',
  '        vA = uFlare * vis * 0.8; vC = aJ.rgb * uLightCol;',
  '      }',
  '    }',
  '  }',
  '  gl_Position = vA > 0.002 ? vec4(pos, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);',
  '}',
].join('\n');
const SCR_FS = [
  'varying vec2 vUv; varying float vKind; varying float vA; varying vec3 vC;',
  'void main() {',
  '  vec2 p = vUv * 2.0 - 1.0; float f;',
  '  if (vKind < 0.5) f = (1.0 - smoothstep(0.0, 1.0, abs(p.y))) * smoothstep(-1.0, -0.2, p.x) * (1.0 - smoothstep(0.3, 1.0, p.x));',
  '  else if (vKind < 1.5) { float r = length(p); f = (1.0 - smoothstep(0.82, 1.0, r)) * (0.3 + 0.7 * smoothstep(0.45, 0.95, r)); }',
  '  else if (vKind < 2.5) f = pow(1.0 - smoothstep(0.0, 1.0, abs(p.y)), 2.0) * pow(clamp(1.0 - (p.x * 0.5 + 0.5), 0.0, 1.0), 2.0);',
  '  else if (vKind < 3.5) { float r = length(p); f = exp(-r * r * 5.0) * (1.0 - smoothstep(0.85, 1.0, r)); }',
  '  else f = exp(-p.y * p.y * 4.0) * pow(max(1.0 - abs(p.x), 0.0), 2.0);',
  '  gl_FragColor = vec4(vC * f * vA, 1.0);',
  '}',
].join('\n');

/* ------------------------------------------------------------------ recipes */
// L: 0 additive, 1 alpha. m: shape mode. life/s0/s1/sp/up: [min, max] seconds, metres, metres/s.
// r: spawn radius. cone: cos of the half angle around the direction (-1 = any direction). flat: scales
// the vertical part. g: gravity (negative falls, positive rises). drag per second. turb: swirl.
// bnc: bounce on the ground. fin: fade-in fraction. fp: fade-out power. c0 -> c1 colour over life.
// cv: colour jitter. a: peak alpha / brightness. h0 -> h1: heat (flames, smoke glow) or core whiteness.
// str: streak length in seconds of motion. tint: flame tint amount (0 = blackbody). lit: smoke shading.
// spin: rotation speed. fl: keep the centre this fraction of its size above the ground. dl: delay.
// tr: leaves a trail of glowing sparks (tier 2+).
const RC = (o) => Object.assign({ L: 0, m: 0, life: [1, 1], s0: [0.1, 0.1], s1: [0.1, 0.1], sp: [0, 0], up: [0, 0], r: 0, cone: -1, flat: 1,
  g: 0, drag: 0, turb: 0, bnc: 0, fin: 0.02, fp: 1, c0: [1, 1, 1], c1: null, cv: 0.06, a: 1, h0: 0, h1: 0, str: 0, tint: 0, lit: 1,
  spin: 0, fl: 0, dl: null, tr: 0, hp: 1 }, o);

const R_FLASH = RC({ m: 3, life: [0.13, 0.17], s0: [6.5, 7.5], s1: [9, 10], c0: [1, 0.82, 0.58], a: 1.3, fin: 0.01, fp: 1.6, cv: 0 });
const R_GLOW = RC({ m: 0, life: [0.12, 0.2], s0: [1.2, 1.5], s1: [1.8, 2.2], c0: [1, 0.75, 0.45], a: 1, fp: 1.3, h0: 0.6, cv: 0 });
const R_FIREBALL = RC({ m: 2, life: [0.55, 1.1], s0: [1.0, 1.6], s1: [2.0, 3.4], sp: [2.5, 7], up: [1, 3], r: 0.6, g: 2.6, drag: 3.2, turb: 1.4,
  fin: 0.03, fp: 1.4, h0: 1.35, h1: 0.12, spin: 1.2 });
const R_FIRECORE = RC({ m: 2, life: [0.22, 0.42], s0: [1.4, 2.0], s1: [2.4, 3.2], sp: [0.4, 1.8], r: 0.3, g: 1, drag: 2, h0: 1.7, h1: 0.7, fin: 0.01 });
const R_SMOKE = RC({ L: 1, m: 0, life: [2.8, 4.8], s0: [1.0, 1.6], s1: [3.6, 6.2], sp: [1.4, 4.4], up: [1.5, 3.2], r: 0.8, g: 1.5, drag: 1.5, turb: 0.8,
  fin: 0.12, fp: 1.2, c0: [0.17, 0.15, 0.14], c1: [0.4, 0.39, 0.38], a: 0.95, h0: 1.1, h1: 0, hp: 7, lit: 1, spin: 0.35, fl: 0.3, dl: [0.04, 0.3] });
const R_SPARK = RC({ m: 1, life: [0.6, 1.5], s0: [0.075, 0.11], s1: [0.03, 0.045], sp: [8, 21], up: [1.5, 5], g: -9.8, drag: 0.8, bnc: 0.45,
  fin: 0, fp: 1.1, c0: [1, 0.8, 0.45], c1: [1, 0.3, 0.05], a: 1.5, h0: 1.1, h1: 0, str: 0.035 });
const R_EMBER = RC({ m: 0, life: [1.6, 3.2], s0: [0.07, 0.12], s1: [0.03, 0.05], sp: [1.5, 4], up: [1, 3], g: 0.5, drag: 1.2, turb: 2.6,
  c0: [1, 0.62, 0.22], c1: [0.9, 0.16, 0.03], a: 1.3, h0: 0.7, fp: 1.4 });
const R_SKIRT = RC({ L: 1, m: 0, life: [1.2, 2.5], s0: [0.6, 1.0], s1: [2.2, 3.8], sp: [5, 11.5], up: [0, 0.6], flat: 0.06, drag: 2.6, turb: 0.5,
  c0: [0.62, 0.55, 0.46], c1: [0.7, 0.64, 0.57], a: 0.55, lit: 0.85, fl: 0.25, fin: 0.04, fp: 1.6, spin: 0.3 });
const R_PUFF = RC({ L: 1, m: 0, life: [1.0, 1.9], s0: [0.25, 0.4], s1: [0.9, 1.5], sp: [0.8, 2.6], up: [0.3, 0.9], g: 0.25, drag: 2.4, turb: 0.4,
  c0: [0.7, 0.62, 0.52], a: 0.55, lit: 0.85, fl: 0.25, fin: 0.06, fp: 1.4, spin: 0.4 });
const R_POWDER = RC({ L: 1, m: 0, life: [1.6, 2.8], s0: [0.4, 0.7], s1: [1.8, 3.0], sp: [2.5, 7], up: [0.3, 1.2], g: 0.3, drag: 2.8, turb: 0.9,
  a: 0.85, lit: 0.35, fl: 0.25, fin: 0.03, fp: 1.5, spin: 0.5, cv: 0.08 });
const R_POWDOT = RC({ L: 1, m: 2, life: [0.8, 1.5], s0: [0.05, 0.09], s1: [0.04, 0.07], sp: [3, 8], up: [1, 2.5], g: -6, drag: 1.4,
  a: 0.95, lit: 0.3, fin: 0, fp: 1.5 });
const R_DROP = RC({ L: 1, m: 1, life: [0.6, 1.1], s0: [0.045, 0.075], s1: [0.03, 0.05], sp: [2.5, 6.5], up: [0.5, 2], g: -9.8, drag: 0.35,
  c0: [0.84, 0.92, 0.98], a: 0.85, lit: 0.6, str: 0.04, fin: 0, fp: 2 });
const R_MIST = RC({ L: 1, m: 0, life: [1.0, 1.8], s0: [0.4, 0.6], s1: [1.6, 2.6], sp: [1, 3], up: [0.5, 1.5], g: 0.2, drag: 2.2, turb: 0.5,
  c0: [0.9, 0.94, 0.97], a: 0.42, lit: 0.45, fl: 0.25, fin: 0.05, fp: 1.4 });
const R_GLINT = RC({ m: 0, life: [0.15, 0.4], s0: [0.12, 0.2], s1: [0.02, 0.04], sp: [1, 4], up: [0.5, 2], g: -6, drag: 1, c0: [0.9, 0.97, 1], a: 1.4, h0: 1 });
const R_SPARKLE = RC({ m: 1, life: [0.45, 0.9], s0: [0.08, 0.11], s1: [0.03, 0.045], sp: [4, 9], up: [1, 3], g: -5, drag: 1.7, a: 1.8, h0: 1.4, str: 0.045, cv: 0.08, fin: 0 });
const R_PLUME = RC({ L: 1, m: 0, life: [3.5, 6], s0: [0.7, 1.1], s1: [3.2, 5.2], sp: [0.3, 1.2], up: [1.6, 2.6], r: 0.4, g: 0.8, drag: 0.7, turb: 1.1,
  c0: [0.3, 0.29, 0.28], c1: [0.55, 0.54, 0.53], a: 0.72, lit: 1, fin: 0.12, fp: 1.4, spin: 0.25, fl: 0.2 });
const R_LICK = RC({ m: 2, life: [0.35, 0.7], s0: [0.5, 0.8], s1: [0.9, 1.4], sp: [0.3, 1], up: [1.2, 2.4], r: 0.35, g: 2.5, drag: 1.5, turb: 1.2, h0: 1.1, h1: 0.1, spin: 0.6 });
const R_NOUT = RC({ m: 2, life: [0.18, 0.32], s0: [0.4, 0.55], s1: [1.0, 1.5], sp: [8, 14], cone: 0.94, drag: 3, turb: 1, h0: 1.15, h1: 0.1, fin: 0.01, spin: 0.5 });
const R_NCORE = RC({ m: 2, life: [0.08, 0.15], s0: [0.22, 0.3], s1: [0.35, 0.5], sp: [8, 12], cone: 0.98, drag: 2, h0: 1.4, h1: 0.6, tint: 0.85, fin: 0.01 });
const R_EXHAUST = RC({ L: 1, m: 0, life: [0.8, 1.5], s0: [0.3, 0.45], s1: [1.2, 2.0], sp: [1, 3], cone: 0.8, g: 0.5, drag: 1.8, turb: 0.8,
  c0: [0.62, 0.62, 0.64], a: 0.28, lit: 0.8, fin: 0.1, fp: 1.4, spin: 0.5, fl: 0.25 });
const R_HEAT = RC({ m: 0, life: [0.05, 0.07], s0: [1, 1.1], s1: [1, 1.1], a: 0.55, h0: 0.25, cv: 0, fin: 0, fp: 1 });
const R_PYRO = RC({ m: 2, life: [0.45, 0.8], s0: [0.45, 0.7], s1: [1.2, 1.9], sp: [9, 14], cone: 0.985, drag: 1.4, turb: 1.5, h0: 1.3, h1: 0.1, fin: 0.02, spin: 0.8 });
const R_PSMOKE = RC({ L: 1, m: 0, life: [1.8, 3], s0: [0.8, 1.2], s1: [2.6, 4], sp: [0.3, 1], up: [1.5, 2.5], g: 0.6, drag: 1, turb: 1,
  c0: [0.7, 0.68, 0.66], c1: [0.8, 0.79, 0.78], a: 0.3, lit: 1, h0: 0.6, hp: 8, fin: 0.15, fp: 1.4, spin: 0.3 });
const R_STAR = RC({ m: 1, life: [1.5, 2.2], s0: [0.22, 0.28], s1: [0.07, 0.09], sp: [15, 18], g: -3.6, drag: 1.7, a: 2.8, h0: 1.5, h1: 0.1, str: 0.06, cv: 0.05, fin: 0, fp: 1.6, tr: 1 });
const R_COMET = RC({ m: 1, life: [2.0, 2.6], s0: [0.32, 0.38], s1: [0.1, 0.13], sp: [15, 19], cone: 0.35, g: -3, drag: 1.5, a: 2.2, h0: 1.2, str: 0.07, fin: 0, fp: 1.4, tr: 2 });
const R_ROCKET = RC({ m: 1, life: [0.3, 0.6], s0: [0.14, 0.18], s1: [0.02, 0.04], sp: [0.5, 2], g: -4, drag: 1.5, c0: [1, 0.78, 0.45], c1: [1, 0.35, 0.08], a: 1.4, h0: 0.9, str: 0.05 });
const R_FWEMBER = RC({ m: 1, life: [2.4, 3.6], s0: [0.07, 0.1], s1: [0.03, 0.04], sp: [1, 4], g: -1.8, drag: 1.4, turb: 1.4, str: 0.04, c0: [1, 0.72, 0.3], c1: [0.95, 0.25, 0.05], a: 1.2, h0: 0.6, fp: 1.4 });
const R_POP = RC({ m: 3, life: [0.07, 0.12], s0: [1.1, 1.5], s1: [1.3, 1.8], c0: [1, 0.97, 0.88], a: 2, cv: 0, dl: [0.55, 1.25], fin: 0 });
const R_FWSMOKE = RC({ L: 1, m: 0, life: [3.5, 5], s0: [2.5, 3.5], s1: [6, 9], sp: [0.5, 2], g: 0.15, drag: 1.2, turb: 0.6,
  c0: [0.72, 0.72, 0.74], a: 0.16, lit: 0.6, h0: 0.4, hp: 8, fin: 0.12, fp: 1.4, dl: [0.05, 0.2] });
const R_GLITTER = RC({ m: 1, life: [1.8, 3.0], s0: [0.11, 0.15], s1: [0.05, 0.07], sp: [4, 10], up: [4, 9], g: -3.2, drag: 1.5, turb: 1.5,
  c0: [1, 0.88, 0.5], c1: [1, 0.55, 0.15], a: 2, h0: 1.2, str: 0.035, fp: 1.1 });


/* ------------------------------------------------------------------ colour */
const _col = new THREE.Color();
const toSRGB = (c, out) => {
  if (c == null) return false;
  if (Array.isArray(c)) { out[0] = c[0]; out[1] = c[1]; out[2] = c[2]; return true; }
  _col.set(c); _col.convertLinearToSRGB(); out[0] = _col.r; out[1] = _col.g; out[2] = _col.b; return true;
};
const hexS = (h) => { const c = new THREE.Color(h); c.convertLinearToSRGB(); return [c.r, c.g, c.b]; };
// festival palette: marigold, rani pink, peacock teal, violet, leaf green, saffron, sky blue, gold, white
const FEST = ['#ffb000', '#ff2f8e', '#00b3a4', '#8a4dff', '#35c94f', '#ff5a1f', '#2a8cff', '#f6c445', '#ffffff'].map(hexS);
const FW = ['#ff3b30', '#ffcc33', '#33d17a', '#3a8bff', '#c061ff', '#ff6bd5', '#ffffff', '#ff8a1f', '#38e1ff'].map(hexS);
const GOLD = hexS('#ffcf5a');
const pick = (arr) => arr[(Math.random() * arr.length) | 0];

/* ------------------------------------------------------------------ factory */
export function createVFX(renderer, scene, camera, o) {
  o = Object.assign({ quality: 2, unit: 1, groundY: 0, reduced: null, soft: null, force: false, lights: null, lighting: null }, o || {});
  const unit = o.unit || 1;
  // screenshot / dev hook: ?vfx=full in the page address, or window.__VFX_FULL = true, forces full quality
  let devFull = false;
  try { devFull = (typeof window !== 'undefined' && !!window.__VFX_FULL) || (typeof location !== 'undefined' && /[?&]vfx=full(&|$)/.test(location.search)); } catch (e) { devFull = false; }
  if (devFull) { o.force = true; o.quality = 3; }
  const soft = o.soft != null ? !!o.soft : isSoftRenderer(renderer);
  let reduced = o.reduced != null ? !!o.reduced : (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let q = clamp(o.quality | 0, 0, 3);
  let cam = camera;
  let groundFn = typeof o.groundY === 'function' ? o.groundY : null;
  let groundC = groundFn ? 0 : (+o.groundY || 0);
  const gAt = (x, z) => (groundFn ? groundFn(x, z) : groundC);
  const lowTier = () => soft && !o.force;
  const tier = () => (lowTier() ? 0 : q);
  const RATES = [0.42, 0.6, 0.82, 1];
  // fewer particles at low tiers, but each one bigger, so the effect reads just as loud
  const BOOST = [1.45, 1.22, 1.06, 1];
  const rate = () => RATES[tier()] * (reduced ? 0.55 : 1);
  const cnt = (n, min) => Math.max(min == null ? 1 : min, Math.round(n * rate()));
  const added = [];

  // shared uniforms (one object per uniform, referenced by every material)
  const U = {
    uOct: { value: 3 }, uTime: { value: 0 }, uNear: { value: 0.35 * unit }, uResY: { value: 900 },
    uFogCol: { value: new THREE.Vector3(0.7, 0.74, 0.8) }, uFog: { value: new THREE.Vector3(0, 0, 1) },
    uLightV: { value: new THREE.Vector3(0.3, 0.8, 0.5) }, uLightW: { value: new THREE.Vector3(0.4, 0.8, 0.3).normalize() },
    uSun: { value: new THREE.Vector3(0.78, 0.73, 0.65) }, uAmb: { value: new THREE.Vector3(0.48, 0.52, 0.6) },
  };
  const uni = (extra) => Object.assign({}, U, extra || {});
  const setOct = () => { U.uOct.value = [1, 2, 3, 4][tier()]; };
  setOct();

  // lighting for smoke and confetti: explicit, else the scene's first directional light
  let dirLight = null;
  const LW = new THREE.Vector3(0.4, 0.8, 0.3).normalize();
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3();
  const setLighting = (L) => {
    if (!L) return;
    if (L.dir) { const d = L.dir; LW.set(d[0] != null ? d[0] : d.x, d[1] != null ? d[1] : d.y, d[2] != null ? d[2] : d.z).normalize(); dirLight = null; }
    const t = [0, 0, 0];
    if (L.sun && toSRGB(L.sun, t)) U.uSun.value.set(t[0], t[1], t[2]);
    if (L.ambient && toSRGB(L.ambient, t)) U.uAmb.value.set(t[0], t[1], t[2]);
  };
  let ambLight = null;
  if (o.lighting) setLighting(o.lighting);
  else if (scene) scene.traverse((ob) => { if (!dirLight && ob.isDirectionalLight) dirLight = ob; if (!ambLight && (ob.isHemisphereLight || ob.isAmbientLight)) ambLight = ob; });

  // upload only the live part of each instance attribute (no allocation: the list is built once per set)
  const flushAttrs = (A, n) => {
    const L = A.__list || (A.__list = Object.keys(A).filter((k) => k !== '__list').map((k) => A[k]));
    for (let i = 0; i < L.length; i++) { const at = L[i]; at.clearUpdateRanges(); at.addUpdateRange(0, n * at.itemSize); at.needsUpdate = true; }
  };

  /* ---------------------------------------------------------- billboard layers */
  const plane = new THREE.PlaneGeometry(1, 1);
  const mkLayer = (add, N) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(plane.index); g.setAttribute('position', plane.getAttribute('position')); g.setAttribute('uv', plane.getAttribute('uv'));
    const mk = (s) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(N * s), s); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const A = { pos: mk(3), vel: mk(3), col: mk(4), sz: mk(4), dat: mk(4), gnd: mk(1) };
    g.setAttribute('aPos', A.pos); g.setAttribute('aVel', A.vel); g.setAttribute('aCol', A.col); g.setAttribute('aSz', A.sz); g.setAttribute('aDat', A.dat); g.setAttribute('aGnd', A.gnd);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({ uniforms: uni({ uMinPx: { value: add ? 2.6 : 1.4 } }), vertexShader: BB_VS, fragmentShader: add ? ADD_FS : ALPHA_FS, transparent: true, depthWrite: false,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending });
    mat.userData.keepMat = true;
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = add ? 14 : 12; mesh.visible = false; mesh.name = add ? 'vfx-add' : 'vfx-alpha';
    if (scene) scene.add(mesh); added.push(mesh);
    const F = () => new Float32Array(N);
    const P = {
      add, N, g, A, mat, mesh, hi: 0, top: N, live: 0,
      x: F(), y: F(), z: F(), vx: F(), vy: F(), vz: F(), age: F(), life: F(), s0: F(), s1: F(), rot: F(), vr: F(),
      r0: F(), g0: F(), b0: F(), r1: F(), g1: F(), b1: F(), a: F(), fin: F(), fp: F(), gr: F(), drag: F(), turb: F(), bnc: F(),
      mode: F(), h0: F(), h1: F(), hp: F(), str: F(), tint: F(), fl: F(), seed: F(), acc: F(), tr: new Uint8Array(N), on: new Uint8Array(N),
      free: new Int32Array(N), order: new Int32Array(N), key: new Float32Array(N),
    };
    for (let i = 0; i < N; i++) P.free[i] = N - 1 - i;
    return P;
  };
  const AD = mkLayer(true, 6144);
  const AL = mkLayer(false, 1536);
  const allocP = (P) => {
    if (P.top <= 0) return -1;
    const i = P.free[--P.top]; P.on[i] = 1; if (i + 1 > P.hi) P.hi = i + 1; return i;
  };
  const killP = (P, i) => { P.on[i] = 0; P.free[P.top++] = i; };

  // per-call overrides for emit(): reset before each use
  const O = { sm: 1, vm: 1, lm: 1, am: 1, rm: 1, hasDir: false, dx: 0, dy: 1, dz: 0, cone: -2, col: false, cr: 1, cg: 1, cb: 1, col1: false, c1r: 1, c1g: 1, c1b: 1, ivx: 0, ivy: 0, ivz: 0, dl: 0, flat: -1, tint: -1 };
  const reset = () => { O.sm = 1; O.vm = 1; O.lm = 1; O.am = 1; O.rm = 1; O.hasDir = false; O.dx = 0; O.dy = 1; O.dz = 0; O.cone = -2; O.col = false; O.col1 = false; O.ivx = O.ivy = O.ivz = 0; O.dl = 0; O.flat = -1; O.tint = -1; return O; };
  const tmpC = [0, 0, 0], tmpC2 = [0, 0, 0];
  const setCol = (c) => { if (toSRGB(c, tmpC)) { O.col = true; O.cr = tmpC[0]; O.cg = tmpC[1]; O.cb = tmpC[2]; } return O; };
  const setCol1 = (c) => { if (toSRGB(c, tmpC2)) { O.col1 = true; O.c1r = tmpC2[0]; O.c1g = tmpC2[1]; O.c1b = tmpC2[2]; } return O; };
  const setColA = (a) => { O.col = true; O.cr = a[0]; O.cg = a[1]; O.cb = a[2]; return O; };
  const setColA1 = (a) => { O.col1 = true; O.c1r = a[0]; O.c1g = a[1]; O.c1b = a[2]; return O; };
  const setDir = (x, y, z) => { const l = Math.hypot(x, y, z) || 1; O.hasDir = true; O.dx = x / l; O.dy = y / l; O.dz = z / l; return O; };
  // a basis around the emit direction
  let t1x = 1, t1y = 0, t1z = 0, t2x = 0, t2y = 0, t2z = 1;
  const basis = (dx, dy, dz) => {
    if (Math.abs(dy) < 0.95) { t1x = dz; t1y = 0; t1z = -dx; } else { t1x = 0; t1y = -dz; t1z = dy; }
    const l = Math.hypot(t1x, t1y, t1z) || 1; t1x /= l; t1y /= l; t1z /= l;
    t2x = dy * t1z - dz * t1y; t2y = dz * t1x - dx * t1z; t2z = dx * t1y - dy * t1x;
  };

  function emit(R, n, x, y, z) {
    const P = R.L ? AL : AD;
    const sm = O.sm * unit * (R.L ? 1 : BOOST[tier()]), vm = O.vm * unit;
    const dx = O.hasDir ? O.dx : 0, dy = O.hasDir ? O.dy : 1, dz = O.hasDir ? O.dz : 0;
    const cone = O.cone > -2 ? O.cone : R.cone;
    const flat = O.flat >= 0 ? O.flat : R.flat;
    if (cone > -1) basis(dx, dy, dz);
    let made = 0;
    for (let k = 0; k < n; k++) {
      const i = allocP(P); if (i < 0) break;
      let ux, uy, uz;
      if (cone <= -1) {
        uy = Math.random() * 2 - 1; const a = Math.random() * TAU, s = Math.sqrt(1 - uy * uy); ux = Math.cos(a) * s; uz = Math.sin(a) * s;
      } else {
        const ct = 1 - Math.random() * (1 - cone), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = Math.random() * TAU;
        const cp = Math.cos(ph) * st, sp = Math.sin(ph) * st;
        ux = dx * ct + t1x * cp + t2x * sp; uy = dy * ct + t1y * cp + t2y * sp; uz = dz * ct + t1z * cp + t2z * sp;
      }
      uy *= flat;
      const spd = rr(R.sp) * vm;
      const rad = R.r * sm * O.rm * Math.cbrt(Math.random());
      P.x[i] = x + ux * rad; P.y[i] = y + uy * rad; P.z[i] = z + uz * rad;
      P.vx[i] = ux * spd + O.ivx; P.vy[i] = uy * spd + rr(R.up) * vm + O.ivy; P.vz[i] = uz * spd + O.ivz;
      P.age[i] = -(O.dl + (R.dl ? rr(R.dl) : 0));
      P.life[i] = rr(R.life) * O.lm;
      P.s0[i] = rr(R.s0) * sm; P.s1[i] = rr(R.s1) * sm;
      P.rot[i] = Math.random() * TAU; P.vr[i] = (Math.random() * 2 - 1) * R.spin;
      const v = 1 + (Math.random() * 2 - 1) * R.cv;
      const cr = O.col ? O.cr : R.c0[0], cg = O.col ? O.cg : R.c0[1], cb = O.col ? O.cb : R.c0[2];
      const c1 = R.c1;
      P.r0[i] = cr * v; P.g0[i] = cg * v; P.b0[i] = cb * v;
      if (O.col1) { P.r1[i] = O.c1r * v; P.g1[i] = O.c1g * v; P.b1[i] = O.c1b * v; }
      else if (c1 && !O.col) { P.r1[i] = c1[0] * v; P.g1[i] = c1[1] * v; P.b1[i] = c1[2] * v; }
      else { P.r1[i] = P.r0[i]; P.g1[i] = P.g0[i]; P.b1[i] = P.b0[i]; }
      P.a[i] = R.a * O.am; P.fin[i] = R.fin; P.fp[i] = R.fp;
      P.gr[i] = R.g * unit; P.drag[i] = R.drag; P.turb[i] = R.turb * unit; P.bnc[i] = R.bnc;
      P.mode[i] = R.m; P.h0[i] = R.h0; P.h1[i] = R.h1; P.hp[i] = R.hp; P.str[i] = R.str; P.tint[i] = O.tint >= 0 ? O.tint : (R.L ? R.lit : R.tint);
      P.fl[i] = R.fl; P.seed[i] = Math.random(); P.acc[i] = 0; P.tr[i] = R.tr;
      made++;
    }
    return made;
  }

  /* ---------------------------------------------------------- confetti */
  const CN = 1800;
  const conf = (() => {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(plane.index); g.setAttribute('position', plane.getAttribute('position')); g.setAttribute('uv', plane.getAttribute('uv'));
    const mk = (s) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(CN * s), s); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const A = { pos: mk(3), ax: mk(4), col: mk(4), sz: mk(4) };
    g.setAttribute('aPos', A.pos); g.setAttribute('aAx', A.ax); g.setAttribute('aCol', A.col); g.setAttribute('aSz', A.sz);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({ uniforms: uni(), vertexShader: CONF_VS, fragmentShader: CONF_FS, side: THREE.DoubleSide, transparent: true, depthWrite: true });
    mat.userData.keepMat = true;
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 10; mesh.visible = false; mesh.name = 'vfx-confetti';
    if (scene) scene.add(mesh); added.push(mesh);
    const F = () => new Float32Array(CN);
    const C = { g, A, mesh, mat, hi: 0, top: CN, x: F(), y: F(), z: F(), vx: F(), vy: F(), vz: F(), ax: F(), ay: F(), az: F(), ang: F(), va: F(),
      w: F(), h: F(), metal: F(), r: F(), gg: F(), b: F(), age: F(), life: F(), ph: F(), rest: new Uint8Array(CN), on: new Uint8Array(CN), free: new Int32Array(CN) };
    for (let i = 0; i < CN; i++) C.free[i] = CN - 1 - i;
    return C;
  })();
  function confettiN(n, x, y, z, dx, dy, dz, cone, spd0, spd1, size, palette, delay) {
    const C = conf; basis(dx, dy, dz); size *= Math.sqrt(BOOST[tier()]);
    for (let k = 0; k < n; k++) {
      if (C.top <= 0) return;
      const i = C.free[--C.top]; C.on[i] = 1; if (i + 1 > C.hi) C.hi = i + 1;
      const ct = 1 - Math.random() * (1 - cone), st = Math.sqrt(Math.max(0, 1 - ct * ct)), ph = Math.random() * TAU;
      const cp = Math.cos(ph) * st, sp = Math.sin(ph) * st;
      const ux = dx * ct + t1x * cp + t2x * sp, uy = dy * ct + t1y * cp + t2y * sp, uz = dz * ct + t1z * cp + t2z * sp;
      const v = rnd(spd0, spd1) * unit;
      C.x[i] = x + (Math.random() - 0.5) * 0.3 * unit; C.y[i] = y; C.z[i] = z + (Math.random() - 0.5) * 0.3 * unit;
      C.vx[i] = ux * v; C.vy[i] = uy * v; C.vz[i] = uz * v;
      C.ax[i] = Math.random() - 0.5; C.ay[i] = Math.random() - 0.5; C.az[i] = Math.random() - 0.5;
      C.ang[i] = Math.random() * TAU; C.va[i] = rnd(5, 13) * (Math.random() < 0.5 ? -1 : 1);
      const streamer = Math.random() < 0.12;
      C.w[i] = rnd(0.045, 0.07) * unit * size * (streamer ? 0.6 : 1); C.h[i] = rnd(0.08, 0.12) * unit * size * (streamer ? 3.2 : 1);
      const c = palette[(Math.random() * palette.length) | 0];
      const metal = c === GOLD || Math.random() < 0.12 ? 1 : 0; C.metal[i] = metal;
      const vv = 0.9 + Math.random() * 0.15;
      C.r[i] = c[0] * vv; C.gg[i] = c[1] * vv; C.b[i] = c[2] * vv;
      C.age[i] = -(delay || 0) * Math.random(); C.life[i] = rnd(4, 7); C.ph[i] = Math.random() * TAU; C.rest[i] = 0;
    }
  }

  /* ---------------------------------------------------------- solids: debris chunks and shards */
  const mkSolid = (geo, N, mat, name) => {
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false; mesh.name = name;
    mesh.castShadow = false; mesh.receiveShadow = false;
    mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if (scene) scene.add(mesh); added.push(mesh);
    const F = () => new Float32Array(N);
    const S = { mesh, N, hi: 0, top: N, x: F(), y: F(), z: F(), vx: F(), vy: F(), vz: F(), rx: F(), ry: F(), rz: F(), wx: F(), wy: F(), wz: F(),
      sx: F(), sy: F(), sz: F(), age: F(), life: F(), bnc: F(), smoke: F(), acc: F(), r: F(), g: F(), b: F(), rest: new Uint8Array(N), on: new Uint8Array(N), free: new Int32Array(N) };
    for (let i = 0; i < N; i++) S.free[i] = N - 1 - i;
    return S;
  };
  const rockGeo = (() => {
    const gg = new THREE.IcosahedronGeometry(0.5, 0); const p = gg.getAttribute('position');
    for (let i = 0; i < p.count; i++) { const k = 0.75 + 0.5 * (((i * 7919) % 97) / 97); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.8, p.getZ(i) * k); }
    gg.computeVertexNormals(); return gg;
  })();
  const shardGeo = (() => {
    const v = new Float32Array([0, 0.5, 0.06, -0.38, -0.4, 0.06, 0.45, -0.28, 0.06, 0, 0.5, -0.06, -0.38, -0.4, -0.06, 0.45, -0.28, -0.06]);
    const idx = [0, 1, 2, 3, 5, 4, 0, 3, 4, 0, 4, 1, 1, 4, 5, 1, 5, 2, 2, 5, 3, 2, 3, 0];
    const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(v, 3)); gg.setIndex(idx);
    const ng = gg.toNonIndexed(); ng.computeVertexNormals(); gg.dispose(); return ng;
  })();
  const chunkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0, flatShading: true });
  const shardMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45, metalness: 0.1, flatShading: true });
  const CH = mkSolid(rockGeo, 96, chunkMat, 'vfx-chunks');
  const SH = mkSolid(shardGeo, 160, shardMat, 'vfx-shards');
  const _lin = new THREE.Color();
  function solid(S, x, y, z, vx, vy, vz, sx, sy, sz, life, bnc, smoke, col) {
    if (S.top <= 0) return -1;
    const i = S.free[--S.top]; S.on[i] = 1; if (i + 1 > S.hi) S.hi = i + 1;
    S.x[i] = x; S.y[i] = y; S.z[i] = z; S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz;
    S.rx[i] = Math.random() * TAU; S.ry[i] = Math.random() * TAU; S.rz[i] = Math.random() * TAU;
    S.wx[i] = rnd(-9, 9); S.wy[i] = rnd(-9, 9); S.wz[i] = rnd(-9, 9);
    S.sx[i] = sx; S.sy[i] = sy; S.sz[i] = sz; S.age[i] = 0; S.life[i] = life; S.bnc[i] = bnc; S.smoke[i] = smoke; S.acc[i] = 0; S.rest[i] = 0;
    S.r[i] = col.r; S.g[i] = col.g; S.b[i] = col.b;
    return i;
  }

  /* ---------------------------------------------------------- rings (additive) and decals (alpha) */
  const mkOri = (N, fs, add, name, order) => {
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(plane.index); g.setAttribute('position', plane.getAttribute('position')); g.setAttribute('uv', plane.getAttribute('uv'));
    const mk = (s) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(N * s), s); a.setUsage(THREE.DynamicDrawUsage); return a; };
    const A = { pos: mk(3), nrm: mk(3), col: mk(4), par: mk(4) };
    g.setAttribute('aPos', A.pos); g.setAttribute('aNrm', A.nrm); g.setAttribute('aCol', A.col); g.setAttribute('aPar', A.par);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({ uniforms: uni(), vertexShader: ORI_VS, fragmentShader: fs, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      blending: add ? THREE.AdditiveBlending : THREE.NormalBlending, polygonOffset: !add, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    mat.userData.keepMat = true;
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = order; mesh.visible = false; mesh.name = name;
    if (scene) scene.add(mesh); added.push(mesh);
    const F = () => new Float32Array(N);
    const S = { g, A, mesh, N, hi: 0, top: N, x: F(), y: F(), z: F(), nx: F(), ny: F(), nz: F(), r0: F(), r1: F(), th0: F(), th1: F(), mode: F(), rot: F(),
      cr: F(), cg: F(), cb: F(), a: F(), age: F(), life: F(), hold: F(), on: new Uint8Array(N), free: new Int32Array(N) };
    for (let i = 0; i < N; i++) S.free[i] = N - 1 - i;
    return S;
  };
  const RG = mkOri(48, RING_FS, true, 'vfx-rings', 13);
  const DC = mkOri(64, DECAL_FS, false, 'vfx-decals', 2);
  function ori(S, x, y, z, nx, ny, nz, r0, r1, th0, th1, mode, c, a, life, delay, hold) {
    if (S.top <= 0) return -1;
    const i = S.free[--S.top]; S.on[i] = 1; if (i + 1 > S.hi) S.hi = i + 1;
    S.x[i] = x; S.y[i] = y; S.z[i] = z; S.nx[i] = nx; S.ny[i] = ny; S.nz[i] = nz;
    S.r0[i] = r0; S.r1[i] = r1; S.th0[i] = th0; S.th1[i] = th1; S.mode[i] = mode; S.rot[i] = Math.random();
    S.cr[i] = c[0]; S.cg[i] = c[1]; S.cb[i] = c[2]; S.a[i] = a; S.age[i] = -(delay || 0); S.life[i] = life; S.hold[i] = hold || 0;
    return i;
  }
  let decalNext = 0; // when the decal pool is full the oldest one gives way (they are long lived)
  function decal(x, y, z, nx, ny, nz, size, mode, c, a, life) {
    let i = ori(DC, x, y, z, nx, ny, nz, size, size, 0.02, 0.02, mode, c, a, life, 0, 0.5);
    if (i < 0) { i = decalNext; decalNext = (decalNext + 1) % DC.N; DC.on[i] = 1; DC.x[i] = x; DC.y[i] = y; DC.z[i] = z; DC.nx[i] = nx; DC.ny[i] = ny; DC.nz[i] = nz;
      DC.r0[i] = DC.r1[i] = size; DC.th0[i] = DC.th1[i] = 0.02; DC.mode[i] = mode; DC.rot[i] = Math.random(); DC.cr[i] = c[0]; DC.cg[i] = c[1]; DC.cb[i] = c[2]; DC.a[i] = a; DC.age[i] = 0; DC.life[i] = life; DC.hold[i] = 0.5; }
    return i;
  }

  /* ---------------------------------------------------------- ribbons: trails and lightning */
  const ribMat = (color) => {
    const m = new THREE.ShaderMaterial({ uniforms: uni({ uColor: { value: new THREE.Vector3().fromArray(color) }, uAlpha: { value: 1 }, uCore: { value: 0.8 }, uFade: { value: 1.3 } }),
      vertexShader: RIB_VS, fragmentShader: RIB_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    m.userData.keepMat = true; return m;
  };
  const mkRibbon = (maxPts, strips) => {
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(maxPts * 2 * 3), 3); pos.setUsage(THREE.DynamicDrawUsage);
    const side = new Float32Array(maxPts * 2), tt = new THREE.BufferAttribute(new Float32Array(maxPts * 2), 1); tt.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < maxPts; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
    g.setAttribute('position', pos); g.setAttribute('aSide', new THREE.BufferAttribute(side, 1)); g.setAttribute('aT', tt);
    const idx = [];
    let base = 0;
    for (const n of strips) { for (let i = 0; i < n - 1; i++) { const a = (base + i) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } base += n; }
    g.setIndex(idx);
    return { g, pos, tt };
  };
  // write a camera-facing strip from point list (xyz), widths per point; tvals per point
  const writeStrip = (R, start, pts, n, widths, tv) => {
    const P = R.pos.array, T = R.tt.array;
    const cx = _cam.x, cy = _cam.y, cz = _cam.z;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 1) * 3, b = Math.min(n - 1, i + 1) * 3, c = i * 3;
      let tx = pts[a] - pts[b], ty = pts[a + 1] - pts[b + 1], tz = pts[a + 2] - pts[b + 2];
      const vx = cx - pts[c], vy = cy - pts[c + 1], vz = cz - pts[c + 2];
      let sx = ty * vz - tz * vy, sy = tz * vx - tx * vz, sz = tx * vy - ty * vx;
      const l = Math.hypot(sx, sy, sz);
      const w = widths[i];
      if (l > 1e-6) { sx *= w / l; sy *= w / l; sz *= w / l; } else { sx = w; sy = 0; sz = 0; }
      const o = (start + i) * 6;
      P[o] = pts[c] - sx; P[o + 1] = pts[c + 1] - sy; P[o + 2] = pts[c + 2] - sz;
      P[o + 3] = pts[c] + sx; P[o + 4] = pts[c + 1] + sy; P[o + 5] = pts[c + 2] + sz;
      T[(start + i) * 2] = T[(start + i) * 2 + 1] = tv[i];
    }
  };
  const _cam = new THREE.Vector3();

  const TRN = 10, TRP = 48;
  const trails = [];
  for (let k = 0; k < TRN; k++) {
    const R = mkRibbon(TRP, [TRP]);
    const mat = ribMat([1, 1, 1]);
    const mesh = new THREE.Mesh(R.g, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 13; mesh.name = 'vfx-trail';
    if (scene) scene.add(mesh); added.push(mesh);
    const tr = { R, mat, mesh, on: false, active: false, target: null, ox: 0, oy: 0, oz: 0, hasOff: false, width: 0.2, life: 0.5, alpha: 1,
      pts: new Float32Array(TRP * 3), ages: new Float32Array(TRP), n: 0, minD: 0.05, wbuf: new Float32Array(TRP), tbuf: new Float32Array(TRP), lin: new Float32Array(TRP * 3),
      stop() { tr.active = false; return tr; },
      set(v) { tr.alpha = clamp(v, 0, 1.5); return tr; },
      setColor(c) { const t = [0, 0, 0]; if (toSRGB(c, t)) tr.mat.uniforms.uColor.value.set(t[0], t[1], t[2]); return tr; } };
    trails.push(tr);
  }

  const BOLTN = 4, BM = 33, BB = 17;
  const bolts = [];
  for (let k = 0; k < BOLTN; k++) {
    const R = mkRibbon(BM + BB * 2, [BM, BB, BB]);
    const mat = ribMat([0.6, 0.75, 1]); mat.uniforms.uFade.value = 0; mat.uniforms.uCore.value = 1.4;
    const mesh = new THREE.Mesh(R.g, mat); mesh.frustumCulled = false; mesh.visible = false; mesh.renderOrder = 15; mesh.name = 'vfx-bolt';
    if (scene) scene.add(mesh); added.push(mesh);
    bolts.push({ R, mat, mesh, on: false, t: 0, dur: 0.4, re: 0, ax: 0, ay: 0, az: 0, bx: 0, by: 0, bz: 0, w: 0.3, branches: 2, a: 1,
      pts: new Float32Array((BM + BB * 2) * 3), wid: new Float32Array(BM + BB * 2), tv: new Float32Array(BM + BB * 2) });
  }
  // midpoint displacement between two points into out[off..off+n*3)
  function boltPath(out, off, n, ax, ay, az, bx, by, bz, rough) {
    out[off] = ax; out[off + 1] = ay; out[off + 2] = az;
    out[off + (n - 1) * 3] = bx; out[off + (n - 1) * 3 + 1] = by; out[off + (n - 1) * 3 + 2] = bz;
    let dx = bx - ax, dy = by - ay, dz = bz - az; const len = Math.hypot(dx, dy, dz) || 1; dx /= len; dy /= len; dz /= len;
    let disp = len * rough, step = n - 1;
    while (step > 1) {
      const half = step >> 1;
      for (let i = 0; i + step < n; i += step) {
        const a = off + i * 3, b = off + (i + step) * 3, m = off + (i + half) * 3;
        let rx = Math.random() - 0.5, ry = Math.random() - 0.5, rz = Math.random() - 0.5;
        const d = rx * dx + ry * dy + rz * dz; rx -= d * dx; ry -= d * dy; rz -= d * dz;
        const k = disp / (Math.hypot(rx, ry, rz) || 1) * (Math.random() * 0.8 + 0.2);
        out[m] = (out[a] + out[b]) * 0.5 + rx * k; out[m + 1] = (out[a + 1] + out[b + 1]) * 0.5 + ry * k; out[m + 2] = (out[a + 2] + out[b + 2]) * 0.5 + rz * k;
      }
      disp *= 0.55; step = half;
    }
  }
  function boltBuild(B) {
    boltPath(B.pts, 0, BM, B.ax, B.ay, B.az, B.bx, B.by, B.bz, 0.17);
    const len = Math.hypot(B.bx - B.ax, B.by - B.ay, B.bz - B.az);
    for (let i = 0; i < BM; i++) { const t = i / (BM - 1); B.wid[i] = B.w * (0.55 + 0.45 * Math.sin(Math.PI * Math.min(1, t * 1.2 + 0.1))); B.tv[i] = 0; }
    for (let k = 0; k < 2; k++) {
      const s = BM + k * BB;
      if (k < B.branches) {
        const from = (6 + ((Math.random() * 18) | 0)) * 3;
        const fx = B.pts[from], fy = B.pts[from + 1], fz = B.pts[from + 2];
        const L = len * rnd(0.25, 0.45);
        const ex = fx + (B.bx - B.ax) / len * L * 0.6 + (Math.random() - 0.5) * L, ey = fy + (B.by - B.ay) / len * L * 0.6 + (Math.random() - 0.5) * L * 0.6, ez = fz + (B.bz - B.az) / len * L * 0.6 + (Math.random() - 0.5) * L;
        boltPath(B.pts, s * 3, BB, fx, fy, fz, ex, ey, ez, 0.22);
        for (let i = 0; i < BB; i++) { B.wid[s + i] = B.w * 0.5 * (1 - i / (BB - 1)); B.tv[s + i] = i / (BB - 1) * 0.7; }
      } else {
        for (let i = 0; i < BB; i++) { B.pts[(s + i) * 3] = B.ax; B.pts[(s + i) * 3 + 1] = B.ay; B.pts[(s + i) * 3 + 2] = B.az; B.wid[s + i] = 0; B.tv[s + i] = 1; }
      }
    }
  }

  /* ---------------------------------------------------------- screen mesh: speed lines, flare, rays */
  const NL = 56, NG = 7, NR = 14;
  const scr = (() => {
    const total = NL + NG + NR + 2;
    const g = new THREE.InstancedBufferGeometry();
    g.setIndex(plane.index); g.setAttribute('position', plane.getAttribute('position')); g.setAttribute('uv', plane.getAttribute('uv'));
    const I = new Float32Array(total * 4), J = new Float32Array(total * 4);
    let k = 0;
    const put = (a, b, c, d, r, gg, bb) => { I[k * 4] = a; I[k * 4 + 1] = b; I[k * 4 + 2] = c; I[k * 4 + 3] = d; J[k * 4] = r; J[k * 4 + 1] = gg; J[k * 4 + 2] = bb; J[k * 4 + 3] = 1; k++; };
    for (let i = 0; i < NL; i++) put(0, (i + Math.random() * 0.6) / NL, Math.random(), Math.random(), 1, 1, 1);
    const ghosts = [[0.3, 0.05, 0.25, [1, 0.7, 0.4]], [0.55, 0.11, 0.18, [0.5, 1, 0.7]], [0.75, 0.035, 0.35, [0.6, 0.7, 1]], [1.05, 0.16, 0.12, [1, 0.5, 0.8]],
      [1.25, 0.06, 0.22, [0.7, 0.9, 1]], [1.5, 0.22, 0.08, [1, 0.85, 0.5]], [1.8, 0.09, 0.15, [0.6, 1, 0.9]]];
    for (const gh of ghosts) put(1, gh[0], gh[1], gh[2], gh[3][0], gh[3][1], gh[3][2]);
    for (let i = 0; i < NR; i++) put(2, (i + Math.random() * 0.5) / NR, Math.random(), Math.random(), 1, 1, 1);
    put(3, 0, 0.32, 1, 1, 1, 1);
    put(4, 0, 1.1, 1, 0.75, 0.85, 1);
    g.setAttribute('aI', new THREE.InstancedBufferAttribute(I, 4)); g.setAttribute('aJ', new THREE.InstancedBufferAttribute(J, 4));
    g.instanceCount = total;
    const mat = new THREE.ShaderMaterial({ uniforms: { uTime: U.uTime, uSpeed: { value: 0 }, uFlare: { value: 0 }, uRays: { value: 0 }, uAspect: { value: 1 },
      uLight: { value: new THREE.Vector3() }, uLightCol: { value: new THREE.Vector3(1, 0.95, 0.85) }, uLineCol: { value: new THREE.Vector3(0.9, 0.95, 1) } },
      vertexShader: SCR_VS, fragmentShader: SCR_FS, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
    mat.userData.keepMat = true;
    const mesh = new THREE.Mesh(g, mat); mesh.frustumCulled = false; mesh.renderOrder = 999; mesh.visible = false; mesh.name = 'vfx-screen';
    if (scene) scene.add(mesh); added.push(mesh);
    return { mesh, mat, speed: 0, speedT: 0, flare: 0, flareT: 0, rays: 0, raysT: 0 };
  })();
  const screenHandle = (kind) => {
    const h = {
      get active() { return kind === 'flare' ? scr.flareT > 0 : scr.raysT > 0; },
      set(v) { if (v && v.x != null) scr.mat.uniforms.uLight.value.set(v.x, v.y, v.z); else if (typeof v === 'number') { if (kind === 'flare') scr.flareT = v; else scr.raysT = v; } return h; },
      stop() { if (kind === 'flare') scr.flareT = 0; else scr.raysT = 0; return h; },
    };
    return h;
  };
  const flareH = screenHandle('flare'), raysH = screenHandle('rays');

  /* ---------------------------------------------------------- lights */
  const nLights = o.lights != null ? (o.lights | 0) : (lowTier() ? 0 : (q >= 1 ? 1 : 0));
  const lights = [];
  for (let k = 0; k < nLights; k++) {
    const L = new THREE.PointLight(0xffffff, 0, 10 * unit, 2); L.castShadow = false; L.name = 'vfx-light';
    if (scene) scene.add(L); added.push(L);
    lights.push({ L, t: 0, dur: 0, peak: 0, fl: 0 });
  }
  function flashLight(x, y, z, col, peak, dist, dur) {
    if (!lights.length || tier() === 0) return;
    let best = lights[0];
    for (const l of lights) if (l.L.intensity < best.L.intensity) best = l;
    best.L.position.set(x, y, z); _lin.setRGB(col[0], col[1], col[2]); _lin.convertSRGBToLinear(); best.L.color.copy(_lin);
    best.L.distance = dist * unit; best.peak = peak * unit * unit * (reduced ? 0.5 : 1); best.t = 0; best.dur = dur; best.fl = reduced ? 0 : 1;
    best.L.intensity = best.peak;
  }

  /* ---------------------------------------------------------- continuous emitters */
  const EN = 32;
  const T_NITRO = 1, T_PYRO = 2, T_SHELL = 3, T_PLUME = 4, T_CANNON = 5;
  const em = [];
  for (let k = 0; k < EN; k++) {
    const e = { type: 0, on: false, t: 0, dur: 0, x: 0, y: 0, z: 0, tx: 0, ty: 0, tz: 0, obj: null, ox: 0, oy: 0, oz: 0, dx: 0, dy: 0, dz: -1,
      px: 0, py: 0, pz: 0, hasPrev: false, hasCol2: false, size: 1, level: 1, acc: 0, acc2: 0, burst: 'mixed', fire: false, col: [1, 1, 1], col2: [1, 1, 1], hasCol: false, palette: FEST,
      get active() { return e.on; },
      stop() { if (e.type === T_PLUME || e.type === T_NITRO || e.type === T_PYRO || e.type === T_CANNON) e.on = false; return e; },
      set(v) { e.level = clamp(+v || 0, 0, 2); return e; } };
    em.push(e);
  }
  const takeEm = (type) => {
    for (const e of em) if (!e.on) { e.type = type; e.on = true; e.t = 0; e.acc = 0; e.acc2 = 0; e.level = 1; e.hasPrev = false; e.obj = null; e.hasCol = false; return e; }
    return null;
  };
  const DUMMY = { active: false, stop() { return DUMMY; }, set() { return DUMMY; }, setColor() { return DUMMY; } };

  /* ---------------------------------------------------------- state: time warp and shake */
  const W = { on: false, t: 0, dur: 0, scale: 1, k: 1 };
  const shake = { trauma: 0, off: new THREE.Vector3(), applied: false, seed: Math.random() * 100 };
  let T = 0;

  /* ---------------------------------------------------------- simulation */
  const fogCol = [0, 0, 0];
  function syncCamera() {
    if (!cam) return;
    cam.updateMatrixWorld();
    _cam.setFromMatrixPosition(cam.matrixWorld);
    if (dirLight) {
      dirLight.updateMatrixWorld(); _v1.setFromMatrixPosition(dirLight.matrixWorld); _v2.setFromMatrixPosition(dirLight.target.matrixWorld); LW.copy(_v1).sub(_v2).normalize();
      // the smoke takes the scene's own key and fill, so a night scene gets dark smoke
      const k = clamp(dirLight.intensity / 2.6, 0.12, 1.25) * 0.85; _col.copy(dirLight.color).convertLinearToSRGB(); U.uSun.value.set(_col.r * k, _col.g * k, _col.b * k);
      if (ambLight) { const a = clamp(ambLight.intensity / 1.1, 0.15, 1.2) * 0.55; _col.copy(ambLight.color).convertLinearToSRGB(); U.uAmb.value.set(_col.r * a, _col.g * a, _col.b * a); }
    }
    U.uLightW.value.copy(LW);
    U.uLightV.value.copy(LW).transformDirection(cam.matrixWorldInverse);
    const f = scene && scene.fog;
    if (f) {
      _col.copy(f.color).convertLinearToSRGB(); fogCol[0] = _col.r; fogCol[1] = _col.g; fogCol[2] = _col.b; U.uFogCol.value.set(_col.r, _col.g, _col.b);
      if (f.isFogExp2) U.uFog.value.set(2, f.density, 0); else U.uFog.value.set(1, f.near, f.far);
    } else U.uFog.value.set(0, 0, 1);
    if (cam.isPerspectiveCamera) scr.mat.uniforms.uAspect.value = cam.aspect || 1;
    const cv = renderer.domElement; if (cv && cv.height) U.uResY.value = cv.height;
  }

  // shell sort of the alpha layer, far to near (no allocation)
  function sortOrder(P, n) {
    const ord = P.order, key = P.key;
    for (let gap = n >> 1; gap > 0; gap >>= 1) {
      for (let i = gap; i < n; i++) {
        const t = ord[i], kt = key[t]; let j = i;
        while (j >= gap && key[ord[j - gap]] < kt) { ord[j] = ord[j - gap]; j -= gap; }
        ord[j] = t;
      }
    }
  }
  const fwd = new THREE.Vector3();
  const childOn = () => tier() >= 2;
  function stepParts(P, dt) {
    let last = -1, n = 0;
    const ch = P.add;
    const chGap = [0.09, 0.07, 0.055, 0.045][tier()];
    for (let i = 0; i < P.hi; i++) {
      if (!P.on[i]) continue;
      P.age[i] += dt;
      const age = P.age[i];
      if (age >= P.life[i]) { killP(P, i); continue; }
      last = i;
      if (age < 0) continue;
      const dr = Math.exp(-P.drag[i] * dt);
      P.vx[i] *= dr; P.vz[i] *= dr; P.vy[i] = P.vy[i] * dr + P.gr[i] * dt;
      const tb = P.turb[i];
      if (tb > 0) {
        const s = P.seed[i] * 9;
        P.vx[i] += tb * Math.sin(P.y[i] * 1.3 / unit + T * 1.7 + s) * dt;
        P.vz[i] += tb * Math.cos(P.x[i] * 1.1 / unit + T * 1.3 + s * 0.7) * dt;
        P.vy[i] += tb * 0.4 * Math.sin(P.z[i] * 1.2 / unit + T * 2.1 + s * 1.3) * dt;
      }
      P.x[i] += P.vx[i] * dt; P.y[i] += P.vy[i] * dt; P.z[i] += P.vz[i] * dt;
      const t = age / P.life[i];
      const size = P.s0[i] + (P.s1[i] - P.s0[i]) * (1 - (1 - t) * (1 - t));
      const g = gAt(P.x[i], P.z[i]) + P.fl[i] * size;
      if (P.y[i] < g) {
        if (P.bnc[i] > 0 && P.vy[i] < -1.2 * unit) { P.y[i] = g; P.vy[i] = -P.vy[i] * P.bnc[i]; P.vx[i] *= 0.7; P.vz[i] *= 0.7; }
        else if (P.str[i] > 0 && P.add) { killP(P, i); continue; }
        else { P.y[i] = g; if (P.vy[i] < 0) P.vy[i] = 0; const fr = Math.exp(-4 * dt); P.vx[i] *= fr; P.vz[i] *= fr; }
      }
      P.rot[i] += P.vr[i] * dt;
      if (ch && P.tr[i]) {
        P.acc[i] += dt;
        const gap = P.tr[i] === 2 ? chGap * 0.6 : chGap;
        while (P.acc[i] >= gap) {
          P.acc[i] -= gap;
          const j = allocP(P); if (j < 0) break;
          const fade = 1 - t;
          P.x[j] = P.x[i] - P.vx[i] * P.acc[i]; P.y[j] = P.y[i] - P.vy[i] * P.acc[i]; P.z[j] = P.z[i] - P.vz[i] * P.acc[i];
          P.vx[j] = P.vx[i] * 0.08 + (Math.random() - 0.5) * 0.4 * unit; P.vy[j] = P.vy[i] * 0.08 - 0.3 * unit; P.vz[j] = P.vz[i] * 0.08 + (Math.random() - 0.5) * 0.4 * unit;
          P.age[j] = 0; P.life[j] = rnd(0.35, 0.6) * (P.tr[i] === 2 ? 1.8 : 1); P.s0[j] = size * 0.55; P.s1[j] = size * 0.2; P.rot[j] = 0; P.vr[j] = 0;
          const cr = P.r0[i] + (P.r1[i] - P.r0[i]) * t, cg = P.g0[i] + (P.g1[i] - P.g0[i]) * t, cb = P.b0[i] + (P.b1[i] - P.b0[i]) * t;
          P.r0[j] = Math.min(1, cr * 0.7 + 0.3); P.g0[j] = Math.min(1, cg * 0.7 + 0.22); P.b0[j] = cb * 0.6 + 0.05;
          P.r1[j] = cr * 0.8; P.g1[j] = cg * 0.35; P.b1[j] = cb * 0.2;
          P.a[j] = 0.8 * fade; P.fin[j] = 0; P.fp[j] = 1.2; P.gr[j] = -1.2 * unit; P.drag[j] = 2.5; P.turb[j] = 0; P.bnc[j] = 0;
          P.mode[j] = 0; P.h0[j] = 0.4; P.h1[j] = 0; P.hp[j] = 1; P.str[j] = 0; P.tint[j] = P.tint[i]; P.fl[j] = 0; P.seed[j] = Math.random(); P.acc[j] = 0; P.tr[j] = 0;
          if (j > last) last = j;
        }
      }
    }
    P.hi = last + 1;
    // write instance data
    const A = P.A, pos = A.pos.array, vel = A.vel.array, col = A.col.array, sz = A.sz.array, dat = A.dat.array, gnd = A.gnd.array;
    let m = 0;
    if (!P.add) {
      fwd.set(0, 0, -1).transformDirection(cam.matrixWorld);
      for (let i = 0; i < P.hi; i++) if (P.on[i] && P.age[i] >= 0) { P.order[m] = i; P.key[i] = (P.x[i] - _cam.x) * fwd.x + (P.y[i] - _cam.y) * fwd.y + (P.z[i] - _cam.z) * fwd.z; m++; }
      sortOrder(P, m);
    } else {
      for (let i = 0; i < P.hi; i++) if (P.on[i] && P.age[i] >= 0) P.order[m++] = i;
    }
    for (let k = 0; k < m; k++) {
      const i = P.order[k];
      const t = P.age[i] / P.life[i];
      const size = P.s0[i] + (P.s1[i] - P.s0[i]) * (1 - (1 - t) * (1 - t));
      const fin = P.fin[i] > 0 ? Math.min(1, t / P.fin[i]) : 1;
      const al = P.a[i] * fin * Math.pow(Math.max(0, 1 - t), P.fp[i]);
      const n3 = n * 3, n4 = n * 4;
      pos[n3] = P.x[i]; pos[n3 + 1] = P.y[i]; pos[n3 + 2] = P.z[i];
      vel[n3] = P.vx[i]; vel[n3 + 1] = P.vy[i]; vel[n3 + 2] = P.vz[i];
      col[n4] = P.r0[i] + (P.r1[i] - P.r0[i]) * t; col[n4 + 1] = P.g0[i] + (P.g1[i] - P.g0[i]) * t; col[n4 + 2] = P.b0[i] + (P.b1[i] - P.b0[i]) * t; col[n4 + 3] = al;
      sz[n4] = size; sz[n4 + 1] = P.rot[i]; sz[n4 + 2] = P.str[i]; sz[n4 + 3] = P.mode[i];
      dat[n4] = P.seed[i]; dat[n4 + 1] = t; dat[n4 + 2] = P.h1[i] + (P.h0[i] - P.h1[i]) * Math.pow(1 - t, P.hp[i]); dat[n4 + 3] = P.tint[i];
      gnd[n] = gAt(P.x[i], P.z[i]);
      n++;
    }
    P.live = n;
    P.g.instanceCount = n;
    P.mesh.visible = n > 0;
    if (n) flushAttrs(A, n);
  }

  function stepConfetti(dt) {
    const C = conf, A = C.A; let n = 0, last = -1;
    const pos = A.pos.array, ax = A.ax.array, col = A.col.array, sz = A.sz.array;
    for (let i = 0; i < C.hi; i++) {
      if (!C.on[i]) continue;
      C.age[i] += dt;
      if (C.age[i] >= C.life[i]) { C.on[i] = 0; C.free[C.top++] = i; continue; }
      last = i;
      if (C.age[i] < 0) continue;
      if (!C.rest[i]) {
        // fast at first, then paper drag takes over and it flutters down
        const sp = Math.hypot(C.vx[i], C.vy[i], C.vz[i]) / unit;
        const drag = 0.8 + sp * 0.35;
        const dr = Math.exp(-drag * dt);
        C.vx[i] *= dr; C.vz[i] *= dr; C.vy[i] = C.vy[i] * dr - 9.8 * unit * dt;
        if (C.vy[i] < -1.1 * unit) C.vy[i] += (-1.1 * unit - C.vy[i]) * Math.min(1, 6 * dt);
        C.ph[i] += dt * 3.2;
        const sway = Math.sin(C.ph[i]) * 0.9 * unit;
        C.x[i] += (C.vx[i] + sway * 0.6) * dt; C.y[i] += C.vy[i] * dt; C.z[i] += (C.vz[i] + Math.cos(C.ph[i] * 0.8) * 0.5 * unit) * dt;
        C.ang[i] += C.va[i] * dt;
        const g = gAt(C.x[i], C.z[i]) + 0.004 * unit;
        if (C.y[i] < g) { C.y[i] = g; C.rest[i] = 1; C.ax[i] = 1; C.ay[i] = 0; C.az[i] = 0; C.ang[i] = Math.PI / 2 + (Math.random() - 0.5) * 0.3; }
      }
      const t = C.age[i] / C.life[i];
      const n3 = n * 3, n4 = n * 4;
      pos[n3] = C.x[i]; pos[n3 + 1] = C.y[i]; pos[n3 + 2] = C.z[i];
      ax[n4] = C.ax[i]; ax[n4 + 1] = C.ay[i]; ax[n4 + 2] = C.az[i]; ax[n4 + 3] = C.ang[i];
      col[n4] = C.r[i]; col[n4 + 1] = C.gg[i]; col[n4 + 2] = C.b[i]; col[n4 + 3] = t > 0.8 ? (1 - t) / 0.2 : 1;
      sz[n4] = C.w[i]; sz[n4 + 1] = C.h[i]; sz[n4 + 2] = C.metal[i]; sz[n4 + 3] = 0;
      n++;
    }
    C.hi = last + 1; C.g.instanceCount = n; C.mesh.visible = n > 0;
    if (n) flushAttrs(A, n);
    return n;
  }

  const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c3 = new THREE.Color();
  function stepSolid(S, dt) {
    let n = 0, last = -1;
    for (let i = 0; i < S.hi; i++) {
      if (!S.on[i]) continue;
      S.age[i] += dt;
      if (S.age[i] >= S.life[i]) { S.on[i] = 0; S.free[S.top++] = i; continue; }
      last = i;
      if (!S.rest[i]) {
        const dr = Math.exp(-0.25 * dt);
        S.vx[i] *= dr; S.vz[i] *= dr; S.vy[i] = S.vy[i] * dr - 9.8 * unit * dt;
        S.x[i] += S.vx[i] * dt; S.y[i] += S.vy[i] * dt; S.z[i] += S.vz[i] * dt;
        S.rx[i] += S.wx[i] * dt; S.ry[i] += S.wy[i] * dt; S.rz[i] += S.wz[i] * dt;
        const g = gAt(S.x[i], S.z[i]) + S.sy[i] * 0.3;
        if (S.y[i] < g) {
          S.y[i] = g;
          if (S.vy[i] < -1.5 * unit && S.bnc[i] > 0) { S.vy[i] = -S.vy[i] * S.bnc[i]; S.vx[i] *= 0.6; S.vz[i] *= 0.6; S.wx[i] *= 0.6; S.wy[i] *= 0.6; S.wz[i] *= 0.6; }
          else { S.vy[i] = 0; S.vx[i] *= 0.5; S.vz[i] *= 0.5; if (Math.hypot(S.vx[i], S.vz[i]) < 0.3 * unit) { S.rest[i] = 1; S.wx[i] = S.wy[i] = S.wz[i] = 0; } }
        }
        if (S.smoke[i] > 0 && S.age[i] < S.smoke[i]) {
          S.acc[i] += dt;
          while (S.acc[i] > 0.045) {
            S.acc[i] -= 0.045;
            reset(); O.sm = Math.max(0.25, S.sx[i] / unit * 2.2); O.lm = 0.5; O.am = 0.8 * (1 - S.age[i] / S.smoke[i]);
            emit(R_TRAILSMOKE, 1, S.x[i], S.y[i], S.z[i]);
          }
        }
      }
      const t = S.age[i] / S.life[i];
      const k = t > 0.85 ? (1 - t) / 0.15 : 1;
      _e.set(S.rx[i], S.ry[i], S.rz[i]); _q.setFromEuler(_e);
      _m4.compose(_p.set(S.x[i], S.y[i], S.z[i]), _q, _s.set(S.sx[i] * k, S.sy[i] * k, S.sz[i] * k));
      S.mesh.setMatrixAt(n, _m4); S.mesh.setColorAt(n, _c3.setRGB(S.r[i], S.g[i], S.b[i]));
      n++;
    }
    S.hi = last + 1; S.mesh.count = n; S.mesh.visible = n > 0;
    if (n) { S.mesh.instanceMatrix.needsUpdate = true; S.mesh.instanceColor.needsUpdate = true; }
  }

  function stepOri(S, dt, ring) {
    const A = S.A; let n = 0, last = -1;
    const pos = A.pos.array, nrm = A.nrm.array, col = A.col.array, par = A.par.array;
    for (let i = 0; i < S.hi; i++) {
      if (!S.on[i]) continue;
      S.age[i] += dt;
      if (S.age[i] >= S.life[i]) { S.on[i] = 0; S.free[S.top++] = i; continue; }
      last = i;
      if (S.age[i] < 0) continue;
      const t = S.age[i] / S.life[i];
      let r, th, a;
      if (ring) { const e = easeOut(t); r = S.r0[i] + (S.r1[i] - S.r0[i]) * e; th = S.th0[i] + (S.th1[i] - S.th0[i]) * t; a = S.a[i] * Math.pow(1 - t, 1.3) * Math.min(1, t / 0.06); }
      else { r = S.r0[i] * Math.min(1, 0.55 + S.age[i] / 0.08 * 0.45); th = S.th0[i]; a = S.a[i] * (t > S.hold[i] ? Math.max(0, 1 - (t - S.hold[i]) / (1 - S.hold[i])) : 1); }
      const n3 = n * 3, n4 = n * 4;
      pos[n3] = S.x[i]; pos[n3 + 1] = S.y[i]; pos[n3 + 2] = S.z[i];
      nrm[n3] = S.nx[i]; nrm[n3 + 1] = S.ny[i]; nrm[n3 + 2] = S.nz[i];
      col[n4] = S.cr[i]; col[n4 + 1] = S.cg[i]; col[n4 + 2] = S.cb[i]; col[n4 + 3] = a;
      par[n4] = r; par[n4 + 1] = th; par[n4 + 2] = S.mode[i]; par[n4 + 3] = S.rot[i];
      n++;
    }
    S.hi = last + 1; S.g.instanceCount = n; S.mesh.visible = n > 0;
    if (n) flushAttrs(A, n);
  }

  const _wp = new THREE.Vector3(), _wd = new THREE.Vector3();
  function targetPos(tr) {
    const tg = tr.target;
    if (tg && tg.isObject3D) {
      tg.updateWorldMatrix(true, false);
      if (tr.hasOff) _wp.set(tr.ox, tr.oy, tr.oz).applyMatrix4(tg.matrixWorld); else _wp.setFromMatrixPosition(tg.matrixWorld);
    } else if (tg) _wp.set(tg.x, tg.y, tg.z);
    return _wp;
  }
  function stepTrails(dt) {
    for (const tr of trails) {
      if (!tr.on) continue;
      const P = tr.pts, Ag = tr.ages;
      for (let i = 0; i < tr.n; i++) Ag[i] += dt;
      while (tr.n > 0 && Ag[tr.n - 1] > tr.life) tr.n--;
      if (tr.active && tr.target) {
        const p = targetPos(tr);
        // points are stored newest first; the head always sits on the target and a new point is
        // committed once it has moved minD past the last committed one
        const ref = tr.n >= 2 ? 3 : 0;
        if (tr.n === 0 || Math.hypot(P[ref] - p.x, P[ref + 1] - p.y, P[ref + 2] - p.z) > tr.minD) {
          const cap = Math.min(tr.n, TRP - 1);
          for (let i = cap; i > 0; i--) { P[i * 3] = P[(i - 1) * 3]; P[i * 3 + 1] = P[(i - 1) * 3 + 1]; P[i * 3 + 2] = P[(i - 1) * 3 + 2]; Ag[i] = Ag[i - 1]; }
          tr.n = cap + 1;
        }
        P[0] = p.x; P[1] = p.y; P[2] = p.z; Ag[0] = 0;
      } else if (tr.n === 0) { tr.on = false; tr.mesh.visible = false; continue; }
      const n = tr.n;
      if (n < 2) { tr.mesh.visible = false; continue; }
      for (let i = 0; i < n; i++) {
        const k = Ag[i] / tr.life;
        tr.tbuf[i] = Math.min(1, Math.max(k, i / (n - 1) * 0.35));
        tr.wbuf[i] = tr.width * (1 - k * 0.65) * (i === 0 ? 0.6 : 1);
      }
      writeStrip(tr.R, 0, P, n, tr.wbuf, tr.tbuf);
      tr.R.pos.needsUpdate = true; tr.R.tt.needsUpdate = true;
      tr.R.g.setDrawRange(0, (n - 1) * 6);
      tr.mat.uniforms.uAlpha.value = tr.alpha * (tr.active ? 1 : 0.85);
      tr.mesh.visible = true;
    }
  }

  function stepBolts(dt) {
    for (const B of bolts) {
      if (!B.on) continue;
      B.t += dt;
      if (B.t >= B.dur) { B.on = false; B.mesh.visible = false; continue; }
      B.re -= dt;
      if (B.re <= 0 && !reduced) { boltBuild(B); B.re = rnd(0.045, 0.08); }
      writeStrip(B.R, 0, B.pts, BM + BB * 2, B.wid, B.tv);
      B.R.pos.needsUpdate = true; B.R.tt.needsUpdate = true;
      const k = B.t / B.dur;
      const flick = reduced ? 0.8 : (0.55 + 0.45 * Math.random()) * (k < 0.15 ? 1.2 : 1);
      B.mat.uniforms.uAlpha.value = B.a * flick * (1 - k * k);
      B.mesh.visible = true;
    }
  }

  function stepEmitters(dt) {
    const r = rate();
    for (const e of em) {
      if (!e.on) continue;
      e.t += dt;
      if (e.t < 0) continue;
      const s = e.size;
      if (e.type === T_NITRO) {
        const ob = e.obj;
        if (!ob || !ob.parent) { e.on = false; continue; }
        ob.updateWorldMatrix(true, false);
        _wp.set(e.ox, e.oy, e.oz).applyMatrix4(ob.matrixWorld);
        _wd.set(e.dx, e.dy, e.dz).transformDirection(ob.matrixWorld);
        let ivx = 0, ivy = 0, ivz = 0;
        if (e.hasPrev && dt > 0) { ivx = (_wp.x - e.px) / dt; ivy = (_wp.y - e.py) / dt; ivz = (_wp.z - e.pz) / dt; }
        e.px = _wp.x; e.py = _wp.y; e.pz = _wp.z; e.hasPrev = true;
        if (e.level <= 0.01) continue;
        e.acc += dt * 110 * Math.max(0.35, r) * e.level;
        const nn = Math.floor(e.acc); e.acc -= nn;
        if (nn > 0) {
          reset(); O.sm = s * (0.8 + 0.3 * e.level); O.vm = s * (0.8 + 0.3 * e.level); setDir(_wd.x, _wd.y, _wd.z); O.ivx = ivx * 0.9; O.ivy = ivy * 0.9; O.ivz = ivz * 0.9;
          if (e.hasCol) { setColA(e.col); O.tint = 0.55; }
          emit(R_NOUT, nn, _wp.x, _wp.y, _wp.z);
          reset(); O.sm = s; O.vm = s; setDir(_wd.x, _wd.y, _wd.z); O.ivx = ivx * 0.95; O.ivy = ivy * 0.95; O.ivz = ivz * 0.95; setColA(e.hasCol ? e.col : NITRO_BLUE);
          emit(R_NCORE, Math.max(1, nn >> 1), _wp.x, _wp.y, _wp.z);
          if (Math.random() < 0.5 * r) { reset(); O.sm = s; O.vm = s; setDir(_wd.x, _wd.y + 0.15, _wd.z); O.cone = 0.6; O.ivx = ivx * 0.5; O.ivy = ivy * 0.5; O.ivz = ivz * 0.5; emit(R_EXHAUST, 1, _wp.x, _wp.y, _wp.z); }
          if (Math.random() < 0.18 * e.level) { reset(); O.sm = s; O.vm = s * 0.5; setDir(_wd.x, _wd.y + 0.3, _wd.z); O.cone = 0.7; O.ivx = ivx * 0.7; O.ivy = ivy * 0.7; O.ivz = ivz * 0.7; emit(R_SPARK, 1, _wp.x, _wp.y, _wp.z); }
        }
        reset(); O.sm = s * (0.7 + 0.5 * e.level); setColA(e.hasCol ? e.col : NITRO_GLOW); O.am = reduced ? 0.6 : (0.85 + 0.3 * Math.random()) * e.level;
        emit(R_HEAT, 1, _wp.x + _wd.x * 0.25 * s * unit, _wp.y + _wd.y * 0.25 * s * unit, _wp.z + _wd.z * 0.25 * s * unit);
      } else if (e.type === T_PYRO) {
        if (e.dur > 0 && e.t > e.dur) { e.on = false; continue; }
        e.acc += dt * 75 * Math.max(0.35, r);
        const nn = Math.floor(e.acc); e.acc -= nn;
        if (nn > 0) {
          reset(); O.sm = s; O.vm = s; setDir(0, 1, 0); if (e.hasCol) { setColA(e.col); O.tint = 0.5; }
          emit(R_PYRO, nn, e.x, e.y, e.z);
          if (Math.random() < 0.6) { reset(); O.sm = s; O.vm = s * 0.7; setDir(0, 1, 0); O.cone = 0.9; emit(R_SPARK, 1, e.x, e.y + 0.5 * unit, e.z); }
          if (Math.random() < 0.25 * Math.max(0.5, r)) { reset(); O.sm = s; O.vm = s; emit(R_PSMOKE, 1, e.x, e.y + 4.5 * s * unit, e.z); }
        }
        reset(); O.sm = s * 1.4; O.am = 0.5; emit(R_HEAT, 1, e.x, e.y + 0.6 * s * unit, e.z);
      } else if (e.type === T_SHELL) {
        if (e.dur <= 0 || e.t >= e.dur) { e.on = false; shellBurst(e); continue; }
        const k = e.t / e.dur, ke = 1 - (1 - k) * (1 - k);
        const x = e.x + (e.tx - e.x) * k + Math.sin(e.t * 23 + e.acc2) * 0.06 * unit, y = e.y + (e.ty - e.y) * ke, z = e.z + (e.tz - e.z) * k;
        const vy = (e.ty - e.y) * 2 * (1 - k) / e.dur;
        reset(); O.tint = 1; O.sm = s; O.vm = s; O.ivy = vy * 0.15; setDir(0, -1, 0); O.cone = 0.7;
        emit(R_ROCKET, Math.max(1, Math.round(2 * r + 0.4)), x, y, z);
        reset(); O.tint = 1; O.sm = s * 0.8; setColA(GOLD); O.lm = 0.3; emit(R_GLOW, 1, x, y, z);
      } else if (e.type === T_PLUME) {
        if (e.dur > 0 && e.t > e.dur) { e.on = false; continue; }
        e.acc += dt * 10 * Math.max(0.35, r) * e.level;
        let nn = Math.floor(e.acc); e.acc -= nn;
        if (nn > 0) {
          reset(); O.sm = s; O.vm = s; if (e.hasCol) setColA(e.col);
          emit(R_PLUME, nn, e.x, e.y, e.z);
          if (e.fire) { reset(); O.sm = s; O.vm = s; emit(R_LICK, nn + 1, e.x, e.y, e.z); }
        }
      } else if (e.type === T_CANNON) {
        if (e.t > e.dur) { e.on = false; continue; }
        e.acc += dt * 520 * r;
        const nn = Math.floor(e.acc); e.acc -= nn;
        if (nn > 0) confettiN(nn, e.x, e.y, e.z, e.dx, e.dy, e.dz, 0.93, 11 * s, 18 * s, s, e.palette, 0);
        if (e.t < dt * 1.5) {
          reset(); O.sm = s; O.vm = s; setDir(e.dx, e.dy, e.dz); O.cone = 0.85; setCol('#f2efe8');
          emit(R_PUFF, cnt(5, 2), e.x, e.y, e.z);
          reset(); O.sm = s; O.vm = s * 2.5; setDir(e.dx, e.dy, e.dz); O.cone = 0.9; setColA(GOLD); emit(R_SPARKLE, cnt(14, 4), e.x, e.y, e.z);
        }
      }
    }
  }
  const NITRO_BLUE = hexS('#7ec3ff');
  const NITRO_GLOW = hexS('#ff8a3a');
  const R_TRAILSMOKE = RC({ L: 1, m: 0, life: [0.9, 1.5], s0: [0.3, 0.4], s1: [0.9, 1.4], sp: [0, 0.3], g: 0.6, drag: 1, turb: 0.6,
    c0: [0.2, 0.19, 0.18], c1: [0.45, 0.44, 0.43], a: 0.65, lit: 1, h0: 0.5, hp: 6, fin: 0.05, fp: 1.4 });

  function shellBurst(e) {
    const x = e.tx, y = e.ty, z = e.tz, s = e.size;
    let type = e.burst;
    if (type === 'mixed') type = pick(['peony', 'peony', 'chrysanthemum', 'willow', 'ring', 'palm', 'crackle']);
    const ca = e.hasCol ? e.col : pick(FW);
    let cb = e.col2;
    if (!e.hasCol2) { cb = pick(FW); if (cb === ca) cb = FW[(FW.indexOf(ca) + 3) % FW.length]; }
    // flash, light, smoke, embers: every shell
    reset(); O.tint = 1; O.sm = s * 1.1; setColA(ca); O.am = reduced ? 0.35 : 0.9; O.lm = 1.6; emit(R_GLOW, 1, x, y, z);
    reset(); O.tint = 1; O.sm = s * 6; setColA(ca); O.am = reduced ? 0.15 : 0.32; O.lm = 3; emit(R_GLOW, 1, x, y, z);
    if (!reduced) { reset(); O.tint = 1; O.sm = s * 0.4; setColA(ca); O.am = 0.55; emit(R_FLASH, 1, x, y, z); }
    flashLight(x, y, z, ca, 40 * s * s, 60 * s, 0.9);
    reset(); O.sm = s; O.vm = s; emit(R_FWSMOKE, cnt(5, 2), x, y, z);
    const n = cnt(130, 70);
    if (type === 'willow') {
      reset(); O.tint = 1; O.sm = s; O.vm = s * 0.9; setColA([1, 0.76, 0.34]); setColA1([0.85, 0.28, 0.05]); O.lm = 1.7;
      emit(R_STAR, n, x, y, z);
    } else if (type === 'ring') {
      const tx = Math.random() - 0.5, ty = 1, tz = Math.random() - 0.5;
      basis(tx / Math.hypot(tx, ty, tz), ty / Math.hypot(tx, ty, tz), tz / Math.hypot(tx, ty, tz));
      const ax = t1x, ay = t1y, az = t1z, bx = t2x, by = t2y, bz = t2z;
      const m = cnt(70, 24);
      for (let k = 0; k < m; k++) {
        const a = k / m * TAU; const dx = Math.cos(a) * ax + Math.sin(a) * bx, dy = Math.cos(a) * ay + Math.sin(a) * by, dz = Math.cos(a) * az + Math.sin(a) * bz;
        reset(); O.tint = 1; O.sm = s; O.vm = s; setColA(ca); setColA1(cb); setDir(dx, dy, dz); O.cone = 0.9995; emit(R_STAR, 1, x, y, z);
      }
      reset(); O.tint = 1; O.sm = s * 0.8; O.vm = s * 0.45; setColA(cb); setColA1(ca); emit(R_STAR, cnt(30, 10), x, y, z);
    } else if (type === 'palm') {
      reset(); O.tint = 1; O.sm = s; O.vm = s; setDir(0, 1, 0); setColA(GOLD); setColA1([1, 0.4, 0.1]); emit(R_COMET, cnt(9, 5), x, y, z);
      reset(); O.tint = 1; O.sm = s * 0.8; O.vm = s * 0.6; setColA(ca); setColA1(cb); emit(R_STAR, cnt(40, 12), x, y, z);
    } else if (type === 'crackle') {
      reset(); O.tint = 1; O.sm = s * 0.8; O.vm = s * 0.8; setColA(GOLD); O.lm = 0.65; emit(R_STAR, cnt(60, 20), x, y, z);
      reset(); O.tint = 1; O.sm = s; O.rm = 1; for (let k = 0, m = cnt(36, 10); k < m; k++) {
        const ux = rnd(-1, 1), uy = rnd(-1, 1), uz = rnd(-1, 1); const R0 = rnd(3, 7.5) * s * unit;
        emit(R_POP, 1, x + ux * R0, y + uy * R0 - 1.5 * s * unit, z + uz * R0);
      }
    } else {
      // peony and chrysanthemum: a full sphere of stars that change colour as they burn out
      reset(); O.tint = 1; O.sm = s; O.vm = s; setColA(ca); setColA1(cb);
      if (type === 'chrysanthemum') { O.lm = 1.15; }
      emit(R_STAR, n, x, y, z);
      if (type === 'chrysanthemum') { reset(); O.tint = 1; O.sm = s * 0.6; O.vm = s * 0.55; setColA([1, 0.95, 0.85]); setColA1(ca); emit(R_STAR, cnt(30, 8), x, y, z); }
    }
    reset(); O.tint = 1; O.sm = s; O.vm = s; emit(R_FWEMBER, cnt(18, 5), x, y, z);
  }

  function stepLights(dt) {
    for (const l of lights) {
      if (l.L.intensity <= 0) continue;
      l.t += dt;
      if (l.t >= l.dur) { l.L.intensity = 0; continue; }
      const k = l.t / l.dur;
      const env = Math.pow(1 - k, 2.2) * Math.min(1, l.t / 0.02);
      l.L.intensity = l.peak * env * (1 + l.fl * 0.18 * Math.sin(l.t * 57 + Math.sin(l.t * 23) * 3));
    }
  }

  /* ---------------------------------------------------------- presets */
  const vfx = {
    meshes: added,
    get timeScale() { return W.k; },
    get trauma() { return shake.trauma; },
    get quality() { return q; },
    get reduced() { return reduced; },
    shakeOffset: shake.off,

    setQuality(qq) { if (!devFull) q = clamp(qq | 0, 0, 3); setOct(); return vfx; },
    setReduced(b) { reduced = !!b; if (reduced) { W.on = false; W.k = 1; shake.trauma = 0; scr.speedT = 0; } return vfx; },
    setCamera(c) { cam = c; return vfx; },
    setGround(g) { if (typeof g === 'function') { groundFn = g; } else { groundFn = null; groundC = +g || 0; } return vfx; },
    setLighting(L) { setLighting(L); return vfx; },

    update(rawDt) {
      const dt0 = clamp(rawDt || 0, 0, 0.1);
      // time warp
      if (W.on) {
        W.t += dt0;
        const tin = Math.min(0.15, W.dur * 0.3), tout = Math.min(0.4, W.dur * 0.4);
        let env = 1;
        if (W.t < tin) env = smooth(W.t / tin); else if (W.t > W.dur - tout) env = smooth((W.dur - W.t) / tout);
        if (W.t >= W.dur) { W.on = false; env = 0; }
        W.k = 1 - (1 - W.scale) * env;
      } else W.k = 1;
      const dt = dt0 * W.k;
      T += dt; U.uTime.value = T;
      syncCamera();
      stepEmitters(dt);
      stepParts(AD, dt); stepParts(AL, dt);
      stepConfetti(dt);
      stepSolid(CH, dt); stepSolid(SH, dt);
      stepOri(RG, dt, true); stepOri(DC, dt, false);
      stepTrails(dt); stepBolts(dt);
      stepLights(dt);
      // speed lines, flare and rays ease toward their targets in real time
      const ease = 1 - Math.exp(-dt0 * 6);
      scr.speed += ((reduced ? 0 : scr.speedT) - scr.speed) * ease;
      scr.flare += (scr.flareT - scr.flare) * ease;
      scr.rays += (scr.raysT - scr.rays) * ease;
      const su = scr.mat.uniforms;
      su.uSpeed.value = scr.speed < 0.003 ? 0 : scr.speed; su.uFlare.value = scr.flare < 0.003 ? 0 : scr.flare; su.uRays.value = scr.rays < 0.003 ? 0 : scr.rays;
      scr.mesh.visible = su.uSpeed.value > 0 || su.uFlare.value > 0 || su.uRays.value > 0;
      // shake
      if (reduced) shake.trauma = 0;
      shake.trauma = Math.max(0, shake.trauma - dt0 * 1.1);
      const tr2 = shake.trauma * shake.trauma, A = 0.35 * unit * tr2, ts = T * 31 + shake.seed;
      shake.off.set(A * (Math.sin(ts * 1.13) + Math.sin(ts * 2.71) * 0.5) * 0.66, A * (Math.sin(ts * 1.37 + 1) + Math.sin(ts * 3.1) * 0.5) * 0.66, A * Math.sin(ts * 0.91 + 2) * 0.3);
      return W.k;
    },
    applyShake(c) { c = c || cam; if (!c || shake.applied || shake.trauma <= 0) return vfx; c.position.add(shake.off); c.updateMatrixWorld(); shake.applied = true; return vfx; },
    removeShake(c) { c = c || cam; if (!c || !shake.applied) return vfx; c.position.sub(shake.off); c.updateMatrixWorld(); shake.applied = false; return vfx; },
    shake(a) { if (!reduced) shake.trauma = Math.min(1, shake.trauma + (a == null ? 0.4 : a)); return vfx; },
    timeWarp(scale, seconds) {
      if (reduced) return 1;
      W.scale = clamp(scale == null ? 0.3 : scale, 0.05, 1); W.dur = Math.max(0.2, seconds || 1.2); W.t = 0; W.on = true;
      return W.k;
    },

    explosion(pos, opt) {
      opt = opt || {};
      const s = opt.size || 1, x = pos.x, y = pos.y, z = pos.z, gy = gAt(x, z), h = (y - gy) / unit;
      if (!reduced) { reset(); O.sm = s; emit(R_FLASH, 1, x, y + 0.5 * s * unit, z); }
      else { reset(); O.sm = s * 2; O.am = 0.5; emit(R_GLOW, 1, x, y + 0.5 * s * unit, z); }
      reset(); O.sm = s; O.vm = s; if (opt.color) { setCol(opt.color); O.tint = 0.45; }
      emit(R_FIREBALL, cnt(24, 7), x, y + 0.4 * s * unit, z);
      reset(); O.sm = s; O.vm = s; emit(R_FIRECORE, cnt(7, 3), x, y + 0.4 * s * unit, z);
      reset(); O.sm = s; O.vm = s; emit(R_SMOKE, cnt(20, 6), x, y + 0.5 * s * unit, z);
      reset(); O.sm = Math.sqrt(s); O.vm = Math.sqrt(s); emit(R_SPARK, cnt(70, 16), x, y + 0.3 * s * unit, z);
      reset(); O.sm = s; O.vm = s; emit(R_EMBER, cnt(26, 6), x, y + 0.5 * s * unit, z);
      const nch = cnt(14, 4);
      _c3.set(opt.debrisColor || '#3b342e');
      for (let k = 0; k < nch; k++) {
        const a = Math.random() * TAU, up = rnd(0.4, 1), sp = rnd(5, 12) * Math.sqrt(s) * unit;
        const sc = rnd(0.08, 0.26) * s * unit;
        const v = 0.7 + Math.random() * 0.5;
        solid(CH, x, y + 0.3 * s * unit, z, Math.cos(a) * sp * (1 - up * 0.5), up * sp, Math.sin(a) * sp * (1 - up * 0.5), sc * rnd(0.7, 1.3), sc * rnd(0.6, 1), sc * rnd(0.7, 1.3),
          rnd(2.5, 4), 0.35, k < 4 && tier() >= 1 ? rnd(0.8, 1.5) : 0, _lin.setRGB(_c3.r * v, _c3.g * v, _c3.b * v));
      }
      if (h < 3.5 * s) {
        const gp = gy + 0.04 * unit;
        ori(RG, x, gp, z, 0, 1, 0, 0.4 * s * unit, 10 * s * unit, 0.18, 0.4, 0, [0.95, 0.78, 0.58], 0.55, 0.75, 0);
        reset(); O.sm = s; O.vm = s; emit(R_SKIRT, cnt(22, 7), x, gp + 0.2 * unit, z);
        decal(x, gp, z, 0, 1, 0, 2.4 * s * unit, 1, [0, 0, 0], 0.9, 14);
      }
      flashLight(x, y + 1.2 * s * unit, z, [1, 0.62, 0.3], 60 * s * s, 18 * s, 0.75);
      vfx.shake(0.55 * Math.min(1.5, s));
      return vfx;
    },

    impact(pos, normal, opt) {
      opt = opt || {};
      const kind = opt.kind || 'spark', s = opt.size || 1, x = pos.x, y = pos.y, z = pos.z;
      const nx = normal ? normal.x : 0, ny = normal ? normal.y : 1, nz = normal ? normal.z : 0;
      if (kind === 'spark') {
        reset(); O.sm = Math.sqrt(s); O.vm = Math.sqrt(s) * 0.6; setDir(nx, ny, nz); O.cone = 0.05; if (opt.color) setCol(opt.color); O.lm = 0.8; O.am = 1.3;
        emit(R_SPARK, cnt(34, 10), x, y, z);
        reset(); O.sm = s * 0.45; if (opt.color) setCol(opt.color); emit(R_GLOW, 1, x, y, z);
        if (!reduced) { reset(); O.sm = s * 0.16; O.am = 0.9; emit(R_FLASH, 1, x, y, z); }
        ori(RG, x + nx * 0.02 * unit, y + ny * 0.02 * unit, z + nz * 0.02 * unit, nx, ny, nz, 0.05 * s * unit, 0.9 * s * unit, 0.12, 0.3, 1, opt.color ? (toSRGB(opt.color, tmpC), [tmpC[0], tmpC[1], tmpC[2]]) : [1, 0.75, 0.45], 0.8, 0.28, 0);
        reset(); O.sm = s * 0.5; O.vm = s * 0.7; setDir(nx, ny, nz); O.cone = 0.4; setCol('#9a9184'); emit(R_PUFF, cnt(3, 1), x, y, z);
        flashLight(x + nx * 0.4 * unit, y + ny * 0.4 * unit, z + nz * 0.4 * unit, [1, 0.75, 0.45], 10 * s, 6 * s, 0.18);
      } else if (kind === 'dust') {
        reset(); O.sm = s * 1.4; O.vm = s * 1.4; setDir(nx, ny, nz); O.cone = 0.1; if (opt.color) setCol(opt.color); emit(R_PUFF, cnt(14, 5), x, y, z);
        _c3.set(opt.color || '#6e6253');
        for (let k = 0, m = cnt(6, 2); k < m; k++) {
          const sp = rnd(2, 5) * unit * s; const sc = rnd(0.03, 0.07) * s * unit;
          solid(CH, x, y, z, nx * sp + rnd(-1.5, 1.5) * unit, Math.abs(ny) * sp + rnd(1, 3) * unit, nz * sp + rnd(-1.5, 1.5) * unit, sc, sc, sc, rnd(1.2, 2), 0.3, 0, _c3);
        }
      } else if (kind === 'paint') {
        vfx.splat(pos, normal, opt);
      } else if (kind === 'water') {
        vfx.splash(pos, { size: s * 0.8 });
      } else if (kind === 'glass') {
        _c3.set(opt.color || '#bfe3f2');
        for (let k = 0, m = cnt(14, 5); k < m; k++) {
          const sp = rnd(2, 6) * unit * s; const sc = rnd(0.05, 0.13) * s * unit;
          solid(SH, x, y, z, nx * sp + rnd(-2, 2) * unit, ny * sp + rnd(0.5, 3) * unit, nz * sp + rnd(-2, 2) * unit, sc, sc, sc * 0.6, rnd(1.5, 2.5), 0.3, 0, _c3);
        }
        reset(); O.sm = s; O.vm = s; setDir(nx, ny, nz); O.cone = 0.1; emit(R_GLINT, cnt(16, 5), x, y, z);
        reset(); O.sm = s * 0.35; setCol('#dff4ff'); emit(R_GLOW, 1, x, y, z);
      } else if (kind === 'powder') {
        const c = opt.color ? null : pick(FEST);
        reset(); O.sm = s; O.vm = s; setDir(nx, ny, nz); O.cone = 0.05; if (opt.color) setCol(opt.color); else setColA(c);
        emit(R_POWDER, cnt(14, 5), x, y, z);
        reset(); O.sm = s; O.vm = s; setDir(nx, ny, nz); O.cone = 0.2; if (opt.color) setCol(opt.color); else setColA(c);
        emit(R_POWDOT, cnt(26, 8), x, y, z);
      }
      return vfx;
    },

    muzzle(pos, dir, opt) {
      opt = opt || {};
      const s = opt.size || 1, x = pos.x, y = pos.y, z = pos.z;
      const dx = dir ? dir.x : 0, dy = dir ? dir.y : 0, dz = dir ? dir.z : 1;
      reset(); O.sm = s * 0.45; O.vm = s * 1.6; setDir(dx, dy, dz); O.cone = 0.85; O.lm = 0.5; setCol('#eef1f4'); O.am = 0.45;
      emit(R_PUFF, cnt(5, 2), x, y, z);
      reset(); O.sm = s * 0.6; O.vm = s * 0.8; setDir(dx, dy, dz); O.cone = 0.92; if (opt.color) setCol(opt.color); else setColA(pick(FEST)); O.lm = 0.5;
      emit(R_POWDOT, cnt(8, 3), x, y, z);
      ori(RG, x, y, z, dx, dy, dz, 0.03 * s * unit, 0.3 * s * unit, 0.25, 0.5, 0, [0.92, 0.96, 1], 0.3, 0.12, 0);
      return vfx;
    },

    splat(pos, normal, opt) {
      opt = opt || {};
      const s = opt.size || 1, x = pos.x, y = pos.y, z = pos.z;
      const nx = normal ? normal.x : 0, ny = normal ? normal.y : 1, nz = normal ? normal.z : 0;
      const c = [0, 0, 0]; if (!toSRGB(opt.color, c)) { const p = pick(FEST); c[0] = p[0]; c[1] = p[1]; c[2] = p[2]; }
      reset(); O.sm = s; O.vm = s; setDir(nx, ny, nz); O.cone = 0.05; setColA(c); O.tint = 0.4;
      emit(R_DROP, cnt(30, 10), x + nx * 0.05 * unit, y + ny * 0.05 * unit, z + nz * 0.05 * unit);
      reset(); O.sm = s * 0.7; O.vm = s * 0.6; setDir(nx, ny, nz); O.cone = 0.1; setColA(c);
      emit(R_POWDER, cnt(6, 3), x, y, z);
      decal(x + nx * 0.01 * unit, y + ny * 0.01 * unit, z + nz * 0.01 * unit, nx, ny, nz, 0.55 * s * unit, 0, c, 1, opt.life || 12);
      return vfx;
    },

    confetti(pos, opt) {
      opt = opt || {};
      const s = opt.size || 1;
      const pal = opt.colors ? opt.colors.map(hexS) : FEST;
      confettiN(cnt(opt.count || 220, 50), pos.x, pos.y, pos.z, 0, 1, 0, 0.5, 7 * s, 14 * s, s, pal, 0.05);
      reset(); O.sm = s; O.vm = s; setCol('#f4f1ea'); O.am = 0.35; emit(R_PUFF, cnt(4, 2), pos.x, pos.y, pos.z);
      return vfx;
    },

    fireworks(pos, opt) {
      opt = opt || {};
      const s = opt.size || 1, n = Math.max(1, opt.count || 1);
      for (let k = 0; k < n; k++) {
        const e = takeEm(T_SHELL); if (!e) break;
        e.size = s; e.burst = opt.burst || 'mixed';
        e.hasCol = toSRGB(opt.color, e.col); e.hasCol2 = toSRGB(opt.color2, e.col2);
        const jx = n > 1 ? rnd(-6, 6) * s * unit : 0, jz = n > 1 ? rnd(-3, 3) * s * unit : 0, jy = n > 1 ? rnd(-2, 3) * s * unit : 0;
        e.tx = pos.x + jx; e.tz = pos.z + jz;
        const gy = gAt(pos.x, pos.z);
        e.ty = pos.y + jy; if (e.ty - gy < 4 * unit) e.ty = gy + 14 * s * unit;
        e.x = e.tx + rnd(-1, 1) * unit; e.z = e.tz + rnd(-1, 1) * unit; e.y = gy;
        e.dur = opt.launch === false ? 0 : 0.9 + 0.25 * Math.sqrt(s) + Math.random() * 0.2;
        e.t = -((opt.delay || 0) + k * rnd(0.25, 0.5));
        e.acc2 = Math.random() * 10;
      }
      return vfx;
    },

    goalBurst(pos, opt) {
      opt = opt || {};
      const s = opt.size || 1, x = pos.x, y = pos.y, z = pos.z, gy = gAt(x, z);
      const ca = [0, 0, 0], cb = [0, 0, 0];
      if (!toSRGB(opt.color, ca)) { ca[0] = 1; ca[1] = 0.8; ca[2] = 0.2; }
      if (!toSRGB(opt.color2, cb)) { cb[0] = 1; cb[1] = 1; cb[2] = 1; }
      const pal = [ca, cb, ca, GOLD];
      ori(RG, x, gy + 0.05 * unit, z, 0, 1, 0, 0.5 * s * unit, 7 * s * unit, 0.1, 0.22, 1, ca, 0.75, 0.8, 0);
      ori(RG, x, gy + 0.05 * unit, z, 0, 1, 0, 0.3 * s * unit, 7 * s * unit, 0.12, 0.25, 0, [1, 0.95, 0.85], 0.6, 0.6, 0.08);
      reset(); O.sm = s * 2.2; setColA(ca); O.am = reduced ? 0.4 : 0.9; emit(R_GLOW, 1, x, y + 1 * unit, z);
      reset(); O.sm = s; O.vm = s * 1.8; setColA(ca); emit(R_SPARKLE, cnt(40, 12), x, y + 0.8 * unit, z);
      for (let k = 0; k < 4; k++) {
        const e = takeEm(T_CANNON); if (!e) break;
        const sx = (k & 1 ? 1 : -1), sz = (k & 2 ? 1 : -1);
        e.x = x + sx * 6 * s * unit; e.y = gy + 0.5 * unit; e.z = z + sz * 3 * s * unit;
        e.dx = -sx * 0.35; e.dy = 1; e.dz = -sz * 0.2; const l = Math.hypot(e.dx, e.dy, e.dz); e.dx /= l; e.dy /= l; e.dz /= l;
        e.dur = 0.35; e.size = s; e.palette = pal; e.t = -k * 0.06;
      }
      for (let k = 0; k < 2; k++) vfx.pyro({ x: x + (k ? 1 : -1) * 9 * s * unit, y: gy, z: z - 2 * s * unit }, { size: s, duration: 0.9, color: k ? opt.color2 : opt.color });
      vfx.fireworks({ x, y: gy + 11 * s * unit, z: z - 8 * s * unit }, { count: 2, size: s, color: opt.color, burst: 'peony', delay: 0.15 });
      flashLight(x, y + 2 * unit, z, ca, 30 * s * s, 22 * s, 0.8);
      vfx.shake(0.35);
      return vfx;
    },

    winBurst(pos, opt) {
      opt = opt || {};
      const s = opt.size || 1, x = pos.x, y = pos.y, z = pos.z, gy = gAt(x, z);
      const pal = opt.colors ? opt.colors.map(hexS).concat([GOLD]) : FEST;
      for (let k = 0; k < 2; k++) {
        const e = takeEm(T_CANNON); if (!e) break;
        const sx = k ? 1 : -1;
        e.x = x + sx * 4.5 * s * unit; e.y = gy + 0.4 * unit; e.z = z;
        e.dx = -sx * 0.32; e.dy = 1; e.dz = 0.12; const l = Math.hypot(e.dx, e.dy, e.dz); e.dx /= l; e.dy /= l; e.dz /= l;
        e.dur = 0.6; e.size = s; e.palette = pal; e.t = -k * 0.05;
      }
      for (let k = 0; k < 4; k++) vfx.pyro({ x: x + (k - 1.5) * 4 * s * unit, y: gy, z: z - 3 * s * unit }, { size: s * 0.9, duration: 1.0, delay: 0.1 + (k % 2) * 0.12 });
      vfx.fireworks({ x, y: gy + 12 * s * unit, z: z - 10 * s * unit }, { count: 3, size: s * 1.1, delay: 0.25 });
      reset(); O.sm = s; O.vm = s; emit(R_GLITTER, cnt(110, 40), x, y + 1.5 * unit, z);
      reset(); O.sm = s; O.vm = s; setColA(GOLD); setCol1('#ffffff'); emit(R_SPARKLE, cnt(60, 24), x, y + 1 * unit, z);
      ori(RG, x, gy + 0.05 * unit, z, 0, 1, 0, 0.5 * s * unit, 9 * s * unit, 0.1, 0.25, 1, GOLD, 0.85, 0.9, 0);
      reset(); O.sm = s * 2.5; setColA(GOLD); O.am = reduced ? 0.4 : 0.8; emit(R_GLOW, 1, x, y + 1 * unit, z);
      flashLight(x, y + 2 * unit, z, [1, 0.85, 0.5], 30 * s * s, 22 * s, 1.0);
      vfx.shake(0.3);
      return vfx;
    },

    burst(pos, opt) {
      opt = opt || {};
      const s = opt.size || 1, c = [0, 0, 0]; if (!toSRGB(opt.color, c)) { c[0] = 1; c[1] = 0.85; c[2] = 0.35; }
      reset(); O.sm = s * 1.4; setColA(c); O.am = reduced ? 0.5 : 1; emit(R_GLOW, 1, pos.x, pos.y, pos.z);
      reset(); O.sm = s; O.vm = s * 1.6; setColA(c); emit(R_SPARKLE, cnt(30, 10), pos.x, pos.y, pos.z);
      reset(); O.sm = Math.sqrt(s); O.vm = Math.sqrt(s) * 0.7; setColA(c); setCol1('#ffffff'); O.lm = 0.7; O.am = 1.3; emit(R_SPARK, cnt(40, 16), pos.x, pos.y, pos.z);
      if (!reduced) { reset(); O.sm = s * 0.45; setColA(c); O.am = 0.8; emit(R_FLASH, 1, pos.x, pos.y, pos.z); }
      if (cam) { _v3.copy(_cam).sub(_v4.set(pos.x, pos.y, pos.z)).normalize(); ori(RG, pos.x, pos.y, pos.z, _v3.x, _v3.y, _v3.z, 0.1 * s * unit, 2.2 * s * unit, 0.1, 0.3, 1, c, 0.9, 0.4, 0); }
      flashLight(pos.x, pos.y, pos.z, c, 12 * s * s, 10 * s, 0.4);
      return vfx;
    },

    ring(pos, color, opt) {
      opt = opt || {};
      const s = opt.size || 1, c = [0, 0, 0]; if (!toSRGB(color, c)) { c[0] = 0.5; c[1] = 0.9; c[2] = 1; }
      const n = opt.normal || null;
      const nx = n ? n.x : 0, ny = n ? n.y : 1, nz = n ? n.z : 0;
      const mode = opt.kind === 'shock' ? 0 : opt.kind === 'ripple' ? 2 : 1;
      ori(RG, pos.x, pos.y, pos.z, nx, ny, nz, 0.15 * s * unit, 1.8 * s * unit, 0.12, 0.22, mode, c, 1, 0.5, 0);
      if (mode === 1) {
        ori(RG, pos.x, pos.y, pos.z, nx, ny, nz, 0.1 * s * unit, 1.2 * s * unit, 0.1, 0.18, 1, c, 0.7, 0.45, 0.08);
        reset(); O.sm = s * 1.1; setColA(c); O.am = reduced ? 0.4 : 0.9; emit(R_GLOW, 1, pos.x, pos.y, pos.z);
        reset(); O.sm = s; O.vm = s; setColA(c); setDir(nx, ny, nz); O.cone = -1; emit(R_SPARKLE, cnt(16, 6), pos.x, pos.y, pos.z);
      }
      return vfx;
    },

    dust(pos, opt) {
      opt = opt || {};
      const s = opt.size || 1;
      reset(); O.sm = s; O.vm = s; O.flat = 0.45; if (opt.color) setCol(opt.color);
      if (opt.vel) { O.ivx = opt.vel.x * 0.4; O.ivy = opt.vel.y * 0.2; O.ivz = opt.vel.z * 0.4; }
      emit(R_PUFF, cnt(opt.count || 9, 3), pos.x, pos.y, pos.z);
      return vfx;
    },

    splash(pos, opt) {
      opt = opt || {};
      const s = opt.size || 1, x = pos.x, y = pos.y, z = pos.z;
      reset(); O.sm = s * 1.3; O.vm = s; setDir(0, 1, 0); O.cone = 0.45; emit(R_DROP, cnt(64, 16), x, y, z);
      reset(); O.sm = s * 1.5; O.vm = s * 1.5; setDir(0, 1, 0); O.cone = 0.985; O.lm = 1.2; emit(R_DROP, cnt(10, 4), x, y, z);
      reset(); O.sm = s * 1.3; O.vm = s; setDir(0, 1, 0); O.cone = 0.3; emit(R_MIST, cnt(14, 4), x, y, z);
      ori(RG, x, y + 0.02 * unit, z, 0, 1, 0, 0.2 * s * unit, 2.6 * s * unit, 0.08, 0.14, 2, [0.85, 0.92, 1], 0.6, 1.2, 0);
      ori(RG, x, y + 0.02 * unit, z, 0, 1, 0, 0.1 * s * unit, 1.7 * s * unit, 0.08, 0.14, 2, [0.85, 0.92, 1], 0.45, 1.3, 0.3);
      return vfx;
    },

    smokePlume(pos, opt) {
      opt = opt || {};
      const e = takeEm(T_PLUME); if (!e) return DUMMY;
      e.x = pos.x; e.y = pos.y; e.z = pos.z; e.size = opt.size || 1; e.dur = opt.duration == null ? 4 : opt.duration; e.fire = !!opt.fire;
      e.hasCol = toSRGB(opt.color, e.col); e.t = -(opt.delay || 0);
      return e;
    },

    pyro(pos, opt) {
      opt = opt || {};
      const e = takeEm(T_PYRO); if (!e) return DUMMY;
      e.x = pos.x; e.y = pos.y; e.z = pos.z; e.size = opt.size || 1; e.dur = opt.duration == null ? 0.9 : opt.duration;
      e.hasCol = toSRGB(opt.color, e.col); e.t = -(opt.delay || 0);
      return e;
    },

    nitro(object, opt) {
      opt = opt || {};
      const e = takeEm(T_NITRO); if (!e) return DUMMY;
      e.obj = object; const of = opt.offset || [0, 0, 0], d = opt.dir || [0, 0, -1];
      e.ox = of[0] != null ? of[0] : of.x; e.oy = of[1] != null ? of[1] : of.y; e.oz = of[2] != null ? of[2] : of.z;
      e.dx = d[0] != null ? d[0] : d.x; e.dy = d[1] != null ? d[1] : d.y; e.dz = d[2] != null ? d[2] : d.z;
      e.size = opt.size || 1; e.hasCol = toSRGB(opt.color, e.col); e.dur = 0;
      return e;
    },

    trail(target, opt) {
      opt = opt || {};
      let tr = null;
      for (const t of trails) if (!t.on) { tr = t; break; }
      if (!tr) return DUMMY;
      tr.on = true; tr.active = true; tr.target = target; tr.n = 0;
      const of = opt.offset; tr.hasOff = !!of;
      if (of) { tr.ox = of[0] != null ? of[0] : of.x; tr.oy = of[1] != null ? of[1] : of.y; tr.oz = of[2] != null ? of[2] : of.z; }
      tr.width = (opt.width || 0.25) * unit * 0.5; tr.life = opt.life || 0.45; tr.alpha = opt.alpha == null ? 1 : opt.alpha;
      tr.minD = tr.width * 0.6;
      const c = [1, 1, 1]; toSRGB(opt.color || '#ffd27a', c); tr.mat.uniforms.uColor.value.set(c[0], c[1], c[2]);
      tr.mat.uniforms.uCore.value = opt.core == null ? 0.8 : opt.core;
      tr.mat.uniforms.uFade.value = opt.fade == null ? 1.3 : opt.fade;
      return tr;
    },

    speedLines(camera2, amount) {
      if (camera2 && camera2 !== cam && camera2.isCamera) cam = camera2;
      scr.speedT = clamp(amount == null ? 1 : amount, 0, 1);
      return vfx;
    },

    godRays(lightPos, opt) {
      opt = opt || {};
      scr.mat.uniforms.uLight.value.set(lightPos.x, lightPos.y, lightPos.z);
      const c = [1, 0.95, 0.85]; if (toSRGB(opt.color, c)) scr.mat.uniforms.uLightCol.value.set(c[0], c[1], c[2]);
      scr.raysT = opt.strength == null ? 0.5 : opt.strength;
      if (reduced) scr.raysT *= 0.6;
      return raysH;
    },
    lensFlare(lightPos, opt) {
      opt = opt || {};
      scr.mat.uniforms.uLight.value.set(lightPos.x, lightPos.y, lightPos.z);
      const c = [1, 0.95, 0.85]; if (toSRGB(opt.color, c)) scr.mat.uniforms.uLightCol.value.set(c[0], c[1], c[2]);
      scr.flareT = opt.strength == null ? 0.6 : opt.strength;
      return flareH;
    },

    lightning(a, b, opt) {
      opt = opt || {};
      let B = null;
      for (const bb of bolts) if (!bb.on) { B = bb; break; }
      if (!B) B = bolts[0];
      const s = opt.size || 1;
      B.on = true; B.t = 0; B.dur = opt.duration || 0.45; B.re = 0;
      B.ax = a.x; B.ay = a.y; B.az = a.z; B.bx = b.x; B.by = b.y; B.bz = b.z;
      B.w = 0.22 * s * unit; B.branches = opt.branches == null ? 2 : clamp(opt.branches, 0, 2); B.a = reduced ? 0.7 : 1;
      const c = [0.62, 0.75, 1]; toSRGB(opt.color, c); B.mat.uniforms.uColor.value.set(c[0], c[1], c[2]);
      boltBuild(B);
      reset(); O.sm = s * 0.9; setColA(c); O.lm = 2; emit(R_GLOW, 1, a.x, a.y, a.z);
      reset(); O.sm = s * 1.2; setColA(c); O.lm = 2.5; emit(R_GLOW, 1, b.x, b.y, b.z);
      reset(); O.sm = Math.sqrt(s); O.vm = Math.sqrt(s) * 0.45; setColA(c); setCol1('#ffffff'); O.lm = 0.6; emit(R_SPARK, cnt(16, 5), b.x, b.y, b.z);
      flashLight((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, c, 25 * s, 20 * s, B.dur);
      return vfx;
    },

    shatter(mesh, opt) {
      opt = opt || {};
      if (!mesh) return vfx;
      mesh.updateWorldMatrix(true, true);
      const box = _box.setFromObject(mesh);
      if (box.isEmpty()) return vfx;
      box.getSize(_v1); box.getCenter(_v2);
      const n = cnt(opt.pieces || 18, 6);
      const k = Math.cbrt(n);
      const m = mesh.material && (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material);
      if (opt.color != null) _c3.set(opt.color); else if (m && m.color) _c3.copy(m.color); else _c3.setRGB(0.6, 0.6, 0.6);
      const ox = opt.origin ? opt.origin.x : _v2.x, oy = opt.origin ? opt.origin.y : _v2.y - _v1.y * 0.3, oz = opt.origin ? opt.origin.z : _v2.z;
      const f = (opt.force || 1) * unit;
      const glass = opt.kind === 'glass';
      const S = glass ? SH : (opt.chunky ? CH : SH);
      for (let i = 0; i < n; i++) {
        const px = box.min.x + Math.random() * _v1.x, py = box.min.y + Math.random() * _v1.y, pz = box.min.z + Math.random() * _v1.z;
        let dx = px - ox, dy = py - oy, dz = pz - oz; const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
        const sp = rnd(2.5, 6) * f;
        const v = 0.85 + Math.random() * 0.3;
        const mn = 0.07 * unit * (opt.size || 1);
        solid(S, px, py, pz, dx * sp, dy * sp + rnd(1.5, 4) * f, dz * sp, Math.max(mn, _v1.x / k) * rnd(0.7, 1.3), Math.max(mn, _v1.y / k) * rnd(0.7, 1.3), Math.max(mn, _v1.z / k) * rnd(0.7, 1.3),
          rnd(2.5, 4), 0.35, 0, _lin.setRGB(_c3.r * v, _c3.g * v, _c3.b * v));
      }
      const dsz = Math.max(0.5, (_v1.x + _v1.y + _v1.z) / 3 / unit);
      reset(); O.sm = dsz; O.vm = dsz * 0.6; O.flat = 0.5; setCol(opt.dustColor || '#a8987f'); emit(R_PUFF, cnt(8, 3), _v2.x, _v2.y, _v2.z);
      reset(); O.sm = dsz * 0.6; O.vm = dsz; emit(R_GLINT, cnt(10, 3), _v2.x, _v2.y, _v2.z);
      if (opt.hide !== false) mesh.visible = false;
      return vfx;
    },

    // move every live effect by (dx, dy, dz): for a world that scrolls under a fixed camera
    translate(dx, dy, dz) {
      dx = +dx || 0; dy = +dy || 0; dz = +dz || 0;
      if (!dx && !dy && !dz) return vfx;
      for (const P of [AD, AL]) for (let i = 0; i < P.hi; i++) if (P.on[i]) { P.x[i] += dx; P.y[i] += dy; P.z[i] += dz; }
      for (let i = 0; i < conf.hi; i++) if (conf.on[i]) { conf.x[i] += dx; conf.y[i] += dy; conf.z[i] += dz; }
      for (const S of [CH, SH, RG, DC]) for (let i = 0; i < S.hi; i++) if (S.on[i]) { S.x[i] += dx; S.y[i] += dy; S.z[i] += dz; }
      for (const t of trails) if (t.on) for (let i = 0; i < t.n; i++) { t.pts[i * 3] += dx; t.pts[i * 3 + 1] += dy; t.pts[i * 3 + 2] += dz; }
      for (const B of bolts) if (B.on) {
        B.ax += dx; B.ay += dy; B.az += dz; B.bx += dx; B.by += dy; B.bz += dz;
        for (let i = 0; i < B.pts.length; i += 3) { B.pts[i] += dx; B.pts[i + 1] += dy; B.pts[i + 2] += dz; }
      }
      for (const e of em) if (e.on && e.type !== T_NITRO) { e.x += dx; e.y += dy; e.z += dz; e.tx += dx; e.ty += dy; e.tz += dz; }
      for (const l of lights) l.L.position.x += dx, l.L.position.y += dy, l.L.position.z += dz;
      return vfx;
    },
    // the same as translate, given as an absolute offset: each call moves effects by the change since the last one
    setWorldOffset(v) {
      const x = v ? v.x : 0, y = v ? v.y : 0, z = v ? v.z : 0;
      vfx.translate(x - WO.x, y - WO.y, z - WO.z); WO.set(x, y, z);
      return vfx;
    },

    clear() {
      for (const P of [AD, AL]) { for (let i = 0; i < P.N; i++) P.on[i] = 0; P.top = P.N; for (let i = 0; i < P.N; i++) P.free[i] = P.N - 1 - i; P.hi = 0; P.g.instanceCount = 0; P.mesh.visible = false; }
      for (const S of [CH, SH]) { for (let i = 0; i < S.N; i++) S.on[i] = 0; S.top = S.N; for (let i = 0; i < S.N; i++) S.free[i] = S.N - 1 - i; S.hi = 0; S.mesh.count = 0; S.mesh.visible = false; }
      for (const S of [RG, DC]) { for (let i = 0; i < S.N; i++) S.on[i] = 0; S.top = S.N; for (let i = 0; i < S.N; i++) S.free[i] = S.N - 1 - i; S.hi = 0; S.g.instanceCount = 0; S.mesh.visible = false; }
      conf.on.fill(0); conf.top = CN; for (let i = 0; i < CN; i++) conf.free[i] = CN - 1 - i; conf.hi = 0; conf.g.instanceCount = 0; conf.mesh.visible = false;
      for (const t of trails) { t.on = false; t.active = false; t.n = 0; t.mesh.visible = false; }
      for (const b of bolts) { b.on = false; b.mesh.visible = false; }
      for (const e of em) e.on = false;
      for (const l of lights) l.L.intensity = 0;
      scr.speedT = scr.flareT = scr.raysT = 0; scr.speed = scr.flare = scr.rays = 0; scr.mesh.visible = false;
      W.on = false; W.k = 1; shake.trauma = 0;
      return vfx;
    },

    stats() {
      let e = 0; for (const x of em) if (x.on) e++;
      let t = 0; for (const x of trails) if (x.on) t++;
      let b = 0; for (const x of bolts) if (x.on) b++;
      return { add: AD.live, alpha: AL.live, confetti: conf.g.instanceCount, chunks: CH.mesh.count, shards: SH.mesh.count, rings: RG.g.instanceCount, decals: DC.g.instanceCount,
        trails: t, bolts: b, emitters: e, lights: lights.length, tier: tier(), rate: rate() };
    },

    // compile every effect shader now so the first explosion never hitches
    warm() {
      const vis = added.map((m) => m.visible);
      for (const m of added) m.visible = true;
      for (const P of [AD, AL]) P.g.instanceCount = 1;
      conf.g.instanceCount = 1; RG.g.instanceCount = 1; DC.g.instanceCount = 1; CH.mesh.count = 1; SH.mesh.count = 1;
      const restore = () => {
        added.forEach((m, i) => { m.visible = vis[i]; });
        for (const P of [AD, AL]) P.g.instanceCount = P.live || 0;
        conf.g.instanceCount = 0; RG.g.instanceCount = 0; DC.g.instanceCount = 0; CH.mesh.count = 0; SH.mesh.count = 0;
      };
      try {
        // compileAsync only when the browser can compile in parallel (three warns otherwise)
        let par = false;
        try { par = !!(renderer.extensions && renderer.extensions.has && renderer.extensions.has('KHR_parallel_shader_compile')); } catch (e) { par = false; }
        if (par && renderer.compileAsync) {
          const pr = renderer.compileAsync(scene, cam);
          restore();
          return pr.catch(() => {});
        }
        renderer.compile(scene, cam);
      } catch (e) { /* lost context: effects compile on first use */ }
      restore();
      return Promise.resolve();
    },

    dispose() {
      for (const m of added) {
        if (m.parent) m.parent.remove(m);
        if (m.geometry && m.geometry !== plane) m.geometry.dispose();
        if (m.material) m.material.dispose();
        if (m.dispose && m.isLight) m.dispose();
      }
      plane.dispose(); rockGeo.dispose(); shardGeo.dispose();
    },
  };
  const _box = new THREE.Box3();
  const WO = new THREE.Vector3();
  return vfx;
}

export default createVFX;
