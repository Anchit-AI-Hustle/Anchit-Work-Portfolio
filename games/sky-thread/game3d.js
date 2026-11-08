import * as THREE from '/games/vendor/three/three.module.min.js';
/*
 * Sky Thread, in real 3D: kite fighting over an invented old-city neighbourhood
 * at sunset, on a festival evening. Original world, names and code.
 *
 * The rules are the flat version's, unchanged: steer your kite, cross a rival
 * thread while pulling and yours cuts theirs, glide through a fight against a
 * hard-pulling rival and yours is cut. Three modes, three difficulties, the
 * same scoring and touch design.
 *
 * How the 3D maps onto the rules
 *   The game still thinks in screen terms (x, y from 0 to 1, as the flat game
 *   did). A fixed reference camera, standing on your terrace, turns each kite's
 *   (x, y) and its own distance into a point in the sky, so the pointer and the
 *   kite always agree. Threads are real 3D curves from a flyer's hand to the
 *   kite: yours from your fingers, each rival's from a person on a rooftop. A
 *   cut happens where two threads cross as you SEE them (their projection on
 *   the reference camera), which is how a kite fight is judged by eye.
 */
const A = window.Arcade;
const PI = Math.PI, TAU = PI * 2;
const abs = Math.abs, sin = Math.sin, cos = Math.cos, min = Math.min, max = Math.max, hypot = Math.hypot, floor = Math.floor;
const clamp = A.clamp, lerp = A.lerp;
const rnd = Math.random;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const V3 = THREE.Vector3;
const F_DISP = 'Fraunces, Times New Roman, serif';
const F_UI = 'Inter, sans-serif';
const F_MONO = 'JetBrains Mono, ui-monospace, monospace';
const INK = '#FBF5EC', GOLD = '#c9a96e', WARM = '#FFB736', PRIM = '#FF6940';
const COLS = ['#FF6940', '#FFB736', '#c9a96e', '#FBF5EC', '#e07a9a', '#7ec8e3'];
// A second colour per kite colour, for the paper patterns.
const SECOND = ['#ffd77a', '#b4246a', '#1f4e8c', '#d6332a', '#3a2a6e', '#0d3b66'];

let arc;
const DIFF = {
  easy: { rivals: 3, ai: 0.72, spawn: 5.2 },
  normal: { rivals: 4, ai: 0.95, spawn: 4 },
  hard: { rivals: 5, ai: 1.22, spawn: 2.8 },
};
const G = {
  t: 0, time: 90, score: 0, cuts: 0, alive: true, phase: 'fly',
  me: null, rivals: [], wind: { x: 0.4, y: 0.15 }, pops: [], attract: true,
  mode: 'dusk', diff: 'normal',
  hintT: 0, yank: 0, drag0: null, yanks: 0, slow: 0, glintT: 0,
};
// Fingers on the canvas, counted here: the shell's gesture follows only the
// first one, and a second finger held down is how a steering thumb pulls.
const fingers = new Set();

const ME_DEPTH = 21;
const KW = 0.95, KH = 1.1; // kite half width and half height, metres
const EYE = new V3(0, 10.6, -1.8);

/* ====================================================================== state of the 3D side */
const R3 = {
  ok: false, lost: false, soft: false, q: 2, qMax: 3, lock: false, accT: 0, accN: 0, fps: 0, settle: 1, goodT: 0,
  renderer: null, scene: null, cam: null, camRef: null, tanH: 0.5, pitch: 0.2, fov: 55, aspect: 1,
  sun: null, hemi: null, fill: null, skyMat: null, tod: 0.3, clock: 0, punch: 0, realDt: 1 / 60, lastNow: 0,
  pinchL: new V3(), reelL: new V3(), aniso: 4, shadowSize: 0, pr: 1, frameMs: 16,
};
const T = { v: new V3(), w: new V3(), u: new V3(), a: new V3(), b: new V3(), c: new V3(), d: new V3(), p: new V3(), q: new V3(), m: new THREE.Matrix4(), m2: new THREE.Matrix4(), m3: new THREE.Matrix4(), quat: new THREE.Quaternion(), e: new THREE.Euler(), col: new THREE.Color(), col2: new THREE.Color(), s: new V3(1, 1, 1) };
const UP = new V3(0, 1, 0);

/* ====================================================================== kites (state) */
function kite(ci, x, y, ai, depth) {
  return {
    x, y, vx: 0, vy: 0, col: COLS[ci], col2: SECOND[ci], ci, pull: 0, alive: true, cutT: 0, ai: ai || null,
    bob: rnd() * TAU, pat: (rnd() * 3) | 0, depth, flyer: null, vis: null, spin: (rnd() < 0.5 ? -1 : 1) * (1.5 + rnd() * 2.5),
    cutParam: 0.5, world: new V3(), anchor: new V3(), bridle: new V3(), tip: new V3(),
    poly: [], cum: [], tailP: [], tailQ: [], tailOK: false, rot: new THREE.Quaternion(), roll: 0, sad: 0,
  };
}

function resetWorld(attract, ch) {
  G.mode = (ch && ch.mode) || G.mode || 'dusk';
  G.diff = (ch && ch.diff) || G.diff || 'normal';
  G.D = DIFF[G.diff] || DIFF.normal;
  G.t = 0; G.time = G.mode === 'dusk' ? 90 : 0; G.score = 0; G.cuts = 0; G.alive = true; G.phase = 'fly';
  G.pops.length = 0; G.attract = !!attract;
  releaseKite(G.me); G.rivals.forEach(releaseKite);
  G.me = kite(0, 0.5, 0.58, null, ME_DEPTH);
  attachKite(G.me);
  G.rivals = [];
  const spots = [[0.16, 0.22], [0.84, 0.22], [0.18, 0.38], [0.82, 0.4], [0.5, 0.16]];
  const n = min(spots.length, G.D.rivals);
  for (let i = 0; i < n; i++) {
    const r = kite((i + 1) % COLS.length, spots[i][0], spots[i][1], { tx: spots[i][0], ty: spots[i][1], wait: 1.2 + rnd() * 1.4 }, 38 + rnd() * 20);
    attachKite(r);
    G.rivals.push(r);
  }
  G.wind = { x: 0.35, y: 0.12 };
  G.grace = 2.8;
  G.cutCool = 0;
  G.spawnT = attract ? 0 : 1.2;
  G.crossSpark = 0;
  G.hintT = 0; G.yank = 0; G.drag0 = null; G.yanks = 0; G.slow = 0;
  FX.n = 0; SH.clear(); GL.length = 0;
  syncWorld();
}

/* -------------------------------------------------------------- the reference camera, the sky plane */
function norm2world(nx, ny, depth, out) {
  const ndx = nx * 2 - 1, ndy = -(ny * 2 - 1);
  out.set(ndx * depth * R3.tanH * R3.aspect, ndy * depth * R3.tanH, -depth);
  return out.applyMatrix4(R3.camRef.matrixWorld);
}
const _pj = new V3();
function toPx(v, out, cam) {
  _pj.copy(v).project(cam || R3.camRef);
  out.x = (_pj.x * 0.5 + 0.5) * arc.w; out.y = (-_pj.y * 0.5 + 0.5) * arc.h;
  return _pj.z < 1;
}

// Where each kite is in the world, and where its thread starts.
function syncWorld() {
  if (!R3.camRef || !arc) return;
  const all = G.rivals.concat(G.me ? [G.me] : []);
  for (const k of all) {
    norm2world(k.x, k.y, k.depth, k.world);
    // The bridle sits a little under the middle of the kite.
    k.bridle.copy(k.world); k.bridle.y -= 0.18;
    if (k === G.me) k.anchor.copy(R3.pinchL).applyMatrix4(R3.camRef.matrixWorld);
    else if (k.flyer) k.anchor.copy(k.flyer.hand);
    else k.anchor.set(k.world.x * 0.6, 12, k.world.z * 0.8);
  }
}

// A point on a thread: a gentle sag that tightens while pulling, and a slow sway.
function threadAt(k, t, A0, B0, out) {
  const len = A0.distanceTo(B0);
  out.lerpVectors(A0, B0, t);
  const f = 4 * t * (1 - t);
  out.y -= len * 0.075 * (1 - 0.65 * k.pull) * f;
  T.u.subVectors(B0, A0).cross(UP);
  const l = T.u.length();
  if (l > 1e-4) out.addScaledVector(T.u, sin(G.t * 1.3 + k.bob) * len * 0.012 * f / l);
  return out;
}

