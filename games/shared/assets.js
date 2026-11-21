/*
 * The shared 3D asset library for the games: real models instead of boxes.
 *
 *   import * as Assets from '/games/shared/assets.js';
 *
 * Every model, texture and HDRI lives under /games/assets/, is CC0 (credits in
 * /games/assets/CREDITS.md) and is listed in /games/assets/catalog.json with
 * its category, tags, triangle count, size in metres and byte size. Names are
 * "<pack>/<item>", for example 'kenney-cars/sedan', 'q-people/casual-female',
 * 'q-nature/common-tree-2', 'ph-models/fire-hydrant'. Look them up in the
 * catalog or on /games/shared/assets-lab.html.
 *
 * LOADING
 *   await Assets.preload(['kenney-cars/sedan', 'q-people/anims'], (p) => bar(p));
 *     // during the menu: fetches and parses, p goes 0..1 (by bytes). Never throws.
 *   const car = Assets.get('kenney-cars/sedan');           // sync clone once preloaded, else null
 *   const car2 = await Assets.load('kenney-cars/sedan');   // async clone (loads if needed)
 *   const tree = await Assets.load('q-nature/pine-2', { fallback: () => makeConeTree() });
 *     // any load failure (offline, missing file, old browser) returns fallback() instead,
 *     // so a game keeps its code-made model. Without a fallback it resolves to null.
 *   Assets.info('kenney-cars/sedan')   // the catalog entry: { tris, size: [x,y,z], bytes, ... }
 *   Assets.list({ category: 'vehicle', tag: 'car' })        // names
 *
 *   Clones share geometry and materials with the cached original (one GPU copy,
 *   one shader program), so a hundred cars cost one upload. Do not dispose a
 *   clone's geometry or materials; call Assets.release(name) to drop a model.
 *   Skinned models are cloned with SkeletonUtils so each has its own skeleton.
 *   Pieces of a modular kit (catalog entries with `node`) come from one shared
 *   file; loading any piece fetches that kit once.
 *
 * MAKING THEM BELONG IN A LIT SCENE
 *   Assets.prepare(obj, { cast: true, receive: true, envIntensity: 1, roughness: [0.35, 1],
 *                         metalness: 0.15, quality: 3 })
 *   Called by load() with the defaults (pass { prepare: false } to skip). Turns on
 *   shadows, keeps colour textures in sRGB, clamps roughness so nothing looks like
 *   wet plastic, caps metalness on materials that have no metalness map (low-poly
 *   packs often export metal=1 by mistake, which renders black without an
 *   environment), and at quality 0..1 drops normal maps and extra texture lookups.
 *   Do it before the first compile; it never changes a material during play.
 *   Assets.footprint(obj) -> diameter in metres for fx3d contactShadow().track(obj, { size }).
 *
 * PEOPLE (two rigs)
 *   const p = await Assets.person('q-people/casual-female', {
 *     anims: 'q-people/anims',              // shared clips: Idle, Walk, Walk_Carry, Victory, Defeat,
 *                                           // Punch, RecieveHit, PickUp, SitDown, StandUp, Shoot_OneHanded
 *     seed: 7,                              // a random but repeatable look: skin, hair, clothes
 *     colors: { Shirt: '#2f5d50' },         // or set materials by name
 *     play: 'Idle' });
 *   scene.add(p.object); p.play('Walk', { fade: 0.3, timeScale: speed / 1.4 }); p.update(dt);
 *
 *   const hero = await Assets.person('q-base-characters/male', {
 *     hair: 'q-base-characters/hair-simple-parted',   // re-bound to the body's skeleton
 *     anims: ['q-anim-library/ual1', 'q-anim-library-2/ual2'],
 *     skin: '#8c5a3b',                       // tints the skin texture
 *     outfit: { top: '#1f4fa8', bottom: '#f2f2ee', shoes: '#222', sleeves: 'short', legs: 'short' },
 *     play: 'Idle_Loop' });
 *     // outfit paints a top, bottoms and shoes onto the base body (a sports kit, a
 *     // T-shirt and trousers...): sleeves/legs 'short' | 'long'. One shader program
 *     // for every outfit; p.object's body material carries userData.outfit uniforms
 *     // (uOutfitTop.value.set('#c33') recolours live, no recompile).
 *     // 86 clips: Jog_Fwd_Loop, Sprint_Loop, Walk_Loop, Crouch_Fwd_Loop, Jump_Start, Jump_Loop,
 *     // Jump_Land, Punch_Jab, Punch_Cross, Roll, Driving_Loop, Sitting_Idle_Loop, Dance_Loop,
 *     // Pistol_Aim_Neutral, Slide_Start, Slide_Loop, OverhandThrow, Idle_FoldArms_Loop, Yes, ...
 *     // (Assets.info('q-anim-library/ual1').anims lists them)
 *   p.play(name, { fade = 0.25, loop = true, timeScale = 1, once })  // crossfades from the current clip
 *   p.oneShot(name, { fade, then })  // plays once, then returns to `then` (or the previous loop)
 *   p.mixer, p.actions[name], p.clips, p.bones[name], p.setColors({ Skin: '#c98f66' }), p.dispose()
 *   Both rigs face +Z and stand on y = 0, 1.75 m tall (base bodies keep their own 1.7..1.8 m).
 *
 * ENVIRONMENT, TEXTURES, LOD, INSTANCES
 *   await Assets.environment(renderer, scene, 'day', { intensity: 1, background: false, blur: 0.3 })
 *     // HDRIs: day, golden, dusk, overcast-city, night. Sets scene.environment (a PMREM).
 *     // Call it at build time or on a menu, never mid-play (it changes every lit program).
 *   const mat = await Assets.material('asphalt', { repeat: [8, 8], renderer })
 *     // CC0 PBR sets: asphalt, grass, concrete, dirt, fabric, paving, bricks (colour, normal, ORM)
 *   const lod = await Assets.lod('ph-models/fire-hydrant', { far: 25 })   // THREE.LOD, base + .lod1
 *   const trees = await Assets.instanced('kenney-nature/tree-oak', 200)
 *   trees.set(i, x, y, z, rotY, scale); trees.count = n; scene.add(trees.object)
 *     // one InstancedMesh per part of the model, transforms composed for you
 *
 * Everything is a plain module with no WebAssembly (the site's CSP allows none):
 * geometry is KHR_mesh_quantization, textures EXT_texture_webp, both read by the
 * vendored GLTFLoader directly.
 */
