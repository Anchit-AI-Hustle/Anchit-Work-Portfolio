/*
 * Procedural people for the 3D arcade games: players, riders, drivers,
 * bystanders and whole crowds, built and animated in code.
 *
 * The API below is frozen: from here on changes are additive only.
 */
// HUMAN_API: stable
/*
 * Usage
 *
 *   import { createHuman, createCrowd, crowdRows } from '/games/shared/human.js';
 *
 *   // One person. 1 unit = 1 metre unless you pass unit (world units per metre).
 *   const p = createHuman({ seed: 7, unit: 30, quality: 3,
 *     outfit: { top: '#ff7a1a', top2: '#fff1d6', bottom: '#1c1a1f', socks: '#ff7a1a', socksHigh: true, number: 9 } });
 *   scene.add(p.group);                 // feet at y = 0, facing +z
 *   // every frame: move p.group yourself, then
 *   p.update(dt, { speed: 4.2, turn: 0.5, accel: 1.2, look: ballPosition });
 *   // speed in world units per second (divided by unit inside), turn in rad/s,
 *   // accel in world units per s^2. Leave any out and it is measured from how
 *   // you moved p.group since the last frame.
 *   p.play('kick', { side: 'right' });  // one-shot actions blend over the gait
 *   p.play('cheer');  p.play('slump');  p.play('sit', { hold: true }); p.stop('sit');
 *   p.lookAt(vec3);  p.lookAt(null);    // world point, head and eyes turn to it
 *   p.setOutfit({ top: '#2f6bff', number: 4, cap: '#222' });
 *   p.bones.wristR.add(batMesh);        // attach props to a named joint
 *   p.dispose();
 *
 *   // A crowd: one instanced draw for hundreds of people, each with its own
 *   // phase, colours and occasional individual actions (stand, wave, clap,
 *   // turn to a neighbour). Animated in the vertex shader, nothing per member
 *   // on the CPU each frame.
 *   const crowd = createCrowd({ members: crowdRows({ origin: [0, 2, -40], rows: 8, perRow: 40, seatW: 0.55,
 *     rowD: 0.8, rowH: 0.42, face: [0, 0, 0] }), unit: 1, seed: 3, colors: ['#ff7a1a', '#2f6bff'] });
 *   scene.add(crowd.mesh);
 *   crowd.update(dt, { look: ballPosition });  // heads follow the ball
 *   crowd.excite(0.8);                          // 0 calm .. 1 on their feet
 *   crowd.react('cheer');                       // 'cheer' | 'groan' | 'clap' | 'wave' | 'gasp'
 *   // members: [{ x, y, z, yaw, scale }]: scale 1 is an adult (about 1.75 m standing), 0.6 a child.
 *   // A seated member sits on a seat 0.44 m (x scale) above y with the feet at y, 0.4 m in front; standing,
 *   // they step 0.34 m forward. Other options: seed, unit, quality, lod ('mid'|'far'), colors (team colours
 *   // mixed into the clothes), teamShare, seated (false: everyone stands), receiveShadow, material.
 *   // Also crowd.setSeated(on), crowd.recolor(colors), crowd.setLook(v), crowd.mesh, crowd.count, dispose().
 *
 * createHuman(opts)
 *   seed      any number; same seed, same person (skin, build, hair, phases)
 *   skin      '#rrggbb' or omitted (picked from a realistic palette, mostly South Asian)
 *   hair      'short' | 'buzz' | 'curly' | 'long' | 'ponytail' | 'bun' | 'bald' | omitted
 *   hairColor '#rrggbb' or omitted
 *   sex       'm' | 'f' | omitted (proportions and default hair)
 *   build     'slim' | 'average' | 'athletic' | 'heavy' | omitted
 *   height    metres, default about 1.75 with +-8% variety (1.62 for 'f')
 *   age       'adult' | 'older' (greyer hair, slower idle) | omitted
 *   lod       'full' | 'mid' | 'far' (default from quality: 3,2 full, 1 mid, 0 far)
 *   quality   0 lowest .. 3 full: shadows, face animation, detail
 *   unit      world units per metre (default 1)
 *   outfit    see setOutfit
 *   castShadow default quality >= 1
 *
 * The returned person
 *   group           THREE.Group you own: position, rotate (y) and add it
 *   mesh            the SkinnedMesh (one draw call; set mesh.castShadow etc.)
 *   bones           named joints: root, pelvis, spine, chest, neck, head, eyeL, eyeR, browL, browR, mouth,
 *                   shoulderL, elbowL, wristL, fingersL, shoulderR, elbowR, wristR, fingersR,
 *                   hipL, kneeL, ankleL, hipR, kneeR, ankleR. update() writes them every frame; to pose by
 *                   hand, call update() first and then adjust, your values stand for that frame.
 *   update(dt, o)   o: { speed, turn, accel, look, steer } all optional
 *   play(name, o)   names: cheer celebrate clap fistPump handsOnHead slump shrug wave highFive point kick throw
 *                   swing jump dive slide stumble fall crouch reach carry sit drive.
 *                   o: { side: 'right'|'left' (mirrors; 'left' dives to the figure's left), speed (time scale),
 *                   intensity 0..1, hold (stay at the end pose until stop), from (start part way, 0..1, e.g. a
 *                   kick whose ball contact already happened in your simulation), target (world Vector3 for
 *                   reach and point), bars (drive with handlebars), onDone() }. Returns the duration in
 *                   seconds. Held by default: crouch, carry, sit, drive. Upper-body actions (wave, clap,
 *                   carry, ...) layer over a held one (wave while seated).
 *   stop(name)      release a held action (or every action with no name)
 *   playing(name)   true while that action is on
 *   lookAt(v)       world point or null. Also update(dt, { look }).
 *   aim(side, v, o) keep the 'left' or 'right' arm pointing at world point v EVERY frame (the vector is read
 *                   each update, so pass one you move), until aim(side, null). o: { elbow } bend in radians
 *                   (default straight). Blends in and out over about 0.15 s and overrides actions on that arm.
 *   setMood(m)      -1 down .. 0 neutral .. 1 elated (brows and mouth at rest)
 *   setOutfit(o)    { top, top2, sleeves: 'short'|'long'|'none', bottom, legs: 'shorts'|'long-shorts'|'trousers',
 *                     socks, socksHigh, shoes, soles, gloves, number (0-99 or null), numberInk, cap, helmet }
 *   setLod(lod)     swap detail level ('full' | 'mid' | 'far') keeping the pose
 *   steer           -1..1, read by 'drive' (hands turn the wheel or bars)
 *   height          metres
 *   dispose()
 *
 * prepareHuman({ lod, sex, build, hair }) builds and caches the body template such a person needs
 * (about 10 ms the first time each) without making one, so a game can spread that over idle frames.
 *
 * Materials. Every material made here (people, caps, helmets, crowds) carries
 * material.userData.keepMat = true. A game that swaps materials for a cheap
 * tier must skip those: they are shared, skinned or shader-patched, and a
 * replacement would lose the skinning, the vertex colours or the crowd's
 * animation. The same flag is set on the fx3d helpers' materials.
 *
 * Performance. Every person is one skinned mesh (one draw, one shadow draw)
 * on shared geometry and one shared material; only the vertex colours and
 * the shirt number UVs are per person. update() allocates nothing. Use
 * 'full' rigs for the few people near the camera, 'mid' or 'far' (or a
 * crowd) beyond. A crowd is one InstancedMesh: one draw for all of it.
 */
import * as THREE from '/games/vendor/three/three.module.min.js';

/* ------------------------------------------------------------------ small helpers */
const PI = Math.PI, TAU = PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const sstep = (a, b, x) => smooth((x - a) / (b - a));
function rng(seed) {
  let s = (Math.floor(Math.abs(seed == null ? Math.random() * 1e9 : seed) * 2654435761) ^ 0x9e3779b9) >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const wpick = (r, list) => { let tot = 0; for (const e of list) tot += e[1]; let x = r() * tot; for (const e of list) { x -= e[1]; if (x <= 0) return e[0]; } return list[0][0]; };

/* ------------------------------------------------------------------ palettes */
// Skin tones measured off real photographs, weighted toward South Asian
// complexions for these India-set games, with others mixed in.
export const SKIN_TONES = [
  ['#f1d1b3', 0.8], ['#e7bb95', 1.6], ['#d9a47b', 2.4], ['#c98f66', 2.6], ['#b77b54', 2.4],
  ['#a26a47', 2.0], ['#8c5a3b', 1.5], ['#744830', 1.0], ['#5c3826', 0.6], ['#f6dccb', 0.4], ['#3f271b', 0.4],
];
export const HAIR_COLORS = [['#120e0b', 5], ['#1d1511', 4], ['#2a1d15', 2.6], ['#3a281b', 1.3], ['#563826', 0.5], ['#6b5d52', 0.25]];
const OLD_HAIR = [['#8a8178', 1], ['#b3aca4', 1], ['#d6d0c8', 0.6], ['#4a4038', 0.5]];
const CLOTH = ['#2b3a55', '#5a6b7c', '#7a2e2e', '#2f5d50', '#c9b79c', '#e8e2d6', '#3c3c42', '#8a5a2b', '#a8324a', '#2d6cdf', '#f2c14e', '#6b4f8a', '#d96c3f', '#1f7a6a', '#ece6da', '#55606e'];
const PANTS = ['#23262d', '#2f3a52', '#3b4250', '#4a4a4f', '#6a5d4d', '#1d2433', '#7a7468', '#2b2b2e'];

/* ------------------------------------------------------------------ skeleton */
const B = { root: 0, pelvis: 1, spine: 2, chest: 3, neck: 4, head: 5, eyeL: 6, eyeR: 7, browL: 8, browR: 9, mouth: 10,
  shoulderL: 11, elbowL: 12, wristL: 13, fingersL: 14, shoulderR: 15, elbowR: 16, wristR: 17, fingersR: 18,
  hipL: 19, kneeL: 20, ankleL: 21, hipR: 22, kneeR: 23, ankleR: 24 };
const BONE_NAMES = Object.keys(B);
// rest positions relative to the parent (metres, adult of 1.75 m)
const REST = {
  root: [null, 0, 0, 0], pelvis: ['root', 0, 0.95, 0], spine: ['pelvis', 0, 0.085, 0], chest: ['spine', 0, 0.2, 0],
  neck: ['chest', 0, 0.215, -0.01], head: ['neck', 0, 0.09, 0.008],
  eyeL: ['head', 0.032, 0.103, 0.083], eyeR: ['head', -0.032, 0.103, 0.083],
  browL: ['head', 0.033, 0.128, 0.089], browR: ['head', -0.033, 0.128, 0.089], mouth: ['head', 0, 0.038, 0.084],
  shoulderL: ['chest', 0.183, 0.188, -0.012], elbowL: ['shoulderL', 0, -0.29, 0], wristL: ['elbowL', 0, -0.255, 0], fingersL: ['wristL', 0, -0.085, 0],
  shoulderR: ['chest', -0.183, 0.188, -0.012], elbowR: ['shoulderR', 0, -0.29, 0], wristR: ['elbowR', 0, -0.255, 0], fingersR: ['wristR', 0, -0.085, 0],
  hipL: ['pelvis', 0.09, -0.045, 0], kneeL: ['hipL', 0, -0.42, 0], ankleL: ['kneeL', 0, -0.405, 0],
  hipR: ['pelvis', -0.09, -0.045, 0], kneeR: ['hipR', 0, -0.42, 0], ankleR: ['kneeR', 0, -0.405, 0],
};
const ORDER = { shoulderL: 'ZXY', shoulderR: 'ZXY', hipL: 'ZXY', hipR: 'ZXY', pelvis: 'YXZ', spine: 'YXZ', chest: 'YXZ', neck: 'YXZ', head: 'YXZ', root: 'YXZ', eyeL: 'YXZ', eyeR: 'YXZ' };
const THIGH = 0.42, SHIN = 0.405, ANKLE_Y = 0.08;
// world rest position of every bone
const RESTW = {};
for (const n of BONE_NAMES) { const r = REST[n]; const p = r[0] ? RESTW[r[0]] : [0, 0, 0]; RESTW[n] = [p[0] + r[1], p[1] + r[2], p[2] + r[3]]; }

/* ------------------------------------------------------------------ zones and shared textures */
const Z = { SKIN: 0, TOP: 1, TOP2: 2, ARM_U: 3, ARM_L: 4, FORE: 5, HAND: 6, BOT: 7, THIGH_U: 8, THIGH_L: 9, KNEE: 10, SHIN_U: 11, SHIN_L: 12,
  ANKLE: 13, SHOE: 14, SOLE: 15, HAIR: 16, BROW: 17, EYEW: 18, IRIS: 19, LIP: 20, NUM: 21, EAR: 22 };
// roughness class per zone: 0 skin, 1 cloth, 2 shoe, 3 sole, 4 hair, 5 eye, 6 lip, 7 = transparent (empty number)
const RCLASS = [0, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 2, 3, 4, 4, 5, 5, 6, 1, 0];
const ROUGH = [0.5, 0.88, 0.42, 0.92, 0.6, 0.1, 0.36, 0.7];
const cellU = (c) => (c + 0.5) / 8;
const STRIP_V = 0.03;

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 1024;
  const g = cv.getContext('2d');
  g.clearRect(0, 0, 1024, 1024);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '900 64px "Arial Black", Arial, sans-serif';
  g.lineJoin = 'round';
  for (let n = 0; n < 100; n++) {
    const x = (n % 10) * 102.4 + 51.2, y = ((n / 10) | 0) * 96 + 50;
    g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.28)'; g.strokeText(String(n), x, y);
    g.fillStyle = '#ffffff'; g.fillText(String(n), x, y);
  }
  g.fillStyle = '#ffffff'; g.fillRect(0, 960, 896, 64); // cells 0..6 opaque white, cell 7 empty
  const map = new THREE.CanvasTexture(cv); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const rc = document.createElement('canvas'); rc.width = 64; rc.height = 64;
  const rg = rc.getContext('2d');
  const gray = (v) => { const c = Math.round(v * 255); return 'rgb(' + c + ',' + c + ',' + c + ')'; };
  rg.fillStyle = gray(0.72); rg.fillRect(0, 0, 64, 64);
  for (let c = 0; c < 8; c++) { rg.fillStyle = gray(ROUGH[c]); rg.fillRect(c * 8, 60, 8, 4); }
  const rough = new THREE.CanvasTexture(rc); rough.generateMipmaps = false; rough.minFilter = THREE.NearestFilter; rough.magFilter = THREE.NearestFilter;
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map, roughnessMap: rough, roughness: 1, metalness: 0, alphaTest: 0.5 });
  mat.name = 'human'; mat.userData.keepMat = true;
  SHARED = { map, rough, mat, templates: new Map(), accMats: new Map(), accGeo: null };
  return SHARED;
}
function accMat(hex) {
  const S = shared();
  let m = S.accMats.get(hex);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.55, metalness: 0.05 }); m.userData.keepMat = true; S.accMats.set(hex, m); }
  return m;
}
function accGeos() {
  const S = shared();
  if (S.accGeo) return S.accGeo;
  // cap: crown and a brim, helmet: a rounded shell and a peak, both in head space
  const cap = new THREE.SphereGeometry(0.104, 16, 8, 0, TAU, 0, PI * 0.5); cap.scale(0.84, 0.62, 1); cap.translate(0, 0.122, -0.004);
  const brim = new THREE.CylinderGeometry(0.075, 0.075, 0.008, 16, 1, false, -PI * 0.5, PI); brim.scale(1, 1, 1.25); brim.translate(0, 0.128, 0.07);
  const capGeo = mergeSimple([cap, brim]);
  const shell = new THREE.SphereGeometry(0.118, 18, 10, 0, TAU, 0, PI * 0.62); shell.scale(0.86, 0.9, 1); shell.translate(0, 0.098, -0.01);
  const peak = new THREE.BoxGeometry(0.15, 0.012, 0.05); peak.translate(0, 0.118, 0.108);
  const helmetGeo = mergeSimple([shell, peak]);
  S.accGeo = { cap: capGeo, helmet: helmetGeo };
  return S.accGeo;
}
function mergeSimple(list) {
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), idx = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, ov * 3); nor.set(g.attributes.normal.array, ov * 3);
    const c = g.attributes.position.count;
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[oi++] = a[i] + ov; } else for (let i = 0; i < c; i++) idx[oi++] = i + ov;
    ov += c; g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}