const TS_ME = [0, 0.02, 0.05, 0.1, 0.18, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
const TS_RIV = [0, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
function buildPoly(k) {
  const ts = k === G.me ? TS_ME : TS_RIV;
  if (k.poly.length !== ts.length) { k.poly = ts.map(() => ({ x: 0, y: 0 })); k.cum = ts.map(() => 0); }
  for (let i = 0; i < ts.length; i++) {
    threadAt(k, ts[i], k.anchor, k.bridle, T.p);
    toPx(T.p, k.poly[i]);
    k.cum[i] = i ? k.cum[i - 1] + hypot(k.poly[i].x - k.poly[i - 1].x, k.poly[i].y - k.poly[i - 1].y) : 0;
  }
  return ts;
}

// Two threads cross where the eye sees them cross. Each end stays out of it,
// as in the flat game: crossing right at a kite or at a hand is not a cut.
function threadHit(a, b) {
  const ta = buildPoly(a), tb = buildPoly(b);
  const pa = a.poly, pb = b.poly, La = a.cum[pa.length - 1] || 1, Lb = b.cum[pb.length - 1] || 1;
  for (let i = 0; i < pa.length - 1; i++) {
    const p1 = pa[i], p2 = pa[i + 1];
    for (let j = 0; j < pb.length - 1; j++) {
      const p3 = pb[j], p4 = pb[j + 1];
      const den = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
      if (abs(den) < 1e-6) continue;
      const s = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / den;
      const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / den;
      if (s < 0 || s > 1 || u < 0 || u > 1) continue;
      const ga = (a.cum[i] + s * (a.cum[i + 1] - a.cum[i])) / La;
      const gb = (b.cum[j] + u * (b.cum[j + 1] - b.cum[j])) / Lb;
      if (ga > 0.08 && ga < 0.96 && gb > 0.08 && gb < 0.96) {
        return { x: p1.x + s * (p2.x - p1.x), y: p1.y + s * (p2.y - p1.y), ta: ta[i] + s * (ta[i + 1] - ta[i]), tb: tb[j] + u * (tb[j + 1] - tb[j]) };
      }
    }
  }
  return null;
}

/* ====================================================================== effects (state) */
// Glowing points: sparks, glints. Typed arrays, no allocation per frame.
const FX = { n: 0, max: 700 };
const FXK = ['x', 'y', 'z', 'vx', 'vy', 'vz', 'life', 'ml', 'size', 'r', 'g', 'b', 'grav', 'drag'];
FXK.forEach((k) => { FX[k] = new Float32Array(FX.max); });
function fxAdd(x, y, z, vx, vy, vz, life, size, col, grav, drag) {
  if (FX.n >= FX.max) return;
  const i = FX.n++;
  FX.x[i] = x; FX.y[i] = y; FX.z[i] = z; FX.vx[i] = vx; FX.vy[i] = vy; FX.vz[i] = vz;
  FX.life[i] = life; FX.ml[i] = life; FX.size[i] = size; FX.r[i] = col.r; FX.g[i] = col.g; FX.b[i] = col.b;
  FX.grav[i] = grav; FX.drag[i] = drag;
}
const C_WARM = new THREE.Color(WARM).multiplyScalar(1.6), C_GOLD = new THREE.Color('#ffe2a0').multiplyScalar(1.4), C_WHITE = new THREE.Color('#fff6e0').multiplyScalar(1.8);
function sparkBurst(p, n, speed) {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU, e = (rnd() - 0.3) * 1.6, sp = (speed || 6) * (0.4 + rnd());
    fxAdd(p.x, p.y, p.z, cos(a) * cos(e) * sp, sin(e) * sp + 1.5, sin(a) * cos(e) * sp, 0.25 + rnd() * 0.4, 0.16 + rnd() * 0.22, rnd() > 0.4 ? C_WARM : C_GOLD, -9, 1.5);
  }
}
// Glints that run up your thread while you pull.
const GL = [];

/* tissue shreds and marigold petals: instanced paper bits */
const SH = {
  max: 190, petals: 24, n: 0,
  clear() { this.n = 0; },
};
['x', 'y', 'z', 'vx', 'vy', 'vz', 'rx', 'ry', 'rz', 'sx', 'sy', 'sz', 'life', 'ml', 'scale'].forEach((k) => { SH[k] = new Float32Array(SH.max); });
SH.cols = [];
for (let i = 0; i < SH.max; i++) SH.cols.push(new THREE.Color());
SH.dirty = true;
function shredAdd(p, col, sp) {
  if (SH.n >= SH.max - SH.petals) SH.n = 0;
  const i = SH.petals + SH.n++;
  const a = rnd() * TAU, s = (sp || 3) * (0.3 + rnd());
  SH.x[i] = p.x; SH.y[i] = p.y; SH.z[i] = p.z;
  SH.vx[i] = cos(a) * s; SH.vy[i] = 1 + rnd() * 2.5; SH.vz[i] = sin(a) * s;
  SH.rx[i] = rnd() * TAU; SH.ry[i] = rnd() * TAU; SH.rz[i] = rnd() * TAU;
  SH.sx[i] = (rnd() - 0.5) * 9; SH.sy[i] = (rnd() - 0.5) * 9; SH.sz[i] = (rnd() - 0.5) * 9;
  SH.life[i] = 2.2 + rnd() * 1.6; SH.ml[i] = SH.life[i]; SH.scale[i] = 0.7 + rnd() * 0.8;
  SH.cols[i].set(col);
  SH.dirty = true;
}
function shredBurst(p, col, n) {
  for (let i = 0; i < n; i++) shredAdd(p, i % 3 === 0 ? GOLD : i % 5 === 0 ? INK : col, 3.4);
  sparkBurst(p, 12, 7);
}

function floatPop(world, label, pts) {
  G.pops.push({ x: world.x, y: world.y, z: world.z, label, pts, life: 1.1, max: 1.1 });
}

function cutKite(k, byMe, hit) {
  if (!k.alive) return;
  k.alive = false; k.cutT = 0;
  if (hit) k.cutParam = k === G.me ? hit.ta : hit.tb;
  shredBurst(k.world, k.col, 16);
  arc.sfx.tone(byMe ? 740 : 180, 0.18, { type: 'sawtooth', slide: byMe ? 420 : 90, vol: 0.14 });
  flashAt(k.world, byMe);
  if (byMe) {
    const pts = 100 + G.cuts * 20;
    G.cuts++; G.score += pts;
    floatPop(k.world, 'CUT', '+' + pts);
    arc.toast('Thread cut', '+' + pts, 900);
    G.slow = 0.42; R3.punch = 1;
    arc.shake += 7; arc.buzz(35);
    arc.sfx.noise(0.6, { filter: 'bandpass', freq: 900, vol: 0.06 });
    cheer(k);
  } else {
    arc.shake += 11; arc.buzz(90);
    if (k === G.me) cheerRivals();
  }
}

/* ====================================================================== the rules, as in the flat game */
// Tap & swipe: drag anywhere and the kite follows the finger's movement
// (relative, so the thumb never covers it), tap to yank the string for a
// moment, or rest a second finger anywhere to keep pulling.
// Tilt to steer: lean the phone, hold any finger down to pull.
function touchStyle() {
  const p = arc.input.pointer;
  if (!arc.touchMode || arc.touchStyle === 'pads' || !p || p.type === 'mouse') return '';
  return arc.touchStyle;
}

function steerTouch(dt, style) {
  const inp = arc.input, ax = inp.axis(), gz = inp.gesture, me = G.me;
  if (inp.tap()) {
    G.yank = 0.9; G.yanks++;
    arc.sfx.tone(520, 0.06, { type: 'triangle', vol: 0.07 });
  }
  G.yank = max(0, G.yank - dt);
  const keyPull = inp.down('Space', 'KeyJ', 'ShiftLeft', 'ShiftRight');
  const n = fingers.size;
  const pull = keyPull || G.yank > 0 || n >= 2 || (style === 'tilt' && n >= 1) ? 1 : 0;
  me.pull = lerp(me.pull, pull, 1 - Math.exp(-dt * 8));
  if (style === 'gesture' && gz.active && gz.type !== 'mouse') {
    if (!G.drag0) G.drag0 = { fx: gz.x, fy: gz.y, x: me.x, y: me.y };
    const d = G.drag0;
    const tx = clamp(d.x + ((gz.x - d.fx) / arc.w) * 1.6, 0.08, 0.92);
    const ty = clamp(d.y + ((gz.y - d.fy) / arc.h) * 1.6, 0.08, 0.72);
    const k = 1 - Math.exp(-dt * 10);
    me.vx = lerp(me.vx, (tx - me.x) * 5, k);
    me.vy = lerp(me.vy, (ty - me.y) * 5, k);
  } else {
    G.drag0 = null;
  }
  me.vx += ax.x * dt * 1.6;
  me.vy += ax.y * dt * 1.6;
}

function steerMe(dt) {
  const inp = arc.input, ax = inp.axis(), p = inp.pointer;
  const ts = touchStyle();
  if (ts) {
    steerTouch(dt, ts);
    G.me.vx += G.wind.x * dt * 0.35;
    G.me.vy += (G.wind.y - 0.18) * dt * 0.4;
    G.me.vx *= Math.exp(-dt * 1.8); G.me.vy *= Math.exp(-dt * 1.8);
    G.me.x = clamp(G.me.x + G.me.vx * dt, 0.08, 0.92);
    G.me.y = clamp(G.me.y + G.me.vy * dt, 0.08, 0.72);
    return;
  }
  const pull = (inp.action() || inp.down('ShiftLeft', 'ShiftRight')) ? 1 : 0;
  G.me.pull = lerp(G.me.pull, pull, 1 - Math.exp(-dt * 8));
  const keyed = abs(ax.x) > 0.08 || abs(ax.y) > 0.08;
  // While holding pull, mouse only pulls. Steering stays on keys / stick so a
  // click does not yank the kite into a rival line.
  if (!keyed && !pull && p && p.seen) {
    G.me.vx += (p.nx - G.me.x) * dt * 2.6;
    G.me.vy += (clamp(p.ny, 0.06, 0.72) - G.me.y) * dt * 2.6;
  }
  G.me.vx += ax.x * dt * 1.6;
  G.me.vy += ax.y * dt * 1.6;
  G.me.vx += G.wind.x * dt * 0.35;
  G.me.vy += (G.wind.y - 0.18) * dt * 0.4;
  G.me.vx *= Math.exp(-dt * 1.8); G.me.vy *= Math.exp(-dt * 1.8);
  G.me.x = clamp(G.me.x + G.me.vx * dt, 0.08, 0.92);
  G.me.y = clamp(G.me.y + G.me.vy * dt, 0.08, 0.72);
}

function steerAI(k, dt) {
  const ai = k.ai;
  ai.wait -= dt;
  if (ai.wait <= 0) {
    ai.tx = 0.12 + rnd() * 0.76; ai.ty = 0.12 + rnd() * 0.55;
    ai.wait = 1.2 + rnd() * 2.2;
  }
  const aiMul = (G.D || DIFF.normal).ai;
  k.vx += (ai.tx - k.x) * dt * 0.9 * aiMul;
  k.vy += (ai.ty - k.y) * dt * 0.9 * aiMul;
  k.vx += G.wind.x * dt * 0.25; k.vy += G.wind.y * dt * 0.2;
  k.vx *= Math.exp(-dt * 1.4); k.vy *= Math.exp(-dt * 1.4);
  k.x = clamp(k.x + k.vx * dt, 0.06, 0.94);
  k.y = clamp(k.y + k.vy * dt, 0.08, 0.7);
  const near = hypot(k.x - G.me.x, k.y - G.me.y) < 0.16;
  // Rivals only yank hard after the player has had a real start.
  const want = near && G.t > 4.5 ? 0.72 : 0.22;
  k.pull = lerp(k.pull, want, dt * 1.6);
}

function stepKite(k, dt) {
  k.bob += dt;
  if (!k.alive) {
    k.cutT += dt; k.vy += dt * 0.55;
    k.y += k.vy * dt * 0.4; k.x += sin(k.cutT * 3) * dt * 0.08;
    k.depth += dt * 3.5;
  }
}

function fights(dt) {
  if (!G.me.alive || G.t < (G.grace || 0) || G.cutCool > 0) return;
  G.rivals.forEach((r) => {
    if (!r.alive) return;
    const hit = threadHit(G.me, r);
    if (!hit) return;
    const mine = G.me.pull, theirs = r.pull;
    // Manja spark where the lines cross, even before a cut resolves.
    if (G.crossSpark <= 0) {
      threadAt(G.me, hit.ta, G.me.anchor, G.me.bridle, T.c);
      sparkBurst(T.c, 7, 4);
      G.crossSpark = 0.12;
      arc.sfx.noise(0.07, { filter: 'highpass', freq: 3200, vol: 0.05 });
    }
    // You win any cross while pulling. You only lose if you are gliding and
    // they are clearly yanking. Crossing with both gliding does nothing.
    if (mine >= 0.45 && mine + 0.05 >= theirs) {
      cutKite(r, true, hit); G.cutCool = 0.55;
    } else if (theirs >= 0.55 && mine < 0.35) {
      cutKite(G.me, false, hit); G.alive = false; G.phase = 'cut';
    }
  });
}

function spawnRival() {
  const live = G.rivals.filter((r) => r.alive).length;
  if (live >= (G.D || DIFF.normal).rivals) return;
  const r = kite((rnd() * COLS.length) | 0, rnd() > 0.5 ? 0.08 : 0.92, 0.15 + rnd() * 0.4, {
    tx: 0.3 + rnd() * 0.4, ty: 0.25 + rnd() * 0.35, wait: 0.4,
  }, 38 + rnd() * 22);
  attachKite(r);
  G.rivals.push(r);
}

function finish(why) {
  if (G.phase === 'over' || G.attract || !arc || arc.state !== 'play') return;
  G.phase = 'over';
  arc.over({
    eyebrow: why, title: G.cuts >= 6 ? 'Sky <em>cleared</em>' : 'Thread <em>cut</em>',
    score: G.score, scoreLabel: 'Score',
    html: '<p>' + G.cuts + ' rival threads cut' + (G.alive ? ', and yours held.' : '.') + '</p>',
    again: 'Fly again',
  });
}

function update(dtReal) {
  R3.realDt = dtReal;
  if (G.slow > 0) G.slow -= dtReal;
  const dt = G.slow > 0 ? dtReal * 0.35 : dtReal;
  G.t += dt; G.hintT += dtReal; G.cutCool = max(0, (G.cutCool || 0) - dt);
  G.crossSpark = max(0, (G.crossSpark || 0) - dt);
  if (G.mode === 'dusk') G.time -= dt;
  G.wind.x = 0.25 + 0.35 * sin(G.t * 0.35);
  G.wind.y = 0.08 + 0.12 * cos(G.t * 0.27);
  if (G.phase === 'over') { stepVisual(dt, dtReal); return; }
  if (G.alive) steerMe(dt);
  G.rivals.forEach((r) => { if (r.alive) steerAI(r, dt); });
  stepKite(G.me, dt);
  G.rivals.forEach((r) => stepKite(r, dt));
  syncWorld();
  fights(dt);
  G.spawnT = (G.spawnT || 0) + dt;
  const spawnEvery = (G.D || DIFF.normal).spawn;
  if (G.spawnT >= spawnEvery) { G.spawnT = 0; spawnRival(); }
  // Rivals that fell out of the sky long ago give their kite back to the pool.
  for (let i = G.rivals.length - 1; i >= 0; i--) {
    const r = G.rivals[i];
    if (!r.alive && r.cutT > 4.2) { releaseKite(r); G.rivals.splice(i, 1); }
  }
  for (let i = G.pops.length - 1; i >= 0; i--) {
    const p = G.pops[i];
    p.life -= dtReal;
    if (p.life <= 0) G.pops.splice(i, 1);
  }
  // Glints run up your string while you pull.
  if (G.me.alive && G.me.pull > 0.5) {
    G.glintT -= dt;
    if (G.glintT <= 0) { G.glintT = 0.06; if (GL.length < 40) GL.push({ t: 0.04, v: 0.9 + rnd() * 0.6 }); }
  }
  stepVisual(dt, dtReal);

  if (!G.alive && G.me.cutT > 2.6) finish('Your thread');
  else if (G.mode === 'dusk' && G.time <= 0) { G.time = 0; finish('Dusk'); }
  else if (G.mode === 'hunt' && G.alive && G.cuts >= 6) finish('Sky cleared');
  G.score += dt * 2;
}

function idle(dt, a) {
  if (a && a.state === 'pause') return;
  R3.realDt = dt;
  G.t += dt; G.attract = true;
  if (!G.me) resetWorld(true);
  G.wind.x = 0.3 + 0.2 * sin(G.t * 0.4);
  G.me.x = 0.42 + 0.12 * sin(G.t * 0.6);
  G.me.y = 0.42 + 0.08 * cos(G.t * 0.5);
  G.me.pull = 0.4;
  G.rivals.forEach((r, i) => {
    if (r.alive) {
      r.x = 0.25 + 0.15 * sin(G.t * 0.5 + i) + i * 0.12;
      r.y = 0.28 + 0.12 * cos(G.t * 0.4 + i);
    }
    stepKite(r, dt);
  });
  stepKite(G.me, dt);
  for (let i = G.pops.length - 1; i >= 0; i--) { G.pops[i].life -= dt; if (G.pops[i].life <= 0) G.pops.splice(i, 1); }
  syncWorld();
  stepVisual(dt, dt);
}

/* ====================================================================== textures */
function cv(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, o) {
  o = o || {};
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (o.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = o.aniso == null ? R3.aniso : o.aniso;
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  return t;
}
function grain(g, w, h, n, a, seed) {
  const r = A.rng(seed || 3);
  for (let i = 0; i < n; i++) {
    const v = r();
    g.fillStyle = v > 0.5 ? 'rgba(255,255,255,' + (a * r()) + ')' : 'rgba(40,28,20,' + (a * r()) + ')';
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

// One facade tile: four bays by four floors of windows (12 m by 12.8 m).
function paintFacade() {
  const S = 512, c = cv(S, S), g = c.getContext('2d');
  const e = cv(S, S), ge = e.getContext('2d');
  ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
  g.fillStyle = '#efe7da'; g.fillRect(0, 0, S, S);
  grain(g, S, S, 9000, 0.12, 5);
  const r = A.rng(17);
  for (let fy = 0; fy < 4; fy++) {
    for (let cx = 0; cx < 4; cx++) {
      const x0 = cx * 128, y0 = fy * 128;
      // floor slab and its shadow
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(x0, y0, 128, 7);
      g.fillStyle = 'rgba(70,45,30,0.22)'; g.fillRect(x0, y0 + 7, 128, 7);
      const kind = r();
      if (kind < 0.08) continue;
      const wx = x0 + 30, wy = y0 + 32, ww = 68, wh = 68;
      g.fillStyle = 'rgba(70,45,30,0.3)'; g.fillRect(wx - 8, wy - 10, ww + 16, 7);
      g.fillStyle = '#7d6a56'; g.fillRect(wx - 4, wy - 4, ww + 8, wh + 8);
      g.fillStyle = '#262a31'; g.fillRect(wx, wy, ww, wh);
      const lit = r() < 0.42;
      if (lit) {
        const warm = r() > 0.35;
        ge.fillStyle = warm ? '#ffbd5c' : '#ffe2b0'; ge.fillRect(wx + 2, wy + 2, ww - 4, wh - 4);
        ge.fillStyle = 'rgba(120,40,20,0.55)'; ge.fillRect(wx + 2, wy + 2, 18, wh - 4); ge.fillRect(wx + ww - 20, wy + 2, 18, wh - 4);
        g.fillStyle = '#4a3a2a'; g.fillRect(wx, wy, ww, wh);
      }
      if (kind < 0.42) {
        const sc = ['#3f7a5a', '#3a6d8c', '#8c4a3a', '#2f6f6a', '#6b5a8c'][(r() * 5) | 0];
        g.fillStyle = sc;
        g.fillRect(wx - 2, wy, ww * 0.3, wh); g.fillRect(wx + ww * 0.72 + 2, wy, ww * 0.3, wh);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let s = 0; s < 8; s++) { g.fillRect(wx - 2, wy + 4 + s * 8, ww * 0.3, 2); g.fillRect(wx + ww * 0.72 + 2, wy + 4 + s * 8, ww * 0.3, 2); }
      } else {
        g.fillStyle = '#3e352d';
        for (let s = 1; s < 6; s++) g.fillRect(wx + s * (ww / 6) - 1, wy, 3, wh);
        g.fillRect(wx, wy + wh * 0.5, ww, 3);
      }
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(wx - 7, wy + wh + 4, ww + 14, 5);
      // rain streaks under the sill
      g.fillStyle = 'rgba(60,45,35,0.12)';
      for (let s = 0; s < 4; s++) g.fillRect(wx + r() * ww, wy + wh + 9, 2 + r() * 3, 14 + r() * 26);
      // an air conditioner box now and then
      if (r() < 0.16) { g.fillStyle = '#d8d6cf'; g.fillRect(wx + ww - 26, wy + wh + 12, 30, 18); g.fillStyle = '#9a978f'; for (let s = 0; s < 4; s++) g.fillRect(wx + ww - 22 + s * 6, wy + wh + 15, 2, 12); }
    }
  }
  // a plain corner the parapets and stair rooms read from
  g.fillStyle = '#efe7da'; g.fillRect(0, S - 10, 10, 10);
  ge.fillStyle = '#000'; ge.fillRect(0, S - 10, 10, 10);
  return { map: c, emis: e };
}

function paintRoof() {
  const S = 256, c = cv(S, S), g = c.getContext('2d');
  g.fillStyle = '#c7bdb0'; g.fillRect(0, 0, S, S);
  grain(g, S, S, 5000, 0.18, 9);
  g.strokeStyle = 'rgba(60,45,35,0.18)'; g.lineWidth = 1.2;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, S); g.stroke(); g.beginPath(); g.moveTo(0, i * 32); g.lineTo(S, i * 32); g.stroke(); }
  const r = A.rng(4);
  for (let i = 0; i < 14; i++) {
    const x = r() * S, y = r() * S, rad = 8 + r() * 28;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(70,55,45,0.22)'); gr.addColorStop(1, 'rgba(70,55,45,0)');
    g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return c;
}

function paintDot(inner) {
  const S = 128, c = cv(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(inner || 0.18, 'rgba(255,255,255,0.55)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S);
  return c;
}

// A distant skyline: rooftops, water towers and trees as a hazy silhouette band.
function paintSkyline() {
  const W = 2048, H = 256, c = cv(W, H), g = c.getContext('2d');
  const r = A.rng(77);
  g.clearRect(0, 0, W, H);
  const band = (base, amp, alpha, step) => {
    g.fillStyle = 'rgba(255,255,255,' + alpha + ')';
    g.beginPath(); g.moveTo(0, H);
    let x = 0;
    while (x < W) {
      const w = step * (0.6 + r() * 1.2), h = base + r() * amp;
      g.lineTo(x, H - h); g.lineTo(x + w, H - h);
      if (r() < 0.12) { g.lineTo(x + w * 0.5 - 4, H - h); g.lineTo(x + w * 0.5 - 4, H - h - 26 - r() * 30); g.lineTo(x + w * 0.5 + 4, H - h - 26 - r() * 30); g.lineTo(x + w * 0.5 + 4, H - h); }
      if (r() < 0.1) { g.arc(x + w * 0.5, H - h, w * 0.32, PI, 0); }
      x += w;
    }
    g.lineTo(W, H); g.closePath(); g.fill();
  };
  band(40, 70, 0.55, 26);
  band(18, 45, 1, 34);
  return c;
}

// The patterns on kite paper, each drawn on an upright diamond.
function paintKite(c, k) {
  const g = c.getContext('2d'), S = c.width;
  g.clearRect(0, 0, S, S);
  g.save();
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S, S / 2); g.lineTo(S / 2, S); g.lineTo(0, S / 2); g.closePath(); g.clip();
  const a = k.col, b = k.col2;
  g.fillStyle = a; g.fillRect(0, 0, S, S);
  const d = (k.ci + k.pat) % 6;
  if (d === 0) { g.fillStyle = b; g.beginPath(); g.arc(S / 2, S * 0.4, S * 0.17, 0, TAU); g.fill(); g.fillStyle = a; g.beginPath(); g.arc(S * 0.54, S * 0.37, S * 0.14, 0, TAU); g.fill(); }
  else if (d === 1) { g.fillStyle = b; g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S, S / 2); g.lineTo(0, S / 2); g.closePath(); g.fill(); }
  else if (d === 2) { g.fillStyle = b; for (let i = 0; i < 4; i++) g.fillRect(0, S * (0.18 + i * 0.2), S, S * 0.07); }
  else if (d === 3) { g.fillStyle = b; g.beginPath(); g.moveTo(0, S / 2); g.lineTo(S / 2, S * 0.3); g.lineTo(S / 2, S * 0.7); g.closePath(); g.fill(); g.beginPath(); g.moveTo(S, S / 2); g.lineTo(S / 2, S * 0.3); g.lineTo(S / 2, S * 0.7); g.closePath(); g.fill(); g.fillStyle = '#FBF5EC'; g.beginPath(); g.arc(S / 2, S / 2, S * 0.06, 0, TAU); g.fill(); }
  else if (d === 4) { g.fillStyle = b; g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S, S / 2); g.lineTo(S / 2, S); g.closePath(); g.fill(); g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(0, S / 2); g.lineTo(S / 2, 0); g.closePath(); g.fill(); }
  else { g.fillStyle = b; g.beginPath(); for (let i = 0; i < 10; i++) { const ang = i * PI / 5 - PI / 2, rr = i % 2 ? S * 0.08 : S * 0.2; g.lineTo(S / 2 + cos(ang) * rr, S * 0.46 + sin(ang) * rr); } g.closePath(); g.fill(); }
  // tissue fibres
  grain(g, S, S, 900, 0.16, 11 + k.ci);
  // a border band
  g.strokeStyle = 'rgba(255,240,210,0.75)'; g.lineWidth = S * 0.035;
  g.beginPath(); g.moveTo(S / 2, S * 0.03); g.lineTo(S * 0.97, S / 2); g.lineTo(S / 2, S * 0.97); g.lineTo(S * 0.03, S / 2); g.closePath(); g.stroke();
  g.restore();
}

/* ====================================================================== shaders and helpers */
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = (modelMatrix * vec4(position, 1.0)).xyz - cameraPosition; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position.z = gl_Position.w; }';
const SKY_FS = [
  'uniform vec3 uSun; uniform float uTod; uniform float uTime;',
  'uniform vec3 uZen0; uniform vec3 uZen1; uniform vec3 uMid0; uniform vec3 uMid1; uniform vec3 uHor0; uniform vec3 uHor1; uniform vec3 uSunC0; uniform vec3 uSunC1;',
  'varying vec3 vDir;',
  'float h21(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
  'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1,0)), f.x), mix(h21(i + vec2(0,1)), h21(i + vec2(1,1)), f.x), f.y); }',
  '#ifndef OCT', '#define OCT 4', '#endif',
  'float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < OCT; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }',
  'void main(){',
  '  vec3 d = normalize(vDir); float y = d.y;',
  '  vec3 zen = mix(uZen0, uZen1, uTod), mid = mix(uMid0, uMid1, uTod), hor = mix(uHor0, uHor1, uTod), sunC = mix(uSunC0, uSunC1, uTod);',
  '  float sd = max(dot(d, uSun), 0.0);',
  '  vec3 col = mix(hor, mid, smoothstep(0.0, 0.2, y));',
  '  col = mix(col, zen, smoothstep(0.14, 0.75, y));',
  '  col += sunC * (pow(sd, 5.0) * 0.45 + pow(sd, 48.0) * 0.8) * (1.0 - smoothstep(0.0, 0.5, y) * 0.5);',
  '  if (y < 0.0) col = mix(hor * 0.9, hor * 0.55, smoothstep(0.0, -0.25, y));',
  '  vec2 cp = d.xz / max(0.07, y + 0.08) * 0.55 + vec2(uTime * 0.006, 0.0);',
  '  float n = fbm(cp * vec2(0.6, 1.8));',
  '  float cl = smoothstep(0.5, 0.82, n) * smoothstep(0.015, 0.09, y) * (1.0 - smoothstep(0.3, 0.6, y));',
  '  vec3 cc = mix(mid * 1.15, zen * 1.6 + vec3(0.08, 0.03, 0.06), smoothstep(0.1, 0.4, y)) + sunC * pow(sd, 3.0) * 1.2;',
  '  col = mix(col, cc, cl * 0.8);',
  '  float disk = smoothstep(0.99955, 0.99975, sd);',
  '  col = mix(col, sunC * 3.2 + vec3(0.6, 0.45, 0.25), disk * smoothstep(-0.012, 0.004, y));',
  '  float st = step(0.9975, h21(floor(d.xy * 420.0 + d.z * 37.0))) * smoothstep(0.25, 0.6, y) * smoothstep(0.55, 0.95, uTod);',
  '  col += vec3(st) * 0.9;',
  '  gl_FragColor = vec4(col, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}',
].join('\n');