import * as THREE from '/games/vendor/three/three.module.min.js';
import { GLTFLoader } from '/games/vendor/three/addons/loaders/GLTFLoader.js';
import { HDRLoader } from '/games/vendor/three/addons/loaders/HDRLoader.js';
import { clone as skeletonClone } from '/games/vendor/three/addons/utils/SkeletonUtils.js';

const CATALOG_URL = '/games/assets/catalog.json';
let catalogP = null;
const files = new Map();      // url -> Promise<gltf>
const ready = new Map();      // url -> gltf (parsed, for sync get)
const warned = new Set();
let loader = null;

// The site's CSP has connect-src 'self', and GLTFLoader's default image path
// (ImageBitmapLoader) fetch()es the blob: URL it makes for each embedded
// texture, which that policy blocks. TextureLoader decodes the same blob through
// an <img>, which img-src allows, so the parser is pointed at it.
function gltfLoader() {
  if (loader) return loader;
  loader = new GLTFLoader();
  loader.register((parser) => {
    const tl = new THREE.TextureLoader(parser.options.manager);
    tl.setCrossOrigin(parser.options.crossOrigin);
    tl.setRequestHeader(parser.options.requestHeader);
    parser.textureLoader = tl;
    return { name: 'assets_img_textures' };
  });
  return loader;
}
function warnOnce(key, msg) { if (!warned.has(key)) { warned.add(key); try { console.warn('[assets] ' + msg); } catch (e) { /* no console */ } } }

/** The catalog (fetched once). Resolves to { assets, textures, hdri, packs } or an empty one on failure. */
export function catalog() {
  if (!catalogP) {
    catalogP = fetch(CATALOG_URL).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch((e) => { warnOnce('catalog', 'catalog unavailable: ' + e.message); return { assets: {}, textures: {}, hdri: {}, packs: {}, failed: true }; });
  }
  return catalogP;
}
let CAT = null;
catalog().then((c) => { CAT = c; });

