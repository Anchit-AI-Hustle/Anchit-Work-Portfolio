import * as THREE from '/games/vendor/three/three.module.min.js';
import { createHuman, createCrowd, crowdRows, prepareHuman } from '/games/shared/human.js';
import { createVFX } from '/games/shared/vfx.js';
import { createFX, contactShadow, createSkyEnv, isSoftRenderer } from '/games/shared/fx3d.js';
import { boot, RH, ROPE, POST, APRON, FLOOR, STAGE_Z, STAGE_Y, RAMP_END, PHf, PI, HALF, TAU, clamp, lerp, smooth01, PROMO, REF } from '/games/ring-rajas/core.js';

/*
 * Ring Rajas in 3D. The match itself lives in core.js; this file builds the
 * arena (a dark hall, a lit ring with ropes that give when someone hits them,
 * a stage with a titantron and pyro, a crowd on four sides), dresses the
 * wrestlers and the referee as human.js people, poses them through every move
 * on top of human.js's own walking, breathing and blinking, and films it all
 * like a TV broadcast: a hard camera, tight cuts for the big moves, a low
 * angle for finishers, slow motion replays, entrances down the ramp.
 *
 * Posing. A wrestler is root (position, facing) > pivot (at the pelvis: lifts,
 * flips and lying down) > the human. human.js runs the gait, the breathing,
 * the face and its own gestures; then this file blends named poses (bone
 * rotations) over it for the wrestling: a lock-up, a body slam, a cover.
 */

/* ------------------------------------------------------------ helpers */
const V1 = new THREE.Vector3(), V2 = new THREE.Vector3(), V3 = new THREE.Vector3(), VP = new THREE.Vector3(), UPV = new THREE.Vector3(0, 1, 0);
const C1 = new THREE.Color();
function rng(seed) { let a = (seed >>> 0) || 1; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const ALL_TEX = [];
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = 4;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  t.userData.canvas = c; t.userData.g = g;
  ALL_TEX.push(t);
  return t;
}
function speckle(g, w, h, n, amp, seed, size) {
  const r = rng(seed || 3);
  for (let i = 0; i < n; i++) { const v = (r() - 0.5) * amp, s = (size || 2) * (0.4 + r()); g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.fillRect(r() * w, r() * h, s, s); }
}
const std = (o) => new THREE.MeshStandardMaterial(o);

/* ------------------------------------------------------------ quality tiers */
const TIERS = [
  { px: 0.55, budget: 260000, shadow: false, map: 512, crowd: 0.25, hq: 0, vfx: 0, beams: false, post: false, flashes: false },
  { px: 0.75, budget: 700000, shadow: true, map: 1024, crowd: 0.6, hq: 1, vfx: 1, beams: true, post: true, flashes: true },
  { px: 0.9, budget: 1.25e6, shadow: true, map: 1024, crowd: 0.85, hq: 2, vfx: 2, beams: true, post: true, flashes: true },
  { px: 1, budget: 2.2e6, shadow: true, map: 2048, crowd: 1, hq: 3, vfx: 3, beams: true, post: true, flashes: true },
];

