/*
 * Shared post-processing and camera cinematics for the 3D arcade games.
 *
 *   import { createFX } from '/games/shared/fx3d.js';
 *   const fx = createFX(renderer, { arc, intro: { dist: 14 }, results: true });
 *   // each frame, instead of renderer.render(scene, camera):
 *   fx.render(scene, camera);
 *   // when the game's quality tier changes (0 lowest .. 3 full):
 *   fx.setQuality(q, pinned);
 *   // on a big moment:
 *   fx.flash(0.5); fx.kick(6); fx.letterbox(1, 1.2);
 *
 * How it works. The scene is rendered to the screen exactly as before (the
 * canvas keeps its own antialiasing, tone mapping and colour space, so a game
 * looks the same with the pass off). Then the finished frame is copied into a
 * texture, the bright parts are thresholded and blurred at a quarter and an
 * eighth of the size (bloom), and one full screen pass writes the frame back
 * with the bloom added, a light colour grade, a vignette, a little film grain,
 * optional letterbox bars and a quick impact flash.
 *
 * Cost and safety. Off at quality 0 and on a software renderer (unless the
 * player pinned Sharper), cheaper at quality 1 and 2. Any failure, or a lost
 * WebGL context, falls back to a plain render and never throws.
 *
 * Camera. An optional establishing move when a round starts (the camera
 * swings in from wider, higher and to one side onto the game's own shot) and
 * a slow drift with letterbox bars behind the results panel. Both are applied
 * just for the draw and the game's camera is restored straight after, so the
 * game's own camera logic and smoothing never see them. Reduced motion turns
 * off the moves, the flash, the FOV kick and the animated grain.
 */
import * as THREE from '/games/vendor/three/three.module.min.js';

const VS = 'varying vec2 vUv;\nvoid main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const PREFILTER = [
  'uniform sampler2D tSrc; uniform vec2 uOff; uniform float uThreshold; uniform float uKnee;',
  'varying vec2 vUv;',
  'vec3 pick(vec2 uv) {',
  '  vec3 c = texture2D(tSrc, uv).rgb;',
  '  float l = max(c.r, max(c.g, c.b));',
  '  float s = clamp(l - uThreshold + uKnee, 0.0, 2.0 * uKnee);',
  '  s = s * s / (4.0 * uKnee + 1e-4);',
  '  float w = max(s, l - uThreshold) / max(l, 1e-4);',
  '  return c * c * w;',
  '}',
  'void main() {',
  '  vec3 c = pick(vUv + vec2(-uOff.x, -uOff.y)) + pick(vUv + vec2(uOff.x, -uOff.y)) + pick(vUv + vec2(-uOff.x, uOff.y)) + pick(vUv + vec2(uOff.x, uOff.y));',
  '  gl_FragColor = vec4(c * 0.25, 1.0);',
  '}',
].join('\n');

const DOWN = [
  'uniform sampler2D tSrc; uniform vec2 uOff;',
  'varying vec2 vUv;',
  'void main() {',
  '  vec3 c = texture2D(tSrc, vUv + vec2(-uOff.x, -uOff.y)).rgb + texture2D(tSrc, vUv + vec2(uOff.x, -uOff.y)).rgb',
  '         + texture2D(tSrc, vUv + vec2(-uOff.x, uOff.y)).rgb + texture2D(tSrc, vUv + vec2(uOff.x, uOff.y)).rgb;',
  '  gl_FragColor = vec4(c * 0.25, 1.0);',
  '}',
].join('\n');

const BLUR = [
  'uniform sampler2D tSrc; uniform vec2 uDir;',
  'varying vec2 vUv;',
  'void main() {',
  '  vec3 c = texture2D(tSrc, vUv).rgb * 0.2270270270;',
  '  c += texture2D(tSrc, vUv + uDir * 1.3846153846).rgb * 0.3162162162;',
  '  c += texture2D(tSrc, vUv - uDir * 1.3846153846).rgb * 0.3162162162;',
  '  c += texture2D(tSrc, vUv + uDir * 3.2307692308).rgb * 0.0702702703;',
  '  c += texture2D(tSrc, vUv - uDir * 3.2307692308).rgb * 0.0702702703;',
  '  gl_FragColor = vec4(c, 1.0);',
  '}',
].join('\n');

const COMPOSITE = [
  'uniform sampler2D tFrame; uniform sampler2D tB1; uniform sampler2D tB2;',
  'uniform float uB1; uniform float uB2; uniform float uVig; uniform float uGrain; uniform float uSeed;',
  'uniform float uSat; uniform float uContrast; uniform vec3 uLift; uniform vec3 uGain;',
  'uniform float uBars; uniform float uFlash; uniform vec3 uFlashCol; uniform vec2 uRes;',
  // opt-in looks (all zero by default, so the default output is unchanged)
  'uniform vec3 uBloomTint; uniform float uSplit; uniform vec3 uShadowTint; uniform vec3 uHighTint; uniform float uCA;',
  'uniform sampler2D tDof; uniform float uDof; uniform vec3 uFocus;',
  'varying vec2 vUv;',
  'float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
  'void main() {',
  '  vec3 c = texture2D(tFrame, vUv).rgb;',
  // lens character: a whisper of lateral colour toward the edges
  '  if (uCA > 0.0) { vec2 dd = (vUv - 0.5) * uCA; c.r = texture2D(tFrame, vUv - dd).r; c.b = texture2D(tFrame, vUv + dd).b; }',
  // depth of field look: the blurred frame away from the point of focus
  '  if (uDof > 0.001) { vec2 fq = (vUv - uFocus.xy) * vec2(uRes.x / uRes.y, 1.0); float fm = smoothstep(uFocus.z, uFocus.z * 2.4 + 0.12, length(fq)); c = mix(c, texture2D(tDof, vUv).rgb, fm * uDof); }',
  '  vec3 lin = c * c + (texture2D(tB1, vUv).rgb * uB1 + texture2D(tB2, vUv).rgb * uB2) * uBloomTint;',
  '  c = sqrt(lin);',
  // soft shoulder so a hot bloom rolls off instead of clipping flat
  '  c = c / (1.0 + max(c - 1.0, 0.0));',
  '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
  '  c = mix(vec3(l), c, uSat);',
  '  c = (c - 0.5) * uContrast + 0.5;',
  '  c = c * uGain + uLift * (1.0 - c);',
  // split toning: cool shadows, warm highlights, the way film and real skies do it
  '  if (uSplit > 0.0) { float lw = smoothstep(0.05, 0.85, l); c += uSplit * mix(uShadowTint - 0.5, uHighTint - 0.5, lw) * (0.35 + 0.65 * (1.0 - abs(lw * 2.0 - 1.0))); }',
  '  vec2 q = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);',
  '  float d = length(q) / length(vec2(uRes.x / uRes.y, 1.0) * 0.5);',
  '  c *= 1.0 - uVig * smoothstep(0.42, 1.05, d);',
  '  float n = hash(vUv * uRes + uSeed) - 0.5;',
  '  c += n * uGrain * (1.15 - l);',
  '  c = mix(c, uFlashCol, uFlash);',
  '  float px = 1.5 / uRes.y;',
  '  float bar = smoothstep(uBars, uBars - px, vUv.y) + smoothstep(1.0 - uBars, 1.0 - uBars + px, vUv.y);',
  '  c = mix(c, vec3(0.0), clamp(bar, 0.0, 1.0) * step(0.0001, uBars));',
  '  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);',
  '}',
].join('\n');