/** Catalog entry for a name, or null (sync once the catalog has arrived). */
export function info(name) { return (CAT && (CAT.assets[name] || null)) || null; }
/** Names matching a filter: { category, tag, pack, maxTris }. Needs the catalog (await catalog() first). */
export function list(f) {
  f = f || {};
  if (!CAT) return [];
  return Object.keys(CAT.assets).filter((n) => {
    const a = CAT.assets[n];
    if (a.kit && !f.kits) return false;
    if (f.category && a.category !== f.category) return false;
    if (f.tag && !(a.tags || []).includes(f.tag)) return false;
    if (f.pack && a.pack !== f.pack) return false;
    if (f.maxTris && a.tris > f.maxTris) return false;
    return true;
  });
}

function fetchFile(url, onProgress) {
  let p = files.get(url);
  if (!p) {
    p = gltfLoader().loadAsync(url, onProgress).then((g) => { ready.set(url, g); return g; });
    p.catch(() => files.delete(url));
    files.set(url, p);
  }
  return p;
}

// The source object for a name inside a parsed file (a kit piece or the whole scene).
function sourceOf(gltf, entry) {
  if (!entry.node) return gltf.scene;
  return gltf.scene.getObjectByName(entry.node) || null;
}
function cloneOf(src, entry) {
  const skinned = entry.skinned || (src.getObjectByProperty && hasSkin(src));
  const c = skinned ? skeletonClone(src) : src.clone(true);
  if (entry.node) { c.position.set(0, 0, 0); c.updateMatrix(); }
  c.name = entry.name || c.name;
  c.userData.asset = entry.name;
  return c;
}
function hasSkin(o) { let s = false; o.traverse((n) => { if (n.isSkinnedMesh) s = true; }); return s; }

/** A clone if the model is already loaded (by preload or an earlier load), else null. */
export function get(name, opts) {
  const e = info(name);
  if (!e) return null;
  const g = ready.get(e.file);
  if (!g) return null;
  const src = sourceOf(g, e);
  if (!src) return null;
  const c = cloneOf(src, Object.assign({ name }, e));
  if (!opts || opts.prepare !== false) prepare(c, opts);
  return c;
}

/** Load (or reuse) a model and return a clone. On any failure returns opts.fallback() or null. */
export async function load(name, opts) {
  opts = opts || {};
  try {
    const cat = await catalog();
    const e = cat.assets[name];
    if (!e) throw new Error('not in the catalog');
    const g = await fetchFile(e.file);
    const src = sourceOf(g, e);
    if (!src) throw new Error('piece ' + e.node + ' missing from ' + e.file);
    const c = cloneOf(src, Object.assign({ name }, e));
    if (opts.prepare !== false) prepare(c, opts);
    return c;
  } catch (err) {
    warnOnce(name, name + ': ' + (err && err.message ? err.message : err) + (opts.fallback ? ' (using the fallback)' : ''));
    return opts.fallback ? opts.fallback() : null;
  }
}

/** The parsed glTF of a name (shared, do not modify): { scene, animations, ... } or null. */
export async function gltfOf(name) {
  try { const e = (await catalog()).assets[name]; return e ? await fetchFile(e.file) : null; } catch (e) { return null; }
}

/**
 * Fetch and parse a list of models (names, or names of textures/HDRIs are ignored)
 * during the menu. onProgress(p) gets 0..1 weighted by file size. Resolves to
 * { ok: [...names], failed: [...names] } and never rejects.
 */
export async function preload(names, onProgress) {
  const cat = await catalog();
  const byFile = new Map();
  const failed = [];
  for (const n of names) {
    const e = cat.assets[n];
    if (!e) { failed.push(n); continue; }
    if (!byFile.has(e.file)) byFile.set(e.file, { bytes: e.kit ? e.bytes : (fileBytes(cat, e.file) || e.bytes || 1e5), names: [] });
    byFile.get(e.file).names.push(n);
  }
  const total = [...byFile.values()].reduce((s, f) => s + f.bytes, 0) || 1;
  const got = new Map();
  const tick = () => { if (onProgress) { let s = 0; for (const v of got.values()) s += v; try { onProgress(Math.min(1, s / total)); } catch (e) { /* game callback */ } } };
  const ok = [];
  await Promise.all([...byFile].map(([url, f]) => fetchFile(url, (ev) => { if (ev && ev.loaded) { got.set(url, Math.min(f.bytes, ev.loaded)); tick(); } })
    .then(() => { got.set(url, f.bytes); tick(); ok.push(...f.names); })
    .catch((err) => { got.set(url, f.bytes); tick(); failed.push(...f.names); warnOnce(url, 'could not load ' + url + ': ' + (err && err.message)); })));
  if (onProgress) try { onProgress(1); } catch (e) { /* game callback */ }
  return { ok, failed };
}
function fileBytes(cat, file) {
  for (const k in cat.assets) { const a = cat.assets[k]; if (a.file === file && a.bytes) return a.bytes; }
  return 0;
}