/* ------------------------------------------------------------ poses (bone rotations) */
// keys: sR sL shoulders [x, y, z], eR eL elbows (x), hR hL hips [x, y, z], kR kL knees (x), sp ch nk hd [x, y, z], wR wL wrists [x, y, z]
const PB = { sR: 'shoulderR', sL: 'shoulderL', eR: 'elbowR', eL: 'elbowL', hR: 'hipR', hL: 'hipL', kR: 'kneeR', kL: 'kneeL', sp: 'spine', ch: 'chest', nk: 'neck', hd: 'head', wR: 'wristR', wL: 'wristL' };
const PK = Object.keys(PB);
const UPPER = { sR: 1, sL: 1, eR: 1, eL: 1, wR: 1, wL: 1, ch: 1, hd: 1 };
const P = {
  guard: { sR: [-0.95, 0.35, -0.32], eR: -1.8, sL: [-0.95, -0.35, 0.32], eL: -1.8, ch: [0.08, 0, 0] },
  guardLegs: { sR: [-0.95, 0.35, -0.32], eR: -1.8, sL: [-0.95, -0.35, 0.32], eL: -1.8, sp: [0.14, 0, 0], hR: [-0.25, 0, -0.08], hL: [-0.12, 0, 0.08], kR: 0.42, kL: 0.3 },
  lock: { sR: [-1.25, 0.3, -0.15], eR: -1.1, sL: [-1.25, -0.3, 0.15], eL: -1.1, sp: [0.4, 0, 0], ch: [0.14, 0, 0], hd: [-0.3, 0, 0], hR: [-0.35, 0, -0.1], hL: [0.18, 0, 0.1], kR: 0.55, kL: 0.3 },
  jabW: { sR: [-0.3, 0.2, -0.3], eR: -2.1, sL: [-1.0, -0.3, 0.3], eL: -1.8, ch: [0.05, -0.25, 0] },
  jabH: { sR: [-1.55, 0, -0.12], eR: -0.15, sL: [-0.9, -0.3, 0.3], eL: -1.9, ch: [0.12, 0.4, 0] },
  hookW: { sR: [-0.3, 0, -1.25], eR: -1.6, ch: [0, -0.5, 0], sL: [-1.0, -0.3, 0.3], eL: -1.8 },
  hookH: { sR: [-1.45, 0.6, -0.9], eR: -0.7, ch: [0.1, 0.55, 0], sL: [-0.6, -0.3, 0.3], eL: -1.6 },
  chopW: { sR: [-0.9, 0, -2.2], eR: -0.55, ch: [0, -0.35, 0], sL: [-0.8, 0, 0.6], eL: -1.0 },
  chopH: { sR: [-1.3, 0.4, -0.45], eR: -0.15, ch: [0.15, 0.45, 0], sL: [-0.2, 0, 0.5], eL: -0.6 },
  foreW: { sR: [0.15, 0, -0.6], eR: -2.3, ch: [0, -0.4, 0], sL: [-1.0, -0.3, 0.3], eL: -1.8 },
  foreH: { sR: [-1.25, 0.2, -0.2], eR: -2.0, ch: [0.15, 0.5, 0], sL: [-0.5, 0, 0.3], eL: -1.2 },
  armOut: { sR: [-0.35, 0, -1.5], eR: -0.08, ch: [0.08, 0.3, 0], sL: [-0.6, 0, 0.6], eL: -0.8 },
  shove: { sR: [-1.5, 0, -0.15], eR: -0.1, sL: [-1.5, 0, 0.15], eL: -0.1, sp: [0.2, 0, 0] },
  whipW: { sR: [-1.2, 0.3, -0.3], eR: -0.9, sL: [-1.2, -0.3, 0.3], eL: -0.9, sp: [0.25, 0, 0] },
  whipH: { sR: [-1.1, 0, -0.9], eR: -0.1, sL: [-0.4, 0, 0.5], eL: -0.6, ch: [0.05, -0.4, 0] },
  grab: { sR: [-1.25, 0.45, -0.1], eR: -1.45, sL: [-1.25, -0.45, 0.1], eL: -1.45, sp: [0.45, 0, 0], hd: [-0.25, 0, 0], kR: 0.38, kL: 0.38, hR: [-0.3, 0, -0.1], hL: [-0.3, 0, 0.1] },
  lift: { sR: [-2.6, 0, -0.35], eR: -0.55, sL: [-2.6, 0, 0.35], eL: -0.55, sp: [-0.12, 0, 0], hd: [-0.25, 0, 0], hR: [-0.25, 0, -0.15], hL: [-0.25, 0, 0.15], kR: 0.4, kL: 0.4 },
  press: { sR: [-2.95, 0, -0.32], eR: -0.15, sL: [-2.95, 0, 0.32], eL: -0.15, sp: [-0.1, 0, 0], hd: [-0.35, 0, 0] },
  shoulders: { sR: [-2.3, 0.3, -0.5], eR: -1.6, sL: [-2.3, -0.3, 0.5], eL: -1.6, hd: [-0.15, 0, 0] },
  slamDown: { sR: [-1.6, 0, -0.4], eR: -0.4, sL: [-1.6, 0, 0.4], eL: -0.4, sp: [0.35, 0, 0], kR: 0.6, kL: 0.6, hR: [-0.5, 0, -0.15], hL: [-0.5, 0, 0.15] },
  kneel: { hR: [-1.45, 0, -0.12], kR: 2.0, hL: [-0.15, 0, 0.12], kL: 1.55, sp: [0.25, 0, 0], sR: [-0.6, 0, -0.4], eR: -0.6, sL: [-0.4, 0, 0.4], eL: -0.4 },
  bothKnees: { hR: [-0.1, 0, -0.15], kR: 2.1, hL: [-0.1, 0, 0.15], kL: 2.1, sp: [0.3, 0, 0], sR: [-0.9, 0, -0.3], eR: -0.5, sL: [-0.9, 0, 0.3], eL: -0.5 },
  limp: { sR: [-0.45, 0, -1.05], eR: -0.45, sL: [-0.45, 0, 1.05], eL: -0.45, hR: [-0.35, 0, -0.18], hL: [-0.2, 0, 0.18], kR: 0.55, kL: 0.3, hd: [-0.25, 0, 0] },
  sitOn: { hR: [-1.55, 0, -0.38], kR: 1.35, hL: [-1.55, 0, 0.38], kL: 1.35, sp: [0.2, 0, 0], sR: [-0.9, 0, -0.7], eR: -1.2, sL: [-0.9, 0, 0.7], eL: -1.2, hd: [0.25, 0, 0] },
  tuck: { sR: [-1.4, 0, -0.5], eR: -1.6, sL: [-1.4, 0, 0.5], eL: -1.6, hR: [-1.1, 0, -0.15], hL: [-1.1, 0, 0.15], kR: 1.4, kL: 1.4, sp: [0.4, 0, 0], hd: [0.3, 0, 0] },
  lie: { sR: [0.12, 0, -0.78], eR: -0.25, sL: [0.12, 0, 0.78], eL: -0.25, hR: [-0.06, 0, -0.12], hL: [-0.08, 0, 0.12], kR: 0.12, kL: 0.18, hd: [-0.12, 0.25, 0] },
  lieHurt: { sR: [-0.4, 0, -0.5], eR: -1.6, sL: [-0.6, 0, 0.6], eL: -1.9, hR: [-0.95, 0, -0.08], hL: [-0.12, 0, 0.12], kR: 1.55, kL: 0.2, hd: [0.1, -0.3, 0] },
  lieFront: { sR: [-2.4, 0, -0.45], eR: -1.6, sL: [-2.4, 0, 0.45], eL: -1.6, hR: [0.05, 0, -0.12], hL: [0.05, 0, 0.12], kR: 0.1, kL: 0.25, hd: [-0.55, 0.9, 0] },
  kickout: { sp: [0.55, 0, 0], ch: [0.25, 0, 0], sR: [-0.6, 0, -0.9], eR: -0.4, sL: [-0.5, 0, 0.9], eL: -0.3, hR: [-0.6, 0, -0.1], kR: 0.9 },
  cover: { sR: [-1.6, 0, -0.35], eR: -0.75, sL: [-1.2, 0, 0.65], eL: -1.4, hR: [0.25, 0, -0.55], kR: 0.6, hL: [0.15, 0, 0.5], kL: 0.4, hd: [-0.55, 0, 0] },
  bridge: { sp: [-0.65, 0, 0], ch: [-0.5, 0, 0], hd: [-0.65, 0, 0], sR: [-2.6, 0, -0.45], eR: -0.5, sL: [-2.6, 0, 0.45], eL: -0.5, hR: [0.45, 0, -0.25], kR: 1.9, hL: [0.45, 0, 0.25], kL: 1.9 },
  climb: { sR: [-2.3, 0, -0.55], eR: -0.9, sL: [-2.3, 0, 0.55], eL: -0.9, hR: [-1.15, 0, -0.12], kR: 1.55, hL: [-0.35, 0, 0.12], kL: 0.65 },
  perch: { hR: [-1.55, 0, -0.35], kR: 2.0, hL: [-1.55, 0, 0.35], kL: 2.0, sp: [0.5, 0, 0], hd: [-0.35, 0, 0], sR: [-0.4, 0, -1.2], eR: -0.4, sL: [-0.4, 0, 1.2], eL: -0.4 },
  fly: { sR: [-0.2, 0, -1.45], eR: -0.2, sL: [-0.2, 0, 1.45], eL: -0.2, hR: [0.12, 0, -0.25], hL: [0.12, 0, 0.25], kR: 0.35, kL: 0.35, hd: [-0.85, 0, 0] },
  elbowFly: { sR: [-2.5, 0, -0.65], eR: -2.1, sL: [-0.3, 0, 1.2], eL: -0.3, hR: [0.1, 0, -0.2], hL: [0.1, 0, 0.2], kR: 0.4, kL: 0.4, hd: [-0.8, 0, 0] },
  dropkick: { hR: [-1.45, 0, -0.05], kR: 0.15, hL: [-1.45, 0, 0.05], kL: 0.15, sR: [0.5, 0, -0.6], eR: -0.4, sL: [0.5, 0, 0.6], eL: -0.4, sp: [-0.2, 0, 0] },
  spear: { sR: [-1.4, 0, -0.45], eR: -0.6, sL: [-1.4, 0, 0.45], eL: -0.6, hd: [-0.6, 0, 0], hR: [0.3, 0, -0.1], hL: [0.3, 0, 0.1], kR: 0.6, kL: 0.4 },
  elbowDrop: { sR: [-0.3, 0, -1.3], eR: -2.4, sL: [-0.8, 0, 0.7], eL: -0.6, hR: [0.15, 0, -0.2], hL: [0.15, 0, 0.2], kR: 0.4, kL: 0.4 },
  kneeDrop: { hR: [-1.45, 0, -0.1], kR: 2.15, hL: [-0.2, 0, 0.1], kL: 0.4, sR: [-0.4, 0, -0.7], eR: -0.5, sL: [-0.4, 0, 0.7], eL: -0.5 },
  holdLeg: { sR: [-0.95, 0, -0.25], eR: -1.35, sL: [-0.95, 0, 0.25], eL: -1.35, sp: [0.3, 0, 0], kR: 0.65, kL: 0.65, hR: [-0.45, 0, -0.15], hL: [-0.45, 0, 0.15], hd: [-0.3, 0, 0] },
  holdArm: { hR: [-1.45, 0, -0.4], kR: 0.25, hL: [-1.45, 0, 0.4], kL: 0.35, sR: [-1.1, 0, -0.3], eR: -1.05, sL: [-1.1, 0, 0.3], eL: -1.05, hd: [0.2, 0, 0] },
  holdSit: { hR: [-1.45, 0, -0.65], kR: 1.6, hL: [-1.45, 0, 0.65], kL: 1.6, sR: [-1.25, 0, -0.2], eR: -1.6, sL: [-1.25, 0, 0.2], eL: -1.6, sp: [-0.3, 0, 0], hd: [-0.25, 0, 0] },
  heldLeg: { hR: [-0.95, 0, 0.05], kR: 0.35, hL: [-0.95, 0, -0.05], kL: 0.35, sR: [-0.8, 0, -0.9], eR: -1.2, sL: [-0.2, 0, 1.3], eL: -0.3, sp: [0.3, 0, 0], hd: [0.2, 0.3, 0] },
  heldArm: { sR: [-1.55, 0, -0.1], eR: -0.05, sL: [-0.3, 0, 0.9], eL: -0.9, hR: [-0.3, 0, -0.1], kR: 0.6, hd: [0.1, -0.4, 0] },
  heldSit: { sp: [-0.45, 0, 0], ch: [-0.35, 0, 0], hd: [-0.45, 0, 0], sR: [-0.7, 0, -0.55], eR: -1.3, sL: [-0.7, 0, 0.55], eL: -1.3 },
  apron: { sR: [-2.0, 0, -0.35], eR: -0.75, sL: [-2.0, 0, 0.35], eL: -0.75 },
  reach: { sR: [-2.0, 0, -0.35], eR: -0.75, sL: [-1.5, 0, 0.2], eL: -0.05 },
  beltUp: { sR: [-2.75, 0, -0.25], eR: -0.35, sL: [-2.75, 0, 0.25], eL: -0.35, hd: [-0.3, 0, 0] },
  armUp: { sL: [-0.2, 0, 2.7], eL: -0.15 },
  refCountUp: { sR: [-0.35, 0, -2.4], eR: -0.3, sL: [-0.5, 0, 0.4], eL: -0.5 },
  refCountDn: { sR: [-1.35, 0, -0.35], eR: -0.1, sL: [-0.5, 0, 0.4], eL: -0.5 },
  refRaise: { sR: [-0.35, 0, -2.55], eR: -0.15 },
  refPoint: { sR: [-1.55, 0, -0.15], eR: -0.1 },
  refKneel: { hR: [-0.55, 0, -0.14], kR: 1.62, hL: [-0.55, 0, 0.14], kL: 1.62, sp: [0.25, 0, 0], hd: [-0.35, 0, 0] },
  refSub: { sR: [-0.9, 0, -0.3], eR: -0.6, sL: [-0.9, 0, 0.3], eL: -0.6, sp: [0.35, 0, 0] },
};
// key programs over normalised time; a pose name or null (= what human.js does)
const KEYS = {
  jab: [[0, 'guard'], [0.32, 'jabW'], [0.5, 'jabH'], [0.75, 'jabH'], [1, 'guard']],
  hook: [[0, 'guard'], [0.32, 'hookW'], [0.52, 'hookH'], [0.75, 'hookH'], [1, 'guard']],
  chop: [[0, 'guard'], [0.34, 'chopW'], [0.52, 'chopH'], [0.8, 'chopH'], [1, 'guard']],
  forearm: [[0, 'guard'], [0.32, 'foreW'], [0.5, 'foreH'], [0.78, 'foreH'], [1, 'guard']],
  clothes: [[0, 'guard'], [0.2, 'armOut'], [0.6, 'armOut'], [1, 'guard']],
  lariat: [[0, 'guard'], [0.25, 'armOut'], [0.7, 'armOut'], [1, 'guard']],
  bigboot: [[0, null], [1, null]],
  dropkick: [[0, null], [0.18, 'tuck'], [0.3, 'dropkick'], [0.55, 'lie'], [1, 'lie']],
  spear: [[0, 'guard'], [0.25, 'spear'], [0.6, 'spear'], [1, 'lieFront']],
  elbowDrop: [[0, 'guard'], [0.3, 'elbowDrop'], [0.75, 'elbowDrop'], [1, 'guard']],
  kneeDrop: [[0, 'guard'], [0.3, 'kneeDrop'], [0.72, 'kneeDrop'], [1, 'guard']],
  whip: [[0, 'whipW'], [0.4, 'whipH'], [1, 'guard']],
  shove: [[0, 'guard'], [0.4, 'shove'], [0.7, 'shove'], [1, 'guard']],
  getup: [[0, 'lie'], [0.45, 'kneel'], [1, 'guardLegs']],
  fallBack: [[0, 'limp'], [1, 'lie']],
  fallFront: [[0, 'limp'], [1, 'lieFront']],
  climb: [[0, 'climb'], [1, 'perch']],
  pickup: [[0, 'grab'], [0.6, 'lift'], [1, 'guard']],
  rollOut: [[0, 'tuck'], [0.7, 'tuck'], [1, null]],
  rollIn: [[0, 'tuck'], [0.6, 'tuck'], [1, null]],
  overTop: [[0, 'limp'], [0.5, 'limp'], [1, 'lie']],
  tagIn: [[0, 'apron'], [1, null]],
  tagOut: [[0, 'reach'], [1, 'apron']],
  'stun:a': [[0, 'lock'], [0.45, 'grab'], [1, 'guard']],
  'stun:d': [[0, 'lock'], [0.46, 'tuck'], [1, 'limp']],
  'takedown:a': [[0, 'lock'], [0.5, 'grab'], [1, 'guard']],
  'takedown:d': [[0, 'lock'], [0.3, 'limp'], [0.6, 'lie'], [1, 'lie']],
  'takedownBig:a': [[0, 'lock'], [0.3, 'grab'], [0.62, 'kneel'], [1, 'guard']],
  'takedownBig:d': [[0, 'lock'], [0.35, 'tuck'], [0.62, 'lie'], [1, 'lie']],
  'slam:a': [[0, 'lock'], [0.2, 'grab'], [0.45, 'lift'], [0.62, 'lift'], [0.76, 'slamDown'], [1, 'guard']],
  'slam:d': [[0, 'lock'], [0.2, 'limp'], [0.6, 'limp'], [0.76, 'lie'], [1, 'lieHurt']],
  'press:a': [[0, 'lock'], [0.18, 'grab'], [0.4, 'press'], [0.74, 'press'], [0.84, 'slamDown'], [1, 'guard']],
  'press:d': [[0, 'lock'], [0.2, 'limp'], [0.4, 'fly'], [0.74, 'fly'], [0.84, 'lie'], [1, 'lieHurt']],
  'suplex:a': [[0, 'lock'], [0.25, 'grab'], [0.46, 'lift'], [0.72, 'bridge'], [1, 'lie']],
  'suplex:d': [[0, 'lock'], [0.3, 'limp'], [0.5, 'limp'], [0.72, 'lie'], [1, 'lieHurt']],
  'ddt:a': [[0, 'lock'], [0.3, 'grab'], [0.56, 'lie'], [1, 'lie']],
  'ddt:d': [[0, 'lock'], [0.3, 'tuck'], [0.56, 'lieFront'], [1, 'lieFront']],
  'bomb:a': [[0, 'lock'], [0.15, 'grab'], [0.35, 'shoulders'], [0.62, 'lift'], [0.78, 'bothKnees'], [1, 'bothKnees']],
  'bomb:d': [[0, 'lock'], [0.15, 'tuck'], [0.3, 'sitOn'], [0.64, 'sitOn'], [0.78, 'lie'], [1, 'lieHurt']],
  'neckbreaker:a': [[0, 'lock'], [0.32, 'grab'], [0.56, 'lie'], [1, 'lie']],
  'neckbreaker:d': [[0, 'lock'], [0.32, 'limp'], [0.56, 'lie'], [1, 'lieHurt']],
  'belly:a': [[0, 'lock'], [0.3, 'grab'], [0.6, 'cover'], [1, 'cover']],
  'belly:d': [[0, 'lock'], [0.3, 'limp'], [0.6, 'lie'], [1, 'lieHurt']],
  'backdrop:a': [[0, 'guard'], [0.3, 'tuck'], [0.6, 'guard'], [1, 'guard']],
  'backdrop:d': [[0, null], [0.3, 'limp'], [0.6, 'lie'], [1, 'lieHurt']],
  'subTake:a': [[0, 'lock'], [0.6, 'grab'], [1, 'holdSit']],
  'subTake:d': [[0, 'lock'], [0.6, 'lieFront'], [1, 'lieFront']],
};

/* ------------------------------------------------------------ module state */
let R = null, ARC = null, G0 = null, VFX = null, FX = null, CS = null;
const HUMQ = () => (R ? TIERS[Math.max(0, R.q)].hq : 2);