const SOFT_RE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;

function softRenderer(renderer) {
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || '');
    return SOFT_RE.test(name);
  } catch (e) { return false; }
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);

/*
 * Looks. 'natural' is a filmic, believable grade for the realism pass: no
 * candy saturation, a gentle toe and shoulder, cool shadows and warm
 * highlights, a smaller warm-tinted bloom (like real lens halation), a soft
 * vignette, fine grain and, at quality 2 and up, a whisper of lateral colour
 * at the frame edges. Opt in with createFX(renderer, { preset: 'natural' });
 * any o.look keys still override it.
 */
export const LOOKS = {
  natural: { bloom: 0.36, bloomWide: 0.24, threshold: 0.74, knee: 0.26, vignette: 0.26, grain: 0.026, sat: 0.95, contrast: 1.035,
    lift: [0.016, 0.017, 0.022], gain: [1.02, 1.0, 0.975], bloomTint: [1.0, 0.9, 0.8], split: 0.05, shadowTint: [0.44, 0.5, 0.58], highTint: [0.58, 0.52, 0.45], lens: 0.0018 },
  night: { bloom: 0.5, bloomWide: 0.32, threshold: 0.68, knee: 0.26, vignette: 0.3, grain: 0.032, sat: 0.94, contrast: 1.04,
    lift: [0.012, 0.016, 0.026], gain: [1.02, 0.99, 0.96], bloomTint: [1.0, 0.88, 0.74], split: 0.06, shadowTint: [0.42, 0.48, 0.6], highTint: [0.6, 0.52, 0.42], lens: 0.002 },
};
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createFX(renderer, o) {
  o = o || {};
  const arc = o.arc || (typeof window !== 'undefined' ? window.__arcade : null);
  // o.preset 'natural' starts from the filmic natural look (see LOOKS) instead of the punchier arcade default
  const preset = o.preset && LOOKS[o.preset] ? LOOKS[o.preset] : null;
  const look = Object.assign({ bloom: 0.55, bloomWide: 0.35, threshold: 0.66, knee: 0.22, vignette: 0.32, grain: 0.035, sat: 1.06, contrast: 1.05, lift: [0.012, 0.012, 0.022], gain: [1.02, 1.0, 0.975],
    bloomTint: [1, 1, 1], split: 0, shadowTint: [0.44, 0.5, 0.58], highTint: [0.58, 0.52, 0.44], lens: 0 }, preset || {}, o.look || {});
  // lens character (lateral colour) only at quality 2 and up, and only when asked for (o.lens or a preset)
  const lensAmt = o.lens != null ? (o.lens === true ? 0.0022 : +o.lens || 0) : look.lens;
  const soft = o.soft != null ? !!o.soft : softRenderer(renderer);
  let userOn = o.enabled !== false, quality = o.quality == null ? 2 : o.quality, pinned = false;
  let lost = false, failed = false, built = false, W = 0, H = 0;
  let frameTex = null, rtA = null, rtB = null, rtC = null, rtD = null, rtE = null, rtF = null, rtG = null;
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  const qScene = new THREE.Scene(); qScene.add(quad);
  const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = (frag, uniforms) => new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
  const mPre = mat(PREFILTER, { tSrc: { value: null }, uOff: { value: new THREE.Vector2() }, uThreshold: { value: look.threshold }, uKnee: { value: look.knee } });
  const mDown = mat(DOWN, { tSrc: { value: null }, uOff: { value: new THREE.Vector2() } });
  const mBlur = mat(BLUR, { tSrc: { value: null }, uDir: { value: new THREE.Vector2() } });
  const black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1); black.needsUpdate = true;
  const mComp = mat(COMPOSITE, {
    tFrame: { value: null }, tB1: { value: black }, tB2: { value: black }, uB1: { value: 0 }, uB2: { value: 0 },
    uVig: { value: look.vignette }, uGrain: { value: look.grain }, uSeed: { value: 0 },
    uSat: { value: look.sat }, uContrast: { value: look.contrast },
    uLift: { value: new THREE.Vector3().fromArray(look.lift) }, uGain: { value: new THREE.Vector3().fromArray(look.gain) },
    uBars: { value: 0 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uRes: { value: new THREE.Vector2(1, 1) },
    uBloomTint: { value: new THREE.Vector3().fromArray(look.bloomTint) }, uSplit: { value: look.split },
    uShadowTint: { value: new THREE.Vector3().fromArray(look.shadowTint) }, uHighTint: { value: new THREE.Vector3().fromArray(look.highTint) },
    uCA: { value: 0 }, tDof: { value: black }, uDof: { value: 0 }, uFocus: { value: new THREE.Vector3(0.5, 0.5, 0.18) },
  });

  const canvas = renderer.domElement;
  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('webglcontextlost', () => { lost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => { lost = false; built = false; }, false);
  }

  const rtOpts = { depthBuffer: false, stencilBuffer: false, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
  const disposeTargets = () => {
    [frameTex, rtA, rtB, rtC, rtD, rtE, rtF, rtG].forEach((t) => { if (t) { try { t.dispose(); } catch (e) { /* lost */ } } });
    frameTex = rtA = rtB = rtC = rtD = rtE = rtF = rtG = null; built = false;
  };
  const build = (w, h) => {
    disposeTargets();
    W = w; H = h;
    frameTex = new THREE.FramebufferTexture(w, h);
    frameTex.minFilter = THREE.LinearFilter; frameTex.magFilter = THREE.LinearFilter; frameTex.generateMipmaps = false;
    const q4w = Math.max(1, Math.round(w / 4)), q4h = Math.max(1, Math.round(h / 4));
    const q8w = Math.max(1, Math.round(w / 8)), q8h = Math.max(1, Math.round(h / 8));
    rtA = new THREE.WebGLRenderTarget(q4w, q4h, rtOpts); // quarter: bright pass
    rtB = new THREE.WebGLRenderTarget(q4w, q4h, rtOpts); // quarter: blur ping
    rtC = new THREE.WebGLRenderTarget(q8w, q8h, rtOpts); // eighth: wide glow
    rtD = new THREE.WebGLRenderTarget(q8w, q8h, rtOpts); // eighth: blur ping
    rtE = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)), rtOpts); // half: sharp first step at full quality
    built = true;
  };
  const pass = (material, target) => {
    quad.material = material;
    renderer.setRenderTarget(target);
    renderer.render(qScene, qCam);
  };

  // State the camera and frame effects run on.
  const st = { last: 0, flash: 0, flashCol: new THREE.Color(1, 1, 1), kick: 0, bars: 0, barsTarget: 0, barsHold: 0, intro: 0, introDur: 0, introOn: false, orbit: 0, prevState: '', prevTime: 0, seed: 0, grainT: 0, postCalls: 0,
    hand: 0, handOn: false, handT: 0, dof: 0, dofTarget: 0, dofAuto: 0, focusX: 0.5, focusY: 0.5, focusR: 0.18 };
  // Handheld drift: a slow, small, organic sway on menus, results and replays only (o.handheld or fx.handheld(on)).
  const handCfg = o.handheld ? Object.assign({ amount: 1, menu: true, results: true }, o.handheld === true ? {} : o.handheld) : null;
  // Depth of field look behind the results panel (o.dof), or on demand with fx.focus().
  const dofCfg = o.dof ? Object.assign({ results: 0.75, radius: 0.2 }, o.dof === true ? {} : o.dof) : null;
  // dist: how far ahead of the camera the subject is (or o.target(v) writes it).
  // back / up / rise default to a share of that distance, so one setting suits any world scale.
  const introCfg = o.intro === false || o.intro == null ? null : Object.assign({ dist: 12, back: 0.75, up: 0.45, yaw: 0.6, dur: 1.9 }, o.intro === true ? {} : o.intro);
  const resultsCfg = o.results === false || o.results == null ? null : Object.assign({ dist: 12, yaw: 0.26, rise: 0.12, speed: 0.22 }, o.results === true ? {} : o.results);
  const target = typeof o.target === 'function' ? o.target : null;
  const menuBars = o.menuBars !== false;

  const v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), fwd = new THREE.Vector3(), tgt = new THREE.Vector3();
  const savedPos = new THREE.Vector3(), savedQuat = new THREE.Quaternion(), UP = new THREE.Vector3(0, 1, 0);
  const qYaw = new THREE.Quaternion(), qBase = new THREE.Quaternion(), qLook = new THREE.Quaternion();
  const size = new THREE.Vector2();
  const prevClear = new THREE.Color(); // reused by plainBars every frame the bars show

  const reduced = () => !!(arc && arc.reducedMotion);
  const portrait = () => { renderer.getSize(size); return size.y > size.x * 1.1; };

  // Move the camera for this draw only: swing onto the shot from wide and high,
  // or drift slowly behind the results panel. Returns true when it moved.
  const cineBegin = (camera) => {
    if (!camera || !camera.isPerspectiveCamera || camera.parent && camera.parent.type !== 'Scene') return false;
    const introK = st.introOn && introCfg ? 1 - easeOut(Math.min(1, st.intro / st.introDur)) : 0;
    const orbitK = resultsCfg && arc && arc.state === 'over' ? Math.min(1, st.orbit / 1.6) : 0;
    const kick = st.kick, hand = st.hand;
    if (!(introK > 0.0005 || orbitK > 0 || Math.abs(kick) > 0.01 || hand > 0.0005)) return false;
    savedPos.copy(camera.position); savedQuat.copy(camera.quaternion);
    camera.userData.__fxFov = camera.fov;
    if (introK > 0.0005 || orbitK > 0) {
      camera.getWorldDirection(fwd);
      const cfg = introK > 0.0005 ? introCfg : resultsCfg;
      let got = false;
      if (target) { try { got = !!target(tgt); } catch (e) { got = false; } }
      if (!got) tgt.copy(camera.position).addScaledVector(fwd, cfg.dist);
      v1.copy(camera.position).sub(tgt);
      const D = Math.max(0.01, v1.length());
      let yaw, back, up;
      if (introK > 0.0005) { yaw = introCfg.yaw * introK; back = introCfg.back * D * introK; up = introCfg.up * D * introK; }
      else { const tt = st.orbit * resultsCfg.speed; yaw = Math.sin(tt) * resultsCfg.yaw * orbitK; back = 0; up = resultsCfg.rise * D * orbitK * (0.5 + 0.5 * Math.sin(tt * 0.7)); }
      v1.applyAxisAngle(UP, yaw);
      v2.copy(v1).setY(0); if (v2.lengthSq() > 1e-6) v2.normalize();
      camera.position.copy(tgt).add(v1).addScaledVector(v2, back).addScaledVector(UP, up);
      // The game's own framing turned with the swing, blended toward looking straight at the subject
      // while the move is wide, so the shot lands exactly on the game's camera with no snap.
      qYaw.setFromAxisAngle(UP, yaw); qBase.copy(qYaw).multiply(savedQuat);
      camera.lookAt(tgt); qLook.copy(camera.quaternion);
      const w = introK > 0.0005 ? easeInOut(Math.min(1, introK * 1.25)) : Math.min(1, (up / D) * 3);
      camera.quaternion.copy(qBase).slerp(qLook, w);
    }
    if (hand > 0.0005) {
      // sums of slow sines at unrelated rates: never repeats visibly, never jerks
      const t = st.handT, a = hand * (handCfg ? handCfg.amount : 1);
      const yawH = (Math.sin(t * 0.61) * 0.6 + Math.sin(t * 1.37 + 1.3) * 0.3 + Math.sin(t * 2.9 + 0.4) * 0.1) * 0.0045 * a;
      const pitH = (Math.sin(t * 0.83 + 2.1) * 0.6 + Math.sin(t * 1.71 + 0.2) * 0.3 + Math.sin(t * 3.3 + 2.6) * 0.1) * 0.0035 * a;
      const rolH = (Math.sin(t * 0.47 + 0.7) * 0.7 + Math.sin(t * 1.13 + 2.4) * 0.3) * 0.0028 * a;
      _he.set(pitH, yawH, rolH, 'YXZ'); _hq.setFromEuler(_he);
      camera.quaternion.multiply(_hq);
    }
    if (Math.abs(kick) > 0.01) { camera.fov = camera.userData.__fxFov + kick; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    return true;
  };
  const _he = new THREE.Euler(), _hq = new THREE.Quaternion();
  const cineEnd = (camera) => {
    camera.position.copy(savedPos); camera.quaternion.copy(savedQuat);
    if (camera.userData.__fxFov != null && camera.fov !== camera.userData.__fxFov) { camera.fov = camera.userData.__fxFov; camera.updateProjectionMatrix(); }
    camera.userData.__fxFov = null;
    camera.updateMatrixWorld();
  };

  const tickState = () => {
    const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    const dt = st.last ? Math.min(0.1, now - st.last) : 1 / 60;
    st.last = now;
    const state = arc ? arc.state : 'play';
    const time = arc ? arc.time : 0;
    // A new round: Play from the menu, Play again from results, Restart from pause.
    const fresh = state === 'play' && (st.prevState === 'menu' || st.prevState === 'over' || (st.prevState === 'play' || st.prevState === 'pause') && time + 1e-4 < st.prevTime - 0.05);
    st.fresh = fresh;
    if (fresh && introCfg && !reduced()) { st.introOn = true; st.intro = 0; st.introDur = introCfg.dur; st.barsHold = introCfg.dur * 0.7; }
    if (state === 'play' && st.introOn) { st.intro += dt; if (st.intro >= st.introDur) st.introOn = false; }
    if (state !== 'play' && state !== 'pause') st.introOn = false;
    if (state === 'over') st.orbit += dt; else st.orbit = 0;
    st.prevState = state; st.prevTime = time;
    // Letterbox: during the establishing move, behind the menu and the results.
    let want = st.barsTarget;
    if (st.barsHold > 0) { st.barsHold -= dt; want = Math.max(want, 1); }
    if (menuBars && (state === 'menu' || state === 'over')) want = Math.max(want, 0.8);
    st.bars += (want - st.bars) * Math.min(1, dt * (want > st.bars ? 5 : 3.2));
    if (st.bars < 0.002) st.bars = 0;
    st.flash *= Math.exp(-dt * 9); if (st.flash < 0.004) st.flash = 0;
    st.kick *= Math.exp(-dt * 7); if (Math.abs(st.kick) < 0.01) st.kick = 0;
    // handheld drift eases in and out; never under reduced motion
    const handWant = handCfg && !reduced() && (st.handOn || (handCfg.menu && state === 'menu') || (handCfg.results && state === 'over')) ? 1 : 0;
    st.hand += (handWant - st.hand) * Math.min(1, dt * 1.2); if (st.hand < 0.0004) st.hand = 0;
    st.handT += dt;
    st.dofAuto = dofCfg && state === 'over' ? dofCfg.results : 0;
    const dofWant = Math.max(st.dofTarget, st.dofAuto);
    st.dof += (dofWant - st.dof) * Math.min(1, dt * 2.5); if (st.dof < 0.002) st.dof = 0;
    if (reduced()) { st.flash = 0; st.kick = 0; st.introOn = false; }
    // Grain steps at 24 frames a second, like film, and holds still under reduced motion.
    st.grainT += dt; if (st.grainT > 1 / 24 && !reduced()) { st.grainT = 0; st.seed = (st.seed + 17.31) % 1000; }
    return dt;
  };

  const active = () => userOn && !failed && !lost && quality >= 1 && (!soft || pinned);

  // Shader warm-up. three.js builds a material's program the first time it
  // draws it and waits for the link right there, one program after another,
  // so the first frame a new car, effect or the post pass itself appears is a
  // hitch. renderer.compile() hands every program a scene needs to the driver
  // at once, hidden objects included, without drawing; by the time they first
  // draw they are ready or nearly so. Once per scene, and again when a round
  // starts, because a game's start() adds that round's own objects. Any
  // failure leaves the game drawing exactly as it did before.
  const warmed = new WeakSet();
  const warm = (scene, camera, first) => {
    try { renderer.compile(scene, camera); } catch (e) { /* lost context: the draw below compiles as before */ }
    if (!first || (soft && !pinned)) return;
    try { for (const m of [mPre, mDown, mBlur, mComp]) { quad.material = m; renderer.compile(qScene, qCam); } } catch (e) { /* post pass compiles on first use */ }
  };

  // Bars without the post pass: clear two strips with a scissor.
  const plainBars = (amount) => {
    if (amount <= 0.002) return;
    try {
      const gl = renderer.getContext();
      const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
      const bh = Math.round(h * amount * (portrait() ? 0.045 : 0.07));
      if (bh < 1) return;
      const prev = prevClear; renderer.getClearColor(prev); const pa = renderer.getClearAlpha();
      renderer.setRenderTarget(null);
      renderer.setScissorTest(true); renderer.setClearColor(0x000000, 1);
      const pr = renderer.getPixelRatio();
      renderer.setScissor(0, 0, w / pr, bh / pr); renderer.clear(true, false, false);
      renderer.setScissor(0, (h - bh) / pr, w / pr, bh / pr); renderer.clear(true, false, false);
      renderer.setScissorTest(false); renderer.setClearColor(prev, pa);
    } catch (e) { /* lost context */ }
  };

  const fx = {
    get enabled() { return active(); },
    get soft() { return soft; },
    setEnabled(on) { userOn = !!on; },
    // q: the game's tier, 0 lowest .. 3 full detail. pinned: the player chose it.
    setQuality(q, isPinned) { quality = Math.max(0, Math.min(3, q | 0)); if (isPinned != null) pinned = !!isPinned; },
    resize() { /* sizes follow the drawing buffer on every frame */ },
    flash(amount, color) { if (reduced()) return; st.flash = Math.max(st.flash, Math.min(1, amount == null ? 0.6 : amount)); if (color) st.flashCol.set(color); else st.flashCol.setRGB(1, 1, 1); },
    kick(deg) { if (reduced()) return; st.kick = deg == null ? 5 : deg; },
    letterbox(amount, seconds) { if (seconds) { st.barsHold = Math.max(st.barsHold, seconds); } else st.barsTarget = Math.max(0, Math.min(1, amount || 0)); },
    intro(dur) { if (!introCfg || reduced()) return; st.introOn = true; st.intro = 0; st.introDur = dur || introCfg.dur; st.barsHold = st.introDur * 0.7; },
    get introActive() { return st.introOn; },
    // Handheld drift for replays and cutaways (menus and results get it automatically with o.handheld).
    handheld(on) { st.handOn = !!on; },
    // Depth of field look: amount 0..1 (0 turns it off), focus point in screen 0..1 (y up), radius as a share of the height.
    focus(amount, x, y, radius) { st.dofTarget = reduced() ? 0 : clamp01(amount || 0); if (x != null) st.focusX = x; if (y != null) st.focusY = y; if (radius != null) st.focusR = radius; },
    // Change the grade at run time: any of the look keys (sat, contrast, lift, gain, split, bloom, ...).
    setLook(l) {
      if (!l) return;
      Object.assign(look, l);
      const u = mComp.uniforms;
      u.uVig.value = look.vignette; u.uSat.value = look.sat; u.uContrast.value = look.contrast;
      u.uLift.value.fromArray(look.lift); u.uGain.value.fromArray(look.gain); u.uSplit.value = look.split;
      u.uBloomTint.value.fromArray(look.bloomTint); u.uShadowTint.value.fromArray(look.shadowTint); u.uHighTint.value.fromArray(look.highTint);
      mPre.uniforms.uThreshold.value = look.threshold; mPre.uniforms.uKnee.value = look.knee;
    },
    info() { return { enabled: active(), quality, pinned, soft, lost, failed, size: [W, H], bars: +st.bars.toFixed(2), intro: st.introOn, postCalls: st.postCalls, preset: o.preset || null, dof: +st.dof.toFixed(2), handheld: +st.hand.toFixed(2) }; },
    render(scene, camera) {
      const dt = tickState();
      if (scene && camera) {
        if (!warmed.has(scene)) { warmed.add(scene); warm(scene, camera, true); }
        else if (st.fresh) warm(scene, camera, false);
      }
      const moved = cineBegin(camera);
      try {
        renderer.setRenderTarget(null);
        renderer.render(scene, camera);
      } finally {
        if (moved) cineEnd(camera);
      }
      if (!active()) { plainBars(st.bars); return dt; }
      const info = renderer.info.render;
      const calls = info.calls, tris = info.triangles, points = info.points, lines = info.lines;
      try {
        const gl = renderer.getContext();
        const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight;
        if (w < 8 || h < 8) return dt;
        if (!built || w !== W || h !== H) build(w, h);
        renderer.copyFramebufferToTexture(frameTex);
        const autoReset = renderer.info.autoReset; renderer.info.autoReset = false;
        const full = quality >= 3;
        // Bright pass: full quality steps through a half size image first, for a finer core.
        if (full) {
          mPre.uniforms.tSrc.value = frameTex; mPre.uniforms.uOff.value.set(0.5 / w, 0.5 / h); pass(mPre, rtE);
          mDown.uniforms.tSrc.value = rtE.texture; mDown.uniforms.uOff.value.set(0.5 / rtE.width, 0.5 / rtE.height); pass(mDown, rtA);
        } else {
          mPre.uniforms.tSrc.value = frameTex; mPre.uniforms.uOff.value.set(1.5 / w, 1.5 / h); pass(mPre, rtA);
        }
        mBlur.uniforms.tSrc.value = rtA.texture; mBlur.uniforms.uDir.value.set(1 / rtA.width, 0); pass(mBlur, rtB);
        mBlur.uniforms.tSrc.value = rtB.texture; mBlur.uniforms.uDir.value.set(0, 1 / rtA.height); pass(mBlur, rtA);
        const wide = quality >= 2;
        if (wide) {
          mDown.uniforms.tSrc.value = rtA.texture; mDown.uniforms.uOff.value.set(0.5 / rtA.width, 0.5 / rtA.height); pass(mDown, rtC);
          mBlur.uniforms.tSrc.value = rtC.texture; mBlur.uniforms.uDir.value.set(1 / rtC.width, 0); pass(mBlur, rtD);
          mBlur.uniforms.tSrc.value = rtD.texture; mBlur.uniforms.uDir.value.set(0, 1 / rtC.height); pass(mBlur, rtC);
        }
        // depth of field look: a blurred quarter copy of the frame, mixed in away from the focus point
        const dofOn = st.dof > 0.002 && quality >= 2;
        if (dofOn) {
          if (!rtF) { rtF = new THREE.WebGLRenderTarget(rtA.width, rtA.height, rtOpts); rtG = new THREE.WebGLRenderTarget(rtA.width, rtA.height, rtOpts); }
          mDown.uniforms.tSrc.value = frameTex; mDown.uniforms.uOff.value.set(1.5 / w, 1.5 / h); pass(mDown, rtF);
          mBlur.uniforms.tSrc.value = rtF.texture; mBlur.uniforms.uDir.value.set(1.6 / rtF.width, 0); pass(mBlur, rtG);
          mBlur.uniforms.tSrc.value = rtG.texture; mBlur.uniforms.uDir.value.set(0, 1.6 / rtF.height); pass(mBlur, rtF);
        }
        const u = mComp.uniforms;
        u.tDof.value = dofOn ? rtF.texture : black; u.uDof.value = dofOn ? st.dof : 0;
        u.uFocus.value.set(st.focusX, st.focusY, dofCfg && st.dofTarget <= 0 ? dofCfg.radius : st.focusR);
        u.uCA.value = quality >= 2 ? lensAmt : 0;
        u.tFrame.value = frameTex; u.tB1.value = rtA.texture; u.tB2.value = wide ? rtC.texture : black;
        u.uB1.value = look.bloom; u.uB2.value = wide ? look.bloomWide : 0;
        u.uGrain.value = quality >= 2 ? look.grain : look.grain * 0.6; u.uSeed.value = st.seed;
        u.uRes.value.set(w, h);
        u.uBars.value = st.bars * (portrait() ? 0.045 : 0.07);
        u.uFlash.value = st.flash; u.uFlashCol.value.copy(st.flashCol);
        pass(mComp, null);
        st.postCalls = renderer.info.render.calls - calls;
        renderer.info.autoReset = autoReset;
      } catch (e) {
        failed = true;
        try { console.warn('fx3d: post pass off', e && e.message); } catch (er) { /* ignore */ }
        try { renderer.setRenderTarget(null); renderer.render(scene, camera); } catch (er) { /* lost */ }
      }
      // The game's own counters keep describing its scene, not this pass.
      info.calls = calls; info.triangles = tris; info.points = points; info.lines = lines;
      return dt;
    },
    dispose() { disposeTargets(); [mPre, mDown, mBlur, mComp].forEach((m) => m.dispose()); quad.geometry.dispose(); black.dispose(); },
    get look() { return look; },
  };
  if (arc) arc.fx3d = fx;
  return fx;
}

