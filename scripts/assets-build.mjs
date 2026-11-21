// Build the shared 3D asset library: games/assets/**.glb, textures, HDRIs,
// games/assets/catalog.json and games/assets/CREDITS.md, from the packs listed
// in scripts/assets-sources.mjs (downloaded by scripts/assets-fetch.mjs).
//
//   node scripts/assets-fetch.mjs     # once: originals into the cache
//   node scripts/assets-build.mjs     # rebuild games/assets/ (about two minutes)
//
// The output is committed, so neither script runs in `npm run build`. The tools
// are NOT site dependencies; install them once anywhere and point at them:
//   npm i --prefix /some/dir @gltf-transform/core@4 @gltf-transform/functions@4 \
//     @gltf-transform/extensions@4 meshoptimizer sharp obj2gltf fbx2gltf
//   ASSETS_TOOLS=/some/dir node scripts/assets-build.mjs
//
// What happens to every model:
//  1. FBX and OBJ are converted to glTF (FBX2glTF, obj2gltf); a .gltf whose
//     image paths do not match the download layout is repaired by file name.
//  2. prune, dedup, weld; animations resampled (redundant keys dropped) and
//     renamed without the exporter's "Armature|" prefix.
//  3. Textures resized (1024 max, 2048 for hero items) and converted to WebP
//     (EXT_texture_webp, decoded by the browser's own image decoder).
//  4. Geometry quantized (KHR_mesh_quantization): plain typed arrays that
//     three.js reads directly. Nothing here needs a WebAssembly decoder, so the
//     site's CSP (script-src 'self' 'unsafe-inline', no wasm-unsafe-eval) holds.
//  5. A model over LOD_MIN triangles that is not skinned also gets
//     <name>.lod1.glb, simplified to about a quarter of the triangles.
//  6. A modular kit is merged into ONE file, each piece a named root node, so
//     shared textures are stored once; the loader picks a piece by name.
// Characters, animals and posed crowd figures are scaled to a real height.
import { readdir, readFile, writeFile, mkdir, rm, stat, copyFile } from 'node:fs/promises';
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname, basename, extname, relative } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { PACKS } from './assets-sources.mjs';
import { CACHE } from './assets-fetch.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const OUT = join(ROOT, 'games/assets');
const URL_BASE = '/games/assets';
const MAX_FILE = 8 * 1024 * 1024;
const MAX_TOTAL = 120 * 1024 * 1024;
const LOD_MIN = 3000;
const HEIGHTS = { character: 1.75, crowd: 1.75 };

const toolsReq = createRequire(process.env.ASSETS_TOOLS ? join(process.env.ASSETS_TOOLS, 'package.json') : import.meta.url);
const imp = async (name) => import(pathToFileURL(toolsReq.resolve(name)).href);
let T;
async function tools() {
  if (T) return T;
  try {
    const core = await imp('@gltf-transform/core');
    const ext = await imp('@gltf-transform/extensions');
    const fn = await imp('@gltf-transform/functions');
    const { MeshoptSimplifier } = await imp('meshoptimizer');
    const sharp = (await imp('sharp')).default;
    const obj2gltf = (await imp('obj2gltf')).default;
    const fbx2gltf = join(dirname(toolsReq.resolve('fbx2gltf/package.json')), 'bin', process.platform === 'darwin' ? 'Darwin' : process.platform === 'win32' ? 'Windows_NT' : 'Linux', process.platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF');
    await MeshoptSimplifier.ready;
    const io = new core.NodeIO().registerExtensions(ext.ALL_EXTENSIONS).setLogger(new core.Logger(core.Logger.Verbosity.WARN));
    T = { core, ext, fn, MeshoptSimplifier, sharp, obj2gltf, fbx2gltf, io };
    return T;
  } catch (e) {
    console.error('[assets-build] missing tools: ' + e.message + '\nSee the header of scripts/assets-build.mjs (ASSETS_TOOLS).');
    process.exit(1);
  }
}

// ---------------------------------------------------------------- files
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}
function globRe(pattern) {
  let re = '', i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*' && pattern[i + 1] === '*') { re += '.*'; i += 2; if (pattern[i] === '/') i++; continue; }
    if (c === '*') re += '[^/]*';
    else if (c === '{') re += '(?:';
    else if (c === '}') re += ')';
    else if (c === ',') re += '|';
    else re += c.replace(/[.+?^$()|[\]\\@]/g, '\\$&');
    i++;
  }
  return new RegExp('^' + re + '$');
}
const slug = (s) => s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/[\s_.]+/g, '-').replace(/[^A-Za-z0-9-]/g, '').replace(/-+/g, '-').toLowerCase();
const stem = (f) => basename(f, extname(f));