/* ------------------------------------------------------------ textures */
function matTexture() {
  return canvasTex(1024, 1024, (g, w) => {
    // the canvas: off white with the weave, wear in the middle, the apron border darker
    g.fillStyle = '#d9d4ca'; g.fillRect(0, 0, w, w);
    speckle(g, w, w, 26000, 0.06, 7, 2);
    const k = w / 7.1, cx = w / 2;
    // apron border outside the ropes
    g.fillStyle = '#1d2433'; g.fillRect(0, 0, w, (7.1 / 2 - ROPE) * k); g.fillRect(0, w - (7.1 / 2 - ROPE) * k, w, (7.1 / 2 - ROPE) * k);
    g.fillRect(0, 0, (7.1 / 2 - ROPE) * k, w); g.fillRect(w - (7.1 / 2 - ROPE) * k, 0, (7.1 / 2 - ROPE) * k, w);
    // a big centre logo
    g.save(); g.translate(cx, cx);
    g.globalAlpha = 0.9;
    g.strokeStyle = '#c4572a'; g.lineWidth = 16; g.beginPath(); g.arc(0, 0, 150, 0, TAU); g.stroke();
    g.strokeStyle = '#1f3c78'; g.lineWidth = 6; g.beginPath(); g.arc(0, 0, 176, 0, TAU); g.stroke();
    g.fillStyle = '#c4572a'; g.font = '700 150px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('RR', 0, 6);
    g.fillStyle = '#1f3c78'; g.font = '700 30px Arial, sans-serif';
    const word = PROMO.name.toUpperCase();
    for (let i = 0; i < word.length; i++) { const a = -PI * 0.92 + (i / (word.length - 1)) * PI * 0.84; g.save(); g.rotate(a + HALF); g.fillText(word[i], 0, -210); g.restore(); }
    g.restore();
    // scuffs and a little sweat darkening around the middle
    const r = rng(11);
    for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(70,55,40,' + (0.02 + r() * 0.05) + ')'; const x = cx + (r() - 0.5) * w * 0.7, y = cx + (r() - 0.5) * w * 0.7; g.beginPath(); g.ellipse(x, y, 10 + r() * 40, 4 + r() * 14, r() * PI, 0, TAU); g.fill(); }
  });
}
function apronTexture() {
  return canvasTex(1024, 192, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#15121a'); gr.addColorStop(1, '#0a080c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 3000, 0.05, 5, 2);
    g.fillStyle = '#ff7a1a'; g.fillRect(0, 10, w, 5);
    g.font = '700 58px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#7d766c'; g.fillText('RING RAJAS', w / 2, h * 0.5);
    g.font = '700 22px Arial, sans-serif'; g.fillStyle = '#ffb15c'; g.fillText(PROMO.show.toUpperCase() + '  /  ' + PROMO.short, w / 2, h * 0.84);
  }, { clamp: true });
}
function floorTexture() {
  return canvasTex(512, 512, (g, w) => { g.fillStyle = '#1a1816'; g.fillRect(0, 0, w, w); speckle(g, w, w, 9000, 0.08, 4, 3); }, { repeat: [10, 10] });
}
function ledTexture() {
  return canvasTex(1024, 48, (g, w, h) => {
    g.fillStyle = '#0a0608'; g.fillRect(0, 0, w, h);
    g.font = '700 30px Arial, sans-serif'; g.textBaseline = 'middle';
    const words = ['RING RAJAS', PROMO.show.toUpperCase(), PROMO.ppv.toUpperCase(), 'RAJA BELT'];
    let x = 10; for (let i = 0; i < 8; i++) { const t = words[i % words.length]; g.fillStyle = i % 2 ? '#ffb15c' : '#f2ebe0'; g.fillText(t, x, h / 2); x += g.measureText(t).width + 50; }
  }, { repeat: [3, 1] });
}
function screenTexture() {
  const t = canvasTex(640, 360, (g, w, h) => { g.fillStyle = '#0a0810'; g.fillRect(0, 0, w, h); }, { clamp: true });
  return t;
}
function paintScreen(t, title, sub, col, col2, k) {
  const g = t.userData.g, w = 640, h = 360;
  const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, col2 || '#120c18'); gr.addColorStop(1, '#06040a');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.save(); g.globalAlpha = 0.5; g.strokeStyle = col; g.lineWidth = 3;
  for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(-40 + i * 60, h); g.lineTo(80 + i * 60, 0); g.stroke(); }
  g.restore();
  g.fillStyle = col; g.fillRect(0, h - 16, w, 16);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 ' + (title.length > 10 ? 70 : 92) + 'px Georgia, serif'; g.fillStyle = '#ffffff';
  g.shadowColor = col; g.shadowBlur = 24; g.fillText(title, w / 2, h * 0.45); g.shadowBlur = 0;
  g.font = '600 26px Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(sub, w / 2, h * 0.72);
  void k;
  t.needsUpdate = true;
}
// A light shaft in the haze: bright near the lamp, gone by the floor, soft at its silhouette.
function beamMat(col, op) {
  const m = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { color: { value: new THREE.Color(col) }, opacity: { value: op } },
    vertexShader: 'varying float vV; varying float vF; void main(){ vV = uv.y; vec4 wp = modelMatrix * vec4(position,1.0); vec3 n = normalize(mat3(modelMatrix) * normal); vec3 v = normalize(cameraPosition - wp.xyz); vF = abs(dot(n, v)); gl_Position = projectionMatrix * viewMatrix * wp; }',
    fragmentShader: 'uniform vec3 color; uniform float opacity; varying float vV; varying float vF; void main(){ float a = pow(clamp(vV, 0.0, 1.0), 1.6) * pow(vF, 2.2) * opacity; gl_FragColor = vec4(color * a, 1.0); }',
  });
  m.userData.keepMat = true;
  Object.defineProperty(m, 'opacity', { get() { return m.uniforms.opacity.value; }, set(v) { if (m.uniforms) m.uniforms.opacity.value = v; }, configurable: true });
  m.color = m.uniforms.color.value;
  return m;
}

/* ------------------------------------------------------------ the arena */
function buildBase() {
  const S = R.S;
  // floor and ringside mats
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), std({ map: floorTexture(), roughness: 0.92, metalness: 0.02, color: '#4a4440' }));
  floor.rotation.x = -HALF; floor.receiveShadow = true; R.scene.add(floor);
  const mats = new THREE.Mesh(new THREE.PlaneGeometry(FLOOR * 2 + 0.6, FLOOR * 2 + 0.6), std({ color: '#1a2a4a', roughness: 0.85 }));
  mats.rotation.x = -HALF; mats.position.y = 0.012; mats.receiveShadow = true; R.scene.add(mats);
  // the ring: a skirted box, the mat on top
  const skirtM = std({ map: apronTexture(), roughness: 0.85 });
  const darkM = std({ color: '#0d0b0f', roughness: 0.9 });
  const ringBox = new THREE.Mesh(new THREE.BoxGeometry(APRON * 2, RH - 0.02, APRON * 2), [skirtM, skirtM, darkM, darkM, skirtM, skirtM]);
  ringBox.position.y = (RH - 0.02) / 2; ringBox.receiveShadow = true; R.scene.add(ringBox);
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(APRON * 2, APRON * 2), std({ map: matTexture(), roughness: 0.82, metalness: 0 }));
  mat.rotation.x = -HALF; mat.position.y = RH; mat.receiveShadow = true; R.scene.add(mat);
  S.mat = mat;
  // lights: a warm rig straight over the ring, cool hall fill, a dim hemisphere
  const key = new THREE.DirectionalLight('#fff0dc', 3.4);
  key.position.set(2.2, 15, 5.5); key.target.position.set(0, RH, 0);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
  const sc = key.shadow.camera; sc.left = -7; sc.right = 7; sc.top = 7; sc.bottom = -7; sc.near = 4; sc.far = 30;
  key.shadow.bias = -0.0006; key.shadow.normalBias = 0.03; key.shadow.radius = 3;
  R.scene.add(key, key.target); R.key = key;
  const hemi = new THREE.HemisphereLight('#5a6a9a', '#120d0b', 0.42); R.scene.add(hemi); R.hemi = hemi;
  const rim = new THREE.DirectionalLight('#8aa8ff', 0.7); rim.position.set(-8, 9, -12); R.scene.add(rim); R.rim = rim;
  const stageL = new THREE.PointLight('#ffb15c', 0, 26, 1.8); stageL.position.set(0, 6, STAGE_Z + 4); R.scene.add(stageL); R.stageL = stageL;
}
function ropeMat(sideAxis, sign) {
  const m = std({ vertexColors: true, roughness: 0.45, metalness: 0.05 });
  const u = { uBow: { value: 0 }, uAt: { value: 0 } };
  m.userData.u = u;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBow = u.uBow; sh.uniforms.uAt = u.uAt;
    sh.vertexShader = 'uniform float uBow; uniform float uAt; attribute float aRope;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\nfloat ru = position.' + (sideAxis === 'x' ? 'z' : 'x') + ' / ' + POST.toFixed(2) + ';\nfloat rb = (1.0 - ru * ru) * (0.55 + 0.45 * exp(-pow((ru - uAt) * 2.2, 2.0)));\ntransformed.' + sideAxis + ' += ' + (sign > 0 ? '' : '-') + 'uBow * rb * aRope;');
  };
  m.customProgramCacheKey = () => 'rope-' + sideAxis + sign;
  return m;
}
function buildRing() {
  const S = R.S;
  // posts and turnbuckle pads
  const postM = std({ color: '#8d9299', roughness: 0.32, metalness: 0.85 });
  const padCols = ['#c2272d', '#1f5fc2', '#e8e2d6', '#e8e2d6'];
  const postG = new THREE.CylinderGeometry(0.075, 0.085, RH + 1.5, 14);
  const padG = new THREE.BoxGeometry(0.2, 0.26, 0.2);
  const heights = [0.45, 0.85, 1.25];
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach((c, i) => {
    const p = new THREE.Mesh(postG, postM); p.position.set(c[0] * POST, (RH + 1.5) / 2, c[1] * POST); p.castShadow = true; R.scene.add(p);
    const pm = std({ color: padCols[i], roughness: 0.6 });
    heights.forEach((h) => { const b = new THREE.Mesh(padG, pm); b.position.set(c[0] * (POST - 0.09), RH + h, c[1] * (POST - 0.09)); b.rotation.y = Math.atan2(c[0], c[1]); R.scene.add(b); });
  });
  // ropes: one mesh per side with three ropes, bending in the vertex shader when someone hits them
  S.ropes = [];
  const ropeCols = ['#c2272d', '#f2ebe0', '#1f5fc2'];
  const sides = [['x', 1], ['x', -1], ['z', 1], ['z', -1]];
  for (const [ax, sg] of sides) {
    const parts = [];
    heights.forEach((h, hi) => {
      const g = new THREE.CylinderGeometry(0.024, 0.024, POST * 2, 8, 24, true);
      if (ax === 'x') g.rotateX(HALF); else g.rotateZ(HALF);
      g.translate(ax === 'x' ? sg * ROPE : 0, RH + h, ax === 'z' ? sg * ROPE : 0);
      const n = g.attributes.position.count, col = new Float32Array(n * 3), rp = new Float32Array(n);
      C1.set(ropeCols[hi]); for (let i = 0; i < n; i++) { col[i * 3] = C1.r; col[i * 3 + 1] = C1.g; col[i * 3 + 2] = C1.b; rp[i] = 0.6 + hi * 0.2; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aRope', new THREE.BufferAttribute(rp, 1));
      parts.push(g);
    });
    const geo = merge(parts);
    const m = ropeMat(ax, sg);
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true; mesh.frustumCulled = false; R.scene.add(mesh);
    S.ropes.push({ mesh, ax, sg, bow: 0, vel: 0, at: 0 });
  }
  // ring steps on the ramp side
  const stepM = std({ color: '#7a7f86', roughness: 0.4, metalness: 0.7 });
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(1.3, (i + 1) * 0.36, 0.42), stepM); s.position.set(-2.2, (i + 1) * 0.18, -APRON - 1.35 + i * 0.42); s.castShadow = true; s.receiveShadow = true; R.scene.add(s); }
  // barricade with an LED band, open at the ramp
  const barM = std({ color: '#141218', roughness: 0.7 });
  const led = ledTexture(); S.led = led;
  const ledM = new THREE.MeshBasicMaterial({ map: led, toneMapped: true });
  ledM.color.setScalar(1.6);
  const B = FLOOR + 0.35;
  const seg = (x, z, len, rotY) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(len, 1.05, 0.18), barM); b.position.set(x, 0.52, z); b.rotation.y = rotY; b.receiveShadow = true; R.scene.add(b);
    const l = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.26), ledM); l.position.set(x, 0.82, z); l.rotation.y = rotY; l.translateZ(0.1); R.scene.add(l);
    const l2 = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.26), ledM); l2.position.set(x, 0.82, z); l2.rotation.y = rotY + PI; l2.translateZ(0.1); R.scene.add(l2);
  };
  seg(0, B, B * 2, PI); seg(B, 0, B * 2, -HALF); seg(-B, 0, B * 2, HALF);
  seg(-(B + 2) / 2 - 0.4, -B, B - 2.4, 0); seg((B + 2) / 2 + 0.4, -B, B - 2.4, 0);
  // announce table beyond the right barricade
  const table = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.78, 3.2), std({ color: '#1a1722', roughness: 0.6 }));
  table.position.set(B + 1.3, 0.39, 0.4); table.castShadow = true; R.scene.add(table);
  const front = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 0.5), ledM); front.position.set(B + 0.79, 0.45, 0.4); front.rotation.y = -HALF; R.scene.add(front);
  for (let i = 0; i < 2; i++) { const mon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.3, 0.45), std({ color: '#0c0c10', emissive: '#2a4a8a', emissiveIntensity: 0.6 })); mon.position.set(B + 1.15, 0.95, -0.3 + i * 1.4); mon.rotation.z = 0.2; R.scene.add(mon); }
}
function merge(list) {
  let n = 0, ni = 0; for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : 0; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), rp = new Float32Array(n), idx = new Uint32Array(ni);
  let o = 0, oi = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3);
    if (g.attributes.aRope) rp.set(g.attributes.aRope.array, o);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[oi++] = a[i] + o; }
    o += c; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3)); out.setAttribute('aRope', new THREE.BufferAttribute(rp, 1));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