/** Forget a loaded file (frees it once no clone is in the scene). */
export function release(name) {
  const e = info(name);
  if (!e) return;
  const g = ready.get(e.file);
  files.delete(e.file); ready.delete(e.file);
  if (g) g.scene.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); for (const m of [].concat(o.material)) { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); } } });
}

/* ------------------------------------------------------------------ materials */
const TEX_SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'];
/**
 * Make library models sit in a lit, shadowed scene with an environment map.
 * Shared materials are adjusted once (marked in userData), so this is cheap to
 * call on every clone. Options: cast, receive, envIntensity, roughness [min, max],
 * metalness (cap when there is no metalness map), quality 0..3, anisotropy.
 */
export function prepare(obj, o) {
  o = o || {};
  const cast = o.cast !== false, receive = o.receive !== false;
  const rMin = o.roughness ? o.roughness[0] : 0.35, rMax = o.roughness ? o.roughness[1] : 1;
  const mCap = o.metalness != null ? o.metalness : 0.15;
  const q = o.quality != null ? o.quality : 3;
  const key = [rMin, rMax, mCap, q, o.envIntensity == null ? 1 : o.envIntensity, o.anisotropy || 0].join('|');
  obj.traverse((m) => {
    if (!m.isMesh) return;
    m.castShadow = cast; m.receiveShadow = receive;
    for (const mat of [].concat(m.material)) {
      if (!mat || mat.userData.assetsPrepared === key) continue;
      mat.userData.assetsPrepared = key;
      if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
      if (mat.emissiveMap) mat.emissiveMap.colorSpace = THREE.SRGBColorSpace;
      if ('roughness' in mat) mat.roughness = Math.min(rMax, Math.max(rMin, mat.roughness));
      if ('metalness' in mat && !mat.metalnessMap) mat.metalness = Math.min(mat.metalness, mCap);
      if ('envMapIntensity' in mat && o.envIntensity != null) mat.envMapIntensity = o.envIntensity;
      if (q <= 1) { mat.normalMap = null; if (q <= 0) { mat.roughnessMap = null; mat.metalnessMap = null; mat.aoMap = null; } }
      if (o.anisotropy) for (const s of TEX_SLOTS) if (mat[s]) mat[s].anisotropy = o.anisotropy;
      mat.needsUpdate = true;
    }
  });
  return obj;
}

/** Diameter (metres) of an object's footprint on the ground, for contact shadows. */
export function footprint(obj) {
  const b = new THREE.Box3().setFromObject(obj);
  return Math.max(0.2, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.9);
}