// ---------------------------------------------------------------- conversion
async function convert(file, packKey) {
  const ext = extname(file).toLowerCase();
  if (ext === '.glb' || ext === '.gltf') return file;
  const { obj2gltf, fbx2gltf } = await tools();
  const out = join(CACHE, '_conv', packKey, relative(join(CACHE, packKey), file).replace(/[^\w.-]+/g, '_') + '.glb');
  if (existsSync(out) && statSync(out).mtimeMs >= statSync(file).mtimeMs) return out;
  await mkdir(dirname(out), { recursive: true });
  if (ext === '.obj') {
    await writeFile(out, await obj2gltf(file, { binary: true, secure: true }));
  } else if (ext === '.fbx') {
    execFileSync(fbx2gltf, ['--binary', '--input', file, '--output', out.replace(/\.glb$/, '')], { stdio: 'pipe' });
  } else throw new Error('cannot convert ' + file);
  return out;
}

// Read a .gltf whose image or buffer paths may not match the files on disk:
// some exporters write "T_Eye_Normal_png.png" for "T_Eye_Normal.png", or point
// at a sibling Textures folder. Each missing file is found by name in the pack,
// preferring the copy nearest the .gltf and never a "Unity"/"Unreal" normal map
// variant (those use the DirectX green channel; glTF wants OpenGL).
async function readDoc(file, packDir) {
  const { io } = await tools();
  if (extname(file).toLowerCase() === '.glb') return io.read(file);
  const json = JSON.parse(await readFile(file, 'utf8'));
  const resources = {};
  const all = walk(packDir);
  const find = (uri) => {
    const want = decodeURIComponent(uri);
    const direct = join(dirname(file), want);
    if (existsSync(direct)) return direct;
    const names = [basename(want), basename(want).replace(/_png\.png$/i, '.png').replace(/_jpg\.jpg$/i, '.jpg')];
    const hits = all.filter((p) => names.includes(basename(p)) && !/unity|unreal/i.test(relative(packDir, p)));
    hits.sort((a, b) => relative(dirname(file), a).length - relative(dirname(file), b).length);
    if (!hits.length) throw new Error(`${basename(file)}: missing ${uri}`);
    return hits[0];
  };
  for (const b of json.buffers || []) if (b.uri && !b.uri.startsWith('data:')) resources[b.uri] = new Uint8Array(await readFile(find(b.uri)));
  for (const im of json.images || []) if (im.uri && !im.uri.startsWith('data:')) resources[im.uri] = new Uint8Array(await readFile(find(im.uri)));
  return io.readJSON({ json, resources });
}

