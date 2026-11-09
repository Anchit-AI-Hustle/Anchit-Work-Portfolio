import * as THREE from '/games/vendor/three/three.module.min.js';

/*
 * Chhat Hopper in 3D: the same game as game.js (which it loads for the rules),
 * drawn as a 2.5D world. A side camera follows the hero across rooftops with
 * water tanks and laundry lines at dusk, a monsoon forest in the rain, and a
 * night bazaar under string lights. Tiles become chunky lit blocks, and every
 * hero, enemy and prop is modelled from primitives with procedural textures.
 *
 * The frame is rendered to an HDR target, then a post pass of our own adds
 * bloom, a colour grade, vignette, film grain and the classic iris wipe.
 */

function loadCore() {
  return new Promise((res, rej) => {
    if (window.ChhatCore) { res(); return; }
    window.__CHHAT_CORE_ONLY = true;
    const s = document.createElement('script');
    s.src = '/games/chhat-hopper/game.js';
    s.onload = () => res(); s.onerror = () => rej(new Error('core'));
    document.head.appendChild(s);
  });
}
await loadCore();
const C = window.ChhatCore;
const { TAU, H, clamp, lerp, smooth01, hash, rng, KEY, T_GROUND, T_BRICK, T_Q, T_USED, T_PLANK, T_STONE, tileAt, THEMES } = C;

/* ------------------------------------------------------------ geometry helpers */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _c = new THREE.Color();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// Bake a primitive in place with one vertex colour, so a model merges into one mesh.
function prep(geo, hex, pos, rot, scl, keepUV) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (!keepUV && g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  if (scl == null) _s3.set(1, 1, 1); else if (typeof scl === 'number') _s3.set(scl, scl, scl); else _s3.set(scl[0], scl[1], scl[2]);
  _p3.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  _m4.compose(_p3, _q, _s3); g.applyMatrix4(_m4);
  const n = g.attributes.position.count, col = new Float32Array(n * 3);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function mergeG(list, withUV) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = withUV ? new Float32Array(n * 2) : null;
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    if (uv && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (uv) out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
const boxG = (w, h, d, hex, pos, rot) => prep(new THREE.BoxGeometry(w, h, d), hex, pos, rot);
const cylG = (rt, rb, h, seg, hex, pos, rot, scl) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), hex, pos, rot, scl);
const sphG = (r, hex, pos, scl, ws, hs) => prep(new THREE.SphereGeometry(r, ws || 12, hs || 9), hex, pos, null, scl);
const capG = (r, len, hex, pos, rot, scl) => prep(new THREE.CapsuleGeometry(r, len, 4, 10), hex, pos, rot, scl);
const coneG = (r, h, seg, hex, pos, rot, scl) => prep(new THREE.ConeGeometry(r, h, seg), hex, pos, rot, scl);
function limbG(a, b, r, hex, cap) {
  _v1.set(a[0], a[1], a[2]); _v2.set(b[0], b[1], b[2]);
  const len = _v1.distanceTo(_v2);
  const g0 = cap ? new THREE.CapsuleGeometry(r, Math.max(0.01, len), 4, 8) : new THREE.CylinderGeometry(r, r, len, 8);
  const g = g0.index ? g0.toNonIndexed() : g0; if (g !== g0) g0.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  _v3.subVectors(_v2, _v1).normalize(); _q.setFromUnitVectors(_up, _v3);
  _p3.addVectors(_v1, _v2).multiplyScalar(0.5);
  _m4.compose(_p3, _q, _s3.set(1, 1, 1)); g.applyMatrix4(_m4);
  return prep(g, hex);
}

// World-space boxes for terrain: a face list with uvs that tile across neighbours.
const F_FRONT = 1, F_BACK = 2, F_TOP = 4, F_BOT = 8, F_LEFT = 16, F_RIGHT = 32;
function Acc() { return { p: [], n: [], u: [], c: [] }; }
function quad(A, a, b, c, d, nx, ny, nz, ua, ub, uc, ud, col) {
  const P = A.p, N = A.n, U = A.u, Cc = A.c;
  [a, b, c, a, c, d].forEach((v) => { P.push(v[0], v[1], v[2]); N.push(nx, ny, nz); Cc.push(col.r, col.g, col.b); });
  [ua, ub, uc, ua, uc, ud].forEach((t) => { U.push(t[0], t[1]); });
}
function boxFaces(A, x0, y0, z0, x1, y1, z1, col, faces, s) {
  s = s || 0.5;
  if (faces & F_FRONT) quad(A, [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], 0, 0, 1, [x0 * s, y0 * s], [x1 * s, y0 * s], [x1 * s, y1 * s], [x0 * s, y1 * s], col);
  if (faces & F_TOP) quad(A, [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], 0, 1, 0, [x0 * s, z1 * s], [x1 * s, z1 * s], [x1 * s, z0 * s], [x0 * s, z0 * s], col);
  if (faces & F_LEFT) quad(A, [x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], -1, 0, 0, [z0 * s, y0 * s], [z1 * s, y0 * s], [z1 * s, y1 * s], [z0 * s, y1 * s], col);
  if (faces & F_RIGHT) quad(A, [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], 1, 0, 0, [-z1 * s, y0 * s], [-z0 * s, y0 * s], [-z0 * s, y1 * s], [-z1 * s, y1 * s], col);
  if (faces & F_BACK) quad(A, [x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], 0, 0, -1, [-x1 * s, y0 * s], [-x0 * s, y0 * s], [-x0 * s, y1 * s], [-x1 * s, y1 * s], col);
  if (faces & F_BOT) quad(A, [x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], 0, -1, 0, [x0 * s, z0 * s], [x1 * s, z0 * s], [x1 * s, z1 * s], [x0 * s, z1 * s], col);
}
// darken the lower parts of walls: alleys and banks fall into shade
function shadeLow(A, y0, y1, lo) {
  for (let i = 0, n = A.p.length / 3; i < n; i++) {
    const y = A.p[i * 3 + 1], k = clamp((y - y0) / (y1 - y0), 0, 1), f = lo + (1 - lo) * k * k * (3 - 2 * k);
    A.c[i * 3] *= f; A.c[i * 3 + 1] *= f; A.c[i * 3 + 2] *= f;
  }
}
function accGeo(A) {
  if (!A.p.length) return null;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(A.p, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(A.n, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(A.u, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(A.c, 3));
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}

/* ------------------------------------------------------------ procedural textures */
let TEX_ANISO = 4;
const ALL_TEX = [];
function canvasTex(w, h, draw, o) {
  o = o || {};
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = o.data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = TEX_ANISO; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  if (o.repeat) t.repeat.set(o.repeat[0], o.repeat[1]);
  ALL_TEX.push(t);
  return t;
}
function noiseFill(g, w, h, base, amp, n, seed, size) {
  const r = rng(seed || 7);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) {
    const v = (r() - 0.5) * amp, s = (size || 2) * (0.5 + r());
    g.fillStyle = v > 0 ? 'rgba(255,255,255,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')';
    g.fillRect(r() * w, r() * h, s, s);
  }
}
function vnoise(seed, cells) {
  const r = rng(seed), Gd = new Float32Array(cells * cells); for (let i = 0; i < Gd.length; i++) Gd[i] = r();
  return (u, v) => {
    const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const g = (i, j) => Gd[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), sx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy);
  };
}
// a normal map from a height canvas (the painted texture's own light and dark)
function normalFrom(src, strength) {
  const w = src.width, h = src.height, sg = src.getContext('2d'), d = sg.getImageData(0, 0, w, h).data;
  const L = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) L[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.59 + d[i * 4 + 2] * 0.11) / 255;
  return canvasTex(w, h, (g) => {
    const im = g.createImageData(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const l = L[y * w + ((x - 1 + w) % w)], r = L[y * w + ((x + 1) % w)], u = L[((y - 1 + h) % h) * w + x], dd = L[((y + 1) % h) * w + x];
      let nx = (l - r) * strength, ny = (u - dd) * strength, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
      const o = (y * w + x) * 4; im.data[o] = (nx * 0.5 + 0.5) * 255; im.data[o + 1] = (ny * 0.5 + 0.5) * 255; im.data[o + 2] = (nz * 0.5 + 0.5) * 255; im.data[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, { data: true });
}
function texPair(w, h, draw, strength, o) {
  let cv = null;
  const map = canvasTex(w, h, (g, W, Hh) => { draw(g, W, Hh); cv = g.canvas; }, o);
  const nor = normalFrom(cv, strength || 3);
  return { map, nor, canvas: cv };
}

let TX = null;
function textures() {
  if (TX) return TX;
  TX = {};
  // Old city plaster with windows, 4 tiles wide and 2 tiles tall per repeat (u = x / 2, v = y / 2 in the uv space).
  const facadeDraw = (g, w, h, lit) => {
    const r = rng(lit ? 5 : 3);
    if (!lit) {
      noiseFill(g, w, h, '#e9e1d4', 0.12, 9000, 3, 2);
      for (let i = 0; i < 70; i++) { const x = r() * w, len = 40 + r() * 200; const gr = g.createLinearGradient(0, h - (x % h), 0, h - (x % h) - len); g.fillStyle = 'rgba(70,55,40,' + (0.04 + r() * 0.08) + ')'; g.fillRect(x, r() * h, 3 + r() * 8, len); }
      g.fillStyle = 'rgba(0,0,0,0.12)'; g.fillRect(0, h * 0.5 - 6, w, 10);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, h * 0.5 - 8, w, 3);
    } else { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    for (let i = 0; i < 4; i++) {
      const cx = (i + 0.5) * w / 4, top = h * 0.12, wh = h * 0.3, ww = w * 0.1;
      const on = i === 1 || i === 3;
      if (!lit) {
        g.fillStyle = '#c9b9a2'; g.fillRect(cx - ww / 2 - 8, top - 8, ww + 16, wh + 16);
        g.fillStyle = '#2d3443'; g.beginPath(); g.moveTo(cx - ww / 2, top + wh); g.lineTo(cx - ww / 2, top + ww / 2); g.arc(cx, top + ww / 2, ww / 2, Math.PI, 0); g.lineTo(cx + ww / 2, top + wh); g.closePath(); g.fill();
        if (on) { g.fillStyle = '#ffcf8a'; g.beginPath(); g.moveTo(cx - ww / 2 + 6, top + wh - 4); g.lineTo(cx - ww / 2 + 6, top + ww / 2 + 2); g.arc(cx, top + ww / 2 + 2, ww / 2 - 6, Math.PI, 0); g.lineTo(cx + ww / 2 - 6, top + wh - 4); g.closePath(); g.fill(); }
        g.fillStyle = ['#3e8f86', '#2f6fa8', '#8f5a3e', '#4f7f3a'][i]; g.fillRect(cx - ww / 2 - 30, top + 6, 24, wh - 10); g.fillRect(cx + ww / 2 + 6, top + 6, 24, wh - 10);
        g.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 8; k++) { g.fillRect(cx - ww / 2 - 30, top + 12 + k * (wh - 18) / 8, 24, 2); g.fillRect(cx + ww / 2 + 6, top + 12 + k * (wh - 18) / 8, 24, 2); }
        g.fillStyle = '#9a8a76'; g.fillRect(cx - ww / 2 - 14, top + wh + 6, ww + 28, 10);
        if (i === 2) { g.fillStyle = '#d8d8d4'; g.fillRect(cx - 40, h * 0.62, 80, 46); g.fillStyle = '#aaa'; for (let k = 0; k < 6; k++) g.fillRect(cx - 34 + k * 12, h * 0.64, 6, 36); }
        if (i === 0) { g.strokeStyle = '#3a3a3a'; g.lineWidth = 3; g.strokeRect(cx - ww / 2 - 18, top + wh + 16, ww + 36, 40); for (let k = 0; k < 7; k++) { g.beginPath(); g.moveTo(cx - ww / 2 - 18 + k * (ww + 36) / 6, top + wh + 16); g.lineTo(cx - ww / 2 - 18 + k * (ww + 36) / 6, top + wh + 56); g.stroke(); } }
      } else if (on) {
        g.fillStyle = '#ffb36a'; g.beginPath(); g.moveTo(cx - ww / 2 + 6, top + wh - 4); g.lineTo(cx - ww / 2 + 6, top + ww / 2 + 2); g.arc(cx, top + ww / 2 + 2, ww / 2 - 6, Math.PI, 0); g.lineTo(cx + ww / 2 - 6, top + wh - 4); g.closePath(); g.fill();
      }
    }
  };
  const fac = texPair(1024, 512, (g, w, h) => facadeDraw(g, w, h, false), 2.5);
  TX.facade = fac.map; TX.facadeN = fac.nor;
  TX.facade.repeat.set(0.25, 0.5); TX.facadeN.repeat.set(0.25, 0.5);
  TX.facadeE = canvasTex(1024, 512, (g, w, h) => facadeDraw(g, w, h, true)); TX.facadeE.repeat.set(0.25, 0.5);
  const conc = texPair(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#b9b1a4', 0.14, 6000, 11, 2);
    const r = rng(12);
    for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(60,50,40,' + (0.05 + r() * 0.08) + ')'; g.beginPath(); g.arc(r() * w, r() * h, 10 + r() * 40, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(50,40,30,0.35)'; g.lineWidth = 1;
    for (let i = 0; i < 6; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 8; k++) { x += (r() - 0.5) * 30; y += r() * 20; g.lineTo(x, y); } g.stroke(); }
    g.strokeStyle = 'rgba(0,0,0,0.12)'; g.lineWidth = 2; g.strokeRect(0, 0, w, h);
  }, 2);
  TX.conc = conc.map; TX.concN = conc.nor;
  // monsoon earth and moss
  const earth = texPair(512, 512, (g, w, h) => {
    const r = rng(22);
    const bands = ['#5e4230', '#6b4a33', '#574030', '#71523a', '#4f3a2c', '#654634'];
    for (let i = 0; i < 8; i++) { g.fillStyle = bands[i % bands.length]; g.beginPath(); g.moveTo(0, i * h / 8); for (let x = 0; x <= w; x += 32) g.lineTo(x, i * h / 8 + Math.sin(x * 0.02 + i) * 8); g.lineTo(w, h); g.lineTo(0, h); g.closePath(); g.fill(); }
    for (let i = 0; i < 6000; i++) { const v = (r() - 0.5) * 0.2; g.fillStyle = v > 0 ? 'rgba(255,240,220,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
    for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h, rx = 10 + r() * 26, ry = 7 + r() * 16; const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.4, 1, x, y, rx); gr.addColorStop(0, '#a89a88'); gr.addColorStop(1, '#5a5048'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rx, ry, r() * 3, 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(36,22,12,0.55)'; g.lineCap = 'round';
    for (let i = 0; i < 4; i++) { g.lineWidth = 3 + r() * 4; g.beginPath(); let x = r() * w, y = 0; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += h / 14; g.lineTo(x, y); } g.stroke(); }
  }, 3);
  TX.earth = earth.map; TX.earthN = earth.nor; TX.earth.repeat.set(0.5, 0.5); TX.earthN.repeat.set(0.5, 0.5);
  const moss = texPair(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#4e8a36', 0.22, 9000, 31, 2);
    const r = rng(32);
    for (let i = 0; i < 900; i++) { g.strokeStyle = 'rgba(' + (60 + r() * 80 | 0) + ',' + (120 + r() * 80 | 0) + ',' + (40 + r() * 30 | 0) + ',0.8)'; g.lineWidth = 1.2; const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y - 4 - r() * 6); g.stroke(); }
  }, 2);
  TX.moss = moss.map; TX.mossN = moss.nor;
  // night bazaar sandstone with lamp niches, and pavers
  const sand = texPair(512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#a8645a', 0.16, 9000, 41, 2);
    const r = rng(42);
    g.strokeStyle = 'rgba(40,15,10,0.55)'; g.lineWidth = 3;
    for (let y = 0; y < h; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); const off = (y / 64) % 2 ? 64 : 0; for (let x = off; x < w; x += 128) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + 64); g.stroke(); } }
    for (let i = 0; i < 2; i++) {
      const cx = w * (0.25 + i * 0.5), cy = h * 0.42;
      g.fillStyle = '#4a1e1a'; g.beginPath(); g.moveTo(cx - 34, cy + 60); g.lineTo(cx - 34, cy); g.arc(cx, cy, 34, Math.PI, 0); g.lineTo(cx + 34, cy + 60); g.closePath(); g.fill();
      g.strokeStyle = '#e8b878'; g.lineWidth = 4; g.stroke();
    }
    for (let i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,220,180,' + r() * 0.08 + ')'; g.fillRect(r() * w, r() * h, 2, 2); }
  }, 2.6);
  TX.sand = sand.map; TX.sandN = sand.nor;
  TX.sandE = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2; i++) { const cx = w * (0.25 + i * 0.5), cy = h * 0.47; const gr = g.createRadialGradient(cx, cy, 2, cx, cy, 40); gr.addColorStop(0, '#fff2c0'); gr.addColorStop(0.3, '#ff9a3a'); gr.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = gr; g.fillRect(cx - 40, cy - 40, 80, 80); }
  });
  const pave = texPair(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#8c7c6a', 0.2, 5000, 51, 2);
    g.strokeStyle = 'rgba(30,22,18,0.6)'; g.lineWidth = 3;
    for (let y = 0; y < h; y += 64) for (let x = (y / 64) % 2 ? 32 : 0; x < w + 64; x += 64) g.strokeRect(x, y, 64, 64);
  }, 2.4);
  TX.pave = pave.map; TX.paveN = pave.nor;
  // attic: brick wall and floorboards
  const brickW = texPair(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#4a2e22', 0.1, 2000, 61, 2);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) { g.fillStyle = 'hsl(' + (12 + hash(x * 7 + y) * 10) + ',45%,' + (30 + hash(x + y * 3) * 10) + '%)'; g.fillRect(x + 3, y + 3, 58, 26); }
  }, 3);
  TX.brickW = brickW.map; TX.brickWN = brickW.nor;
  const floor = texPair(256, 256, (g, w, h) => {
    for (let y = 0; y < h; y += 32) { g.fillStyle = 'hsl(28,40%,' + (28 + hash(y) * 10) + '%)'; g.fillRect(0, y, w, 32); g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, y, w, 2); }
    const r = rng(62); for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(0,0,0,' + r() * 0.12 + ')'; g.fillRect(r() * w, r() * h, 20 + r() * 40, 1); }
  }, 2);
  TX.floor = floor.map; TX.floorN = floor.nor;
  // blocks
  const stone = texPair(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#9c7a5c', 0.26, 9000, 71, 2);
    const r = rng(72);
    for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(' + (r() < 0.5 ? '40,25,15' : '230,200,160') + ',' + (0.05 + r() * 0.08) + ')'; g.beginPath(); g.ellipse(r() * w, r() * h, 10 + r() * 40, 6 + r() * 20, r() * 3, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,236,200,0.45)'; g.fillRect(0, 0, w, 10); g.fillRect(0, 0, 10, h);
    g.fillStyle = 'rgba(40,24,12,0.55)'; g.fillRect(0, h - 12, w, 12); g.fillRect(w - 12, 0, 12, h);
    g.strokeStyle = 'rgba(50,30,15,0.55)'; g.lineWidth = 4; g.strokeRect(30, 30, w - 60, h - 60);
    g.strokeStyle = 'rgba(255,230,190,0.3)'; g.lineWidth = 2; g.strokeRect(33, 33, w - 66, h - 66);
    g.fillStyle = 'rgba(50,30,15,0.5)'; g.beginPath(); g.arc(w / 2, h / 2, 26, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,230,190,0.35)'; g.lineWidth = 3; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; g.beginPath(); g.moveTo(w / 2 + Math.cos(a) * 30, h / 2 + Math.sin(a) * 30); g.lineTo(w / 2 + Math.cos(a) * 52, h / 2 + Math.sin(a) * 52); g.stroke(); }
    g.strokeStyle = 'rgba(30,18,10,0.6)'; g.lineWidth = 1.5; for (let i = 0; i < 4; i++) { g.beginPath(); let x = r() * w, y = r() * h; g.moveTo(x, y); for (let k = 0; k < 5; k++) { x += (r() - 0.5) * 30; y += (r() - 0.5) * 30; g.lineTo(x, y); } g.stroke(); }
  }, 4);
  TX.stone = stone.map; TX.stoneN = stone.nor;
  const brick = texPair(128, 128, (g, w, h) => {
    g.fillStyle = '#5a2a1a'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 32) for (let x = (y / 32) % 2 ? -32 : 0; x < w; x += 64) { g.fillStyle = 'hsl(' + (14 + hash(x * 3 + y) * 8) + ',62%,' + (40 + hash(x + y * 7) * 12) + '%)'; g.fillRect(x + 3, y + 3, 58, 26); g.fillStyle = 'rgba(255,220,180,0.18)'; g.fillRect(x + 3, y + 3, 58, 4); }
  }, 3.5);
  TX.brick = brick.map; TX.brickN = brick.nor;
  const qb = (glow) => (g, w, h) => {
    if (glow) { g.fillStyle = '#000'; g.fillRect(0, 0, w, h); }
    else {
      const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#ffd56a'); gr.addColorStop(0.5, '#e09a22'); gr.addColorStop(1, '#b86a10'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(110,50,0,0.7)'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#7a3e08'; [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 5, 0, TAU); g.fill(); });
    }
    g.font = '900 86px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (!glow) { g.fillStyle = 'rgba(90,40,0,0.55)'; g.fillText('?', w / 2 + 3, h / 2 + 7); }
    g.fillStyle = glow ? '#ffe9a8' : '#fff4d0'; g.fillText('?', w / 2, h / 2 + 4);
  };
  const q = texPair(128, 128, qb(false), 2.5);
  TX.q = q.map; TX.qN = q.nor; TX.qE = canvasTex(128, 128, qb(true));
  const used = texPair(128, 128, (g, w, h) => { noiseFill(g, w, h, '#8a4a2a', 0.2, 2000, 81, 3); g.strokeStyle = 'rgba(40,15,5,0.6)'; g.lineWidth = 6; g.strokeRect(5, 5, w - 10, h - 10); }, 3);
  TX.used = used.map; TX.usedN = used.nor;
  TX.wood = canvasTex(256, 64, (g, w, h) => {
    noiseFill(g, w, h, '#8a5a32', 0.12, 1200, 91, 2);
    const r = rng(92); for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(50,25,10,' + (0.15 + r() * 0.2) + ')'; g.lineWidth = 1; g.beginPath(); const y = r() * h; g.moveTo(0, y); g.bezierCurveTo(w * 0.3, y + (r() - 0.5) * 8, w * 0.6, y + (r() - 0.5) * 8, w, y); g.stroke(); }
    g.fillStyle = 'rgba(0,0,0,0.3)'; for (let x = 0; x < w; x += 64) g.fillRect(x, 0, 2, h);
  });
  TX.stripe = canvasTex(256, 64, (g, w, h) => { const cols = ['#e83a5a', '#fff2e0', '#ff9a2a', '#fff2e0', '#2fb07a', '#fff2e0']; for (let i = 0; i < 8; i++) { g.fillStyle = cols[i % cols.length]; g.fillRect(i * w / 8, 0, w / 8, h); } g.fillStyle = 'rgba(0,0,0,0.15)'; g.fillRect(0, h - 8, w, 8); });
  TX.bark = canvasTex(128, 256, (g, w, h) => { noiseFill(g, w, h, '#4a3828', 0.2, 3000, 101, 2); const r = rng(102); for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(20,12,6,0.6)'; g.lineWidth = 2 + r() * 3; g.beginPath(); let x = r() * w; g.moveTo(x, 0); for (let y = 0; y < h; y += 16) { x += (r() - 0.5) * 6; g.lineTo(x, y); } g.stroke(); } for (let i = 0; i < 20; i++) { g.fillStyle = 'rgba(80,130,50,0.5)'; g.fillRect(r() * w, r() * h, 6 + r() * 10, 3 + r() * 6); } });
  TX.fiber = canvasTex(128, 128, (g, w, h) => { noiseFill(g, w, h, '#6b4426', 0.25, 1500, 111, 2); const r = rng(112); for (let i = 0; i < 160; i++) { g.strokeStyle = 'rgba(' + (40 + r() * 80 | 0) + ',' + (25 + r() * 40 | 0) + ',10,0.7)'; g.lineWidth = 1 + r() * 1.5; g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 30); g.stroke(); } });
  TX.fur = canvasTex(128, 128, (g, w, h) => { noiseFill(g, w, h, '#7a5030', 0.22, 2500, 121, 1.5); const r = rng(122); for (let i = 0; i < 500; i++) { g.strokeStyle = 'rgba(40,20,8,0.35)'; g.lineWidth = 1; g.beginPath(); const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 3, y + 5 + r() * 4); g.stroke(); } });
  TX.kite = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ff3d7a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffd23f'; g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w, h / 2); g.lineTo(w / 2, h / 2); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w / 2, h); g.lineTo(w / 2, h / 2); g.closePath(); g.fill();
    g.fillStyle = '#2fd0a0'; g.beginPath(); g.arc(w / 2, h / 2, 14, 0, TAU); g.fill();
    g.strokeStyle = '#fff'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4);
  });
  TX.rope = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#c9a66a'; g.fillRect(0, 0, w, h); g.strokeStyle = '#8a6a3a'; g.lineWidth = 3; for (let i = -64; i < 128; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, h); g.stroke(); g.beginPath(); g.moveTo(i + 64, 0); g.lineTo(i, h); g.stroke(); } });
  TX.fern = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let k = 0; k < 6; k++) {
      const a = -Math.PI / 2 + (k - 2.5) * 0.32; g.strokeStyle = 'hsl(' + (95 + k * 5) + ',55%,' + (30 + k * 4) + '%)'; g.lineWidth = 3;
      g.beginPath(); g.moveTo(w / 2, h); const ex = w / 2 + Math.cos(a) * h * 0.9, ey = h + Math.sin(a) * h * 0.9; g.quadraticCurveTo(w / 2 + Math.cos(a) * 30, h - 50, ex, ey); g.stroke();
      for (let i = 1; i < 10; i++) { const t = i / 10, x = lerp(w / 2, ex, t), y = lerp(h, ey, t); g.lineWidth = 4 * (1 - t) + 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 10 * (1 - t), y - 6); g.moveTo(x, y); g.lineTo(x + 10 * (1 - t), y - 6); g.stroke(); }
    }
  }, { clamp: true });
  TX.fall = canvasTex(64, 256, (g, w, h) => { const r = rng(131); g.fillStyle = 'rgba(200,230,240,0.55)'; g.fillRect(0, 0, w, h); for (let i = 0; i < 90; i++) { g.fillStyle = 'rgba(255,255,255,' + (0.2 + r() * 0.6) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 20 + r() * 60); } });
  TX.skyline = canvasTex(2048, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(141);
    g.fillStyle = '#fff';
    let x = 0;
    while (x < w) {
      const bw = 30 + r() * 90, bh = 40 + r() * 120, kind = r();
      g.fillRect(x, h - bh, bw, bh);
      if (kind < 0.18) { g.beginPath(); g.arc(x + bw / 2, h - bh, bw * 0.42, Math.PI, 0); g.fill(); g.fillRect(x + bw / 2 - 2, h - bh - bw * 0.42 - 14, 4, 16); }
      else if (kind < 0.28) { g.fillRect(x + bw / 2 - 6, h - bh - 70, 12, 70); g.beginPath(); g.arc(x + bw / 2, h - bh - 70, 9, Math.PI, 0); g.fill(); }
      else if (kind < 0.4) { g.fillRect(x + 6, h - bh - 18, 14, 18); g.fillRect(x + bw - 30, h - bh - 10, 22, 10); }
      x += bw + r() * 6;
    }
  }, { clamp: false });
  TX.treeline = canvasTex(2048, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const r = rng(151);
    g.fillStyle = '#fff';
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 16) g.lineTo(x, h * 0.55 - Math.sin(x / w * TAU * 3) * 30 - Math.sin(x / w * TAU * 7 + 1) * 14);
    g.lineTo(w, h); g.closePath(); g.fill();
    for (let i = 0; i < 160; i++) { const x = r() * w, y = h * 0.5 + r() * 40, rr = 14 + r() * 26; g.beginPath(); g.arc(x, y - rr * 0.6, rr, 0, TAU); g.fill(); if (r() < 0.25) { g.fillRect(x - 3, y - rr * 2.4, 6, rr * 2); g.beginPath(); g.arc(x, y - rr * 2.6, rr * 0.7, 0, TAU); g.fill(); } }
  });
  TX.dot = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.4, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { clamp: true });
  return TX;
}