/* ------------------------------------------------------------------ geometry builder */
const _bm = new THREE.Matrix4(), _bn = new THREE.Matrix3(), _bv = new THREE.Vector3(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(), _bs = new THREE.Vector3();
function mtx(x, y, z, rx, ry, rz, sx, sy, sz) {
  _be.set(rx || 0, ry || 0, rz || 0); _bq.setFromEuler(_be);
  return _bm.compose(_bv.set(x, y, z), _bq, _bs.set(sx == null ? 1 : sx, sy == null ? (sx == null ? 1 : sx) : sy, sz == null ? (sx == null ? 1 : sx) : sz));
}
class Builder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.zone = []; this.si = []; this.sw = []; this.idx = []; this.plates = []; this.n = 0; }
  // skin: a bone index, or [boneA, boneB, y0, y1] to blend A->B over mesh-space y0..y1
  add(geo, m, zone, skin, plate) {
    const p = geo.attributes.position, nn = geo.attributes.normal, uv = geo.attributes.uv;
    _bn.getNormalMatrix(m);
    const base = this.n;
    for (let i = 0; i < p.count; i++) {
      _bv.set(p.getX(i), p.getY(i), p.getZ(i)).applyMatrix4(m);
      this.pos.push(_bv.x, _bv.y, _bv.z);
      const y = _bv.y;
      _bv.set(nn.getX(i), nn.getY(i), nn.getZ(i)).applyMatrix3(_bn).normalize();
      this.nor.push(_bv.x, _bv.y, _bv.z);
      const z = typeof zone === 'function' ? zone(y) : zone;
      this.zone.push(z);
      if (plate) this.uv.push(uv.getX(i), uv.getY(i)); else this.uv.push(cellU(RCLASS[z]), STRIP_V);
      if (Array.isArray(skin)) { const w = sstep(skin[2], skin[3], y); this.si.push(skin[0], skin[1], 0, 0); this.sw.push(1 - w, w, 0, 0); }
      else { this.si.push(skin, 0, 0, 0); this.sw.push(1, 0, 0, 0); }
    }
    if (geo.index) { const a = geo.index.array; for (let i = 0; i < a.length; i++) this.idx.push(a[i] + base); }
    else for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    if (plate) this.plates.push([base, p.count]);
    this.n += p.count;
    geo.dispose();
  }
}
// A lathe (round limb or torso) with radius profile [[y, r], ...] in mesh space, cut into zone bands.
function lathe(b, prof, seg, sx, sz, cx, cz, zoneFn, skin, ry) {
  // a clean edge where the zone changes (a sleeve hem, a sock top): two rings a hair apart at the boundary
  if (typeof zoneFn === 'function') {
    const pr = [];
    for (let i = 0; i < prof.length; i++) {
      pr.push(prof[i]);
      if (i + 1 >= prof.length) continue;
      const a = prof[i], c = prof[i + 1];
      let z0 = zoneFn(a[0]);
      for (let k = 1; k <= 64; k++) {
        const y = a[0] + (c[0] - a[0]) * k / 64, z = zoneFn(y);
        if (z !== z0) { const yb = a[0] + (c[0] - a[0]) * (k - 0.5) / 64, rad = lerp(a[1], c[1], (yb - a[0]) / (c[0] - a[0])); pr.push([yb - 0.0008, rad], [yb + 0.0008, rad]); z0 = z; }
      }
    }
    prof = pr;
  }
  const pts = prof.map((q) => new THREE.Vector2(Math.max(0.0005, q[1]), q[0]));
  const g = new THREE.LatheGeometry(pts, seg);
  b.add(g, mtx(cx, 0, cz, 0, ry || 0, 0, sx, 1, sz), zoneFn, skin);
}
function sphere(b, r, ws, hs, x, y, z, sx, sy, sz, zone, skin, rx, ry, rz) {
  b.add(new THREE.SphereGeometry(r, ws, hs), mtx(x, y, z, rx, ry, rz, sx, sy, sz), zone, skin);
}

// Build one body template: the person in rest pose with skin weights and zones.
function buildTemplate(lod, sex, build, hair) {
  const full = lod === 'full', far = lod === 'far';
  const seg = full ? 14 : lod === 'mid' ? 9 : 6, sw = full ? 16 : lod === 'mid' ? 10 : 7, sh = full ? 12 : lod === 'mid' ? 8 : 5;
  const f = sex === 'f';
  const bw = build === 'slim' ? 0.9 : build === 'athletic' ? 1.04 : build === 'heavy' ? 1.13 : 1;
  const belly = build === 'heavy' ? 1.12 : build === 'athletic' ? 0.94 : 1;
  const sh_ = (f ? 0.9 : 1) * (build === 'athletic' ? 1.05 : 1);
  const lim = (f ? 0.9 : 1) * (build === 'slim' ? 0.88 : build === 'heavy' ? 1.12 : build === 'athletic' ? 1.04 : 1);
  const b = new Builder();
  const W = RESTW;
  /* torso: one lathe, pelvis to neck, blended across pelvis, spine and chest */
  const hipR = (f ? 0.178 : 0.17) * bw, waist = (f ? 0.135 : 0.152) * bw * belly, chest = (f ? 0.16 : 0.182) * bw * sh_;
  const torso = [[0.82, 0.03], [0.845, 0.11 * bw], [0.88, 0.15 * bw], [0.93, hipR], [0.99, hipR * 0.97], [1.05, waist * 1.02], [1.11, waist],
    [1.18, chest * 0.93], [1.26, chest * 0.99], [1.33, chest], [1.38, chest * 0.98], [1.41, chest * 0.86], [1.435, chest * 0.55], [1.458, 0.055]];
  const tzone = (y) => (y < 0.99 ? Z.BOT : Z.TOP);
  // two pieces so the waistband is a clean edge
  const lower = torso.filter((q) => q[0] <= 0.99), upper = torso.filter((q) => q[0] >= 0.99);
  const skinT = (y) => y; void skinT;
  const zd = f ? 0.7 : 0.68;
  // pelvis piece follows the pelvis; upper torso blends pelvis -> spine -> chest
  lathe(b, lower, seg, 1, zd, 0, 0, Z.BOT, B.pelvis);
  {
    const pts = upper.map((q) => new THREE.Vector2(Math.max(0.0005, q[1]), q[0]));
    const g = new THREE.LatheGeometry(pts, seg);
    // blend spine weight below the ribs and chest above them
    const p = g.attributes.position, base = b.n;
    b.add(g, mtx(0, 0, 0, 0, 0, 0, 1, 1, zd), tzone, B.spine);
    for (let i = 0; i < p.count; i++) {
      const y = b.pos[(base + i) * 3 + 1];
      const k = (base + i) * 4;
      if (y < 1.07) { const w = sstep(0.97, 1.07, y); b.si[k] = B.pelvis; b.si[k + 1] = B.spine; b.sw[k] = 1 - w; b.sw[k + 1] = w; }
      else { const w = sstep(1.15, 1.26, y); b.si[k] = B.spine; b.si[k + 1] = B.chest; b.sw[k] = 1 - w; b.sw[k + 1] = w; }
    }
  }
  // collar
  b.add(new THREE.TorusGeometry(0.062, 0.012, 5, seg + 2), mtx(0, 1.448, 0.004, PI / 2 + 0.25, 0, 0, 1, 1, 1), Z.TOP2, B.chest);
  // neck and head
  lathe(b, [[1.42, 0.054 * (f ? 0.86 : 1)], [1.5, 0.048 * (f ? 0.86 : 1)], [1.59, 0.046]], seg - 2, 1, 1, 0, 0.008, Z.SKIN, [B.chest, B.neck, 1.44, 1.5]);
  const H = W.head;
  const hs = f ? 0.95 : 1;
  sphere(b, 1, sw, sh, 0, H[1] + 0.095, H[2] - 0.004, 0.077 * hs, 0.112 * hs, 0.097 * hs, Z.SKIN, B.head);
  sphere(b, 1, sw - 4, sh - 4, 0, H[1] + 0.036, H[2] + 0.018, 0.058 * hs, 0.048 * hs, 0.066 * hs, Z.SKIN, B.head);
  if (!far) {
    // nose, ears
    b.add(new THREE.ConeGeometry(0.0145, 0.042, 4), mtx(0, H[1] + 0.079, H[2] + 0.098, -1.25, PI / 4, 0, 1, 1, 0.8), Z.SKIN, B.head);
    sphere(b, 1, 6, 5, 0.076 * hs, H[1] + 0.088, H[2] - 0.006, 0.011, 0.027, 0.019, Z.EAR, B.head);
    sphere(b, 1, 6, 5, -0.076 * hs, H[1] + 0.088, H[2] - 0.006, 0.011, 0.027, 0.019, Z.EAR, B.head);
    // eyes: white and iris on the eye bone, so blinks and glances move them
    for (const s of [1, -1]) {
      const e = s > 0 ? W.eyeL : W.eyeR, bone = s > 0 ? B.eyeL : B.eyeR;
      sphere(b, 1, full ? 10 : 6, full ? 8 : 5, e[0], e[1], e[2], 0.0145, 0.0105, 0.0075, Z.EYEW, bone);
      sphere(b, 1, full ? 8 : 5, full ? 6 : 4, e[0], e[1], e[2] + 0.0052, 0.0082, 0.0082, 0.0042, Z.IRIS, bone);
      const br = s > 0 ? W.browL : W.browR;
      b.add(new THREE.BoxGeometry(0.031, 0.0068, 0.009), mtx(br[0], br[1], br[2], 0.15, 0, -s * 0.12), Z.BROW, s > 0 ? B.browL : B.browR);
    }
    // lips on the mouth bone (the bone opens the mouth)
    sphere(b, 1, 8, 5, 0, W.mouth[1], W.mouth[2], 0.022, 0.0058, 0.008, Z.LIP, B.mouth);
  }
  /* hair */
  const hc = [0, H[1] + 0.097, H[2] - 0.008];
  const capPiece = (thet, sc, tilt) => b.add(new THREE.SphereGeometry(1, sw, sh, 0, TAU, 0, PI * thet), mtx(hc[0], hc[1] + 0.004, hc[2] - 0.006, tilt, 0, 0, 0.081 * hs * sc, 0.118 * hs * sc, 0.102 * hs * sc), Z.HAIR, B.head);
  if (hair === 'short') { capPiece(0.52, 1.02, -0.32); sphere(b, 1, 6, 4, 0, hc[1] + 0.07, hc[2] + 0.055, 0.06, 0.022, 0.03, Z.HAIR, B.head, 0.2); }
  else if (hair === 'buzz') capPiece(0.47, 1.005, -0.34);
  else if (hair === 'curly') {
    capPiece(0.55, 1.05, -0.3);
    if (!far) for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; sphere(b, 1, 6, 4, Math.cos(a) * 0.05, hc[1] + 0.085 + Math.sin(a * 2) * 0.008, hc[2] - 0.01 + Math.sin(a) * 0.055, 0.032, 0.026, 0.032, Z.HAIR, B.head); }
  } else if (hair === 'long') {
    capPiece(0.56, 1.04, -0.28);
    sphere(b, 1, sw - 4, sh - 3, 0, hc[1] - 0.075, hc[2] - 0.055, 0.085, 0.13, 0.05, Z.HAIR, B.head, 0.12);
    sphere(b, 1, 6, 5, 0.06, hc[1] - 0.04, hc[2] - 0.02, 0.03, 0.09, 0.045, Z.HAIR, B.head);
    sphere(b, 1, 6, 5, -0.06, hc[1] - 0.04, hc[2] - 0.02, 0.03, 0.09, 0.045, Z.HAIR, B.head);
  } else if (hair === 'ponytail') {
    capPiece(0.55, 1.03, -0.3);
    sphere(b, 1, 7, 5, 0, hc[1] + 0.02, hc[2] - 0.11, 0.028, 0.03, 0.028, Z.HAIR, B.head);
    b.add(new THREE.ConeGeometry(0.03, 0.17, 7), mtx(0, hc[1] - 0.06, hc[2] - 0.125, PI - 0.25, 0, 0, 1, 1, 0.8), Z.HAIR, B.head);
  } else if (hair === 'bun') {
    capPiece(0.55, 1.03, -0.3);
    sphere(b, 1, 8, 6, 0, hc[1] + 0.06, hc[2] - 0.1, 0.045, 0.042, 0.045, Z.HAIR, B.head);
  } else if (hair === 'bald') {
    b.add(new THREE.SphereGeometry(1, sw, 4, 0, TAU, PI * 0.42, PI * 0.18), mtx(hc[0], hc[1], hc[2] - 0.01, -0.35, 0, 0, 0.081 * hs, 0.116 * hs, 0.101 * hs), Z.HAIR, B.head);
  }
  /* arms */
  for (const s of [1, -1]) {
    const sb = s > 0 ? B.shoulderL : B.shoulderR, eb = s > 0 ? B.elbowL : B.elbowR, wb = s > 0 ? B.wristL : B.wristR, fb = s > 0 ? B.fingersL : B.fingersR;
    const S0 = s > 0 ? W.shoulderL : W.shoulderR, E0 = s > 0 ? W.elbowL : W.elbowR, R0 = s > 0 ? W.wristL : W.wristR;
    // deltoid on the arm, so it travels with it
    const ua = (y) => (y > S0[1] - 0.13 ? Z.ARM_U : Z.ARM_L);
    lathe(b, [[E0[1] - 0.01, 0.041 * lim], [E0[1] + 0.06, 0.047 * lim], [E0[1] + 0.16, 0.056 * lim], [S0[1] - 0.03, 0.06 * lim * sh_], [S0[1] - 0.006, 0.056 * lim * sh_], [S0[1] + 0.012, 0.042 * lim * sh_], [S0[1] + 0.025, 0.014]], seg - 4, 1, 0.95, S0[0], S0[2], ua, [eb, sb, E0[1] - 0.005, E0[1] + 0.045]);
    sphere(b, 0.042 * lim, sw - 6, sh - 5, E0[0], E0[1], E0[2], 1, 1, 1, Z.FORE, eb);
    lathe(b, [[R0[1] + 0.005, 0.028 * lim], [R0[1] + 0.06, 0.033 * lim], [R0[1] + 0.17, 0.045 * lim], [E0[1] - 0.005, 0.042 * lim]], seg - 4, 0.92, 1, E0[0], E0[2], Z.FORE, [wb, eb, R0[1] - 0.005, R0[1] + 0.03]);
    // hand: palm faces the thigh, thumb forward
    sphere(b, 1, 8, 6, R0[0], R0[1] - 0.045, R0[2] + 0.004, 0.019 * lim, 0.05, 0.042 * lim, Z.HAND, wb);
    if (!far) b.add(new THREE.CapsuleGeometry(0.011, 0.035, 2, 6), mtx(R0[0] - s * 0.004, R0[1] - 0.05, R0[2] + 0.04, 0.5, 0, 0), Z.HAND, wb);
    // fingers on their own bone (curl into a fist)
    b.add(new THREE.CapsuleGeometry(0.017, 0.042, 2, full ? 7 : 5), mtx(R0[0], R0[1] - 0.105, R0[2] + 0.003, 0, 0, 0, 1.0, 1, 2.2), Z.HAND, fb);
  }
  /* legs */
  for (const s of [1, -1]) {
    const hb = s > 0 ? B.hipL : B.hipR, kb = s > 0 ? B.kneeL : B.kneeR, ab = s > 0 ? B.ankleL : B.ankleR;
    const P0 = s > 0 ? W.hipL : W.hipR, K0 = s > 0 ? W.kneeL : W.kneeR, A0 = s > 0 ? W.ankleL : W.ankleR;
    const thz = (y) => (y > P0[1] - 0.16 ? Z.THIGH_U : Z.THIGH_L);
    lathe(b, [[K0[1] + 0.01, 0.058 * lim], [K0[1] + 0.08, 0.068 * lim], [K0[1] + 0.22, 0.086 * lim], [P0[1] - 0.03, 0.098 * lim * (f ? 1.05 : 1)], [P0[1] + 0.05, 0.08 * lim]], seg - 2, 1, 1, P0[0] + s * 0.004, P0[2], thz, [kb, hb, K0[1] + 0.005, K0[1] + 0.06]);
    sphere(b, 0.056 * lim, sw - 6, sh - 5, K0[0], K0[1], K0[2] + 0.008, 1, 1, 1, Z.KNEE, kb);
    const shz = (y) => (y < A0[1] + 0.06 ? Z.ANKLE : y < K0[1] - 0.15 ? Z.SHIN_L : Z.SHIN_U);
    lathe(b, [[A0[1] - 0.01, 0.036 * lim], [A0[1] + 0.07, 0.04 * lim], [A0[1] + 0.2, 0.057 * lim], [K0[1] - 0.12, 0.064 * lim], [K0[1] - 0.01, 0.055 * lim]], seg - 2, 1, 1, K0[0], K0[2], shz, [ab, kb, A0[1] + 0.01, A0[1] + 0.05]);
    // shoe: rounded upper and a sole, on the ankle bone
    sphere(b, 1, sw - 4, sh - 4, A0[0], A0[1] - 0.03, A0[2] + 0.045, 0.048 * lim, 0.052, 0.13, Z.SHOE, ab);
    b.add(new THREE.BoxGeometry(0.084 * lim, 0.016, 0.25), mtx(A0[0], 0.009, A0[2] + 0.045), Z.SOLE, ab);
  }
  /* shirt numbers: back and chest (plates take their uvs from the number atlas) */
  if (!far) {
    b.add(new THREE.PlaneGeometry(0.19, 0.19), mtx(0, 1.24, -chest * zd - 0.0035, -0.08, PI, 0), Z.NUM, B.chest, true);
    b.add(new THREE.PlaneGeometry(0.075, 0.075), mtx(0.062, 1.32, chest * zd * 0.985 + 0.006, -0.12, 0.38, 0), Z.NUM, B.chest, true);
  }
  // pack
  const n = b.n;
  const geo = {
    position: new THREE.Float32BufferAttribute(b.pos, 3), normal: new THREE.Float32BufferAttribute(b.nor, 3),
    skinIndex: new THREE.Uint16BufferAttribute(b.si, 4), skinWeight: new THREE.Float32BufferAttribute(b.sw, 4),
    index: new THREE.BufferAttribute(n > 65535 ? new Uint32Array(b.idx) : new Uint16Array(b.idx), 1),
    uv: new Float32Array(b.uv), zone: new Uint8Array(b.zone), plates: b.plates, n,
    ys: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) geo.ys[i] = b.pos[i * 3 + 1];
  return geo;
}
function template(lod, sex, build, hair) {
  const S = shared(), key = lod + '|' + sex + '|' + build + '|' + hair;
  let t = S.templates.get(key);
  if (!t) { t = buildTemplate(lod, sex, build, hair); S.templates.set(key, t); }
  return t;
}