// ---------------------------------------------------------------- processing
const ANIM_PREFIX = /^[^|]*\|/;
function countTris(doc) {
  let t = 0;
  for (const m of doc.getRoot().listMeshes()) for (const p of m.listPrimitives()) {
    if (p.getMode() !== 4) continue;
    const i = p.getIndices();
    t += (i ? i.getCount() : p.getAttribute('POSITION').getCount()) / 3;
  }
  return Math.round(t);
}
function wrapScene(doc, name, scale) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const wrap = doc.createNode(name);
  for (const c of scene.listChildren()) { scene.removeChild(c); wrap.addChild(c); }
  if (scale && scale !== 1) wrap.setScale([scale, scale, scale]);
  scene.addChild(wrap);
  return wrap;
}
// Bounds of the model as it renders in its bind pose. glTF ignores a skinned
// mesh's own node transform and places each vertex by its joints
// (jointWorld x inverseBind), so a plain node-transform bounds is wrong for
// rigs, especially after quantization. Measured before quantizing.
function mul4(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s;
  }
  return o;
}
function xf(m, v) { return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13], m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]; }
function renderedBounds(doc) {
  const root = doc.getRoot();
  const scene = root.getDefaultScene() || root.listScenes()[0];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  const add = (p) => { for (let i = 0; i < 3; i++) { if (p[i] < min[i]) min[i] = p[i]; if (p[i] > max[i]) max[i] = p[i]; } };
  scene.traverse((node) => {
    const mesh = node.getMesh(); if (!mesh) return;
    const skin = node.getSkin();
    let mats = null;
    if (skin) {
      const ibm = skin.getInverseBindMatrices();
      mats = skin.listJoints().map((j, i) => mul4(j.getWorldMatrix(), ibm ? ibm.getElement(i, new Array(16)) : [1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]));
    }
    const world = node.getWorldMatrix();
    for (const p of mesh.listPrimitives()) {
      const pos = p.getAttribute('POSITION'); if (!pos) continue;
      const J = p.getAttribute('JOINTS_0'), W = p.getAttribute('WEIGHTS_0');
      const v = [0, 0, 0], jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
      for (let i = 0; i < pos.getCount(); i++) {
        pos.getElement(i, v);
        if (mats && J && W) {
          J.getElement(i, jj); W.getElement(i, ww);
          const o = [0, 0, 0]; let tw = 0;
          for (let k = 0; k < 4; k++) { if (!ww[k]) continue; const q = xf(mats[jj[k]], v); o[0] += q[0] * ww[k]; o[1] += q[1] * ww[k]; o[2] += q[2] * ww[k]; tw += ww[k]; }
          add(tw ? o.map((x) => x / tw) : v);
        } else add(xf(world, v));
      }
    }
  });
  return Number.isFinite(min[0]) ? { min, max } : null;
}

// FBX and OBJ converters turn Phong specular into metalness ~0.4 and a glossy
// roughness; the source packs are matte low-poly paint. Untextured materials
// from a converted file get metal 0 and roughness 0.8.
function fixConvertedMaterials(doc) {
  for (const m of doc.getRoot().listMaterials()) {
    if (m.getMetallicRoughnessTexture()) continue;
    m.setMetallicFactor(0);
    m.setRoughnessFactor(Math.max(0.8, m.getRoughnessFactor()));
  }
}
async function applyTexture(doc, file) {
  const t = doc.createTexture(basename(file)).setImage(new Uint8Array(await readFile(file))).setMimeType(extname(file).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg');
  for (const m of doc.getRoot().listMaterials()) { m.setBaseColorTexture(t); m.setBaseColorFactor([1, 1, 1, 1]); }
}

async function process1(doc, sel, opts = {}) {
  const { fn, sharp, core } = T;
  const root = doc.getRoot();
  for (const m of root.listMaterials()) { const to = sel.renameMaterials && sel.renameMaterials[m.getName()]; if (to) m.setName(to); }
  if (sel.dropVertexColors) for (const m of root.listMeshes()) for (const p of m.listPrimitives()) p.setAttribute('COLOR_0', null);
  if (sel.anims === 'only') {
    for (const n of root.listNodes()) { n.setMesh(null); n.setSkin(null); }
    for (const s of root.listSkins()) s.dispose();
    for (const m of root.listMeshes()) m.dispose();
    for (const m of root.listMaterials()) m.dispose();
    for (const t of root.listTextures()) t.dispose();
  }
  if (sel.anims === 'strip') for (const a of root.listAnimations()) a.dispose();
  for (const a of root.listAnimations()) a.setName(a.getName().replace(ANIM_PREFIX, ''));
  // FBX2glTF names the scene root after the file; give every model a clean,
  // predictable root and a real-world scale where the category has one.
  await doc.transform(fn.dedup(), fn.prune({ keepLeaves: sel.anims === 'only' }));
  if (sel.anims !== 'only') await doc.transform(fn.weld());
  const tris = countTris(doc);
  if (sel.maxTris && tris > sel.maxTris) {
    await doc.transform(fn.simplify({ simplifier: T.MeshoptSimplifier, ratio: sel.maxTris / tris, error: 0.01 }));
  }
  if (root.listAnimations().length) await doc.transform(fn.resample({ tolerance: 1e-4 }));
  const texMax = sel.hero ? 2048 : 1024;
  if (root.listTextures().length) {
    await doc.transform(fn.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texMax, texMax], quality: 82, slots: /^(?!normalTexture).*/ }));
    await doc.transform(fn.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [texMax, texMax], quality: 90, slots: /^normalTexture$/ }));
  }
  if (root.listMeshes().length) await doc.transform(fn.quantize({ quantizeNormal: 10, quantizeTexcoord: 14, quantizePosition: 14 }));
  await doc.transform(fn.prune(), fn.unpartition());
  return doc;
}