/* ------------------------------------------------------------ materials */
const std = (o) => new THREE.MeshStandardMaterial(o);
let MAT = null;
function mats() {
  if (MAT) return MAT;
  const t = textures();
  MAT = {
    vc: std({ vertexColors: true, roughness: 0.75 }),
    vcFlat: std({ vertexColors: true, roughness: 0.9, flatShading: true }),
    vcGloss: std({ vertexColors: true, roughness: 0.35 }),
    glow: new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: true }),
    skin: std({ color: '#b97a52', roughness: 0.62 }),
    kurta: std({ color: '#2a86e0', roughness: 0.8 }),
    pajama: std({ color: '#efe3cb', roughness: 0.85 }),
    cap: std({ color: '#e8402a', roughness: 0.55 }),
    dark: std({ color: '#1a120e', roughness: 0.5 }),
    white: std({ color: '#ffffff', roughness: 0.3 }),
    gold: std({ color: '#ffcc55', roughness: 0.3, metalness: 0.8 }),
    sandal: std({ color: '#6b3a1f', roughness: 0.7 }),
    hair: std({ color: '#1d130e', roughness: 0.9 }),
    kite: std({ map: t.kite, roughness: 0.6, side: THREE.DoubleSide }),
    stick: std({ color: '#c8a46a', roughness: 0.7 }),
    stone: std({ map: t.stone, normalMap: t.stoneN, roughness: 0.85 }),
    brick: std({ map: t.brick, normalMap: t.brickN, roughness: 0.8 }),
    qblock: std({ map: t.q, normalMap: t.qN, emissiveMap: t.qE, emissive: new THREE.Color('#ffb23a'), emissiveIntensity: 0.6, roughness: 0.32, metalness: 0.65 }),
    used: std({ map: t.used, normalMap: t.usedN, roughness: 0.9 }),
    wood: std({ map: t.wood, roughness: 0.75 }),
    stripe: std({ map: t.stripe, roughness: 0.8, side: THREE.DoubleSide }),
    bark: std({ map: t.bark, roughness: 0.95 }),
    fiber: std({ map: t.fiber, roughness: 0.95 }),
    fur: std({ map: t.fur, roughness: 0.95 }),
    jalebi: std({ color: '#ec7d16', emissive: new THREE.Color('#ff6a00'), emissiveIntensity: 0.28, roughness: 0.22, metalness: 0.05 }),
    rope: std({ map: t.rope, roughness: 0.9, side: THREE.DoubleSide }),
    fern: std({ map: t.fern, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: '#9ac078' }),
    fall: new THREE.MeshBasicMaterial({ map: t.fall, transparent: true, opacity: 0.75, depthWrite: false, fog: true }),
    cloth: std({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }),
    bulb: new THREE.MeshBasicMaterial({ vertexColors: true }),
    flame: new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 2.6, 1.1) })
  };
  MAT.bulb.color.setScalar(3.2);
  return MAT;
}
const cheapCache = new Map();
function cheapOf(m) {
  if (!m.isMeshStandardMaterial) return m;
  let c = cheapCache.get(m);
  if (!c) {
    c = new THREE.MeshLambertMaterial({ color: m.color.clone(), map: m.map, vertexColors: m.vertexColors, emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaTest: m.alphaTest, flatShading: m.flatShading });
    c.userData.full = m; cheapCache.set(m, c);
  }
  return c;
}
const fullOf = (m) => (m.userData && m.userData.full ? m.userData.full : m);

/* ------------------------------------------------------------ looks per world */
const LOOK = {
  roof: { skyTop: '#27427e', skyMid: '#d9805a', skyHor: '#ffc68c', fog: '#e9a47c', fogD: 0.0052, sun: '#ffc48a', sunI: 3.1, sunAz: 0.7, sunEl: 0.3, hemiSky: '#a7b6e0', hemiGnd: '#6a4836', hemiI: 0.85, exposure: 1.0, cloud: 0.55, night: 0, bloom: 0.55, thresh: 0.95, grade: [1.04, 1.0, 0.94], sat: 1.08, vig: 0.32 },
  forest: { skyTop: '#3f5a56', skyMid: '#7f9a8e', skyHor: '#c4d1c2', fog: '#a3b6a8', fogD: 0.02, sun: '#e9f2dc', sunI: 1.5, sunAz: -0.3, sunEl: 0.95, hemiSky: '#cfe2d4', hemiGnd: '#3b4a2c', hemiI: 1.35, exposure: 1.06, cloud: 0.95, night: 0, bloom: 0.45, thresh: 1.0, grade: [0.96, 1.02, 1.0], sat: 1.05, vig: 0.36, rain: 1 },
  bazaar: { skyTop: '#04051a', skyMid: '#15123a', skyHor: '#4a2650', fog: '#2a1838', fogD: 0.013, sun: '#9fb2ff', sunI: 0.7, sunAz: -0.6, sunEl: 0.75, hemiSky: '#6a5ab0', hemiGnd: '#2a1a22', hemiI: 0.7, exposure: 1.18, cloud: 0.25, night: 1, bloom: 1.15, thresh: 0.72, grade: [1.02, 0.96, 1.06], sat: 1.12, vig: 0.42 },
  room: { skyTop: '#1a120e', skyMid: '#1a120e', skyHor: '#2a1a12', fog: '#24160e', fogD: 0.03, sun: '#ffcf9a', sunI: 0.8, sunAz: 0.5, sunEl: 0.6, hemiSky: '#a58a6a', hemiGnd: '#2a1a10', hemiI: 0.55, exposure: 1.1, cloud: 0, night: 1, bloom: 0.9, thresh: 0.8, grade: [1.06, 0.98, 0.9], sat: 1.05, vig: 0.45 },
  map: { skyTop: '#22356a', skyMid: '#c87a6a', skyHor: '#ffd29a', fog: '#e0a88a', fogD: 0.006, sun: '#ffd0a0', sunI: 2.6, sunAz: 0.4, sunEl: 0.55, hemiSky: '#b0bde0', hemiGnd: '#5a4a3a', hemiI: 0.9, exposure: 1.0, cloud: 0.5, night: 0, bloom: 0.6, thresh: 0.95, grade: [1.03, 1.0, 0.96], sat: 1.1, vig: 0.34 }
};

/* ------------------------------------------------------------ sky */
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uFog; uniform vec3 uSunDir; uniform vec3 uSun; uniform float uCloud; uniform float uTime; uniform float uNight; uniform float uFlash;',
  'varying vec3 vDir;',
  'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }',
  'void main(){',
  '  vec3 d = normalize(vDir); float y = d.y;',
  '  vec3 c = mix(uHor, uMid, smoothstep(-0.02, 0.2, y));',
  '  c = mix(c, uTop, smoothstep(0.16, 0.8, y));',
  '  float sd = max(dot(d, normalize(uSunDir)), 0.0);',
  '  if (uNight > 0.5) { c += uSun * (smoothstep(0.9985, 0.9992, sd) * 1.8 + pow(sd, 60.0) * 0.25); vec2 sp = d.xz / max(0.08, y + 0.2) * 60.0; float st = step(0.996, h21(floor(sp))) * smoothstep(0.05, 0.4, y); c += vec3(st) * (0.6 + 0.4 * sin(uTime * 3.0 + h21(floor(sp)) * 40.0)); }',
  '  else c += uSun * (pow(sd, 900.0) * 7.0 + pow(sd, 18.0) * 0.4 + pow(sd, 3.0) * 0.14);',
  '  if (y > 0.0) {',
  '    vec2 uv = d.xz / (y + 0.12) * 0.7 + vec2(uTime * 0.008, uTime * 0.002);',
  '    float n = fbm(uv * 1.5);',
  '    float cl = smoothstep(0.62 - uCloud * 0.32, 0.98, n) * smoothstep(0.0, 0.2, y);',
  '    vec3 cc = mix(vec3(1.0, 0.96, 0.92), uSun, 0.5) * (0.55 + 0.8 * pow(sd, 4.0)) + uHor * 0.25;',
  '    if (uNight > 0.5) cc = uMid * 1.6 + uSun * 0.1;',
  '    c = mix(c, cc, cl * 0.8);',
  '  }',
  '  c += vec3(0.8, 0.85, 1.0) * uFlash * smoothstep(-0.1, 0.5, y);',
  '  c = mix(c, uFog, (1.0 - smoothstep(-0.03, 0.12, y)) * 0.8);',
  '  if (y < 0.0) c = mix(uFog, uFog * 0.7, smoothstep(0.0, -0.4, y));',
  '  gl_FragColor = vec4(c, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}'
].join('\n');

/* ------------------------------------------------------------ particles */
let FX = null;
function makePool(n, additive, square, streak) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  let fs;
  if (square) fs = 'if (abs(p.x) > 0.42 || abs(p.y) > 0.26) discard; float a = vA;';
  else if (streak) fs = 'if (abs(p.x) > 0.06) discard; float a = vA * (1.0 - abs(p.y) * 2.0);';
  else fs = 'float d = length(p); if (d > 0.5) discard; float a = vA * ' + (additive ? 'pow(1.0 - d * 2.0, 1.6)' : 'smoothstep(0.5, 0.12, d)') + ';';
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;' +
      'void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; ' + fs + ' gl_FragColor = vec4(vC, a); }',
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  return { n, pos, col, size, alpha, geo, mat, pts, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), s0: new Float32Array(n), grow: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n), a0: new Float32Array(n), spin: new Float32Array(n), head: 0 };
}
function createFX(scene) {
  const F = { add: makePool(900, true), soft: makePool(500, false), conf: makePool(500, false, true), rain: makePool(700, false, false, true), density: 1 };
  scene.add(F.add.pts, F.soft.pts, F.conf.pts, F.rain.pts);
  F.emit = (pool, x, y, z, vx, vy, vz, life, size, hex, alpha, grav, drag, grow) => {
    const P = F[pool]; const i = P.head; P.head = (P.head + 1) % P.n;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    _c.set(hex); P.col[i * 3] = _c.r; P.col[i * 3 + 1] = _c.g; P.col[i * 3 + 2] = _c.b;
    P.life[i] = life; P.max[i] = life; P.s0[i] = size; P.size[i] = size; P.a0[i] = alpha; P.alpha[i] = alpha;
    P.grav[i] = grav || 0; P.drag[i] = drag || 0; P.grow[i] = grow || 0; P.spin[i] = Math.random() * 6;
  };
  F.update = (dt, scale) => {
    ['add', 'soft', 'conf', 'rain'].forEach((k) => {
      const P = F[k]; P.mat.uniforms.uScale.value = scale;
      let any = false;
      for (let i = 0; i < P.n; i++) {
        if (P.life[i] <= 0) { if (P.alpha[i] !== 0) { P.alpha[i] = 0; any = true; } continue; }
        any = true;
        P.life[i] -= dt;
        const f = Math.max(0, P.life[i] / P.max[i]), dr = Math.exp(-P.drag[i] * dt);
        P.vel[i * 3] *= dr; P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * dr - P.grav[i] * dt; P.vel[i * 3 + 2] *= dr;
        if (k === 'conf') { P.spin[i] += dt * 9; P.vel[i * 3] += Math.sin(P.spin[i]) * dt * 2; }
        P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
        P.size[i] = P.s0[i] * (1 + P.grow[i] * (1 - f)) * (k === 'conf' ? 0.6 + 0.4 * Math.abs(Math.sin(P.spin[i])) : 1);
        P.alpha[i] = P.a0[i] * (k === 'add' ? f : k === 'rain' ? 1 : Math.min(1, f * 2.5));
      }
      if (any) { P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aColor.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; P.geo.attributes.aAlpha.needsUpdate = true; }
    });
  };
  F.clear = () => { ['add', 'soft', 'conf', 'rain'].forEach((k) => { F[k].life.fill(0); }); };
  return F;
}
const rnd = (a, b) => a + Math.random() * (b - a);
const CONF = ['#ff4d6d', '#ffd23f', '#3ad0ff', '#7dff8a', '#ff9a3a', '#c77dff', '#ffffff'];
function burst(pool, x, y, z, n, sp, up, cols, life, size, grav, drag) {
  if (!FX) return;
  n = Math.max(1, Math.round(n * FX.density));
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, b = Math.random() * Math.PI - Math.PI / 2, s = sp * (0.4 + Math.random() * 0.6);
    FX.emit(pool, x, y, z, Math.cos(a) * Math.cos(b) * s, Math.sin(b) * s * 0.6 + up, Math.sin(a) * Math.cos(b) * s * 0.6,
      life * (0.6 + Math.random() * 0.6), size * (0.7 + Math.random() * 0.6), Array.isArray(cols) ? cols[i % cols.length] : cols, 1, grav, drag, 0);
  }
}
function dust(x, y, z, n, col, sp) {
  if (!FX) return;
  n = Math.max(1, Math.round(n * FX.density));
  for (let i = 0; i < n; i++) FX.emit('soft', x + rnd(-0.3, 0.3), y + 0.05, z + rnd(-0.4, 0.4), rnd(-1, 1) * (sp || 1.5), rnd(0.2, 1.2), rnd(-0.6, 0.6), rnd(0.5, 0.9), rnd(0.35, 0.6), col || '#d8c6ae', 0.45, -0.4, 2.5, 2.2);
}
function firework(x, y) {
  if (!FX) return;
  const z = rnd(-8, -3), col = CONF[Math.floor(Math.random() * 5)], col2 = CONF[Math.floor(Math.random() * 6)];
  const n = Math.round(70 * FX.density);
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, b = Math.acos(2 * Math.random() - 1), s = rnd(4.5, 6.5);
    FX.emit('add', x, y, z, Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s * 0.5, rnd(1.0, 1.6), rnd(0.22, 0.34), i % 3 ? col : col2, 1, 2.2, 1.4, 0);
  }
  for (let i = 0; i < 8; i++) FX.emit('add', x, y, z, 0, 0, 0, 0.25, 2.4 + i * 0.2, '#ffffff', 0.5, 0, 0, 0);
  R.flash = Math.max(R.flash, 0.6);
}