/* ================================================================== realism helpers (opt-in)
 *
 *   import { createSkyEnv, contactShadow, createParticles, isSoftRenderer } from '/games/shared/fx3d.js';
 *
 *   // a sky-based environment light: materials reflect a real gradient sky and sun
 *   const env = createSkyEnv(renderer, scene, { top: '#5d8fd6', horizon: '#e9dcc8', ground: '#4a4034',
 *     sun: { dir: [0.4, 0.6, 0.3], color: '#fff2dc', size: 0.03, intensity: 6 }, intensity: 0.8, dome: 400 });
 *   env.update({ horizon: '#f0a060' });   // change the time of day; env.dispose()
 *
 *   // soft contact shadows that fade and spread as things leave the ground
 *   const cs = contactShadow(scene, { max: 40, size: 0.9, opacity: 0.55, fade: 1.2, groundY: 0 });
 *   cs.track(person.group, { size: 0.8 });  cs.track(ball, { size: 0.3 });
 *   cs.update();                            // each frame (or cs.begin(); cs.put(x, y, z, size, height, alpha); cs.end();)
 *
 *   // pooled physics particles: dust, smoke, sparks, splash, debris, glint
 *   const fxp = createParticles(scene, { max: 400, unit: 1, quality: q });
 *   fxp.emit('dust', x, 0, z, { count: 6, vel: [vx, 0, vz] });
 *   fxp.update(dt, camera);                 // each frame
 *
 * All three are cheap, allocate nothing per frame and never throw on a lost
 * context. On a software renderer and at quality 0 they shrink (smaller env
 * map, a third of the particles) unless o.force is set.
 */