const THREAD_VS = 'attribute float aSide; attribute vec4 aCol; varying float vS; varying vec4 vC; void main(){ vS = aSide; vC = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const THREAD_FS = 'varying float vS; varying vec4 vC; void main(){ float d = abs(vS); float core = smoothstep(0.38, 0.0, d); float glow = pow(1.0 - d, 2.4); gl_FragColor = vec4(vC.rgb * (glow * 0.5 + core * 1.3), vC.a);\n#include <colorspace_fragment>\n}';

const PT_VS = 'attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale; varying float vA; varying vec3 vC; void main(){ vA = aAlpha; vC = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = clamp(aSize * uScale / max(0.1, -mv.z), 1.0, 256.0); gl_Position = projectionMatrix * mv; }';
const PT_FS = 'varying float vA; varying vec3 vC; void main(){ vec2 d = gl_PointCoord - 0.5; float r = length(d) * 2.0; float a = pow(max(0.0, 1.0 - r), 1.8); if (a < 0.01) discard; gl_FragColor = vec4(vC * a * vA, 1.0);\n#include <colorspace_fragment>\n}';

class Points {
  constructor(max) {
    this.max = max; this.n = 0;
    this.pos = new Float32Array(max * 3); this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.mat = new THREE.ShaderMaterial({ uniforms: { uScale: { value: 600 } }, vertexShader: PT_VS, fragmentShader: PT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false });
    this.mesh = new THREE.Points(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 6; this.geo = g;
  }
  begin() { this.n = 0; }
  push(x, y, z, size, a, r, gg, b) {
    if (this.n >= this.max) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.size[i] = size; this.alpha[i] = a; this.col[i * 3] = r; this.col[i * 3 + 1] = gg; this.col[i * 3 + 2] = b;
  }
  end() {
    this.geo.setDrawRange(0, this.n);
    const at = this.geo.attributes; at.position.needsUpdate = at.aSize.needsUpdate = at.aAlpha.needsUpdate = at.aColor.needsUpdate = true;
  }
}

// A strip that always faces the camera: threads and kite tails.
class Ribbon {
  constructor(n, mat, glow) {
    this.n = n; this.glow = glow;
    this.pos = new Float32Array(n * 6);
    this.col = new Float32Array(n * 2 * (glow ? 4 : 3));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    if (glow) {
      const side = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) { side[i * 2] = -1; side[i * 2 + 1] = 1; }
      g.setAttribute('aSide', new THREE.BufferAttribute(side, 1));
      g.setAttribute('aCol', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    } else {
      g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = glow ? 4 : 2;
    this.pts = []; for (let i = 0; i < n; i++) this.pts.push(new V3());
    this.w = new Float32Array(n); this.c = new Float32Array(n * 4);
    this.side = new V3(); this.tan = new V3(); this.view = new V3();
  }
  // cnt points in this.pts, widths in this.w, colours in this.c
  build(cnt, camPos) {
    cnt = min(cnt, this.n);
    if (cnt < 2) { this.mesh.visible = false; return; }
    this.mesh.visible = true;
    const P = this.pts, pos = this.pos, col = this.col, st = this.glow ? 4 : 3;
    for (let i = 0; i < cnt; i++) {
      const a = P[max(0, i - 1)], b = P[min(cnt - 1, i + 1)];
      this.tan.subVectors(b, a);
      this.view.subVectors(camPos, P[i]);
      T.w.crossVectors(this.tan, this.view);
      const l = T.w.length();
      if (l > 1e-6) this.side.copy(T.w).multiplyScalar(1 / l);
      const hw = this.w[i] * 0.5, p = P[i], o = i * 6;
      pos[o] = p.x - this.side.x * hw; pos[o + 1] = p.y - this.side.y * hw; pos[o + 2] = p.z - this.side.z * hw;
      pos[o + 3] = p.x + this.side.x * hw; pos[o + 4] = p.y + this.side.y * hw; pos[o + 5] = p.z + this.side.z * hw;
      const ci = i * 2 * st;
      for (let s = 0; s < st; s++) { col[ci + s] = this.c[i * 4 + s]; col[ci + st + s] = this.c[i * 4 + s]; }
    }
    this.geo.setDrawRange(0, (cnt - 1) * 6);
    this.geo.attributes.position.needsUpdate = true;
    (this.glow ? this.geo.attributes.aCol : this.geo.attributes.color).needsUpdate = true;
  }
}

// Concatenate geometries that carry position, normal and uv.
function merge(list) {
  const arrs = { position: [], normal: [], uv: [] };
  for (const g0 of list) {
    const g = g0.index ? g0.toNonIndexed() : g0;
    for (const k of ['position', 'normal', 'uv']) {
      const at = g.attributes[k];
      if (at) arrs[k].push(...at.array);
      else if (k === 'uv') { const n = g.attributes.position.count; for (let i = 0; i < n * 2; i++) arrs.uv.push(0); }
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(arrs.position, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(arrs.normal, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(arrs.uv, 2));
  return out;
}

/* ====================================================================== the city */
const PAL_WALL = ['#efe1cb', '#ecc3b0', '#f2dc9c', '#bfd9cf', '#d9c8e6', '#f0c79c', '#e9e3d6', '#c8dbe7', '#f2b49e', '#dbe6b8', '#f6efe2', '#e7b8c8', '#f5d0a0', '#b8d4e0'];
const PAL_ROOF = ['#b9afa2', '#a89d90', '#c4a68c', '#a7a29b', '#c2b8a8', '#b8977f', '#9d958c'];
const CITY = { b: [], gaps: [] };
function genCity() {
  const r = A.rng(20261108);
  const B = CITY.b; B.length = 0; CITY.gaps.length = 0;
  B.push({ x0: -7, x1: 7, z0: -5, z1: 9, h: 9, own: true, col: '#efe2cc', roof: '#b8ab9a', detail: true, offU: 0, offV: 0 });
  B.push({ x0: -22, x1: -7.6, z0: -7, z1: 12, h: 9.4, col: '#ecc3b0', roof: '#b0a596', detail: true, offU: 0.25, offV: 0.5, tank: true });
  B.push({ x0: 7.6, x1: 21, z0: -6, z1: 12, h: 8.2, col: '#bfd9cf', roof: '#a99f92', detail: true, offU: 0.5, offV: 0.25, mumty: true });
  let z = -9.5;
  while (z > -340) {
    const far = z < -150;
    const depth = far ? 16 + r() * 12 : 9 + r() * 5;
    const half = min(far ? 260 : 240, 24 + (-z) * 1.05);
    let x = -half + r() * 4;
    while (x < half) {
      const w = far ? 10 + r() * 12 : 6 + r() * 6.5;
      const cz = z - depth / 2, cx = x + w / 2;
      const capH = 7.4 + max(0, -cz - 16) * 0.15 + max(0, abs(cx) - 8) * 0.1;
      if (r() < 0.065) { CITY.gaps.push({ x: cx, z: cz, cap: capH, w, d: depth }); x += w; continue; }
      const floors = 2 + floor(r() * 4);
      let h = floors * 3.15 + 0.3 + r() * 0.9;
      h = min(h, capH);
      if (h < 4.6) h = 4.6 + r();
      B.push({
        x0: x, x1: x + w - 0.4, z0: z - depth, z1: z - (r() < 0.3 ? 1.4 : 0.3), h,
        col: PAL_WALL[floor(r() * PAL_WALL.length)], roof: PAL_ROOF[floor(r() * PAL_ROOF.length)],
        detail: !far && cz > -135, near: cz > -75, offU: floor(r() * 4) / 4, offV: floor(r() * 4) / 4,
        tank: r() < 0.62, mumty: r() < 0.38, dish: r() < 0.32, ant: r() < 0.36, band: r() < 0.45,
        bandCol: ['#c9563c', '#3f7a8c', '#d9a23a', '#7a4a8c', '#2f7a5a', '#b23a5c'][floor(r() * 6)],
      });
      x += w;
    }
    z -= depth + (r() < 0.42 ? 5 + r() * 3.5 : 0.7);
  }
}

function buildCity(scene, facade, roofT) {
  const W = { p: [], n: [], u: [], c: [] }, Rf = { p: [], n: [], u: [], c: [] };
  const col = new THREE.Color(), cb = new THREE.Color(), ct = new THREE.Color();
  const PU = 0.004, PV = 0.006;
  const vtx = (g, x, y, z, nx, ny, nz, u, v, c) => { g.p.push(x, y, z); g.n.push(nx, ny, nz); g.u.push(u, v); g.c.push(c.r, c.g, c.b); };
  // quad a b c d, CCW seen from its normal
  const quad = (g, a, b, c, d, n, uv, ca, cc) => {
    vtx(g, a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1], ca);
    vtx(g, b[0], b[1], b[2], n[0], n[1], n[2], uv[2], uv[3], ca);
    vtx(g, c[0], c[1], c[2], n[0], n[1], n[2], uv[4], uv[5], cc);
    vtx(g, a[0], a[1], a[2], n[0], n[1], n[2], uv[0], uv[1], ca);
    vtx(g, c[0], c[1], c[2], n[0], n[1], n[2], uv[4], uv[5], cc);
    vtx(g, d[0], d[1], d[2], n[0], n[1], n[2], uv[6], uv[7], cc);
  };
  const plainUV = [PU, PV, PU, PV, PU, PV, PU, PV];
  // four walls of a box between y0 and y1; facade uvs or plain
  const walls = (x0, x1, z0, z1, y0, y1, c0, c1, b, plain, skipBack) => {
    const fu = (s) => s / 12 + (b ? b.offU : 0), fv = (y) => y / 12.8 + (b ? b.offV : 0);
    const uvz = (sa, sb) => plain ? plainUV : [fu(sa), fv(y0), fu(sb), fv(y0), fu(sb), fv(y1), fu(sa), fv(y1)];
    quad(W, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], uvz(x0, x1), c0, c1);
    if (!skipBack) quad(W, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], uvz(x1, x0), c0, c1);
    quad(W, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], uvz(-z1, -z0), c0, c1);
    quad(W, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], uvz(z0, z1), c0, c1);
  };
  const top = (g, x0, x1, z0, z1, y, c) => {
    quad(g, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0 / 4, z1 / 4, x1 / 4, z1 / 4, x1 / 4, z0 / 4, x0 / 4, z0 / 4], c, c);
  };
  const plainTop = (x0, x1, z0, z1, y, c) => quad(W, [x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], plainUV, c, c);

  for (const b of CITY.b) {
    col.set(b.col);
    cb.copy(col).multiplyScalar(0.42); ct.copy(col);
    const PH = 0.95, PT = 0.22;
    // the facade, darker at the foot (a cheap ambient occlusion)
    walls(b.x0, b.x1, b.z0, b.z1, 0, b.h, cb, ct, b, false, false);
    // the parapet band
    const band = new THREE.Color(b.band ? b.bandCol : b.col).multiplyScalar(b.band ? 1 : 0.9);
    if (b.own) {
      // your own terrace: a parapet at the front and the sides only
      const pc = new THREE.Color('#e6d6bd');
      walls(b.x0, b.x1, b.z1 - PT, b.z1, b.h, b.h + 1.0, pc, pc, null, true, true);
      walls(b.x0, b.x0 + PT, b.z0, b.z1, b.h, b.h + 1.0, pc, pc, null, true, false);
      walls(b.x1 - PT, b.x1, b.z0, b.z1, b.h, b.h + 1.0, pc, pc, null, true, false);
      plainTop(b.x0, b.x1, b.z1 - PT, b.z1, b.h + 1.0, new THREE.Color('#f4e8d4'));
      plainTop(b.x0, b.x0 + PT, b.z0, b.z1, b.h + 1.0, new THREE.Color('#f4e8d4'));
      plainTop(b.x1 - PT, b.x1, b.z0, b.z1, b.h + 1.0, new THREE.Color('#f4e8d4'));
    } else {
      walls(b.x0, b.x1, b.z0, b.z1, b.h, b.h + PH, band, band, null, true, false);
      if (b.detail) {
        const inner = new THREE.Color(b.col).multiplyScalar(0.8);
        // inner faces of the parapet, seen across the roof
        quad(W, [b.x0 + PT, b.h, b.z0 + PT], [b.x1 - PT, b.h, b.z0 + PT], [b.x1 - PT, b.h + PH, b.z0 + PT], [b.x0 + PT, b.h + PH, b.z0 + PT], [0, 0, 1], plainUV, inner, inner);
        quad(W, [b.x0 + PT, b.h, b.z1 - PT], [b.x0 + PT, b.h, b.z0 + PT], [b.x0 + PT, b.h + PH, b.z0 + PT], [b.x0 + PT, b.h + PH, b.z1 - PT], [1, 0, 0], plainUV, inner, inner);
        quad(W, [b.x1 - PT, b.h, b.z0 + PT], [b.x1 - PT, b.h, b.z1 - PT], [b.x1 - PT, b.h + PH, b.z1 - PT], [b.x1 - PT, b.h + PH, b.z0 + PT], [-1, 0, 0], plainUV, inner, inner);
        const capc = new THREE.Color(b.col).lerp(new THREE.Color('#ffffff'), 0.25);
        plainTop(b.x0, b.x1, b.z1 - PT, b.z1, b.h + PH, capc);
        plainTop(b.x0, b.x1, b.z0, b.z0 + PT, b.h + PH, capc);
        plainTop(b.x0, b.x0 + PT, b.z0, b.z1, b.h + PH, capc);
        plainTop(b.x1 - PT, b.x1, b.z0, b.z1, b.h + PH, capc);
      } else {
        plainTop(b.x0, b.x1, b.z0, b.z1, b.h + PH, band);
      }
    }
    const rc = new THREE.Color(b.roof);
    top(Rf, b.x0, b.x1, b.z0, b.z1, b.h + 0.01, rc);
    // a stair room on the roof
    if (b.mumty && b.detail) {
      const mx1 = b.x1 - 0.5, mx0 = mx1 - 2.6, mz0 = b.z0 + 0.5, mz1 = mz0 + 2.8, mh = b.h + 2.6;
      const mc = new THREE.Color(b.col).multiplyScalar(0.95), mb = new THREE.Color(b.col).multiplyScalar(0.62);
      walls(mx0, mx1, mz0, mz1, b.h, mh, mb, mc, { offU: b.offU + 0.25, offV: b.offV + 0.5 - b.h / 12.8 }, false, false);
      plainTop(mx0 - 0.15, mx1 + 0.15, mz0 - 0.15, mz1 + 0.15, mh, new THREE.Color(b.roof).multiplyScalar(0.9));
    }
  }
  const mk = (g) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(g.u, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(g.c, 3));
    geo.computeBoundingSphere();
    return geo;
  };
  const wallMat = new THREE.MeshStandardMaterial({ map: facade.map, emissiveMap: facade.emis, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.4, vertexColors: true, roughness: 0.92, metalness: 0 });
  const roofMat = new THREE.MeshStandardMaterial({ map: roofT, vertexColors: true, roughness: 0.96, metalness: 0 });
  const wm = new THREE.Mesh(mk(W), wallMat); wm.castShadow = true; wm.receiveShadow = true;
  const rm = new THREE.Mesh(mk(Rf), roofMat); rm.receiveShadow = true;
  scene.add(wm); scene.add(rm);
  // a cheaper pair of materials for the lightest quality level
  const wallL = new THREE.MeshLambertMaterial({ map: facade.map, emissiveMap: facade.emis, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.4, vertexColors: true });
  const roofL = new THREE.MeshLambertMaterial({ map: roofT, vertexColors: true });
  R3.wallMat = wallMat; R3.walls = wm; R3.roofs = rm;
  R3.mats = { wall: [wallL, wallMat], roof: [roofL, roofMat] };
}