// Build (and cache) the body template a createHuman with these options would need, without making a
// person: lets a game spread that one-time work over idle frames. Returns true if it did any work.
export function prepareHuman(o) {
  o = o || {};
  const q = o.quality == null ? 3 : clamp(o.quality | 0, 0, 3);
  const lod = o.lod || (q >= 2 ? 'full' : q === 1 ? 'mid' : 'far');
  const S = shared(), key = lod + '|' + (o.sex || 'm') + '|' + (o.build || 'average') + '|' + (o.hair || 'short');
  if (S.templates.has(key)) return false;
  template(lod, o.sex || 'm', o.build || 'average', o.hair || 'short');
  return true;
}

/* ------------------------------------------------------------------ pose channels */
const C = {};
['rootY', 'rootRX', 'rootRY', 'rootRZ', 'hipsX', 'hipsY', 'hipsZ', 'hipsRX', 'hipsRY', 'hipsRZ', 'spineRX', 'spineRY', 'spineRZ', 'chestRX', 'chestRY', 'chestRZ',
  'neckRX', 'neckRY', 'neckRZ', 'headRX', 'headRY', 'headRZ',
  'shLX', 'shLY', 'shLZ', 'elL', 'wrLX', 'wrLZ', 'fiL', 'shrugL', 'shRX', 'shRY', 'shRZ', 'elR', 'wrRX', 'wrRZ', 'fiR', 'shrugR',
  'fLx', 'fLy', 'fLz', 'fLp', 'fRx', 'fRy', 'fRz', 'fRp', 'fkL', 'fkR', 'thLX', 'thLZ', 'knL', 'ftL', 'thRX', 'thRZ', 'knR', 'ftR',
  'browY', 'browIn', 'mouth', 'eyeOpen'].forEach((n, i) => { C[n] = i; });
const NCH = Object.keys(C).length;
// mirror map for left/right actions: [index, sign]
const MIR = new Int16Array(NCH), MSG = new Float32Array(NCH);
(function () {
  for (let i = 0; i < NCH; i++) { MIR[i] = i; MSG[i] = 1; }
  const pair = (a, b, s) => { MIR[C[a]] = C[b]; MIR[C[b]] = C[a]; MSG[C[a]] = s; MSG[C[b]] = s; };
  pair('shLX', 'shRX', 1); pair('shLY', 'shRY', -1); pair('shLZ', 'shRZ', -1); pair('elL', 'elR', 1); pair('wrLX', 'wrRX', 1); pair('wrLZ', 'wrRZ', -1);
  pair('fiL', 'fiR', 1); pair('shrugL', 'shrugR', 1); pair('fLx', 'fRx', -1); pair('fLy', 'fRy', 1); pair('fLz', 'fRz', 1); pair('fLp', 'fRp', 1);
  pair('fkL', 'fkR', 1); pair('thLX', 'thRX', 1); pair('thLZ', 'thRZ', -1); pair('knL', 'knR', 1); pair('ftL', 'ftR', 1);
  for (const n of ['rootRY', 'rootRZ', 'hipsX', 'hipsRY', 'hipsRZ', 'spineRY', 'spineRZ', 'chestRY', 'chestRZ', 'neckRY', 'neckRZ', 'headRY', 'headRZ']) MSG[C[n]] = -1;
})();
const LOWER = new Uint8Array(NCH);
['rootY', 'rootRX', 'rootRY', 'rootRZ', 'hipsX', 'hipsY', 'hipsZ', 'hipsRX', 'hipsRY', 'hipsRZ', 'fLx', 'fLy', 'fLz', 'fLp', 'fRx', 'fRy', 'fRz', 'fRp', 'fkL', 'fkR',
  'thLX', 'thLZ', 'knL', 'ftL', 'thRX', 'thRZ', 'knR', 'ftR'].forEach((n) => { LOWER[C[n]] = 1; });

/* ------------------------------------------------------------------ actions
 * keys: channel name -> [t0, v0, t1, v1, ...] over normalised time 0..1 (absolute values, eased between keys)
 * osc:  [channel, amplitude, hz, from, to, phase] added on top
 * Right-handed by default; side 'left' mirrors.
 */