/* ------------------------------------------------------------ models */
const HERO_H = 1.8;
function makeKite() {
  const M = mats(), g = new THREE.Group();
  const shape = new THREE.Shape(); shape.moveTo(0, 0.55); shape.lineTo(0.38, 0.05); shape.lineTo(0, -0.5); shape.lineTo(-0.38, 0.05); shape.closePath();
  const sg = new THREE.ShapeGeometry(shape);
  const uv = sg.attributes.uv; for (let i = 0; i < uv.count; i++) { const x = sg.attributes.position.getX(i), y = sg.attributes.position.getY(i); uv.setXY(i, x / 0.76 + 0.5, (y + 0.5) / 1.05); }
  const sail = new THREE.Mesh(sg, M.kite); sail.castShadow = true; g.add(sail);
  const sticks = new THREE.Mesh(mergeG([limbG([0, 0.55, 0.01], [0, -0.5, 0.01], 0.012, '#c8a46a'), limbG([-0.38, 0.05, 0.01], [0.38, 0.05, 0.01], 0.012, '#c8a46a')]), M.vc);
  g.add(sticks);
  const tailParts = [];
  for (let i = 0; i < 4; i++) tailParts.push(prep(new THREE.PlaneGeometry(0.1, 0.1), ['#ffd23f', '#2fd0a0', '#ff3d7a', '#ffffff'][i], [Math.sin(i * 1.4) * 0.05, -0.58 - i * 0.12, 0], [0, 0, i * 0.5]));
  const tail = new THREE.Mesh(mergeG(tailParts), M.cloth); g.add(tail);
  g.userData.tail = tail;
  return g;
}
function makeHero() {
  const M = mats(), root = new THREE.Group(), yaw = new THREE.Group(), body = new THREE.Group();
  root.add(yaw); yaw.add(body);
  const mesh = (geo, mat, parent, pos) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; if (pos) m.position.set(pos[0], pos[1], pos[2]); parent.add(m); return m; };
  const hips = new THREE.Group(); hips.position.y = 0.8; body.add(hips);
  const leg = (z) => {
    const hip = new THREE.Group(); hip.position.set(0, 0, z); hips.add(hip);
    mesh(new THREE.CapsuleGeometry(0.085, 0.26, 4, 8), M.pajama, hip, [0, -0.2, 0]);
    const knee = new THREE.Group(); knee.position.y = -0.4; hip.add(knee);
    mesh(new THREE.CapsuleGeometry(0.07, 0.24, 4, 8), M.pajama, knee, [0, -0.17, 0]);
    mesh(new THREE.BoxGeometry(0.22, 0.07, 0.11), M.sandal, knee, [0.05, -0.37, 0]);
    return { hip, knee };
  };
  const legF = leg(0.11), legB = leg(-0.11);
  const torso = new THREE.Group(); torso.position.y = 0.8; body.add(torso);
  mesh(new THREE.CylinderGeometry(0.2, 0.29, 0.8, 16), M.kurta, torso, [0, 0.2, 0]);
  mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 16), M.gold, torso, [0, 0.6, 0]).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.02, 0.26, 0.05), M.gold, torso, [0.205, 0.45, 0]).rotation.z = 0.12;
  mesh(new THREE.CylinderGeometry(0.075, 0.08, 0.1, 10), M.skin, torso, [0, 0.66, 0]);
  const head = new THREE.Group(); head.position.set(0.01, 0.9, 0); torso.add(head);
  mesh(new THREE.SphereGeometry(0.215, 20, 16), M.skin, head);
  mesh(new THREE.SphereGeometry(0.222, 16, 10, Math.PI * 0.5, Math.PI * 1.1, 0.5, 1.2), M.hair, head, [-0.01, 0, 0]);
  const eyeW = new THREE.SphereGeometry(0.048, 10, 8), pup = new THREE.SphereGeometry(0.027, 8, 6);
  const eyes = new THREE.Group(); head.add(eyes);
  [0.075, -0.075].forEach((z) => { mesh(eyeW, M.white, eyes, [0.172, 0.035, z]); mesh(pup, M.dark, eyes, [0.205, 0.035, z]); });
  [0.075, -0.075].forEach((z) => { const b = mesh(new THREE.BoxGeometry(0.02, 0.018, 0.075), M.hair, head, [0.195, 0.1, z]); b.rotation.x = z > 0 ? 0.15 : -0.15; });
  mesh(new THREE.SphereGeometry(0.032, 8, 6), M.skin, head, [0.215, -0.02, 0]);
  const mouth = mesh(new THREE.TorusGeometry(0.04, 0.009, 4, 10, Math.PI), M.dark, head, [0.19, -0.075, 0]); mouth.rotation.set(0, Math.PI / 2, Math.PI);
  [0.21, -0.21].forEach((z) => mesh(new THREE.SphereGeometry(0.045, 8, 6), M.skin, head, [0, 0, z]));
  const cap = new THREE.Group(); cap.position.set(0, 0.04, 0); cap.rotation.z = -0.08; head.add(cap);
  mesh(new THREE.SphereGeometry(0.228, 18, 10, 0, TAU, 0, Math.PI / 2), M.cap, cap);
  const brim = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.025, 18, 1, false, -Math.PI / 2, Math.PI), M.cap, cap, [0.16, 0.02, 0]); brim.scale.set(1.15, 1, 1.25);
  mesh(new THREE.SphereGeometry(0.03, 8, 6), M.white, cap, [0, 0.228, 0]);
  const arm = (z) => {
    const sh = new THREE.Group(); sh.position.set(0, 0.5, z); torso.add(sh);
    mesh(new THREE.CapsuleGeometry(0.07, 0.17, 4, 8), M.kurta, sh, [0, -0.13, 0]);
    const el = new THREE.Group(); el.position.y = -0.27; sh.add(el);
    mesh(new THREE.CapsuleGeometry(0.055, 0.14, 4, 8), M.skin, el, [0, -0.1, 0]);
    mesh(new THREE.SphereGeometry(0.065, 8, 6), M.skin, el, [0.01, -0.23, 0]);
    return { sh, el };
  };
  const armF = arm(0.27), armB = arm(-0.27);
  const kitePivot = new THREE.Group(); kitePivot.position.set(-0.24, 1.35, 0); body.add(kitePivot);
  const kite = makeKite(); kite.scale.setScalar(1.15); kitePivot.add(kite);
  const strings = new THREE.Mesh(mergeG([limbG([0, 0, 0], [0, 1, 0], 0.006, '#f2ead8')]), M.vc); strings.visible = false; body.add(strings);
  const strings2 = strings.clone(); body.add(strings2);
  const stars = new THREE.Group(); head.add(stars); stars.visible = false;
  const starGeo = new THREE.OctahedronGeometry(0.06);
  for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(starGeo, M.flame); stars.add(s); }
  const glow = new THREE.PointLight('#ffd27a', 0, 6, 2); glow.position.set(0, 1.1, 0.6); body.add(glow);
  return { root, yaw, body, hips, torso, head, eyes, cap, legF, legB, armF, armB, kitePivot, kite, strings, strings2, stars, glow, yawV: -0.45, sq: 1, scl: 0.52, blink: 3 };
}
function makeCoconut() {
  const M = mats(), root = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.41, 18, 14), M.fiber); ball.position.y = 0.41; ball.castShadow = true; root.add(ball); root.userData.s = 0.88;
  const tufts = new THREE.Mesh(mergeG([coneG(0.08, 0.16, 6, '#3a2412', [0, 0.42, 0]), coneG(0.06, 0.12, 6, '#3a2412', [0.08, 0.38, 0.05], [0, 0, -0.4])]), M.vcFlat); ball.add(tufts);
  const face = new THREE.Mesh(mergeG([
    sphG(0.1, '#fff8ee', [0.13, 0.5, 0.33], [1, 1.1, 0.6]), sphG(0.1, '#fff8ee', [-0.09, 0.5, 0.35], [1, 1.1, 0.6]),
    sphG(0.05, '#120a06', [0.16, 0.48, 0.39]), sphG(0.05, '#120a06', [-0.06, 0.48, 0.41]),
    boxG(0.16, 0.035, 0.04, '#1a0e08', [0.15, 0.62, 0.34], [0, 0, -0.35]), boxG(0.16, 0.035, 0.04, '#1a0e08', [-0.08, 0.62, 0.36], [0, 0, 0.35]),
    boxG(0.14, 0.03, 0.03, '#2a140a', [0.03, 0.33, 0.39], [0, 0, 0])
  ]), M.vcGloss);
  root.add(face);
  return { root, ball, face };
}
function makePigeon() {
  const M = mats(), root = new THREE.Group(), yaw = new THREE.Group(); root.add(yaw);
  const body = new THREE.Mesh(mergeG([
    sphG(0.32, '#8a96aa', [0, 0.36, 0], [1.25, 0.9, 0.85]), sphG(0.2, '#5f6f8a', [0.28, 0.58, 0], [1, 1, 0.9]),
    sphG(0.16, '#7a7fd0', [0.22, 0.44, 0], [1, 0.8, 1.05]), sphG(0.14, '#5ab08a', [0.26, 0.5, 0], [0.8, 0.6, 1.0]),
    coneG(0.05, 0.13, 6, '#f2c060', [0.47, 0.57, 0], [0, 0, -Math.PI / 2]), sphG(0.05, '#ff6a2a', [0.38, 0.64, 0.11]), sphG(0.05, '#ff6a2a', [0.38, 0.64, -0.11]),
    sphG(0.025, '#100808', [0.41, 0.645, 0.13]), sphG(0.025, '#100808', [0.41, 0.645, -0.13]),
    boxG(0.11, 0.025, 0.04, '#2a2028', [0.39, 0.72, 0.11], [0, 0, -0.5]), boxG(0.11, 0.025, 0.04, '#2a2028', [0.39, 0.72, -0.11], [0, 0, -0.5]),
    boxG(0.3, 0.05, 0.2, '#5a6478', [-0.42, 0.42, 0], [0, 0, 0.3]), limbG([0.02, 0.15, 0.06], [0.02, 0.0, 0.06], 0.02, '#e86a5a'), limbG([0.02, 0.15, -0.06], [0.02, 0.0, -0.06], 0.02, '#e86a5a')
  ]), M.vcGloss);
  body.castShadow = true; yaw.add(body);
  const wingGeo = mergeG([sphG(0.22, '#7c889e', [-0.05, 0, 0.18], [1.3, 0.25, 1.0])]);
  const wF = new THREE.Mesh(wingGeo, M.vc), wB = new THREE.Mesh(wingGeo, M.vc);
  const pF = new THREE.Group(), pB = new THREE.Group(); pF.position.set(0, 0.5, 0.12); pB.position.set(0, 0.5, -0.12); pB.scale.z = -1;
  pF.add(wF); pB.add(wB); yaw.add(pF, pB);
  wF.castShadow = true;
  return { root, yaw, pF, pB };
}
function makeRickshaw() {
  const M = mats(), root = new THREE.Group(), yaw = new THREE.Group(); root.add(yaw);
  const body = new THREE.Mesh(mergeG([
    boxG(1.0, 0.36, 0.78, '#ffcf2a', [-0.05, 0.42, 0]), boxG(0.32, 0.56, 0.5, '#2f9a4a', [0.48, 0.55, 0]),
    boxG(0.9, 0.08, 0.84, '#1a1a1a', [-0.08, 1.05, 0]), boxG(0.06, 0.45, 0.06, '#1a1a1a', [0.32, 0.82, 0.36]), boxG(0.06, 0.45, 0.06, '#1a1a1a', [0.32, 0.82, -0.36]),
    boxG(0.06, 0.45, 0.06, '#1a1a1a', [-0.5, 0.82, 0.36]), boxG(0.06, 0.45, 0.06, '#1a1a1a', [-0.5, 0.82, -0.36]),
    boxG(0.04, 0.32, 0.6, '#bfe4ff', [0.36, 0.86, 0]), boxG(0.5, 0.1, 0.7, '#7a2a1a', [-0.2, 0.62, 0]),
    sphG(0.07, '#fff6d8', [0.66, 0.66, 0]), boxG(0.2, 0.04, 0.84, '#2f9a4a', [-0.05, 0.25, 0]),
    sphG(0.14, '#ffffff', [0.3, 1.18, 0.2], [1, 1, 0.6]), sphG(0.14, '#ffffff', [0.3, 1.18, -0.05], [1, 1, 0.6]),
    sphG(0.06, '#0a0a0a', [0.36, 1.16, 0.27]), sphG(0.06, '#0a0a0a', [0.36, 1.2, 0.02])
  ]), M.vcGloss);
  body.castShadow = true; yaw.add(body);
  const wheelGeo = mergeG([cylG(0.2, 0.2, 0.1, 14, '#151515', [0, 0, 0], [Math.PI / 2, 0, 0]), cylG(0.1, 0.1, 0.12, 10, '#bdbdbd', [0, 0, 0], [Math.PI / 2, 0, 0])]);
  const rear = new THREE.Group(); rear.position.set(-0.35, 0.2, 0); yaw.add(rear);
  [0.4, -0.4].forEach((z) => { const w = new THREE.Mesh(wheelGeo, M.vc); w.position.z = z; rear.add(w); });
  const front = new THREE.Mesh(wheelGeo, M.vc); front.position.set(0.5, 0.2, 0); yaw.add(front);
  const key = new THREE.Mesh(mergeG([cylG(0.03, 0.03, 0.2, 8, '#ffcc55', [-0.1, 0, 0], [0, 0, Math.PI / 2]), prep(new THREE.TorusGeometry(0.09, 0.025, 6, 12), '#ffcc55', [-0.22, 0.09, 0], [0, 0, 0]), prep(new THREE.TorusGeometry(0.09, 0.025, 6, 12), '#ffcc55', [-0.22, -0.09, 0], [0, 0, 0])]), M.gold);
  key.position.set(-0.55, 0.6, 0); yaw.add(key);
  return { root, yaw, rear, front, key };
}
function makeMonkey() {
  const M = mats(), root = new THREE.Group(), yaw = new THREE.Group(), body = new THREE.Group(); root.add(yaw); yaw.add(body);
  const mesh = (geo, mat, parent, pos, scl) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; if (pos) m.position.set(pos[0], pos[1], pos[2]); if (scl) m.scale.set(scl[0], scl[1], scl[2]); parent.add(m); return m; };
  const face = std({ color: '#e2a888', roughness: 0.6 });
  mesh(new THREE.SphereGeometry(0.5, 18, 14), M.fur, body, [0, 1.05, 0], [1.05, 1.25, 0.9]);
  mesh(new THREE.SphereGeometry(0.36, 14, 10), face, body, [0.2, 0.98, 0], [0.7, 1.2, 0.95]);
  const head = new THREE.Group(); head.position.set(0.1, 1.82, 0); body.add(head);
  mesh(new THREE.SphereGeometry(0.4, 18, 14), M.fur, head);
  mesh(new THREE.SphereGeometry(0.27, 14, 10), face, head, [0.24, -0.06, 0], [0.75, 0.85, 1.05]);
  mesh(new THREE.SphereGeometry(0.17, 12, 8), face, head, [0.36, -0.14, 0], [0.9, 0.7, 1.1]);
  [0.13, -0.13].forEach((z) => { mesh(new THREE.SphereGeometry(0.08, 10, 8), M.white, head, [0.42, 0.06, z]); mesh(new THREE.SphereGeometry(0.045, 8, 6), M.dark, head, [0.48, 0.06, z]); const b = mesh(new THREE.BoxGeometry(0.03, 0.03, 0.14), M.hair, head, [0.45, 0.17, z]); b.rotation.x = z > 0 ? -0.3 : 0.3; });
  [0.42, -0.42].forEach((z) => { mesh(new THREE.SphereGeometry(0.14, 10, 8), M.fur, head, [0, 0.05, z], [0.6, 1, 1]); mesh(new THREE.SphereGeometry(0.09, 8, 6), face, head, [0.05, 0.05, z * 1.05], [0.5, 0.9, 0.9]); });
  const limb = (pos, len, r) => { const p = new THREE.Group(); p.position.set(pos[0], pos[1], pos[2]); body.add(p); mesh(new THREE.CapsuleGeometry(r, len, 4, 8), M.fur, p, [0, -len / 2 - r * 0.5, 0]); const hand = mesh(new THREE.SphereGeometry(r * 1.15, 8, 6), face, p, [0.04, -len - r * 1.4, 0]); return { p, hand }; };
  const armF = limb([0, 1.45, 0.48], 0.58, 0.1), armB = limb([0, 1.45, -0.48], 0.58, 0.1);
  const legF = limb([0, 0.6, 0.24], 0.36, 0.12), legB = limb([0, 0.6, -0.24], 0.36, 0.12);
  const tailCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.45, 0.75, 0), new THREE.Vector3(-0.85, 0.65, 0), new THREE.Vector3(-1.1, 1.0, 0), new THREE.Vector3(-1.0, 1.4, 0), new THREE.Vector3(-0.8, 1.45, 0), new THREE.Vector3(-0.75, 1.25, 0)]);
  const tail = mesh(new THREE.TubeGeometry(tailCurve, 24, 0.06, 6), M.fur, body);
  const kite = makeKite(); kite.scale.setScalar(1.25); kite.position.set(0.1, -0.85, 0.15); kite.rotation.z = 0.5; armF.p.add(kite);
  const stars = new THREE.Group(); stars.position.set(0.1, 2.35, 0); body.add(stars); stars.visible = false;
  const starGeo = new THREE.OctahedronGeometry(0.1);
  for (let i = 0; i < 4; i++) stars.add(new THREE.Mesh(starGeo, M.flame));
  const banana = mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 10, Math.PI * 0.8), std({ color: '#ffe23a', roughness: 0.5 }), armB.p, [0.1, -0.78, 0]); banana.visible = false;
  return { root, yaw, body, head, armF, armB, legF, legB, tail, kite, stars, banana };
}
function makeItem(type) {
  const M = mats(), root = new THREE.Group(), spin = new THREE.Group(); root.add(spin);
  let m;
  if (type === 'mango') {
    m = new THREE.Mesh(mergeG([sphG(0.33, '#ffb21a', [0, 0.36, 0], [0.85, 1, 0.78], 16, 12), sphG(0.2, '#ff6a2a', [0.08, 0.5, 0.12], [1, 0.8, 0.6]), cylG(0.025, 0.03, 0.12, 6, '#5a3a1a', [0, 0.72, 0]), sphG(0.14, '#3aa04a', [0.1, 0.74, 0], [1.2, 0.25, 0.6])]), M.vcGloss);
  } else if (type === 'chilli') {
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(-0.3, 0.45, 0), new THREE.Vector3(-0.05, 0.32, 0), new THREE.Vector3(0.2, 0.3, 0), new THREE.Vector3(0.36, 0.48, 0)]);
    const tube = prep(new THREE.TubeGeometry(curve, 16, 0.1, 8), '#e8261a');
    m = new THREE.Mesh(mergeG([tube, cylG(0.09, 0.11, 0.08, 8, '#2f9a2a', [-0.33, 0.47, 0], [0, 0, 1.2]), cylG(0.02, 0.02, 0.12, 6, '#2f9a2a', [-0.42, 0.52, 0], [0, 0, 1.2])]), M.vcGloss);
  } else if (type === 'diya') {
    const pts = [[0.02, 0], [0.24, 0.02], [0.32, 0.1], [0.34, 0.18], [0.3, 0.2], [0.22, 0.12], [0.02, 0.1]].map((p) => new THREE.Vector2(p[0], p[1]));
    m = new THREE.Mesh(mergeG([prep(new THREE.LatheGeometry(pts, 16), '#b85a2a', [0, 0.05, 0]), sphG(0.05, '#ffd27a', [0.3, 0.2, 0])]), M.vcGloss);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), M.flame); fl.scale.set(0.8, 1.8, 0.8); fl.position.set(0.3, 0.32, 0); spin.add(fl); root.userData.flame = fl;
  } else if (type === 'life') {
    m = makeKite(); m.scale.setScalar(0.75); m.position.y = 0.45;
  } else if (type === 'ball') {
    const parts = [sphG(0.24, '#ff9a1a', [0, 0.3, 0], 1, 10, 8)];
    for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, b = (i % 3 - 1) * 0.8; parts.push(sphG(0.1, i % 2 ? '#ffc21a' : '#ff7a1a', [Math.cos(a) * Math.cos(b) * 0.24, 0.3 + Math.sin(b) * 0.24, Math.sin(a) * Math.cos(b) * 0.24], 1, 6, 5)); }
    m = new THREE.Mesh(mergeG(parts), M.vcGloss);
  }
  m.castShadow = true; spin.add(m);
  return { root, spin };
}
function makeSpring() {
  const M = mats(), root = new THREE.Group();
  const frame = new THREE.Mesh(mergeG([
    cylG(0.06, 0.05, 0.42, 8, '#7a4a22', [-0.48, 0.21, 0.36]), cylG(0.06, 0.05, 0.42, 8, '#7a4a22', [0.48, 0.21, 0.36]), cylG(0.06, 0.05, 0.42, 8, '#7a4a22', [-0.48, 0.21, -0.36]), cylG(0.06, 0.05, 0.42, 8, '#7a4a22', [0.48, 0.21, -0.36]),
    boxG(1.06, 0.08, 0.08, '#8a5a2a', [0, 0.44, 0.36]), boxG(1.06, 0.08, 0.08, '#8a5a2a', [0, 0.44, -0.36]), boxG(0.08, 0.08, 0.8, '#8a5a2a', [0.48, 0.44, 0]), boxG(0.08, 0.08, 0.8, '#8a5a2a', [-0.48, 0.44, 0])
  ]), M.vc);
  frame.castShadow = true; root.add(frame);
  const top = new THREE.Group(); top.position.y = 0.46; root.add(top);
  const weave = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.04, 0.68), M.rope); top.add(weave);
  return { root, top };
}
function makeMover(theme) {
  const M = mats(), root = new THREE.Group();
  let deck;
  if (theme === 'forest') {
    deck = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 3, 14), M.bark); deck.rotation.z = Math.PI / 2; deck.position.y = -0.24;
    root.add(new THREE.Mesh(mergeG([sphG(0.3, '#4f8a36', [-0.8, 0.02, 0], [1.2, 0.3, 0.8]), sphG(0.25, '#5a9a3e', [0.6, 0.02, 0.1], [1, 0.3, 0.8]), limbG([-1.2, 0, 0], [-1.2, 9, 0], 0.035, '#3f6a2a'), limbG([1.2, 0, 0], [1.2, 9, 0], 0.035, '#3f6a2a')]), M.vc));
  } else if (theme === 'bazaar') {
    deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 1.3), M.stripe); deck.position.y = -0.15;
    root.add(new THREE.Mesh(mergeG([limbG([-1.3, 0, 0], [-1.3, 9, 0], 0.03, '#2a2a2a'), limbG([1.3, 0, 0], [1.3, 9, 0], 0.03, '#2a2a2a')]), M.vc));
    const lan = new THREE.Mesh(mergeG([sphG(0.12, '#ffb04a', [-0.9, -0.5, 0.4]), sphG(0.12, '#ff5a8a', [0, -0.55, 0.45]), sphG(0.12, '#ffb04a', [0.9, -0.5, 0.4])]), M.bulb); root.add(lan);
  } else {
    deck = new THREE.Mesh(new THREE.BoxGeometry(3, 0.32, 1.3), M.wood); deck.position.y = -0.16;
    root.add(new THREE.Mesh(mergeG([limbG([-1.3, 0, 0.5], [-1.3, 9, 0.5], 0.03, '#b89a6a'), limbG([1.3, 0, 0.5], [1.3, 9, 0.5], 0.03, '#b89a6a'), limbG([-1.3, 0, -0.5], [-1.3, 9, -0.5], 0.03, '#b89a6a'), limbG([1.3, 0, -0.5], [1.3, 9, -0.5], 0.03, '#b89a6a')]), M.vc));
  }
  deck.castShadow = true; deck.receiveShadow = true; root.add(deck);
  return { root };
}
function makeCheck() {
  const M = mats(), root = new THREE.Group();
  const pole = new THREE.Mesh(mergeG([cylG(0.05, 0.06, 2.6, 8, '#d8c27a', [0, 1.3, 0]), cylG(0.07, 0.07, 0.05, 8, '#a89a5a', [0, 0.7, 0]), cylG(0.07, 0.07, 0.05, 8, '#a89a5a', [0, 1.5, 0]), cylG(0.07, 0.07, 0.05, 8, '#a89a5a', [0, 2.2, 0]), sphG(0.08, '#ffcc55', [0, 2.65, 0]), cylG(0.25, 0.3, 0.12, 10, '#7a6a5a', [0, 0.06, 0])]), M.vc);
  pole.castShadow = true; root.add(pole);
  const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(0.75, -0.22); shape.lineTo(0, -0.46); shape.closePath();
  const fm = std({ color: '#8a8a8a', roughness: 0.7, side: THREE.DoubleSide, emissive: new THREE.Color('#ff7a1a'), emissiveIntensity: 0 });
  const flag = new THREE.Mesh(new THREE.ShapeGeometry(shape), fm); flag.position.set(0.05, 0.7, 0); flag.castShadow = true; root.add(flag); flag.userData.keepMat = true;
  return { root, flag, fm };
}