/* rooftop clutter: tanks, dishes, antennas, trees, laundry, lights, bunting */
function instanced(geo, mat, n, scene, shadow) {
  const m = new THREE.InstancedMesh(geo, mat, max(1, n));
  m.count = n; m.castShadow = !!shadow; m.receiveShadow = !!shadow; m.frustumCulled = false;
  scene.add(m);
  return m;
}
function setM(mesh, i, x, y, z, ry, sx, sy, sz, rx, rz) {
  T.e.set(rx || 0, ry || 0, rz || 0, 'YXZ'); T.quat.setFromEuler(T.e); T.v.set(x, y, z); T.s.set(sx, sy == null ? sx : sy, sz == null ? sx : sz);
  T.m.compose(T.v, T.quat, T.s); mesh.setMatrixAt(i, T.m);
}

const STRANDS = []; // festival light strings: {pts: [V3], cols: [Color], ph}
const BUNT = []; // bunting: {a, b, n, flags: [{p, ry}]}
function buildClutter(scene) {
  const r = A.rng(99);
  const det = CITY.b.filter((b) => b.detail && !b.own);
  // water tanks on stands
  const tanks = det.filter((b) => b.tank);
  const tankM = instanced(new THREE.CylinderGeometry(0.66, 0.7, 1.3, 14), new THREE.MeshStandardMaterial({ color: '#1e1f22', roughness: 0.45, metalness: 0.05 }), tanks.length, scene, true);
  const standM = instanced(new THREE.BoxGeometry(1.5, 0.45, 1.5), new THREE.MeshStandardMaterial({ color: '#8f877c', roughness: 0.9 }), tanks.length, scene, true);
  tanks.forEach((b, i) => {
    const x = b.x0 + 1.2 + r() * max(0.1, b.x1 - b.x0 - 4), zz = b.z0 + 1.3 + r() * 1.2;
    setM(standM, i, x, b.h + 0.22, zz, 0, 1);
    setM(tankM, i, x, b.h + 0.45 + 0.65, zz, 0, 1);
  });
  // dishes
  const dishes = det.filter((b) => b.dish);
  const dg = new THREE.SphereGeometry(0.46, 12, 6, 0, TAU, 0, PI * 0.33); dg.rotateX(-PI * 0.6);
  const dishM = instanced(dg, new THREE.MeshStandardMaterial({ color: '#dcd8cf', roughness: 0.4, metalness: 0.35, side: THREE.DoubleSide }), dishes.length, scene, false);
  dishes.forEach((b, i) => setM(dishM, i, b.x0 + 0.9 + r() * 2, b.h + 1.3, b.z1 - 0.7, PI + (r() - 0.5) * 1.4, 1));
  // TV antennas
  const ants = det.filter((b) => b.ant);
  const ag = merge([
    new THREE.BoxGeometry(0.05, 3.0, 0.05).translate(0, 1.5, 0),
    new THREE.BoxGeometry(1.1, 0.04, 0.04).translate(0, 2.4, 0),
    new THREE.BoxGeometry(0.85, 0.04, 0.04).translate(0, 2.65, 0),
    new THREE.BoxGeometry(0.6, 0.04, 0.04).translate(0, 2.88, 0),
  ]);
  const antM = instanced(ag, new THREE.MeshStandardMaterial({ color: '#4d4843', roughness: 0.5, metalness: 0.6 }), ants.length, scene, true);
  ants.forEach((b, i) => setM(antM, i, b.x0 + 0.5 + r() * (b.x1 - b.x0 - 1), b.h + 0.9, b.z0 + 0.6 + r() * (b.z1 - b.z0 - 1.2), r() * PI, 1));
  // trees in the gaps between houses
  const gaps = CITY.gaps.filter((g) => g.z > -170);
  const canopy = new THREE.IcosahedronGeometry(1, 1);
  const leafM = instanced(canopy, new THREE.MeshStandardMaterial({ color: '#4d6b34', roughness: 0.85, flatShading: true }), gaps.length * 3, scene, true);
  const trunkM = instanced(new THREE.CylinderGeometry(0.22, 0.32, 1, 6), new THREE.MeshStandardMaterial({ color: '#5a4334', roughness: 0.9 }), gaps.length, scene, true);
  const tc = new THREE.Color();
  gaps.forEach((g, i) => {
    const h = min(g.cap + 0.5, 7 + r() * 5);
    setM(trunkM, i, g.x, h * 0.35, g.z, 0, 1, h * 0.7, 1);
    for (let k = 0; k < 3; k++) {
      const s = 2.2 + r() * 1.6;
      setM(leafM, i * 3 + k, g.x + (r() - 0.5) * 3, h - 1 + r() * 1.6, g.z + (r() - 0.5) * 3, r() * PI, s, s * 0.8, s);
      tc.set(['#4f6d35', '#5d7a3a', '#435f2e', '#6b7f3d'][floor(r() * 4)]); leafM.setColorAt(i * 3 + k, tc);
    }
  });
  // laundry lines with saris and kurtas drying
  const lines = det.filter((b) => b.near && !b.tank && b.x1 - b.x0 > 6).slice(0, 26);
  const clothM = instanced(new THREE.PlaneGeometry(0.75, 1.1).translate(0, -0.55, 0), new THREE.MeshStandardMaterial({ roughness: 0.85, side: THREE.DoubleSide }), lines.length * 3, scene, false);
  const wires = [];
  R3.cloth = { mesh: clothM, items: [] };
  lines.forEach((b, i) => {
    const zz = (b.z0 + b.z1) / 2 + (r() - 0.5) * 2, y = b.h + 1.9, xa = b.x0 + 0.6, xb = b.x1 - 0.6;
    wires.push(xa, y, zz, xb, y, zz);
    for (let k = 0; k < 3; k++) {
      const x = lerp(xa, xb, 0.2 + k * 0.3);
      R3.cloth.items.push({ x, y, z: zz, ph: r() * TAU });
      tc.set(['#d6336c', '#f2b134', '#1e88a8', '#7a3fb0', '#2e9e6a', '#e8602c', '#f4f0e4'][floor(r() * 7)]); clothM.setColorAt(i * 3 + k, tc);
    }
  });
  // festival light strings along house fronts and across lanes
  const near = det.filter((b) => b.z0 > -115 && abs((b.x0 + b.x1) / 2) < 30 + abs(b.z1) * 0.9);
  for (const b of near) {
    if (r() > 0.36) continue;
    const y = b.h + 0.9;
    const a = new V3(b.x0 + 0.1, y, b.z1 + 0.05), c = new V3(b.x1 - 0.1, y, b.z1 + 0.05);
    addStrand(a, c, 0.5 + r() * 0.5, r);
    if (r() < 0.4) addStrand(new V3(b.x0 + 0.1, b.h * 0.62, b.z1 + 0.06), new V3(b.x1 - 0.1, b.h * 0.62, b.z1 + 0.06), 0.35, r);
  }
  // strings on your own parapet, close to you
  addStrand(new V3(-6.8, 10.0, -4.85), new V3(6.8, 10.0, -4.85), 0.45, r, 26);
  // bunting across lanes, between rows of roofs
  const bunt = det.filter((b) => b.z1 < -10 && b.z1 > -60 && abs((b.x0 + b.x1) / 2) < 26);
  for (const b of bunt) {
    if (r() > 0.4) continue;
    const other = det.find((o) => o.z1 < b.z0 - 2 && o.z1 > b.z0 - 22 && o.x0 < (b.x0 + b.x1) / 2 + 3 && o.x1 > (b.x0 + b.x1) / 2 - 3);
    if (!other) continue;
    const a = new V3((b.x0 + b.x1) / 2 + (r() - 0.5) * 2, b.h + 1.0, b.z0 + 0.2), c = new V3((other.x0 + other.x1) / 2, other.h + 1.0, other.z1 - 0.2);
    BUNT.push({ a, c, n: 12, sag: 0.9 });
  }
  BUNT.push({ a: new V3(-6.9, 11.6, -4.9), c: new V3(-7.6, 12.0, -16), n: 10, sag: 0.6 });
  BUNT.push({ a: new V3(6.9, 11.2, -4.9), c: new V3(9, 11.8, -18), n: 10, sag: 0.6 });
  let nb = 0; BUNT.forEach((s) => { nb += s.n; });
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.Float32BufferAttribute([-0.2, 0, 0, 0.2, 0, 0, 0, -0.42, 0], 3));
  fg.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  const buntM = instanced(fg, new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.08 }), nb, scene, false);
  R3.bunt = buntM;
  let bi = 0;
  BUNT.forEach((s) => {
    s.i0 = bi;
    for (let k = 0; k < s.n; k++) {
      const t = (k + 0.5) / s.n, p = new V3().lerpVectors(s.a, s.c, t); p.y -= s.sag * 4 * t * (1 - t);
      s.flags = s.flags || []; s.flags.push({ p, ph: r() * TAU });
      tc.set(['#e8452c', '#f2b134', '#2a8fbd', '#2e9e6a', '#d6336c', '#f4f0e4', '#7a3fb0'][(k + bi) % 7]); buntM.setColorAt(bi, tc);
      bi++;
    }
    for (let k = 0; k < 10; k++) { const t0 = k / 10, t1 = (k + 1) / 10; const p0 = new V3().lerpVectors(s.a, s.c, t0), p1 = new V3().lerpVectors(s.a, s.c, t1); p0.y -= s.sag * 4 * t0 * (1 - t0); p1.y -= s.sag * 4 * t1 * (1 - t1); wires.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); }
  });
  // the light strings' wires
  STRANDS.forEach((s) => { for (let k = 0; k < s.pts.length - 1; k++) wires.push(s.pts[k].x, s.pts[k].y, s.pts[k].z, s.pts[k + 1].x, s.pts[k + 1].y, s.pts[k + 1].z); });
  const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wires, 3));
  scene.add(new THREE.LineSegments(wg, new THREE.LineBasicMaterial({ color: '#2a2220', transparent: true, opacity: 0.55 })));
  // bulbs
  let nbulb = 0; STRANDS.forEach((s) => { nbulb += s.pts.length; });
  const bulbM = instanced(new THREE.OctahedronGeometry(0.075, 0), new THREE.MeshBasicMaterial({ color: '#ffffff' }), nbulb, scene, false);
  let k = 0;
  STRANDS.forEach((s) => { s.i0 = k; s.pts.forEach((p, j) => { setM(bulbM, k, p.x, p.y - 0.05, p.z, 0, j === 0 || s.own ? 1.3 : 1); bulbM.setColorAt(k, s.cols[j]); k++; }); });
  R3.bulbs = bulbM;
  // marigold garlands hung in swags on your parapet
  const mg = [];
  for (let sw = 0; sw < 6; sw++) {
    const xa = -6.6 + sw * 2.2, xb = xa + 2.2;
    for (let j = 0; j <= 14; j++) { const t = j / 14; mg.push(new V3(lerp(xa, xb, t), 10.0 - 0.55 * 4 * t * (1 - t), -4.72)); }
  }
  const mari = instanced(new THREE.IcosahedronGeometry(0.075, 0), new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), mg.length, scene, false);
  mg.forEach((p, i) => { setM(mari, i, p.x, p.y, p.z, r() * PI, 1); tc.set(i % 3 === 0 ? '#ffd23a' : '#ff8a1c'); mari.setColorAt(i, tc); });
  // a few plant pots at the corners of your roof
  const potM = instanced(new THREE.CylinderGeometry(0.32, 0.22, 0.5, 10), new THREE.MeshStandardMaterial({ color: '#b5582e', roughness: 0.85 }), 3, scene, true);
  const bushM = instanced(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: '#4f7a34', roughness: 0.8, flatShading: true }), 3, scene, true);
  [[-5.9, -4.1], [5.8, -4.2], [-3.4, -4.3]].forEach((p, i) => { setM(potM, i, p[0], 9.25, p[1], 0, 1); setM(bushM, i, p[0], 9.75, p[1], r() * PI, 1, 1.15, 1); });
}

function addStrand(a, c, sag, r, n) {
  n = n || max(6, Math.round(a.distanceTo(c) / 0.75));
  const pts = [], cols = [];
  const pal = [['#ffd27a', '#ffd27a'], ['#ff6a3a', '#ffd23a', '#3ad1ff', '#ff4fa6', '#7dff6a'], ['#ffb347', '#ffe9b8']][floor(r() * 3)];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0;
    const p = new V3().lerpVectors(a, c, t); p.y -= sag * 4 * t * (1 - t);
    pts.push(p); cols.push(new THREE.Color(pal[i % pal.length]).multiplyScalar(2.2));
  }
  STRANDS.push({ pts, cols, ph: r() * TAU, own: a.z > -6 });
}