const ACTIONS = {
  cheer: { dur: 1.9, keys: {
    shRZ: [0, -0.08, 0.13, -0.45, 0.3, -2.7, 0.84, -2.55, 1, -0.08], shLZ: [0, 0.08, 0.13, 0.45, 0.3, 2.7, 0.84, 2.55, 1, 0.08],
    shRX: [0, 0, 0.13, 0.25, 0.3, -0.35, 0.84, -0.3, 1, 0], shLX: [0, 0, 0.13, 0.25, 0.3, -0.35, 0.84, -0.3, 1, 0],
    elR: [0, -0.12, 0.13, -1.3, 0.3, -0.35, 0.84, -0.45, 1, -0.12], elL: [0, -0.12, 0.13, -1.3, 0.3, -0.35, 0.84, -0.45, 1, -0.12],
    fiR: [0, 0.2, 0.25, 1, 0.85, 1, 1, 0.2], fiL: [0, 0.2, 0.25, 1, 0.85, 1, 1, 0.2],
    hipsY: [0, 0, 0.13, -0.09, 0.27, 0, 1, 0], rootY: [0, 0, 0.13, 0, 0.27, 0.07, 0.4, 0, 1, 0],
    spineRX: [0, 0, 0.13, 0.14, 0.32, -0.14, 0.84, -0.1, 1, 0], headRX: [0, 0, 0.3, -0.28, 0.84, -0.2, 1, 0],
    mouth: [0, 0, 0.26, 1, 0.84, 0.85, 1, 0], browY: [0, 0, 0.2, 1, 0.88, 0.9, 1, 0] },
    osc: [['shRZ', 0.16, 2.6, 0.32, 0.84, 0], ['shLZ', -0.16, 2.6, 0.32, 0.84, 0], ['rootY', 0.05, 2.6, 0.4, 0.84, 1.2], ['elR', 0.2, 2.6, 0.32, 0.84, 0.6], ['elL', 0.2, 2.6, 0.32, 0.84, 0.6]] },
  celebrate: { dur: 2.6, keys: {
    shRZ: [0, -0.08, 0.1, -0.5, 0.22, -2.9, 0.86, -2.7, 1, -0.08], shLZ: [0, 0.08, 0.1, 0.5, 0.22, 2.9, 0.86, 2.7, 1, 0.08],
    shRX: [0, 0, 0.22, -0.2, 0.86, -0.2, 1, 0], shLX: [0, 0, 0.22, -0.2, 0.86, -0.2, 1, 0], elR: [0, -0.1, 0.22, -0.15, 1, -0.1], elL: [0, -0.1, 0.22, -0.15, 1, -0.1],
    fiR: [0, 0.2, 0.2, 0, 1, 0.2], fiL: [0, 0.2, 0.2, 0, 1, 0.2], spineRX: [0, 0, 0.1, 0.15, 0.25, -0.22, 0.86, -0.18, 1, 0], chestRX: [0, 0, 0.25, -0.12, 0.86, -0.1, 1, 0],
    headRX: [0, 0, 0.25, -0.35, 0.86, -0.3, 1, 0], hipsY: [0, 0, 0.1, -0.1, 0.22, 0, 1, 0], rootY: [0, 0, 0.1, 0, 0.2, 0.12, 0.3, 0, 1, 0],
    mouth: [0, 0, 0.2, 1, 0.9, 1, 1, 0], browY: [0, 0, 0.2, 1, 0.9, 1, 1, 0] },
    osc: [['shRZ', 0.1, 1.6, 0.3, 0.86, 0], ['shLZ', -0.1, 1.6, 0.3, 0.86, 0.4], ['spineRY', 0.12, 0.8, 0.3, 0.86, 0]] },
  fistPump: { dur: 1.1, keys: {
    shRX: [0, 0, 0.24, -1.55, 0.4, 0.25, 0.56, -0.35, 0.68, 0.2, 1, 0], shRZ: [0, -0.08, 0.24, -0.4, 0.4, -0.22, 1, -0.08],
    elR: [0, -0.12, 0.24, -1.9, 0.4, -2.3, 0.56, -2.0, 0.68, -2.3, 1, -0.12], fiR: [0, 0.2, 0.15, 1.1, 0.85, 1.1, 1, 0.2],
    spineRX: [0, 0, 0.24, -0.1, 0.42, 0.22, 0.7, 0.16, 1, 0], spineRY: [0, 0, 0.42, -0.16, 1, 0], hipsY: [0, 0, 0.42, -0.08, 0.7, -0.06, 1, 0],
    headRX: [0, 0, 0.24, -0.18, 0.42, 0.14, 1, 0], mouth: [0, 0, 0.36, 0.85, 0.82, 0.6, 1, 0],
    browY: [0, 0, 0.26, 0.6, 0.44, -0.4, 0.84, -0.3, 1, 0], browIn: [0, 0, 0.42, -0.7, 0.85, -0.4, 1, 0],
    shLX: [0, 0, 0.42, 0.25, 1, 0], elL: [0, -0.12, 0.42, -0.5, 1, -0.12], fiL: [0, 0.2, 0.42, 0.9, 1, 0.2] } },
  clap: { dur: 2.0, keys: {
    shLX: [0, 0, 0.12, -0.72, 0.9, -0.72, 1, 0], shRX: [0, 0, 0.12, -0.72, 0.9, -0.72, 1, 0],
    elL: [0, -0.12, 0.12, -1.3, 0.9, -1.3, 1, -0.12], elR: [0, -0.12, 0.12, -1.3, 0.9, -1.3, 1, -0.12],
    shLY: [0, 0, 0.12, -0.72, 0.9, -0.72, 1, 0], shRY: [0, 0, 0.12, 0.72, 0.9, 0.72, 1, 0],
    shLZ: [0, 0.08, 0.12, 0.18, 0.9, 0.18, 1, 0.08], shRZ: [0, -0.08, 0.12, -0.18, 0.9, -0.18, 1, -0.08],
    wrLX: [0, 0, 0.12, -0.3, 0.9, -0.3, 1, 0], wrRX: [0, 0, 0.12, -0.3, 0.9, -0.3, 1, 0], fiL: [0, 0.2, 0.12, 0, 1, 0.2], fiR: [0, 0.2, 0.12, 0, 1, 0.2],
    mouth: [0, 0, 0.2, 0.35, 0.9, 0.3, 1, 0], browY: [0, 0, 0.2, 0.5, 0.9, 0.4, 1, 0] },
    osc: [['shLY', -0.24, 3.0, 0.14, 0.88, 0], ['shRY', 0.24, 3.0, 0.14, 0.88, 0], ['hipsY', 0.008, 3.0, 0.14, 0.88, 1]] },
  wave: { dur: 2.2, keys: {
    shRZ: [0, -0.08, 0.16, -2.25, 0.86, -2.25, 1, -0.08], shRX: [0, 0, 0.16, -0.3, 0.86, -0.3, 1, 0], elR: [0, -0.12, 0.16, -1.05, 0.86, -1.05, 1, -0.12],
    fiR: [0, 0.2, 0.16, 0, 1, 0.2], headRY: [0, 0, 0.16, -0.12, 0.86, -0.12, 1, 0], headRZ: [0, 0, 0.2, 0.08, 0.86, 0.08, 1, 0], spineRZ: [0, 0, 0.2, 0.05, 0.86, 0.05, 1, 0],
    mouth: [0, 0, 0.2, 0.35, 0.86, 0.35, 1, 0], browY: [0, 0, 0.2, 0.6, 0.86, 0.5, 1, 0] },
    osc: [['shRY', 0.38, 2.3, 0.2, 0.84, 0], ['wrRZ', 0.32, 2.3, 0.2, 0.84, -0.8]] },
  handsOnHead: { dur: 2.2, keys: {
    shLX: [0, 0, 0.1, 0.15, 0.26, -2.5, 0.82, -2.45, 1, 0], shRX: [0, 0, 0.1, 0.15, 0.26, -2.5, 0.82, -2.45, 1, 0],
    shLZ: [0, 0.08, 0.26, 1.0, 0.82, 0.95, 1, 0.08], shRZ: [0, -0.08, 0.26, -1.0, 0.82, -0.95, 1, -0.08],
    elL: [0, -0.12, 0.26, -2.05, 0.82, -2.0, 1, -0.12], elR: [0, -0.12, 0.26, -2.05, 0.82, -2.0, 1, -0.12],
    shLY: [0, 0, 0.26, 0.15, 0.82, 0.15, 1, 0], shRY: [0, 0, 0.26, -0.15, 0.82, -0.15, 1, 0], fiL: [0, 0.2, 0.26, 0.15, 1, 0.2], fiR: [0, 0.2, 0.26, 0.15, 1, 0.2],
    spineRX: [0, 0, 0.12, 0.08, 0.3, -0.18, 0.82, -0.08, 1, 0], headRX: [0, 0, 0.3, -0.25, 0.6, 0.1, 0.82, 0.2, 1, 0], neckRX: [0, 0, 0.6, 0.05, 0.82, 0.12, 1, 0],
    hipsY: [0, 0, 0.3, -0.03, 1, 0], mouth: [0, 0, 0.22, 0.75, 0.6, 0.45, 0.85, 0.2, 1, 0], browY: [0, 0, 0.2, 0.9, 0.85, 0.7, 1, 0], browIn: [0, 0, 0.2, 0.9, 0.85, 0.8, 1, 0] },
    osc: [['headRY', 0.12, 0.9, 0.4, 0.8, 0]] },
  slump: { dur: 2.6, keys: {
    spineRX: [0, 0, 0.08, -0.06, 0.24, 0.34, 0.82, 0.3, 1, 0], chestRX: [0, 0, 0.24, 0.16, 0.82, 0.14, 1, 0], neckRX: [0, 0, 0.24, 0.25, 0.82, 0.22, 1, 0],
    headRX: [0, 0, 0.24, 0.3, 0.82, 0.25, 1, 0], hipsY: [0, 0, 0.24, -0.04, 1, 0], hipsRX: [0, 0, 0.24, 0.06, 1, 0],
    shLX: [0, 0, 0.24, 0.08, 1, 0], shRX: [0, 0, 0.24, 0.08, 1, 0], elL: [0, -0.12, 0.24, -0.04, 1, -0.12], elR: [0, -0.12, 0.24, -0.04, 1, -0.12],
    shrugL: [0, 0, 0.08, 0.02, 0.24, -0.018, 1, 0], shrugR: [0, 0, 0.08, 0.02, 0.24, -0.018, 1, 0], fiL: [0, 0.2, 1, 0.2], fiR: [0, 0.2, 1, 0.2],
    browIn: [0, 0, 0.2, 0.9, 0.85, 0.8, 1, 0], browY: [0, 0, 0.2, -0.35, 1, 0], eyeOpen: [0, 1, 0.24, 0.7, 0.85, 0.75, 1, 1] },
    osc: [['headRY', 0.1, 0.5, 0.35, 0.8, 0]] },
  shrug: { dur: 1.3, keys: {
    shrugL: [0, 0, 0.3, 0.035, 0.65, 0.035, 1, 0], shrugR: [0, 0, 0.3, 0.035, 0.65, 0.035, 1, 0], elL: [0, -0.12, 0.3, -1.4, 0.7, -1.4, 1, -0.12], elR: [0, -0.12, 0.3, -1.4, 0.7, -1.4, 1, -0.12],
    shLZ: [0, 0.08, 0.3, 0.35, 0.7, 0.35, 1, 0.08], shRZ: [0, -0.08, 0.3, -0.35, 0.7, -0.35, 1, -0.08], shLY: [0, 0, 0.3, 0.6, 0.7, 0.6, 1, 0], shRY: [0, 0, 0.3, -0.6, 0.7, -0.6, 1, 0],
    fiL: [0, 0.2, 0.3, 0, 1, 0.2], fiR: [0, 0.2, 0.3, 0, 1, 0.2], headRZ: [0, 0, 0.3, 0.12, 0.7, 0.12, 1, 0], browY: [0, 0, 0.3, 0.8, 0.7, 0.8, 1, 0], browIn: [0, 0, 0.3, 0.4, 0.7, 0.4, 1, 0], mouth: [0, 0, 0.3, 0.2, 1, 0] } },
  point: { dur: 1.5, upper: true, keys: { fiR: [0, 0.2, 0.2, 0.7, 0.85, 0.7, 1, 0.2], browY: [0, 0, 0.2, 0.3, 1, 0] }, aim: 'R' },
  highFive: { dur: 0.95, keys: {
    shRX: [0, 0, 0.2, -1.6, 0.34, -2.55, 0.46, -2.05, 0.62, -1.55, 1, 0], shRZ: [0, -0.08, 0.34, -0.3, 0.6, -0.25, 1, -0.08],
    elR: [0, -0.12, 0.2, -1.5, 0.34, -0.7, 0.44, -0.12, 0.6, -0.45, 1, -0.12], wrRX: [0, 0, 0.34, 0.3, 0.44, -0.2, 0.6, 0.45, 1, 0], fiR: [0, 0.2, 0.2, 0, 1, 0.2],
    spineRY: [0, 0, 0.34, 0.12, 0.46, -0.18, 1, 0], spineRX: [0, 0, 0.34, -0.1, 0.46, 0.06, 1, 0], rootY: [0, 0, 0.3, 0, 0.42, 0.04, 0.55, 0, 1, 0], hipsY: [0, 0, 0.25, -0.05, 0.42, 0, 0.6, -0.03, 1, 0],
    mouth: [0, 0, 0.3, 0.7, 0.8, 0.5, 1, 0], browY: [0, 0, 0.3, 0.8, 1, 0] } },
  kick: { dur: 0.8, keys: {
    fkR: [0, 0, 0.1, 1, 0.84, 1, 1, 0], thRX: [0, 0, 0.32, 0.72, 0.48, -1.35, 0.63, -1.7, 0.86, -0.3, 1, 0], knR: [0, 0.05, 0.32, 1.65, 0.46, 0.4, 0.56, 0.08, 0.86, 0.6, 1, 0.05],
    ftR: [0, 0, 0.32, 0.45, 0.46, 0.6, 0.7, 0.3, 1, 0], thRZ: [0, 0, 0.32, -0.1, 0.6, 0.05, 1, 0],
    shLZ: [0, 0.08, 0.32, 0.95, 0.52, 0.65, 1, 0.08], shLX: [0, 0, 0.32, 0.35, 0.52, -0.8, 1, 0], shRX: [0, 0, 0.32, -0.6, 0.52, 0.65, 1, 0], shRZ: [0, -0.08, 0.32, -0.3, 1, -0.08],
    spineRX: [0, 0, 0.32, -0.14, 0.48, 0.16, 0.66, -0.06, 1, 0], hipsRY: [0, 0, 0.32, -0.25, 0.52, 0.3, 1, 0], chestRY: [0, 0, 0.32, 0.18, 0.52, -0.22, 1, 0],
    hipsY: [0, 0, 0.32, -0.07, 0.52, -0.03, 1, 0], headRX: [0, 0, 0.4, 0.28, 0.62, 0.16, 1, 0], browIn: [0, 0, 0.4, -0.4, 1, 0] } },
  throw: { dur: 1.0, keys: {
    shRZ: [0, -0.08, 0.34, -1.55, 0.5, -1.95, 0.7, -0.7, 1, -0.08], shRX: [0, 0, 0.34, 0.45, 0.5, -1.55, 0.7, -0.55, 1, 0],
    shRY: [0, 0, 0.34, -1.05, 0.5, 0.35, 0.7, 0.6, 1, 0], elR: [0, -0.12, 0.34, -1.6, 0.5, -0.25, 0.7, -0.6, 1, -0.12],
    fiR: [0, 0.2, 0.15, 0.85, 0.47, 0.85, 0.52, 0.05, 1, 0.2], wrRX: [0, 0, 0.34, 0.5, 0.52, -0.6, 1, 0],
    chestRY: [0, 0, 0.34, -0.45, 0.52, 0.35, 0.72, 0.5, 1, 0], spineRX: [0, 0, 0.34, -0.15, 0.55, 0.25, 0.75, 0.28, 1, 0], hipsRY: [0, 0, 0.34, -0.28, 0.55, 0.25, 1, 0],
    shLX: [0, 0, 0.34, -1.3, 0.55, 0.3, 1, 0], shLZ: [0, 0.08, 0.34, 0.3, 0.55, 0.45, 1, 0.08], elL: [0, -0.12, 0.34, -0.3, 0.6, -1.2, 1, -0.12],
    hipsY: [0, 0, 0.34, -0.05, 0.55, -0.08, 1, 0], headRY: [0, 0, 0.34, 0.3, 0.55, -0.15, 1, 0], browIn: [0, 0, 0.4, -0.5, 1, 0] } },
  swing: { dur: 1.0, keys: {
    chestRY: [0, 0, 0.34, -0.75, 0.47, 0.35, 0.72, 0.95, 1, 0], hipsRY: [0, 0, 0.34, -0.35, 0.5, 0.25, 0.72, 0.5, 1, 0], hipsX: [0, 0, 0.34, -0.04, 0.55, 0.05, 1, 0],
    shRX: [0, 0, 0.34, -0.35, 0.47, -1.15, 0.72, -1.45, 1, 0], shRZ: [0, -0.08, 0.34, -0.6, 0.47, -0.2, 0.72, -0.4, 1, -0.08], shRY: [0, 0, 0.47, 0.2, 0.72, 0.6, 1, 0],
    elR: [0, -0.12, 0.34, -1.45, 0.47, -0.3, 0.72, -0.85, 1, -0.12],
    shLX: [0, 0, 0.34, -0.95, 0.47, -1.15, 0.72, -1.3, 1, 0], shLY: [0, 0, 0.34, -0.7, 0.47, -0.2, 0.72, 0.2, 1, 0], shLZ: [0, 0.08, 0.34, 0.0, 0.47, 0.25, 0.72, 1.1, 1, 0.08],
    elL: [0, -0.12, 0.34, -0.6, 0.47, -0.1, 0.72, -0.95, 1, -0.12], fiL: [0, 0.2, 0.1, 0.9, 0.9, 0.9, 1, 0.2], fiR: [0, 0.2, 0.1, 0.9, 0.9, 0.9, 1, 0.2],
    spineRX: [0, 0, 0.34, 0.12, 0.5, 0.2, 0.75, 0.05, 1, 0], hipsY: [0, 0, 0.34, -0.06, 0.5, -0.09, 1, 0], headRY: [0, 0, 0.34, 0.45, 0.5, 0.1, 0.75, -0.3, 1, 0], browIn: [0, 0, 0.45, -0.5, 1, 0] } },
  jump: { dur: 1.05, keys: {
    hipsY: [0, 0, 0.22, -0.2, 0.3, 0, 0.7, 0, 0.8, -0.15, 1, 0], hipsRX: [0, 0, 0.22, 0.3, 0.32, -0.05, 0.75, 0.25, 1, 0], spineRX: [0, 0, 0.22, 0.2, 0.34, -0.1, 0.78, 0.15, 1, 0],
    rootY: [0, 0, 0.27, 0, 0.36, 0.3, 0.5, 0.42, 0.62, 0.3, 0.72, 0, 1, 0],
    fkL: [0, 0, 0.3, 0, 0.36, 1, 0.66, 1, 0.73, 0, 1, 0], fkR: [0, 0, 0.3, 0, 0.36, 1, 0.66, 1, 0.73, 0, 1, 0],
    thLX: [0, 0, 0.36, -0.15, 0.5, -0.75, 0.66, -0.35, 1, 0], thRX: [0, 0, 0.36, -0.1, 0.5, -0.65, 0.66, -0.3, 1, 0],
    knL: [0, 0, 0.36, 0.25, 0.5, 1.25, 0.66, 0.55, 1, 0], knR: [0, 0, 0.36, 0.2, 0.5, 1.15, 0.66, 0.5, 1, 0], ftL: [0, 0, 0.36, 0.5, 0.66, 0.2, 1, 0], ftR: [0, 0, 0.36, 0.5, 0.66, 0.2, 1, 0],
    shLX: [0, 0, 0.22, 0.75, 0.38, -2.4, 0.66, -1.2, 0.8, -0.4, 1, 0], shRX: [0, 0, 0.22, 0.75, 0.38, -2.4, 0.66, -1.2, 0.8, -0.4, 1, 0],
    shLZ: [0, 0.08, 0.38, 0.3, 0.8, 0.25, 1, 0.08], shRZ: [0, -0.08, 0.38, -0.3, 0.8, -0.25, 1, -0.08], elL: [0, -0.12, 0.22, -0.3, 0.4, -0.4, 1, -0.12], elR: [0, -0.12, 0.22, -0.3, 0.4, -0.4, 1, -0.12],
    headRX: [0, 0, 0.3, -0.2, 0.7, 0.1, 1, 0], mouth: [0, 0, 0.35, 0.5, 0.7, 0.2, 1, 0], browY: [0, 0, 0.35, 0.6, 1, 0] } },
  dive: { dur: 1.3, keys: {
    hipsY: [0, 0, 0.12, -0.18, 0.25, 0.0, 0.55, -0.55, 0.85, -0.55, 1, 0], rootY: [0, 0, 0.2, 0, 0.32, 0.18, 0.5, 0.05, 1, 0],
    rootRZ: [0, 0, 0.15, -0.1, 0.42, 1.3, 0.85, 1.38, 1, 0],
    shLZ: [0, 0.08, 0.25, 2.2, 0.5, 2.8, 0.85, 2.6, 1, 0.08], shRZ: [0, -0.08, 0.25, -1.9, 0.5, -2.7, 0.85, -2.5, 1, -0.08], elL: [0, -0.12, 0.3, -0.2, 1, -0.12], elR: [0, -0.12, 0.3, -0.2, 1, -0.12],
    fkL: [0, 0, 0.25, 1, 0.9, 1, 1, 0], fkR: [0, 0, 0.25, 1, 0.9, 1, 1, 0], thLZ: [0, 0, 0.42, 0.15, 1, 0], thRZ: [0, 0, 0.42, -0.45, 0.85, -0.35, 1, 0],
    knL: [0, 0, 0.2, 0.9, 0.42, 0.5, 0.85, 0.4, 1, 0], knR: [0, 0, 0.42, 0.2, 1, 0], thLX: [0, 0, 0.2, -0.6, 0.42, -0.3, 1, 0], fiL: [0, 0.2, 0.3, 0, 1, 0.2], fiR: [0, 0.2, 0.3, 0, 1, 0.2],
    headRZ: [0, 0, 0.42, -0.4, 0.85, -0.3, 1, 0], spineRZ: [0, 0, 0.42, -0.15, 1, 0], mouth: [0, 0, 0.3, 0.6, 0.8, 0.3, 1, 0], browY: [0, 0, 0.3, 0.7, 1, 0], eyeOpen: [0, 1, 0.5, 0.85, 1, 1] } },
  slide: { dur: 0.6, keys: {
    hipsY: [0, 0, 0.15, -0.45, 0.25, -0.66, 0.8, -0.66, 1, -0.3], hipsRX: [0, 0, 0.25, -0.75, 0.8, -0.8, 1, 0], spineRX: [0, 0, 0.25, 0.35, 0.8, 0.4, 1, 0],
    rootRZ: [0, 0, 0.25, -0.22, 0.8, -0.25, 1, 0], fkL: [0, 0, 0.12, 1, 0.9, 1, 1, 0], fkR: [0, 0, 0.12, 1, 0.9, 1, 1, 0],
    thRX: [0, 0, 0.25, -1.25, 0.8, -1.2, 1, 0], knR: [0, 0, 0.25, 0.1, 0.8, 0.15, 1, 0], ftR: [0, 0, 0.25, 0.45, 1, 0],
    thLX: [0, 0, 0.25, -0.25, 0.8, -0.2, 1, 0], knL: [0, 0, 0.25, 1.7, 0.8, 1.6, 1, 0], thLZ: [0, 0, 0.25, 0.25, 1, 0],
    shLX: [0, 0, 0.25, 0.75, 0.8, 0.7, 1, 0], shLZ: [0, 0.08, 0.25, 0.55, 1, 0.08], elL: [0, -0.12, 0.25, -0.1, 1, -0.12],
    shRX: [0, 0, 0.25, -0.9, 0.8, -0.8, 1, 0], shRZ: [0, -0.08, 0.25, -0.7, 1, -0.08], elR: [0, -0.12, 0.25, -0.5, 1, -0.12],
    headRX: [0, 0, 0.25, 0.35, 1, 0], browIn: [0, 0, 0.25, -0.6, 1, 0], mouth: [0, 0, 0.25, 0.4, 1, 0] } },
  stumble: { dur: 0.75, keys: {
    spineRX: [0, 0, 0.2, 0.42, 0.45, 0.25, 1, 0], hipsY: [0, 0, 0.2, -0.12, 0.5, -0.06, 1, 0], hipsRX: [0, 0, 0.2, 0.2, 1, 0],
    shLZ: [0, 0.08, 0.2, 0.9, 0.55, 0.6, 1, 0.08], shRZ: [0, -0.08, 0.2, -0.8, 0.55, -0.5, 1, -0.08], shLX: [0, 0, 0.2, -0.5, 1, 0], shRX: [0, 0, 0.2, -0.3, 1, 0],
    elL: [0, -0.12, 0.2, -0.3, 1, -0.12], elR: [0, -0.12, 0.2, -0.4, 1, -0.12], fiL: [0, 0.2, 0.2, 0, 1, 0.2], fiR: [0, 0.2, 0.2, 0, 1, 0.2],
    headRX: [0, 0, 0.2, -0.3, 0.6, 0.1, 1, 0], mouth: [0, 0, 0.15, 0.6, 0.6, 0.2, 1, 0], browY: [0, 0, 0.15, 0.8, 1, 0], eyeOpen: [0, 1, 0.15, 1.15, 1, 1] },
    osc: [['spineRZ', 0.12, 2.4, 0.15, 0.85, 0]] },
  fall: { dur: 1.6, keys: {
    rootRX: [0, 0, 0.12, -0.25, 0.3, -1.42, 0.7, -1.48, 0.86, -0.6, 1, 0], hipsY: [0, 0, 0.12, -0.2, 0.3, -0.62, 0.72, -0.62, 0.86, -0.35, 1, 0],
    fkL: [0, 0, 0.1, 1, 0.8, 1, 0.92, 0], fkR: [0, 0, 0.1, 1, 0.8, 1, 0.92, 0], thLX: [0, 0, 0.3, -0.9, 0.7, -0.8, 0.86, -1.2, 1, 0], thRX: [0, 0, 0.3, -0.4, 0.7, -0.5, 0.86, -0.9, 1, 0],
    knL: [0, 0, 0.3, 1.2, 0.7, 1.3, 0.86, 1.8, 1, 0], knR: [0, 0, 0.3, 0.5, 0.7, 0.6, 0.86, 1.6, 1, 0],
    shLZ: [0, 0.08, 0.12, 1.2, 0.3, 0.9, 0.7, 0.5, 1, 0.08], shRZ: [0, -0.08, 0.12, -1.2, 0.3, -0.9, 0.7, -0.5, 1, -0.08], shLX: [0, 0, 0.3, 0.6, 0.86, 0.9, 1, 0], shRX: [0, 0, 0.3, 0.6, 0.86, 0.9, 1, 0],
    elL: [0, -0.12, 0.3, -0.6, 1, -0.12], elR: [0, -0.12, 0.3, -0.6, 1, -0.12], headRX: [0, 0, 0.3, 0.5, 0.7, 0.4, 1, 0], spineRX: [0, 0, 0.3, 0.2, 0.86, 0.5, 1, 0],
    mouth: [0, 0, 0.12, 0.7, 0.4, 0.3, 1, 0], browIn: [0, 0, 0.3, 0.8, 1, 0], eyeOpen: [0, 1, 0.3, 0.6, 0.7, 0.8, 1, 1] } },
  carry: { dur: 0.35, hold: true, keys: {
    shLX: [0, 0, 1, -0.75], shRX: [0, 0, 1, -0.75], elL: [0, -0.12, 1, -1.35], elR: [0, -0.12, 1, -1.35], shLY: [0, 0, 1, -0.55], shRY: [0, 0, 1, 0.55],
    shLZ: [0, 0.08, 1, 0.12], shRZ: [0, -0.08, 1, -0.12], wrLX: [0, 0, 1, -0.3], wrRX: [0, 0, 1, -0.3], fiL: [0, 0.2, 1, 0.5], fiR: [0, 0.2, 1, 0.5] } },
  crouch: { dur: 0.5, hold: true, keys: {
    hipsY: [0, 0, 1, -0.3], hipsRX: [0, 0, 1, 0.38], spineRX: [0, 0, 1, 0.24], chestRX: [0, 0, 1, 0.06], headRX: [0, 0, 1, -0.42], neckRX: [0, 0, 1, -0.12],
    fLx: [0, 0.1, 1, 0.19], fRx: [0, -0.1, 1, -0.19], fLz: [0, 0.02, 1, 0.06], fRz: [0, -0.02, 1, -0.06],
    shLX: [0, 0, 1, -0.55], shRX: [0, 0, 1, -0.55], elL: [0, -0.12, 1, -0.7], elR: [0, -0.12, 1, -0.7], shLZ: [0, 0.08, 1, 0.22], shRZ: [0, -0.08, 1, -0.22], browIn: [0, 0, 1, -0.3] } },
  reach: { dur: 0.95, keys: { fiR: [0, 0.2, 0.3, 0, 0.8, 0, 1, 0.2], rootY: [0, 0, 0.35, 0.03, 0.7, 0.03, 1, 0], spineRX: [0, 0, 0.4, -0.05, 1, 0], browY: [0, 0, 0.3, 0.4, 1, 0] }, aim: 'R' },
  sit: { dur: 0.9, hold: true, keys: {
    hipsY: [0, 0, 0.45, -0.3, 1, -0.47], hipsZ: [0, 0, 1, -0.12], fkL: [0, 0, 0.35, 1, 1, 1], fkR: [0, 0, 0.35, 1, 1, 1],
    thLX: [0, 0, 0.5, -1.0, 1, -1.48], thRX: [0, 0, 0.5, -1.0, 1, -1.48], knL: [0, 0, 0.5, 1.1, 1, 1.42], knR: [0, 0, 0.5, 1.1, 1, 1.42], thLZ: [0, 0, 1, 0.06], thRZ: [0, 0, 1, -0.06],
    spineRX: [0, 0, 0.45, 0.32, 1, 0.04], shLX: [0, 0, 1, -0.45], shRX: [0, 0, 1, -0.45], elL: [0, -0.12, 1, -0.75], elR: [0, -0.12, 1, -0.75], shLY: [0, 0, 1, -0.25], shRY: [0, 0, 1, 0.25] } },
  drive: { dur: 0.7, hold: true, keys: {
    hipsY: [0, 0, 1, -0.5], hipsZ: [0, 0, 1, -0.1], fkL: [0, 0, 0.3, 1, 1, 1], fkR: [0, 0, 0.3, 1, 1, 1], thLX: [0, 0, 1, -1.32], thRX: [0, 0, 1, -1.32],
    knL: [0, 0, 1, 1.05], knR: [0, 0, 1, 1.05], ftL: [0, 0, 1, -0.2], ftR: [0, 0, 1, -0.2], thLZ: [0, 0, 1, 0.1], thRZ: [0, 0, 1, -0.1],
    spineRX: [0, 0, 1, -0.06], shLX: [0, 0, 1, -1.05], shRX: [0, 0, 1, -1.05], elL: [0, -0.12, 1, -0.75], elR: [0, -0.12, 1, -0.75],
    shLY: [0, 0, 1, -0.28], shRY: [0, 0, 1, 0.28], fiL: [0, 0.2, 1, 0.85], fiR: [0, 0.2, 1, 0.85], wrLX: [0, 0, 1, -0.2], wrRX: [0, 0, 1, -0.2] } },
};
for (const k in ACTIONS) {
  const a = ACTIONS[k]; a.name = k;
  a.k = []; for (const ch in a.keys) a.k.push([C[ch], a.keys[ch]]);
  a.o = (a.osc || []).map((o) => [C[o[0]], o[1], o[2], o[3], o[4], o[5]]);
  a.lowerOnly = false;
  // an upper-body action can layer over a held one (wave while seated)
  if (a.upper == null) a.upper = !a.k.some((e) => LOWER[e[0]] && !(e[0] === C.hipsY || e[0] === C.rootY || e[0] === C.hipsRY || e[0] === C.hipsRX || e[0] === C.hipsX));
}
function keyAt(arr, t) {
  if (t <= arr[0]) return arr[1];
  for (let i = 2; i < arr.length; i += 2) {
    if (t <= arr[i]) { const t0 = arr[i - 2], t1 = arr[i]; const u = t1 > t0 ? (t - t0) / (t1 - t0) : 1; return lerp(arr[i - 1], arr[i + 1], smooth(u)); }
  }
  return arr[arr.length - 1];
}