/* ------------------------------------------------------------ the 3D state */
const R = {
  kind: '3d', three: true, failed: false, lost: false, ql: -1, lockQ: false, soft: false, fps: 60, qT: 0, qN: 0, qWarm: 0,
  flash: 0, lightning: 5, bolt: 0, punch: 0, built: null, lastNow: 0, time: 0, map: null
};
let ARC = null;
const TIERS = [
  { px: 0.5, budget: 170000, shadow: false, map: 512, cheap: true, post: false, bloomN: 0, msaa: 0, fx: 0.4, decor: 0.45, aniso: 1 },
  { px: 0.72, budget: 560000, shadow: false, map: 1024, cheap: false, post: true, bloomN: 2, msaa: 0, fx: 0.7, decor: 0.7, aniso: 2 },
  { px: 0.9, budget: 1.1e6, shadow: true, map: 1024, cheap: false, post: true, bloomN: 3, msaa: 4, fx: 1, decor: 1, aniso: 4 },
  { px: 1, budget: 2.1e6, shadow: true, map: 2048, cheap: false, post: true, bloomN: 3, msaa: 4, fx: 1, decor: 1, aniso: 8 }
];
const tier = () => TIERS[Math.max(0, R.ql)];

const POST_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function setup(a) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: true, powerPreference: 'high-performance' }); } catch (e) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  R.renderer = renderer;
  const scene = new THREE.Scene(); R.scene = scene;
  scene.fog = new THREE.FogExp2('#e9a47c', 0.008);
  const camera = new THREE.PerspectiveCamera(34, 1, 0.3, 900); R.camera = camera;
  R.hemi = new THREE.HemisphereLight('#c4d2ec', '#4a4636', 1); scene.add(R.hemi);
  const sun = new THREE.DirectionalLight('#ffe0b8', 3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04; scene.add(sun, sun.target); R.sun = sun;
  R.fill = new THREE.PointLight('#ffb070', 0, 18, 2); scene.add(R.fill);
  R.sunDir = new THREE.Vector3(0.4, 0.5, 0.6).normalize();
  const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uFog: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.2, 1) }, uSun: { value: new THREE.Color() }, uCloud: { value: 0.5 }, uTime: { value: 0 }, uNight: { value: 0 }, uFlash: { value: 0 } };
  R.skyU = skyU;
  R.skyMat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  R.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), R.skyMat); R.sky.frustumCulled = false; R.sky.renderOrder = -10; scene.add(R.sky);
  R.pmrem = new THREE.PMREMGenerator(renderer); R.envs = {};
  FX = createFX(scene);
  R.hero = makeHero(); scene.add(R.hero.root);
  R.hero.root.traverse((o) => { o.userData.keepMat = true; });
  R.world = new THREE.Group(); scene.add(R.world);
  // post
  const quadGeo = new THREE.PlaneGeometry(2, 2);
  R.postScene = new THREE.Scene(); R.postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  R.quad = new THREE.Mesh(quadGeo, null); R.quad.frustumCulled = false; R.postScene.add(R.quad);
  R.mBright = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() }, uThresh: { value: 0.9 }, uKnee: { value: 0.4 } }, vertexShader: POST_VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 uTexel; uniform float uThresh; uniform float uKnee; varying vec2 vUv;' +
      'vec3 f(vec2 o){ vec3 c = texture2D(tDiffuse, vUv + o * uTexel).rgb; float br = max(c.r, max(c.g, c.b)); float s = clamp(br - uThresh + uKnee, 0.0, 2.0 * uKnee); s = s * s / (4.0 * uKnee + 1e-4); return c * max(s, br - uThresh) / max(br, 1e-4); }' +
      'void main(){ vec3 c = f(vec2(-1.0,-1.0)) + f(vec2(1.0,-1.0)) + f(vec2(-1.0,1.0)) + f(vec2(1.0,1.0)); gl_FragColor = vec4(min(c * 0.25, vec3(30.0)), 1.0); }' });
  R.mDown = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uTexel: { value: new THREE.Vector2() } }, vertexShader: POST_VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 uTexel; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv + vec2(-1.0,-1.0) * uTexel).rgb + texture2D(tDiffuse, vUv + vec2(1.0,-1.0) * uTexel).rgb + texture2D(tDiffuse, vUv + vec2(-1.0,1.0) * uTexel).rgb + texture2D(tDiffuse, vUv + vec2(1.0,1.0) * uTexel).rgb; gl_FragColor = vec4(c * 0.25, 1.0); }' });
  R.mBlur = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: POST_VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv; void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270; c += (texture2D(tDiffuse, vUv + uDir * 1.3846154).rgb + texture2D(tDiffuse, vUv - uDir * 1.3846154).rgb) * 0.3162162; c += (texture2D(tDiffuse, vUv + uDir * 3.2307692).rgb + texture2D(tDiffuse, vUv - uDir * 3.2307692).rgb) * 0.0702703; gl_FragColor = vec4(c, 1.0); }' });
  R.mComp = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, tB1: { value: null }, tB2: { value: null }, tB3: { value: null }, uBloom: { value: 0.6 }, uExposure: { value: 1 }, uGain: { value: new THREE.Vector3(1, 1, 1) }, uSat: { value: 1.08 }, uContrast: { value: 0.12 }, uVig: { value: 0.32 }, uGrain: { value: 0.03 }, uTime: { value: 0 }, uIris: { value: 2 }, uIrisC: { value: new THREE.Vector2(0.5, 0.5) }, uAspect: { value: 1 }, uFlash: { value: 0 }, uLevels: { value: 3 }, uCA: { value: 0.0015 } },
    vertexShader: POST_VS, depthTest: false, depthWrite: false,
    fragmentShader: [
      'uniform sampler2D tScene; uniform sampler2D tB1; uniform sampler2D tB2; uniform sampler2D tB3;',
      'uniform float uBloom; uniform float uExposure; uniform vec3 uGain; uniform float uSat; uniform float uContrast; uniform float uVig; uniform float uGrain; uniform float uTime; uniform float uIris; uniform vec2 uIrisC; uniform float uAspect; uniform float uFlash; uniform float uLevels; uniform float uCA;',
      'varying vec2 vUv;',
      'void main(){',
      '  vec2 q = vUv - 0.5; float r2 = dot(q, q);',
      '  vec3 c; c.r = texture2D(tScene, vUv + q * uCA * r2 * 8.0).r; c.g = texture2D(tScene, vUv).g; c.b = texture2D(tScene, vUv - q * uCA * r2 * 8.0).b;',
      '  vec3 b = texture2D(tB1, vUv).rgb * 0.55;',
      '  if (uLevels > 1.5) b += texture2D(tB2, vUv).rgb * 0.45;',
      '  if (uLevels > 2.5) b += texture2D(tB3, vUv).rgb * 0.4;',
      '  c += b * uBloom;',
      '  c = c * uExposure * uGain + vec3(uFlash);',
      '  gl_FragColor = vec4(c, 1.0);',
      '  #include <tonemapping_fragment>',
      '  vec3 t = gl_FragColor.rgb;',
      '  float l = dot(t, vec3(0.2126, 0.7152, 0.0722));',
      '  t = mix(vec3(l), t, uSat);',
      '  t = mix(t, t * t * (3.0 - 2.0 * t), uContrast);',
      '  vec2 v = q; v.x *= uAspect; t *= mix(1.0 - uVig, 1.0, smoothstep(0.95, 0.22, length(v)));',
      '  float n = fract(sin(dot(vUv * vec2(12.9898, 78.233) + fract(uTime * 7.0), vec2(1.0, 1.31))) * 43758.5453);',
      '  t += (n - 0.5) * uGrain * (0.25 + 0.75 * smoothstep(0.02, 0.4, l));',
      '  if (uIris < 1.5) { vec2 d = vUv - uIrisC; d.x *= uAspect; float m = smoothstep(uIris, uIris - 0.006, length(d)); t *= m; }',
      '  gl_FragColor = vec4(clamp(t, 0.0, 1.0), 1.0);',
      '  #include <colorspace_fragment>',
      '}'
    ].join('\n')
  });
  R.rt = null;
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R.gpu = name; R.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { R.soft = false; }
  a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R.lost = true; });
  a.canvas.addEventListener('webglcontextrestored', () => { R.lost = false; R.rt = null; });
  return true;
}

const _dbs = new THREE.Vector2();
function makeRTs() {
  const r = R.renderer, t = tier();
  if (!t.post) { disposeRTs(); return; }
  const v = r.getDrawingBufferSize(_dbs);
  const w = Math.max(2, v.x | 0), h = Math.max(2, v.y | 0);
  const key = w + 'x' + h + ':' + t.msaa + ':' + t.bloomN;
  if (R.rtKey === key && R.rt) return;
  disposeRTs();
  const opt = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  R.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: t.msaa, depthBuffer: true });
  R.bl = [];
  let bw = w, bh = h;
  for (let i = 0; i < 3; i++) { bw = Math.max(2, bw >> 1); bh = Math.max(2, bh >> 1); R.bl.push({ a: new THREE.WebGLRenderTarget(bw, bh, opt), b: new THREE.WebGLRenderTarget(bw, bh, opt), w: bw, h: bh }); }
  R.rtKey = key;
}
function disposeRTs() {
  if (R.rt) { R.rt.dispose(); R.rt = null; }
  if (R.bl) { R.bl.forEach((l) => { l.a.dispose(); l.b.dispose(); }); R.bl = null; }
  R.rtKey = '';
}
function pass(mat, target) { R.quad.material = mat; R.renderer.setRenderTarget(target); R.renderer.render(R.postScene, R.postCam); }

function resize(a) {
  if (!R.renderer) return;
  const t = tier();
  const pr = Math.min(a.dpr * t.px, Math.sqrt(t.budget / Math.max(1, a.w * a.h)));
  R.renderer.setPixelRatio(Math.max(0.3, pr));
  R.renderer.setSize(a.w, a.h, false);
  R.camera.aspect = a.w / a.h; R.camera.updateProjectionMatrix();
  R.rtKey = '';
}
function applyTier() {
  const t = tier(), sc = R.scene;
  sc.traverse((o) => {
    if (o.isMesh && o.material && !Array.isArray(o.material) && !o.userData.keepMat) {
      const full = fullOf(o.material), want = t.cheap ? cheapOf(full) : full;
      if (o.material !== want) o.material = want;
    }
  });
  const an = Math.min(t.aniso, R.renderer.capabilities.getMaxAnisotropy()); TEX_ANISO = an;
  ALL_TEX.forEach((tx) => { if (tx.anisotropy !== an) { tx.anisotropy = an; tx.needsUpdate = true; } });
  R.renderer.shadowMap.enabled = t.shadow; R.sun.castShadow = t.shadow;
  if (R.sun.shadow.mapSize.x !== t.map) { R.sun.shadow.mapSize.set(t.map, t.map); if (R.sun.shadow.map) { R.sun.shadow.map.dispose(); R.sun.shadow.map = null; } }
  if (FX) FX.density = t.fx;
  if (R.built && R.built.decor) R.built.decor.forEach((d) => { if (d.isInstancedMesh && d.userData.full != null) d.count = Math.max(1, Math.round(d.userData.full * t.decor)); });
  R.scene.environment = t.cheap ? null : R.env || null;
  R.rtKey = '';
}
function setQuality(q) {
  if (!R.renderer) return;
  q = clamp(q | 0, 0, 3);
  if (q === R.ql) return;
  R.ql = q;
  applyTier(); resize(ARC);
}
function measureFps(dt) {
  if (R.qWarm < 6) { R.qWarm++; return; }
  R.qT += dt; R.qN++;
  if (R.qT >= 1.4) {
    R.fps = R.qN / R.qT; R.qT = 0; R.qN = 0;
    if (!R.lockQ && R.fps < 40 && R.ql > 0) { setQuality(R.fps < 18 ? Math.max(0, R.ql - 2) : R.ql - 1); R.qWarm = 2; }
  }
}

function setLook(key) {
  if (R.lookKey === key) return;
  R.lookKey = key;
  const L = LOOK[key], sc = R.scene;
  R.L = L;
  sc.fog.color.set(L.fog); sc.fog.density = L.fogD;
  R.hemi.color.set(L.hemiSky); R.hemi.groundColor.set(L.hemiGnd); R.hemi.intensity = L.hemiI;
  R.sun.color.set(L.sun); R.sun.intensity = L.sunI;
  R.sunDir.set(Math.sin(L.sunAz) * Math.cos(L.sunEl), Math.sin(L.sunEl), Math.cos(L.sunAz) * Math.cos(L.sunEl)).normalize();
  const u = R.skyU;
  u.uTop.value.set(L.skyTop); u.uMid.value.set(L.skyMid); u.uHor.value.set(L.skyHor); u.uFog.value.set(L.fog); u.uSun.value.set(L.sun); u.uCloud.value = L.cloud; u.uNight.value = L.night;
  u.uSunDir.value.set(R.sunDir.x, Math.max(0.06, R.sunDir.y * 0.45), R.sunDir.z * 0.3 - 1).normalize();
  if (L.night) u.uSunDir.value.set(-0.45, 0.42, -1).normalize();
  R.renderer.toneMappingExposure = L.exposure;
  R.renderer.setClearColor(L.fog);
  if (!R.envs[key]) {
    const es = new THREE.Scene(), em = new THREE.Mesh(new THREE.SphereGeometry(40, 24, 12), R.skyMat); es.add(em);
    R.envs[key] = R.pmrem.fromScene(es, 0.02, 0.1, 100).texture;
    em.geometry.dispose();
  }
  R.env = R.envs[key];
  sc.environment = tier().cheap ? null : R.env;
  sc.environmentIntensity = L.night ? 0.5 : 0.7;
  const c = R.mComp.uniforms;
  c.uGain.value.set(L.grade[0], L.grade[1], L.grade[2]); c.uSat.value = L.sat; c.uVig.value = L.vig; c.uBloom.value = L.bloom;
  R.mBright.uniforms.uThresh.value = L.thresh;
}