/* ------------------------------------------------------------------ people */
// Palettes match /games/shared/human.js (real skin tones, mostly South Asian).
const SKIN = [['#f1d1b3', 0.8], ['#e7bb95', 1.6], ['#d9a47b', 2.4], ['#c98f66', 2.6], ['#b77b54', 2.4], ['#a26a47', 2.0], ['#8c5a3b', 1.5], ['#744830', 1.0], ['#5c3826', 0.6], ['#f6dccb', 0.4], ['#3f271b', 0.4]];
const HAIR = [['#120e0b', 5], ['#1d1511', 4], ['#2a1d15', 2.6], ['#3a281b', 1.3], ['#563826', 0.5], ['#6b5d52', 0.25]];
const CLOTH = ['#2b3a55', '#5a6b7c', '#7a2e2e', '#2f5d50', '#c9b79c', '#e8e2d6', '#3c3c42', '#8a5a2b', '#a8324a', '#2d6cdf', '#f2c14e', '#6b4f8a', '#d96c3f', '#1f7a6a', '#ece6da', '#55606e'];
const PANTS = ['#23262d', '#2f3a52', '#3b4250', '#4a4a4f', '#6a5d4d', '#1d2433', '#7a7468', '#2b2b2e'];
function rng(seed) { let s = (seed * 2654435761) >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function pickW(list, r) { let t = 0; for (const [, w] of list) t += w; let x = r() * t; for (const [c, w] of list) { x -= w; if (x <= 0) return c; } return list[0][0]; }
const SKIN_MATS = /^(skin|face|head|body)$/i;
const HAIR_MATS = /^(hair|beard|eyebrows?|moustache)$/i;
const PANTS_MATS = /^(pants|trousers|shorts|skirt|legs)$/i;
const KEEP_MATS = /^(eyes?|eye_?white|teeth|black|white)$/i;
// Recoloured materials are shared between people who get the same colour.
const tinted = new Map();
function recolor(obj, colors, multiply) {
  obj.traverse((m) => {
    if (!m.isMesh) return;
    const mats = [].concat(m.material).map((mat) => {
      const c = colors[mat.name] || (mat.userData.assetsBase && colors[mat.userData.assetsBase]);
      if (!c) return mat;
      const base = mat.userData.assetsBase || mat.name;
      const k = mat.uuid + '|' + c;
      let t = tinted.get(k);
      if (!t) {
        t = mat.clone(); t.userData = Object.assign({}, mat.userData, { assetsBase: base });
        if (multiply && mat.map) t.color.set(c); else t.color.set(c);
        tinted.set(k, t);
      }
      return t;
    });
    m.material = Array.isArray(m.material) ? mats : mats[0];
  });
}

function bindHair(body, hair) {
  // Hair from the base-character pack is skinned to a copy of the same
  // skeleton; re-bind it to the body's bones by name so it follows the head.
  const bones = {};
  body.traverse((n) => { if (n.isBone) bones[n.name] = n; });
  let host = null;
  body.traverse((n) => { if (!host && n.isSkinnedMesh) host = n; });
  const meshes = [];
  hair.traverse((n) => { if (n.isSkinnedMesh) meshes.push(n); });
  for (const h of meshes) {
    const sk = new THREE.Skeleton(h.skeleton.bones.map((b) => bones[b.name] || b), h.skeleton.boneInverses);
    h.removeFromParent();
    (host ? host.parent : body).add(h);
    h.bind(sk, host ? host.bindMatrix : h.bindMatrix);
    h.castShadow = true;
  }
}

/**
 * A rigged person with animations, colours and crossfades. See the header.
 * opts: anims (name or names of animation files), play, seed, colors {matName: hex},
 * skin (hex, tints a skin texture), hair (base rig: a hair model name), hairColor,
 * fallback () => Object3D (used if the model cannot load; returns a stub person).
 */
export async function person(name, opts) {
  opts = opts || {};
  const object = await load(name, { prepare: opts.prepare, roughness: [0.45, 1], fallback: null });
  if (!object) {
    const fb = opts.fallback ? opts.fallback() : new THREE.Group();
    return stubPerson(fb);
  }
  const entry = info(name) || {};
  const r = rng(opts.seed != null ? opts.seed : Math.floor(Math.random() * 1e9));
  if (opts.hair) {
    const hair = await load(opts.hair, { prepare: true });
    if (hair) bindHair(object, hair);
  }
  const base = entry.tags && entry.tags.includes('base-body');
  // Colours: explicit > seeded random > the model's own.
  const colors = {};
  const mats = new Set();
  object.traverse((m) => { if (m.isMesh) for (const mat of [].concat(m.material)) mats.add(mat.name); });
  if (opts.seed != null || opts.randomize) {
    const skin = pickW(SKIN, r), hair = opts.hairColor || pickW(HAIR, r);
    if (base) { colors.__skin = skin; colors.__hair = hair; } else {
      for (const n of mats) {
        if (!n || KEEP_MATS.test(n)) continue;
        if (SKIN_MATS.test(n)) colors[n] = skin;
        else if (HAIR_MATS.test(n)) colors[n] = hair;
        else if (PANTS_MATS.test(n)) colors[n] = PANTS[Math.floor(r() * PANTS.length)];
        else if (entry.tags && entry.tags.includes('dressed')) colors[n] = CLOTH[Math.floor(r() * CLOTH.length)];
      }
    }
  }
  Object.assign(colors, opts.colors || {});
  const skinHex = opts.skin || colors.__skin;
  // The base pack's hair and brow textures are grey, meant to be tinted: never leave them white.
  const hairHex = opts.hairColor || colors.__hair || (base ? '#1d1511' : null);
  delete colors.__skin; delete colors.__hair;
  // Base bodies carry a painted skin texture: tint it (multiply) toward the tone.
  if (skinHex || hairHex) {
    object.traverse((m) => {
      if (!m.isMesh) return;
      for (const mat of [].concat(m.material)) {
        if (/superhero|body|skin/i.test(mat.name) && skinHex) colors[mat.name] = skinTint(skinHex);
        if (/hair|eyebrow/i.test(mat.name) && hairHex) colors[mat.name] = hairHex;
      }
    });
  }
  recolor(object, colors);
  if (entry.outfit && (opts.outfit || (base && (opts.seed != null || opts.randomize)))) {
    const o = opts.outfit || { top: CLOTH[Math.floor(r() * CLOTH.length)], bottom: PANTS[Math.floor(r() * PANTS.length)], shoes: '#2a2a2e', sleeves: r() < 0.3 ? 'long' : 'short', legs: r() < 0.6 ? 'long' : 'short' };
    await dress(object, entry.outfit, o);
  }
  // Variety in build: +-4% height, a touch of width.
  if (opts.seed != null || opts.randomize) { const h = 0.96 + r() * 0.08; object.scale.set(h * (0.97 + r() * 0.06), h, h); }

  const mixer = new THREE.AnimationMixer(object);
  const clips = [];
  for (const a of [].concat(opts.anims || [])) {
    const g = await gltfOf(a);
    if (g) clips.push(...g.animations);
  }
  const own = (await gltfOf(name));
  if (own && own.animations) clips.push(...own.animations);
  const bones = {};
  object.traverse((n) => { if (n.isBone) bones[n.name] = n; });
  const actions = {};
  for (const c of clips) if (!actions[c.name]) actions[c.name] = mixer.clipAction(c);
  let current = null, loopName = null;
  const p = {
    object, mixer, actions, clips, bones,
    get current() { return current ? current.getClip().name : null; },
    play(clip, o2) {
      o2 = o2 || {};
      const a = actions[clip];
      if (!a) { warnOnce(name + clip, name + ': no clip ' + clip); return null; }
      const fade = o2.fade != null ? o2.fade : 0.25;
      a.enabled = true;
      a.setEffectiveTimeScale(o2.timeScale != null ? o2.timeScale : 1);
      a.setEffectiveWeight(1);
      const once = !!o2.once || o2.loop === false;
      if (once) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; } else { a.setLoop(THREE.LoopRepeat, Infinity); loopName = clip; }
      if (current === a && !once && !o2.restart) return a;
      a.reset();
      if (current && current !== a && fade > 0) { a.play(); current.crossFadeTo(a, fade, false); } else { if (current && current !== a) current.stop(); a.play(); }
      current = a;
      return a;
    },
    oneShot(clip, o2) {
      o2 = o2 || {};
      const back = o2.then || loopName;
      const a = p.play(clip, { fade: o2.fade, timeScale: o2.timeScale, once: true });
      if (!a) return null;
      const done = (ev) => { if (ev.action !== a) return; mixer.removeEventListener('finished', done); if (back) p.play(back, { fade: o2.fade != null ? o2.fade : 0.25 }); };
      mixer.addEventListener('finished', done);
      return a;
    },
    setTimeScale(s) { if (current) current.setEffectiveTimeScale(s); },
    update(dt) { mixer.update(dt); },
    setColors(c) { recolor(object, c); },
    dispose() { mixer.stopAllAction(); mixer.uncacheRoot(object); object.removeFromParent(); },
  };
  if (opts.play) p.play(opts.play, { fade: 0 });
  return p;
}
// Outfits for the base bodies: a mask painted in the body's UV space (see
// assets-build.mjs) says where a top, bottoms and shoes go; the shader colours
// those regions and keeps the texture's shading. Every outfit shares one program.
const maskCache = new Map();
const OUTFIT_FRAG = [
  '#ifdef USE_MAP',
  '  vec3 om = texture2D(uOutfitMask, vMapUv).rgb;',
  '  float cT = smoothstep(uOutfitCut.x - 0.12, uOutfitCut.x + 0.12, om.r);',
  '  float cB = smoothstep(uOutfitCut.y - 0.12, uOutfitCut.y + 0.12, om.g);',
  '  float cS = smoothstep(0.6, 0.9, om.b);',
  '  float lumO = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));',
  '  float shadeO = mix(1.0, clamp(lumO / 0.45, 0.72, 1.08), 0.45);',
  '  vec3 cloth = (uOutfitTop * cT + uOutfitBottom * cB * (1.0 - cT) + uOutfitShoes * cS * (1.0 - cT) * (1.0 - cB)) * shadeO;',
  '  float covO = clamp(cT + cB + cS, 0.0, 1.0);',
  '  diffuseColor.rgb = mix(diffuseColor.rgb, cloth, covO);',
  '#endif',
].join('\n');
async function dress(object, maskUrl, o) {
  let mp = maskCache.get(maskUrl);
  if (!mp) {
    mp = texLoader.loadAsync(maskUrl).then((t) => { t.flipY = false; t.colorSpace = THREE.NoColorSpace; t.needsUpdate = true; return t; });
    maskCache.set(maskUrl, mp);
  }
  let mask;
  try { mask = await mp; } catch (e) { warnOnce(maskUrl, 'outfit mask failed: ' + e.message); return; }
  const col = (c, d) => new THREE.Color(c || d);
  object.traverse((m) => {
    if (!m.isMesh || !m.material || !m.material.map || !/superhero|body/i.test(m.material.name)) return;
    const mat = m.material.clone();
    mat.userData = Object.assign({}, m.material.userData);
    const u = {
      uOutfitMask: { value: mask },
      uOutfitTop: { value: col(o.top, '#2b3a55') }, uOutfitBottom: { value: col(o.bottom, '#23262d') }, uOutfitShoes: { value: col(o.shoes, '#2a2a2e') },
      uOutfitCut: { value: new THREE.Vector2(o.sleeves === 'long' ? 0.25 : 0.75, o.legs === 'long' ? 0.25 : 0.75) },
    };
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.fragmentShader = 'uniform sampler2D uOutfitMask; uniform vec3 uOutfitTop; uniform vec3 uOutfitBottom; uniform vec3 uOutfitShoes; uniform vec2 uOutfitCut;\n'
        + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + OUTFIT_FRAG);
    };
    mat.customProgramCacheKey = () => 'assets-outfit';
    mat.userData.outfit = u;
    m.material = mat;
  });
}
// The base bodies' texture is painted at about #e0ab86; tint relative to that.
function skinTint(hex) {
  const c = new THREE.Color(hex), base = new THREE.Color('#e0ab86');
  return '#' + new THREE.Color(Math.min(1, c.r / base.r), Math.min(1, c.g / base.g), Math.min(1, c.b / base.b)).getHexString();
}
function stubPerson(object) {
  const noop = () => null;
  return { object, mixer: null, actions: {}, clips: [], bones: {}, current: null, play: noop, oneShot: noop, setTimeScale: noop, update: noop, setColors: noop, dispose() { object.removeFromParent(); }, fallback: true };
}