export function isSoftRenderer(renderer) { return softRenderer(renderer); }

const SKY_VS = 'varying vec3 vDir;\nvoid main() { vDir = normalize((modelMatrix * vec4(position, 0.0)).xyz); vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSunSize; uniform float uSunI; uniform float uHaze; uniform float uExp;',
  'varying vec3 vDir;',
  'void main() {',
  '  vec3 d = normalize(vDir);',
  '  float h = d.y;',
  '  vec3 sky = mix(uHorizon, uTop, pow(clamp(h, 0.0, 1.0), uExp));',
  '  vec3 gnd = mix(uHorizon * 0.7 + uGround * 0.3, uGround, clamp(-h * 4.0, 0.0, 1.0));',
  '  vec3 c = h >= 0.0 ? sky : gnd;',
  '  float sd = max(dot(d, normalize(uSunDir)), 0.0);',
  '  c += uSunCol * (pow(sd, 6.0) * 0.18 * uHaze + pow(sd, 64.0) * 0.6) * step(-0.05, h);',
  '  c += uSunCol * smoothstep(1.0 - uSunSize, 1.0 - uSunSize * 0.6, sd) * uSunI;',
  '  gl_FragColor = vec4(c, 1.0);',
  '}',
].join('\n');

export function createSkyEnv(renderer, scene, o) {
  o = Object.assign({ top: '#4f7fc4', horizon: '#dcd6c8', ground: '#4a4236', sun: null, intensity: 1, haze: 1, exponent: 0.55, dome: 0, background: false }, o || {});
  const soft = o.soft != null ? !!o.soft : softRenderer(renderer);
  const toV = (c) => { const col = new THREE.Color(c); return new THREE.Vector3(col.r, col.g, col.b); };
  const sun = Object.assign({ dir: [0.4, 0.55, 0.3], color: '#fff3df', size: 0.025, intensity: 6 }, o.sun || {});
  const uniforms = {
    uTop: { value: toV(o.top) }, uHorizon: { value: toV(o.horizon) }, uGround: { value: toV(o.ground) },
    uSunDir: { value: new THREE.Vector3().fromArray(Array.isArray(sun.dir) ? sun.dir : [sun.dir.x, sun.dir.y, sun.dir.z]).normalize() },
    uSunCol: { value: toV(sun.color) }, uSunSize: { value: sun.size }, uSunI: { value: o.sun ? sun.intensity : 0 },
    uHaze: { value: o.haze }, uExp: { value: o.exponent },
  };
  const skyMat = new THREE.ShaderMaterial({ vertexShader: SKY_VS, fragmentShader: SKY_FS, uniforms, side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: true });
  skyMat.userData.keepMat = true;
  const skyScene = new THREE.Scene();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat); skyScene.add(ball);
  let pmrem = null, rt = null, dome = null;
  const size = o.size || (soft && !o.force ? 32 : (o.quality != null && o.quality < 2 ? 64 : 128));
  const bake = () => {
    try {
      if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
      const next = pmrem.fromScene(skyScene, soft && !o.force ? 0 : 0.02, 0.1, 100, { size });
      if (rt) rt.dispose();
      rt = next;
      if (scene) { scene.environment = rt.texture; if ('environmentIntensity' in scene) scene.environmentIntensity = o.intensity; if (o.background) scene.background = rt.texture; }
    } catch (e) { /* lost context or no float targets: no environment, the scene lights still work */ }
  };
  bake();
  if (o.dome && scene) {
    // the same sky as a visible dome around the world (no environment cost)
    dome = new THREE.Mesh(new THREE.SphereGeometry(o.dome, 32, 16), skyMat.clone()); dome.material.userData.keepMat = true;
    dome.material.uniforms = uniforms; dome.material.uniforms.uSunI = { value: o.sun ? sun.intensity * 0.35 : 0 };
    dome.frustumCulled = false; dome.renderOrder = -10; scene.add(dome);
  }
  return {
    get texture() { return rt ? rt.texture : null; },
    dome,
    // change colours, sun or intensity and bake again (a few ms; do it on a state change, not every frame)
    update(n) {
      if (!n) return;
      if (n.top) uniforms.uTop.value.copy(toV(n.top));
      if (n.horizon) uniforms.uHorizon.value.copy(toV(n.horizon));
      if (n.ground) uniforms.uGround.value.copy(toV(n.ground));
      if (n.sun) {
        if (n.sun.dir) uniforms.uSunDir.value.fromArray(Array.isArray(n.sun.dir) ? n.sun.dir : [n.sun.dir.x, n.sun.dir.y, n.sun.dir.z]).normalize();
        if (n.sun.color) uniforms.uSunCol.value.copy(toV(n.sun.color));
        if (n.sun.size != null) uniforms.uSunSize.value = n.sun.size;
        if (n.sun.intensity != null) uniforms.uSunI.value = n.sun.intensity;
      }
      if (n.intensity != null) { o.intensity = n.intensity; if (scene && 'environmentIntensity' in scene) scene.environmentIntensity = n.intensity; }
      if (n.top || n.horizon || n.ground || n.sun) bake();
    },
    dispose() {
      try { if (rt) rt.dispose(); if (pmrem) pmrem.dispose(); } catch (e) { /* lost */ }
      ball.geometry.dispose(); skyMat.dispose();
      if (dome) { dome.geometry.dispose(); dome.material.dispose(); if (dome.parent) dome.parent.remove(dome); }
      if (scene && rt && scene.environment === rt.texture) scene.environment = null;
      rt = null;
    },
  };
}