/* ------------------------------------------------------------ building a level in 3D */
const GROUNDISH = (t) => t === T_GROUND;
const DISP = [];
function own(x) { DISP.push(x); return x; }
function disposeGroup(g) {
  g.traverse((o) => { if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLineSegments) { if (o.geometry && !o.userData.shared) o.geometry.dispose(); } });
  while (g.children.length) g.remove(g.children[0]);
  DISP.forEach((x) => {
    if (x.isTexture) { const i = ALL_TEX.indexOf(x); if (i >= 0) ALL_TEX.splice(i, 1); }
    if (x.isMaterial) { const c = cheapCache.get(x); if (c) { c.dispose(); cheapCache.delete(x); } }
    x.dispose();
  });
  DISP.length = 0;
}
const TMATS = {};
function terrainMats(theme, indoor) {
  const key = indoor ? 'room' : theme;
  if (!TMATS[key]) TMATS[key] = terrainMats0(theme, indoor);
  if (key === 'bazaar') { const t = textures(); [t.sand, t.sandN, t.sandE].forEach((x) => x.repeat.set(0.5, 0.5)); }
  return TMATS[key];
}
function terrainMats0(theme, indoor) {
  const t = textures();
  if (indoor) return { top: std({ map: t.floor, normalMap: t.floorN, roughness: 0.7, vertexColors: true }), side: std({ map: t.brickW, normalMap: t.brickWN, roughness: 0.9, vertexColors: true }) };
  if (theme === 'forest') return { top: std({ map: t.moss, normalMap: t.mossN, roughness: 0.85, vertexColors: true, color: '#b8c8a8' }), side: std({ map: t.earth, normalMap: t.earthN, roughness: 0.95, vertexColors: true }) };
  if (theme === 'bazaar') return { top: std({ map: t.pave, normalMap: t.paveN, roughness: 0.6, vertexColors: true }), side: std({ map: t.sand, normalMap: t.sandN, emissiveMap: t.sandE, emissive: new THREE.Color('#ffb060'), emissiveIntensity: 2.2, roughness: 0.82, vertexColors: true }) };
  return { top: std({ map: t.conc, normalMap: t.concN, roughness: 0.92, vertexColors: true }), side: std({ map: t.facade, normalMap: t.facadeN, emissiveMap: t.facadeE, emissive: new THREE.Color('#ffaa55'), emissiveIntensity: 1.6, roughness: 0.88, vertexColors: true }) };
}
const PASTEL = ['#f2c7a8', '#cfe3d8', '#f5e2a8', '#d8c8ec', '#f0b8b0', '#b9d8ec', '#f7d9c4', '#d6e7b8'];
function buildTerrain(M, group, mts, decorList) {
  const D = M.indoor ? 1.0 : 1.7, CH = 24, w = M.w;
  const theme = M.theme, roof = !M.indoor && theme === 'roof';
  // a building colour per run of ground with the same roof height (old city: each is its own house)
  const colX = new Array(w).fill(null);
  let bid = 0, prevTop = -1;
  for (let x = 0; x < w; x++) {
    let top = 0; for (let y = H - 1; y >= 0; y--) if (GROUNDISH(tileAt(M, x, y))) { top = y + 1; break; }
    if (top !== prevTop || top === 0 || (roof && hash(x * 7 + M.seed) < 0.06)) bid++;
    prevTop = top;
    const base = roof ? PASTEL[Math.floor(hash(bid * 13 + M.seed) * PASTEL.length)] : theme === 'forest' ? '#ffffff' : theme === 'bazaar' ? '#ffffff' : '#ffffff';
    _c.set(base);
    if (!roof) { const k = 0.88 + hash(x * 3 + 1) * 0.16; _c.multiplyScalar(k); }
    colX[x] = _c.clone();
  }
  const topCol = new THREE.Color(1, 1, 1), capCol = new THREE.Color('#d8cdbd');
  for (let c0 = 0; c0 < w; c0 += CH) {
    const At = Acc(), As = Acc();
    for (let x = c0; x < Math.min(w, c0 + CH); x++) {
      let y = 0;
      while (y < H) {
        if (!GROUNDISH(tileAt(M, x, y))) { y++; continue; }
        let y1 = y; while (y1 < H && GROUNDISH(tileAt(M, x, y1))) y1++;
        const yb = y === 0 ? -10 : y, col = colX[x];
        let faces = F_FRONT;
        const solidL = (yy) => GROUNDISH(tileAt(M, x - 1, yy)), solidR = (yy) => GROUNDISH(tileAt(M, x + 1, yy));
        let lAll = true, rAll = true;
        for (let yy = y; yy < y1; yy++) { if (!solidL(yy)) lAll = false; if (!solidR(yy)) rAll = false; }
        if (y === 0 && x > 0 && !GROUNDISH(tileAt(M, x - 1, 0))) lAll = false;
        if (y === 0 && x < w - 1 && !GROUNDISH(tileAt(M, x + 1, 0))) rAll = false;
        if (!lAll) faces |= F_LEFT;
        if (!rAll) faces |= F_RIGHT;
        boxFaces(As, x, yb, -D, x + 1, y1, D, col, faces, 0.5);
        if (!GROUNDISH(tileAt(M, x, y1))) {
          boxFaces(At, x, y1 - 0.001, -D, x + 1, y1, D, topCol, F_TOP, 0.5);
          if (!M.indoor) {
            // a trim along the front edge: a parapet on roofs, a curb in the bazaar, a lip of grass in the forest
            const tc = theme === 'forest' ? new THREE.Color('#6aa04a') : theme === 'bazaar' ? new THREE.Color('#c9a07a') : capCol;
            boxFaces(At, x - 0.002, y1 - 0.16, D - 0.12, x + 1.002, y1 + 0.1, D + 0.06, tc, F_FRONT | F_TOP | (GROUNDISH(tileAt(M, x - 1, y1 - 1)) ? 0 : F_LEFT) | (GROUNDISH(tileAt(M, x + 1, y1 - 1)) ? 0 : F_RIGHT), 0.5);
          }
        }
        y = y1;
      }
    }
    shadeLow(As, M.indoor ? -2 : -9, M.indoor ? 6 : 4, M.indoor ? 0.6 : 0.34);
    const gt = accGeo(At), gs = accGeo(As);
    if (gt) { const m = new THREE.Mesh(gt, mts.top); m.receiveShadow = true; group.add(m); }
    if (gs) { const m = new THREE.Mesh(gs, mts.side); m.receiveShadow = true; m.castShadow = false; group.add(m); }
  }
}
function buildStatic(M, group) {
  const Mt = mats(), theme = M.theme;
  // stone blocks (stairs, ledges): one instanced mesh
  const stones = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < M.w; x++) if (tileAt(M, x, y) === T_STONE) stones.push([x, y]);
  if (stones.length) {
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1.2), Mt.stone, stones.length);
    stones.forEach(([x, y], i) => { _m4.makeTranslation(x + 0.5, y + 0.5, 0); im.setMatrixAt(i, _m4); });
    im.castShadow = true; im.receiveShadow = true; group.add(im);
  }
  // planks
  const planks = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < M.w; x++) if (tileAt(M, x, y) === T_PLANK) planks.push([x, y]);
  if (planks.length) {
    let geo, mat;
    if (M.indoor || theme === 'roof') { geo = new THREE.BoxGeometry(1.02, 0.2, 1.3); geo.translate(0.5, 0.9, 0); mat = Mt.wood; }
    else if (theme === 'forest') { geo = mergeG([boxG(1.0, 0.14, 1.1, '#7a5532', [0.5, 0.92, 0]), limbG([0, 0.95, 0.58], [1, 0.95, 0.58], 0.04, '#3f7a2a'), limbG([0, 0.95, -0.58], [1, 0.95, -0.58], 0.04, '#3f7a2a'), sphG(0.12, '#4f9a36', [0.3, 1.0, 0.6], [1.4, 0.6, 0.8])]); mat = Mt.vc; }
    else { geo = new THREE.BoxGeometry(1.02, 0.12, 1.5); geo.rotateX(-0.12); geo.translate(0.5, 0.92, -0.05); mat = Mt.stripe; }
    const im = new THREE.InstancedMesh(geo, mat, planks.length);
    planks.forEach(([x, y], i) => { _m4.makeTranslation(x, y, 0); im.setMatrixAt(i, _m4); });
    im.castShadow = true; im.receiveShadow = true; group.add(im);
  }
  // chimneys (enter and exit) and water tanks
  const parts = [], wood = [], bark = [];
  M.secrets.forEach((s) => {
    [s.x0, s.ret.x - 1].forEach((x0) => {
      const y0 = s.y - 2;
      if (theme === 'forest') { parts.push(cylG(0.98, 1.05, 2.05, 16, '#5a3e2a', [x0 + 1, y0 + 1.02, 0]), cylG(0.86, 0.86, 0.04, 16, '#140c08', [x0 + 1, s.y + 0.02, 0]), cylG(0.98, 0.98, 0.06, 16, '#c8a070', [x0 + 1, s.y - 0.01, 0])); }
      else if (theme === 'bazaar') { const pts = [[0.5, 0], [0.98, 0.3], [1.02, 1.0], [0.8, 1.7], [0.7, 2.0]].map((p) => new THREE.Vector2(p[0], p[1])); parts.push(prep(new THREE.LatheGeometry(pts, 18), '#b8642a', [x0 + 1, y0, 0]), cylG(0.66, 0.66, 0.04, 16, '#100806', [x0 + 1, s.y + 0.01, 0]), prep(new THREE.TorusGeometry(0.74, 0.06, 6, 20), '#ffcc55', [x0 + 1, s.y, 0], [Math.PI / 2, 0, 0])); }
      else { parts.push(boxG(2, 2, 1.6, '#9a4a36', [x0 + 1, y0 + 1, 0]), boxG(2.2, 0.22, 1.8, '#7a3a2a', [x0 + 1, s.y - 0.08, 0]), boxG(1.6, 0.04, 1.2, '#140c08', [x0 + 1, s.y + 0.03, 0])); }
    });
  });
  M.stands.forEach(([tx, by]) => {
    if (theme === 'forest') { parts.push(cylG(0.96, 1.0, 2, 16, '#4a3626', [tx + 1, by + 1, 0]), cylG(0.96, 0.96, 0.05, 16, '#c8a070', [tx + 1, by + 2, 0]), cylG(0.5, 0.9, by + 10, 10, '#3a2a1e', [tx + 1, (by - 10) / 2, 0])); }
    else if (theme === 'bazaar') { parts.push(boxG(2, 2, 1.5, '#b07a3a', [tx + 1, by + 1, 0]), boxG(2.04, 0.1, 1.54, '#7a4a1a', [tx + 1, by + 1.5, 0]), boxG(2.04, 0.1, 1.54, '#7a4a1a', [tx + 1, by + 0.5, 0]), limbG([tx + 0.2, by, 0.6], [tx + 0.2, -10, 0.6], 0.06, '#3a2a1a'), limbG([tx + 1.8, by, 0.6], [tx + 1.8, -10, 0.6], 0.06, '#3a2a1a')); }
    else {
      parts.push(cylG(0.92, 0.92, 1.7, 20, '#1d2024', [tx + 1, by + 0.95, 0]), cylG(0.6, 0.94, 0.3, 20, '#1d2024', [tx + 1, by + 1.95, 0]), cylG(0.22, 0.22, 0.08, 12, '#30353b', [tx + 1, by + 2.12, 0]));
      for (let k = 0; k < 4; k++) parts.push(cylG(0.94, 0.94, 0.05, 20, '#2a2e33', [tx + 1, by + 0.3 + k * 0.42, 0]));
      parts.push(boxG(2.1, 0.12, 1.9, '#55585c', [tx + 1, by + 0.06, 0]));
      [[0.15, 0.7], [1.85, 0.7], [0.15, -0.7], [1.85, -0.7]].forEach(([dx, dz]) => parts.push(limbG([tx + dx, by, dz], [tx + dx, -10, dz], 0.05, '#4a4d52')));
      parts.push(limbG([tx + 0.15, by - 1.5, 0.7], [tx + 1.85, by - 3, 0.7], 0.03, '#4a4d52'), limbG([tx + 1.85, by - 1.5, 0.7], [tx + 0.15, by - 3, 0.7], 0.03, '#4a4d52'));
    }
  });
  if (parts.length) { const m = new THREE.Mesh(mergeG(parts), Mt.vc); m.castShadow = true; m.receiveShadow = true; group.add(m); }
  void wood; void bark;
  // flag pole and hut
  if (M.flag) {
    const F = M.flag, fp = [cylG(0.07, 0.08, F.y1 - F.y0 + 0.3, 10, '#e2cf8f', [F.x, (F.y0 + F.y1) / 2, 0]), sphG(0.18, '#ffcc55', [F.x, F.y1 + 0.2, 0])];
    for (let y = F.y0 + 1; y < F.y1; y += 1.6) fp.push(cylG(0.09, 0.09, 0.06, 10, '#b8a06a', [F.x, y, 0]));
    const pole = new THREE.Mesh(mergeG(fp), Mt.vcGloss); pole.castShadow = true; group.add(pole);
    const fshape = new THREE.Shape(); fshape.moveTo(0, 0.6); fshape.lineTo(1.3, 0.2); fshape.lineTo(1.5, -0.25); fshape.lineTo(0, -0.6); fshape.closePath();
    const fg = new THREE.ShapeGeometry(fshape, 1); const pos = fg.attributes.position; const fuv = fg.attributes.uv;
    for (let i = 0; i < pos.count; i++) fuv.setXY(i, pos.getX(i) / 1.5, (pos.getY(i) + 0.6) / 1.2);
    const fm = own(std({ map: textures().kite, roughness: 0.7, side: THREE.DoubleSide }));
    fm.onBeforeCompile = (sh) => { sh.uniforms.uTime = R.flagTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.z += sin(position.x * 4.0 - uTime * 7.0) * 0.12 * position.x;'); };
    const flag = new THREE.Mesh(fg, fm); flag.castShadow = true; flag.position.set(F.x + 0.08, F.y1 - 1.2, 0); flag.userData.keepMat = true; group.add(flag);
    R.built.flag = flag;
  }
  if (M.hut) {
    const hx = M.hut.x, hy = M.hut.y, hp = [];
    const wall = theme === 'forest' ? '#8a6a48' : theme === 'bazaar' ? '#c8604a' : '#f0d6b0';
    hp.push(boxG(4, 3, 3, wall, [hx + 2, hy + 1.5, -0.4]));
    if (theme === 'forest') { const roofG = new THREE.ConeGeometry(3.4, 2.2, 4, 1); roofG.rotateY(Math.PI / 4); hp.push(prep(roofG, '#a8884a', [hx + 2, hy + 4.1, -0.4], null, [1.1, 1, 0.85])); }
    else { hp.push(boxG(4.3, 0.3, 3.3, theme === 'bazaar' ? '#7a2a3a' : '#d8c4a4', [hx + 2, hy + 3.15, -0.4]), boxG(4.3, 0.4, 0.15, theme === 'bazaar' ? '#ffcc55' : '#c8b494', [hx + 2, hy + 3.4, 1.15])); }
    hp.push(boxG(1.1, 1.9, 0.1, '#3a1c10', [M.hut.door + 0.5, hy + 0.95, 1.12]), boxG(1.3, 0.12, 0.2, '#7a4a2a', [M.hut.door + 0.5, hy + 1.95, 1.12]));
    for (let i = 0; i < 9; i++) hp.push(sphG(0.09, i % 2 ? '#ffb21a' : '#ff6a1a', [M.hut.door + 0.5 - 0.65 + i * 0.16, hy + 2.2 - Math.sin(i / 8 * Math.PI) * 0.18, 1.2]));
    const hut = new THREE.Mesh(mergeG(hp), Mt.vc); hut.castShadow = true; hut.receiveShadow = true; group.add(hut);
    const glow = new THREE.Mesh(mergeG([boxG(0.9, 1.6, 0.04, '#ffb46a', [M.hut.door + 0.5, hy + 0.85, 1.18]), boxG(0.6, 0.5, 0.04, '#ffc47a', [hx + 0.9, hy + 1.9, 1.12])]), Mt.bulb); group.add(glow);
  }
  if (M.indoor) {
    const back = new THREE.Mesh(new THREE.PlaneGeometry(M.w, H), own(std({ map: textures().brickW, normalMap: textures().brickWN, roughness: 0.92, color: '#b89a8a' })));
    back.material.map = own(back.material.map.clone()); back.material.map.repeat.set(M.w / 2, H / 2); back.material.map.needsUpdate = true; ALL_TEX.push(back.material.map);
    back.position.set(M.w / 2, H / 2 - 2, -1.0); back.receiveShadow = true; group.add(back);
    const win = new THREE.Mesh(mergeG([boxG(2, 2.4, 0.05, '#3a5aa0', [7, 6.5, -0.95]), boxG(2.2, 0.12, 0.1, '#5a3a20', [7, 5.3, -0.9]), boxG(0.08, 2.4, 0.08, '#5a3a20', [7, 6.5, -0.9]), boxG(2, 0.08, 0.08, '#5a3a20', [7, 6.5, -0.9])]), Mt.vc); group.add(win);
    const bulb = new THREE.Mesh(mergeG([sphG(0.16, '#ffe0a0', [12, 8.6, 0]), limbG([12, 8.7, 0], [12, 11, 0], 0.015, '#222')]), Mt.bulb); group.add(bulb);
    const props = [boxG(1, 1, 1, '#8a5a32', [3, 2.5, -0.3]), boxG(0.8, 0.8, 0.8, '#7a4a2a', [3.2, 3.4, -0.3], [0, 0.3, 0]), sphG(0.5, '#c8b48a', [18, 2.45, -0.3], [1, 0.9, 0.8]), sphG(0.45, '#b8a47a', [18.8, 2.4, -0.4], [1, 0.9, 0.8]), boxG(2.4, 0.15, 0.6, '#6a4a2a', [10, 4.2, -0.75]), cylG(0.2, 0.25, 0.5, 10, '#b8642a', [9.3, 4.53, -0.75]), cylG(0.15, 0.2, 0.4, 10, '#c87a3a', [10.5, 4.48, -0.75])];
    const pr = new THREE.Mesh(mergeG(props), Mt.vc); pr.castShadow = true; pr.receiveShadow = true; group.add(pr);
  }
}

// Instanced decor that scales with the quality tier.
function inst(group, geo, mat, list, o) {
  o = o || {};
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  list.forEach((it, i) => {
    _e.set(it.rx || 0, it.ry || 0, it.rz || 0, 'YXZ'); _q.setFromEuler(_e);
    _s3.set(it.sx || it.s || 1, it.sy || it.s || 1, it.sz || it.s || 1);
    _p3.set(it.x, it.y, it.z || 0); _m4.compose(_p3, _q, _s3); im.setMatrixAt(i, _m4);
    if (it.col) { _c.set(it.col); im.setColorAt(i, _c); }
  });
  if (im.instanceColor) im.instanceColor.needsUpdate = true;
  im.castShadow = !!o.shadow; im.receiveShadow = !!o.receive;
  im.userData.full = list.length; im.userData.items = list;
  if (o.dynamic) im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  im.computeBoundingSphere();
  group.add(im);
  return im;
}
function topAt(M, x) { for (let y = H - 1; y >= 0; y--) { const t = tileAt(M, x, y); if (t === T_GROUND) return y + 1; } return -1; }