/* ====================================================================== people on the roofs */
const PEOPLE = [];
const PP = {};
const SKIN = ['#8d5a3b', '#a8714f', '#6e4430', '#b9825c', '#7a4b33'];
const KURTA = ['#e8452c', '#f2b134', '#1e88a8', '#7a3fb0', '#2e9e6a', '#d6336c', '#f4f0e4', '#e8602c', '#2b4a8c', '#c9a96e'];
const HAIR = ['#1a1412', '#2a1d16', '#e8452c', '#f2b134', '#f4f0e4', '#1a1412', '#1e88a8'];
function buildPeople(scene) {
  const r = A.rng(321);
  const det = CITY.b.filter((b) => b.detail && !b.own && b.z1 < -12);
  // flyers: one per roof, spread across the view, at middle distance
  const cands = det.filter((b) => b.z1 < -22 && b.z0 > -80).sort((p, q) => (p.x0 + p.x1) - (q.x0 + q.x1));
  const flyers = [];
  const want = 12;
  for (let i = 0; i < want && cands.length; i++) {
    const ix = floor((i + 0.5) / want * cands.length);
    const b = cands[min(cands.length - 1, ix)];
    if (flyers.some((f) => f.b === b)) continue;
    flyers.push({ b });
  }
  flyers.forEach((f) => {
    const b = f.b;
    PEOPLE.push(mkPerson((b.x0 + b.x1) / 2 + (r() - 0.5) * 2, b.h, b.z1 - 1.4 - r() * 1.5, 'flyer', r, 1));
  });
  // spectators, some of them children
  let n = 0;
  for (const b of det) {
    if (n >= 46) break;
    if (b.z0 < -115 || r() > 0.5) continue;
    if (abs((b.x0 + b.x1) / 2) > 18 + abs(b.z1) * 0.95) continue;
    const kid = r() < 0.3;
    PEOPLE.push(mkPerson(b.x0 + 1 + r() * max(0.2, b.x1 - b.x0 - 2), b.h, b.z0 + 1 + r() * max(0.2, b.z1 - b.z0 - 2), 'spec', r, kid ? 0.68 : 0.9 + r() * 0.15));
    n++;
  }
  const N = PEOPLE.length;
  const skin = new THREE.MeshStandardMaterial({ roughness: 0.6 });
  const cloth = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const leg = new THREE.CapsuleGeometry(0.075, 0.68, 1, 5).translate(0, -0.42, 0);
  const arm = new THREE.CapsuleGeometry(0.055, 0.5, 1, 5).translate(0, -0.3, 0);
  const torso = new THREE.CylinderGeometry(0.17, 0.27, 0.8, 7);
  const head = new THREE.SphereGeometry(0.12, 8, 6);
  const hair = new THREE.SphereGeometry(0.13, 8, 4, 0, TAU, 0, PI * 0.55);
  PP.legs = instanced(leg, cloth.clone(), N * 2, scene, true);
  PP.arms = instanced(arm, skin.clone(), N * 2, scene, true);
  PP.torso = instanced(torso, cloth, N, scene, true);
  PP.head = instanced(head, skin, N, scene, true);
  PP.hair = instanced(hair, new THREE.MeshStandardMaterial({ roughness: 0.7 }), N, scene, false);
  const c = new THREE.Color();
  PEOPLE.forEach((p, i) => {
    c.set(p.skin); PP.head.setColorAt(i, c); PP.arms.setColorAt(i * 2, c); PP.arms.setColorAt(i * 2 + 1, c);
    c.set(p.kurta); PP.torso.setColorAt(i, c);
    c.set(p.pants); PP.legs.setColorAt(i * 2, c); PP.legs.setColorAt(i * 2 + 1, c);
    c.set(p.hair); PP.hair.setColorAt(i, c);
  });
}
function mkPerson(x, h, z, role, r, sc) {
  return {
    pos: new V3(x, h, z), role, scale: sc, yaw: PI + (r() - 0.5) * 2.4, ph: r() * TAU,
    skin: SKIN[floor(r() * SKIN.length)], kurta: KURTA[floor(r() * KURTA.length)], pants: ['#f4f0e4', '#2a2622', '#3a3f55', '#e8e0cc'][floor(r() * 4)],
    hair: HAIR[floor(r() * HAIR.length)], cheer: 0, delay: 0, sad: 0, kite: null, hand: new V3(x, h + 1.9, z), wave: r() < 0.25,
  };
}
function takeFlyer(k) {
  let best = null, bd = 1e9;
  for (const p of PEOPLE) {
    if (p.role !== 'flyer' || p.kite) continue;
    T.v.copy(p.pos); T.v.y += 1.8;
    toPx(T.v, T.p);
    const nx = T.p.x / max(1, arc.w);
    const d = abs(nx - k.x) + (nx < -0.4 || nx > 1.4 ? 0.6 : 0);
    if (d < bd) { bd = d; best = p; }
  }
  if (best) { best.kite = k; best.sad = 0; }
  return best;
}
function cheer(cutRival) {
  for (const p of PEOPLE) {
    if (p.role === 'flyer') { if (p.kite === cutRival) p.sad = 2.2; continue; }
    if (rnd() < 0.7) { p.cheer = 1.6 + rnd() * 0.6; p.delay = rnd() * 0.35; }
  }
}
function cheerRivals() {
  for (const p of PEOPLE) if (p.role === 'flyer' && p.kite) { p.cheer = 2; p.delay = rnd() * 0.3; }
}

const PM = new THREE.Matrix4(), PQ = new THREE.Quaternion(), PE = new THREE.Euler();
function partM(mesh, idx, ox, oy, oz, rx, rz, sx, sy, sz) {
  PE.set(rx, 0, rz, 'XYZ'); PQ.setFromEuler(PE); T.v.set(ox, oy, oz); T.s.set(sx, sy, sz);
  T.m2.compose(T.v, PQ, T.s);
  T.m3.multiplyMatrices(PM, T.m2);
  mesh.setMatrixAt(idx, T.m3);
}
function stepPeople(dt) {
  if (!PP.legs) return;
  const t = R3.clock;
  PEOPLE.forEach((p, i) => {
    let jump = 0, armL = 0.08, armR = 0.08, raiseL = 0, raiseR = 0, lean = 0, nod = 0;
    if (p.delay > 0) p.delay -= dt;
    else if (p.cheer > 0) p.cheer -= dt;
    if (p.sad > 0) p.sad -= dt;
    if (p.role === 'flyer' && p.kite) {
      const k = p.kite;
      if (k.alive) {
        T.v.subVectors(k.world, p.pos);
        p.yaw = lerp(p.yaw, Math.atan2(T.v.x, T.v.z), 1 - Math.exp(-dt * 3));
        raiseR = -2.1 - k.pull * 0.35 + sin(t * 9 + p.ph) * 0.06 * k.pull;
        raiseL = -0.7; armL = 0.25;
        lean = -0.08 - k.pull * 0.08;
      } else { raiseR = -0.3; nod = 0.35; }
    } else if (p.wave) { raiseR = -0.4; armR = 2.5 + sin(t * 7 + p.ph) * 0.35; }
    if (p.sad > 0) { raiseR = 0; armR = 0.05; nod = 0.4; }
    if (p.cheer > 0 && p.delay <= 0) {
      jump = abs(sin(t * 10 + p.ph)) * 0.32;
      armL = 2.7 + sin(t * 14 + p.ph) * 0.25; armR = 2.7 + cos(t * 14 + p.ph) * 0.25; raiseL = raiseR = 0;
    } else if (p.role !== 'flyer') {
      lean = sin(t * 0.7 + p.ph) * 0.03;
    }
    T.quat.setFromAxisAngle(UP, p.yaw);
    T.v.set(p.pos.x, p.pos.y + jump, p.pos.z); T.s.set(p.scale, p.scale, p.scale);
    PM.compose(T.v, T.quat, T.s);
    const sw = sin(t * 1.3 + p.ph) * 0.03;
    partM(PP.legs, i * 2, -0.09, 0.9, 0, jump * 0.6, 0.02, 1, 1, 1);
    partM(PP.legs, i * 2 + 1, 0.09, 0.9, 0, -jump * 0.6, -0.02, 1, 1, 1);
    partM(PP.torso, i, 0, 1.27, 0, lean, sw, 1, 1, 1);
    partM(PP.head, i, 0, 1.74, lean * 0.6 + nod * 0.06, nod, sw, 1, 1, 1);
    partM(PP.hair, i, 0, 1.76, lean * 0.6 + nod * 0.06, nod - 0.15, sw, 1, 1, 1);
    partM(PP.arms, i * 2, -0.23, 1.53, 0, raiseL, -armL, 1, 1, 1);
    partM(PP.arms, i * 2 + 1, 0.23, 1.53, 0, raiseR, armR, 1, 1, 1);
    // the hand a thread leaves from: end of the right arm
    T.e.set(raiseR, 0, armR, 'XYZ'); T.q.set(0, -0.58, 0).applyEuler(T.e); T.q.x += 0.23; T.q.y += 1.53;
    p.hand.copy(T.q).applyMatrix4(PM);
  });
  for (const m of [PP.legs, PP.arms, PP.torso, PP.head, PP.hair]) m.instanceMatrix.needsUpdate = true;
}

/* ====================================================================== kites (meshes) */
const VIS = [];
let SPAR_GEO = null, SPAR_MAT = null, TAIL_MAT = null, THREAD_MAT = null, HALO_TEX = null;
const KG = 8; // cloth grid
function kiteGeo() {
  const g = new THREE.BufferGeometry();
  const n = (KG + 1) * (KG + 1);
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const base = new Float32Array(n * 2);
  const corner = [[0, -KH], [KW, 0], [-KW, 0], [0, KH]];
  for (let j = 0; j <= KG; j++) {
    for (let i = 0; i <= KG; i++) {
      const u = i / KG, v = j / KG, k = j * (KG + 1) + i;
      const x = (1 - u) * (1 - v) * corner[0][0] + u * (1 - v) * corner[1][0] + (1 - u) * v * corner[2][0] + u * v * corner[3][0];
      const y = (1 - u) * (1 - v) * corner[0][1] + u * (1 - v) * corner[1][1] + (1 - u) * v * corner[2][1] + u * v * corner[3][1];
      base[k * 2] = x; base[k * 2 + 1] = y;
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = 0;
      uv[k * 2] = x / (2 * KW) + 0.5; uv[k * 2 + 1] = y / (2 * KH) + 0.5;
    }
  }
  const idx = [];
  for (let j = 0; j < KG; j++) for (let i = 0; i < KG; i++) { const a = j * (KG + 1) + i, b = a + 1, c = a + KG + 1, d = c + 1; idx.push(a, b, d, a, d, c); }
  g.setIndex(idx);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return { g, base };
}
function sparGeo() {
  const spine = new THREE.CylinderGeometry(0.02, 0.02, KH * 2, 5).translate(0, 0, 0.02);
  const curve = new THREE.QuadraticBezierCurve3(new V3(-KW, 0.02, 0.03), new V3(0, KH * 0.62, -0.32), new V3(KW, 0.02, 0.03));
  const bow = new THREE.TubeGeometry(curve, 14, 0.017, 4, false);
  return merge([spine, bow]);
}
function buildKiteVis(scene) {
  const { g, base } = kiteGeo();
  const c = cv(256, 256);
  const t = tex(c);
  const mat = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: new THREE.Color('#ffffff'), emissiveIntensity: 0.4, side: THREE.DoubleSide, roughness: 0.8, metalness: 0 });
  const grp = new THREE.Group();
  const cloth = new THREE.Mesh(g, mat);
  const spars = new THREE.Mesh(SPAR_GEO, SPAR_MAT);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: HALO_TEX, color: new THREE.Color(WARM), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  halo.scale.set(5, 5, 1); halo.position.z = -0.45; halo.renderOrder = 3;
  grp.add(cloth); grp.add(spars); grp.add(halo);
  grp.visible = false;
  scene.add(grp);
  const tail = new Ribbon(12, TAIL_MAT, false);
  const tA = new Ribbon(30, THREAD_MAT, true), tB = new Ribbon(14, THREAD_MAT, true);
  scene.add(tail.mesh); scene.add(tA.mesh); scene.add(tB.mesh);
  tail.mesh.visible = tA.mesh.visible = tB.mesh.visible = false;
  return { grp, cloth, g, base, c, t, mat, halo, tail, tA, tB, kite: null };
}
function attachKite(k) {
  const v = VIS.find((x) => !x.kite);
  if (v) {
    v.kite = k; k.vis = v;
    paintKite(v.c, k); v.t.needsUpdate = true;
    v.grp.visible = true;
    k.tailOK = false;
  }
  if (k !== G.me && arc && R3.camRef) {
    k.flyer = takeFlyer(k);
    // a rival's kite flies beyond its flyer's roof
    if (k.flyer) k.depth = clamp(-k.flyer.pos.z + 4 + rnd() * 9, 30, 58);
  }
}
function releaseKite(k) {
  if (!k) return;
  if (k.vis) { const v = k.vis; v.kite = null; v.grp.visible = false; v.tail.mesh.visible = v.tA.mesh.visible = v.tB.mesh.visible = false; k.vis = null; }
  if (k.flyer) { k.flyer.kite = null; k.flyer = null; }
}

// Paper flutter: the bow bends the top half back, the loose lower half flaps.
function flutter(k, v, dt) {
  const pos = v.g.attributes.position.array, base = v.base;
  const t = R3.clock * (k.alive ? 1 : 1.6) + k.bob * 3;
  const amp = (k.alive ? 0.035 + abs(G.wind.x) * 0.05 + k.pull * 0.05 : 0.14);
  for (let i = 0, n = base.length / 2; i < n; i++) {
    const x = base[i * 2], y = base[i * 2 + 1];
    const e = abs(x) / KW + abs(y) / KH;
    const bow = -0.24 * (1 - (x / KW) * (x / KW)) * clamp((y + KH * 0.25) / (KH * 1.25), 0, 1);
    const fl = sin(t * 10 + y * 2.8 + x * 1.4) * amp * (0.2 + e) * (y < 0 ? 1.6 : 0.8) + sin(t * 17 + x * 4) * amp * 0.25 * e;
    pos[i * 3 + 2] = bow + fl;
  }
  v.g.attributes.position.needsUpdate = true;
  v.g.computeVertexNormals();
}

const _right = new V3(), _up = new V3(), _fwd = new V3(), _basis = new THREE.Matrix4();
function placeKite(k, dt) {
  const v = k.vis; if (!v) return;
  if (!k.alive && k.cutT > 4) { v.grp.visible = false; return; }
  v.grp.visible = true;
  v.grp.position.copy(k.world);
  v.grp.scale.setScalar(k === G.me ? 1 : 1.35);
  // Face the eye, turned a little toward the flyer, then roll with the motion.
  _fwd.subVectors(R3.camRef.position, k.world).normalize();
  if (k.flyer) { T.v.subVectors(k.flyer.hand, k.world).normalize(); _fwd.lerp(T.v, 0.22).normalize(); }
  _right.crossVectors(UP, _fwd).normalize();
  _up.crossVectors(_fwd, _right);
  const ang = Math.atan2(k.vy, 0.4 + k.vx);
  let roll = -(ang * 0.4 + sin(k.bob * 2.2) * 0.06);
  if (!k.alive) roll += k.cutT * k.spin;
  k.roll = roll;
  const cr = cos(roll), sr = sin(roll);
  T.a.copy(_right).multiplyScalar(cr).addScaledVector(_up, sr);
  T.b.copy(_up).multiplyScalar(cr).addScaledVector(_right, -sr);
  _basis.makeBasis(T.a, T.b, _fwd);
  v.grp.quaternion.setFromRotationMatrix(_basis);
  if (!k.alive) { T.quat.setFromAxisAngle(T.b, k.cutT * k.spin * 0.8); v.grp.quaternion.premultiply(T.quat); }
  // a little pitch toward you while pulling
  v.grp.updateMatrixWorld(true);
  k.tip.set(0, -KH, 0.02).applyMatrix4(v.grp.matrixWorld);
  flutter(k, v, dt);
  const pullGlow = k.alive ? clamp((k.pull - 0.4) / 0.4, 0, 1) : 0;
  v.halo.material.opacity = pullGlow * (k === G.me ? 0.55 : 0.4);
  v.halo.scale.setScalar(4.2 + pullGlow * 1.6);
  v.halo.material.color.set(k === G.me ? WARM : '#ff7a5a');
  v.mat.emissiveIntensity = 0.32 + R3.backlit * 0.35;
  // tail: a chain of points hanging from the bottom tip, pushed by the wind
  const N = v.tail.n;
  if (!k.tailOK || k.tailP.length !== N) {
    k.tailP = []; k.tailQ = [];
    for (let i = 0; i < N; i++) { k.tailP.push(new V3(k.tip.x, k.tip.y - i * 0.26, k.tip.z)); k.tailQ.push(new V3(k.tip.x, k.tip.y - i * 0.26, k.tip.z)); }
    k.tailOK = true;
  }
  const P = k.tailP, Q = k.tailQ, h = min(dt, 1 / 30);
  P[0].copy(k.tip); Q[0].copy(k.tip);
  const wx = G.wind.x * 5.5, gy = -3.2;
  for (let i = 1; i < N; i++) {
    const p = P[i], q = Q[i];
    T.v.subVectors(p, q).multiplyScalar(0.94);
    q.copy(p);
    p.add(T.v);
    p.x += (wx + sin(R3.clock * 6 + i * 0.7 + k.bob) * 2.2) * h * h * 6;
    p.y += gy * h * h * 6;
    p.z += 1.2 * h * h * 6;
  }
  for (let it = 0; it < 3; it++) {
    for (let i = 1; i < N; i++) {
      const a = P[i - 1], b = P[i];
      T.v.subVectors(b, a); const l = T.v.length() || 1e-4;
      const diff = (l - 0.2) / l;
      if (i === 1) b.addScaledVector(T.v, -diff);
      else { a.addScaledVector(T.v, diff * 0.5); b.addScaledVector(T.v, -diff * 0.5); }
    }
  }
}