function buildStage() {
  const S = R.S;
  const metal = std({ color: '#3a3d44', roughness: 0.4, metalness: 0.8 });
  const dark = std({ color: '#0e0c12', roughness: 0.8 });
  // the stage deck and the ramp down to the ring
  const deck = new THREE.Mesh(new THREE.BoxGeometry(18, STAGE_Y, 7), dark); deck.position.set(0, STAGE_Y / 2, STAGE_Z - 1.6); deck.receiveShadow = true; R.scene.add(deck);
  const rampLen = (STAGE_Z + 1.9) - RAMP_END, ang = Math.atan2(STAGE_Y, -rampLen);
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.12, Math.hypot(rampLen, STAGE_Y)), std({ color: '#141018', roughness: 0.75 }));
  ramp.position.set(0, STAGE_Y / 2, (STAGE_Z + 1.9 + RAMP_END) / 2); ramp.rotation.x = ang; ramp.receiveShadow = true; R.scene.add(ramp);
  const rampLed = new THREE.Mesh(new THREE.PlaneGeometry(0.1, Math.hypot(rampLen, STAGE_Y)), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.7, 0.25) }));
  for (const sx of [-1.72, 1.72]) { const l = rampLed.clone(); l.position.set(sx, STAGE_Y / 2 + 0.07, ramp.position.z); l.rotation.x = -HALF + ang; R.scene.add(l); }
  // back wall, titantron and side screens
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 14), dark); wall.position.set(0, 7, STAGE_Z - 5.2); R.scene.add(wall);
  const tron = screenTexture(); S.tron = tron;
  const tronM = new THREE.MeshBasicMaterial({ map: tron }); tronM.color.setScalar(1.25);
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(11.2, 6.3), tronM); screen.position.set(0, 7.4, STAGE_Z - 5.1); R.scene.add(screen);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 6.3), tronM);
  for (const sx of [-9.4, 9.4]) { const s = side.clone(); s.position.set(sx, 7.4, STAGE_Z - 5.0); R.scene.add(s); }
  paintScreen(tron, 'RING RAJAS', PROMO.show + '  LIVE', '#ff7a1a', '#1a0c06');
  // truss arch with lamps
  const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.7, 2.1) });
  S.lamps = lampM;
  const tr = (x, y, z, w, h, d) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metal); b.position.set(x, y, z); R.scene.add(b); };
  tr(-8.6, 6, STAGE_Z - 0.2, 0.35, 12, 0.35); tr(8.6, 6, STAGE_Z - 0.2, 0.35, 12, 0.35); tr(0, 12, STAGE_Z - 0.2, 17.6, 0.35, 0.35);
  for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.32), lampM); l.position.set(-7.2 + i * 1.8, 11.65, STAGE_Z + 0.05); R.scene.add(l); }
  // the lighting rig above the ring: a square truss with lamps
  const ringTop = 9.2;
  tr(0, ringTop, -4.2, 8.8, 0.3, 0.3); tr(0, ringTop, 4.2, 8.8, 0.3, 0.3); tr(-4.2, ringTop, 0, 0.3, 0.3, 8.8); tr(4.2, ringTop, 0, 0.3, 0.3, 8.8);
  for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.28, 0.4), lampM); l.position.set(Math.cos(a) * 4.4, ringTop - 0.3, Math.sin(a) * 4.4); R.scene.add(l); }
  // light shafts in the haze: over the ring, and coloured ones for entrances
  const beamG = new THREE.CylinderGeometry(0.2, 1.25, 1, 24, 1, true); beamG.translate(0, -0.5, 0);
  S.beams = [];
  const mk = (x, y, z, tx, tz, len, col, op) => {
    const m = beamMat(col, op);
    const b = new THREE.Mesh(beamG, m); b.position.set(x, y, z); b.scale.set(1, len, 1);
    b.lookAt(tx, 0, tz); b.rotateX(-HALF); b.userData.base = op; b.frustumCulled = false;
    R.scene.add(b); S.beams.push(b); return b;
  };
  for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; mk(Math.cos(a) * 4.3, ringTop - 0.4, Math.sin(a) * 4.3, Math.cos(a) * 0.8, Math.sin(a) * 0.8, 8.4, '#ffe6c4', 0.05); }
  S.entBeams = [];
  for (let i = 0; i < 4; i++) { S.entBeams.push(mk(-6.3 + i * 4.2, 11.6, STAGE_Z, -1.5 + i, STAGE_Z + 7, 13, '#ffffff', 0.0)); }
  // pyro mouths on the stage lip
  S.pyro = [[-6.5, STAGE_Y, STAGE_Z + 1.4], [-3.2, STAGE_Y, STAGE_Z + 1.6], [-1.25, STAGE_Y, STAGE_Z + 0.4], [1.25, STAGE_Y, STAGE_Z + 0.4], [3.2, STAGE_Y, STAGE_Z + 1.6], [6.5, STAGE_Y, STAGE_Z + 1.4]];
  for (const p of S.pyro) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.3, 10), metal); m.position.set(p[0], p[1] + 0.15, p[2]); R.scene.add(m); }
}
function buildCrowd() {
  const S = R.S;
  const rows = 11, rowD = 0.82, rowH = 0.44, inner = 9.3;
  const members = [];
  const block = (origin, along, per, seed) => crowdRows({ origin, along, rows, perRow: per, seatW: 0.62, rowD, rowH, face: [0, RH, 0], fill: 0.93, seed });
  const sets = [
    block([-12.4, 0.5, inner], [1, 0], 40, 3),
    block([inner, 0.5, 12.4], [0, -1], 36, 5),
    block([-inner, 0.5, -10.4], [0, 1], 36, 7),
    block([-12.4, 0.5, -inner - 0.6], [1, 0], 13, 9),
    block([4.4, 0.5, -inner - 0.6], [1, 0], 13, 11),
  ];
  // front rows first, so a lower tier can drop the back rows by count
  const per = sets.map((s) => s.slice());
  const byRow = [];
  for (const s of per) for (const m of s) byRow.push(m);
  byRow.sort((a, b) => a.y - b.y);
  for (const m of byRow) members.push({ x: m.x, y: m.y, z: m.z, yaw: m.yaw, scale: 0.94 + ((m.x * 13.7 + m.z * 7.1) % 1 + 1) % 1 * 0.12 });
  const crowd = createCrowd({ members, unit: 1, seed: 21, quality: Math.min(2, HUMQ()), colors: ['#ff7a1a', '#2ab8ff', '#f2c230', '#c2272d', '#f4f1ea', '#b06bff'], teamShare: 0.35 });
  crowd.mesh.userData.keepMat = true; crowd.mesh.frustumCulled = false;
  R.scene.add(crowd.mesh);
  S.crowd = crowd; S.crowdN = members.length;
  // stepped risers under every block
  const riseM = std({ color: '#17151b', roughness: 0.9 });
  // all the risers in one mesh: one draw call
  const steps = [], tmp = new THREE.Object3D();
  const riser = (cx, cz, w, rotY) => { for (let j = 0; j < rows; j++) { const g = new THREE.BoxGeometry(w, 0.44, rowD); tmp.position.set(cx, 0.22 + j * rowH, cz); tmp.rotation.set(0, rotY, 0); tmp.translateZ(j * rowD); tmp.updateMatrix(); g.applyMatrix4(tmp.matrix); steps.push(g); } };
  riser(0, inner + 0.3, 26, 0);
  riser(inner + 0.3, 0, 23, HALF); riser(-inner - 0.3, 0, 23, -HALF);
  riser(-8.2, -inner - 0.3, 8.6, PI); riser(8.2, -inner - 0.3, 8.6, PI);
  const stands = new THREE.Mesh(merge(steps), riseM); stands.receiveShadow = true; R.scene.add(stands);
  // camera flashes in the stands
  const fg = new THREE.BufferGeometry();
  const N = 90, pos = new Float32Array(N * 3), r = rng(5);
  for (let i = 0; i < N; i++) { const m = members[(r() * members.length) | 0]; pos[i * 3] = m.x; pos[i * 3 + 1] = m.y + 1.3; pos[i * 3 + 2] = m.z; }
  fg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const fs = new Float32Array(N); fg.setAttribute('aOn', new THREE.BufferAttribute(fs, 1));
  const fm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uS: { value: 260 } },
    vertexShader: 'attribute float aOn; varying float vOn; uniform float uS; void main(){ vOn = aOn; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = uS * aOn / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vOn; void main(){ vec2 p = gl_PointCoord * 2.0 - 1.0; float d = dot(p,p); float a = exp(-d * 5.0) + 0.6 * exp(-abs(p.x) * 30.0) * exp(-abs(p.y) * 2.0) + 0.6 * exp(-abs(p.y) * 30.0) * exp(-abs(p.x) * 2.0); gl_FragColor = vec4(vec3(1.0, 0.97, 0.92) * a * vOn, 1.0); }' });
  const flashes = new THREE.Points(fg, fm); flashes.frustumCulled = false; R.scene.add(flashes);
  S.flashes = { mesh: flashes, on: fs, attr: fg.attributes.aOn, n: N, rate: 0 };
}
function buildStaff() {
  const S = R.S;
  const q = HUMQ();
  const ref = createHuman({ seed: 404, sex: 'm', build: REF.build, height: REF.height, skin: REF.skin, hair: REF.hair, hairColor: REF.hairColor, quality: q, unit: 1,
    outfit: { top: '#e8e2d6', top2: '#16161b', sleeves: 'short', bottom: '#16161b', legs: 'trousers', shoes: '#111', soles: '#222' } });
  S.ref = makeRig(ref, { def: { height: REF.height } });
  R.scene.add(S.ref.root);
  // commentators at the table and the timekeeper with the bell
  const B = FLOOR + 0.35;
  S.staff = [];
  const seat = (seed, x, z, yaw, top) => {
    const h = createHuman({ seed, quality: Math.min(1, q), lod: q >= 2 ? 'mid' : 'far', unit: 1, castShadow: false, outfit: { top, sleeves: 'long', bottom: '#20232b', legs: 'trousers' } });
    h.group.position.set(x, 0, z); h.group.rotation.y = yaw; h.play('sit', { hold: true });
    R.scene.add(h.group); S.staff.push(h);
  };
  seat(77, B + 2.1, -0.4, -HALF, '#2a3a5a'); seat(78, B + 2.1, 1.2, -HALF, '#5a2a3a'); seat(79, B + 1.9, -2.1, -HALF + 0.3, '#2a2a2e');
}