/* ------------------------------------------------------------------ gait: one foot's target at phase p (no allocation) */
function gaitFoot(p, out, beta, L, lift, run) {
        p -= Math.floor(p);
        const fwd = lerp(0.4, 0.46, run); // the foot lands a little nearer than it leaves
        if (p < beta) {
          const s = p / beta; out[0] = L * beta * (fwd - s); out[1] = 0;
          // heel strike (toe up), flat, then the heel rises and the foot rolls over the toe
          const roll = s > 0.55 ? smooth((s - 0.55) / 0.45) * (0.75 + run * 0.25) : 0;
          out[2] = s < 0.15 ? lerp(-0.22 * (1 - run * 0.6), 0, s / 0.15) : roll;
          out[1] = Math.sin(roll) * 0.13; out[0] += (1 - Math.cos(roll)) * 0.13;
        } else {
          const s = (p - beta) / (1 - beta), e = 0.75 + run * 0.25;
          // continue from where the toe-off left the ankle
          const z0 = -L * beta * (1 - fwd) + (1 - Math.cos(e)) * 0.13, y0 = Math.sin(e) * 0.13;
          out[0] = lerp(z0, L * beta * fwd, smooth(s));
          out[1] = lerp(y0, 0, smooth(s)) + lift * Math.sin(PI * Math.pow(s, 0.75 + run * 0.15)) + run * 0.12 * Math.sin(PI * Math.min(1, s * 1.6)) * (1 - s);
          out[2] = lerp(0.75 + run * 0.25, -0.25, smooth(Math.min(1, s * 1.3)));
        }
      }

/* ------------------------------------------------------------------ createHuman */
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _m1 = new THREE.Matrix4(), _q1 = new THREE.Quaternion();
const HAIRS_M = [['short', 5], ['buzz', 2], ['curly', 1.4], ['bald', 0.4], ['long', 0.3]];
const HAIRS_F = [['long', 3], ['ponytail', 2.5], ['bun', 2], ['short', 0.6], ['curly', 0.6]];

