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
  'varying vec2 vUv;',
  'float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
  'void main() {',
  '  vec3 c = texture2D(tFrame, vUv).rgb;',
  '  vec3 lin = c * c + texture2D(tB1, vUv).rgb * uB1 + texture2D(tB2, vUv).rgb * uB2;',
  '  c = sqrt(lin);',
  // soft shoulder so a hot bloom rolls off instead of clipping flat
  '  c = c / (1.0 + max(c - 1.0, 0.0));',
  '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
  '  c = mix(vec3(l), c, uSat);',
  '  c = (c - 0.5) * uContrast + 0.5;',
  '  c = c * uGain + uLift * (1.0 - c);',
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
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createFX(renderer, o) {
  o = o || {};
  const arc = o.arc || (typeof window !== 'undefined' ? window.__arcade : null);
  const look = Object.assign({ bloom: 0.55, bloomWide: 0.35, threshold: 0.66, knee: 0.22, vignette: 0.32, grain: 0.035, sat: 1.06, contrast: 1.05, lift: [0.012, 0.012, 0.022], gain: [1.02, 1.0, 0.975] }, o.look || {});
  const soft = o.soft != null ? !!o.soft : softRenderer(renderer);
  let userOn = o.enabled !== false, quality = o.quality == null ? 2 : o.quality, pinned = false;
  let lost = false, failed = false, built = false, W = 0, H = 0;
  let frameTex = null, rtA = null, rtB = null, rtC = null, rtD = null, rtE = null;
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
  });

  const canvas = renderer.domElement;
  if (canvas && canvas.addEventListener) {
    canvas.addEventListener('webglcontextlost', () => { lost = true; }, false);
    canvas.addEventListener('webglcontextrestored', () => { lost = false; built = false; }, false);
  }

  const rtOpts = { depthBuffer: false, stencilBuffer: false, type: THREE.UnsignedByteType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false };
  const disposeTargets = () => {
    [frameTex, rtA, rtB, rtC, rtD, rtE].forEach((t) => { if (t) { try { t.dispose(); } catch (e) { /* lost */ } } });
    frameTex = rtA = rtB = rtC = rtD = rtE = null; built = false;
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
  const st = { last: 0, flash: 0, flashCol: new THREE.Color(1, 1, 1), kick: 0, bars: 0, barsTarget: 0, barsHold: 0, intro: 0, introDur: 0, introOn: false, orbit: 0, prevState: '', prevTime: 0, seed: 0, grainT: 0, postCalls: 0 };
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
    const kick = st.kick;
    if (!(introK > 0.0005 || orbitK > 0 || Math.abs(kick) > 0.01)) return false;
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
    if (Math.abs(kick) > 0.01) { camera.fov = camera.userData.__fxFov + kick; camera.updateProjectionMatrix(); }
    camera.updateMatrixWorld();
    return true;
  };
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
    info() { return { enabled: active(), quality, pinned, soft, lost, failed, size: [W, H], bars: +st.bars.toFixed(2), intro: st.introOn, postCalls: st.postCalls }; },
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
        const u = mComp.uniforms;
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
  };
  if (arc) arc.fx3d = fx;
  return fx;
}

export default createFX;