async function lodOf(doc) {
  const { fn, MeshoptSimplifier, sharp } = T;
  const lod = fn.cloneDocument(doc).setLogger(new T.core.Logger(T.core.Logger.Verbosity.WARN));
  await lod.transform(fn.dequantize(), fn.weld(), fn.simplify({ simplifier: MeshoptSimplifier, ratio: 0.25, error: 0.02, lockBorder: false }));
  if (lod.getRoot().listTextures().length) await lod.transform(fn.textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 80 }));
  await lod.transform(fn.quantize({ quantizeNormal: 10, quantizeTexcoord: 14, quantizePosition: 14 }), fn.prune(), fn.unpartition());
  return lod;
}

function info(doc, size) {
  const root = doc.getRoot();
  return {
    tris: countTris(doc),
    skinned: root.listSkins().length > 0,
    anims: root.listAnimations().map((a) => a.getName()),
    materials: [...new Set(root.listMaterials().map((m) => m.getName()).filter(Boolean))],
    size,
  };
}

// Apply a category's real-world height (the wrapper node carries the scale, so
// skinned rigs and their animations keep their own units). Animation-only files
// get a wrapper but no scale.
function normaliseScale(doc, sel, name) {
  const b = renderedBounds(doc);
  const ext = b ? b.max.map((v, i) => v - b.min[i]) : null;
  let scale = 1;
  const want = sel.sizes && sel.sizes[name];
  if (sel.scale === false) scale = 1;
  else if (typeof sel.scale === 'number') scale = sel.scale;
  else if (sel._fixedScale) scale = sel._fixedScale;
  else if (ext && want) scale = want / Math.max(ext[0], ext[2], ext[1]);
  else if (ext && HEIGHTS[sel.category] && sel.anims !== 'only' && ext[1] > 1e-6) scale = HEIGHTS[sel.category] / ext[1];
  wrapScene(doc, name, scale);
  return ext ? ext.map((v) => +(v * scale).toFixed(3)) : null;
}