export function createHuman(opts) {
  opts = opts || {};
  const r = rng(opts.seed == null ? Math.random() * 1e6 : opts.seed);
  const quality = opts.quality == null ? 3 : clamp(opts.quality | 0, 0, 3);
  const sex = opts.sex || (r() < 0.82 ? 'm' : 'f');
  const build = opts.build || wpick(r, [['average', 4], ['athletic', 3], ['slim', 2], ['heavy', 1]]);
  const hair = opts.hair || wpick(r, sex === 'f' ? HAIRS_F : HAIRS_M);
  const older = opts.age === 'older';
  const skinHex = opts.skin || wpick(r, SKIN_TONES);
  const hairHex = opts.hairColor || wpick(r, older ? OLD_HAIR : HAIR_COLORS);
  const height = opts.height || (sex === 'f' ? 1.62 : 1.74) * (1 + (r() * 2 - 1) * 0.06);
  const unit = opts.unit || 1;
  let lod = opts.lod || (quality >= 2 ? 'full' : quality === 1 ? 'mid' : 'far');
  const S = shared();

  // skeleton
  const bones = {}, list = [];
  for (const n of BONE_NAMES) {
    const b = new THREE.Bone(); b.name = n; const rr = REST[n];
    b.position.set(rr[1], rr[2], rr[3]);
    if (ORDER[n]) b.rotation.order = ORDER[n];
    if (rr[0]) bones[rr[0]].add(b);
    bones[n] = b; list.push(b);
  }
  const skeleton = new THREE.Skeleton(list);
  const group = new THREE.Group(); group.name = 'human';
  const body = new THREE.Group(); body.scale.setScalar(unit * height / 1.75); group.add(body);

  let T = template(lod, sex, build, hair);
  const geo = new THREE.BufferGeometry();
  let colAttr = null, uvAttr = null;
  const attach = (t) => {
    geo.setAttribute('position', t.position); geo.setAttribute('normal', t.normal);
    geo.setAttribute('skinIndex', t.skinIndex); geo.setAttribute('skinWeight', t.skinWeight); geo.setIndex(t.index);
    colAttr = new THREE.BufferAttribute(new Float32Array(t.n * 3), 3);
    uvAttr = new THREE.BufferAttribute(new Float32Array(t.uv), 2);
    geo.setAttribute('color', colAttr); geo.setAttribute('uv', uvAttr);
  };
  attach(T);
  const mesh = new THREE.SkinnedMesh(geo, S.mat);
  mesh.add(bones.root);
  mesh.bind(skeleton);
  mesh.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 1.6);
  mesh.castShadow = opts.castShadow != null ? !!opts.castShadow : quality >= 1;
  mesh.receiveShadow = quality >= 2;
  body.add(mesh);

  // outfit
  const outfit = { top: '#e8e2d6', top2: null, sleeves: 'short', bottom: '#2f3a52', legs: 'trousers', socks: null, socksHigh: false,
    shoes: '#2a2a2e', soles: '#3a3836', gloves: null, number: null, numberInk: null, cap: null, helmet: null };
  if (!opts.outfit || !opts.outfit.top) { outfit.top = CLOTH[(r() * CLOTH.length) | 0]; outfit.bottom = PANTS[(r() * PANTS.length) | 0]; if (r() < 0.3) outfit.sleeves = 'long'; }
  const cTmp = new THREE.Color(), cSkin = new THREE.Color(), cHair = new THREE.Color();
  const zc = new Float32Array(23 * 3);
  const setZ = (z, hex, mul) => { cTmp.set(hex); if (mul) cTmp.multiplyScalar(mul); zc[z * 3] = cTmp.r; zc[z * 3 + 1] = cTmp.g; zc[z * 3 + 2] = cTmp.b; };
  let capMesh = null, helmetMesh = null;
  const recolor = () => {
    const o = outfit;
    cSkin.set(skinHex); cHair.set(hairHex);
    setZ(Z.SKIN, skinHex); setZ(Z.EAR, skinHex, 0.93); setZ(Z.TOP, o.top); setZ(Z.TOP2, o.top2 || o.top, o.top2 ? 1 : 0.86);
    const long = o.sleeves === 'long', none = o.sleeves === 'none';
    setZ(Z.ARM_U, none ? skinHex : o.top); setZ(Z.ARM_L, long ? o.top : skinHex); setZ(Z.FORE, long ? o.top : skinHex);
    setZ(Z.HAND, o.gloves || skinHex); setZ(Z.BOT, o.bottom); setZ(Z.THIGH_U, o.bottom);
    const tr = o.legs === 'trousers', ls = o.legs === 'long-shorts';
    setZ(Z.THIGH_L, tr || ls ? o.bottom : skinHex); setZ(Z.KNEE, tr ? o.bottom : skinHex);
    setZ(Z.SHIN_U, tr ? o.bottom : o.socks && o.socksHigh ? o.socks : skinHex);
    setZ(Z.SHIN_L, tr ? o.bottom : o.socks && o.socksHigh ? o.socks : skinHex);
    setZ(Z.ANKLE, tr ? o.bottom : o.socks || skinHex);
    setZ(Z.SHOE, o.shoes); setZ(Z.SOLE, o.soles); setZ(Z.HAIR, hairHex); setZ(Z.BROW, hairHex, 0.85);
    setZ(Z.EYEW, '#e9e3d8'); setZ(Z.IRIS, '#1d130c');
    cTmp.copy(cSkin).multiplyScalar(0.72); cTmp.r = Math.min(1, cTmp.r * 1.12); zc[Z.LIP * 3] = cTmp.r; zc[Z.LIP * 3 + 1] = cTmp.g; zc[Z.LIP * 3 + 2] = cTmp.b;
    let ink = o.numberInk;
    if (!ink) { cTmp.set(o.top); const l = cTmp.r * 0.3 + cTmp.g * 0.59 + cTmp.b * 0.11; ink = o.top2 && Math.abs(new THREE.Color(o.top2).getHSL({ h: 0, s: 0, l: 0 }).l - l) > 0.3 ? o.top2 : l > 0.45 ? '#16161b' : '#ffffff'; }
    setZ(Z.NUM, ink);
    const a = colAttr.array, zone = T.zone, ys = T.ys;
    for (let i = 0; i < T.n; i++) {
      const z = zone[i];
      // a little grime and shade near the ground, a little warmth at the top
      const y = ys[i], g = z >= Z.KNEE && z <= Z.SOLE ? 0.82 + 0.18 * sstep(0.0, 0.45, y) : 1;
      const k = z === Z.TOP || z === Z.BOT ? 0.94 + 0.06 * sstep(0.85, 1.4, y) : 1;
      a[i * 3] = zc[z * 3] * g * k; a[i * 3 + 1] = zc[z * 3 + 1] * g * k; a[i * 3 + 2] = zc[z * 3 + 2] * g * k;
    }
    colAttr.needsUpdate = true;
    // number plates
    const uv = uvAttr.array, n = o.number;
    for (const pl of T.plates) {
      for (let i = pl[0]; i < pl[0] + pl[1]; i++) {
        if (n == null || n < 0 || n > 99) { uv[i * 2] = cellU(7); uv[i * 2 + 1] = STRIP_V; continue; }
        const pu = T.uv[i * 2], pv = T.uv[i * 2 + 1];
        const u0 = (n % 10) * 0.1, vT = 1 - ((n / 10) | 0) * 96 / 1024, vB = vT - 96 / 1024;
        uv[i * 2] = u0 + (0.012 + pu * 0.076); uv[i * 2 + 1] = vB + (0.004 + pv * 0.086);
      }
    }
    uvAttr.needsUpdate = true;
    // cap and helmet
    const G = accGeos();
    if (o.cap && !o.helmet) { if (!capMesh) { capMesh = new THREE.Mesh(G.cap, accMat(o.cap)); capMesh.castShadow = mesh.castShadow; bones.head.add(capMesh); } capMesh.material = accMat(o.cap); capMesh.visible = true; }
    else if (capMesh) capMesh.visible = false;
    if (o.helmet) { if (!helmetMesh) { helmetMesh = new THREE.Mesh(G.helmet, accMat(o.helmet)); helmetMesh.castShadow = mesh.castShadow; bones.head.add(helmetMesh); } helmetMesh.material = accMat(o.helmet); helmetMesh.visible = true; }
    else if (helmetMesh) helmetMesh.visible = false;
  };
  Object.assign(outfit, opts.outfit || {});
  recolor();

  /* ---------------- animation state */
  const P = new Float32Array(NCH), A = new Float32Array(NCH);
  const st = {
    t: r() * 100, ph: r(), breathF: 0.2 + r() * 0.08, breathP: r() * TAU, shiftF: 0.08 + r() * 0.07, shiftP: r() * TAU,
    stance: 0.1 + r() * 0.03, stag: (r() - 0.5) * 0.08, idleLean: (r() - 0.5) * 0.04,
    blinkT: 1 + r() * 4, blink: 0.5, blinkC: 0.5, dbl: false, glanceT: 1 + r() * 3, gYaw: 0, gPitch: 0, gtYaw: 0, gtPitch: 0,
    lookYaw: 0, lookPitch: 0, eyeYaw: 0, eyePitch: 0, mood: 0, moodS: 0,
    speed: 0, turn: 0, accel: 0, gw: 0, run: 0, bank: 0, lean: 0,
    lastX: NaN, lastZ: NaN, lastYaw: NaN, lastSpeed: 0, steer: 0, steerS: 0,
    temper: 0.85 + r() * 0.3, drop: 0, dt: 0, // idle energy: some people fidget more
  };
  st.blink = 0; st.blinkC = 0; // (declared as fractions so these fields stay unboxed doubles)
  if (older) { st.breathF *= 0.85; st.temper *= 0.8; }
  let lookTarget = null; const lookV = new THREE.Vector3();
  const slots = []; // action instances
  const faceOn = quality >= 1 && lod !== 'far';

  function play(name, o) {
    const spec = ACTIONS[name];
    if (!spec) return 0;
    o = o || {};
    const sp = o.speed || 1;
    const inst = { spec, t: (o.from ? clamp(o.from, 0, 0.95) : 0) * spec.dur / sp, dur: spec.dur / sp, hold: o.hold != null ? !!o.hold : !!spec.hold, out: -1, side: o.side === 'left' ? -1 : 1,
      amt: o.intensity == null ? 1 : clamp(o.intensity, 0, 1), t0: 0, onDone: o.onDone || null, bars: !!o.bars, layer: 0, target: null };
    inst.t0 = inst.t;
    if (o.target) { inst.target = new THREE.Vector3().copy(o.target); }
    // layer over a held full-body action when this one is upper-body only
    const held = slots.find((s) => s.out < 0 && s.hold && s.layer === 0);
    inst.layer = spec.upper && held && held.spec !== spec ? 1 : 0;
    for (const s of slots) if (s.layer === inst.layer && s.out < 0) s.out = 0;
    slots.push(inst);
    while (slots.length > 5) slots.shift();
    return inst.dur;
  }
  function stop(name) { for (const s of slots) if (!name || s.spec.name === name) { if (s.out < 0) s.out = 0; } }
  function playing(name) { return slots.some((s) => s.out < 0 && (!name || s.spec.name === name)); }

  const evalAction = (s, k) => {
    const sp = s.spec, side = s.side;
    for (const e of sp.k) { const ch = side > 0 ? e[0] : MIR[e[0]]; A[ch] = keyAt(e[1], k) * (side > 0 ? 1 : MSG[e[0]]); }
    if (sp.o.length) {
      const tt = s.t;
      for (const o of sp.o) {
        if (k < o[3] || k > o[4]) continue;
        const env = sstep(o[3], o[3] + 0.06, k) * (1 - sstep(o[4] - 0.06, o[4], k));
        const ch = side > 0 ? o[0] : MIR[o[0]];
        A[ch] += Math.sin(tt * o[2] * TAU + o[5]) * o[1] * env * (side > 0 ? 1 : MSG[o[0]]);
      }
    }
    if (sp.aim) aimArm(s, k);
    if (sp.name === 'drive') {
      const sv = st.steerS;
      if (s.bars) { A[C.shLZ] += 0.32; A[C.shRZ] -= 0.32; A[C.shLX] += 0.2; A[C.shRX] += 0.2; A[C.shLX] -= sv * 0.25; A[C.shRX] += sv * 0.25; }
      else { A[C.shLX] += sv * 0.35; A[C.shRX] -= sv * 0.35; A[C.shLZ] -= sv * 0.2; A[C.shRZ] -= sv * 0.2; }
      A[C.chestRY] = sv * 0.12; A[C.headRY] = sv * 0.25; A[C.headRZ] = -sv * 0.08;
    }
  };
  // persistent aim (h.aim): an arm kept pointing at a target that may move every frame
  const aims = { L: null, R: null, wL: 0, wR: 0, elL: -0.12, elR: -0.12 };
  const aimPersistent = (dt) => {
    for (let li = 0; li < 2; li++) {
      const L = li === 0;
      const tgt = L ? aims.L : aims.R;
      const wk = L ? 'wL' : 'wR';
      aims[wk] += ((tgt ? 1 : 0) - aims[wk]) * Math.min(1, dt * 8);
      if (aims[wk] < 0.002) { aims[wk] = 0; continue; }
      if (tgt) { _v2.copy(tgt); body.worldToLocal(_v2); }
      else continue;
      const sh = L ? RESTW.shoulderL : RESTW.shoulderR;
      let dx = _v2.x - sh[0], dy = _v2.y - sh[1], dz = _v2.z - sh[2];
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
      const w = smooth(aims[wk]);
      const cx = L ? C.shLX : C.shRX, cz = L ? C.shLZ : C.shRZ, ce = L ? C.elL : C.elR, cy = L ? C.shLY : C.shRY;
      P[cx] = lerp(P[cx], -Math.asin(clamp(dz, -1, 1)), w); P[cz] = lerp(P[cz], Math.atan2(dx, -dy), w);
      P[cy] = lerp(P[cy], 0, w); P[ce] = lerp(P[ce], L ? aims.elL : aims.elR, w);
    }
  };
  const aimArm = (s, k) => {
    // point the arm at the target (or up and forward) through the shoulder
    const L = s.side < 0;
    let dx = 0, dy = 0.75, dz = 0.66;
    if (s.target) {
      _v1.copy(s.target); body.worldToLocal(_v1);
      const sh = L ? RESTW.shoulderL : RESTW.shoulderR;
      dx = _v1.x - sh[0]; dy = _v1.y - sh[1]; dz = _v1.z - sh[2];
      const l = Math.hypot(dx, dy, dz) || 1; dx /= l; dy /= l; dz /= l;
    }
    const w = sstep(0, 0.32, k) * (1 - sstep(0.78, 1, k));
    const rx = -Math.asin(clamp(dz, -1, 1)), rz = Math.atan2(dx, -dy);
    const cx = L ? C.shLX : C.shRX, cz = L ? C.shLZ : C.shRZ, ce = L ? C.elL : C.elR;
    A[cx] = lerp(A[cx], rx, w); A[cz] = lerp(A[cz], rz, w); A[ce] = lerp(A[ce], -0.12, w);
    A[C.headRY] = lerp(A[C.headRY], Math.atan2(dx, dz) * 0.5, w); A[C.headRX] = lerp(A[C.headRX], -Math.asin(clamp(dy, -1, 1)) * 0.5, w);
  };

  /* ---------------- base pose: idle + gait */
  function basePose(dt) {
    P.fill(0);
    const t = st.t, v = st.speed, run = st.run, gw = st.gw;
    // idle: breathing and a slow weight shift from foot to foot
    const br = Math.sin(t * st.breathF * TAU + st.breathP);
    const sh = Math.sin(t * st.shiftF * TAU + st.shiftP), sh2 = Math.sin(t * st.shiftF * 2.3 * TAU + st.shiftP * 1.7);
    const idle = 1 - gw;
    P[C.hipsX] = sh * 0.028 * idle * st.temper;
    P[C.hipsRZ] = -sh * 0.045 * idle; P[C.spineRZ] = sh * 0.03 * idle; P[C.chestRZ] = sh * 0.02 * idle;
    P[C.hipsRY] = sh2 * 0.04 * idle; P[C.chestRY] = -sh2 * 0.03 * idle;
    P[C.spineRX] = br * 0.012 + st.idleLean * idle; P[C.chestRX] = -br * 0.014;
    P[C.shrugL] = P[C.shrugR] = br * 0.0035;
    P[C.hipsY] = -0.006 - Math.abs(sh) * 0.008 * idle;
    P[C.shLZ] = 0.085 + br * 0.008; P[C.shRZ] = -0.085 - br * 0.008;
    P[C.shLX] = 0.02 + sh2 * 0.02 * idle; P[C.shRX] = 0.02 - sh2 * 0.02 * idle;
    P[C.elL] = -0.14; P[C.elR] = -0.14; P[C.fiL] = 0.28; P[C.fiR] = 0.28; P[C.wrLZ] = 0.05; P[C.wrRZ] = -0.05;
    P[C.headRZ] = -sh * 0.03 * idle; P[C.eyeOpen] = 1;
    // idle feet
    const sw = st.stance;
    let fLx = sw, fLz = st.stag, fRx = -sw, fRz = -st.stag, fLy = 0, fRy = 0, fLp = 0, fRp = 0;
    if (gw > 0.001) {
      // gait: cadence and stride from real speed, feet planted while on the ground
      const ph = st.ph;
      const beta = lerp(0.62, 0.32, run);
      const f = gaitCadence(v), L = f > 0 ? v / f : 0;
      const lift = lerp(0.07, 0.17, run) + Math.min(0.08, v * 0.006);
      gaitFoot(ph, FT, beta, L, lift, run); const lz = FT[0], ly = FT[1], lp = FT[2];
      gaitFoot(ph + 0.5, FT, beta, L, lift, run); const rz = FT[0], ry = FT[1], rp = FT[2];
      const stw = lerp(sw * 0.85, 0.06, run);
      fLx = lerp(fLx, stw, gw); fRx = lerp(fRx, -stw, gw);
      fLz = lerp(fLz, lz, gw); fRz = lerp(fRz, rz, gw); fLy = ly * gw; fRy = ry * gw; fLp = lp * gw; fRp = rp * gw;
      // pelvis: bob, rotation with the stride, roll toward the stance leg
      const c2 = Math.cos(ph * TAU), s4 = Math.cos(ph * 2 * TAU);
      const vk = Math.min(1, v / 3);
      P[C.hipsY] += (lerp(0.012, 0.035, run) * -s4 - 0.03 - run * 0.05) * gw;
      P[C.hipsRY] += -c2 * lerp(0.1, 0.16, run) * vk * gw; P[C.chestRY] += c2 * lerp(0.08, 0.2, run) * vk * gw;
      P[C.hipsRZ] += Math.sin(ph * TAU) * 0.04 * (1 - run) * gw;
      // arms counter-swing, elbows bend more as the pace lifts
      const amp = clamp(0.25 + v * 0.11, 0.2, 0.95);
      const elb = lerp(0.3, 1.45, run);
      P[C.shLX] = lerp(P[C.shLX], c2 * amp - run * 0.15, gw); P[C.shRX] = lerp(P[C.shRX], -c2 * amp - run * 0.15, gw);
      P[C.elL] = lerp(P[C.elL], -elb - Math.max(0, -c2) * 0.3 * run, gw); P[C.elR] = lerp(P[C.elR], -elb - Math.max(0, c2) * 0.3 * run, gw);
      P[C.shLZ] += run * 0.08 * gw; P[C.shRZ] -= run * 0.08 * gw;
      P[C.fiL] = lerp(P[C.fiL], 0.4 + run * 0.5, gw); P[C.fiR] = lerp(P[C.fiR], 0.4 + run * 0.5, gw);
      P[C.headRX] += -0.02 * gw;
    }
    // lean into speed, acceleration and turns
    const leanT = clamp(0.02 * Math.min(v, 8) + st.accel * 0.025, -0.15, 0.32) * gw;
    st.lean += (leanT - st.lean) * Math.min(1, dt * 6);
    st.bank += (clamp(-st.turn * v * 0.045, -0.35, 0.35) - st.bank) * Math.min(1, dt * 6);
    P[C.hipsRX] += st.lean * 0.55; P[C.spineRX] += st.lean * 0.45; P[C.neckRX] -= st.lean * 0.5; P[C.headRX] -= st.lean * 0.3;
    P[C.hipsRZ] += st.bank * 0.6; P[C.spineRZ] += st.bank * 0.3; P[C.headRZ] -= st.bank * 0.5;
    // keep the head steady against the body's twist
    P[C.neckRY] = -(P[C.hipsRY] + P[C.chestRY]) * 0.75;
    P[C.fLx] = fLx; P[C.fLy] = fLy; P[C.fLz] = fLz; P[C.fLp] = fLp;
    P[C.fRx] = fRx; P[C.fRy] = fRy; P[C.fRz] = fRz; P[C.fRp] = fRp;
    // mood at rest
    P[C.browY] = st.moodS * 0.35; P[C.browIn] = -Math.min(0, st.moodS) * 0.6; P[C.mouth] = Math.max(0, st.moodS) * 0.12;
  }
  const FT = [0, 0, 0];

  /* ---------------- leg IK and bone writes */
  const legIK = (side, out) => {
    const L = side > 0;
    const hb = L ? bones.hipL : bones.hipR;
    _v1.set(P[L ? C.fLx : C.fRx], ANKLE_Y + P[L ? C.fLy : C.fRy], P[L ? C.fLz : C.fRz]);
    // into pelvis space, then relative to the hip joint
    _v1.applyMatrix4(_m1);
    _v1.sub(hb.position);
    const dx = _v1.x, dy = _v1.y, dz = _v1.z;
    const rz = Math.atan2(dx, -dy);
    const dyz = Math.hypot(dx, dy);
    let d = Math.hypot(dyz, dz);
    d = clamp(d, 0.12, (THIGH + SHIN) * 0.9995);
    const alpha = Math.atan2(-dz, dyz);
    const phi = Math.acos(clamp((THIGH * THIGH + d * d - SHIN * SHIN) / (2 * THIGH * d), -1, 1));
    const psi = Math.acos(clamp((THIGH * THIGH + SHIN * SHIN - d * d) / (2 * THIGH * SHIN), -1, 1));
    out[0] = alpha - phi; out[1] = rz; out[2] = PI - psi;
  };
  const IK = [0, 0, 0];
  function apply() {
    const bn = bones;
    bn.root.position.set(0, Math.max(0, P[C.rootY]), 0); bn.root.rotation.set(P[C.rootRX], P[C.rootRY], P[C.rootRZ]);
    // drop the pelvis just enough that a foot on the ground can still reach it (long strides, wide stances)
    let drop = 0;
    const hy = REST.pelvis[2] + P[C.hipsY] - 0.045, reach = (THIGH + SHIN) * 0.985;
    for (let s = 0; s < 2; s++) {
      const fx = P[s ? C.fRx : C.fLx], fy = P[s ? C.fRy : C.fLy], fz = P[s ? C.fRz : C.fLz], fk = P[s ? C.fkR : C.fkL];
      const dx = fx - (s ? -0.09 : 0.09) - P[C.hipsX], dz = fz - P[C.hipsZ];
      const h2 = reach * reach - dx * dx - dz * dz;
      const need = hy - (ANKLE_Y + fy + (h2 > 0 ? Math.sqrt(h2) : 0));
      const w = (1 - sstep(0.0, 0.18, fy)) * (1 - clamp(fk, 0, 1));
      if (need * w > drop) drop = need * w;
    }
    st.drop += (Math.min(drop, 0.3) - st.drop) * (st.dt > 0 ? Math.min(1, st.dt * 20) : 1);
    bn.pelvis.position.set(P[C.hipsX], REST.pelvis[2] + P[C.hipsY] - st.drop, P[C.hipsZ]); bn.pelvis.rotation.set(P[C.hipsRX], P[C.hipsRY], P[C.hipsRZ]);
    bn.spine.rotation.set(P[C.spineRX], P[C.spineRY], P[C.spineRZ]);
    bn.chest.rotation.set(P[C.chestRX], P[C.chestRY], P[C.chestRZ]);
    bn.neck.rotation.set(P[C.neckRX], P[C.neckRY], P[C.neckRZ]);
    bn.head.rotation.set(P[C.headRX], P[C.headRY], P[C.headRZ]);
    bn.shoulderL.position.y = REST.shoulderL[2] + P[C.shrugL]; bn.shoulderR.position.y = REST.shoulderR[2] + P[C.shrugR];
    bn.shoulderL.rotation.set(P[C.shLX], P[C.shLY], P[C.shLZ]); bn.shoulderR.rotation.set(P[C.shRX], P[C.shRY], P[C.shRZ]);
    bn.elbowL.rotation.set(P[C.elL], 0, 0); bn.elbowR.rotation.set(P[C.elR], 0, 0);
    bn.wristL.rotation.set(P[C.wrLX], 0, P[C.wrLZ]); bn.wristR.rotation.set(P[C.wrRX], 0, P[C.wrRZ]);
    bn.fingersL.rotation.set(0, 0, -P[C.fiL] * 1.3); bn.fingersR.rotation.set(0, 0, P[C.fiR] * 1.3);
    // legs: IK from the foot targets, blended with any posed (FK) legs
    bn.pelvis.updateMatrix(); _m1.copy(bn.pelvis.matrix).invert();
    for (let si = 0; si < 2; si++) {
      const side = si ? -1 : 1, L = side > 0;
      legIK(side, IK);
      const fk = clamp(P[L ? C.fkL : C.fkR], 0, 1);
      const tx = lerp(IK[0], P[L ? C.thLX : C.thRX], fk), tz = lerp(IK[1], P[L ? C.thLZ : C.thRZ], fk), kn = lerp(IK[2], P[L ? C.knL : C.knR], fk);
      const hb = L ? bn.hipL : bn.hipR, kb = L ? bn.kneeL : bn.kneeR, ab = L ? bn.ankleL : bn.ankleR;
      hb.rotation.set(tx, 0, tz); kb.rotation.set(kn, 0, 0);
      // foot stays level with the ground (plus the gait's heel and toe roll) unless posed
      const level = P[L ? C.fLp : C.fRp] - (P[C.hipsRX] + P[C.rootRX] + tx + kn);
      ab.rotation.set(lerp(level, P[L ? C.ftL : C.ftR], fk), 0, -tz * (1 - fk));
    }
    // face
    const open = clamp(P[C.eyeOpen], 0, 1) * (1 - st.blink);
    const ey = 0.08 + 0.92 * open;
    bn.eyeL.scale.set(1, ey, 1); bn.eyeR.scale.set(1, ey, 1);
    bn.eyeL.rotation.set(st.eyePitch, st.eyeYaw, 0); bn.eyeR.rotation.set(st.eyePitch, st.eyeYaw, 0);
    const by = P[C.browY] * 0.006 + (1 - open) * -0.002, bi = P[C.browIn];
    bn.browL.position.y = REST.browL[2] + by; bn.browR.position.y = REST.browR[2] + by;
    bn.browL.rotation.z = -bi * 0.22; bn.browR.rotation.z = bi * 0.22;
    const mo = clamp(P[C.mouth], 0, 1.2);
    bn.mouth.scale.set(1 - mo * 0.15, 1 + mo * 2.6, 1); bn.mouth.position.y = REST.mouth[2] - mo * 0.005;
  }

  function gaitCadence(v) { const hs = Math.sqrt(1.75 / height); return v < 0.02 ? 0 : (0.72 + 0.19 * Math.min(v, 9) - 0.0062 * Math.min(v, 9) * Math.min(v, 9)) * hs; }

  /* ---------------- per frame */
  function update(dt, o) {
    dt = clamp(dt || 0, 0, 0.1);
    o = o || {};
    st.t += dt; st.dt = dt;
    // motion in, from the caller or measured from how the group moved
    group.updateWorldMatrix(true, false);
    const ex = group.matrixWorld.elements;
    const wx = ex[12], wz = ex[14], yaw = Math.atan2(ex[8], ex[10]);
    const scl = unit * height / 1.75 * (Math.hypot(ex[0], ex[1], ex[2]) || 1);
    let v = o.speed, turn = o.turn;
    if (v == null) v = dt > 0 && st.lastX === st.lastX ? Math.hypot(wx - st.lastX, wz - st.lastZ) / dt / unit : 0;
    else v = v / unit;
    if (turn == null) { let d = st.lastYaw === st.lastYaw ? yaw - st.lastYaw : 0; d = Math.atan2(Math.sin(d), Math.cos(d)); turn = dt > 0 ? d / dt : 0; }
    st.lastX = wx; st.lastZ = wz; st.lastYaw = yaw;
    v = clamp(v, 0, 14) * 1.75 / height;
    // smooth the measured inputs a little so a jittery caller still walks cleanly
    const k = Math.min(1, dt * 10);
    const accIn = o.accel != null ? o.accel / unit : dt > 0 ? (v - st.speed) / dt : 0;
    st.speed += (v - st.speed) * k; st.turn += (clamp(turn, -6, 6) - st.turn) * k;
    st.accel += (clamp(accIn, -12, 12) - st.accel) * Math.min(1, dt * 4);
    const turnStep = Math.min(0.6, Math.abs(st.turn) * 0.18); // turning on the spot shuffles the feet
    const vg = Math.max(st.speed, turnStep);
    st.gw += ((vg > 0.08 ? 1 : 0) - st.gw) * Math.min(1, dt * (vg > 0.08 ? 7 : 4));
    st.run = sstep(1.9, 3.3, st.speed);
    st.ph += dt * gaitCadence(vg);
    if (o.look !== undefined) { if (o.look) { lookV.copy(o.look); lookTarget = lookV; } else lookTarget = null; }
    if (o.steer != null) st.steer = clamp(o.steer, -1, 1);
    else if (api.steer !== st.steer) st.steer = clamp(api.steer || 0, -1, 1);
    st.steerS += (st.steer - st.steerS) * Math.min(1, dt * 8);
    st.moodS += (st.mood - st.moodS) * Math.min(1, dt * 1.5);
    void scl;

    basePose(dt);

    // actions
    for (let i = 0; i < slots.length; i++) {
      const s = slots[i];
      s.t += dt;
      let kk = s.dur > 0 ? s.t / s.dur : 1;
      if (kk >= 1) { kk = 1; if (!s.hold && s.out < 0) { s.out = 0; if (s.onDone) { try { s.onDone(); } catch (e) { /* caller */ } s.onDone = null; } } }
      const fin = Math.min(0.14, s.dur * 0.2);
      let w = smooth((s.t - s.t0) / fin);
      if (s.out >= 0) { s.out += dt; w *= 1 - smooth(s.out / (s.hold ? 0.3 : 0.18)); }
      w *= s.amt;
      A.set(P);
      evalAction(s, kk);
      const upperOnly = s.layer === 1;
      for (let c = 0; c < NCH; c++) { if (upperOnly && LOWER[c]) continue; P[c] += (A[c] - P[c]) * w; }
    }
    for (let i = slots.length - 1; i >= 0; i--) { const s = slots[i]; if (s.out >= (s.hold ? 0.3 : 0.18)) slots.splice(i, 1); }

    // where to look: a target, else the occasional glance
    st.glanceT -= dt;
    if (st.glanceT <= 0) {
      if (Math.abs(st.gtYaw) > 0.01 && r() < 0.7) { st.gtYaw = 0; st.gtPitch = 0; st.glanceT = 1.2 + r() * 3.5 / st.temper; }
      else { st.gtYaw = (r() * 2 - 1) * (lookTarget ? 0.45 : 0.9); st.gtPitch = (r() * 2 - 1) * 0.18; st.glanceT = 0.5 + r() * 1.5; }
    }
    let ly = st.gtYaw, lp = st.gtPitch;
    if (lookTarget) {
      _v1.copy(lookTarget); body.worldToLocal(_v1);
      const hx = _v1.x, hy = _v1.y - 1.63, hz = _v1.z;
      const yawT = Math.atan2(hx, hz), pitchT = -Math.atan2(hy, Math.hypot(hx, hz));
      // keep the glance small and occasional while watching something
      ly = clamp(yawT, -1.6, 1.6) + (Math.abs(st.gtYaw) > 0.01 ? st.gtYaw * 0.5 : 0);
      lp = clamp(pitchT, -0.6, 0.7) + st.gtPitch * 0.5;
    }
    const hk = Math.min(1, dt * (lookTarget ? 5 : 3));
    st.lookYaw += (ly - st.lookYaw) * hk; st.lookPitch += (lp - st.lookPitch) * hk;
    // eyes lead the head (fast, saccade-like)
    const ek = Math.min(1, dt * 22);
    const yawLeft = ly - st.lookYaw;
    st.eyeYaw += (clamp(yawLeft * 0.6 + st.lookYaw * 0.15, -0.45, 0.45) - st.eyeYaw) * ek;
    st.eyePitch += (clamp((lp - st.lookPitch) * 0.6, -0.3, 0.3) - st.eyePitch) * ek;
    const lyc = clamp(st.lookYaw, -1.35, 1.35), lpc = clamp(st.lookPitch, -0.5, 0.6);
    P[C.neckRY] += lyc * 0.4; P[C.headRY] += lyc * 0.6; P[C.neckRX] += lpc * 0.35; P[C.headRX] += lpc * 0.65;
    if (Math.abs(st.lookYaw) > 1.1) P[C.chestRY] += (st.lookYaw - Math.sign(st.lookYaw) * 1.1) * 0.6;
    if (aims.L || aims.R || aims.wL || aims.wR) aimPersistent(dt);

    // blinks every 2 to 6 seconds, now and then a double blink
    if (faceOn) {
      st.blinkT -= dt;
      if (st.blinkT <= 0) { st.blink = 0.0001; st.blinkT = st.dbl ? 2 + r() * 4 : (r() < 0.15 ? 0.22 : 2 + r() * 4); st.dbl = !st.dbl && st.blinkT < 0.3; }
      if (st.blink > 0) { st.blinkC = (st.blinkC || 0) + dt; const b = st.blinkC / 0.13; st.blink = b < 0.4 ? b / 0.4 : b < 1 ? 1 - (b - 0.4) / 0.6 : 0; if (b >= 1) { st.blink = 0; st.blinkC = 0; } }
    } else st.blink = 0;

    apply();
  }

  function setOutfit(o) { if (o) { Object.assign(outfit, o); recolor(); } return api; }
  function setLod(l) {
    if (!l || l === lod) return api;
    lod = l; T = template(lod, sex, build, hair);
    for (const n of ['color', 'uv']) geo.deleteAttribute(n);
    attach(T); recolor(); return api;
  }
  function dispose() {
    for (const n of ['position', 'normal', 'skinIndex', 'skinWeight']) geo.deleteAttribute(n);
    geo.setIndex(null); geo.dispose(); skeleton.dispose();
    if (group.parent) group.parent.remove(group);
  }

  const boneMap = {
    root: bones.root, pelvis: bones.pelvis, spine: bones.spine, chest: bones.chest, neck: bones.neck, head: bones.head,
    eyeL: bones.eyeL, eyeR: bones.eyeR, browL: bones.browL, browR: bones.browR, mouth: bones.mouth,
    shoulderL: bones.shoulderL, elbowL: bones.elbowL, wristL: bones.wristL, fingersL: bones.fingersL,
    shoulderR: bones.shoulderR, elbowR: bones.elbowR, wristR: bones.wristR, fingersR: bones.fingersR,
    hipL: bones.hipL, kneeL: bones.kneeL, ankleL: bones.ankleL, hipR: bones.hipR, kneeR: bones.kneeR, ankleR: bones.ankleR,
  };
  const api = {
    group, mesh, bones: boneMap, skeleton, height, sex, build, hair, skin: skinHex, steer: 0,
    get lod() { return lod; },
    get outfit() { return outfit; },
    get speed() { return st.speed * height / 1.75; },
    update, play, stop, playing, setOutfit, setLod, dispose,
    lookAt(v) { if (v) { lookV.copy(v); lookTarget = lookV; } else lookTarget = null; return api; },
    setMood(m) { st.mood = clamp(m || 0, -1, 1); return api; },
    // keep an arm aimed at a target every frame until cleared: aim('right', vec3, { elbow }) / aim('right', null)
    aim(side, v, o) { const L = side === 'left'; if (L) aims.L = v || null; else aims.R = v || null; if (o && o.elbow != null) aims[L ? 'elL' : 'elR'] = -Math.abs(o.elbow); return api; },
    actions: Object.keys(ACTIONS),
  };
  // a first pose so the figure is right before the first update
  update(0, { speed: 0, turn: 0 });
  return api;
}