/* ====================================================================== your hands and reel */
const HANDS = {};
function buildHands(cam) {
  const g = new THREE.Group(); cam.add(g); HANDS.g = g;
  const skin = new THREE.MeshStandardMaterial({ color: '#8c5a3c', roughness: 0.55 });
  const sleeve = new THREE.MeshStandardMaterial({ color: '#1f6f78', roughness: 0.8 });
  const trim = new THREE.MeshStandardMaterial({ color: '#d9b26a', roughness: 0.35, metalness: 0.7 });
  const wood = new THREE.MeshStandardMaterial({ color: '#9a6436', roughness: 0.55 });
  const dark = new THREE.MeshStandardMaterial({ color: '#4a2c18', roughness: 0.5 });
  // the reel: a wooden spool on an axle, held at both ends
  const reel = new THREE.Group(); g.add(reel); HANDS.reel = reel;
  const spin = new THREE.Group(); reel.add(spin); HANDS.spin = spin;
  const wc = cv(64, 128), wg = wc.getContext('2d');
  for (let i = 0; i < 128; i += 3) { wg.fillStyle = (i / 3) % 3 ? '#ffb347' : '#ff6940'; wg.fillRect(0, i, 64, 3); }
  const woundT = tex(wc, { aniso: 1 });
  const wound = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.13, 20), new THREE.MeshStandardMaterial({ map: woundT, roughness: 0.45, emissive: new THREE.Color('#ff7a2a'), emissiveIntensity: 0.22 }));
  wound.rotation.z = PI / 2; spin.add(wound);
  for (const sx of [-1, 1]) {
    const fl = new THREE.Mesh(new THREE.CylinderGeometry(0.092, 0.092, 0.012, 22), wood); fl.rotation.z = PI / 2; fl.position.x = sx * 0.072; spin.add(fl);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.092, 0.006, 6, 24), dark); rim.rotation.y = PI / 2; rim.position.x = sx * 0.072; spin.add(rim);
    for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.17, 0.014), wood); sp.position.x = sx * 0.082; sp.rotation.x = k * PI / 4; spin.add(sp); }
    // the handle ends and the fists around them
    const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.019, 0.1, 10), dark); knob.rotation.z = PI / 2; knob.position.x = sx * 0.15; reel.add(knob);
    const fist = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), skin); fist.scale.set(1.05, 1.15, 1.2); fist.position.set(sx * 0.165, -0.004, 0.006); reel.add(fist);
    const thumb = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.035, 3, 8), skin); thumb.position.set(sx * 0.15, 0.03, 0.02); thumb.rotation.set(-0.4, 0, sx * 1.2); reel.add(thumb);
    const fa = new THREE.Mesh(new THREE.CapsuleGeometry(0.033, 0.2, 4, 10), skin); fa.position.set(sx * 0.21, -0.1, 0.07); fa.rotation.set(0.7, 0, sx * 0.55); reel.add(fa);
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.07, 0.36, 16), sleeve); sl.position.set(sx * 0.29, -0.27, 0.2); sl.rotation.set(0.7, 0, sx * 0.55); reel.add(sl);
    const tr = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 20), trim); tr.position.set(sx * 0.243, -0.155, 0.11); tr.rotation.set(0.7 + PI / 2, 0, sx * 0.55); reel.add(tr);
  }
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.24, 8), dark); axle.rotation.z = PI / 2; reel.add(axle);
  g.traverse((o) => { if (o.isMesh) { o.frustumCulled = false; o.renderOrder = 8; } });
  HANDS.ry = 0; HANDS.jerk = 0; HANDS.sc = 1;
}
// Where the reel sits on screen, worked out for this screen's shape.
function placeHands() {
  const asp = R3.aspect, tH = R3.tanH;
  const sc = clamp(asp * 1.3, 0.78, 1);
  const rd = 1.3;
  R3.reelL.set(0, -0.86 * rd * tH, -rd);
  // the thread leaves the top of the spool
  R3.pinchL.copy(R3.reelL); R3.pinchL.y += 0.06 * sc;
  HANDS.sc = sc;
  if (HANDS.reel) HANDS.reel.scale.setScalar(sc);
}
function stepHands(dt) {
  if (!HANDS.g) return;
  const me = G.me, pull = me ? me.pull : 0;
  HANDS.jerk = lerp(HANDS.jerk, pull, 1 - Math.exp(-dt * 12));
  const breathe = arc && arc.reducedMotion ? 0 : sin(R3.clock * 1.6) * 0.004;
  HANDS.reel.position.copy(R3.reelL);
  HANDS.reel.position.y += -HANDS.jerk * 0.03 + breathe;
  HANDS.reel.position.z += HANDS.jerk * 0.05;
  // lean the reel a little toward the kite
  const lean = me ? clamp((me.x - 0.5) * 0.5, -0.25, 0.25) : 0;
  HANDS.reel.rotation.set(0.42 + HANDS.jerk * 0.12, 0, -lean);
  // the spool winds in while you pull and pays out slowly while you glide
  const spd = me && me.alive ? (pull > 0.45 ? -9 * pull : 2.2) : 14;
  HANDS.ry += spd * dt;
  HANDS.spin.rotation.x = HANDS.ry;
}

/* ====================================================================== sky, light, the rest of the world */
const SKYC = {
  zen0: '#2f3f98', zen1: '#121436', mid0: '#ff8650', mid1: '#7a3462', hor0: '#ffb45e', hor1: '#f25c34', sun0: '#fff0c0', sun1: '#ff7a3a',
};
const SUN = new V3();
function sunDir(tod, out) {
  const az = 14 * PI / 180, el = lerp(9, -2.5, tod) * PI / 180;
  return out.set(sin(az) * cos(el), sin(el), -cos(az) * cos(el)).normalize();
}

const BIRDS = { n: 16, list: [] };
const DKITE = { n: 64, list: [] };
const LANT = { n: 14, list: [] };
let GLOW = null, SHM = null, FLASH = null, RING = null, SUNSPR = null, SKYLINE = null, PET = [];

function buildWorld() {
  const scene = new THREE.Scene(); R3.scene = scene;
  scene.fog = new THREE.FogExp2('#f2b07a', 0.0042);
  // sky dome
  const U = {};
  for (const k in SKYC) U['u' + k.charAt(0).toUpperCase() + k.slice(1)] = { value: new THREE.Color(SKYC[k]) };
  const su = { uSun: { value: new V3() }, uTod: { value: 0 }, uTime: { value: 0 },
    uZen0: U.uZen0, uZen1: U.uZen1, uMid0: U.uMid0, uMid1: U.uMid1, uHor0: U.uHor0, uHor1: U.uHor1, uSunC0: U.uSun0, uSunC1: U.uSun1 };
  R3.skyMat = new THREE.ShaderMaterial({ defines: { OCT: 4 }, uniforms: su, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 18), R3.skyMat); sky.frustumCulled = false; sky.renderOrder = -10;
  scene.add(sky); R3.sky = sky;
  // the sun's halo
  SUNSPR = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(paintDot(0.08), { aniso: 1 }), color: new THREE.Color('#ffd9a0'), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, toneMapped: false }));
  SUNSPR.scale.set(160, 160, 1); SUNSPR.renderOrder = -5; scene.add(SUNSPR);
  // distant skyline band
  const st = tex(paintSkyline(), { aniso: 1 }); st.wrapS = THREE.RepeatWrapping;
  SKYLINE = new THREE.Mesh(new THREE.CylinderGeometry(400, 400, 70, 48, 1, true, PI - 1.45, 2.9), new THREE.MeshBasicMaterial({ map: st, transparent: true, side: THREE.DoubleSide, fog: false, depthWrite: false, color: '#c08070' }));
  SKYLINE.position.set(0, 35 - 2, 0); SKYLINE.renderOrder = -4; scene.add(SKYLINE);
  // ground
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1400, 1400), new THREE.MeshStandardMaterial({ color: '#3a2c26', roughness: 1 }));
  ground.rotation.x = -PI / 2; ground.position.set(0, 0, -300); ground.receiveShadow = true; scene.add(ground);
  // light
  R3.hemi = new THREE.HemisphereLight('#ffc9a0', '#4a3040', 1.1); scene.add(R3.hemi);
  R3.sun = new THREE.DirectionalLight('#ffb070', 3.0);
  R3.sun.shadow.bias = -0.0006; R3.sun.shadow.normalBias = 0.04; R3.sun.shadow.radius = 2.5;
  const sc = R3.sun.shadow.camera; sc.left = -50; sc.right = 50; sc.top = 34; sc.bottom = -34; sc.near = 1; sc.far = 340;
  scene.add(R3.sun); scene.add(R3.sun.target);
  R3.fill = new THREE.DirectionalLight('#ff9a8a', 0.6); R3.fill.position.set(-60, 20, -30); R3.fill.target.position.set(0, 0, -30);
  scene.add(R3.fill); scene.add(R3.fill.target);
  // the city
  genCity();
  const fa = paintFacade();
  const facade = { map: tex(fa.map, { repeat: true }), emis: tex(fa.emis, { repeat: true }) };
  buildCity(scene, facade, tex(paintRoof(), { repeat: true }));
  buildClutter(scene);
  buildPeople(scene);
  // kites
  SPAR_GEO = sparGeo();
  SPAR_MAT = new THREE.MeshStandardMaterial({ color: '#d9b77a', roughness: 0.6 });
  TAIL_MAT = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  THREAD_MAT = new THREE.ShaderMaterial({ vertexShader: THREAD_VS, fragmentShader: THREAD_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false });
  HALO_TEX = tex(paintDot(0.12), { aniso: 1 });
  for (let i = 0; i < 9; i++) VIS.push(buildKiteVis(scene));
  // pigeons circling the rooftops
  buildBirds(scene);
  // the festival sky: many kites far away, and lanterns rising
  buildSkyKites(scene);
  // effects
  GLOW = new Points(1400); scene.add(GLOW.mesh);
  SHM = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.15), new THREE.MeshStandardMaterial({ roughness: 0.8, side: THREE.DoubleSide, emissive: '#ffffff', emissiveIntensity: 0.15 }), SH.max);
  SHM.frustumCulled = false; scene.add(SHM);
  for (let i = 0; i < SH.max; i++) { T.m.makeScale(0, 0, 0); SHM.setMatrixAt(i, T.m); SHM.setColorAt(i, T.col.set('#ffffff')); }
  for (let i = 0; i < SH.petals; i++) {
    PET.push({ x: rnd(), y: 0.15 + rnd() * 0.6, d: 7 + rnd() * 22, vx: 0.02 + rnd() * 0.04, rx: rnd() * TAU, ry: rnd() * TAU, s: 1 + rnd() * 2 });
    SH.cols[i].set(i % 3 ? '#ff8a1c' : '#ffd23a');
  }
  FLASH = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex(paintDot(0.05), { aniso: 1 }), color: new THREE.Color('#fff2d0'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
  FLASH.renderOrder = 7; scene.add(FLASH); FLASH.userData.t = 9;
  RING = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 48), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd27a'), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false }));
  RING.renderOrder = 7; scene.add(RING);
  // cameras
  R3.cam = new THREE.PerspectiveCamera(55, 1, 0.04, 1200);
  scene.add(R3.cam);
  buildHands(R3.cam);
}

function buildBirds(scene) {
  const g = new THREE.BufferGeometry();
  // a body and two wings; the wings flap in the vertex shader
  const P = [
    0, 0, 0.22, -0.06, 0, -0.18, 0.06, 0, -0.18,
    0, 0.02, 0.22, 0, -0.05, -0.18, 0, 0.04, -0.18,
    -0.03, 0, 0.08, -0.42, 0.02, -0.02, -0.03, 0, -0.08,
    0.03, 0, 0.08, 0.03, 0, -0.08, 0.42, 0.02, -0.02,
  ];
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  const ph = new Float32Array(BIRDS.n);
  for (let i = 0; i < BIRDS.n; i++) ph[i] = rnd() * TAU;
  g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(ph, 1));
  const mat = new THREE.MeshStandardMaterial({ color: '#544c58', roughness: 0.8, side: THREE.DoubleSide });
  const uT = { value: 0 }; R3.birdT = uT;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uT;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aPhase; uniform float uTime;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nfloat wx = abs(position.x); transformed.y += sin(uTime * 13.0 + aPhase) * max(0.0, wx - 0.03) * 1.1;');
  };
  const m = new THREE.InstancedMesh(g, mat, BIRDS.n); m.frustumCulled = false; scene.add(m); BIRDS.mesh = m;
  for (let i = 0; i < BIRDS.n; i++) {
    BIRDS.list.push({ a: rnd() * 1.2, r: 10 + rnd() * 5, y: 30 + rnd() * 4, sp: 0.4 + rnd() * 0.05, ph: rnd() * TAU, s: 1.5 + rnd() * 0.3 });
  }
  BIRDS.c = new V3(-42, 0, -105);
}

function buildSkyKites(scene) {
  const shape = new THREE.Shape(); shape.moveTo(0, -1); shape.lineTo(0.8, 0); shape.lineTo(0, 1); shape.lineTo(-0.8, 0); shape.closePath();
  const m = new THREE.InstancedMesh(new THREE.ShapeGeometry(shape), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), DKITE.n);
  m.frustumCulled = false; scene.add(m); DKITE.mesh = m;
  const c = new THREE.Color();
  const lines = new Float32Array(DKITE.n * 6);
  for (let i = 0; i < DKITE.n; i++) {
    const az = (rnd() - 0.5) * 2.4, dist = 110 + rnd() * 220;
    const k = { x: sin(az) * dist, z: -cos(az) * dist, y: 30 + rnd() * 70, ph: rnd() * TAU, s: 1.6 + rnd() * 1.2, ax: sin(az) * dist * 0.85, az: -cos(az) * dist * 0.85 };
    DKITE.list.push(k);
    c.set(COLS.concat(SECOND, ['#e8452c', '#2e9e6a', '#7a3fb0'])[floor(rnd() * 15)]); m.setColorAt(i, c);
  }
  const lg = new THREE.BufferGeometry(); lg.setAttribute('position', new THREE.BufferAttribute(lines, 3).setUsage(THREE.DynamicDrawUsage));
  DKITE.lines = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ color: '#ffe6c8', transparent: true, opacity: 0.1, depthWrite: false }));
  DKITE.lines.frustumCulled = false; scene.add(DKITE.lines); DKITE.lp = lines;
  // sky lanterns
  const lm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.32, 0.9, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff9a3c').multiplyScalar(1.3) }), LANT.n);
  lm.frustumCulled = false; scene.add(lm); LANT.mesh = lm;
  for (let i = 0; i < LANT.n; i++) {
    const az = (rnd() - 0.5) * 1.8, dist = 90 + rnd() * 160;
    LANT.list.push({ x: sin(az) * dist, z: -cos(az) * dist, y: 12 + rnd() * 70, v: 0.6 + rnd() * 0.5, ph: rnd() * TAU });
  }
}

function flashAt(p, big) {
  if (!FLASH) return;
  FLASH.position.copy(p); FLASH.userData.t = 0; FLASH.userData.big = big ? 1 : 0.6;
  RING.position.copy(p); RING.userData.t = 0;
}