// ---------------------------------------------------------------- outfit masks
// The base bodies are one painted texture (skin and underwear). To dress them
// without new models, paint a mask in the body's own UV space from its skin
// weights: each triangle is labelled by the bone that moves it most.
//   R: 1 = torso and upper arms (a short-sleeved top), 0.5 = forearms (long sleeves)
//   G: 1 = hips and thighs (shorts), 0.5 = shins (long trousers)
//   B: 1 = feet (shoes)
// assets.js colours those regions in the shader (one program for every outfit).
const OUTFIT_BONES = [
  [/^(spine_0[123]|clavicle_[lr]|upperarm_[lr])$/, 0, 255],
  [/^lowerarm_[lr]$/, 0, 128],
  [/^(pelvis|thigh_[lr])$/, 1, 255],
  [/^calf_[lr]$/, 1, 128],
  [/^(foot_[lr]|ball_[lr]|ball_leaf_[lr])$/, 2, 255],
];
async function outfitMask(doc, materialRe, size = 512) {
  const W = size, H = size, px = new Uint8Array(W * H * 3);
  let done = 0;
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh(), skin = node.getSkin();
    if (!mesh || !skin) continue;
    const names = skin.listJoints().map((j) => j.getName());
    for (const prim of mesh.listPrimitives()) {
      if (!materialRe.test(prim.getMaterial()?.getName() || '')) continue;
      const uv = prim.getAttribute('TEXCOORD_0'), J = prim.getAttribute('JOINTS_0'), Wt = prim.getAttribute('WEIGHTS_0');
      const idx = prim.getIndices();
      if (!uv || !J || !Wt || !idx) continue;
      const label = new Array(uv.getCount());
      const jj = [0, 0, 0, 0], ww = [0, 0, 0, 0];
      for (let i = 0; i < uv.getCount(); i++) {
        J.getElement(i, jj); Wt.getElement(i, ww);
        let best = 0; for (let k = 1; k < 4; k++) if (ww[k] > ww[best]) best = k;
        const bone = names[jj[best]] || '';
        label[i] = OUTFIT_BONES.find((b) => b[0].test(bone)) || null;
      }
      const t = [0, 0];
      for (let f = 0; f < idx.getCount(); f += 3) {
        const v = [idx.getScalar(f), idx.getScalar(f + 1), idx.getScalar(f + 2)];
        const ls = v.map((i) => label[i]);
        const l = ls[0] && (ls[0] === ls[1] || ls[0] === ls[2]) ? ls[0] : ls[1] && ls[1] === ls[2] ? ls[1] : null;
        if (!l) continue;
        const P = v.map((i) => { uv.getElement(i, t); return [t[0] * W, t[1] * H]; });
        const minX = Math.max(0, Math.floor(Math.min(P[0][0], P[1][0], P[2][0])) - 1), maxX = Math.min(W - 1, Math.ceil(Math.max(P[0][0], P[1][0], P[2][0])) + 1);
        const minY = Math.max(0, Math.floor(Math.min(P[0][1], P[1][1], P[2][1])) - 1), maxY = Math.min(H - 1, Math.ceil(Math.max(P[0][1], P[1][1], P[2][1])) + 1);
        const d = (P[1][1] - P[2][1]) * (P[0][0] - P[2][0]) + (P[2][0] - P[1][0]) * (P[0][1] - P[2][1]);
        if (Math.abs(d) < 1e-9) continue;
        for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
          const cx = x + 0.5, cy = y + 0.5;
          const a = ((P[1][1] - P[2][1]) * (cx - P[2][0]) + (P[2][0] - P[1][0]) * (cy - P[2][1])) / d;
          const b = ((P[2][1] - P[0][1]) * (cx - P[2][0]) + (P[0][0] - P[2][0]) * (cy - P[2][1])) / d;
          const e = -0.6 / W; // half a pixel of overlap closes the seams between triangles
          if (a < e || b < e || 1 - a - b < e) continue;
          px[(y * W + x) * 3 + l[1]] = Math.max(px[(y * W + x) * 3 + l[1]], l[2]);
        }
        done++;
      }
    }
  }
  // Fill holes inside an island (a navel, a stray unlabelled triangle): any
  // unpainted pixel the image border cannot reach takes its neighbours' label.
  const seen = new Uint8Array(W * H), stack = [];
  const empty = (i) => !px[i * 3] && !px[i * 3 + 1] && !px[i * 3 + 2];
  for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
  for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop();
    if (seen[i] || !empty(i)) continue;
    seen[i] = 1;
    const x = i % W, y = (i / W) | 0;
    if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
  }
  for (let round = 0; round < 64; round++) {
    let left = 0;
    for (let i = 0; i < W * H; i++) {
      if (seen[i] || !empty(i)) continue;
      const nb = [i - 1, i + 1, i - W, i + W].find((n) => n >= 0 && n < W * H && !empty(n));
      if (nb == null) { left++; continue; }
      for (let c = 0; c < 3; c++) px[i * 3 + c] = px[nb * 3 + c];
    }
    if (!left) break;
  }
  // Grow every painted island by 3 px so filtering at UV seams never shows skin.
  for (let pass = 0; pass < 3; pass++) {
    const src = px.slice();
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) for (let c = 0; c < 3; c++) {
      const o = (y * W + x) * 3 + c;
      if (src[o] || src[o - 3] + src[o + 3] + src[o - W * 3] + src[o + W * 3] === 0) continue;
      px[o] = Math.max(src[o - 3], src[o + 3], src[o - W * 3], src[o + W * 3]);
    }
  }
  return done ? px : null;
}