/* ------------------------------------------------------------------ environment and textures */
const envCache = new Map();
/**
 * Light a scene with a CC0 HDRI: 'day', 'golden', 'dusk', 'overcast-city', 'night'.
 * Sets scene.environment (and scene.background when background: true). Returns
 * the PMREM texture, or null if it could not load (the scene's own lights still work).
 */
export async function environment(renderer, scene, name, o) {
  o = o || {};
  try {
    const cat = await catalog();
    const h = cat.hdri[name || 'day'];
    if (!h) throw new Error('no HDRI ' + name);
    let p = envCache.get(h.file);
    if (!p) {
      p = new HDRLoader().loadAsync(h.file).then((tex) => {
        tex.mapping = THREE.EquirectangularReflectionMapping;
        const pm = new THREE.PMREMGenerator(renderer);
        const rt = pm.fromEquirectangular(tex);
        pm.dispose();
        return { env: rt.texture, raw: tex };
      });
      envCache.set(h.file, p);
    }
    const r = await p;
    if (scene) {
      scene.environment = r.env;
      if ('environmentIntensity' in scene && o.intensity != null) scene.environmentIntensity = o.intensity;
      if (o.background) { scene.background = r.raw; if (o.blur != null) scene.backgroundBlurriness = o.blur; if (o.intensity != null && 'backgroundIntensity' in scene) scene.backgroundIntensity = o.intensity; }
    }
    return r.env;
  } catch (e) {
    warnOnce('env' + name, 'environment ' + name + ': ' + e.message);
    return null;
  }
}