// a soft round falloff, shared by contact shadows and particles
let BLOB = null;
function blobTexture() {
  if (BLOB) return BLOB;
  const cv = document.createElement('canvas'); cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  for (let i = 0; i <= 8; i++) { const t = i / 8; gr.addColorStop(t, 'rgba(255,255,255,' + Math.pow(1 - t, 2.2).toFixed(3) + ')'); }
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  BLOB = new THREE.CanvasTexture(cv);
  return BLOB;
}
// per-instance opacity on a basic material
function alphaPatch(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = 'attribute float aAlpha;\nvarying float vAlphaI;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvAlphaI = aAlpha;');
    sh.fragmentShader = 'varying float vAlphaI;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\ndiffuseColor.a *= vAlphaI;');
  };
  mat.customProgramCacheKey = () => 'fx3d-alpha-' + (mat.blending === THREE.AdditiveBlending ? 'add' : 'norm');
  mat.userData.keepMat = true; // games swapping materials for a cheap tier skip these
  return mat;
}

export function contactShadow(scene, o) {
  o = Object.assign({ max: 48, size: 1, opacity: 0.5, fade: 1.5, color: 0x000000, groundY: 0, lift: 0.01 }, o || {});
  const N = o.max;
  const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);
  const alpha = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); alpha.setUsage(THREE.DynamicDrawUsage);
  g.setAttribute('aAlpha', alpha);
  const mat = alphaPatch(new THREE.MeshBasicMaterial({ color: o.color, map: blobTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false, fog: true }));
  const mesh = new THREE.InstancedMesh(g, mat, N);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.renderOrder = 1; mesh.count = 0; mesh.name = 'contactShadows';
  if (scene) scene.add(mesh);
  const tracked = [];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), wp = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  let n = 0;
  const groundAt = (x, z) => (typeof o.groundY === 'function' ? o.groundY(x, z) : o.groundY);
  const cs = {
    mesh,
    track(obj, t) { tracked.push({ obj, size: (t && t.size) || o.size, opacity: t && t.opacity != null ? t.opacity : o.opacity, stretch: (t && t.stretch) || 1 }); return cs; },
    untrack(obj) { for (let i = tracked.length - 1; i >= 0; i--) if (tracked[i].obj === obj) tracked.splice(i, 1); return cs; },
    begin() { n = 0; return cs; },
    // x, y, z: the point casting it (y its height in world units); size: diameter at contact
    put(x, y, z, size, height, opacity, yaw, stretch) {
      if (n >= N) return cs;
      const gy = groundAt(x, z);
      const h = Math.max(0, height != null ? height : y - gy);
      const k = Math.max(0, 1 - h / o.fade);
      const a = (opacity != null ? opacity : o.opacity) * k * k;
      if (a < 0.005) return cs;
      const s = (size || o.size) * (1 + h / o.fade * 0.9);
      q.setFromAxisAngle(UP, yaw || 0);
      m4.compose(ps.set(x, gy + o.lift, z), q, sc.set(s * (stretch || 1), 1, s));
      mesh.setMatrixAt(n, m4); alpha.array[n] = a; n++;
      return cs;
    },
    end() { mesh.count = n; if (n) { mesh.instanceMatrix.needsUpdate = true; alpha.needsUpdate = true; } return cs; },
    update() {
      cs.begin();
      for (const t of tracked) {
        if (!t.obj.visible || !t.obj.parent) continue;
        t.obj.getWorldPosition(wp);
        cs.put(wp.x, wp.y, wp.z, t.size, wp.y - groundAt(wp.x, wp.z), t.opacity, 0, t.stretch);
      }
      return cs.end();
    },
    dispose() { g.dispose(); mat.dispose(); if (mesh.parent) mesh.parent.remove(mesh); },
  };
  return cs;
}