// ---------------------------------------------------------------- textures and HDRIs
async function buildTexture(pack, t) {
  const { sharp } = await tools();
  const dir = join(CACHE, pack.key, t.id);
  const pick = (k) => walk(dir).find((p) => p.includes(`_${k}.`));
  const outDir = join(OUT, pack.key, t.name);
  await mkdir(outDir, { recursive: true });
  const files = {};
  const col = pick('Color'), nor = pick('NormalGL'), rough = pick('Roughness'), ao = pick('AmbientOcclusion');
  await sharp(col).resize(1024, 1024, { fit: 'inside' }).webp({ quality: 82 }).toFile(join(outDir, 'color.webp'));
  files.color = `${URL_BASE}/${pack.key}/${t.name}/color.webp`;
  if (nor) { await sharp(nor).resize(1024, 1024, { fit: 'inside' }).webp({ quality: 90 }).toFile(join(outDir, 'normal.webp')); files.normal = `${URL_BASE}/${pack.key}/${t.name}/normal.webp`; }
  if (rough) {
    // ORM, the glTF channel order: R = ambient occlusion, G = roughness, B = metalness (0).
    const g = await sharp(rough).resize(1024, 1024, { fit: 'inside' }).greyscale().raw().toBuffer({ resolveWithObject: true });
    const r = ao ? await sharp(ao).resize(g.info.width, g.info.height, { fit: 'fill' }).greyscale().raw().toBuffer() : Buffer.alloc(g.data.length, 255);
    const px = Buffer.alloc(g.info.width * g.info.height * 3);
    for (let i = 0; i < g.info.width * g.info.height; i++) { px[i * 3] = r[i]; px[i * 3 + 1] = g.data[i]; px[i * 3 + 2] = 0; }
    await sharp(px, { raw: { width: g.info.width, height: g.info.height, channels: 3 } }).webp({ quality: 90 }).toFile(join(outDir, 'orm.webp'));
    files.orm = `${URL_BASE}/${pack.key}/${t.name}/orm.webp`;
  }
  let bytes = 0;
  for (const f of await readdir(outDir)) bytes += (await stat(join(outDir, f))).size;
  return { files, bytes };
}