const texLoader = new THREE.TextureLoader();
const texCache = new Map();
function tex(url, srgb, o) {
  const k = url + '|' + srgb + '|' + (o.repeat || [1, 1]).join('x');
  let t = texCache.get(k);
  if (!t) {
    t = texLoader.loadAsync(url).then((x) => {
      x.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      x.wrapS = x.wrapT = THREE.RepeatWrapping;
      x.repeat.set(...(o.repeat || [1, 1]));
      if (o.renderer) x.anisotropy = Math.min(8, o.renderer.capabilities.getMaxAnisotropy());
      return x;
    });
    texCache.set(k, t);
  }
  return t;
}
/** The texture set of a CC0 material: { map, normalMap, ormMap } (loaded), or null. */
export async function textures(name, o) {
  o = o || {};
  try {
    const t = (await catalog()).textures[name];
    if (!t) throw new Error('no texture ' + name);
    const [map, normalMap, ormMap] = await Promise.all([tex(t.color, true, o), t.normal && o.quality !== 0 ? tex(t.normal, false, o) : null, t.orm ? tex(t.orm, false, o) : null]);
    return { map, normalMap, ormMap };
  } catch (e) { warnOnce('tex' + name, 'texture ' + name + ': ' + e.message); return null; }
}
/**
 * A MeshStandardMaterial from a CC0 texture set (asphalt, grass, concrete, dirt,
 * fabric, paving, bricks). Options: repeat [u, v], renderer (for anisotropy),
 * color (tint), normalScale, quality (0 drops the normal map). Never throws:
 * on failure returns a plain material in opts.color.
 */