function buildDecor(M, group) {
  const Mt = mats(), t = textures(), theme = M.theme, r = rng(M.seed * 17 + 3), list = [], w = M.w;
  const dyn = { kites: null, clothes: null, falls: [], vines: null };
  if (M.indoor) return { list, dyn };
  // far skyline (two layers) as textured planes
  const far = (z, hgt, col, rep, yb, kind) => {
    const tex = own((kind === 'trees' ? t.treeline : t.skyline).clone()); tex.repeat.set(rep, 1); tex.needsUpdate = true; ALL_TEX.push(tex);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w + 500, hgt), own(new THREE.MeshBasicMaterial({ map: tex, transparent: true, color: col, fog: false, depthWrite: false })));
    m.position.set(w / 2, yb + hgt / 2, z); m.renderOrder = -5; group.add(m); return m;
  };
  if (theme === 'roof') { far(-150, 34, '#d9a0a0', 7, -14); far(-95, 24, '#a87078', 9, -13); }
  else if (theme === 'bazaar') { far(-150, 38, '#2e2450', 7, -12); far(-95, 28, '#1c1434', 9, -12); }
  else { far(-140, 46, '#7d958a', 5, -14, 'trees'); far(-70, 30, '#5c7468', 7, -12, 'trees'); }
  // midground buildings or tree line
  if (theme !== 'forest') {
    const A = Acc(), fogC = new THREE.Color(LOOK[theme].fog), skyC = new THREE.Color(theme === 'roof' ? '#c8a8c0' : '#3a2e5a');
    // three rows of houses behind the play line: lower than the roofs you run on, so the sky stays open
    [[-9, -16, 0.2, -2, 5], [-22, -34, 0.5, -2, 6], [-46, -66, 0.75, -1, 7]].forEach(([za, zb, haze, hb, hr], row) => {
      for (let x = -40 - row * 20; x < w + 60 + row * 30;) {
        const bw = 3 + Math.floor(r() * (5 + row * 2)), z0 = lerp(za, zb, r()), d = 3 + r() * 4;
        const bh = theme === 'bazaar' ? hb + 3 + r() * (hr + 2) : hb + r() * hr;
        const col = theme === 'roof' ? new THREE.Color(PASTEL[Math.floor(r() * PASTEL.length)]).multiplyScalar(0.92) : new THREE.Color('#5a3a52').multiplyScalar(0.55 + r() * 0.3);
        col.lerp(row ? skyC : fogC, haze).lerp(fogC, haze * 0.5);
        boxFaces(A, x, -12, z0 - d, x + bw, bh, z0, col, F_FRONT | F_TOP | F_LEFT | F_RIGHT, 0.5);
        if (theme === 'roof' && r() < 0.5) boxFaces(A, x + 0.4, bh, z0 - d + 0.4, x + bw - 0.4, bh + 0.5, z0 - 0.4, col.clone().multiplyScalar(0.9), F_FRONT | F_TOP | F_LEFT | F_RIGHT, 0.5);
        x += bw + Math.floor(r() * (2 + row * 2));
      }
    });
    shadeLow(A, -12, 4, 0.45);
    const g = accGeo(A);
    const bm = own(std({ map: t.facade, normalMap: t.facadeN, emissiveMap: t.facadeE, emissive: new THREE.Color(theme === 'bazaar' ? '#ffb070' : '#ff9a50'), emissiveIntensity: theme === 'bazaar' ? 2.0 : 0.55, roughness: 0.9, vertexColors: true }));
    const m = new THREE.Mesh(g, bm); m.receiveShadow = false; group.add(m);
  }
  const props = [];
  if (theme === 'roof') {
    // rooftop clutter behind the play line: tanks, plants, antennas, dishes, stair rooms
    for (let x = 2; x < w - 2; x++) {
      const tp = topAt(M, x); if (tp < 1) continue;
      const k = r();
      if (k < 0.07) { props.push(cylG(0.45, 0.45, 0.9, 14, '#1d2024', [x + 0.5, tp + 0.45, -1.2]), cylG(0.3, 0.46, 0.18, 14, '#1d2024', [x + 0.5, tp + 0.99, -1.2])); }
      else if (k < 0.14) { props.push(cylG(0.18, 0.13, 0.3, 10, '#b8642a', [x + 0.5, tp + 0.15, -1.25]), sphG(0.22, '#3f8a3a', [x + 0.5, tp + 0.42, -1.25], [1, 0.8, 1]), sphG(0.16, '#4f9a3a', [x + 0.38, tp + 0.5, -1.2])); }
      else if (k < 0.18) { props.push(limbG([x + 0.5, tp, -1.4], [x + 0.5, tp + 2.6, -1.4], 0.025, '#8a8a8a'), limbG([x + 0.1, tp + 2.2, -1.4], [x + 0.9, tp + 2.2, -1.4], 0.02, '#8a8a8a'), limbG([x + 0.2, tp + 1.8, -1.4], [x + 0.8, tp + 1.8, -1.4], 0.02, '#8a8a8a')); }
      else if (k < 0.21) { props.push(boxG(0.7, 0.5, 0.5, '#c8c4bc', [x + 0.5, tp + 0.25, -1.3]), boxG(0.5, 0.36, 0.04, '#55595e', [x + 0.5, tp + 0.27, -1.04]), limbG([x + 0.3, tp + 0.5, -1.3], [x + 0.2, tp + 0.9, -1.3], 0.02, '#888')); }
      else if (k < 0.235 && topAt(M, x + 1) === tp && topAt(M, x + 2) === tp) { props.push(boxG(2, 1.6, 1.2, '#e6cdb0', [x + 1, tp + 0.8, -1.35]), boxG(2.1, 0.12, 1.3, '#bba890', [x + 1, tp + 1.62, -1.35]), boxG(0.6, 1.2, 0.05, '#3a2a20', [x + 1, tp + 0.6, -0.74])); x += 2; }
    }
    // kites in the dusk sky
    const kites = [];
    for (let i = 0; i < 26; i++) kites.push({ x: r() * (w + 60) - 30, y: 12 + r() * 16, z: -14 - r() * 34, s: 0.9 + r() * 0.8, rz: (r() - 0.5) * 0.6, col: ['#ff3d7a', '#ffd23f', '#2fd0a0', '#3a7aff', '#ff7a1a', '#c77dff'][i % 6], ph: r() * TAU });
    const kg = mergeG([prep(new THREE.ShapeGeometry((() => { const s = new THREE.Shape(); s.moveTo(0, 0.55); s.lineTo(0.38, 0.05); s.lineTo(0, -0.5); s.lineTo(-0.38, 0.05); s.closePath(); return s; })()), '#ffffff'), limbG([0, -0.5, 0], [1.2, -9, 0], 0.008, '#ffffff')]);
    dyn.kites = inst(group, kg, own(std({ vertexColors: true, roughness: 0.7, side: THREE.DoubleSide })), kites, { dynamic: true });
    // laundry lines over the alleys
    const clothes = [], ropes = [];
    M.pits.forEach(([px, n], i) => {
      const yl = Math.min(topAt(M, px - 1), topAt(M, px + n)) - 1.2; if (yl < 0) return;
      ropes.push(limbG([px - 0.1, yl, -0.6], [px + n + 0.1, yl, -0.6], 0.015, '#d8d0c0'));
      for (let k = 0.6; k < n; k += 0.85) clothes.push({ x: px + k, y: yl, z: -0.6, s: 0.8 + r() * 0.5, col: ['#e83a5a', '#ffd23f', '#3a9aff', '#ffffff', '#ff8a2a', '#9a3aaf', '#2fb07a'][Math.floor(r() * 7)], ph: r() * TAU });
      if (i % 2 === 0) ropes.push(limbG([px - 0.2, yl + 1.6, -1.0], [px + n + 0.2, yl + 1.3, -1.0], 0.012, '#c8c0b0'));
    });
    if (ropes.length) group.add(new THREE.Mesh(mergeG(ropes), Mt.vc));
    const shirt = new THREE.Shape(); shirt.moveTo(-0.14, 0); shirt.lineTo(-0.3, -0.12); shirt.lineTo(-0.22, -0.26); shirt.lineTo(-0.15, -0.2); shirt.lineTo(-0.15, -0.66); shirt.lineTo(0.15, -0.66); shirt.lineTo(0.15, -0.2); shirt.lineTo(0.22, -0.26); shirt.lineTo(0.3, -0.12); shirt.lineTo(0.14, 0); shirt.lineTo(0.06, -0.06); shirt.lineTo(-0.06, -0.06); shirt.closePath();
    const cg = new THREE.ShapeGeometry(shirt);
    dyn.clothes = inst(group, cg, own(std({ roughness: 0.85, side: THREE.DoubleSide })), clothes, { dynamic: true, shadow: true });
  } else if (theme === 'forest') {
    const trunks = [], crowns = [], vines = [];
    for (let x = -20; x < w + 30; x += 2 + r() * 3) {
      const z = -3.5 - r() * 22, h = 22 + r() * 10, rad = 0.35 + r() * 0.5;
      trunks.push(prep(new THREE.CylinderGeometry(rad * 0.7, rad * 1.2, h, 10), '#ffffff', [x, h / 2 - 10, z], null, null, true));
      for (let k = 0; k < 3; k++) crowns.push(prep(new THREE.IcosahedronGeometry(2.2 + r() * 2, 1), ['#2f5a2a', '#3a6a30', '#4a7a36', '#24482a'][Math.floor(r() * 4)], [x + (r() - 0.5) * 3, h - 10 + (r() - 0.3) * 3, z + (r() - 0.5) * 2], [r(), r(), 0], [1.2, 0.8, 1]));
    }
    const tg = mergeG(trunks, true);
    const tm = new THREE.Mesh(tg, own(std({ map: t.bark, roughness: 0.95, vertexColors: true }))); tm.receiveShadow = true; group.add(tm);
    const cm = new THREE.Mesh(mergeG(crowns), Mt.vcFlat); group.add(cm);
    // hanging vines in front of and behind the path
    for (let i = 0; i < 70; i++) vines.push({ x: r() * w, y: 16 + r() * 3, z: (r() < 0.5 ? -1.4 : -2.5) - r() * 2, sy: 3 + r() * 7, ph: r() * TAU });
    const vg = new THREE.CylinderGeometry(0.035, 0.03, 1, 5); vg.translate(0, -0.5, 0);
    dyn.vines = inst(group, vg, own(std({ color: '#3f6a2a', roughness: 0.9 })), vines, { dynamic: true });
    // shafts of light through the canopy
    const shaftTex = own(canvasTex(64, 256, (g2, w2, h2) => { const gr = g2.createLinearGradient(0, 0, 0, h2); gr.addColorStop(0, 'rgba(255,255,240,0)'); gr.addColorStop(0.25, 'rgba(255,255,235,0.55)'); gr.addColorStop(1, 'rgba(255,255,235,0)'); g2.fillStyle = gr; g2.fillRect(0, 0, w2, h2); const g3 = g2.createLinearGradient(0, 0, w2, 0); g3.addColorStop(0, 'rgba(0,0,0,1)'); g3.addColorStop(0.5, 'rgba(0,0,0,0)'); g3.addColorStop(1, 'rgba(0,0,0,1)'); g2.globalCompositeOperation = 'destination-out'; g2.fillStyle = g3; g2.fillRect(0, 0, w2, h2); }, { clamp: true }));
    const shaftMat = own(new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, color: '#f4ffe8' }));
    for (let x = 8; x < w; x += 14 + r() * 14) { const sh = new THREE.Mesh(new THREE.PlaneGeometry(3 + r() * 3, 26), shaftMat); sh.position.set(x, 8, -3 - r() * 6); sh.rotation.z = -0.32; group.add(sh); }
    // ferns on the front edge of the ground
    const ferns = [];
    for (let x = 1; x < w - 1; x++) { const tp = topAt(M, x); if (tp < 1 || r() > 0.55) continue; ferns.push({ x: x + r(), y: tp - 0.05, z: 1.0 + r() * 0.6, s: 0.8 + r() * 0.7, ry: r() * 3 }); if (r() < 0.4) ferns.push({ x: x + r(), y: tp - 0.05, z: -1.2 - r() * 0.4, s: 0.9 + r() * 0.8, ry: r() * 3 }); }
    const fg = mergeG([prep(new THREE.PlaneGeometry(1, 1), '#ffffff', [0, 0.5, 0], null, null, true), prep(new THREE.PlaneGeometry(1, 1), '#ffffff', [0, 0.5, 0], [0, Math.PI / 2, 0], null, true)], true);
    inst(group, fg, Mt.fern, ferns, {});
    // waterfalls into some pits
    M.pits.forEach(([px, n], i) => {
      if (i % 2) return;
      const h = 22, fall = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(1.5, n - 0.6), h), own(Mt.fall.clone()));
      fall.material.map = own(t.fall.clone()); fall.material.map.repeat.set(Math.max(1, Math.round(n / 1.5)), 4); fall.material.map.needsUpdate = true; ALL_TEX.push(fall.material.map);
      fall.position.set(px + n / 2, h / 2 - 9, -2.2); group.add(fall); dyn.falls.push({ m: fall, x: px + n / 2, n, y: topAt(M, px - 1) });
    });
    // mossy rocks
    for (let x = 2; x < w - 2; x++) { const tp = topAt(M, x); if (tp > 0 && r() < 0.06) props.push(prep(new THREE.IcosahedronGeometry(0.45 + r() * 0.3, 0), '#6a7060', [x + 0.5, tp + 0.15, -1.2 - r() * 0.4], [r(), r(), r()], [1.3, 0.7, 1]), sphG(0.3, '#4f8a36', [x + 0.5, tp + 0.45, -1.2], [1.3, 0.3, 1])); }
  } else {
    // bazaar stalls behind the street, lanterns and string lights overhead
    const awn = [], bulbs = [], goods = [];
    for (let x = 1; x < w - 3; x += 3 + Math.floor(r() * 3)) {
      const tp = topAt(M, x); if (tp < 1 || topAt(M, x + 2) !== tp) continue;
      const z = -1.5;
      props.push(boxG(2.6, 0.9, 1.0, '#6a4228', [x + 1.3, tp + 0.45, z]), boxG(2.7, 0.08, 1.1, '#8a5a32', [x + 1.3, tp + 0.92, z]), limbG([x + 0.05, tp, z - 0.4], [x + 0.05, tp + 2.4, z - 0.4], 0.04, '#3a2a1a'), limbG([x + 2.55, tp, z - 0.4], [x + 2.55, tp + 2.4, z - 0.4], 0.04, '#3a2a1a'));
      awn.push({ x: x + 1.3, y: tp + 2.45, z: z + 0.1, rx: 0.35, sx: 1, s: 1 });
      const kind = r();
      for (let k = 0; k < 6; k++) goods.push(sphG(0.13 + r() * 0.05, kind < 0.33 ? ['#ff7a1a', '#ffb21a', '#ff4a2a'][k % 3] : kind < 0.66 ? ['#c83a8a', '#ffd23f', '#3a9aff'][k % 3] : ['#e8d8b8', '#c8a878', '#8a6a4a'][k % 3], [x + 0.5 + k * 0.32, tp + 1.08, z + (k % 2) * 0.2]));
      bulbs.push(sphG(0.11, ['#ffb04a', '#ff5a8a', '#ffd27a'][Math.floor(r() * 3)], [x + 0.4 + r() * 1.8, tp + 2.05, z + 0.55]));
    }
    if (goods.length) { const gm = new THREE.Mesh(mergeG(goods), Mt.vcGloss); group.add(gm); }
    const ag = new THREE.BoxGeometry(2.9, 0.08, 1.3);
    inst(group, ag, Mt.stripe, awn, { shadow: true });
    // string lights strung in catenaries across the scene
    for (let x = -10; x < w + 10; x += 7) {
      const y0 = 10 + r() * 3, y1 = 10 + r() * 3, z = -1 - r() * 4, n = 16;
      for (let k = 0; k <= n; k++) { const f = k / n, sag = Math.sin(f * Math.PI) * 1.6; bulbs.push(sphG(0.07, ['#ffd27a', '#ff6a8a', '#7ae0ff', '#ffb04a', '#a6ff7a'][k % 5], [x + f * 7, lerp(y0, y1, f) - sag, z])); }
    }
    if (bulbs.length) { const bm = new THREE.Mesh(mergeG(bulbs), Mt.bulb); group.add(bm); }
    for (let x = -10; x < w + 10; x += 7) props.push(limbG([x, 11.2, -3], [x + 3.5, 9.6, -3], 0.01, '#222'), limbG([x + 3.5, 9.6, -3], [x + 7, 11.2, -3], 0.01, '#222'));
    // big hanging lanterns
    const lan = [];
    for (let x = 4; x < w; x += 9 + r() * 6) { const y = 7.5 + r() * 3; lan.push(cylG(0.32, 0.26, 0.6, 10, '#ff8a2a', [x, y, -0.8]), cylG(0.12, 0.12, 0.08, 8, '#ffd27a', [x, y + 0.34, -0.8])); props.push(limbG([x, y + 0.36, -0.8], [x, 14, -0.8], 0.012, '#222')); }
    if (lan.length) { const lm = new THREE.Mesh(mergeG(lan), Mt.bulb); group.add(lm); }
  }
  if (props.length) { const pm = new THREE.Mesh(mergeG(props), Mt.vc); pm.castShadow = true; pm.receiveShadow = true; group.add(pm); }
  group.children.forEach((c) => { if (c.isInstancedMesh) list.push(c); });
  return { list, dyn };
}

function buildWorld(M) {
  const skey = M.id + ':' + M.li + ':' + (M.indoor ? 'room' : M.theme) + ':' + M.w;
  if (R.built && R.built.skey === skey) {
    // a respawn: same level, fresh blocks, coins and enemies
    R.built.M = M; R.built.version = M.version; R.built.tilesV = -1;
    if (R.built.gate) { R.built.gate.visible = false; R.built.gate.position.y = M.arena.floor - 5; }
    if (FX) FX.clear();
    return;
  }
  const g = R.world;
  disposeGroup(g);
  R.ents = new Map(); R.freeEnts = {};
  const theme = M.indoor ? 'room' : M.theme;
  R.built = { skey, M, version: M.version, theme, decor: [], blocks: null, flag: null, gate: null, tilesV: -1 };
  setLook(M.indoor ? 'room' : M.theme);
  const mts = terrainMats(M.theme, M.indoor);
  buildTerrain(M, g, mts);
  buildStatic(M, g);
  const d = buildDecor(M, g);
  R.built.decor = d.list; R.built.dyn = d.dyn;
  // jalebis
  const curve = new THREE.CatmullRomCurve3((() => { const pts = []; for (let i = 0; i <= 40; i++) { const a = i / 40 * TAU * 2.25, rr = 0.06 + 0.26 * i / 40; pts.push(new THREE.Vector3(Math.cos(a) * rr, Math.sin(a) * rr, Math.sin(i * 0.9) * 0.02)); } return pts; })());
  const jg = new THREE.TubeGeometry(curve, 80, 0.055, 6);
  R.built.coins = new THREE.InstancedMesh(jg, mats().jalebi, Math.max(1, M.coins.length));
  R.built.coins.instanceMatrix.setUsage(THREE.DynamicDrawUsage); R.built.coins.castShadow = true; R.built.coins.frustumCulled = false;
  g.add(R.built.coins);
  // blocks
  let nb = 0, nq = 0, nu = 0;
  for (let i = 0; i < M.spec.length; i++) { const t = M.spec[i]; if (t === T_BRICK) nb++; else if (t === T_Q) nq++; else if (t === 5) nu++; }
  nu += nq;
  const bg = new THREE.BoxGeometry(1, 1, 1);
  const B = { brick: new THREE.InstancedMesh(bg, mats().brick, Math.max(1, nb)), q: new THREE.InstancedMesh(bg, mats().qblock, Math.max(1, nq)), used: new THREE.InstancedMesh(bg, mats().used, Math.max(1, nu)), idx: new Map() };
  [B.brick, B.q, B.used].forEach((im) => { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); im.frustumCulled = false; g.add(im); });
  R.built.blocks = B;
  // boss gate
  if (M.arena) {
    const gate = new THREE.Mesh(new THREE.BoxGeometry(1, 9, 1.6), mats().stone); gate.position.set(M.arena.gate + 0.5, M.arena.floor - 5, 0); gate.castShadow = true; gate.visible = false; g.add(gate);
    R.built.gate = gate;
  }
  // light for the attic and the bazaar
  if (M.indoor) { R.fill.color.set('#ffc080'); R.fill.intensity = 30; R.fill.distance = 16; R.fill.position.set(12, 8.4, 0.6); }
  else if (M.theme === 'bazaar') { R.fill.color.set('#ff9a50'); R.fill.intensity = 0; }
  else R.fill.intensity = 0;
  if (FX) FX.clear();
  applyTier();
}