// particle kinds (metres and seconds; scaled by o.unit)
const PKINDS = {
  dust: { add: false, color: '#c9b79b', alpha: [0.34, 0], size: [0.14, 0.75], life: [1.0, 1.9], grav: -0.25, drag: 2.4, rise: 0, bounce: 0, spin: 0.6, stretch: 0, spread: 0.12, up: 0.35, speed: 0.6 },
  smoke: { add: false, color: '#8d8b88', alpha: [0.26, 0], size: [0.3, 1.8], life: [2.0, 3.4], grav: 0.55, drag: 1.4, rise: 0.4, bounce: 0, spin: 0.4, stretch: 0, spread: 0.18, up: 0.6, speed: 0.4 },
  sparks: { add: true, color: '#ffb55c', alpha: [1, 0], size: [0.035, 0.02], life: [0.35, 0.8], grav: -9.8, drag: 0.6, rise: 0, bounce: 0.38, spin: 0, stretch: 0.06, spread: 0.02, up: 1.8, speed: 4.5 },
  splash: { add: false, color: '#d5e6f2', alpha: [0.7, 0], size: [0.07, 0.03], life: [0.45, 0.8], grav: -9.8, drag: 0.4, rise: 0, bounce: 0, spin: 0, stretch: 0.05, spread: 0.06, up: 2.6, speed: 2.2 },
  debris: { add: false, color: '#5e5145', alpha: [1, 0.9], size: [0.045, 0.04], life: [1.0, 1.8], grav: -9.8, drag: 0.3, rise: 0, bounce: 0.32, spin: 6, stretch: 0, spread: 0.05, up: 2.2, speed: 2.4 },
  glint: { add: true, color: '#fff4dc', alpha: [0.9, 0], size: [0.12, 0.02], life: [0.2, 0.4], grav: 0, drag: 2, rise: 0, bounce: 0, spin: 0, stretch: 0, spread: 0.02, up: 0, speed: 0 },
};
export function createParticles(scene, o) {
  o = Object.assign({ max: 320, unit: 1, groundY: 0 }, o || {});
  const unit = o.unit, N = o.max;
  const soft = o.soft != null ? !!o.soft : false;
  let quality = o.quality == null ? 2 : o.quality;
  const rate = () => (soft && !o.force ? 0.35 : [0.35, 0.6, 0.85, 1][Math.max(0, Math.min(3, quality | 0))]);
  // one pool per blend: normal (dust, smoke, splash, debris) and additive (sparks, glints)
  const mkPool = (additive) => {
    const g = new THREE.PlaneGeometry(1, 1);
    const alpha = new THREE.InstancedBufferAttribute(new Float32Array(N), 1); alpha.setUsage(THREE.DynamicDrawUsage); g.setAttribute('aAlpha', alpha);
    const mat = alphaPatch(new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, toneMapped: !additive, fog: true }));
    const mesh = new THREE.InstancedMesh(g, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled = false; mesh.count = 0; mesh.renderOrder = additive ? 9 : 8; mesh.name = 'particles';
    mesh.setColorAt(0, new THREE.Color(1, 1, 1)); mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    if (scene) scene.add(mesh);
    const P = [];
    for (let i = 0; i < N; i++) P.push({ on: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, k: null, r: 1, gr: 1, b: 1, s0: 1, s1: 1, rot: 0, vr: 0, rest: false });
    return { mesh, alpha, P, next: 0, live: 0 };
  };
  const pools = [mkPool(false), mkPool(true)];
  const col = new THREE.Color();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), qz = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), ZA = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3(), up = new THREE.Vector3();
  const groundAt = (x, z) => (typeof o.groundY === 'function' ? o.groundY(x, z) : o.groundY);
  let acc = 0;
  const fx = {
    meshes: [pools[0].mesh, pools[1].mesh],
    kinds: PKINDS,
    setQuality(qq) { quality = qq; },
    // kind: a name above, or your own spec in the same shape. p: { count, vel: [x,y,z] (world units/s), speed, spread, up, color, size, life }
    emit(kind, x, y, z, p) {
      const K = typeof kind === 'string' ? PKINDS[kind] : kind;
      if (!K) return 0;
      p = p || {};
      acc += (p.count == null ? 6 : p.count) * rate();
      let made = 0;
      const pool = pools[K.add ? 1 : 0];
      const spd = (p.speed != null ? p.speed : K.speed) * unit, spr = (p.spread != null ? p.spread : K.spread) * unit, upv = (p.up != null ? p.up : K.up) * unit;
      const vel = p.vel;
      col.set(p.color || K.color);
      while (acc >= 1) {
        acc -= 1;
        const q0 = pool.P[pool.next]; pool.next = (pool.next + 1) % N;
        q0.on = true; q0.k = K; q0.age = 0; q0.rest = false;
        q0.life = (K.life[0] + Math.random() * (K.life[1] - K.life[0])) * (p.life || 1);
        q0.x = x + (Math.random() - 0.5) * spr * 2; q0.y = y + Math.random() * spr; q0.z = z + (Math.random() - 0.5) * spr * 2;
        const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random());
        q0.vx = Math.cos(a) * rr * spd + (vel ? vel[0] : 0); q0.vz = Math.sin(a) * rr * spd + (vel ? vel[2] : 0);
        q0.vy = upv * (0.5 + Math.random() * 0.5) + (vel ? vel[1] : 0);
        const v = 0.88 + Math.random() * 0.24; q0.r = col.r * v; q0.gr = col.g * v; q0.b = col.b * v;
        const sz = p.size || 1; q0.s0 = K.size[0] * unit * sz * (0.75 + Math.random() * 0.5); q0.s1 = K.size[1] * unit * sz * (0.75 + Math.random() * 0.5);
        q0.rot = Math.random() * Math.PI * 2; q0.vr = (Math.random() - 0.5) * 2 * K.spin;
        made++;
      }
      return made;
    },
    update(dt, camera) {
      dt = Math.min(0.1, Math.max(0, dt || 0));
      if (camera) { right.setFromMatrixColumn(camera.matrixWorld, 0); up.setFromMatrixColumn(camera.matrixWorld, 1); }
      for (const pool of pools) {
        let n = 0;
        const a = pool.alpha.array, ic = pool.mesh.instanceColor;
        for (let i = 0; i < N; i++) {
          const p = pool.P[i]; if (!p.on) continue;
          p.age += dt;
          if (p.age >= p.life) { p.on = false; continue; }
          const K = p.k;
          if (!p.rest) {
            const dr = Math.exp(-K.drag * dt);
            p.vx *= dr; p.vz *= dr; p.vy = p.vy * dr + (K.grav * unit) * dt;
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            const gy = groundAt(p.x, p.z);
            if (p.y < gy) {
              if (K.bounce > 0 && Math.abs(p.vy) > 0.6 * unit) { p.y = gy; p.vy = -p.vy * K.bounce; p.vx *= 0.6; p.vz *= 0.6; }
              else if (K.grav < 0 && K.drag < 1) { p.y = gy; p.vy = 0; p.vx *= 0.3; p.vz *= 0.3; p.rest = K.bounce > 0 || K.size[1] >= K.size[0] * 0.8; if (!p.rest && K.stretch) { p.on = false; continue; } }
              else p.y = gy;
            }
          }
          p.rot += p.vr * dt;
          const t = p.age / p.life;
          const al = K.alpha[0] + (K.alpha[1] - K.alpha[0]) * t;
          const fadeIn = Math.min(1, p.age / 0.06);
          const s = p.s0 + (p.s1 - p.s0) * Math.sqrt(t);
          // face the camera; sparks and splashes stretch along their screen motion
          let ang = p.rot, len = 1;
          if (K.stretch && camera) {
            const vr = p.vx * right.x + p.vy * right.y + p.vz * right.z, vu = p.vx * up.x + p.vy * up.y + p.vz * up.z;
            ang = Math.atan2(vu, vr); len = 1 + Math.hypot(vr, vu) / unit * K.stretch * 8;
          }
          if (camera) q.copy(camera.quaternion); else q.identity();
          qz.setFromAxisAngle(ZA, ang); q.multiply(qz);
          m4.compose(ps.set(p.x, p.y, p.z), q, sc.set(s * len, s, 1));
          pool.mesh.setMatrixAt(n, m4);
          a[n] = Math.max(0, al) * fadeIn;
          ic.setXYZ(n, p.r, p.gr, p.b);
          n++;
        }
        pool.mesh.count = n;
        if (n) { pool.mesh.instanceMatrix.needsUpdate = true; pool.alpha.needsUpdate = true; ic.needsUpdate = true; }
      }
    },
    clear() { for (const pool of pools) { for (const p of pool.P) p.on = false; pool.mesh.count = 0; } },
    get live() { let k = 0; for (const pool of pools) for (const p of pool.P) if (p.on) k++; return k; },
    dispose() { for (const pool of pools) { pool.mesh.geometry.dispose(); pool.mesh.material.dispose(); if (pool.mesh.parent) pool.mesh.parent.remove(pool.mesh); } },
  };
  return fx;
}

export default createFX;