export async function material(name, o) {
  o = o || {};
  const t = await textures(name, o);
  const m = new THREE.MeshStandardMaterial({ color: o.color || 0xffffff, roughness: 1, metalness: 0 });
  if (!t) { if (!o.color) m.color.set('#8a8278'); return m; }
  m.map = t.map;
  if (t.normalMap) { m.normalMap = t.normalMap; m.normalScale.set(o.normalScale || 1, o.normalScale || 1); }
  if (t.ormMap) { m.roughnessMap = t.ormMap; m.aoMap = t.ormMap; m.aoMapIntensity = o.ao != null ? o.ao : 0.8; }
  return m;
}

/** A THREE.LOD with the full model and its simplified .lod1 (if the catalog has one). */
export async function lod(name, o) {
  o = o || {};
  const L = new THREE.LOD();
  const base = await load(name, o);
  if (!base) return o.fallback ? o.fallback() : null;
  L.addLevel(base, 0);
  const e = info(name);
  if (e && e.lod && e.lod[0]) {
    try {
      const g = await fetchFile(e.lod[0].file);
      const c = g.scene.clone(true);
      prepare(c, o);
      L.addLevel(c, o.far || 25);
    } catch (err) { warnOnce('lod' + name, name + ' lod1: ' + err.message); }
  }
  L.userData.asset = name;
  return L;
}

/**
 * Many copies of one static model as InstancedMesh (one per part of the model,
 * transforms composed). Returns { object, count, set(i, x, y, z, rotY, scale),
 * setMatrix(i, m), commit() } or null. Call commit() after changing transforms.
 */
export async function instanced(name, max, o) {
  o = o || {};
  const src = await load(name, o);
  if (!src) return null;
  src.updateMatrixWorld(true);
  const parts = [];
  src.traverse((m) => { if (m.isMesh && !m.isSkinnedMesh) parts.push(m); });
  const object = new THREE.Group();
  object.name = name + ' x' + max;
  const ims = parts.map((m) => {
    const im = new THREE.InstancedMesh(m.geometry, m.material, max);
    im.castShadow = m.castShadow; im.receiveShadow = m.receiveShadow; im.count = 0;
    im.userData.local = m.matrixWorld.clone();
    object.add(im);
    return im;
  });
  const tmp = new THREE.Matrix4(), out = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const api = {
    object, max,
    get count() { return ims.length ? ims[0].count : 0; },
    set count(n) { for (const im of ims) im.count = Math.min(n, max); },
    setMatrix(i, m) { for (const im of ims) { out.multiplyMatrices(m, im.userData.local); im.setMatrixAt(i, out); } if (i >= api.count) api.count = i + 1; },
    set(i, x, y, z, rotY, scale) { q.setFromAxisAngle(UP, rotY || 0); tmp.compose(p.set(x, y, z), q, s.setScalar(scale || 1)); api.setMatrix(i, tmp); },
    commit() { for (const im of ims) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); } },
  };
  return api;
}

export const version = 1;