function syncBlocks(M) {
  const B = R.built.blocks;
  if (R.built.tilesV !== M.tilesV) {
    R.built.tilesV = M.tilesV;
    let nb = 0, nq = 0, nu = 0; B.idx.clear();
    for (let y = 0; y < H; y++) for (let x = 0; x < M.w; x++) {
      const t = M.t[y * M.w + x];
      let im = null, i = 0;
      if (t === T_BRICK) { im = B.brick; i = nb++; } else if (t === T_Q) { im = B.q; i = nq++; } else if (t === T_USED) { im = B.used; i = nu++; }
      if (!im) continue;
      _m4.makeTranslation(x + 0.5, y + 0.5, 0); im.setMatrixAt(i, _m4);
      B.idx.set(KEY(x, y), { im, i, x, y });
    }
    B.brick.count = nb; B.q.count = nq; B.used.count = nu;
    [B.brick, B.q, B.used].forEach((im) => { im.instanceMatrix.needsUpdate = true; });
  }
  if (M.bump.size || R.built.bumped) {
    R.built.bumped = M.bump.size > 0;
    B.idx.forEach((v, k) => {
      const b = M.bump.get(k) || 0, off = b > 0 ? Math.sin((1 - b / 0.2) * Math.PI) * 0.28 : 0;
      const s = 1 + off * 0.25;
      _m4.makeScale(s, 1 - off * 0.15, s); _m4.setPosition(v.x + 0.5, v.y + 0.5 + off, 0); v.im.setMatrixAt(v.i, _m4); v.im.instanceMatrix.needsUpdate = true;
    });
  }
  mats().qblock.emissiveIntensity = 0.45 + Math.sin(R.time * 3) * 0.25;
}
function syncCoins(M) {
  const im = R.built.coins, t = R.time;
  for (let i = 0; i < M.coins.length; i++) {
    const c = M.coins[i];
    if (c.got && c.t >= 1) { _m4.makeScale(0, 0, 0); im.setMatrixAt(i, _m4); continue; }
    const rise = c.got ? c.t * 1.3 : Math.sin(t * 2.4 + i * 0.7) * 0.06, s = c.got ? 1 + c.t * 0.6 : 1;
    _e.set(0, t * 2.2 + i * 0.5 + (c.got ? c.t * 20 : 0), 0, 'YXZ'); _q.setFromEuler(_e);
    _s3.set(s, s, s); _p3.set(c.x, c.y + rise, 0);
    _m4.compose(_p3, _q, _s3); im.setMatrixAt(i, _m4);
  }
  im.count = M.coins.length; im.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------ entities in 3D */
function entModel(e, theme) {
  const pool = R.freeEnts[e.type];
  if (pool && pool.length) { const m = pool.pop(); m.root.visible = true; return m; }
  let m;
  if (e.type === 'coconut') m = makeCoconut();
  else if (e.type === 'pigeon') m = makePigeon();
  else if (e.type === 'rickshaw') m = makeRickshaw();
  else if (e.type === 'monkey') m = makeMonkey();
  else if (e.type === 'spring') m = makeSpring();
  else if (e.type === 'mover') m = makeMover(theme);
  else if (e.type === 'check') m = makeCheck();
  else m = makeItem(e.type);
  m.type = e.type;
  R.world.add(m.root);
  if (tier().cheap) m.root.traverse((o) => { if (o.isMesh && o.material && !o.userData.keepMat) o.material = cheapOf(o.material); });
  return m;
}
const _seen = new Set();
function syncEnts(Gm, dt, viewW) {
  const M = Gm.map, theme = M.theme, t = R.time, cx = Gm.cam.x;
  _seen.clear();
  for (let i = 0; i < M.ents.length; i++) {
    const e = M.ents[i];
    let m = R.ents.get(e);
    if (!m) { m = entModel(e, theme); R.ents.set(e, m); }
    _seen.add(e);
    if (e.type === 'monkey') { m.root.visible = Math.abs(e.x - cx) < viewW / 2 + 8; poseMonkey(Gm, e, m, dt); continue; }
    const near = Math.abs(e.x - cx) < viewW / 2 + 6;
    m.root.visible = near && !(e.dead > 0.35 && !e.alive);
    if (!m.root.visible) continue;
    m.root.position.set(e.x, e.y, 0);
    const deadK = !e.alive ? clamp(e.dead / 0.3, 0, 1) : 0;
    if (e.type === 'coconut') {
      m.ball.rotation.z = e.rot || 0;
      m.root.scale.set(0.88 * (1 + deadK * 0.5), 0.88 * (1 - deadK * 0.85), 0.88 * (1 + deadK * 0.5));
      m.face.position.x = e.dir * 0.02;
    } else if (e.type === 'pigeon') {
      const fl = Math.sin(t * 22 + e.id) * 0.9;
      m.pF.rotation.x = -fl; m.pB.rotation.x = -fl;
      m.yaw.rotation.y = e.dir > 0 ? -0.5 : Math.PI + 0.5;
      m.yaw.rotation.z = e.swoop > 0 ? -0.5 * (e.dir > 0 ? 1 : -1) : 0;
      m.root.scale.setScalar(1 - deadK * 0.9);
    } else if (e.type === 'rickshaw') {
      m.yaw.rotation.y = e.dir > 0 ? -0.35 : Math.PI + 0.35;
      const wr = e.pause > 0 ? 0 : -t * 9;
      m.rear.rotation.z = wr; m.front.rotation.z = wr; m.key.rotation.x = (e.key || 0);
      m.yaw.position.y = Math.abs(Math.sin(t * 14)) * 0.03;
      m.root.scale.set(1 + deadK * 0.4, 1 - deadK * 0.85, 1 + deadK * 0.4);
    } else if (e.type === 'spring') { const k = e.comp; m.top.position.y = 0.46 - Math.sin(k * Math.PI) * 0.18; m.top.scale.y = 1 + k * 2; }
    else if (e.type === 'mover') { /* moves with e */ }
    else if (e.type === 'check') {
      m.flag.position.y = 0.7 + e.raise * 1.75; m.flag.rotation.y = Math.sin(t * 5) * 0.2;
      if (e.on) { m.fm.color.set('#ff9a2a'); m.fm.emissiveIntensity = 0.5 + Math.sin(t * 4) * 0.2; }
    } else if (e.type === 'ball') { m.spin.rotation.z = -(e.rot || 0); m.spin.rotation.x = (e.rot || 0) * 0.7; }
    else {
      m.spin.rotation.y = e.type === 'chilli' || e.type === 'diya' ? t * 1.5 : t * 2.5;
      m.root.position.y = e.y + (e.rise > 0 ? 0 : Math.sin(t * 4) * 0.04);
      if (m.root.userData.flame) m.root.userData.flame.scale.set(0.8 + Math.sin(t * 30) * 0.1, 1.8 + Math.sin(t * 23) * 0.3, 0.8);
      if (e.type === 'diya' && FX && Math.random() < dt * 8) FX.emit('add', e.x + rnd(-0.2, 0.2), e.y + 0.5, 0.2, 0, 0.8, 0, 0.6, 0.2, '#ffd27a', 0.8, -0.5, 0, 0);
      if (!e.alive) m.root.visible = false;
    }
  }
  R.ents.forEach((m, e) => {
    if (_seen.has(e)) return;
    m.root.visible = false;
    R.ents.delete(e);
    (R.freeEnts[m.type] = R.freeEnts[m.type] || []).push(m);
  });
}
function poseMonkey(Gm, e, m, dt) {
  const t = R.time, st = e.state;
  let x = e.x, y = e.y;
  // the kite theft in the boss level intro
  if (Gm.phase === 'intro' && Gm.cut) {
    const P = Gm.P, ct = Gm.cut.t;
    if (ct < 0.6) { x = P.x + 8; y = P.y + 9; }
    else if (ct < 1.45) { const k = smooth01((ct - 0.6) / 0.85); x = lerp(P.x + 8, P.x - 0.6, k); y = lerp(P.y + 9, P.y + 1.2, k) + Math.sin(k * Math.PI) * 2; }
    else { const k = smooth01((ct - 1.45) / 1.1); x = lerp(P.x - 0.6, P.x + 14, k); y = P.y + 1.2 + Math.sin(k * Math.PI) * 5; }
    m.root.visible = true;
    e.kite = ct >= 1.45;
  } else if (Gm.phase === 'intro' && Gm.base && Gm.base.boss) { m.root.visible = false; }
  m.root.position.set(x, y, 0);
  const face = Gm.phase === 'intro' ? (Gm.cut && Gm.cut.t < 1.45 ? -1 : 1) : e.face;
  m.yaw.rotation.y = face > 0 ? -0.45 : Math.PI + 0.45;
  m.kite.visible = !!e.kite; m.banana.visible = !e.kite && st === 'give';
  m.stars.visible = st === 'dizzy';
  if (m.stars.visible) { m.stars.rotation.y += dt * 6; m.stars.children.forEach((s, i) => { const a = i / 4 * TAU; s.position.set(Math.cos(a) * 0.5, Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.5); }); }
  const sw = Math.sin(t * (st === 'charge' ? 14 : 4));
  m.armF.p.rotation.z = st === 'throw' ? -2.4 + Math.max(0, Math.sin(e.st * 9)) * 2 : st === 'give' ? -2.6 + sw * 0.4 : sw * 0.3;
  m.armB.p.rotation.z = st === 'charge' ? -sw * 0.8 : -sw * 0.3 + (st === 'perch' ? -1.2 + Math.sin(t * 9) * 0.3 : 0);
  m.legF.p.rotation.z = st === 'leap' ? 0.9 : st === 'charge' ? sw * 0.8 : 0.1;
  m.legB.p.rotation.z = st === 'leap' ? 0.7 : st === 'charge' ? -sw * 0.8 : -0.1;
  m.body.rotation.z = st === 'dizzy' ? Math.sin(t * 8) * 0.2 : st === 'charge' ? -0.25 : st === 'leap' ? -0.4 : 0;
  m.head.rotation.z = st === 'perch' ? Math.sin(t * 3) * 0.12 : 0;
  m.tail.rotation.x = Math.sin(t * 2.5) * 0.3;
  const sq = st === 'perch' ? 1 + Math.sin(t * 6) * 0.03 : 1;
  m.body.scale.set(1, sq, 1);
}

/* ------------------------------------------------------------ the hero in 3D */
function poseHero(Gm, dt, rm) {
  const Hh = R.hero, P = Gm.P, t = R.time, ph = Gm.phase;
  if (!P) { Hh.root.visible = false; return; }
  Hh.root.visible = !P.inside && !(P.inv > 0 && Math.floor(P.inv * 14) % 2 === 0 && !rm) && ph !== 'map';
  Hh.root.position.set(P.x, P.y, 0);
  // size: small, big, and the classic three-step grow
  let target = P.big ? 0.95 : 0.52;
  if (P.grow) { const k = Math.abs(P.grow); const step = Math.floor((1 - k) * 6) % 2; target = P.grow > 0 ? (step ? 0.95 : 0.7) : (step ? 0.52 : 0.75); }
  Hh.scl = lerp(Hh.scl, target, Math.min(1, dt * 18));
  // squash and stretch
  let sqT = 1;
  if (P.land > 0) sqT = 1 - 0.22 * P.land * clamp(P.landV / 22, 0.3, 1);
  else if (!P.onGround && P.vy > 6) sqT = 1.1;
  if (rm) sqT = 1;
  Hh.sq = lerp(Hh.sq, sqT, Math.min(1, dt * 22));
  Hh.body.scale.set(Hh.scl / Math.sqrt(Hh.sq), Hh.scl * Hh.sq, Hh.scl / Math.sqrt(Hh.sq));
  // facing, turned a little toward the camera
  const yawT = P.face > 0 ? -0.42 : Math.PI + 0.42;
  let dy = yawT - Hh.yawV; while (dy > Math.PI) dy -= TAU; while (dy < -Math.PI) dy += TAU;
  Hh.yawV += dy * Math.min(1, dt * 14);
  Hh.yaw.rotation.y = Hh.yawV;
  const onG = P.onGround || ph === 'intro' || ph === 'respawn' || ph === 'map', spd = Math.abs(P.vx);
  const run = onG && spd > 0.4 && ph === 'play';
  const cyc = P.walk * (P.big ? 2.1 : 3.4);
  let thF = 0, thB = 0, knF = 0, knB = 0, shF = 0, shB = 0, elF = -0.3, elB = -0.3, lean = 0, bob = 0, armsUp = 0;
  const k = clamp(spd / 9, 0, 1);
  if (run) {
    thF = Math.sin(cyc) * (0.5 + 0.5 * k); thB = -thF;
    knF = Math.max(0, -Math.cos(cyc)) * (0.6 + 0.6 * k); knB = Math.max(0, Math.cos(cyc)) * (0.6 + 0.6 * k);
    shF = -thF * 0.9; shB = -thB * 0.9; elF = -0.6 - k * 0.6; elB = -0.6 - k * 0.6;
    lean = -0.12 - k * 0.18; bob = Math.abs(Math.cos(cyc)) * 0.05 * (1 + k);
  } else if (!onG && ph === 'play') {
    if (P.gliding) { thF = 0.3 + Math.sin(t * 5) * 0.15; thB = -0.1 + Math.sin(t * 5 + 1) * 0.15; knF = 0.4; knB = 0.6; armsUp = 1; lean = 0.05; }
    else if (P.wall) { thF = 0.9; thB = 0.3; knF = 1.2; knB = 0.6; shF = -2.4; shB = -0.5; elF = -0.2; lean = 0.1; }
    else if (P.vy > 0) { thF = 1.0; thB = -0.3; knF = 1.4; knB = 0.4; shF = -2.6; shB = 0.6; elF = -0.4; elB = -0.8; lean = -0.1; }
    else { thF = 0.4; thB = -0.4; knF = 0.6; knB = 0.3; shF = -1.4; shB = 1.0; elF = -0.4; elB = -0.4; lean = 0.05; }
  } else {
    const br = Math.sin(t * 2.2);
    shF = 0.08 + br * 0.04; shB = -0.08 - br * 0.04; bob = br * 0.008;
  }
  if (P.dashT > 0) { lean = -0.55; shF = 1.3; shB = 1.6; thF = -0.6; thB = 0.8; knF = 1.0; knB = 0.3; }
  if (ph === 'dead') { shF = -2.8; shB = -2.8; elF = -0.2; elB = -0.2; thF = 0.4; thB = -0.4; Hh.yaw.rotation.y = 0.0; Hh.body.rotation.z = Math.sin(t * 10) * 0.2; }
  else Hh.body.rotation.z = 0;
  if (P.flag) { shF = -2.9; shB = -2.7; thF = 0.6; thB = 0.5; knF = 0.5; knB = 0.6; lean = 0; }
  if (Gm.goal && (Gm.goal.step === 'walk' || Gm.goal.step === 'boss' || Gm.goal.step === 'tally') && onG && !run) { shF = -2.9 + Math.sin(t * 8) * 0.3; shB = -2.9 - Math.sin(t * 8) * 0.3; bob = Math.abs(Math.sin(t * 8)) * 0.08; }
  if (ph === 'goal' && Gm.goal.step === 'walk') { const c2 = P.walk * 3.4; thF = Math.sin(c2) * 0.6; thB = -thF; knF = Math.max(0, -Math.cos(c2)) * 0.8; knB = Math.max(0, Math.cos(c2)) * 0.8; shF = -thF; shB = thF; }
  if (armsUp) { shF = -2.9; shB = -2.9; elF = 0.25; elB = 0.25; }
  const sm = Math.min(1, dt * 18);
  const L = (o, v) => { o.rotation.z = lerp(o.rotation.z, v, sm); };
  L(Hh.legF.hip, thF); L(Hh.legB.hip, thB); L(Hh.legF.knee, -knF); L(Hh.legB.knee, -knB);
  L(Hh.armF.sh, shF); L(Hh.armB.sh, shB); L(Hh.armF.el, elF); L(Hh.armB.el, elB);
  Hh.torso.rotation.z = lerp(Hh.torso.rotation.z, lean, sm);
  Hh.hips.position.y = 0.8 + bob; Hh.torso.position.y = 0.8 + bob;
  Hh.head.rotation.z = lerp(Hh.head.rotation.z, P.vy > 8 ? 0.15 : P.vy < -10 ? -0.2 : 0, sm);
  // blink
  Hh.blink -= dt; if (Hh.blink < 0) Hh.blink = 2.5 + Math.random() * 3;
  Hh.eyes.scale.y = Hh.blink < 0.12 ? 0.15 : 1;
  // kite: on the back, overhead while gliding, gone when stolen
  const kp = Hh.kitePivot;
  Hh.kite.visible = P.kite;
  if (P.gliding && P.kite) {
    kp.position.lerp(_v1.set(0.12, 2.35, 0), sm); kp.rotation.set(lerp(kp.rotation.x, -1.05, sm), 0, lerp(kp.rotation.z, 0.15 + Math.sin(t * 3) * 0.08, sm));
    Hh.strings.visible = Hh.strings2.visible = true;
  } else {
    kp.position.lerp(_v1.set(-0.25, 1.32 + bob, 0.05), sm); kp.rotation.set(lerp(kp.rotation.x, 0, sm), 0, lerp(kp.rotation.z, 0.4 + Math.sin(t * 2) * 0.03, sm));
    Hh.strings.visible = Hh.strings2.visible = false;
  }
  if (Hh.strings.visible) {
    [[Hh.strings, 0.27], [Hh.strings2, -0.27]].forEach(([s, z]) => {
      _v2.set(0.05, 1.55, z); _v3.set(0.12 + (z > 0 ? 0.25 : -0.25) * 0, 2.25, z * 0.6);
      s.position.copy(_v2); _v1.subVectors(_v3, _v2); const len = _v1.length(); _q.setFromUnitVectors(_up, _v1.normalize()); s.quaternion.copy(_q); s.scale.set(1, len, 1);
    });
  }
  Hh.kite.userData.tail.rotation.z = Math.sin(t * 6) * 0.25;
  // power looks
  const M = mats();
  const chilli = P.power === 'chilli';
  M.kurta.color.set(chilli ? '#fff1e2' : '#2a86e0'); M.cap.color.set(chilli ? '#e8241a' : '#e8402a');
  if (P.star > 0) {
    _c.setHSL(0.1 + Math.sin(t * 8) * 0.04, 1, 0.55);
    M.kurta.emissive.copy(_c); M.kurta.emissiveIntensity = 0.9 + Math.sin(t * 20) * 0.3 * (rm ? 0 : 1); M.skin.emissive.set('#ff9a3a'); M.skin.emissiveIntensity = 0.25;
    Hh.glow.intensity = 6 + Math.sin(t * 18) * 2;
  } else { M.kurta.emissiveIntensity = chilli && P.dashT > 0 ? 0.6 : 0; M.kurta.emissive.set('#ff4a1a'); M.skin.emissiveIntensity = 0; Hh.glow.intensity = 0; }
  Hh.stars.visible = ph === 'dead';
  if (Hh.stars.visible) Hh.stars.children.forEach((s, i) => { const a = t * 6 + i / 3 * TAU; s.position.set(Math.cos(a) * 0.32, 0.32, Math.sin(a) * 0.32); });
}

/* ------------------------------------------------------------ the world map diorama */
function buildMapScene() {
  if (R.mapG) return R.mapG;
  const g = new THREE.Group(), Mt = mats(), parts = [], bulbs = [];
  g.position.set(0, -200, 0);
  parts.push(cylG(15, 15.4, 0.6, 48, '#7aa04e', [0, -0.3, 0]), cylG(15.4, 14.6, 0.8, 48, '#d9c08a', [0, -0.9, 0]), cylG(14.6, 12, 5, 48, '#6a5240', [0, -3.8, 0]));
  for (let k = 0; k < 40; k++) { const a = k / 40 * TAU + 0.1; parts.push(sphG(0.4 + (k % 3) * 0.18, '#4f7a3a', [Math.cos(a) * 14.3, 0.05, Math.sin(a) * 14.3], [1, 0.45, 1])); }
  const nodes = [];
  for (let i = 0; i < 9; i++) { const a = -2.4 + i * 0.6, rr = 6 + (i % 3) * 2.2 + Math.sin(i) * 0.6; nodes.push(new THREE.Vector3(Math.cos(a) * rr, 0.1, Math.sin(a) * rr * 0.75)); }
  // regions: rooftops, forest, bazaar
  const rr = rng(77);
  for (let k = 0; k < 18; k++) { const n = nodes[Math.floor(rr() * 3)], x = n.x + (rr() - 0.5) * 6, z = n.z + (rr() - 0.5) * 5, h = 0.6 + rr() * 1.6; parts.push(boxG(0.9 + rr() * 0.6, h, 0.9, PASTEL[k % PASTEL.length], [x, h / 2, z]), cylG(0.15, 0.15, 0.25, 8, '#1d2024', [x, h + 0.12, z])); }
  for (let k = 0; k < 26; k++) { const n = nodes[3 + Math.floor(rr() * 3)], x = n.x + (rr() - 0.5) * 6, z = n.z + (rr() - 0.5) * 5; parts.push(cylG(0.08, 0.12, 0.8, 6, '#4a3626', [x, 0.4, z]), coneG(0.55 + rr() * 0.3, 1.4, 7, ['#2f6a2a', '#3a7a30', '#4a8a36'][k % 3], [x, 1.4, z])); }
  for (let k = 0; k < 12; k++) { const n = nodes[6 + Math.floor(rr() * 3)], x = n.x + (rr() - 0.5) * 5, z = n.z + (rr() - 0.5) * 4; parts.push(boxG(1, 0.5, 0.7, '#6a4228', [x, 0.25, z]), boxG(1.2, 0.06, 0.9, ['#e83a5a', '#ff9a2a', '#2fb07a'][k % 3], [x, 0.85, z], [0.3, 0, 0])); bulbs.push(sphG(0.08, ['#ffd27a', '#ff6a8a', '#7ae0ff'][k % 3], [x, 0.7, z + 0.4])); }
  nodes.forEach((n, i) => { parts.push(cylG(0.7, 0.8, 0.25, 20, ['#ff9a4a', '#5fc07a', '#ff5fa2'][Math.floor(i / 3)], [n.x, 0.12, n.z])); });
  for (let i = 0; i < 8; i++) for (let k = 1; k < 6; k++) { const f = k / 6; parts.push(sphG(0.09, '#fff2d8', [lerp(nodes[i].x, nodes[i + 1].x, f), 0.08, lerp(nodes[i].z, nodes[i + 1].z, f)])); }
  const m = new THREE.Mesh(mergeG(parts), Mt.vc); m.castShadow = true; m.receiveShadow = true; g.add(m);
  if (bulbs.length) g.add(new THREE.Mesh(mergeG(bulbs), Mt.bulb));
  const sea = new THREE.Mesh(new THREE.CircleGeometry(160, 48), std({ color: '#3a6a8a', roughness: 0.18, metalness: 0.3 })); sea.rotation.x = -Math.PI / 2; sea.position.y = -1.6; sea.receiveShadow = true; g.add(sea);
  const cl = []; for (let k = 0; k < 14; k++) { const a = k / 14 * TAU, rr2 = 24 + (k % 4) * 6; for (let j = 0; j < 4; j++) cl.push(sphG(1.4 + j * 0.3, '#fff4ea', [Math.cos(a) * rr2 + j * 1.3, 5 + (k % 3) * 2, Math.sin(a) * rr2], [1.3, 0.7, 1])); }
  g.add(new THREE.Mesh(mergeG(cl), Mt.vc));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.07, 8, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.8) })); ring.rotation.x = Math.PI / 2; g.add(ring); R.mapRing = ring;
  R.mapNodes = nodes;
  R.scene.add(g); g.visible = false;
  R.mapG = g;
  return g;
}