// ---------------------------------------------------------------- main
async function main() {
  await tools();
  const only = process.argv.slice(2);
  if (!only.length) await rm(OUT, { recursive: true, force: true });
  await mkdir(OUT, { recursive: true });
  const catPath = join(OUT, 'catalog.json');
  const catalog = only.length && existsSync(catPath) ? JSON.parse(await readFile(catPath, 'utf8')) : { packs: {}, assets: {}, textures: {}, hdri: {} };
  catalog.version = 1;
  catalog.about = 'Shared CC0 3D asset library for the games. Load through /games/shared/assets.js. Built by scripts/assets-build.mjs; credits in /games/assets/CREDITS.md.';
  for (const pack of PACKS) {
    if (only.length && !only.includes(pack.key)) continue;
    const packDir = join(CACHE, pack.key);
    if (!existsSync(packDir)) throw new Error(`pack ${pack.key} is not in the cache; run scripts/assets-fetch.mjs`);
    for (const [k, v] of Object.entries(catalog.assets)) if (v.pack === pack.key) delete catalog.assets[k];
    await rm(join(OUT, pack.key), { recursive: true, force: true });
    catalog.packs[pack.key] = { title: pack.title, author: pack.author, licence: pack.licence, source: pack.source };
    const meta = { pack: pack.key, licence: pack.licence, source: pack.source };
    console.log(`[assets-build] ${pack.key}`);

    for (const t of pack.textures || []) {
      const { files, bytes } = await buildTexture(pack, t);
      catalog.textures[t.name] = { ...files, tags: t.tags, bytes, ...meta };
    }
    for (const h of pack.hdri || []) {
      const dest = join(OUT, pack.key, `${h.name}.hdr`);
      await mkdir(dirname(dest), { recursive: true });
      await copyFile(join(packDir, `${h.id}_1k.hdr`), dest);
      catalog.hdri[h.name] = { file: `${URL_BASE}/${pack.key}/${h.name}.hdr`, tags: h.tags, bytes: (await stat(dest)).size, original: h.id, ...meta };
    }

    const files = walk(packDir).map((p) => relative(packDir, p));
    const taken = new Set();
    const kits = (pack.select || []).map((s) => s.kit).filter(Boolean);
    if (new Set(kits).size !== kits.length) throw new Error(`${pack.key}: a kit name is used by two selections; merge them into one glob`);
    for (const sel of pack.select || []) {
      const re = globRe(sel.from);
      const hits = files.filter((f) => re.test(f) && !(sel.exclude && sel.exclude.test(basename(f)))).filter((f) => sel.kit || sel.anims === 'only' || !taken.has(f)).sort();
      if (!hits.length) throw new Error(`${pack.key}: nothing matches ${sel.from}`);
      const items = hits.map((f) => ({ f, name: slug(sel.name ? sel.name(stem(f)) : stem(f)) }));
      // heightRef: one scale for the whole selection, taken from the reference
      // model, so attachments (hair) and different builds keep their proportions.
      if (sel.heightRef) {
        const ref = items.find((it) => sel.heightRef.test(it.name));
        if (!ref) throw new Error(`${pack.key}: heightRef ${sel.heightRef} matches nothing`);
        const d = await readDoc(await convert(join(packDir, ref.f), pack.key), packDir);
        const b = renderedBounds(d);
        sel._fixedScale = HEIGHTS[sel.category] / (b.max[1] - b.min[1]);
      }
      if (sel.kit) {
        // One file, every piece a named root node.
        const { fn, core } = T;
        const kitDoc = new core.Document().setLogger(new core.Logger(core.Logger.Verbosity.WARN));
        const scene = kitDoc.createScene('kit');
        kitDoc.getRoot().setDefaultScene(scene);
        const pieces = {};
        for (const it of items) {
          if (taken.has(it.f)) continue;
          taken.add(it.f);
          const csrc = await convert(join(packDir, it.f), pack.key);
          const d = await readDoc(csrc, packDir);
          if (csrc !== join(packDir, it.f)) fixConvertedMaterials(d);
          for (const a of d.getRoot().listAnimations()) a.dispose();
          const sz = normaliseScale(d, sel, it.name);
          const pi = info(d, sz);
          const map = fn.mergeDocuments(kitDoc, d);
          for (const s of d.getRoot().listScenes()) {
            const ts = map.get(s);
            for (const c of ts.listChildren()) { ts.removeChild(c); scene.addChild(c); }
            ts.dispose();
          }
          pieces[it.name] = pi;
        }
        await process1(kitDoc, sel);
        const rel = `${pack.key}/${slug(sel.kit)}.glb`;
        await mkdir(join(OUT, pack.key), { recursive: true });
        await T.io.write(join(OUT, rel), kitDoc);
        const bytes = (await stat(join(OUT, rel))).size;
        const kitName = `${pack.key}/${slug(sel.kit)}`;
        catalog.assets[kitName] = { file: `${URL_BASE}/${rel}`, category: sel.category, tags: [...sel.tags, 'kit'], kit: true, pieces: Object.keys(pieces), tris: countTris(kitDoc), bytes, ...meta };
        for (const [n, pi] of Object.entries(pieces)) {
          catalog.assets[`${pack.key}/${n}`] = { file: `${URL_BASE}/${rel}`, node: n, category: sel.category, tags: sel.tags, tris: pi.tris, size: pi.size, ...meta };
        }
        console.log(`  kit ${kitName}: ${Object.keys(pieces).length} pieces, ${(bytes / 1024).toFixed(0)} KB`);
        continue;
      }
      for (const it of items) {
        taken.add(it.f);
        const src = await convert(join(packDir, it.f), pack.key);
        const doc = await readDoc(src, packDir);
        if (src !== join(packDir, it.f)) fixConvertedMaterials(doc);
        if (sel.texture) await applyTexture(doc, join(packDir, sel.texture(stem(it.f))));
        let outfit = null;
        if (sel.outfit) {
          const px = await outfitMask(doc, sel.outfit);
          if (px) {
            await mkdir(join(OUT, pack.key), { recursive: true });
            await T.sharp(Buffer.from(px), { raw: { width: 512, height: 512, channels: 3 } }).webp({ lossless: true }).toFile(join(OUT, pack.key, `${it.name}.outfit.webp`));
            outfit = `${URL_BASE}/${pack.key}/${it.name}.outfit.webp`;
          }
        }
        const sz = normaliseScale(doc, sel, it.name);
        await process1(doc, sel);
        const rel = `${pack.key}/${it.name}.glb`;
        await mkdir(join(OUT, pack.key), { recursive: true });
        await T.io.write(join(OUT, rel), doc);
        const i = info(doc, sz);
        const entry = { file: `${URL_BASE}/${rel}`, category: sel.category, tags: sel.tags, ...i, bytes: (await stat(join(OUT, rel))).size, ...meta };
        if (outfit) entry.outfit = outfit;
        if (!entry.anims.length) delete entry.anims;
        if (!entry.skinned) delete entry.skinned;
        if (sel.anims === 'only') { delete entry.size; delete entry.materials; delete entry.tris; }
        if (!i.skinned && i.tris >= LOD_MIN && sel.anims !== 'only') {
          const lod = await lodOf(doc);
          const lrel = `${pack.key}/${it.name}.lod1.glb`;
          await T.io.write(join(OUT, lrel), lod);
          entry.lod = [{ file: `${URL_BASE}/${lrel}`, tris: countTris(lod), bytes: (await stat(join(OUT, lrel))).size }];
        }
        catalog.assets[`${pack.key}/${it.name}`] = entry;
      }
      console.log(`  ${sel.from}: ${items.length} file(s)`);
    }
  }

  // Sorted keys, so a rebuild only changes what changed.
  const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
  for (const k of ['packs', 'assets', 'textures', 'hdri']) catalog[k] = sortObj(catalog[k]);
  // One entry per line: small to download, and a rebuild diffs line by line.
  const lines = ['{'];
  const top = Object.keys(catalog);
  top.forEach((k, ti) => {
    const v = catalog[k];
    const end = ti < top.length - 1 ? ',' : '';
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const keys = Object.keys(v);
      lines.push(` ${JSON.stringify(k)}: {`);
      keys.forEach((n, i) => lines.push(`  ${JSON.stringify(n)}: ${JSON.stringify(v[n])}${i < keys.length - 1 ? ',' : ''}`));
      lines.push(` }${end}`);
    } else lines.push(` ${JSON.stringify(k)}: ${JSON.stringify(v)}${end}`);
  });
  lines.push('}');
  await writeFile(catPath, lines.join('\n') + '\n');
  await writeFile(join(OUT, 'CREDITS.md'), credits());

  // Budget checks.
  let total = 0; const big = [];
  for (const f of walk(OUT)) { const s = statSync(f).size; total += s; if (s > MAX_FILE) big.push(`${relative(OUT, f)} ${(s / 1048576).toFixed(1)} MB`); }
  const cats = {};
  for (const a of Object.values(catalog.assets)) if (!a.node) cats[a.category] = (cats[a.category] || 0) + 1;
  console.log(`[assets-build] ${Object.keys(catalog.assets).length} assets (${JSON.stringify(cats)} files), ${Object.keys(catalog.textures).length} textures, ${Object.keys(catalog.hdri).length} HDRIs, ${(total / 1048576).toFixed(1)} MB total`);
  if (big.length) { console.error('[assets-build] over the 8 MB per-file limit:\n  ' + big.join('\n  ')); process.exitCode = 1; }
  if (total > MAX_TOTAL) { console.error(`[assets-build] library is ${(total / 1048576).toFixed(1)} MB, over the 120 MB budget`); process.exitCode = 1; }
}

function credits() {
  const lines = ['# Credits for the shared 3D asset library', '',
    'Every model, texture and HDRI in this folder is released under CC0 1.0 (public domain dedication).',
    'No attribution is required; it is given here anyway, with thanks. The licence of each pack was read on',
    'its own page and in the download itself; both are recorded below. Files were converted and optimised',
    '(WebP textures, quantized geometry, simplified LODs) by scripts/assets-build.mjs.', ''];
  for (const p of PACKS) {
    lines.push(`## ${p.title}`, '', `- Author: ${p.author}`, `- Licence: CC0 1.0 Universal (https://creativecommons.org/publicdomain/zero/1.0/)`, `- Source: ${p.source}`);
    for (const s of p.sources || []) if (s !== p.source) lines.push(`- Source: ${s}`);
    for (const s of p.licenceSeen) lines.push(`- Licence checked: ${s}`);
    lines.push(`- Folder: games/assets/${p.key}/`, '');
  }
  return lines.join('\n');
}

await main();