/* ------------------------------------------------------------ rigs */
function makeRig(h, w) {
  const root = new THREE.Group(), pivot = new THREE.Group();
  pivot.rotation.order = 'YXZ';
  root.add(pivot); pivot.add(h.group);
  const ph = PHf(w);
  h.group.position.y = -ph; pivot.position.y = ph;
  return { root, pivot, hum: h, ph, lastAnim: '', xf: 1, snap: new Float32Array(PK.length * 3), look: new THREE.Vector3(), rec: null, playedT: '', mood: 0, actT: 0, trail: null };
}
const RIGS = new Map();
function rigFor(w) {
  const keyId = w.def.id + (w.alt ? ':alt' : '');
  let rig = RIGS.get(keyId);
  if (!rig) {
    const d = w.def;
    const h = createHuman({ seed: d.id.length * 97 + d.kg, sex: d.sex, build: d.build, height: d.height, skin: d.skin, hair: d.hair, hairColor: d.hairColor, age: d.age, quality: HUMQ(), unit: 1, outfit: w.outfit });
    h.mesh.castShadow = R.q >= 1;
    rig = makeRig(h, w);
    if (d.mask) {
      const mm = std({ color: d.mask, roughness: 0.45 });
      const mask = new THREE.Mesh(new THREE.SphereGeometry(0.112, 18, 12, 0, TAU, 0, PI * 0.72), mm); mask.position.set(0, 0.105, 0.006); mask.scale.set(0.92, 1.04, 1.04);
      h.bones.head.add(mask);
      const eyeM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.6, 3.0) });
      for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), eyeM); e.scale.set(1.6, 0.6, 0.5); e.position.set(sx * 0.034, 0.103, 0.098); h.bones.head.add(e); }
    }
    RIGS.set(keyId, rig);
  }
  return rig;
}
function setMatch(G) {
  const S = R.S;
  for (const r of RIGS.values()) { if (r.root.parent) r.root.parent.remove(r.root); r.w = null; }
  S.rigs = [];
  for (const w of G.W) { const r = rigFor(w); r.w = w; r.lastAnim = ''; r.rec = r.rec || newRec(); r.rec.n = 0; R.scene.add(r.root); S.rigs[w.i] = r; }
  if (CS) { CS.mesh.count = 0; }
  if (S.belt && S.belt.parent) S.belt.parent.remove(S.belt);
  S.recT = 0; S.recRef = S.ref.rec = S.ref.rec || newRec(); S.ref.rec.n = 0;
  G0 = G;
  R.camInit = false;
  paintScreen(S.tron, 'RING RAJAS', G.cfg.attract ? PROMO.show + '  LIVE' : matchTitle(G), '#ff7a1a', '#1a0c06');
}
function matchTitle(G) { return ({ single: 'One on one', tag: 'Tag team', triple: 'Triple threat', elim: 'Elimination' }[G.cfg.match] || 'Training') + '  LIVE'; }

/* ------------------------------------------------------------ posing */
function blendPose(h, A, B, k, w) {
  if (w <= 0.001) return;
  const bn = h.bones;
  for (let i = 0; i < PK.length; i++) {
    const key = PK[i], a = A ? A[key] : undefined, b = B ? B[key] : undefined;
    if (a === undefined && b === undefined) continue;
    const bone = bn[PB[key]], r = bone.rotation;
    if (typeof (a === undefined ? b : a) === 'number') {
      const va = a === undefined ? r.x : a, vb = b === undefined ? r.x : b;
      r.x = lerp(r.x, lerp(va, vb, k), w);
    } else {
      const ax = a ? a[0] : r.x, ay = a ? a[1] : r.y, az = a ? a[2] : r.z;
      const bx = b ? b[0] : r.x, by = b ? b[1] : r.y, bz = b ? b[2] : r.z;
      r.x = lerp(r.x, lerp(ax, bx, k), w); r.y = lerp(r.y, lerp(ay, by, k), w); r.z = lerp(r.z, lerp(az, bz, k), w);
    }
  }
}
function upperOnly(p) { if (!p) return p; if (!p.__up) { const o = {}; for (const k in p) if (UPPER[k]) o[k] = p[k]; p.__up = o; } return p.__up; }
function program(h, keys, k, w, upper) {
  let i = 0; while (i < keys.length - 2 && k > keys[i + 1][0]) i++;
  const a = keys[i], b = keys[Math.min(i + 1, keys.length - 1)];
  const kk = b[0] > a[0] ? smooth01((k - a[0]) / (b[0] - a[0])) : 1;
  const A = a[1] ? P[a[1]] : null, B = b[1] ? P[b[1]] : null;
  blendPose(h, upper ? upperOnly(A) : A, upper ? upperOnly(B) : B, kk, w);
}
function snapshot(rig) { const bn = rig.hum.bones; for (let i = 0; i < PK.length; i++) { const r = bn[PB[PK[i]]].rotation; rig.snap[i * 3] = r.x; rig.snap[i * 3 + 1] = r.y; rig.snap[i * 3 + 2] = r.z; } }
function crossfade(rig) {
  if (rig.xf >= 1) return;
  const bn = rig.hum.bones, f = smooth01(rig.xf);
  for (let i = 0; i < PK.length; i++) { const r = bn[PB[PK[i]]].rotation; r.x = lerp(rig.snap[i * 3], r.x, f); r.y = lerp(rig.snap[i * 3 + 1], r.y, f); r.z = lerp(rig.snap[i * 3 + 2], r.z, f); }
}
const HUMAN_ONESHOT = { taunt: 1, celebrate: 1, slump: 1, stagger: 1, kick: 1, roundkick: 1, superkick: 1, kickFlurry: 1, bigboot: 1 };
function onAnimStart(rig, w, G) {
  const h = rig.hum, a = w.anim;
  if (a === 'taunt') h.play(w.def.taunt || 'fistPump', { intensity: 1 });
  else if (a === 'celebrate') { h.play(pickCele(w, G), {}); rig.actT = 2.2; }
  else if (a === 'slump') h.play('slump', {});
  else if (a === 'stagger') h.play('stumble', { intensity: 0.9 });
  else if (a === 'kick' || a === 'bigboot') h.play('kick', { speed: 1.25, intensity: 0.9 });
  else if (a === 'roundkick' || a === 'superkick') h.play('kick', { speed: a === 'superkick' ? 1.05 : 1.15 });
  else if (a === 'kickFlurry') { h.play('kick', { speed: 1.6 }); setTimeout(() => { if (rig.w === w && w.anim === 'kickFlurry') h.play('kick', { speed: 1.6, side: 'left' }); }, 420); }
  else if (a === 'kickout') h.play('stumble', { intensity: 0.4 });
}
function pickCele(w, G) { return G && G.winner === w && G.cfg.match !== 'single' ? 'celebrate' : (w.def.taunt === 'clap' ? 'cheer' : 'celebrate'); }
const LOOKV = new THREE.Vector3();
function poseRig(rig, w, dt, G) {
  const h = rig.hum;
  // the body: root at the floor point, pivot at the pelvis
  rig.root.position.set(w.x, w.yb, w.z);
  rig.root.rotation.y = w.yaw;
  rig.pivot.position.y = Math.max(0.08, w.h * rig.ph);
  rig.pivot.rotation.set(w.pitch, w.yawOff || 0, w.roll || 0);
  if (w.anim !== rig.lastAnim) {
    snapshot(rig); rig.xf = 0;
    rig.lastAnim = w.anim; onAnimStart(rig, w, G);
  }
  rig.xf = Math.min(1, rig.xf + dt / 0.14);
  // where to look
  const T = w.target;
  let look = null;
  if (T && !T.hidden) { LOOKV.set(T.x, T.yb + T.h * PHf(T) + 0.6, T.z); look = LOOKV; }
  else if (G && G.phase === 'entrance') { LOOKV.set(w.x + Math.sin(w.yaw) * 5, w.yb + 1.6, w.z + Math.cos(w.yaw) * 5); look = LOOKV; }
  const a = w.anim;
  const moving = a === 'walk' || a === 'run' || a === 'idle';
  h.setMood(clamp(w.mom / 110 - w.dmg / 130 + (w.fired || 0) * 0.3, -1, 1));
  h.update(dt, { speed: moving ? w.speed : 0, turn: moving ? undefined : 0, look });
  const k = w.ak || 0, inRing = !w.out && !w.apron && w.yb > 0.5;
  // the wrestling layer
  if (w.apron) program(h, [[0, w.reach ? 'reach' : 'apron'], [1, w.reach ? 'reach' : 'apron']], 0, 1);
  else if (KEYS[a]) program(h, KEYS[a], k, 1);
  else if (a === 'idle') { if (inRing && !w.hidden && G && G.phase !== 'entrance') blendPose(h, P.guardLegs, null, 0, w.st === 'idle' ? 0.75 : 0.4); }
  else if (a === 'walk') { if (inRing && G && G.phase !== 'entrance') blendPose(h, upperOnly(P.guard), null, 0, 0.6); }
  else if (a === 'lock') blendPose(h, P.lock, null, 0, 1);
  else if (a === 'down') blendPose(h, w.dmg > 55 ? P.lieHurt : P.lie, null, 0, 1);
  else if (a === 'downFront') blendPose(h, P.lieFront, null, 0, 1);
  else if (a === 'pinned') blendPose(h, P.lie, null, 0, 1);
  else if (a === 'kickout') blendPose(h, P.kickout, null, 0, 1 - smooth01(w.t / 0.7));
  else if (a === 'cover') blendPose(h, P.cover, null, 0, 1);
  else if (a === 'bridge') blendPose(h, P.bridge, null, 0, 1);
  else if (a === 'perch') blendPose(h, P.perch, null, 0, 1);
  else if (a === 'splash' || a === 'crossbody') blendPose(h, P.fly, null, 0, 1);
  else if (a === 'elbowDive') blendPose(h, P.elbowFly, null, 0, 1);
  else if (a === 'stagger') blendPose(h, upperOnly(P.limp), null, 0, 0.35);
  else if (a.indexOf('hold:') === 0) {
    const hold = a.indexOf('legLock') > 0 ? 'legLock' : a.indexOf('armLock') > 0 ? 'armLock' : 'sitLock', role = a.charAt(a.length - 1);
    const pose = role === 'a' ? (hold === 'legLock' ? P.holdLeg : hold === 'armLock' ? P.holdArm : P.holdSit) : (hold === 'legLock' ? P.heldLeg : hold === 'armLock' ? P.heldArm : P.heldSit);
    blendPose(h, pose, null, 0, 1);
    // the struggle: a shake on both
    const s = Math.sin(R.time * 17 + w.i) * 0.06; h.bones.chest.rotation.z += s; h.bones.head.rotation.y += s * 2;
  }
  else if (a === 'celebrate') { if (G && G.beltTo === w) blendPose(h, P.beltUp, null, 0, 1); else if (rig.actT <= 0 && !h.playing()) { h.play(pickCele(w, G), {}); rig.actT = 2.4; } }
  rig.actT -= dt;
  crossfade(rig);
}
function poseRef(dt, G) {
  const r = G.ref, rig = R.S.ref, h = rig.hum;
  rig.root.position.set(r.x, RH, r.z); rig.root.rotation.y = r.yaw;
  let ph = 1, pitch = 0;
  if (r.anim === 'count') { ph = 0.58; pitch = 0.55; }
  else if (r.anim === 'sub') { ph = 0.62; pitch = 0.45; }
  rig.refH = lerp(rig.refH || 1, ph, damp(10, dt)); rig.refP = lerp(rig.refP || 0, pitch, damp(10, dt));
  rig.pivot.position.y = rig.refH * rig.ph; rig.pivot.rotation.set(rig.refP, 0, 0);
  if (r.anim !== rig.lastAnim) { snapshot(rig); rig.xf = 0; rig.lastAnim = r.anim; }
  rig.xf = Math.min(1, rig.xf + dt / 0.18);
  if (G.pin) { LOOKV.set(G.pin.d.x, RH + 0.2, G.pin.d.z); }
  else if (r.look) LOOKV.set(r.look.x, RH + 1.2, r.look.z);
  else LOOKV.set(0, RH + 1.2, 0);
  h.update(dt, { speed: r.speed, look: LOOKV, turn: r.anim === 'count' ? 0 : undefined });
  if (r.anim === 'count') { blendPose(h, P.refKneel, null, 0, 1); blendPose(h, P.refCountUp, P.refCountDn, r.slap > 0.2 ? smooth01((0.3 - r.slap) / 0.1) : r.slap > 0 ? smooth01(r.slap / 0.2) : 0, 1); }
  else if (r.anim === 'sub') { blendPose(h, P.refKneel, null, 0, 0.8); blendPose(h, P.refSub, null, 0, 1); }
  else if (r.anim === 'cout') { blendPose(h, P.refPoint, null, 0, 1); h.bones.elbowR.rotation.x = -0.1 - Math.max(0, Math.sin(R.time * 6)) * 0.9; }
  else if (r.anim === 'raise') blendPose(h, P.refRaise, null, 0, 1);
  crossfade(rig);
}

/* ------------------------------------------------------------ holding a body
 * A lift is only believable when the held wrestler is in the lifter's hands.
 * For every move where one wrestler carries another, each frame: the lifter's
 * arms are solved toward the held body (elbow bend from the reach, then the
 * shoulder swung so the hand lands on it), and the held body is then moved so
 * its grip point sits exactly in the socket between the two hands.
 * w: [grip starts, full grip, still full, released] in the move's normalised time.
 */