/* ================================================================== crowds */
// Seats in rows: returns [{x, y, z, yaw}] in world units. origin is the first
// seat of the front row; rows climb by rowH and step back by rowD away from
// the face point (or along dir).
export function crowdRows(o) {
  o = o || {};
  const out = [];
  const org = o.origin || [0, 0, 0], rows = o.rows || 6, per = o.perRow || 30;
  const sw = o.seatW || 0.55, rd = o.rowD || 0.8, rh = o.rowH || 0.4, jit = o.jitter == null ? 0.08 : o.jitter, fill = o.fill == null ? 0.92 : o.fill;
  let ax = o.along ? o.along[0] : 1, az = o.along ? o.along[1] : 0;
  const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
  // back direction: away from the face point
  let bx = -az, bz = ax;
  const face = o.face;
  if (face) { const mx = org[0] + ax * per * sw * 0.5, mz = org[2] + az * per * sw * 0.5; if ((face[0] - mx) * bx + (face[2] - mz) * bz > 0) { bx = -bx; bz = -bz; } }
  const r = rng(o.seed == null ? 11 : o.seed);
  for (let j = 0; j < rows; j++) for (let i = 0; i < per; i++) {
    if (r() > fill) continue;
    const x = org[0] + ax * i * sw + bx * j * rd + (r() - 0.5) * jit, z = org[2] + az * i * sw + bz * j * rd + (r() - 0.5) * jit;
    let yaw = Math.atan2(-bx, -bz);
    if (face) yaw = Math.atan2(face[0] - x, face[2] - z);
    out.push({ x, y: org[1] + j * rh, z, yaw: yaw + (r() - 0.5) * 0.25 });
  }
  return out;
}

const CROWD_SZ = 0.34;
const CROWD_VS_HEAD = [
  'attribute vec4 iA; attribute vec4 iB; attribute vec4 iC0; attribute vec4 iC1; attribute vec4 iC2;',
  'attribute vec2 aPZ; attribute vec3 aSeat; attribute vec3 aSeatN;',
  'uniform float uTime; uniform float uExcite; uniform float uMood; uniform float uSeated; uniform float uBurstT; uniform float uBurstK; uniform float uBurstMood; uniform float uBurstN; uniform vec3 uLook; uniform float uHasLook;',
  'varying vec3 vCrowdCol;',
  'mat3 rX(float a){ float c=cos(a), s=sin(a); return mat3(1.,0.,0., 0.,c,s, 0.,-s,c); }',
  'mat3 rY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }',
  'mat3 rZ(float a){ float c=cos(a), s=sin(a); return mat3(c,s,0., -s,c,0., 0.,0.,1.); }',
].join('\n');
// joints of the crowd figure (metres): shoulders, elbows, neck
const CROWD_VS_BODY = [
  '{',
  ' float aPart = aPZ.x, aZone = aPZ.y;',
  ' vec3 iSkin = iC0.xyz, iTop = vec3(iC0.w, iC1.xy), iBot = vec3(iC1.zw, iC2.x), iHair = iC2.yzw;',
  ' float ph = iA.x, rate = iA.y, bias = iA.z, hand = iA.w;',
  ' float act = iB.x, at = (uTime - iB.y) / max(iB.z, 0.01), aOn = step(0.0, at) * step(at, 1.0);',
  ' float env = aOn * smoothstep(0.0, 0.15, at) * (1.0 - smoothstep(0.8, 1.0, at));',
  ' float tt = uTime * rate + ph;',
  ' float ex = clamp(uExcite, 0.0, 1.0);',
  // a burst (react): each person starts after their own delay (0 to 0.6 s), picks their own reaction for
  // this burst (both arms up, a wave, a clap, a fist pump, a turn to a neighbour, or just watching), at
  // their own arm height and length, and settles back on their own
  ' float bt = uTime - uBurstT - fract(ph * 3.17) * 0.6;',
  ' float bd = (1.6 + 2.2 * fract(ph * 5.71)) * (0.6 + 0.4 * min(uBurstK, 1.0));',
  ' float benv = step(0.0, bt) * smoothstep(0.0, 0.3 + 0.25 * fract(ph * 1.9), bt) * (1.0 - smoothstep(bd - 0.7, bd, bt)) * step(0.01, uBurstK);',
  ' float bk = fract(ph * 9.13 + uBurstN * 0.618);',
  ' float bamp = 0.68 + 0.32 * fract(ph * 2.31);',
  ' float bpos = step(0.0, uBurstMood);',
  ' float standG = smoothstep(bias, bias + 0.18, ex);',
  ' float stand = max(standG, env * step(0.5, act) * step(act, 1.5));',
  ' stand = max(stand, benv * step(mix(0.75, 0.22, bpos), fract(ph * 4.41)));',
  ' stand = mix(stand, 1.0, 1.0 - uSeated);',
  ' vec3 p = mix(aSeat, position, stand);',
  ' vec3 nn = normalize(mix(aSeatN, normal, stand));',
  ' float bob = sin(tt * 1.3) * 0.006 + abs(sin(tt * 5.2)) * 0.05 * smoothstep(0.75, 1.1, max(ex, benv * bpos * bamp * 1.15)) * stand;',
  ' float hop = bob * step(0.5, aPart);',
  ' vec3 off = vec3(0.0, mix(-0.42, 0.0, stand), 0.0);',
  ' float isArmL = step(2.5, aPart) * step(aPart, 4.5), isArmR = step(4.5, aPart) * step(aPart, 6.5), isFore = step(0.5, mod(aPart - 3.0, 2.0)) * step(2.5, aPart);',
  // Excitement sets how OFTEN and how BIG each person's own moments are, never a held pose: everyone runs
  // their own cycle (3 to 6 s), and a cycle is a cheer, a clap or hands on head with a chance that rises
  // with the excitement; arms always come back to rest between them.
  ' float per = 3.0 + 3.0 * fract(ph * 1.37);',
  ' float cyc = (uTime * rate + ph * 5.0) / per, cf = fract(cyc), ci = floor(cyc);',
  ' float h1 = fract(sin(ci * 12.9898 + ph * 78.233) * 43758.5453), h2 = fract(h1 * 7.13 + ph * 0.31);',
  ' float on = step(h1, clamp(ex * 0.8, 0.0, 0.97));',
  ' float span = mix(0.35, 0.75, clamp(ex, 0.0, 1.0));',
  ' float env2 = on * smoothstep(0.0, 0.1, cf) * (1.0 - smoothstep(span - 0.12, span, cf));',
  ' float big = clamp(0.55 + ex * 0.45, 0.0, 1.0);',
  ' float pos = step(0.0, uMood);',
  ' float cheer = env2 * pos * step(h2, 0.2 + 0.5 * clamp(ex, 0.0, 1.0)) * big;',
  ' float clap = env2 * pos * (1.0 - step(h2, 0.2 + 0.5 * clamp(ex, 0.0, 1.0)));',
  ' float hoh = env2 * (1.0 - pos) * step(h2, 0.7);',
  ' clap = max(clap, env * step(1.5, act) * step(act, 2.5));',
  ' float wave = env * step(2.5, act) * step(act, 3.5);',
  ' float turn = env * step(3.5, act) * step(act, 4.5);',
  ' hoh = max(hoh, env * step(4.5, act) * step(act, 5.5));',
  ' cheer = max(cheer, env * step(5.5, act));',
  ' cheer = max(cheer, benv * bpos * step(bk, 0.28) * bamp);',
  ' wave = max(wave, benv * bpos * step(0.28, bk) * step(bk, 0.42));',
  ' clap = max(clap, benv * bpos * step(0.42, bk) * step(bk, 0.6));',
  ' float pump = benv * bpos * step(0.6, bk) * step(bk, 0.72);',
  ' turn = max(turn, benv * (bpos * step(0.72, bk) * step(bk, 0.84) + (1.0 - bpos) * step(0.45, bk) * step(bk, 0.6)));',
  ' hoh = max(hoh, benv * (1.0 - bpos) * step(bk, 0.45) * bamp);',
  // arm angles: shoulder (x flex, z abduction), elbow (x)
  ' float sw = sin(tt * 6.0);',
  ' float lz = 0.08 + cheer * (2.5 + 0.18 * sw) + hoh * 0.8, rz = -0.08 - cheer * (2.5 - 0.18 * sw) - hoh * 0.8 - wave * 2.2 - pump * (1.15 + 0.35 * abs(sin(tt * 7.0)));',
  ' float lx = -clap * 0.75 - hoh * 2.15 - 0.15 * cheer, rx = -clap * 0.75 - hoh * 2.15 - 0.15 * cheer - wave * 0.3 - pump * 0.25;',
  ' float le = -0.15 - clap * 1.3 - hoh * 2.1 - cheer * 0.35 - (1.0 - stand) * 0.75, re = -0.15 - clap * 1.3 - hoh * 2.1 - cheer * 0.35 - (1.0 - stand) * 0.75 - wave * (0.9 + 0.35 * sin(tt * 14.0)) - pump * 1.7;',
  ' float cl = clap * (0.55 + 0.3 * abs(sin(tt * 9.0)));',
  ' lx += (1.0 - stand) * -0.22; rx += (1.0 - stand) * -0.22;',
  ' vec3 sh = vec3(sign(p.x) * 0.18, 1.42, ' + CROWD_SZ.toFixed(3) + '); if (aPart > 2.5) sh.x = aPart < 4.5 ? 0.18 : -0.18;',
  ' float sy = mix(1.0, 1.0, stand);',
  ' vec3 q = p;',
  ' if (aPart > 2.5) {',
  '   float isL = isArmL;',
  '   float ax_ = mix(rx, lx, isL), az_ = mix(rz, lz, isL), ae_ = mix(re, le, isL), ay_ = mix(cl, -cl, isL);',
  '   vec3 elb = sh + vec3(0.0, -0.29, 0.0);',
  '   vec3 seatSh = vec3(sh.x, sh.y - 0.42, 0.0);',
  '   vec3 S0 = mix(seatSh, sh, stand); vec3 E0 = S0 + vec3(0.0, -0.29, 0.0);',
  '   if (isFore > 0.5) { q = rX(ae_) * (q - E0) + E0; nn = rX(ae_) * nn; }',
  '   mat3 R = rZ(az_) * rX(ax_) * rY(ay_);',
  '   q = R * (q - S0) + S0; nn = R * nn;',
  ' }',
  // head: follow the look point, turn to a neighbour now and then
  ' if (aPart > 1.5 && aPart < 2.5) {',
  '   vec3 wp = (modelMatrix * instanceMatrix * vec4(0.0, 1.5, 0.0, 1.0)).xyz;',
  '   vec3 fw = normalize((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz);',
  '   vec3 rt = normalize((modelMatrix * instanceMatrix * vec4(1.0, 0.0, 0.0, 0.0)).xyz);',
  '   vec3 d = normalize(uLook - wp);',
  '   float yaw = uHasLook * clamp(atan(dot(d, rt), dot(d, fw)), -1.1, 1.1) * (0.75 + 0.25 * fract(ph * 1.7));',
  '   yaw += sin(tt * 0.37 + ph * 3.0) * 0.18 + turn * hand * 1.1;',
  '   float pit = uHasLook * clamp(-asin(clamp(d.y, -1.0, 1.0)), -0.5, 0.5) * 0.8 - cheer * 0.25 + hoh * 0.25;',
  '   vec3 nk = vec3(0.0, mix(1.04, 1.46, stand), stand * ' + CROWD_SZ.toFixed(3) + ');',
  '   mat3 R = rY(yaw) * rX(pit);',
  '   q = R * (q - nk) + nk; nn = R * nn;',
  ' }',
  ' q.y += hop;',
  ' transformed = q; objectNormal = nn;',
  ' vec3 cz = iSkin; if (aZone > 0.5) cz = iTop; if (aZone > 1.5) cz = iBot; if (aZone > 2.5) cz = iHair; if (aZone > 3.5) cz = vec3(0.09, 0.085, 0.09); if (aZone > 4.5) cz = iSkin * 0.25;',
  ' vCrowdCol = cz;',
  '}',
].join('\n');