/* ------------------------------------------------------------ camera */
const CAM = { pos: new THREE.Vector3(), look: new THREE.Vector3(), cine: 0, init: false, fov: 34 };
const _gp = new THREE.Vector3(), _gl = new THREE.Vector3(), _cp = new THREE.Vector3(), _cl = new THREE.Vector3();
function cameraFor(Gm, a, dt) {
  const cam = R.camera, c = Gm.cam, P = Gm.P, rm = a.reducedMotion, aspect = a.w / a.h;
  const fov0 = 34, tanH = Math.tan(fov0 * Math.PI / 360);
  const d = c.viewH / 2 / tanH * (1 - (rm ? 0 : (R.punch || 0) * 0.035));
  const elev = d * 0.13;
  const shx = a.shakeX / (a.h / c.viewH), shy = a.shakeY / (a.h / c.viewH);
  _gp.set(c.x + shx, c.y + elev - shy, d * (1 + (P && P.gliding && !rm ? 0.06 : 0)));
  _gl.set(c.x + shx, c.y - 0.2 - shy, 0);
  let fov = fov0 + (rm ? 0 : c.kick * 4);
  // cinematic shots blend over gameplay
  let w = 0;
  const ph = Gm.phase;
  if (ph === 'intro') {
    const dur = Gm.cut ? 3.2 : 2.6, k = smooth01(Gm.pt / dur), kk = 1 - k;
    w = 1;
    const sx = Gm.cut ? -2 : 13;
    _cp.set(c.x + sx * kk + (rm ? 0 : Math.sin(Gm.pt * 0.6) * 0.5), c.y + elev + 5 * kk, d * (1 + 0.9 * kk));
    _cl.set(c.x + sx * 0.6 * kk, c.y - 0.2 + 1.5 * kk, -3 * kk);
    if (Gm.cut && Gm.cut.t > 0.5) { _cp.set(P.x + 2 + Gm.cut.t * 1.2, P.y + 3, d * 0.75); _cl.set(P.x + Gm.cut.t * 1.6, P.y + 2, 0); }
    fov = fov0 - 4 * kk;
    if (k > 0.85) w = 1 - (k - 0.85) / 0.15;
  } else if ((ph === 'goal' || ph === 'bosswin' || ph === 'ending' || a.state === 'over') && P) {
    const tt = ph === 'goal' || ph === 'bosswin' ? (Gm.goal ? Gm.goal.t + (Gm.goal.step !== 'slide' ? 1 : 0) : 0) : Gm.pt;
    const yaw = rm ? 0.2 : clamp(0.15 + tt * 0.08, 0, 0.55) * (ph === 'ending' || a.state === 'over' ? Math.sin(R.time * 0.15) * 1.4 : 1);
    const dd = d * (a.state === 'over' ? 0.8 : 0.66);
    const fx = Gm.gameOver ? c.x : Gm.map && Gm.map.flag && ph === 'goal' ? (P.x + Gm.map.flag.x) / 2 : P.x;
    _cl.set(fx + 1, Gm.gameOver ? c.y : P.y + 1.4, 0);
    _cp.set(_cl.x + Math.sin(yaw) * dd, _cl.y + dd * 0.18, Math.cos(yaw) * dd);
    w = 1;
  } else if (ph === 'dead' && P) {
    _cl.set(c.x, c.y, 0); _cp.set(c.x, c.y + elev * 0.8, d * 0.86); w = 0.8;
  } else if (Gm.boss && Gm.boss.intro > 0 && Gm.boss.e) {
    const m = Gm.boss.e; _cl.set(m.x, m.y + 1.4, 0); _cp.set(m.x - 2, m.y + 2.6, d * 0.6); w = clamp(Gm.boss.intro / 0.4, 0, 1);
  }
  CAM.cine = lerp(CAM.cine, w, Math.min(1, dt * (w > CAM.cine ? 3 : 2.2)));
  if (ph === 'intro') CAM.cine = w;
  const cw = smooth01(CAM.cine);
  const posT = _v1.copy(_gp).lerp(_cp, cw), lookT = _v2.copy(_gl).lerp(_cl, cw);
  if (!CAM.init || CAM.snaps !== Gm.cam.snaps) { CAM.pos.copy(posT); CAM.look.copy(lookT); CAM.init = true; CAM.snaps = Gm.cam.snaps; }
  const sm = cw > 0.01 ? Math.min(1, dt * 4) : 1;
  CAM.pos.lerp(posT, sm); CAM.look.lerp(lookT, sm);
  CAM.fov = lerp(CAM.fov, fov, Math.min(1, dt * 6));
  cam.position.copy(CAM.pos);
  cam.lookAt(CAM.look);
  if (!rm) cam.rotateZ(c.roll * (1 - cw));
  if (Math.abs(cam.fov - CAM.fov) > 0.01 || cam.aspect !== aspect) { cam.fov = CAM.fov; cam.aspect = aspect; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}

/* ------------------------------------------------------------ events become effects */
function effects(Gm) {
  const ev = Gm.ev, P = Gm.P, theme = Gm.map ? Gm.map.theme : 'roof';
  const dcol = theme === 'forest' ? '#8a7a5a' : theme === 'bazaar' ? '#a8909a' : '#d8c6ae';
  for (let i = 0; i < ev.length; i++) {
    const e = ev[i];
    switch (e.t) {
      case 'jump': dust(e.x, e.y, 0.1, 5, dcol, 1.2); break;
      case 'land': if (e.v > 10 || e.boss) { dust(e.x, e.y, 0.1, e.boss ? 20 : Math.round(clamp(e.v / 3, 3, 10)), dcol, e.boss ? 4 : 2.2); } break;
      case 'step': if (Math.random() < 0.6 && FX) FX.emit('soft', e.x, e.y + 0.05, rnd(-0.2, 0.2), rnd(-0.5, 0.5), 0.4, 0, 0.4, 0.25, dcol, 0.3, 0, 2, 1.5); break;
      case 'coin': burst('add', e.x, e.y, 0.1, 12, 3, 1, ['#ffd27a', '#ff9a2a', '#fff2c0'], 0.5, 0.16, 2, 3); if (FX) FX.emit('add', e.x, e.y, 0.1, 0, 0, 0, 0.25, 1.4, '#ffcf6a', 0.6, 0, 0, 0); break;
      case 'bump': dust(e.x, e.y - 0.5, 0.2, 3, '#d8c6ae', 1); if (e.q) burst('add', e.x, e.y + 0.5, 0.3, 8, 2, 2, '#fff2b0', 0.4, 0.14, 4, 2); break;
      case 'brick': burst('conf', e.x, e.y, 0, 18, 6, 4, ['#b55a34', '#8a3a20', '#d87a4a'], 1.1, 0.3, 14, 0.5); dust(e.x, e.y, 0, 6, '#c8a088', 2); break;
      case 'sprout': case 'reveal': burst('add', e.x, e.y, 0.3, 14, 2.5, 1.5, ['#ffffff', '#ffe28a'], 0.7, 0.16, 1, 2); break;
      case 'power': burst('add', e.x, e.y, 0.3, 40, 5, 1, e.kind === 'chilli' ? ['#ff4a1a', '#ffb21a', '#ffffff'] : e.kind === 'diya' ? ['#ffe28a', '#ffffff', '#ffb04a'] : ['#ffb21a', '#ff7a2a', '#ffffff'], 0.9, 0.22, 0, 2); R.flash = Math.max(R.flash, 0.25); break;
      case 'shrink': burst('soft', e.x, e.y, 0.2, 10, 2, 1, '#ffffff', 0.8, 0.5, 0, 2); break;
      case 'pop':
        burst('conf', e.x, e.y, 0.2, 26, 5, 3, CONF, 1.4, 0.24, 9, 1.2);
        burst('soft', e.x, e.y, 0.3, 8, 1.6, 0.6, '#ffffff', 0.6, 0.6, 0, 3);
        if (e.kind === 'pigeon') burst('conf', e.x, e.y, 0.2, 10, 3, 2, ['#c8d0dc', '#8a96aa'], 1.6, 0.3, 3, 2);
        break;
      case 'stomp': if (FX) { FX.emit('add', e.x, e.y, 0.3, 0, 0, 0, 0.22, 1.8, '#ffffff', 0.8, 0, 0, 1); } R.punch = Math.max(R.punch, 0.4 + Math.min(0.4, e.combo * 0.1)); break;
      case 'spring': dust(e.x, e.y, 0.2, 6, dcol, 2); burst('add', e.x, e.y + 0.3, 0.3, 8, 2, 4, '#ffffff', 0.4, 0.12, 0, 2); break;
      case 'dash': dust(e.x, e.y - 0.5, 0.1, 6, dcol, 2.5); break;
      case 'walljump': dust(e.x, e.y, 0.1, 6, dcol, 1.5); break;
      case 'slide': if (FX) FX.emit('soft', e.x, e.y, rnd(-0.2, 0.3), rnd(-0.3, 0.3), 0.8, 0, 0.5, 0.3, dcol, 0.35, 0, 2, 2); break;
      case 'check': burst('add', e.x, e.y, 0.2, 30, 4, 4, ['#ffb21a', '#ffffff', '#ff7a2a'], 1.0, 0.18, 3, 1.5); burst('conf', e.x, e.y + 0.6, 0.2, 18, 4, 3, CONF, 1.6, 0.22, 6, 1); break;
      case 'die': burst('add', e.x, e.y + 0.4, 0.3, 16, 3, 2, ['#ffe28a', '#ffffff'], 0.8, 0.18, 0, 2); break;
      case 'flag': burst('add', e.x, e.y + 1, 0.3, 24, 3, 2, ['#ffe28a', '#ffffff', '#ff9a2a'], 1.0, 0.2, 1, 1.2); break;
      case 'firework': firework(e.x, e.y); break;
      case 'pipe': dust(e.x, e.y + 0.3, 0.1, 8, '#6a6a6a', 1.2); break;
      case 'oneup': burst('add', e.x, e.y, 0.3, 24, 3, 3, ['#7dff9a', '#ffffff'], 0.9, 0.18, 0, 1.4); break;
      case 'bosshit': burst('conf', e.x, e.y, 0.2, 40, 7, 4, CONF, 1.6, 0.26, 9, 1); if (FX) FX.emit('add', e.x, e.y, 0.3, 0, 0, 0, 0.3, 3.4, '#ffffff', 0.9, 0, 0, 1); R.punch = 1; R.flash = Math.max(R.flash, 0.35); break;
      case 'gate': dust(e.x, e.y - 2, 0.3, 24, '#a89888', 3); break;
      case 'steal': burst('conf', e.x, e.y, 0.2, 12, 3, 2, ['#ff3d7a', '#ffd23f', '#2fd0a0'], 1.2, 0.2, 4, 1); break;
      case 'kiteback': burst('add', e.x, e.y, 0.3, 50, 5, 3, ['#ff3d7a', '#ffd23f', '#2fd0a0', '#ffffff'], 1.4, 0.22, 1, 1); break;
      case 'puff': burst('soft', e.x, e.y, 0.2, 5, 1, 0.5, '#ffd27a', 0.4, 0.4, 0, 2); break;
      default: break;
    }
  }
  // continuous: fire dash flames, glide streaks, star sparkles
  if (P && FX && Gm.phase === 'play') {
    if (P.dashT > 0 && P.fireDash) for (let k = 0; k < 3; k++) FX.emit('add', P.x - P.dashDir * 0.3 + rnd(-0.2, 0.2), P.y + rnd(0.2, P.h), rnd(-0.3, 0.3), -P.dashDir * rnd(2, 5), rnd(0, 1.5), 0, 0.35, rnd(0.3, 0.5), k ? '#ff7a1a' : '#ffd23f', 0.9, -2, 2, -0.5);
    else if (P.dashT > 0) FX.emit('add', P.x - P.dashDir * 0.4, P.y + P.h * 0.5 + rnd(-0.3, 0.3), 0, -P.dashDir * 6, 0, 0, 0.18, 0.18, '#ffffff', 0.6, 0, 0, 0);
    if (P.gliding && Math.random() < 0.6) FX.emit('add', P.x + rnd(-1, 1), P.y + rnd(0, 2.5), rnd(-0.5, 0.5), -P.vx * 0.6 - P.face * 3, 1.5, 0, 0.3, 0.07, '#ffffff', 0.5, 0, 0, 0);
    if (P.star > 0 && Math.random() < 0.8) FX.emit('add', P.x + rnd(-0.5, 0.5), P.y + rnd(0, P.h), rnd(-0.3, 0.3), rnd(-1, 1), rnd(0.5, 2), 0, 0.6, 0.16, ['#ffe28a', '#ffffff', '#ff9a3a'][Math.floor(Math.random() * 3)], 1, 0, 1, 0);
    if (P.power === 'chilli' && Math.random() < 0.15) FX.emit('add', P.x + rnd(-0.2, 0.2), P.y + P.h + 0.1, 0, 0, 1, 0, 0.5, 0.12, '#ff6a1a', 0.7, -1, 1, 0);
  }
}

/* ------------------------------------------------------------ per-frame */
function themeAmbient(Gm, dt, a) {
  const M = Gm.map, L = R.L, cam = R.camera, rm = a.reducedMotion;
  if (!M || !FX) return;
  const cx = cam.position.x, cy = Gm.cam.y;
  if (!M.indoor && M.theme === 'forest') {
    const n = Math.round(dt * 380 * FX.density);
    for (let i = 0; i < n; i++) FX.emit('rain', cx + rnd(-16, 16), cy + rnd(6, 12), rnd(-8, 4), -2.5, -22, 0, 1.2, 0.5, '#cfe2ff', 0.4, 0, 0, 0);
    if (Math.random() < dt * 30 * FX.density) { const x = cx + rnd(-10, 10), tp = topAt(M, Math.floor(x)); if (tp > 0) FX.emit('soft', x, tp + 0.05, rnd(-1, 1.5), 0, 0.6, 0, 0.25, 0.15, '#e8f2ff', 0.5, 2, 0, 1); }
    R.lightning -= dt;
    if (R.lightning < 0) { R.lightning = 6 + Math.random() * 9; if (!rm) { R.bolt = 0.35; setTimeout(() => { try { if (!(ARC && ARC.sfx.muted)) ARC.sfx.noise(1.4, { filter: 'lowpass', freq: 260, vol: 0.4 }); } catch (e) { /* no sound */ } }, 500); } }
    if (R.bolt > 0) R.bolt -= dt;
    const fl = R.bolt > 0 ? (Math.sin(R.bolt * 60) > 0 ? 1 : 0.2) * R.bolt * 2.4 : 0;
    R.skyU.uFlash.value = fl; R.hemi.intensity = L.hemiI * (1 + fl * 2);
    const d = R.built.dyn;
    d.falls.forEach((f) => { f.m.material.map.offset.y += dt * 1.6; if (Math.abs(f.x - cx) < 14 && Math.random() < dt * 14 * FX.density) FX.emit('soft', f.x + rnd(-f.n / 2, f.n / 2), f.y - 1.5, -2 + rnd(-0.5, 0.5), rnd(-1, 1), rnd(0.5, 2), rnd(0, 1), 1.2, 1.1, '#ffffff', 0.25, -0.3, 1, 1.5); });
  } else R.skyU.uFlash.value = 0;
  if (!M.indoor && M.theme === 'bazaar' && Math.random() < dt * 0.35 && !Gm.attract) firework(cx + rnd(-14, 14), cy + rnd(9, 15));
  if (!M.indoor && M.theme === 'roof' && Math.random() < dt * 1.4 && FX) FX.emit('soft', cx + rnd(-15, 15), cy + rnd(-4, 8), rnd(-3, 1), 0.6, 0.15, 0, 4, 0.06, '#fff2dc', 0.5, 0, 0, 0);
  const d = R.built.dyn, t = R.time;
  if (d.kites) { const it = d.kites.userData.items; for (let i = 0; i < it.length; i++) { const k = it[i]; _e.set(0, Math.sin(t * 0.7 + k.ph) * 0.3, k.rz + Math.sin(t * 1.3 + k.ph) * 0.25, 'YXZ'); _q.setFromEuler(_e); _s3.setScalar(k.s); _p3.set(k.x + Math.sin(t * 0.5 + k.ph) * 0.8, k.y + Math.sin(t * 0.9 + k.ph) * 0.6, k.z); _m4.compose(_p3, _q, _s3); d.kites.setMatrixAt(i, _m4); } d.kites.instanceMatrix.needsUpdate = true; }
  if (d.clothes) { const it = d.clothes.userData.items; for (let i = 0; i < it.length; i++) { const k = it[i]; if (Math.abs(k.x - cx) > 20) continue; _e.set(Math.sin(t * 2.2 + k.ph) * 0.35, 0, Math.sin(t * 1.7 + k.ph) * 0.08, 'YXZ'); _q.setFromEuler(_e); _s3.setScalar(k.s); _p3.set(k.x, k.y, k.z); _m4.compose(_p3, _q, _s3); d.clothes.setMatrixAt(i, _m4); } d.clothes.instanceMatrix.needsUpdate = true; }
  if (d.vines) { const it = d.vines.userData.items; for (let i = 0; i < it.length; i++) { const k = it[i]; if (Math.abs(k.x - cx) > 22) continue; _e.set(0, 0, Math.sin(t * 0.8 + k.ph) * 0.06, 'YXZ'); _q.setFromEuler(_e); _s3.set(1, k.sy, 1); _p3.set(k.x, k.y, k.z); _m4.compose(_p3, _q, _s3); d.vines.setMatrixAt(i, _m4); } d.vines.instanceMatrix.needsUpdate = true; }
}

function shadowFollow(Gm) {
  const c = Gm.cam, sun = R.sun, sc = sun.shadow.camera;
  const vw = c.viewH * (R.camera.aspect) / 2 + 5, vh = c.viewH / 2 + 5;
  const step = (vw * 2) / (sun.shadow.mapSize.x || 1024);
  const tx = Math.round(c.x / step) * step, ty = Math.round(c.y / step) * step;
  sun.target.position.set(tx, ty, 0);
  sun.position.set(tx + R.sunDir.x * 60, ty + R.sunDir.y * 60, R.sunDir.z * 60);
  if (sc.right !== vw || sc.top !== vh) { sc.left = -vw; sc.right = vw; sc.top = vh; sc.bottom = -vh; sc.near = 5; sc.far = 140; sc.updateProjectionMatrix(); }
  sun.target.updateMatrixWorld(); sun.updateMatrixWorld();
}

const _pv = new THREE.Vector3();
R.project = function (x, y, out) {
  _pv.set(x, y, 0).project(R.camera);
  out.ok = _pv.z < 1 && _pv.z > -1;
  out.x = (_pv.x * 0.5 + 0.5) * ARC.w; out.y = (-_pv.y * 0.5 + 0.5) * ARC.h;
  return out;
};
R.gfx = function () { return R.renderer ? { quality: R.ql, fps: Math.round(R.fps), soft: R.soft, calls: R.renderer.info.render.calls, tris: R.renderer.info.render.triangles, post: tier().post } : null; };
R.graphics = function (level) { if (!R.renderer) return; if (level === 'auto') { R.lockQ = false; return; } R.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); };
R.quality = function (q) { if (!R.renderer) return; R.lockQ = true; setQuality(q); };
R.resize = function (a) { if (R.failed) return; resize(a); };
R.init = function (a) {
  ARC = a;
  if (!setup(a)) {
    // WebGL refused to start after all: draw the same game with the 2D renderer on the HUD canvas.
    R.failed = false; R.fallback = true;
    Object.assign(R, { kind: '2d', render: C.R2.render.bind(C.R2), project: C.R2.project.bind(C.R2), gfx: C.R2.gfx.bind(C.R2) });
    C.R2.init(a);
    return true;
  }
  R.flagTime = { value: 0 };
  setQuality(R.soft ? 0 : a.device === 'desktop' ? 3 : 2);
  resize(a);
  setLook('roof');
  return true;
};
R.onStart = function () { CAM.init = false; };

R.render = function (ctx, a, Gm) {
  const now = performance.now(), dtRaw = R.lastNow ? (now - R.lastNow) / 1000 : 1 / 60, dt = clamp(dtRaw, 0.001, 0.1); R.lastNow = now;
  if (R.lost || R.renderer.getContext().isContextLost()) {
    ctx.fillStyle = 'rgba(6,5,3,.85)'; ctx.fillRect(0, 0, a.w, a.h);
    C.txt(ctx, 'Graphics paused. Restoring...', a.w / 2, a.h / 2, 16, '#fff6e8', 'center', '600'); return;
  }
  measureFps(dtRaw);
  const paused = a.state === 'pause';
  const fdt = paused ? 0 : dt;
  R.time += fdt;
  R.flagTime.value = R.time;
  R.skyU.uTime.value = R.time;
  if (!Gm) { R.renderer.setRenderTarget(null); R.renderer.render(R.scene, R.camera); return; }
  const rm = a.reducedMotion;
  // world map between levels
  if (Gm.phase === 'map' || !Gm.map) { renderMap(Gm, a, fdt); post(a, Gm, true); return; }
  if (R.mapG) R.mapG.visible = false;
  R.world.visible = true;
  if (!R.built || R.built.M !== Gm.map || R.built.version !== Gm.map.version) buildWorld(Gm.map);
  C.camStep(Gm, fdt || 1e-4, a.w / a.h);
  cameraFor(Gm, a, fdt || 1e-4);
  const viewW = Gm.cam.viewH * a.w / a.h;
  syncBlocks(Gm.map); syncCoins(Gm.map); syncEnts(Gm, fdt, viewW);
  if (R.built.gate) { R.built.gate.visible = !!Gm.map.gateOn; if (Gm.map.gateOn) R.built.gate.position.y = lerp(R.built.gate.position.y, Gm.map.arena.floor + 4.5, Math.min(1, fdt * 6)); }
  if (R.built.flag && Gm.map.flag) R.built.flag.position.y = Gm.goal && Gm.goal.flagY != null && (Gm.phase === 'goal') ? Gm.goal.flagY : Gm.map.flag.y1 - 1.2;
  poseHero(Gm, fdt, rm);
  if (!paused) { effects(Gm); themeAmbient(Gm, fdt, a); }
  if (FX) FX.update(fdt, a.h * R.renderer.getPixelRatio() * 0.5 / Math.tan(R.camera.fov * Math.PI / 360));
  shadowFollow(Gm);
  R.sky.position.copy(R.camera.position);
  if (Gm.P && !Gm.map.indoor) { R.fill.position.set(Gm.P.x + 0.5, Gm.P.y + 2.4, 3.2); R.fill.color.set(R.L && R.L.night ? '#ffb070' : '#fff0dc'); R.fill.intensity = R.L && R.L.night ? 16 : 7; R.fill.distance = 12; }
  R.flash = Math.max(0, R.flash - fdt * 2.5); R.punch = Math.max(0, (R.punch || 0) - fdt * 3);
  post(a, Gm, false);
};

function renderMap(Gm, a, dt) {
  const g = buildMapScene(); g.visible = true; R.world.visible = false;
  setLook('map');
  const nodes = R.mapNodes, from = nodes[clamp(Gm.mapFrom || 0, 0, 8)], to = nodes[clamp(Gm.li, 0, 8)];
  const k = smooth01(Gm.pt / 1.5);
  _v1.copy(from).lerp(to, k); _v1.y += Math.abs(Math.sin(Gm.pt * 9)) * 0.5 * (k < 1 ? 1 : 0.2);
  const Hh = R.hero; Hh.root.visible = true;
  Hh.root.position.set(_v1.x, _v1.y - 200 + 0.25, _v1.z);
  Hh.body.scale.setScalar(0.9); Hh.kite.visible = true;
  Hh.yaw.rotation.y = Math.atan2(-(to.z - from.z), to.x - from.x) || -0.4;
  const cyc = Gm.pt * 12; Hh.legF.hip.rotation.z = Math.sin(cyc) * 0.6 * (k < 1 ? 1 : 0); Hh.legB.hip.rotation.z = -Hh.legF.hip.rotation.z; Hh.armF.sh.rotation.z = -Hh.legF.hip.rotation.z; Hh.armB.sh.rotation.z = Hh.legF.hip.rotation.z;
  const ang = (a.reducedMotion ? 0 : R.time * 0.06) + 0.35, rr = a.w < a.h ? 30 : 23, push = smooth01(Gm.pt / 2.5);
  R.camera.position.set(_v1.x * 0.35 + Math.sin(ang) * rr * (1.15 - push * 0.15), -200 + (a.w < a.h ? 26 : 17) - push * 3, _v1.z * 0.35 + Math.cos(ang) * rr * (1.15 - push * 0.15));
  R.camera.lookAt(_v1.x * 0.5, -200 - 1, _v1.z * 0.5);
  if (R.mapRing) { R.mapRing.position.set(to.x, 0.3 + Math.sin(R.time * 4) * 0.08, to.z); R.mapRing.scale.setScalar(1 + Math.sin(R.time * 5) * 0.08); }
  if (R.camera.fov !== 40) { R.camera.fov = 40; R.camera.updateProjectionMatrix(); }
  CAM.init = false;
  R.sun.target.position.set(0, -200, 0); R.sun.position.set(R.sunDir.x * 50, -200 + R.sunDir.y * 50, R.sunDir.z * 50);
  const sc = R.sun.shadow.camera; sc.left = -18; sc.right = 18; sc.top = 18; sc.bottom = -18; sc.near = 1; sc.far = 120; sc.updateProjectionMatrix();
  R.sun.target.updateMatrixWorld(); R.sun.updateMatrixWorld();
  R.sky.position.copy(R.camera.position);
  if (FX) FX.update(dt, a.h * R.renderer.getPixelRatio() * 0.5 / Math.tan(R.camera.fov * Math.PI / 360));
  R.built = null;
}

const _irisP = { x: 0, y: 0, ok: true };
function post(a, Gm, isMap) {
  const r = R.renderer, t = tier();
  // iris centre on the hero
  let ix = 0.5, iy = 0.5;
  if (Gm && Gm.P && !isMap) { const p = R.project(Gm.P.x, Gm.P.y + 0.6, _irisP); ix = clamp(p.x / a.w, 0, 1); iy = clamp(1 - p.y / a.h, 0, 1); }
  const iris = Gm ? Gm.iris : 1;
  if (!t.post) {
    r.setRenderTarget(null); r.render(R.scene, R.camera);
    if (iris < 0.999) {
      const ctx = a.ctx, rad = iris * Math.hypot(a.w, a.h);
      ctx.save(); ctx.fillStyle = '#060403'; ctx.beginPath(); ctx.rect(0, 0, a.w, a.h); ctx.arc(ix * a.w, (1 - iy) * a.h, Math.max(0.1, rad), 0, TAU, true); ctx.fill('evenodd'); ctx.restore();
    }
    return;
  }
  makeRTs();
  r.setRenderTarget(R.rt); r.clear(); r.render(R.scene, R.camera);
  const bl = R.bl, n = t.bloomN;
  R.mBright.uniforms.tDiffuse.value = R.rt.texture; R.mBright.uniforms.uTexel.value.set(1 / R.rt.width, 1 / R.rt.height);
  pass(R.mBright, bl[0].a);
  for (let i = 0; i < n; i++) {
    const L = bl[i];
    if (i > 0) { R.mDown.uniforms.tDiffuse.value = bl[i - 1].a.texture; R.mDown.uniforms.uTexel.value.set(1 / bl[i - 1].w, 1 / bl[i - 1].h); pass(R.mDown, L.a); }
    R.mBlur.uniforms.tDiffuse.value = L.a.texture; R.mBlur.uniforms.uDir.value.set(1 / L.w, 0); pass(R.mBlur, L.b);
    R.mBlur.uniforms.tDiffuse.value = L.b.texture; R.mBlur.uniforms.uDir.value.set(0, 1 / L.h); pass(R.mBlur, L.a);
  }
  const u = R.mComp.uniforms, rm = a.reducedMotion;
  u.tScene.value = R.rt.texture; u.tB1.value = bl[0].a.texture; u.tB2.value = bl[1].a.texture; u.tB3.value = bl[2].a.texture; u.uLevels.value = n;
  u.uTime.value = R.time; u.uAspect.value = a.w / a.h; const asp = a.w / a.h, far = Math.max(Math.hypot(ix * asp, iy), Math.hypot((1 - ix) * asp, iy), Math.hypot(ix * asp, 1 - iy), Math.hypot((1 - ix) * asp, 1 - iy)) + 0.01;
  u.uIris.value = iris >= 0.999 ? 2 : iris * far; u.uIrisC.value.set(ix, iy);
  u.uFlash.value = rm ? 0 : R.flash * 0.25; u.uGrain.value = rm ? 0.01 : 0.022;
  u.uExposure.value = 1 + (Gm && Gm.P && Gm.P.star > 0 && !rm ? 0.08 : 0);
  pass(R.mComp, null);
}

C.run(R);