const HOLD = {
  slam: { bone: 'spine', w: [0.12, 0.24, 0.66, 0.74], spread: 0.17 },
  press: { bone: 'spine', w: [0.12, 0.27, 0.76, 0.81], spread: 0.2 },
  bomb: { bone: 'pelvis', w: [0.1, 0.25, 0.68, 0.76], spread: 0.19 },
  suplex: { bone: 'spine', w: [0.18, 0.3, 0.58, 0.66], spread: 0.15 },
  belly: { bone: 'spine', w: [0.14, 0.25, 0.52, 0.6], spread: 0.16 },
  takedownBig: { bone: 'pelvis', w: [0.2, 0.3, 0.5, 0.58], spread: 0.15 },
};
const HV = { a: new THREE.Vector3(), s: new THREE.Vector3(), e: new THREE.Vector3(), h: new THREE.Vector3(), t: new THREE.Vector3(), l: new THREE.Vector3(), r: new THREE.Vector3(), k: new THREE.Vector3(), u: new THREE.Vector3(), v: new THREE.Vector3() };
const HQ = { d: new THREE.Quaternion(), w: new THREE.Quaternion(), p: new THREE.Quaternion(), l: new THREE.Quaternion() };
function holdWeight(k, w) { return k <= w[0] || k >= w[3] ? 0 : k < w[1] ? smooth01((k - w[0]) / (w[1] - w[0])) : k > w[2] ? 1 - smooth01((k - w[2]) / (w[3] - w[2])) : 1; }
function solveArm(rig, side, T, wt) {
  const b = rig.hum.bones, sh = b['shoulder' + side], el = b['elbow' + side], fi = b['fingers' + side];
  rig.root.updateMatrixWorld(true);
  sh.getWorldPosition(HV.s); el.getWorldPosition(HV.e); fi.getWorldPosition(HV.h);
  const up = HV.s.distanceTo(HV.e), lo = HV.e.distanceTo(HV.h);
  const d = clamp(HV.s.distanceTo(T), Math.abs(up - lo) + 0.04, up + lo - 0.01);
  const inner = Math.acos(clamp((up * up + lo * lo - d * d) / (2 * up * lo), -1, 1));
  el.rotation.x = lerp(el.rotation.x, -(PI - inner), wt);
  sh.updateMatrixWorld(true);
  fi.getWorldPosition(HV.h);
  HV.u.copy(HV.h).sub(HV.s).normalize(); HV.v.copy(T).sub(HV.s).normalize();
  HQ.d.setFromUnitVectors(HV.u, HV.v);
  sh.getWorldQuaternion(HQ.w); sh.parent.getWorldQuaternion(HQ.p);
  HQ.l.copy(HQ.p).invert().multiply(HQ.d.multiply(HQ.w));
  sh.quaternion.slerp(HQ.l, wt);
}
function holdPass(G) {
  const S = R.S;
  for (const w of G.W) {
    const m = w.move;
    if (!m || m.a !== w || w.st !== 'move') continue;
    const H = HOLD[m.id]; if (!H) continue;
    const wt = holdWeight(w.ak || 0, H.w); if (wt <= 0.001) continue;
    const ra = S.rigs[w.i], rd = S.rigs[m.d.i]; if (!ra || !rd) continue;
    rd.root.updateMatrixWorld(true);
    rd.hum.bones[H.bone].getWorldPosition(HV.a);
    // the lifter's right is world -x when facing +z
    HV.r.set(-Math.cos(w.yaw), 0, Math.sin(w.yaw));
    HV.t.copy(HV.a).addScaledVector(HV.r, H.spread); solveArm(ra, 'R', HV.t, wt);
    HV.t.copy(HV.a).addScaledVector(HV.r, -H.spread); solveArm(ra, 'L', HV.t, wt);
    ra.root.updateMatrixWorld(true);
    ra.hum.bones.fingersR.getWorldPosition(HV.k); ra.hum.bones.fingersL.getWorldPosition(HV.l);
    HV.k.add(HV.l).multiplyScalar(0.5);
    // the grip socket: the held body is pinned to it
    rd.root.position.addScaledVector(HV.k.sub(HV.a), wt);
    rd.root.updateMatrixWorld(true);
  }
}

/* ------------------------------------------------------------ replay recording */
const RECN = 320, RB = PK.length; // frames kept, bones recorded per rig
const RECB = ['shoulderR', 'shoulderL', 'elbowR', 'elbowL', 'hipR', 'hipL', 'kneeR', 'kneeL', 'spine', 'chest', 'neck', 'head', 'wristR', 'wristL', 'pelvis', 'ankleL', 'ankleR', 'root'];
const RS = 7 + RECB.length * 4;
function newRec() { return { buf: new Float32Array(RECN * RS), t: new Float32Array(RECN), n: 0, head: 0 }; }
function recRig(rec, rig, time) {
  const o = rec.head * RS, b = rec.buf;
  b[o] = rig.root.position.x; b[o + 1] = rig.root.position.y; b[o + 2] = rig.root.position.z; b[o + 3] = rig.root.rotation.y;
  b[o + 4] = rig.pivot.position.y; b[o + 5] = rig.pivot.rotation.x; b[o + 6] = rig.pivot.rotation.z;
  const bn = rig.hum.bones;
  for (let i = 0; i < RECB.length; i++) { const q = (bn[RECB[i]] || rig.hum.bones.root).quaternion; const p = o + 7 + i * 4; b[p] = q.x; b[p + 1] = q.y; b[p + 2] = q.z; b[p + 3] = q.w; }
  rec.t[rec.head] = time; rec.head = (rec.head + 1) % RECN; rec.n = Math.min(RECN, rec.n + 1);
}
const QA = new THREE.Quaternion(), QB = new THREE.Quaternion();
function playRig(rec, rig, time) {
  if (!rec || rec.n < 2) return false;
  // find the two frames around time
  let lo = -1;
  for (let i = 0; i < rec.n; i++) { const idx = (rec.head - 1 - i + RECN) % RECN; if (rec.t[idx] <= time) { lo = idx; break; } }
  if (lo < 0) lo = (rec.head - rec.n + RECN) % RECN;
  const hi = (lo + 1) % RECN;
  const useHi = hi !== rec.head && rec.t[hi] > rec.t[lo];
  const f = useHi ? clamp((time - rec.t[lo]) / (rec.t[hi] - rec.t[lo]), 0, 1) : 0;
  const b = rec.buf, o = lo * RS, o2 = (useHi ? hi : lo) * RS;
  rig.root.position.set(lerp(b[o], b[o2], f), lerp(b[o + 1], b[o2 + 1], f), lerp(b[o + 2], b[o2 + 2], f));
  rig.root.rotation.y = b[o + 3] + Math.atan2(Math.sin(b[o2 + 3] - b[o + 3]), Math.cos(b[o2 + 3] - b[o + 3])) * f;
  rig.pivot.position.y = lerp(b[o + 4], b[o2 + 4], f); rig.pivot.rotation.x = lerp(b[o + 5], b[o2 + 5], f); rig.pivot.rotation.z = lerp(b[o + 6], b[o2 + 6], f);
  const bn = rig.hum.bones;
  for (let i = 0; i < RECB.length; i++) {
    const p = o + 7 + i * 4, p2 = o2 + 7 + i * 4;
    QA.set(b[p], b[p + 1], b[p + 2], b[p + 3]); QB.set(b[p2], b[p2 + 1], b[p2 + 2], b[p2 + 3]); QA.slerp(QB, f);
    const bone = bn[RECB[i]]; if (bone) bone.quaternion.copy(QA);
  }
  return true;
}

/* ------------------------------------------------------------ the TV director */
const CAM = { pos: new THREE.Vector3(0, 7, 12), tgt: new THREE.Vector3(0, RH + 1, 0), fov: 46, shot: 'hard', shotT: 0, hardYaw: PI, side: 1 };
const FOC = new THREE.Vector3(), WANTP = new THREE.Vector3(), WANTT = new THREE.Vector3();
function activeFocus(G, out) {
  let n = 0, x = 0, z = 0, y = 0, minX = 9, maxX = -9, minZ = 9, maxZ = -9;
  for (const w of G.W) {
    if (w.hidden || w.gone || w.elim || w.apron) continue;
    x += w.x; z += w.z; y += w.yb; n++;
    minX = Math.min(minX, w.x); maxX = Math.max(maxX, w.x); minZ = Math.min(minZ, w.z); maxZ = Math.max(maxZ, w.z);
  }
  if (!n) { out.set(0, RH, 0); return 2.5; }
  out.set(x / n, y / n, z / n);
  return Math.max(2.4, Math.hypot(maxX - minX, maxZ - minZ) / 2 + 1.4);
}
function frameDistance(half, fovDeg, aspect) {
  const v = fovDeg * PI / 180, hf = Math.atan(Math.tan(v / 2) * aspect);
  return Math.max(half / Math.tan(hf), half * 0.9 / Math.tan(v / 2));
}
function director(G, dt, a) {
  const cam = R.camera, aspect = a.w / Math.max(1, a.h), portrait = aspect < 0.85;
  const baseFov = portrait ? 54 : aspect < 1.25 ? 50 : 42;
  let shot = 'hard', cut = false;
  const big = G.W.find((w) => w.move && w.move.a === w && (w.move.fin || w.move.sig));
  const flyer = G.W.find((w) => w.st === 'fly' || w.st === 'perch' || (w.st === 'solo' && w.solo && w.solo.name === 'climb'));
  if (G.phase === 'story') shot = 'wide';
  else if (G.phase === 'entrance' && G.entGroup) shot = G.entT < 1.4 ? 'stage' : 'ramp';
  else if (G.phase === 'replay') shot = 'replay';
  else if (G.phase === 'post') shot = 'post';
  else if (G.cfg.attract) shot = 'attract';
  else if (big) shot = 'tight';
  else if (G.pin || G.sub) shot = 'pin';
  else if (flyer && !G.cfg.attract) shot = 'fly';
  else if (G.P && G.P.out) shot = 'floor';
  if (R.forceShot) shot = R.forceShot;
  if (shot !== CAM.shot) {
    // cut on the action, glide on the rest
    cut = (shot === 'tight' || shot === 'replay' || CAM.shot === 'replay' || shot === 'stage' || CAM.shot === 'stage' || (CAM.shot === 'tight' && shot === 'pin')) && !a.reducedMotion;
    if (shot === 'tight') CAM.side = -CAM.side;
    CAM.shot = shot; CAM.shotT = 0;
  }
  CAM.shotT += dt;
  const half = activeFocus(G, FOC);
  let fov = baseFov, rate = 3.2;
  if (shot === 'hard' || shot === 'floor' || shot === 'wide' || shot === 'attract') {
    const fx = FOC.x, fz = FOC.z;
    const drift = shot === 'attract' || shot === 'wide' ? Math.sin(R.time * 0.08) * 0.6 : 0;
    const yaw = PI + clamp(fx * 0.05, -0.18, 0.18) + drift;
    CAM.hardYaw = lerp(CAM.hardYaw, yaw, damp(1.5, dt));
    const D = clamp(frameDistance(half + (portrait ? 0.4 : 1.0), fov, aspect), 8, portrait ? 17 : 15) * (shot === 'wide' ? 1.25 : 1);
    const elev = portrait ? 0.58 : 0.42;
    WANTT.set(fx * 0.85, FOC.y + 1.0 + (portrait ? 0.3 : 0), fz * 0.72 + (portrait ? 0.5 : 0));
    WANTP.set(WANTT.x - Math.sin(CAM.hardYaw) * D, WANTT.y + D * elev, WANTT.z - Math.cos(CAM.hardYaw) * D);
    rate = 2.4;
  } else if (shot === 'close') {
    WANTT.set(FOC.x, FOC.y + 0.8, FOC.z);
    WANTP.set(FOC.x + 1.2, FOC.y + 1.9, FOC.z + (portrait ? 6.2 : 4.4));
    rate = 9;
  } else if (shot === 'tight') {
    const w = big, m = w.move, o = m.d;
    FOC.set((w.x + o.x) / 2, w.yb, (w.z + o.z) / 2);
    const ax = Math.sin(w.yaw), az = Math.cos(w.yaw);
    const sx = az * CAM.side, sz = -ax * CAM.side;
    const low = m.fin ? (portrait ? 2.1 : 0.85) : (portrait ? 2.2 : 1.5);
    const D = portrait ? 6.4 : 4.6;
    WANTT.set(FOC.x, FOC.y + 1.15, FOC.z);
    WANTP.set(FOC.x + sx * D - ax * 1.2, FOC.y + low, FOC.z + sz * D - az * 1.2);
    if (WANTP.z < -3.4) WANTP.z = -3.4;
    fov = baseFov + (m.fin ? 6 : 0); rate = 4.5;
  } else if (shot === 'pin') {
    const p = G.pin || G.sub, d = p.d;
    FOC.set(d.x, d.yb, d.z);
    const D = portrait ? 6.2 : 4.6;
    const cx = FOC.x > 0 ? -1 : 1;
    WANTT.set(FOC.x, FOC.y + 0.6, FOC.z);
    WANTP.set(FOC.x + cx * D * 0.55, FOC.y + 2.2, FOC.z + D * 0.85);
    rate = 3;
  } else if (shot === 'fly') {
    const w = flyer;
    WANTT.set(lerp(w.x, FOC.x, 0.4), w.yb + 0.8, lerp(w.z, FOC.z, 0.4));
    const D = portrait ? 9.5 : 7.2;
    WANTP.set(WANTT.x + (WANTT.x > 0 ? -2.5 : 2.5), WANTT.y + 2.2, WANTT.z + D);
    rate = 2.6;
  } else if (shot === 'stage' || shot === 'ramp') {
    // the entrant fills about a third of the frame, the pyro either side of them
    const w = G.entGroup[0], n = G.entGroup.length;
    const cx = n > 1 ? (G.entGroup[0].x + G.entGroup[1].x) / 2 : w.x;
    const D = 2.75 * (n > 1 ? 1.35 : 1) / Math.tan(fov * PI / 360);
    if (shot === 'stage') {
      const s = Math.min(1, CAM.shotT / 1.4);
      WANTT.set(cx, w.yb + 1.3, w.z);
      WANTP.set(cx + 0.7 - s * 0.4, w.yb + 1.45, w.z + D * (1.12 - 0.12 * s));
      rate = 2.4;
    } else {
      WANTT.set(cx, w.yb + 1.3, w.z);
      WANTP.set(cx + 0.6, Math.max(w.yb + 1.5, w.z > -8 ? RH + 1.7 : 0), Math.min(w.z + D, -3.9));
      rate = 2.6;
    }
  } else if (shot === 'replay') {
    const s = CAM.shotT, rp = R.S.replayFoc || FOC;
    const ang = R.S.replayAng + s * 0.22;
    const D = portrait ? 7.4 : 5.4;
    WANTT.set(rp.x, rp.y + 0.9, rp.z);
    WANTP.set(rp.x + Math.sin(ang) * D, rp.y + (portrait ? 2.3 : 1.1) + s * 0.12, rp.z + Math.cos(ang) * D);
    fov = baseFov - 4; rate = 6;
  } else if (shot === 'post') {
    const w = G.winner || G.P;
    const s = CAM.shotT;
    WANTT.set(w.x, w.yb + 1.3, w.z);
    const ang = w.yaw + 0.5 + s * 0.12;
    const D = portrait ? 6.8 : 4.8;
    WANTP.set(w.x + Math.sin(ang) * D, w.yb + 1.0 + s * 0.08, w.z + Math.cos(ang) * D);
    rate = 2;
  }
  if (!R.camInit || cut) { CAM.pos.copy(WANTP); CAM.tgt.copy(WANTT); CAM.fov = fov; R.camInit = true; if (cut && FX && !a.reducedMotion) FX.flash(0.08, '#ffffff'); }
  else {
    const k = damp(a.reducedMotion ? rate * 0.7 : rate, dt);
    CAM.pos.lerp(WANTP, k); CAM.tgt.lerp(WANTT, damp(rate * 1.4, dt)); CAM.fov = lerp(CAM.fov, fov, damp(3, dt));
  }
  // keep the lens above the floor and out of the posts
  if (CAM.pos.y < 0.6) CAM.pos.y = 0.6;
  cam.position.copy(CAM.pos);
  cam.position.x += (a.shakeX || 0) * 0.01; cam.position.y += (a.shakeY || 0) * 0.01;
  cam.fov = CAM.fov; cam.updateProjectionMatrix();
  cam.lookAt(CAM.tgt);
}