function buildCrowdGeo(lod) {
  // standing pose in position/normal; seated pose in aSeat/aSeatN
  const far = lod === 'far';
  const seg = far ? 5 : 7, sw = far ? 6 : 8, sh = far ? 4 : 6;
  const parts = [];
  // standing up, a seated person steps forward onto where their feet were (CROWD_SZ metres)
  const fwd = new THREE.Matrix4().makeTranslation(0, 0, CROWD_SZ);
  const add = (g, m, part, zone, seatM) => {
    const gs = g.clone();
    g.applyMatrix4(m); g.applyMatrix4(fwd); gs.applyMatrix4(seatM || m);
    parts.push({ g, gs, part, zone });
  };
  const M = (x, y, z, rx, ry, rz, sx, sy, sz) => new THREE.Matrix4().copy(mtx(x, y, z, rx, ry, rz, sx, sy, sz));
  const D = -0.42; // seated drop of the upper body
  // torso and hips (part 1 torso, part 0 legs)
  const torso = new THREE.CylinderGeometry(0.16, 0.14, 0.5, seg, 1); torso.scale(1, 1, 0.62);
  add(torso, M(0, 1.17, 0), 1, 1, M(0, 1.17 + D, 0));
  const hips = new THREE.CylinderGeometry(0.15, 0.13, 0.2, seg, 1); hips.scale(1, 1, 0.66);
  add(hips, M(0, 0.86, 0), 0, 2, M(0, 0.86 + D, 0.0));
  // head and hair (part 2)
  const head = new THREE.SphereGeometry(1, sw, sh);
  add(head, M(0, 1.6, 0, 0, 0, 0, 0.078, 0.112, 0.096), 2, 0, M(0, 1.6 + D, 0, 0, 0, 0, 0.078, 0.112, 0.096));
  const hair = new THREE.SphereGeometry(1, sw, 4, 0, TAU, 0, PI * 0.5);
  add(hair, M(0, 1.612, -0.008, -0.3, 0, 0, 0.082, 0.118, 0.1), 2, 3, M(0, 1.612 + D, -0.008, -0.3, 0, 0, 0.082, 0.118, 0.1));
  const neck = new THREE.CylinderGeometry(0.045, 0.05, 0.12, 6, 1);
  add(neck, M(0, 1.47, 0), 2, 0, M(0, 1.47 + D, 0));
  // arms: upper (3 left, 5 right) and fore + hand (4 left, 6 right)
  for (const s of [1, -1]) {
    const up = new THREE.CylinderGeometry(0.05, 0.042, 0.3, seg - 1, 1);
    add(up, M(s * 0.18, 1.28, 0), s > 0 ? 3 : 5, 1, M(s * 0.18, 1.28 + D, 0));
    const fo = new THREE.CylinderGeometry(0.039, 0.03, 0.26, seg - 1, 1);
    add(fo, M(s * 0.18, 1.0, 0), s > 0 ? 4 : 6, 0, M(s * 0.18, 1.0 + D, 0));
    const hd = new THREE.SphereGeometry(1, 6, 4);
    add(hd, M(s * 0.18, 0.84, 0.0, 0, 0, 0, 0.022, 0.05, 0.042), s > 0 ? 4 : 6, 0, M(s * 0.18, 0.84 + D, 0.0, 0, 0, 0, 0.022, 0.05, 0.042));
  }
  // legs: standing straight, seated thighs forward and shins down
  for (const s of [1, -1]) {
    const th = new THREE.CylinderGeometry(0.075, 0.055, 0.42, seg - 1, 1);
    add(th, M(s * 0.09, 0.65, 0), 0, 2, M(s * 0.09, 0.47, 0.2, PI / 2, 0, 0));
    const shn = new THREE.CylinderGeometry(0.052, 0.036, 0.41, seg - 1, 1);
    add(shn, M(s * 0.09, 0.27, 0), 0, 2, M(s * 0.09, 0.23, 0.4));
    const shoe = new THREE.BoxGeometry(0.09, 0.07, 0.24);
    add(shoe, M(s * 0.09, 0.035, 0.04), 0, 4, M(s * 0.09, 0.035, 0.44));
  }
  let nv = 0, ni = 0;
  for (const p of parts) { nv += p.g.attributes.position.count; ni += p.g.index.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), sp = new Float32Array(nv * 3), sn = new Float32Array(nv * 3);
  const pz = new Float32Array(nv * 2), idx = new Uint16Array(ni);
  let ov = 0, oi = 0;
  for (const p of parts) {
    const c = p.g.attributes.position.count;
    pos.set(p.g.attributes.position.array, ov * 3); nor.set(p.g.attributes.normal.array, ov * 3);
    sp.set(p.gs.attributes.position.array, ov * 3); sn.set(p.gs.attributes.normal.array, ov * 3);
    for (let i = ov; i < ov + c; i++) { pz[i * 2] = p.part; pz[i * 2 + 1] = p.zone; }
    const a = p.g.index.array; for (let i = 0; i < a.length; i++) idx[oi++] = a[i] + ov;
    ov += c; p.g.dispose(); p.gs.dispose();
  }
  const g = new THREE.InstancedBufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('aSeat', new THREE.BufferAttribute(sp, 3)); g.setAttribute('aSeatN', new THREE.BufferAttribute(sn, 3));
  g.setAttribute('aPZ', new THREE.BufferAttribute(pz, 2));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

const ACT = { stand: 1, clap: 2, wave: 3, turn: 4, handsOnHead: 5, cheer: 6 };
export function createCrowd(opts) {
  opts = opts || {};
  const r = rng(opts.seed == null ? 5 : opts.seed);
  const members = opts.members || crowdRows(opts.rows || {});
  const n = members.length;
  const unit = opts.unit || 1;
  const quality = opts.quality == null ? 2 : clamp(opts.quality | 0, 0, 3);
  const lod = opts.lod || (quality >= 2 ? 'mid' : 'far');
  const geo = buildCrowdGeo(lod);
  const iA = new Float32Array(n * 4), iB = new Float32Array(n * 4), iCol = new Float32Array(n * 12);
  const col = new THREE.Color();
  const tops = (opts.colors || []).concat(CLOTH);
  const teamShare = opts.colors && opts.colors.length ? (opts.teamShare == null ? 0.55 : opts.teamShare) : 0;
  // colours packed as skin rgb, top rgb, bottom rgb, hair rgb in three vec4 per member
  const putCol = (slot, i, hex, j) => { col.set(hex); const k = 0.85 + j * 0.25, o = i * 12 + slot * 3; iCol[o] = col.r * k; iCol[o + 1] = col.g * k; iCol[o + 2] = col.b * k; };
  const paint = () => {
    for (let i = 0; i < n; i++) {
      const top = teamShare && r() < teamShare ? opts.colors[(r() * opts.colors.length) | 0] : tops[(r() * tops.length) | 0];
      putCol(1, i, top, r()); putCol(2, i, PANTS[(r() * PANTS.length) | 0], r());
      putCol(0, i, wpick(r, SKIN_TONES), 0.6); putCol(3, i, r() < 0.06 ? wpick(r, OLD_HAIR) : wpick(r, HAIR_COLORS), 0.6);
    }
  };
  paint();
  for (let i = 0; i < n; i++) {
    iA[i * 4] = r() * 100; iA[i * 4 + 1] = 0.85 + r() * 0.3; iA[i * 4 + 2] = 0.35 + r() * 0.55; iA[i * 4 + 3] = r() < 0.5 ? -1 : 1;
    iB[i * 4] = 0; iB[i * 4 + 1] = -100; iB[i * 4 + 2] = 1; iB[i * 4 + 3] = 0;
  }
  const attr = (a, s) => { const b = new THREE.InstancedBufferAttribute(a, s); b.setUsage(THREE.DynamicDrawUsage); return b; };
  const aB = attr(iB, 4), colBuf = new THREE.InstancedInterleavedBuffer(iCol, 12);
  geo.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4)); geo.setAttribute('iB', aB);
  geo.setAttribute('iC0', new THREE.InterleavedBufferAttribute(colBuf, 4, 0)); geo.setAttribute('iC1', new THREE.InterleavedBufferAttribute(colBuf, 4, 4)); geo.setAttribute('iC2', new THREE.InterleavedBufferAttribute(colBuf, 4, 8));
  const U = { uTime: { value: 0 }, uExcite: { value: 0 }, uMood: { value: 1 }, uSeated: { value: opts.seated === false ? 0 : 1 }, uBurstT: { value: -100 }, uBurstK: { value: 0 }, uBurstMood: { value: 1 }, uBurstN: { value: 0 }, uLook: { value: new THREE.Vector3() }, uHasLook: { value: 0 } };
  const useStd = opts.material ? opts.material === 'standard' : quality >= 2;
  const mat = useStd ? new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0 }) : new THREE.MeshLambertMaterial();
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = CROWD_VS_HEAD + '\n' + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3( normal );\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3( tangent.xyz );\n#endif')
      .replace('#include <begin_vertex>', 'vec3 transformed = vec3( position );\n' + CROWD_VS_BODY);
    // the body block must run before the normal is transformed: move it ahead of defaultnormal_vertex
    const vs = sh.vertexShader;
    const bodyAt = vs.indexOf('vec3 transformed = vec3( position );');
    const normAt = vs.indexOf('#include <defaultnormal_vertex>');
    if (bodyAt > normAt && normAt >= 0) {
      const block = 'vec3 transformed = vec3( position );\n' + CROWD_VS_BODY;
      sh.vertexShader = vs.replace(block, '').replace('#include <defaultnormal_vertex>', block + '\n#include <defaultnormal_vertex>');
    }
    sh.fragmentShader = 'varying vec3 vCrowdCol;\n' + sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vCrowdCol;');
  };
  mat.customProgramCacheKey = () => 'human-crowd-v1';
  mat.userData.keepMat = true;
  const mesh = new THREE.InstancedMesh(geo, mat, n);
  mesh.name = 'crowd';
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), ps = new THREE.Vector3(), YA = new THREE.Vector3(0, 1, 0);
  const minY = { v: Infinity }, maxY = { v: -Infinity };
  for (let i = 0; i < n; i++) {
    const m = members[i];
    const h = (0.94 + r() * 0.12) * unit * (m.scale || 1);
    q.setFromAxisAngle(YA, m.yaw || 0); m4.compose(ps.set(m.x, m.y, m.z), q, sc.set(h * (0.95 + r() * 0.1), h, h));
    mesh.setMatrixAt(i, m4);
    minY.v = Math.min(minY.v, m.y); maxY.v = Math.max(maxY.v, m.y);
  }
  mesh.instanceMatrix.needsUpdate = true;
  mesh.castShadow = false; mesh.receiveShadow = !!opts.receiveShadow;
  mesh.computeBoundingSphere(); if (mesh.boundingSphere) mesh.boundingSphere.radius += 2 * unit;
  mesh.frustumCulled = opts.frustumCulled !== false;

  const cst = { t: 0, ex: 0, exT: 0, mood: 1, burst: 0, nextAct: 0.5 };
  const choose = [ACT.stand, ACT.wave, ACT.turn, ACT.turn, ACT.clap, ACT.cheer];
  const startAct = (i, a, dur) => {
    iB[i * 4] = a; iB[i * 4 + 1] = cst.t + r() * 0.6; iB[i * 4 + 2] = dur; aB.needsUpdate = true;
  };
  const crowd = {
    mesh, count: n, members,
    excite(level) { cst.exT = clamp(level || 0, 0, 1); return crowd; },
    react(kind, strength) {
      const s = strength == null ? 1 : clamp(strength, 0, 1.5);
      if (kind === 'groan' || kind === 'gasp') { cst.mood = -1; cst.burst = Math.max(cst.burst, 0.7 * s); }
      else { cst.mood = 1; cst.burst = Math.max(cst.burst, s); }
      U.uBurstT.value = cst.t; U.uBurstK.value = s; U.uBurstMood.value = cst.mood; U.uBurstN.value = (U.uBurstN.value + 1) % 64;
      // a share of them do their own thing about it
      const k = Math.min(n, Math.round(n * 0.12 * s));
      for (let j = 0; j < k; j++) {
        const i = (r() * n) | 0;
        const a = kind === 'groan' || kind === 'gasp' ? ACT.handsOnHead : kind === 'clap' ? ACT.clap : kind === 'wave' ? ACT.wave : (r() < 0.6 ? ACT.cheer : ACT.stand);
        startAct(i, a, 1.6 + r() * 2.2);
      }
      return crowd;
    },
    setLook(v) { if (v) { U.uLook.value.copy(v); U.uHasLook.value = 1; } else U.uHasLook.value = 0; return crowd; },
    setSeated(on) { U.uSeated.value = on ? 1 : 0; return crowd; },
    recolor(colors) { if (colors) opts.colors = colors; paint(); colBuf.needsUpdate = true; return crowd; },
    update(dt, o) {
      dt = clamp(dt || 0, 0, 0.1);
      cst.t += dt; U.uTime.value = cst.t;
      if (o && o.look) crowd.setLook(o.look);
      if (o && o.excite != null) cst.exT = clamp(o.excite, 0, 1);
      cst.ex += (cst.exT - cst.ex) * Math.min(1, dt * (cst.exT > cst.ex ? 3 : 0.8));
      cst.burst *= Math.exp(-dt * 0.45); if (cst.burst < 0.01) cst.burst = 0;
      if (cst.burst <= 0.05 && cst.mood < 0 && cst.ex < 0.4) cst.mood += Math.min(1 - cst.mood, dt * 0.5);
      U.uExcite.value = cst.ex; U.uMood.value = cst.mood;
      // the odd individual: someone stands, waves, turns to a neighbour, claps
      cst.nextAct -= dt * n * (0.012 + cst.ex * 0.03);
      let guard = 6;
      while (cst.nextAct <= 0 && guard-- > 0) { cst.nextAct += 1; const i = (r() * n) | 0; startAct(i, choose[(r() * choose.length) | 0], 1.4 + r() * 2.6); }
      return crowd;
    },
    dispose() { geo.dispose(); mat.dispose(); if (mesh.parent) mesh.parent.remove(mesh); },
  };
  return crowd;
}

export { ACTIONS as HUMAN_ACTIONS };