/* ====================================================================== stepping the world */
function stepVisual(dt, dtReal) {
  const ts0 = performance.now();
  stepVisual0(dt, dtReal);
  R3.msStep = lerp(R3.msStep || 0, performance.now() - ts0, 0.1);
}
function stepVisual0(dt, dtReal) {
  R3.clock += dt;
  if (!R3.scene) return;
  // time of day: the dusk round sets the sun as the clock runs down
  let tt = 0.32;
  if (!G.attract) {
    if (G.mode === 'dusk') tt = 0.08 + 0.88 * clamp(1 - G.time / 90, 0, 1);
    else if (G.mode === 'hunt') tt = 0.22 + 0.5 * clamp(G.cuts / 6, 0, 1);
    else tt = 0.38 + 0.3 * sin(G.t * 0.02);
  }
  R3.tod = lerp(R3.tod, tt, 1 - Math.exp(-dtReal * 1.5));
  applyTod(R3.tod);
  // kites
  const all = G.rivals.concat([G.me]);
  for (const k of all) placeKite(k, dt);
  stepPeople(dt);
  stepHands(dt);
  // pigeons
  if (BIRDS.mesh) {
    R3.birdT.value = R3.clock;
    BIRDS.list.forEach((b, i) => {
      b.a += b.sp * dt;
      const x = BIRDS.c.x + cos(b.a) * b.r, z = BIRDS.c.z + sin(b.a) * b.r * 0.6, y = b.y + sin(R3.clock * 0.8 + b.ph) * 2;
      // heading along the circle
      const yaw = Math.atan2(-sin(b.a), cos(b.a) * 0.6);
      setM(BIRDS.mesh, i, x, y, z, yaw, b.s, b.s, b.s, sin(R3.clock + b.ph) * 0.1, -0.25);
    });
    BIRDS.mesh.instanceMatrix.needsUpdate = true;
  }
  // far kites bob on their strings
  if (DKITE.mesh) {
    DKITE.list.forEach((k, i) => {
      const t = R3.clock * 0.6 + k.ph;
      const x = k.x + sin(t) * 3, y = k.y + cos(t * 1.3) * 2;
      setM(DKITE.mesh, i, x, y, k.z, Math.atan2(-k.x, -k.z), k.s, k.s, k.s, 0, sin(t * 2) * 0.3);
      const o = i * 6; DKITE.lp[o] = x; DKITE.lp[o + 1] = y - k.s; DKITE.lp[o + 2] = k.z; DKITE.lp[o + 3] = k.ax; DKITE.lp[o + 4] = 10; DKITE.lp[o + 5] = k.az;
    });
    DKITE.mesh.instanceMatrix.needsUpdate = true; DKITE.lines.geometry.attributes.position.needsUpdate = true;
    LANT.list.forEach((l, i) => {
      l.y += l.v * dt; l.x += G.wind.x * dt * 2;
      if (l.y > 110) { l.y = 10; }
      setM(LANT.mesh, i, l.x + sin(R3.clock * 0.7 + l.ph), l.y, l.z, 0, 1);
    });
    LANT.mesh.instanceMatrix.needsUpdate = true;
  }
  // laundry sways, bunting flutters
  if (R3.cloth) {
    R3.cloth.items.forEach((c, i) => setM(R3.cloth.mesh, i, c.x, c.y, c.z, 0, 1, 1, 1, sin(R3.clock * 2.2 + c.ph) * 0.25 * (0.4 + abs(G.wind.x)), sin(R3.clock * 1.4 + c.ph) * 0.05));
    R3.cloth.mesh.instanceMatrix.needsUpdate = true;
  }
  if (R3.bunt) {
    BUNT.forEach((s) => s.flags.forEach((f, j) => setM(R3.bunt, s.i0 + j, f.p.x, f.p.y, f.p.z, Math.atan2(s.c.x - s.a.x, s.c.z - s.a.z) + PI / 2, 1, 1, 1, sin(R3.clock * 5 + f.ph) * 0.45 * (0.5 + G.wind.x), 0)));
    R3.bunt.instanceMatrix.needsUpdate = true;
  }
  // twinkling festival bulbs
  if (R3.bulbs && floor(R3.clock * 8) !== R3.twk) {
    R3.twk = floor(R3.clock * 8);
    const night = 0.6 + R3.tod * 1.1;
    STRANDS.forEach((s) => s.pts.forEach((p, j) => {
      const on = 0.55 + 0.45 * sin(R3.clock * 2.4 + j * 1.3 + s.ph);
      T.col.copy(s.cols[j]).multiplyScalar(on * night); R3.bulbs.setColorAt(s.i0 + j, T.col);
    }));
    R3.bulbs.instanceColor.needsUpdate = true;
  }
  // sparks and glints
  for (let i = FX.n - 1; i >= 0; i--) {
    FX.life[i] -= dt;
    if (FX.life[i] <= 0) {
      const j = --FX.n;
      for (let q = 0; q < FXK.length; q++) { const arr = FX[FXK[q]]; arr[i] = arr[j]; }
      continue;
    }
    const dr = Math.exp(-FX.drag[i] * dt);
    FX.vx[i] *= dr; FX.vz[i] *= dr; FX.vy[i] = FX.vy[i] * dr + FX.grav[i] * dt;
    FX.x[i] += FX.vx[i] * dt; FX.y[i] += FX.vy[i] * dt; FX.z[i] += FX.vz[i] * dt;
  }
  for (let i = GL.length - 1; i >= 0; i--) { GL[i].t += GL[i].v * dt; if (GL[i].t > 1 || !G.me.alive) GL.splice(i, 1); }
  // shreds of paper flutter down; marigold petals drift across
  for (let i = SH.petals; i < SH.max; i++) {
    if (SH.life[i] <= 0) continue;
    SH.life[i] -= dt;
    const dr = Math.exp(-2.4 * dt);
    SH.vx[i] = SH.vx[i] * dr + G.wind.x * 1.5 * dt; SH.vz[i] *= dr; SH.vy[i] = SH.vy[i] * dr - 3.2 * dt;
    SH.x[i] += SH.vx[i] * dt + sin(R3.clock * 5 + i) * dt * 0.6; SH.y[i] += SH.vy[i] * dt; SH.z[i] += SH.vz[i] * dt;
    SH.rx[i] += SH.sx[i] * dt; SH.ry[i] += SH.sy[i] * dt; SH.rz[i] += SH.sz[i] * dt;
  }
  if (R3.camRef) {
    PET.forEach((p, i) => {
      p.x += (p.vx + G.wind.x * 0.03) * dt; p.y += sin(R3.clock * 1.3 + i) * dt * 0.02; p.rx += dt * p.s; p.ry += dt * p.s * 0.7;
      if (p.x > 1.15) { p.x = -0.15; p.y = 0.12 + rnd() * 0.6; }
      norm2world(p.x, p.y, p.d, T.v);
      SH.x[i] = T.v.x; SH.y[i] = T.v.y; SH.z[i] = T.v.z; SH.rx[i] = p.rx; SH.ry[i] = p.ry; SH.rz[i] = 0; SH.life[i] = 1; SH.ml[i] = 1; SH.scale[i] = 0.55;
    });
  }
  if (SHM) {
    for (let i = 0; i < SH.max; i++) {
      if (SH.life[i] <= 0) { T.m.makeScale(0, 0, 0); SHM.setMatrixAt(i, T.m); continue; }
      const s = SH.scale[i] * (i < SH.petals ? 1 : clamp(SH.life[i] / 0.5, 0, 1));
      T.e.set(SH.rx[i], SH.ry[i], SH.rz[i]); T.quat.setFromEuler(T.e); T.v.set(SH.x[i], SH.y[i], SH.z[i]); T.s.set(s, s, s);
      T.m.compose(T.v, T.quat, T.s); SHM.setMatrixAt(i, T.m);
    }
    SHM.instanceMatrix.needsUpdate = true;
    if (SH.dirty) { for (let i = 0; i < SH.max; i++) SHM.setColorAt(i, SH.cols[i]); SHM.instanceColor.needsUpdate = true; SH.dirty = false; }
  }
  // impact flash and ring
  if (FLASH) {
    const rm = arc && arc.reducedMotion;
    FLASH.userData.t += dtReal;
    const ft = FLASH.userData.t;
    const fa = rm ? 0 : clamp(1 - ft / 0.28, 0, 1);
    FLASH.material.opacity = fa * 0.9 * (FLASH.userData.big || 1);
    FLASH.scale.setScalar(3 + ft * 26);
    RING.userData.t = (RING.userData.t == null ? 9 : RING.userData.t) + dtReal;
    const rt = RING.userData.t;
    RING.material.opacity = clamp(1 - rt / 0.6, 0, 1) * 0.8;
    RING.scale.setScalar(0.5 + rt * 9);
    if (R3.cam) RING.quaternion.copy(R3.cam.quaternion);
  }
  R3.punch = max(0, R3.punch - dtReal * 2.4);
}

function applyTod(tod) {
  sunDir(tod, SUN);
  const u = R3.skyMat.uniforms;
  u.uSun.value.copy(SUN); u.uTod.value = tod; u.uTime.value = R3.clock;
  const lit = sstep(-0.05, 0.12, SUN.y);
  // the light that casts shadows never goes below a low angle, so roofs stay readable at dusk
  // (a game's licence: the key light comes in from the side and a little higher
  // than the sun you see, so the roofs carry long readable shadows)
  const laz = 122 * PI / 180, lel = lerp(26, 13, tod) * PI / 180;
  const ld = T.d.set(sin(laz) * cos(lel), sin(lel), -cos(laz) * cos(lel));
  R3.sun.position.copy(R3.sun.target.position).addScaledVector(ld, 160);
  R3.sun.intensity = 0.9 + 2.6 * lit;
  R3.sun.color.set('#ffb070').lerp(T.col.set('#ff6a3a'), tod);
  R3.hemi.intensity = 0.95 - tod * 0.25;
  R3.hemi.color.set('#ffcfa8').lerp(T.col.set('#7a5aa0'), tod);
  R3.hemi.groundColor.set('#5a3a40').lerp(T.col.set('#241828'), tod);
  R3.fill.intensity = 0.5 - tod * 0.15;
  R3.backlit = 0.6 + (1 - tod) * 0.4;
  // fog takes the colour of the horizon
  T.col.set(SKYC.hor0).lerp(T.col2.set(SKYC.hor1), tod).lerp(T.col2.set('#6a3a4a'), tod * 0.55);
  R3.scene.fog.color.copy(T.col);
  R3.scene.fog.density = 0.0029 + tod * 0.001;
  if (SKYLINE) SKYLINE.material.color.copy(T.col).lerp(T.col2.set('#3a2030'), 0.35 + tod * 0.3);
  if (R3.mats) R3.mats.wall[0].emissiveIntensity = R3.mats.wall[1].emissiveIntensity = 0.12 + sstep(0.15, 0.9, tod) * 1.5;
  if (SUNSPR) {
    SUNSPR.position.copy(SUN).multiplyScalar(420).add(EYE);
    SUNSPR.material.opacity = 0.55 * (0.25 + lit * 0.75);
    SUNSPR.material.color.set('#ffd9a0').lerp(T.col2.set('#ff6a30'), tod);
  }
  if (TAIL_MAT) TAIL_MAT.color.setScalar(1 - tod * 0.35);
  if (DKITE.mesh) DKITE.mesh.material.color.setScalar(0.9 - tod * 0.4);
  if (R3.renderer) R3.renderer.toneMappingExposure = 1.05 - tod * 0.12;
}

/* ====================================================================== cameras and quality */
function setupCams() {
  const w = arc.w, h = arc.h, asp = w / max(1, h);
  const fov = clamp(50 + (1 - asp) * 22, 48, 64);
  R3.fov = fov; R3.aspect = asp; R3.tanH = Math.tan(fov * PI / 360);
  R3.pitch = Math.atan(0.4 * R3.tanH);
  const c = R3.camRef; c.fov = fov; c.aspect = asp; c.position.copy(EYE); c.rotation.set(R3.pitch, 0, 0, 'YXZ');
  c.updateProjectionMatrix(); c.updateMatrixWorld(true);
  if (R3.cam) { R3.cam.fov = fov; R3.cam.aspect = asp; R3.cam.updateProjectionMatrix(); }
  placeHands();
  // shadows: the light follows the middle distance in front of you
  if (R3.sun) R3.sun.target.position.set(0, 8, -36);
}
const QPR = [0.55, 0.72, 0.9, 1];
function applyQuality() {
  const r = R3.renderer; if (!r || !arc) return;
  const q = R3.q;
  let pr = arc.dpr * QPR[q];
  // a software renderer draws every pixel on the CPU: keep its pixel count small
  if (R3.soft) pr = min(pr, q === 0 ? 0.6 : 0.8, Math.sqrt((q === 0 ? 240000 : 420000) / max(1, arc.w * arc.h)));
  R3.pr = max(0.4, pr);
  r.setPixelRatio(R3.pr); r.setSize(arc.w, arc.h, false);
  const want = q >= 3 ? 2048 : q >= 1 ? 1024 : 0;
  if (want !== R3.shadowSize) {
    R3.shadowSize = want;
    R3.sun.castShadow = want > 0;
    if (want) { R3.sun.shadow.mapSize.set(want, want); if (R3.sun.shadow.map) { R3.sun.shadow.map.dispose(); R3.sun.shadow.map = null; } }
  }
  if (DKITE.mesh) { DKITE.mesh.count = q >= 1 ? DKITE.n : 32; }
  if (R3.mats) {
    const hi = q >= 1 ? 1 : 0;
    R3.walls.material = R3.mats.wall[hi]; R3.roofs.material = R3.mats.roof[hi];
    R3.scene.environment = hi ? R3.env : null;
    const oct = hi ? 4 : 2;
    if (R3.skyMat.defines.OCT !== oct) { R3.skyMat.defines.OCT = oct; R3.skyMat.needsUpdate = true; }
  }
  if (PP.legs) { const s = q >= 2; for (const m of [PP.legs, PP.arms, PP.torso, PP.head]) m.castShadow = s; }
}
function softwareGL() {
  try {
    const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    const lose = gl.getExtension('WEBGL_lose_context'); if (lose) lose.loseContext();
    return /swiftshader|llvmpipe|software|softpipe/i.test(name);
  } catch (e) { return false; }
}

function boot(a) {
  arc = a;
  R3.camRef = new THREE.PerspectiveCamera(55, 1, 0.04, 1200);
  try {
    R3.soft = softwareGL();
    const r = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: !R3.soft, powerPreference: 'high-performance' });
    r.outputColorSpace = THREE.SRGBColorSpace; r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.02;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFShadowMap;
    r.setClearColor(0x1a1238, 1);
    R3.renderer = r; R3.aniso = min(8, r.capabilities.getMaxAnisotropy());
    a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
    a.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
  } catch (err) {
    R3.renderer = null;
    try { console.warn('3D unavailable: ' + (err && err.message || err)); } catch (e) { /* ignore */ }
  }
  try {
    buildWorld();
    R3.q = R3.soft ? 0 : (window.matchMedia && matchMedia('(pointer: coarse)').matches) ? 2 : 3;
    const q = /[?&]q=(\d)/.exec(location.search); if (q) { R3.q = clamp(+q[1], 0, 3); R3.lock = true; }
    setupCams();
    if (R3.renderer) {
      try {
        // a soft environment from the sky, for the glossy bits
        const env = new THREE.Scene();
        const sm = R3.skyMat.clone(); sm.uniforms.uSun.value = sunDir(0.35, new V3()); sm.uniforms.uTod.value = 0.35;
        env.add(new THREE.Mesh(new THREE.SphereGeometry(50, 16, 10), sm));
        const pm = new THREE.PMREMGenerator(R3.renderer);
        R3.env = pm.fromScene(env, 0.04).texture; R3.scene.environment = R3.env; R3.scene.environmentIntensity = 0.55;
        pm.dispose();
      } catch (e) { /* no environment: still lit */ }
      applyQuality();
      R3.ok = true;
    }
  } catch (err) {
    R3.ok = false;
    try { console.warn('3D scene failed: ' + (err && err.message || err)); } catch (e) { /* ignore */ }
  }
  if (!R3.cam) { R3.cam = new THREE.PerspectiveCamera(55, 1, 0.04, 1200); }
  if (!R3.scene) R3.scene = null;
  setupCams();
}

// The camera you see through: the reference view, with a breath of sway,
// shake on hits and a short push in on a cut.
function rigCamera() {
  const c = R3.cam, rm = arc.reducedMotion;
  c.position.copy(EYE);
  let yaw = 0, pitch = R3.pitch;
  if (!rm) {
    yaw += sin(R3.clock * 0.31) * 0.004; pitch += sin(R3.clock * 0.43) * 0.003;
    if (G.attract) { yaw += sin(R3.clock * 0.09) * 0.06; pitch += sin(R3.clock * 0.13) * 0.012; }
  }
  const k = R3.fov * PI / 180 / max(1, arc.h);
  yaw -= (arc.shakeX || 0) * k; pitch += (arc.shakeY || 0) * k;
  c.rotation.set(pitch, yaw, 0, 'YXZ');
  const fov = R3.fov - (rm ? 0 : sstep(0, 1, R3.punch) * 4);
  if (abs(c.fov - fov) > 1e-3) { c.fov = fov; c.updateProjectionMatrix(); }
  c.updateMatrixWorld(true);
}