/* ------------------------------------------------------------ effects on events */
function event(type, d, G) {
  if (!R || !R.built || !G0) return;
  const S = R.S, a = ARC, rm = a ? a.reducedMotion : false;
  if (type === 'rope') {
    const rope = S.ropes.find((r) => (r.ax === 'x' && Math.abs(d.x) > 2.5 && Math.sign(d.x) === r.sg) || (r.ax === 'z' && Math.abs(d.z) > 2.5 && Math.sign(d.z) === r.sg));
    if (rope) { rope.vel -= 2.6; rope.at = rope.ax === 'x' ? d.z / POST : d.x / POST; }
    if (VFX) VFX.dust(V1.set(d.x, RH + 0.05, d.z), { size: 0.4 });
  } else if (type === 'impact') {
    if (!VFX) return;
    V1.set(d.x, (d.y || 0) + 0.06, d.z);
    VFX.impact(V1, UPV, { kind: 'dust', size: d.big >= 3 ? 1.5 : d.big >= 2 ? 1.1 : 0.75, color: '#d8cfc0' });
    if (d.big >= 2) { VFX.ring(V1, d.big >= 3 ? '#ffd89a' : '#ffffff', { size: d.big >= 3 ? 2.6 : 1.6, kind: 'shock' }); VFX.shake(d.big >= 3 ? 0.55 : 0.3); }
    if (d.big >= 3) {
      if (!rm && !G.cfg.attract) VFX.timeWarp(0.3, 0.75);
      V2.set(d.x, (d.y || 0) + 0.9, d.z); VFX.burst(V2, { color: d.a ? d.a.def.col : '#ffb15c', size: 1.3 });
      if (FX && !rm) { FX.flash(0.22, '#fff1dc'); FX.kick(4); }
      flashes(1.4);
    } else if (d.big >= 2) { flashes(0.7); if (FX && !rm) FX.kick(2); }
  } else if (type === 'hit') {
    if (VFX && R.q >= 1) { V1.set(d.x, (d.y || 0) + 1.45, d.z); VFX.impact(V1, UPV, { kind: 'dust', size: 0.22, color: '#f2ebe0' }); }
  } else if (type === 'reverse') {
    if (VFX) { V1.set(d.a.x, d.a.yb + 1.2, d.a.z); VFX.ring(V1, '#ffd36a', { size: 1.0 }); }
  } else if (type === 'leap') {
    const rig = S.rigs[d.a.i];
    if (VFX && rig) { if (rig.trail) rig.trail.stop(); rig.trail = VFX.trail(rig.pivot, { color: d.a.def.col, width: 0.35, life: 0.45 }); setTimeout(() => { if (rig.trail) { rig.trail.stop(); rig.trail = null; } }, 1400); }
    flashes(0.8);
  } else if (type === 'finStart' || type === 'sigStart') {
    flashes(type === 'finStart' ? 1 : 0.5);
    if (type === 'finStart' && FX && !rm) FX.letterbox(1, 1.4);
  } else if (type === 'nearfall') { flashes(1.2); }
  else if (type === 'entrance') {
    const w = d.w;
    paintScreen(S.tron, w.def.nick.toUpperCase(), (d.group.length > 1 ? d.group.map((x) => x.def.nick).join(' and ') : w.def.name + ', ' + w.def.from), w.def.col, '#0a0610');
    S.entCol = w.def.light; S.entT = 0;
    for (const b of S.entBeams) b.material.color.set(w.def.light);
    if (VFX) {
      for (let i = 0; i < S.pyro.length; i++) { const p = S.pyro[i], inner = Math.abs(p[0]) < 2; V1.set(p[0], p[1] + 0.3, p[2]); VFX.pyro(V1, { size: inner ? 0.7 : 1.1, duration: inner ? 0.7 : 0.9, color: w.def.col }); }
      if (!w.def.heel) setTimeout(() => { if (VFX && G0 && G0.phase === 'entrance') { V1.set(0, 10, STAGE_Z + 2); VFX.fireworks(V1, { burst: 'mixed', color: w.def.col, color2: '#ffffff', size: 1.1 }); } }, 400);
    }
    if (FX && !rm) FX.flash(0.15, w.def.light);
  } else if (type === 'bell') { paintScreen(S.tron, 'RING RAJAS', matchTitle(G), '#ff7a1a', '#1a0c06'); }
  else if (type === 'replay') { paintScreen(S.tron, 'REPLAY', 'The big moment, again', '#ffd36a', '#1a1206'); startReplayView(d); }
  else if (type === 'replayEnd') { paintScreen(S.tron, 'RING RAJAS', matchTitle(G), '#ff7a1a', '#1a0c06'); if (FX) { FX.letterbox(0); FX.handheld(false); } R.replay = null; }
  else if (type === 'elim') { if (VFX) { V1.set(d.d.x, RH + 1, d.d.z); VFX.ring(V1, '#ff8a6a', { size: 2.2, kind: 'shock' }); } }
  else if (type === 'win') {
    const w = d.w;
    paintScreen(S.tron, w.def.nick.toUpperCase(), 'Your winner', w.def.col, '#0a0610');
    const title = G.cfg.mode === 'career' && G.story && G.story.champ;
    if (title && w === G.P) giveBelt(w, G);
    if (VFX) {
      V1.set(0, RH + 6, 0); VFX.winBurst(V1, { colors: [w.def.col, '#ffd36a', '#ffffff'], size: 1 });
      for (let i = 0; i < S.pyro.length; i++) { const p = S.pyro[i]; V2.set(p[0], p[1] + 0.3, p[2]); VFX.pyro(V2, { size: 1.2, duration: 1.2, color: w.def.col }); }
      setTimeout(() => { if (VFX) { V1.set(0, 11, STAGE_Z + 1); VFX.fireworks(V1, { burst: 'chrysanthemum', color: '#ffd36a', color2: w.def.col, size: 1.3 }); V1.set(-6, 10, STAGE_Z + 2); VFX.fireworks(V1, { burst: 'palm', color: w.def.col, size: 1 }); } }, 600);
    }
    flashes(1.6);
  } else if (type === 'tag') { if (VFX) { V1.set(d.a.x, RH + 1.2, d.a.z); VFX.ring(V1, d.a.def.col, { size: 1.4 }); } flashes(0.6); }
}
function giveBelt(w, G) {
  const S = R.S;
  if (!S.belt) {
    const g = new THREE.Group();
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 6, 24, PI * 1.2), std({ color: '#2a1a12', roughness: 0.7 }));
    strap.rotation.z = -PI * 0.1; strap.scale.set(1, 1, 0.5); g.add(strap);
    const gold = std({ color: '#d4a640', roughness: 0.28, metalness: 0.95 });
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.03, 24), gold); plate.rotation.x = HALF; plate.position.set(0, 0.33, 0); plate.scale.set(1.2, 1, 0.9); g.add(plate);
    for (const sx of [-1, 1]) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.025, 16), gold); s.rotation.x = HALF; s.position.set(sx * 0.24, 0.27, 0); g.add(s); }
    S.belt = g;
  }
  const rig = S.rigs[w.i]; if (!rig) return;
  rig.hum.bones.wristR.add(S.belt); S.belt.position.set(0.18, -0.12, 0); S.belt.rotation.set(0, 0, HALF);
  G.beltTo = w;
}
function flashes(k) {
  const f = R.S.flashes; if (!f || !TIERS[Math.max(0, R.q)].flashes || (ARC && ARC.reducedMotion)) return;
  f.rate = Math.max(f.rate, k);
}
function startReplayView(d) {
  const S = R.S, G = G0;
  R.replay = { t0: R.time, dur: d.dur, slow: d.slow };
  // replay from a few seconds back, about the people involved
  const span = Math.min(3.2, d.dur * d.slow + 0.4);
  R.replay.from = R.recTime - span; R.replay.to = R.recTime;
  const foc = new THREE.Vector3(); activeFocus(G, foc); S.replayFoc = foc;
  S.replayAng = Math.atan2(CAM.pos.x - foc.x, CAM.pos.z - foc.z) + PI * 0.75;
  if (FX && !(ARC && ARC.reducedMotion)) { FX.letterbox(1); FX.handheld(true); }
}

/* ------------------------------------------------------------ frame */
function updateRopes(dt) {
  for (const r of R.S.ropes) {
    // a damped spring
    r.vel += (-r.bow * 140 - r.vel * 9) * dt; r.bow += r.vel * dt;
    const u = r.mesh.material.userData.u; u.uBow.value = r.bow; u.uAt.value = clamp(r.at, -0.9, 0.9);
  }
}
function updateFlashes(dt) {
  const f = R.S.flashes; if (!f) return;
  f.rate = Math.max(0, f.rate - dt * 0.6);
  const on = f.on; let any = false;
  for (let i = 0; i < f.n; i++) {
    if (on[i] > 0) { on[i] = Math.max(0, on[i] - dt * 9); any = true; }
    else if (f.rate > 0 && Math.random() < f.rate * dt * 0.9) { on[i] = 1; any = true; }
  }
  if (any || f.was) f.attr.needsUpdate = true; f.was = any;
}
function render(a, G, ctx) {
  if (!R) return false;
  if (R.lost) return true;
  const now = performance.now(), dtR = R.last ? Math.min(0.05, (now - R.last) / 1000) : 1 / 60; R.last = now;
  if (!R.built) { buildStep(a); R.renderer.render(R.scene, R.camera); return true; }
  if (R.pending) { const g = R.pending; R.pending = null; setMatch(g); }
  if (G !== G0) setMatch(G);
  R.time += dtR;
  fpsWatch(dtR);
  const S = R.S, paused = a.state === 'pause';
  const dt = paused ? 0 : dtR * (VFX ? VFX.timeScale : 1);
  // people
  const replaying = G.phase === 'replay' && R.replay;
  if (replaying) {
    const rp = R.replay, k = clamp((R.time - rp.t0) / rp.dur, 0, 1);
    const tt = lerp(rp.from, rp.to, k);
    for (const w of G.W) { const rig = S.rigs[w.i]; if (rig) { rig.root.visible = !w.hidden && !w.gone; playRig(rig.rec, rig, tt); } }
    playRig(S.ref.rec, S.ref, tt);
  } else if (!paused) {
    for (const w of G.W) {
      const rig = S.rigs[w.i]; if (!rig) continue;
      rig.root.visible = !w.hidden && !w.gone;
      if (!rig.root.visible) continue;
      poseRig(rig, w, dt, G);
    }
    poseRef(dt, G);
    holdPass(G);
    // record for replays
    R.recTime = (R.recTime || 0) + dt;
    for (const w of G.W) { const rig = S.rigs[w.i]; if (rig && rig.root.visible) recRig(rig.rec, rig, R.recTime); }
    recRig(S.ref.rec, S.ref, R.recTime);
  }
  // the hall
  if (!paused) {
    updateRopes(dt);
    updateFlashes(dt);
    S.led.offset.x = (S.led.offset.x + dt * 0.04) % 1;
    const ex = G.crowd;
    S.crowd.update(dt, { look: S.rigs[0] ? S.rigs[0].root.position : null, excite: clamp(ex, 0, 1) });
    if (R.q >= 1) for (const h of S.staff) h.update(dt, { speed: 0, turn: 0 });
    // entrance light and colour
    const ent = G.phase === 'entrance';
    S.entT = (S.entT || 0) + dt;
    for (const b of S.entBeams) b.material.opacity = (ent ? 0.22 : 0.03) * (TIERS[Math.max(0, R.q)].beams ? 1 : 0) * (0.85 + 0.15 * Math.sin(R.time * 3 + b.position.x));
    R.stageL.intensity = lerp(R.stageL.intensity, ent ? 60 : 8, damp(3, dt));
    if (ent && S.entCol) R.stageL.color.set(S.entCol);
    for (const b of S.beams) b.visible = TIERS[Math.max(0, R.q)].beams;
  }
  director(G, dtR, a);
  if (VFX) { if (!paused) VFX.update(dtR); else VFX.update(0); VFX.applyShake(R.camera); }
  if (CS) cstrack(G);
  try { if (FX && TIERS[Math.max(0, R.q)].post) FX.render(R.scene, R.camera); else R.renderer.render(R.scene, R.camera); }
  catch (e) { /* lost context: next frame */ }
  if (VFX) VFX.removeShake(R.camera);
  void ctx;
  return true;
}
function cstrack(G) {
  CS.begin();
  for (const w of G.W) {
    if (w.hidden || w.gone) continue;
    const lie = w.h < 0.5;
    CS.put(w.x, w.yb + 0.005, w.z, lie ? 1.3 : 0.85, Math.max(0, (w.h - 1) * PHf(w)), 0.55);
  }
  const r = G.ref; CS.put(r.x, RH + 0.005, r.z, 0.8, 0, 0.5);
  CS.end();
}

/* ------------------------------------------------------------ build and quality */
function buildStep(a) {
  const step = R.step || 0;
  const t0 = performance.now();
  try {
    if (step === 0) buildBase();
    else if (step === 1) buildRing();
    else if (step === 2) buildStage();
    else if (step === 3) { prepareHuman({ lod: HUMQ() >= 2 ? 'full' : HUMQ() === 1 ? 'mid' : 'far', sex: 'm', build: 'athletic' }); }
    else if (step === 4) { prepareHuman({ lod: HUMQ() >= 2 ? 'full' : HUMQ() === 1 ? 'mid' : 'far', sex: 'f', build: 'athletic' }); }
    else if (step === 5) buildCrowd();
    else if (step === 6) buildStaff();
    else if (step === 7) {
      try { createSkyEnv(R.renderer, R.scene, { top: '#0a0c16', horizon: '#251a24', ground: '#0c0a0a', sun: { dir: [0.15, 1, 0.3], color: '#ffe6c8', size: 0.2, intensity: 3 }, intensity: 0.55 }); } catch (e) { /* no env */ }
      CS = contactShadow(R.scene, { max: 12, size: 0.9, opacity: 0.55, fade: 1.2, groundY: (x, z) => (Math.max(Math.abs(x), Math.abs(z)) < APRON ? RH : 0) });
    }
    else if (step === 8) {
      try { VFX = createVFX(R.renderer, R.scene, R.camera, { quality: TIERS[Math.max(0, R.q)].vfx, unit: 1, groundY: (x, z) => (Math.max(Math.abs(x), Math.abs(z)) < APRON ? RH : 0), soft: R.soft }); } catch (e) { VFX = null; }
    }
    else if (step === 9) {
      try { FX = createFX(R.renderer, { arc: a, preset: 'night', intro: false, results: { dist: 5, yaw: 0.25, rise: 0.08, speed: 0.2 }, handheld: { menu: true, results: true, amount: 0.8 }, dof: { results: 0.6, radius: 0.22 }, look: { bloom: 0.55, threshold: 0.7 } }); FX.setQuality(R.q, R.lockQ); } catch (e) { FX = null; }
    }
    else if (step === 10) { applyTier(); if (VFX) { try { const p = VFX.warm(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* warm on first use */ } } }
    else if (step === 11) {
      // shaders compile off the main thread where the browser can, so the menu never stalls
      R.built = true; if (R.pending) { setMatch(R.pending); R.pending = null; }
      try { if (R.renderer.compileAsync) R.renderer.compileAsync(R.scene, R.camera).catch(() => {}); } catch (e) { /* compiles on draw */ }
    }
  } catch (e) { console.warn('ring-rajas build', step, e && e.message); if (step >= 11) R.built = true; }
  R.step = step + 1;
  const took = performance.now() - t0;
  R.buildMs = (R.buildMs || 0) + took; if (took > (R.buildMax || 0)) { R.buildMax = took; R.buildMaxStep = step; }
}
function applyTier() {
  const t = TIERS[Math.max(0, R.q)];
  R.renderer.shadowMap.enabled = t.shadow; R.key.castShadow = t.shadow;
  if (R.key.shadow.mapSize.x !== t.map) { R.key.shadow.mapSize.set(t.map, t.map); if (R.key.shadow.map) { R.key.shadow.map.dispose(); R.key.shadow.map = null; } }
  if (R.S.crowd) R.S.crowd.mesh.count = Math.max(40, Math.floor(R.S.crowdN * t.crowd));
  if (VFX) VFX.setQuality(t.vfx);
  if (FX) FX.setQuality(R.q, R.lockQ);
  for (const r of RIGS.values()) r.hum.mesh.castShadow = t.shadow;
  if (R.S.staff) for (const h of R.S.staff) h.group.visible = R.q >= 1;
  if (R.S.ref) R.S.ref.hum.mesh.castShadow = t.shadow;
  resize(ARC);
}
function setQuality(q) {
  if (!R) return;
  q = clamp(q | 0, 0, 3);
  if (q === R.q) return;
  R.q = q;
  if (R.built) applyTier();
}
function fpsWatch(dt) {
  if (R.lockQ || !ARC || ARC.state === 'pause') return;
  R.fT += dt; R.fN++;
  if (R.fT >= 2) {
    const fps = R.fN / R.fT; R.fps = fps; R.fT = 0; R.fN = 0;
    R.warm++;
    if (R.warm < 2) return;
    if (fps < 36 && R.q > 0) { setQuality(fps < 20 ? R.q - 2 : R.q - 1); R.warm = 0; }
    else if (fps > 57 && R.q < R.maxQ && R.warm > 6) { setQuality(R.q + 1); R.warm = 0; }
  }
}
function resize(a) {
  if (!R || !a) return;
  const t = TIERS[Math.max(0, R.q)];
  const pr = Math.min(a.dpr * t.px, Math.sqrt(t.budget / Math.max(1, a.w * a.h)));
  R.renderer.setPixelRatio(Math.max(0.35, pr));
  R.renderer.setSize(a.w, a.h, false);
  R.camera.aspect = a.w / Math.max(1, a.h); R.camera.updateProjectionMatrix();
}
function init(a) {
  ARC = a;
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.setClearColor('#05040a');
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#0a0812', 0.022);
  scene.background = new THREE.Color('#05040a');
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 160);
  camera.position.set(0, 7, 12); camera.lookAt(0, RH, 0);
  const soft = isSoftRenderer(renderer);
  const dev = a.device;
  const q0 = soft ? 0 : dev === 'phone' ? 1 : dev === 'tablet' ? 2 : 3;
  R = { renderer, scene, camera, S: {}, q: q0, maxQ: soft ? 1 : 3, lockQ: false, soft, built: false, step: 0, time: 0, fT: 0, fN: 0, fps: 60, warm: 0, lost: false, recTime: 0 };
  a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.lost = true; });
  a.canvas.addEventListener('webglcontextrestored', () => { R.lost = false; });
  resize(a);
  return true;
}
const view = {
  name: 'webgl', three: true,
  init,
  resize,
  newMatch(G) { if (!R) return; if (R.built) setMatch(G); else R.pending = G; },
  render,
  event,
  project(x, y, z, out) {
    if (!R || !ARC) return false;
    VP.set(x, y, z).project(R.camera);
    if (VP.z > 1 || VP.z < -1) return false;
    out.x = (VP.x * 0.5 + 0.5) * ARC.w; out.y = (-VP.y * 0.5 + 0.5) * ARC.h;
    return true;
  },
  camYaw() { return CAM.hardYaw; },
  timeScale() { return VFX && !(ARC && ARC.reducedMotion) ? VFX.timeScale : 1; },
  graphics(level) { if (!R) return; if (level === 'auto') { R.lockQ = false; return; } R.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  debug() { if (!R) return null; const i = R.renderer.info.render; return { quality: R.q, fps: Math.round(R.fps), soft: R.soft, built: R.built, buildMs: Math.round(R.buildMs || 0), buildMax: Math.round(R.buildMax || 0), buildMaxStep: R.buildMaxStep, calls: i.calls, tris: i.triangles, crowd: R.S.crowd ? R.S.crowd.mesh.count : 0, shot: CAM.shot, post: !!(FX && TIERS[Math.max(0, R.q)].post) }; },
  dev: { shot: (s) => { if (R) R.forceShot = s || null; },
    pyro: (sec) => { if (!VFX || !R || !R.S.pyro) return; for (const p of R.S.pyro) { V1.set(p[0], p[1] + 0.3, p[2]); VFX.pyro(V1, { size: 1.15, duration: sec || 3, color: '#ff8a2a' }); } }, quality: (q) => { if (R) { R.lockQ = true; setQuality(q); } }, setQuality: (q) => { if (R) { R.lockQ = true; setQuality(q); } }, stage: () => R },
};
boot(view);