const THC = new THREE.Color(), RIVC = new THREE.Color(), V2 = new THREE.Vector2();
function drawThreads() {
  const cam = R3.cam, cp = cam.position, pxw = 2 * Math.tan(cam.fov * PI / 360) / max(1, arc.h);
  const tw = (p, px) => p.distanceTo(cp) * pxw * px;
  const all = G.rivals.concat([G.me]);
  for (const k of all) {
    const v = k.vis; if (!v) continue;
    const me = k === G.me;
    // where the thread starts: your fingers as you see them, or the flyer's hand
    const A0 = T.a;
    if (me) { if (HANDS.reel) A0.set(0, 0.06, 0).applyMatrix4(HANDS.reel.matrixWorld); else A0.copy(R3.pinchL).applyMatrix4(cam.matrixWorld); } else A0.copy(k.anchor);
    const B0 = T.b.copy(k.bridle);
    const col = me ? THC.set(WARM).multiplyScalar(0.9 + k.pull * 1.4) : RIVC.set('#f6e2c8').lerp(T.col2.set('#ff6a4a'), clamp((k.pull - 0.3) / 0.5, 0, 1)).multiplyScalar(0.55 + k.pull * 0.6);
    const wpx = me ? 5.5 + k.pull * 2 : 3.6 + k.pull * 1.4;
    const fade = k.alive ? 1 : clamp(1 - k.cutT / 2.2, 0, 1);
    const R = v.tA, n = R.n;
    if (k.alive) {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), t = me ? u * u * u : u;
        threadAt(k, t, A0, B0, R.pts[i]);
        R.w[i] = tw(R.pts[i], wpx);
        R.c[i * 4] = col.r; R.c[i * 4 + 1] = col.g; R.c[i * 4 + 2] = col.b; R.c[i * 4 + 3] = 1;
      }
      R.build(n, cp);
      v.tB.mesh.visible = false;
    } else {
      // the lower part goes slack and drops toward the roofs
      const cpm = clamp(k.cutParam, 0.1, 0.95), drop = k.cutT * k.cutT * 3;
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), t = (me ? u * u * u : u) * cpm;
        threadAt(k, t, A0, B0, R.pts[i]);
        R.pts[i].y -= drop * (t / cpm) * (t / cpm);
        R.w[i] = tw(R.pts[i], wpx * 0.8);
        R.c[i * 4] = col.r * fade; R.c[i * 4 + 1] = col.g * fade; R.c[i * 4 + 2] = col.b * fade; R.c[i * 4 + 3] = 1;
      }
      R.build(n, cp);
      // the upper part trails under the falling kite
      const Rb = v.tB, m = Rb.n, L = min(9, A0.distanceTo(B0) * (1 - cpm) * 0.5 + 2);
      for (let i = 0; i < m; i++) {
        const s = i / (m - 1);
        Rb.pts[i].copy(B0); Rb.pts[i].y -= s * L * 0.85; Rb.pts[i].x -= s * L * 0.35 * (0.5 + G.wind.x) - sin(R3.clock * 3 + s * 4) * s * 0.4;
        Rb.w[i] = tw(Rb.pts[i], wpx * 0.8);
        Rb.c[i * 4] = col.r * fade; Rb.c[i * 4 + 1] = col.g * fade; Rb.c[i * 4 + 2] = col.b * fade; Rb.c[i * 4 + 3] = 1;
      }
      Rb.build(m, cp);
    }
    // the tail
    const Tl = v.tail;
    if (k.tailOK && v.grp.visible) {
      const ca = T.col.set(k.col), cb = T.col2.set(k.col2);
      for (let i = 0; i < Tl.n; i++) {
        Tl.pts[i].copy(k.tailP[i]);
        Tl.w[i] = 0.16 - i * 0.008;
        const cc = i % 4 < 2 ? ca : cb, sh = 0.7 - i * 0.02;
        Tl.c[i * 4] = cc.r * sh; Tl.c[i * 4 + 1] = cc.g * sh; Tl.c[i * 4 + 2] = cc.b * sh; Tl.c[i * 4 + 3] = 1;
      }
      Tl.build(Tl.n, cp);
    } else Tl.mesh.visible = false;
  }
}

function drawGlow() {
  const P = GLOW; if (!P) return;
  P.begin();
  for (let i = 0; i < FX.n; i++) {
    const a = clamp(FX.life[i] / FX.ml[i], 0, 1);
    P.push(FX.x[i], FX.y[i], FX.z[i], FX.size[i] * (0.5 + a * 0.5), a, FX.r[i], FX.g[i], FX.b[i]);
  }
  // glints running up your thread
  const me = G.me;
  if (me && me.alive && GL.length) {
    for (const gl of GL) {
      threadAt(me, gl.t * gl.t, me.anchor, me.bridle, T.c);
      P.push(T.c.x, T.c.y, T.c.z, T.c.distanceTo(R3.cam.position) * 0.022, 1 - gl.t * 0.5, C_WHITE.r, C_WHITE.g, C_WHITE.b);
    }
  }
  // festival bulbs and lanterns glow more as it gets dark
  const night = 0.35 + R3.tod * 0.9;
  STRANDS.forEach((s) => s.pts.forEach((p, j) => {
    const on = 0.55 + 0.45 * sin(R3.clock * 2.4 + j * 1.3 + s.ph);
    const c = s.cols[j];
    P.push(p.x, p.y - 0.05, p.z, (s.own ? 0.22 : 0.7) * night, on * 0.5, c.r * 0.5, c.g * 0.5, c.b * 0.5);
  }));
  LANT.list.forEach((l) => P.push(l.x + sin(R3.clock * 0.7 + l.ph), l.y, l.z, 3.4, 0.45 + R3.tod * 0.4, 1.0, 0.45, 0.12));
  P.mat.uniforms.uScale.value = (R3.renderer ? R3.renderer.getDrawingBufferSize(V2).y : arc.h) / (2 * Math.tan(R3.cam.fov * PI / 360));
  P.end();
}

/* ====================================================================== the HUD, in 2D on top */
function rr(c, x, y, w, h, r) {
  r = min(r, w / 2, h / 2);
  c.beginPath(); c.moveTo(x + r, y);
  c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function plate(c, x, y, w, h, r) {
  c.fillStyle = 'rgba(15,13,10,.66)'; rr(c, x, y, w, h, r); c.fill();
  c.strokeStyle = 'rgba(201,169,110,.32)'; c.lineWidth = 1; c.stroke();
}
function txt(c, s, x, y, size, col, wgt, align, font) {
  c.font = (wgt || 500) + ' ' + size + 'px ' + (font || F_UI);
  c.fillStyle = col; c.textAlign = align || 'left'; c.textBaseline = 'middle';
  c.fillText(s, x, y);
}
function drawHUD(c) {
  const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { top: 12, left: 12, right: 12 };
  const sw = (full) => min(full, max(96, w / 2 - 66 - 12));
  plate(c, pad.left, pad.top, sw(150), 64, 12);
  txt(c, 'CUTS', pad.left + 14, pad.top + 16, 10, GOLD, 600, 'left', F_MONO);
  txt(c, String(G.cuts), pad.left + 14, pad.top + 40, 26, INK, 500, 'left', F_DISP);
  plate(c, w / 2 - 58, pad.top, 116, 44, 12);
  const mid = G.mode === 'dusk' ? (Math.max(0, G.time | 0) + 's') : G.mode === 'hunt' ? (G.cuts + ' / 6') : 'ENDLESS';
  txt(c, mid, w / 2, pad.top + 22, G.mode === 'dusk' ? 22 : 14, G.mode === 'dusk' && G.time < 12 ? PRIM : INK, 500, 'center', G.mode === 'dusk' ? F_DISP : F_MONO);
  const pulling = G.me.pull > 0.5;
  plate(c, w - pad.right - sw(132), pad.top, sw(132), 44, 12);
  txt(c, pulling ? 'PULLING' : 'GLIDING', w - pad.right - sw(132) / 2, pad.top + 22, 12, pulling ? WARM : INK, 600, 'center', F_MONO);
  // a thin bar under the pull plate shows how taut the string is
  c.fillStyle = 'rgba(251,245,236,.12)'; c.fillRect(w - pad.right - sw(132) + 12, pad.top + 36, sw(132) - 24, 3);
  c.fillStyle = pulling ? WARM : GOLD; c.fillRect(w - pad.right - sw(132) + 12, pad.top + 36, (sw(132) - 24) * clamp(G.me.pull, 0, 1), 3);
}
// The shell hides its own hint on touch, so the gesture reminder is drawn
// here for the first seconds of play.
function drawTouchHint(c) {
  if (!arc.touchMode || arc.touchStyle === 'pads' || G.attract || G.hintT > 6.5) return;
  const a = arc.reducedMotion ? 1 : clamp(6.5 - G.hintT, 0, 1);
  const w = arc.w, pad = arc.hudPad ? arc.hudPad() : { bottom: 64 };
  const lines = arc.touchStyle === 'tilt'
    ? ['Tilt the phone to steer', 'Hold a finger down to pull and cut']
    : ['Drag anywhere to fly the kite', 'Tap to yank, or hold a second finger to pull'];
  c.save(); c.globalAlpha = a;
  c.font = '600 13px ' + F_UI;
  const mw = min(w - 24, max(c.measureText(lines[0]).width, c.measureText(lines[1]).width) + 32);
  const y = arc.h - pad.bottom - 64;
  plate(c, (w - mw) / 2, y - 10, mw, 50, 12);
  txt(c, lines[0], w / 2, y + 5, 13, INK, 600, 'center');
  txt(c, lines[1], w / 2, y + 25, 13, INK, 600, 'center');
  c.restore();
}
const _pp = { x: 0, y: 0 };
function drawPops(c) {
  G.pops.forEach((p) => {
    const a = clamp(p.life / p.max, 0, 1);
    T.v.set(p.x, p.y, p.z);
    toPx(T.v, _pp, R3.cam);
    const rise = (1 - a) * 38 + 16;
    const sc = 1 + (1 - a) * 0.15 + (a > 0.85 ? (a - 0.85) * 2 : 0);
    c.save(); c.globalAlpha = a;
    c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 8;
    txt(c, p.label, _pp.x, _pp.y - rise, 24 * sc, WARM, 600, 'center', F_DISP);
    txt(c, p.pts, _pp.x, _pp.y - rise + 22, 14 * sc, INK, 700, 'center', F_MONO);
    c.restore();
  });
}
function drawVignette(c, w, h) {
  const v = c.createRadialGradient(w * 0.5, h * 0.45, h * 0.25, w * 0.5, h * 0.5, h * 0.82);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(0.7, 'rgba(10,6,12,.10)');
  v.addColorStop(1, 'rgba(10,6,12,.45)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
}
// If WebGL is not available at all, the game still plays on a flat sky.
function drawFallback(c, w, h) {
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#1a1238'); g.addColorStop(0.4, '#c45b3a'); g.addColorStop(0.75, '#f0a05a'); g.addColorStop(1, '#2a1810');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  c.fillStyle = '#20140f'; c.fillRect(0, h * 0.74, w, h * 0.26);
  const all = G.rivals.concat(G.me ? [G.me] : []);
  for (const k of all) {
    if (!k.alive && k.cutT > 2.2) continue;
    const x = k.x * w, y = k.y * h, s = k === G.me ? 22 : 15;
    c.strokeStyle = 'rgba(255,220,160,.6)'; c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(k === G.me ? w / 2 : x * 0.7, k === G.me ? h * 0.86 : h * 0.74); c.lineTo(x, y); c.stroke();
    c.fillStyle = k.col; c.beginPath(); c.moveTo(x, y - s); c.lineTo(x + s * 0.8, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.8, y); c.closePath(); c.fill();
  }
}

function render(c, a) {
  arc = a;
  const w = arc.w, h = arc.h;
  const now = performance.now();
  const real = R3.lastNow ? (now - R3.lastNow) / 1000 : 1 / 60;
  R3.lastNow = now;
  if (R3.ok && R3.renderer && !R3.lost && R3.scene) {
    try {
      const t0 = performance.now();
      rigCamera();
      drawThreads();
      drawGlow();
      const t1 = performance.now();
      R3.renderer.render(R3.scene, R3.cam);
      const t2 = performance.now();
      R3.msPrep = lerp(R3.msPrep || 0, t1 - t0, 0.1); R3.msGL = lerp(R3.msGL || 0, t2 - t1, 0.1);
    } catch (err) {
      R3.ok = false;
      try { console.warn('3D render stopped: ' + (err && err.message || err)); } catch (e) { /* ignore */ }
    }
    // quality auto-scale on real frame time
    if (!R3.lock && arc.state !== 'pause' && real < 0.5) {
      R3.accT += real; R3.accN++;
      if (R3.accT > 1.2 && R3.accN >= 4) {
        const avg = R3.accT / R3.accN; R3.fps = Math.round(1 / avg);
        if (R3.settle > 0) R3.settle--;
        else if (avg > 0.034 && R3.q > 0) { R3.q--; applyQuality(); R3.settle = 1; R3.goodT = 0; }
        else if (avg < 0.019 && R3.q < R3.qMax) { R3.goodT++; if (R3.goodT >= 4) { R3.q++; applyQuality(); R3.goodT = 0; R3.settle = 1; } }
        else R3.goodT = 0;
        R3.accT = 0; R3.accN = 0;
      }
    }
  } else {
    drawFallback(c, w, h);
  }
  const t3 = performance.now();
  drawVignette(c, w, h);
  drawPops(c);
  if (arc.state === 'play' && !G.attract) { drawHUD(c); drawTouchHint(c); }
  R3.msHud = lerp(R3.msHud || 0, performance.now() - t3, 0.1);
}

window.__sky3d = R3;
function nearestRival() {
  let best = null, bd = 9;
  for (const r of G.rivals) { if (!r.alive || !G.me) continue; const d = hypot(r.x - G.me.x, r.y - G.me.y); if (d < bd) { bd = d; best = r; } }
  return best ? [+best.x.toFixed(3), +best.y.toFixed(3)] : null;
}
function dbg() {
  const m = G.me || { x: 0, y: 0, pull: 0, alive: false };
  return {
    phase: G.phase, mode: G.mode, diff: G.diff, time: +G.time.toFixed(2), score: Math.round(G.score), cuts: G.cuts, alive: !!G.alive,
    x: +m.x.toFixed(3), y: +m.y.toFixed(3), pull: +m.pull.toFixed(2),
    rivals: G.rivals.filter((r) => r.alive).length, wind: +G.wind.x.toFixed(2), attract: !!G.attract,
    yanks: G.yanks, fingers: fingers.size,
    near: nearestRival(),
    touchStyle: arc ? arc.touchStyle : '', quality: R3.q, fps: R3.fps || null, webgl: !!R3.ok,
    draws: R3.renderer ? R3.renderer.info.render.calls : 0, tod: +R3.tod.toFixed(2),
    ms: [R3.msPrep, R3.msGL, R3.msHud, R3.msStep].map((v) => +(v || 0).toFixed(1)), tris: R3.renderer ? R3.renderer.info.render.triangles : 0,
  };
}

A.create({
  slug: 'sky-thread', title: 'Sky Thread', genre: 'Kite fighting', three: true,
  hint: 'Mouse or WASD steer   hold click or Space to pull and cut',
  touchHint: 'Stick steers, hold Pull to cut',
  keys: [
    ['WASD / Arrows', 'Steer the kite'],
    ['Space / J (hold)', 'Pull the string to cut'],
  ],
  mouse: { cursor: 'crosshair', keys: [['Move mouse', 'Steer toward the pointer'], ['Click / hold', 'Pull to cut']] },
  touch: { stick: true, pads: [{ label: 'Pull', key: 'Space', big: true, hot: true }] },
  touchKeys: [['On-screen stick', 'Steer'], ['Pull (hold)', 'Cut a rival thread']],
  gamepad: { buttons: ['Space', 'KeyJ'], rt: 'Space', lt: 'Space' },
  gestures: {
    drag: false,
    tilt: 'xy',
    hint: 'Drag to fly, tap to yank, hold a second finger to pull',
    keys: [
      ['Drag anywhere', 'Fly the kite'],
      ['Tap', 'Yank the string'],
      ['Second finger (hold)', 'Keep pulling to cut'],
      ['Tilt to steer', 'Lean to fly, hold a finger to pull'],
    ],
  },
  formatScore: (v) => Math.round(v) + ' pts',
  menu: {
    eyebrow: 'Kite fighting',
    title: 'Sky <em>Thread</em>',
    html: '<p>Dusk over the terraces. Steer into a rival line and hold Pull so your thread cuts theirs. Glide through a fight and a hard-pulling rival can cut you. Hold Pull to stay safe.</p>',
    options: [
      { id: 'mode', label: 'Mode', value: 'dusk', choices: [{ v: 'dusk', label: 'Until dusk' }, { v: 'hunt', label: 'Cut six' }, { v: 'endless', label: 'Endless sky' }] },
      { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }] },
    ],
  },
  pauseHtml() { return '<div class="stat"><div>Cuts<b>' + G.cuts + '</b></div>' + (G.mode === 'dusk' ? '<div>Time<b>' + Math.max(0, G.time | 0) + 's</b></div>' : '') + '</div>'; },
  resize(a) {
    arc = a;
    if (!R3.camRef) return;
    setupCams();
    if (R3.renderer) applyQuality();
    syncWorld();
  },
  graphics(level) {
    if (level === 'auto') { R3.lock = false; R3.settle = 1; return; }
    R3.lock = true; R3.q = level === 'sharp' ? 3 : 1; applyQuality();
  },
  onMenu(a) { arc = a; resetWorld(true); },
  init(a) {
    arc = a; a.debug = dbg; G.D = DIFF.normal;
    boot(a);
    resetWorld(true);
    const cvs = a.canvas;
    cvs.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') fingers.add(e.pointerId); });
    const lift = (e) => fingers.delete(e.pointerId);
    cvs.addEventListener('pointerup', lift); cvs.addEventListener('pointercancel', lift); cvs.addEventListener('lostpointercapture', lift);
    window.addEventListener('blur', () => fingers.clear());
    a.menu();
  },
  onPause() { fingers.clear(); },
  start(a, ch) {
    arc = a; resetWorld(false, ch); fingers.clear();
    const label = G.mode === 'hunt' ? 'Cut six threads' : G.mode === 'endless' ? 'Endless sky' : 'Until dusk';
    arc.toast(label, 'Sky Thread', 1400);
  },
  update, idle, render,
});
