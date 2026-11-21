import * as THREE from '/games/vendor/three/three.module.min.js';
import { createHuman } from '/games/shared/human.js';
import { createVFX } from '/games/shared/vfx.js';
import { boot, HW, HL, HC, RC, GW, GH, GD, BR, H0, TEAM, clamp, lerp, TAU, smooth01, surf } from '/games/nitro-goal/core.js';

/*
 * Nitro Goal in 3D. The rules live in core.js; this file builds the stadium,
 * the cars and the ball, films the match, and runs its own post pass (bloom,
 * vignette, film grain and a colour grade) before tone mapping.
 *
 * A floodlit bowl on the edge of an Indian city at dusk or night: a turf pitch
 * whose edges curve up into walls, glass above them, tiers of fans, four light
 * masts, and a skyline of towers, domes and a temple spire beyond the roof.
 */

/* ------------------------------------------------------------ small helpers */
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s3 = new THREE.Vector3(), _p3 = new THREE.Vector3(), _c = new THREE.Color(), _c2 = new THREE.Color();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
function rng(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// Bake a primitive: place it, give it one vertex colour, drop its uvs, so a whole model merges into one mesh.
function prep(geo, hex, pos, rot, scl, extra) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (g !== geo) geo.dispose();
  if (g.attributes.uv) g.deleteAttribute('uv');
  if (g.attributes.uv1) g.deleteAttribute('uv1');
  _e.set(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0, 'YXZ'); _q.setFromEuler(_e);
  if (scl == null) _s3.set(1, 1, 1); else if (typeof scl === 'number') _s3.set(scl, scl, scl); else _s3.set(scl[0], scl[1], scl[2]);
  _p3.set(pos ? pos[0] : 0, pos ? pos[1] : 0, pos ? pos[2] : 0);
  _m4.compose(_p3, _q, _s3); g.applyMatrix4(_m4);
  const n = g.attributes.position.count, col = new Float32Array(n * 3), ex = new Float32Array(n);
  _c.set(hex);
  for (let i = 0; i < n; i++) { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; ex[i] = extra || 0; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aEx', new THREE.BufferAttribute(ex, 1));
  return g;
}
function mergeG(list) {
  let n = 0; list.forEach((g) => { n += g.attributes.position.count; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), ex = new Float32Array(n);
  let o = 0;
  list.forEach((g) => {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    if (g.attributes.aEx) ex.set(g.attributes.aEx.array, o);
    o += g.attributes.position.count; g.dispose();
  });
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setAttribute('aEx', new THREE.BufferAttribute(ex, 1));
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}
const boxG = (w, h, d, hex, pos, rot, ex) => prep(new THREE.BoxGeometry(w, h, d), hex, pos, rot, null, ex);
const cylG = (rt, rb, h, seg, hex, pos, rot, scl) => prep(new THREE.CylinderGeometry(rt, rb, h, seg), hex, pos, rot, scl);
const sphG = (r, hex, pos, scl, ws, hs, ex) => prep(new THREE.SphereGeometry(r, ws || 12, hs || 9), hex, pos, null, scl, ex);
const coneG = (r, h, seg, hex, pos, rot) => prep(new THREE.ConeGeometry(r, h, seg), hex, pos, rot);

/* ------------------------------------------------------------ textures */
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
  const r = rng(seed), G = new Float32Array(cells * cells); for (let i = 0; i < G.length; i++) G[i] = r();
  return (u, v) => {
    const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y), tx = x - xi, ty = y - yi;
    const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
    const g = (i, j) => G[((j % cells + cells) % cells) * cells + ((i % cells + cells) % cells)];
    return lerp(lerp(g(xi, yi), g(xi + 1, yi), sx), lerp(g(xi, yi + 1), g(xi + 1, yi + 1), sx), sy);
  };
}
function normalTex(size, hf, strength, rep) {
  return canvasTex(size, size, (g) => {
    const H = new Float32Array(size * size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) H[y * size + x] = hf(x / size, y / size);
    const im = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = H[y * size + ((x - 1 + size) % size)], r = H[y * size + ((x + 1) % size)], u = H[((y - 1 + size) % size) * size + x], d = H[((y + 1) % size) * size + x];
      let nx = (l - r) * strength, ny = (u - d) * strength, nz = 1; const m = Math.hypot(nx, ny, nz); nx /= m; ny /= m; nz /= m;
      const o = (y * size + x) * 4; im.data[o] = (nx * 0.5 + 0.5) * 255; im.data[o + 1] = (ny * 0.5 + 0.5) * 255; im.data[o + 2] = (nz * 0.5 + 0.5) * 255; im.data[o + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, { data: true, repeat: rep });
}
const PW = HW - RC, PL = HL - RC; // the flat pitch: |x| < PW, |z| < PL
let TX = null;
function textures() {
  if (TX) return TX;
  TX = {};
  // the pitch: mown stripes, worn patches, glowing white lines and team-tinted ends
  const PXM = 12; // pixels per metre
  const tw = Math.round(PW * 2 * PXM), th = Math.round(PL * 2 * PXM);
  const lines = (g, w, h, col, lw) => {
    const X = (x) => (x + PW) * PXM, Z = (z) => (PL - z) * PXM;
    g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
    g.strokeRect(X(-PW + 1), Z(PL - 1), (PW * 2 - 2) * PXM, (PL * 2 - 2) * PXM);
    g.beginPath(); g.moveTo(X(-PW + 1), Z(0)); g.lineTo(X(PW - 1), Z(0)); g.stroke();
    g.beginPath(); g.arc(X(0), Z(0), 10 * PXM, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.arc(X(0), Z(0), 1.1 * PXM, 0, Math.PI * 2); g.fillStyle = col; g.fill();
    [-1, 1].forEach((s) => {
      const z0 = s * (PL - 1), z1 = s * (PL - 15);
      g.beginPath(); g.moveTo(X(-GW - 6), Z(z0)); g.lineTo(X(-GW - 6), Z(z1)); g.lineTo(X(GW + 6), Z(z1)); g.lineTo(X(GW + 6), Z(z0)); g.stroke();
      g.beginPath(); g.arc(X(0), Z(z1), 7 * PXM, s > 0 ? 0 : Math.PI, s > 0 ? Math.PI : Math.PI * 2); g.stroke();
    });
    // kickoff marks
    [[-20, -30], [20, -30], [-3, -44], [3, -44], [0, -50], [20, 30], [-20, 30], [3, 44], [-3, 44], [0, 50]].forEach((k) => { g.fillRect(X(k[0]) - 0.6 * PXM, Z(k[1]) - 0.15 * PXM, 1.2 * PXM, 0.3 * PXM); });
  };
  TX.pitch = canvasTex(tw, th, (g, w, h) => {
    const r = rng(11);
    g.fillStyle = '#2f6b2a'; g.fillRect(0, 0, w, h);
    const sw = 6 * PXM;
    for (let y = 0, k = 0; y < h; y += sw, k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.055)' : 'rgba(0,0,0,0.07)'; g.fillRect(0, y, w, sw); }
    for (let x = 0, k = 0; x < w; x += sw * 1.6, k++) { g.fillStyle = k % 2 ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.02)'; g.fillRect(x, 0, sw * 1.6, h); }
    for (let i = 0; i < 9000; i++) { const v = (r() - 0.5) * 0.12; g.fillStyle = v > 0 ? 'rgba(220,255,200,' + v + ')' : 'rgba(0,20,0,' + (-v) + ')'; g.fillRect(r() * w, r() * h, 1 + r() * 3, 1 + r() * 3); }
    // wear in the goal mouths and the centre
    [[w / 2, 18], [w / 2, h - 18], [w / 2, h / 2]].forEach((p, i) => { const gr = g.createRadialGradient(p[0], p[1], 0, p[0], p[1], (i === 2 ? 90 : 120)); gr.addColorStop(0, 'rgba(120,110,60,0.35)'); gr.addColorStop(1, 'rgba(120,110,60,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    // team tint toward each end
    const t0 = g.createLinearGradient(0, h, 0, h * 0.62); t0.addColorStop(0, 'rgba(255,122,26,0.16)'); t0.addColorStop(1, 'rgba(255,122,26,0)'); g.fillStyle = t0; g.fillRect(0, 0, w, h);
    const t1 = g.createLinearGradient(0, 0, 0, h * 0.38); t1.addColorStop(0, 'rgba(42,184,255,0.16)'); t1.addColorStop(1, 'rgba(42,184,255,0)'); g.fillStyle = t1; g.fillRect(0, 0, w, h);
    lines(g, w, h, 'rgba(245,245,235,0.92)', 0.32 * PXM);
  }, { clamp: true });
  TX.lines = canvasTex(Math.round(tw / 2), Math.round(th / 2), (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h); g.save(); g.scale(0.5, 0.5); lines(g, w * 2, h * 2, '#ffffff', 0.3 * PXM); g.restore();
  }, { clamp: true });
  const gn = vnoise(5, 32), gn2 = vnoise(9, 8);
  TX.grassN = normalTex(128, (u, v) => gn(u, v) * 0.6 + gn2(u, v) * 0.4, 1.4, [PW / 1.5, PL / 1.5]);
  TX.grassR = canvasTex(128, 128, (g, w, h) => noiseFill(g, w, h, '#c8c8c8', 0.25, 1600, 21, 3), { data: true, repeat: [PW / 3, PL / 3] });
  // ramp and wall panels: dark composite with seams and a chevron tread
  TX.panel = canvasTex(256, 256, (g, w, h) => {
    noiseFill(g, w, h, '#3a3d46', 0.1, 1800, 31, 2);
    g.strokeStyle = 'rgba(0,0,0,0.55)'; g.lineWidth = 3; g.strokeRect(1.5, 1.5, w - 3, h - 3);
    g.strokeStyle = 'rgba(255,255,255,0.06)'; g.lineWidth = 1; g.strokeRect(5, 5, w - 10, h - 10);
    g.fillStyle = 'rgba(255,255,255,0.05)';
    for (let y = 24; y < h - 20; y += 22) for (let x = 24; x < w - 20; x += 22) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y + 6); g.lineTo(x + 16, y); g.lineTo(x + 16, y + 4); g.lineTo(x + 8, y + 10); g.lineTo(x, y + 4); g.closePath(); g.fill(); }
  });
  const pn = vnoise(41, 8);
  TX.panelN = normalTex(128, (u, v) => { const ex = Math.min(u, v, 1 - u, 1 - v) < 0.02 ? -0.5 : 0; return pn(u, v) * 0.2 + ex; }, 2.2);
  // glass: a hex lattice that glows faintly
  TX.hex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#141414'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#9a9a9a'; g.lineWidth = 2.2;
    const R = 16, dx = R * Math.sqrt(3), dy = R * 1.5;
    for (let row = -1; row < h / dy + 2; row++) for (let col = -1; col < w / dx + 2; col++) {
      const cx = col * dx + (row % 2 ? dx / 2 : 0), cy = row * dy;
      g.beginPath(); for (let k = 0; k < 6; k++) { const an = Math.PI / 6 + k * Math.PI / 3; const x = cx + Math.cos(an) * R, y = cy + Math.sin(an) * R; if (k) g.lineTo(x, y); else g.moveTo(x, y); } g.closePath(); g.stroke();
    }
  }, { data: true });
  // floodlight lamp banks
  TX.lamp = canvasTex(128, 64, (g, w, h) => {
    g.fillStyle = '#1b1c20'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 8; x++) { const gr = g.createRadialGradient(8 + x * 16, 8 + y * 16, 0, 8 + x * 16, 8 + y * 16, 8); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#fff3dc'); gr.addColorStop(1, '#3a3530'); g.fillStyle = gr; g.fillRect(x * 16 + 1, y * 16 + 1, 14, 14); }
  }, { clamp: true });
  // the LED band round the outside of the stadium
  TX.led = canvasTex(512, 32, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, '#ff7a1a'); gr.addColorStop(0.25, '#ffd36a'); gr.addColorStop(0.5, '#2ab8ff'); gr.addColorStop(0.75, '#ffffff'); gr.addColorStop(1, '#ff7a1a');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.55)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h); for (let y = 0; y < h; y += 4) g.fillRect(0, y, w, 1);
  });
  // concrete for the stands
  TX.concrete = canvasTex(128, 128, (g, w, h) => noiseFill(g, w, h, '#ffffff', 0.18, 2500, 51, 2), { repeat: [1, 1] });
  // a round pad glow
  TX.pad = canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,255,255,0.0)'); gr.addColorStop(0.62, 'rgba(255,255,255,0.15)'); gr.addColorStop(0.8, 'rgba(255,255,255,1)'); gr.addColorStop(0.9, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  }, { clamp: true, data: true });
  return TX;
}

/* ------------------------------------------------------------ sweeps: a profile run round a rounded rectangle */
// Points round a rounded rectangle (half extents ax, az, corner radius cr), anticlockwise from above, each with
// its outward normal and the distance along the loop. split: x values to land exactly on along the z sides.
function loopPts(ax, az, cr, step, cseg, split) {
  const out = []; let s = 0, px = null, pz = null;
  const push = (x, z, nx, nz) => { if (px != null) s += Math.hypot(x - px, z - pz); px = x; pz = z; out.push({ x, z, nx, nz, s }); };
  const side = (x0, z0, x1, z1, nx, nz, sp) => {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(L / step));
    let ts = []; for (let i = 0; i < n; i++) ts.push(i / n);
    if (sp && Math.abs(nz) > 0.5) sp.forEach((xs) => { const t = (xs - x0) / (x1 - x0); if (t > 0.001 && t < 0.999) ts.push(t); });
    ts = ts.sort((a, b) => a - b);
    ts.forEach((t) => push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, nx, nz));
  };
  const corner = (cx, cz, a0) => { for (let i = 0; i < cseg; i++) { const an = a0 + (i / cseg) * Math.PI / 2; push(cx + Math.cos(an) * cr, cz + Math.sin(an) * cr, Math.cos(an), Math.sin(an)); } };
  const ix = ax - cr, iz = az - cr;
  side(ax, -iz, ax, iz, 1, 0); corner(ix, iz, 0);
  side(ix, az, -ix, az, 0, 1, split); corner(-ix, iz, Math.PI / 2);
  side(-ax, iz, -ax, -iz, -1, 0); corner(-ix, -iz, Math.PI);
  side(-ix, -az, ix, -az, 0, -1, split); corner(ix, -iz, Math.PI * 1.5);
  const f = out[0]; push(f.x, f.z, f.nx, f.nz);
  return out;
}
// Sweep a profile (rows of {h, y, nh, ny, v}) round a loop. Normals point along nh/ny (h outward, y up).
function sweepGeo(loop, prof, o) {
  o = o || {};
  const pos = [], nor = [], uv = [], col = [], idx = [];
  const nr = prof.length;
  for (let i = 0; i < loop.length; i++) {
    const L = loop[i];
    for (let j = 0; j < nr; j++) {
      const P = prof[j];
      pos.push(L.x + L.nx * P.h, P.y, L.z + L.nz * P.h);
      nor.push(L.nx * P.nh, P.ny, L.nz * P.nh);
      uv.push(L.s / (o.us || 8), P.v / (o.vs || 8));
      _c.set(o.color ? o.color(L, P, j) : '#ffffff'); col.push(_c.r, _c.g, _c.b);
    }
  }
  for (let i = 0; i < loop.length - 1; i++) {
    for (let j = 0; j < nr - 1; j++) {
      if (prof[j].brk) continue;
      if (o.skip && o.skip(loop[i], loop[i + 1], prof[j], prof[j + 1])) continue;
      const a = i * nr + j, b = (i + 1) * nr + j, c = (i + 1) * nr + j + 1, d = i * nr + j + 1;
      // wind so the face looks the way the normal says
      const ax = pos[b * 3] - pos[a * 3], ay = pos[b * 3 + 1] - pos[a * 3 + 1], az = pos[b * 3 + 2] - pos[a * 3 + 2];
      const bx = pos[d * 3] - pos[a * 3], by = pos[d * 3 + 1] - pos[a * 3 + 1], bz = pos[d * 3 + 2] - pos[a * 3 + 2];
      let cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
      if (cx * cx + cy * cy + cz * cz < 1e-10) { const ex = pos[c * 3] - pos[a * 3], ey = pos[c * 3 + 1] - pos[a * 3 + 1], ez = pos[c * 3 + 2] - pos[a * 3 + 2]; cx = ey * bz - ez * by; cy = ez * bx - ex * bz; cz = ex * by - ey * bx; }
      const nx = nor[a * 3] + nor[c * 3], ny = nor[a * 3 + 1] + nor[c * 3 + 1], nz = nor[a * 3 + 2] + nor[c * 3 + 2];
      if (cx * nx + cy * ny + cz * nz > 0) idx.push(a, b, c, a, c, d); else idx.push(a, c, b, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

/* ------------------------------------------------------------ the stadium */
let R3 = null;
function std(o) { return new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.7, metalness: 0 }, o || {})); }
const QUAL = [];   // meshes that cast shadows only on the top tiers
function buildStadium(scene) {
  const tx = textures(), S = { crowdMats: [], ripple: [] };
  const grp = new THREE.Group(); scene.add(grp);
  // pitch
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PW * 2, PL * 2), std({ map: tx.pitch, normalMap: tx.grassN, normalScale: new THREE.Vector2(0.7, 0.7), roughnessMap: tx.grassR, roughness: 0.95, emissive: '#ffffff', emissiveMap: tx.lines, emissiveIntensity: 0.22 }));
  pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; grp.add(pitch);
  // the floor of each goal mouth and goal, team tinted
  [0, 1].forEach((t) => {
    const s = t === 0 ? -1 : 1, len = GD + RC;
    const g = new THREE.PlaneGeometry(GW * 2, len); g.rotateX(-Math.PI / 2); g.translate(0, 0.005, s * (PL + len / 2));
    const m = new THREE.Mesh(g, std({ color: t === 0 ? '#3a2a1c' : '#1c2a36', roughness: 0.85, map: tx.concrete, emissive: TEAM[t].col, emissiveIntensity: 0.06 }));
    m.receiveShadow = true; grp.add(m);
  });
  // the curved ramps and walls
  const loop = loopPts(HW - RC, HL - RC, 0.0001, 4, 8, [-GW, GW]);
  const rampProf = [], NS = 12, phiGH = Math.acos(1 - GH / RC);
  const phis = []; for (let i = 0; i <= NS; i++) phis.push(i / NS * Math.PI / 2); phis.push(phiGH); phis.sort((a, b) => a - b);
  let vacc = 0, prev = null;
  phis.forEach((ph) => { const h = RC * Math.sin(ph), y = RC - RC * Math.cos(ph); if (prev) vacc += Math.hypot(h - prev.h, y - prev.y); const r = { h, y, nh: -Math.sin(ph), ny: Math.cos(ph), v: vacc }; rampProf.push(r); prev = r; });
  rampProf.push({ h: RC, y: RC + 1.4, nh: -1, ny: 0, v: vacc + 1.4 });
  const inGoalCut = (L1, L2, P1, P2) => Math.abs(L1.nz) > 0.5 && Math.abs(L2.nz) > 0.5 && Math.abs((L1.x + L2.x) / 2) < GW && (P1.y + P2.y) / 2 < GH;
  const rampGeo = sweepGeo(loop, rampProf, { us: 6, vs: 6, skip: inGoalCut, color: (L) => (L.z < -HL * 0.5 ? '#d8cfc8' : L.z > HL * 0.5 ? '#c8d2da' : '#d0d0d0') });
  const rampMat = std({ map: tx.panel, normalMap: tx.panelN, normalScale: new THREE.Vector2(0.6, 0.6), vertexColors: true, roughness: 0.55, metalness: 0.35 });
  const ramp = new THREE.Mesh(rampGeo, rampMat); ramp.receiveShadow = true; grp.add(ramp);
  // the cut sides of the ramp beside each goal mouth, and the goal's own side walls
  const sideGeo = [];
  [-1, 1].forEach((sz) => [-1, 1].forEach((sx) => {
    const pts = [], n = 10;
    for (let i = 0; i <= n; i++) { const t = i / n, z = (HL - RC) + t * RC, h = RC - Math.sqrt(Math.max(0, RC * RC - (z - (HL - RC)) ** 2)); pts.push([z, Math.min(h, GH)]); }
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      const w = b[0] - a[0], h0 = a[1], h1 = b[1];
      const pg = new THREE.BufferGeometry();
      const x = sx * GW, z0 = sz * a[0], z1 = sz * b[0];
      const P = [x, 0, z0, x, 0, z1, x, h1, z1, x, h0, z0];
      pg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      const nx = -sx; pg.setAttribute('normal', new THREE.Float32BufferAttribute([nx, 0, 0, nx, 0, 0, nx, 0, 0, nx, 0, 0], 3));
      pg.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, w / 6, 0, w / 6, h1 / 6, 0, h0 / 6], 2));
      pg.setIndex((sx * sz) > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      sideGeo.push(pg);
    }
  }));
  const sideMat = std({ map: tx.panel, normalMap: tx.panelN, roughness: 0.55, metalness: 0.35, color: '#9a9aa2', side: THREE.DoubleSide });
  sideGeo.forEach((g) => { const m = new THREE.Mesh(g, sideMat); m.receiveShadow = true; grp.add(m); });
  // glass above the ramps
  const glassProf = [{ h: RC, y: RC + 1.4, nh: -1, ny: 0, v: 0 }, { h: RC, y: HC - RC, nh: -1, ny: 0, v: HC - RC - RC - 1.4 }];
  const glassGeo = sweepGeo(loop, glassProf, { us: 7, vs: 7, color: (L) => (L.z < 0 ? '#ffb47a' : '#86d4ff') });
  const glass = new THREE.Mesh(glassGeo, std({ color: '#ffffff', vertexColors: true, transparent: true, alphaMap: tx.hex, emissive: '#ffffff', emissiveMap: tx.hex, emissiveIntensity: 0.28, roughness: 0.08, metalness: 0.2, depthWrite: false, side: THREE.DoubleSide, opacity: 0.55 }));
  glass.renderOrder = 3; grp.add(glass); S.glass = glass;
  // light strips: along the top of the ramp, and along the top of the glass
  const stripProf = [{ h: RC - 0.04, y: RC + 1.25, nh: -1, ny: 0, v: 0 }, { h: RC - 0.04, y: RC + 1.62, nh: -1, ny: 0, v: 1 }, { h: RC, y: RC + 1.62, nh: 0, ny: 1, v: 1, brk: true }, { h: RC - 0.04, y: HC - RC - 0.35, nh: -1, ny: 0, v: 0 }, { h: RC - 0.04, y: HC - RC, nh: -1, ny: 0, v: 1 }];
  const stripCol = (L, P, j) => { const k = smooth01((L.z + 26) / 52); _c.set(TEAM[0].col).lerp(new THREE.Color(TEAM[1].col), k); if (j >= 3) _c.lerp(new THREE.Color('#ffffff'), 0.55); return '#' + _c.getHexString(); };
  const strip = new THREE.Mesh(sweepGeo(loop, stripProf, { color: stripCol }), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(2.6, 2.6, 2.6), toneMapped: true }));
  grp.add(strip); S.strip = strip;
  // goals: glowing frames, nets that ripple
  S.nets = [];
  [0, 1].forEach((t) => {
    const s = t === 0 ? -1 : 1, z = s * HL;
    const fg = mergeG([
      prep(new THREE.CylinderGeometry(0.32, 0.32, GW * 2 + 0.64, 14), '#ffffff', [0, GH, z], [0, 0, Math.PI / 2]),
      cylG(0.32, 0.32, GH, 14, '#ffffff', [-GW, GH / 2, z]), cylG(0.32, 0.32, GH, 14, '#ffffff', [GW, GH / 2, z]),
      cylG(0.12, 0.12, GD, 8, '#ffffff', [-GW, GH, z + s * GD / 2], [Math.PI / 2, 0, 0]), cylG(0.12, 0.12, GD, 8, '#ffffff', [GW, GH, z + s * GD / 2], [Math.PI / 2, 0, 0]),
      prep(new THREE.CylinderGeometry(0.12, 0.12, GW * 2, 8), '#ffffff', [0, GH, z + s * GD], [0, 0, Math.PI / 2]),
      cylG(0.12, 0.12, GH, 8, '#ffffff', [-GW, GH / 2, z + s * GD]), cylG(0.12, 0.12, GH, 8, '#ffffff', [GW, GH / 2, z + s * GD])
    ]);
    const fm = new THREE.MeshStandardMaterial({ color: TEAM[t].col, emissive: TEAM[t].col, emissiveIntensity: 2.4, roughness: 0.3, metalness: 0.2, vertexColors: true });
    const frame = new THREE.Mesh(fg, fm); frame.castShadow = true; grp.add(frame); QUAL.push(frame);
    // the net: back, two sides and the roof, one mesh, displaced in its own shader
    const parts = [];
    const plane = (w, h, sw, sh, pos, rot) => { const g = new THREE.PlaneGeometry(w, h, sw, sh); _e.set(rot[0], rot[1], rot[2], 'YXZ'); _q.setFromEuler(_e); _m4.compose(_p3.set(pos[0], pos[1], pos[2]), _q, _s3.set(1, 1, 1)); g.applyMatrix4(_m4); return g.toNonIndexed(); };
    parts.push(plane(GW * 2, GH, 24, 10, [0, GH / 2, z + s * GD], [0, 0, 0]));
    parts.push(plane(GD, GH, 9, 10, [-GW, GH / 2, z + s * GD / 2], [0, Math.PI / 2, 0]));
    parts.push(plane(GD, GH, 9, 10, [GW, GH / 2, z + s * GD / 2], [0, Math.PI / 2, 0]));
    parts.push(plane(GW * 2, GD, 24, 9, [0, GH, z + s * GD / 2], [Math.PI / 2, 0, 0]));
    let n = 0; parts.forEach((p) => { n += p.attributes.position.count; });
    const P = new Float32Array(n * 3), NN = new Float32Array(n * 3); let o = 0;
    parts.forEach((p, k) => {
      P.set(p.attributes.position.array, o * 3);
      const dir = k === 0 ? [0, 0, s] : k === 1 ? [-1, 0, 0] : k === 2 ? [1, 0, 0] : [0, 1, 0];
      for (let i = 0; i < p.attributes.position.count; i++) NN.set(dir, (o + i) * 3);
      o += p.attributes.position.count; p.dispose();
    });
    const ng = new THREE.BufferGeometry(); ng.setAttribute('position', new THREE.BufferAttribute(P, 3)); ng.setAttribute('aOut', new THREE.BufferAttribute(NN, 3));
    ng.computeBoundingSphere();
    const nm = new THREE.ShaderMaterial({
      uniforms: { uHit: { value: new THREE.Vector3(0, 4, z + s * GD) }, uT: { value: 9 }, uAmp: { value: 0 }, uCol: { value: new THREE.Color(TEAM[t].glow) }, uTime: { value: 0 }, fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 } },
      vertexShader: 'attribute vec3 aOut; uniform vec3 uHit; uniform float uT; uniform float uAmp; uniform float uTime; varying vec3 vW; varying float vD; varying float vFog;' +
        'void main(){ vec3 p = position; float d = distance(p, uHit); float w = uAmp * exp(-d * 0.32) * sin(d * 2.4 - uT * 16.0) * exp(-uT * 2.2); p += aOut * (w + sin(uTime * 1.3 + p.x * 0.7 + p.y) * 0.03);' +
        ' vW = p; vD = w; vec4 mv = modelViewMatrix * vec4(p, 1.0); vFog = -mv.z; gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uCol; uniform vec3 fogColor; uniform float fogDensity; varying vec3 vW; varying float vD; varying float vFog;' +
        'void main(){ vec3 a = abs(fract(vW / 0.62) - 0.5); float l = 1.0 - smoothstep(0.035, 0.11, min(min(a.x, a.y), a.z) ); ' +
        ' float al = l * 0.75 + 0.05; vec3 c = mix(vec3(0.92), uCol, 0.45) * (0.7 + abs(vD) * 3.0); float f = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog); c = mix(c, fogColor, f); gl_FragColor = vec4(c, al);\n' +
        ' #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }',
      transparent: true, depthWrite: false, side: THREE.DoubleSide
    });
    const net = new THREE.Mesh(ng, nm); net.renderOrder = 4; grp.add(net);
    S.nets.push(nm);
    // a glow strip at the back of the goal and a light inside it
    const gl = new THREE.Mesh(new THREE.BoxGeometry(GW * 2 - 0.6, 0.18, 0.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(TEAM[t].col).multiplyScalar(3) }));
    gl.position.set(0, 0.2, z + s * (GD - 0.2)); grp.add(gl);
  });
  // boost pads: bases, big orbs, small glows
  S.pads = null;
  // the stands: tiers round a rounded rectangle, a back wall, a canopy, and an LED band outside
  const sloop = loopPts(HW + 4, HL + 4, 20, 3, 10);
  const prof = [], seg = (a, b, nh, ny) => { prof.push({ h: a[0], y: a[1], nh, ny, v: 0 }, { h: b[0], y: b[1], nh, ny, v: 1, brk: true }); };
  const TIERS_N = 18, rise = 1.0, run = 1.7, y0 = 4.5;
  seg([-1.5, 0], [-1.5, y0], -1, 0); seg([-1.5, y0], [0, y0], 0, 1);
  for (let k = 0; k < TIERS_N; k++) { const h = k * run, y = y0 + k * rise; seg([h, y], [h, y + rise], -1, 0); seg([h, y + rise], [h + run, y + rise], 0, 1); }
  const hT = TIERS_N * run, yT = y0 + TIERS_N * rise;
  seg([hT, yT], [hT, yT + 9], -1, 0);
  seg([hT, yT + 9], [hT - 16, yT + 10.5], 0, -1);      // canopy underside
  seg([hT - 16, yT + 11.2], [hT + 1, yT + 9.6], 0, 1);  // canopy top
  seg([hT + 1, yT + 9.6], [hT + 1, 0], 1, 0);            // outer facade
  const standCol = (L, P, j) => {
    const row = Math.floor(j / 2), tier = row - 2;
    if (tier >= 0 && tier < TIERS_N * 2) { const isTread = tier % 2 === 1, team = L.z < -14 ? 0 : L.z > 14 ? 1 : -1; if (isTread) return team === 0 ? '#5a3a2a' : team === 1 ? '#25404f' : '#3a3a40'; return '#6e6a66'; }
    return j >= prof.length - 6 && j < prof.length - 2 ? '#2a2b31' : '#595552';
  };
  const stands = new THREE.Mesh(sweepGeo(sloop, prof, { us: 10, vs: 2, color: standCol }), std({ vertexColors: true, map: tx.concrete, roughness: 0.92 }));
  stands.receiveShadow = false; grp.add(stands); S.stands = stands;
  // canopy floodlight strip and the outside LED band
  const cs = [{ h: hT - 15.6, y: yT + 10.35, nh: 0, ny: -1, v: 0 }, { h: hT - 13.6, y: yT + 10.1, nh: 0, ny: -1, v: 1 }];
  const canopyLight = new THREE.Mesh(sweepGeo(sloop, cs, { color: () => '#fff4e0' }), new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 3.0, 2.7), vertexColors: true, side: THREE.DoubleSide }));
  grp.add(canopyLight);
  const ls = [{ h: hT + 1.05, y: yT + 2.5, nh: 1, ny: 0, v: 0 }, { h: hT + 1.05, y: yT + 5.5, nh: 1, ny: 0, v: 1 }];
  const ledMat = new THREE.MeshBasicMaterial({ map: tx.led, color: new THREE.Color(2.2, 2.2, 2.2), side: THREE.DoubleSide });
  tx.led.wrapS = THREE.RepeatWrapping;
  const led = new THREE.Mesh(sweepGeo(sloop, ls, { us: 60, vs: 1 }), ledMat); grp.add(led); S.led = tx.led;
  // the crowd, on every tread
  const people = [], pr = rng(77);
  for (let k = 0; k < TIERS_N; k++) {
    const h = k * run + 0.85, y = y0 + (k + 1) * rise;
    for (let i = 0; i < sloop.length - 1; i++) {
      const A = sloop[i], B = sloop[i + 1];
      const ax = A.x + A.nx * h, az = A.z + A.nz * h, bx = B.x + B.nx * h, bz = B.z + B.nz * h, L = Math.hypot(bx - ax, bz - az);
      const n = Math.max(1, Math.round(L / 1.25));
      for (let j = 0; j < n; j++) {
        if (pr() < 0.12) continue;
        const t = (j + 0.5 + (pr() - 0.5) * 0.3) / n, x = lerp(ax, bx, t), z = lerp(az, bz, t), nx = lerp(A.nx, B.nx, t), nz = lerp(A.nz, B.nz, t);
        people.push({ x, y, z, yaw: Math.atan2(-nx, -nz), k: pr() });
      }
    }
  }
  for (let i = people.length - 1; i > 0; i--) { const j = Math.floor(pr() * (i + 1)); const t = people[i]; people[i] = people[j]; people[j] = t; }
  // A person about 1.8 m tall, seven and a half heads: legs, torso, neck and head, two arms that pivot at
  // the shoulder. aEx tags the parts (0 legs, 1 shirt, 2 skin, 4 left arm, 5 right arm) so the shader can
  // colour each fan differently and move each one on their own clock.
  const personGeo = mergeG([
    boxG(0.15, 0.94, 0.17, '#2a2a30', [0.1, 0.47, 0]), boxG(0.15, 0.94, 0.17, '#2a2a30', [-0.1, 0.47, 0]),
    boxG(0.42, 0.58, 0.24, '#ffffff', [0, 1.22, 0], null, 1),
    prep(new THREE.IcosahedronGeometry(0.118, 0), '#ffffff', [0, 1.66, 0.01], null, [0.88, 1.14, 0.98], 2),
    boxG(0.09, 0.1, 0.09, '#ffffff', [0, 1.53, 0], null, 2),
    boxG(0.1, 0.64, 0.11, '#ffffff', [-0.27, 1.17, 0], null, 4),
    boxG(0.1, 0.64, 0.11, '#ffffff', [0.27, 1.17, 0], null, 5)
  ]);
  const crowdMat = std({ vertexColors: true, roughness: 0.85 });
  crowdMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = { value: 0 }; sh.uniforms.uExcite = { value: 0 }; sh.uniforms.uAge = { value: 9 }; sh.uniforms.uTeam = { value: -1 }; S.crowdShader = sh;
    sh.vertexShader = 'uniform float uTime; uniform float uExcite; uniform float uAge; uniform float uTeam; attribute float aEx;\n' +
      'vec2 armRot(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(p.x * c - p.y * s, p.x * s + p.y * c); }\n' + sh.vertexShader
      .replace('#include <color_vertex>', [
        '#include <color_vertex>',
        ' float hh = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);',
        ' float h2 = fract(hh * 17.31), h3 = fract(hh * 41.7);',
        ' vec3 skin = mix(vec3(0.2, 0.11, 0.06), vec3(0.55, 0.36, 0.24), hh * hh) * (h3 > 0.9 ? 1.35 : 1.0);',
        ' vec3 hair = h2 > 0.88 ? vec3(0.33, 0.31, 0.3) : h2 > 0.7 ? vec3(0.12, 0.07, 0.04) : vec3(0.025, 0.02, 0.02);',
        ' vec3 legs = h3 < 0.4 ? vec3(0.06, 0.08, 0.15) : h3 < 0.7 ? vec3(0.07, 0.07, 0.08) : vec3(0.22, 0.19, 0.14);',
        ' if (aEx > 1.5 && aEx < 2.5) vColor.rgb = position.y > 1.71 ? hair : skin;',
        ' else if (aEx < 0.5) vColor.rgb = position.y < 0.08 ? vec3(0.05) : legs;',
        ' else if (aEx > 3.5 && position.y < 0.95) vColor.rgb = skin;',
        ' vColor.rgb *= 0.85 + 0.3 * h2;',
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        ' float ph = fract(sin(dot(instanceMatrix[3].xz, vec2(39.3468, 11.135))) * 24634.6345);',
        ' float iz = instanceMatrix[3].z;',
        ' float fan = iz < -20.0 ? 0.0 : iz > 20.0 ? 1.0 : -1.0;',
        // each fan takes the moment in on their own: a reaction delay of up to most of a second, some stay put
        ' float delay = 0.12 + fract(ph * 7.13) * 0.75;',
        ' float on = smoothstep(delay, delay + 0.3, uAge) * (0.3 + 0.7 * step(0.22, fract(ph * 3.71)));',
        ' float glad = uTeam < -0.5 || fan < -0.5 || abs(fan - uTeam) < 0.5 ? 1.0 : 0.0;',
        ' float ex = uExcite * on * glad, sad = uExcite * on * (1.0 - glad);',
        // between moments: every few seconds somebody stands taller, waves, claps or turns to a neighbour
        ' float slotT = uTime / 5.5 + ph * 13.0, w = fract(slotT);',
        ' float r = fract(sin(floor(slotT) * 12.9898 + ph * 78.233) * 43758.5453);',
        ' float ev = smoothstep(0.0, 0.18, w) * smoothstep(1.0, 0.7, w) * (1.0 - min(1.0, ex + sad));',
        ' float wave = r > 0.94 ? ev : 0.0, clap = r > 0.88 && r <= 0.94 ? ev : 0.0, turn = r > 0.8 && r <= 0.88 ? ev : 0.0;',
        ' float t1 = uTime * (7.0 + ph * 3.0) + ph * 40.0;',
        ' float jump = max(0.0, sin(t1)) * ex * (0.18 + 0.2 * fract(ph * 5.3));',
        ' float breath = sin(uTime * (1.1 + ph * 0.6) + ph * 30.0) * 0.012 + sin(uTime * 0.37 + ph * 9.0) * 0.02;',
        ' float side = aEx > 4.5 ? 1.0 : -1.0;',
        ' if (aEx > 3.5) {',
        '   float up = ex * (2.3 + 0.5 * sin(t1 * 0.5 + side)) + sad * 2.45 + wave * (side > 0.0 ? 2.7 + 0.35 * sin(uTime * 9.0 + ph * 20.0) : 0.0);',
        '   vec2 q = transformed.xy - vec2(side * 0.27, 1.47);',
        '   q = armRot(q, side * up);',
        '   float fwd = clap * (1.2 + 0.15 * sin(uTime * 14.0 + ph * 9.0)) + sad * 0.5;',
        '   vec2 yz = vec2(q.y, transformed.z); yz = armRot(yz, -fwd); q.y = yz.x; transformed.z = yz.y;',
        '   transformed.xy = q + vec2(side * 0.27, 1.47);',
        ' }',
        ' float yaw = turn * (ph > 0.5 ? 0.75 : -0.75) + sad * 0.0;',
        ' vec2 xz = armRot(vec2(transformed.x, transformed.z), yaw); transformed.x = xz.x; transformed.z = xz.y;',
        ' if (transformed.y > 0.9) { transformed.z += sad * 0.08 * (transformed.y - 0.9); transformed.y -= sad * 0.04; }',
        ' transformed.y += jump + breath * step(0.9, transformed.y);',
      ].join('\n'));
  };
  const crowd = new THREE.InstancedMesh(personGeo, crowdMat, people.length);
  const palette0 = ['#ff7a1a', '#ff9a3c', '#f2c230', '#ffffff', '#ff7a1a', '#e85d1c'], palette1 = ['#2ab8ff', '#1f7fd1', '#8be3ff', '#ffffff', '#2ab8ff', '#1859a8'], paletteN = ['#ff7a1a', '#2ab8ff', '#ffffff', '#e94b6c', '#f2c230', '#43b26a', '#9a5cd6'];
  people.forEach((p, i) => {
    _q.setFromAxisAngle(_up, p.yaw); _m4.compose(_p3.set(p.x, p.y, p.z), _q, _s3.set(1, 0.92 + p.k * 0.16, 1)); crowd.setMatrixAt(i, _m4);
    const pal = p.z < -20 ? palette0 : p.z > 20 ? palette1 : paletteN; _c.set(pal[Math.floor(p.k * pal.length * 0.999)]).multiplyScalar(0.85); crowd.setColorAt(i, _c);
  });
  crowd.instanceMatrix.needsUpdate = true; crowd.instanceColor.needsUpdate = true; crowd.frustumCulled = false;
  grp.add(crowd); S.crowd = crowd; S.crowdN = people.length;
  // phone lights twinkling in the crowd
  const phN = 520, php = new Float32Array(phN * 3), phs = new Float32Array(phN);
  for (let i = 0; i < phN; i++) { const p = people[(i * 13) % people.length]; php[i * 3] = p.x; php[i * 3 + 1] = p.y + 1.5; php[i * 3 + 2] = p.z; phs[i] = pr(); }
  const phg = new THREE.BufferGeometry(); phg.setAttribute('position', new THREE.BufferAttribute(php, 3)); phg.setAttribute('aSeed', new THREE.BufferAttribute(phs, 1));
  const phm = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 }, uOn: { value: 1 } },
    vertexShader: 'attribute float aSeed; uniform float uTime; uniform float uScale; uniform float uOn; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float tw = 0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 4.0) + aSeed * 60.0); vA = uOn * tw * step(0.35, aSeed); gl_PointSize = 0.45 * uScale / max(1.0, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard; gl_FragColor = vec4(vec3(2.6, 2.6, 2.4) * vA, pow(1.0 - d * 2.0, 2.0) * vA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const phones = new THREE.Points(phg, phm); phones.frustumCulled = false; grp.add(phones); S.phones = phm; S.phonePts = phones;
  // light masts at the corners
  const mastPos = [[1, 1], [-1, 1], [1, -1], [-1, -1]].map((m) => [m[0] * (HW + 34), m[1] * (HL + 30)]);
  const mastGeo = [], headGeo = [];
  mastPos.forEach((m) => {
    mastGeo.push(cylG(0.7, 1.1, 60, 10, '#55585f', [m[0], 30, m[1]]));
    const yaw = Math.atan2(-m[0], -m[1]);
    for (let r = 0; r < 3; r++) mastGeo.push(boxG(10, 0.25, 0.25, '#45474d', [m[0], 57 + r * 2.2, m[1]], [0, yaw, 0]));
    const g = new THREE.PlaneGeometry(9.6, 6.4); _e.set(-0.55, yaw, 0, 'YXZ'); _q.setFromEuler(_e); _m4.compose(_p3.set(m[0] - Math.sin(yaw) * -0.4, 59.5, m[1] - Math.cos(yaw) * -0.4), _q, _s3.set(1, 1, 1)); g.applyMatrix4(_m4); headGeo.push(g);
  });
  const masts = new THREE.Mesh(mergeG(mastGeo), std({ vertexColors: true, roughness: 0.5, metalness: 0.6 })); grp.add(masts);
  // merge the four heads into one draw
  const hg = new THREE.BufferGeometry(); { const P = [], U = []; headGeo.forEach((g) => { const ng = g.toNonIndexed(); P.push(...ng.attributes.position.array); U.push(...ng.attributes.uv.array); ng.dispose(); }); hg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); hg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); }
  grp.add(new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ map: tx.lamp, color: new THREE.Color(6, 5.6, 5), side: THREE.DoubleSide })));
  // glare round each lamp bank
  const glg = new THREE.BufferGeometry(), glp = [];
  mastPos.forEach((m) => glp.push(m[0] * 0.995, 59.5, m[1] * 0.995));
  glg.setAttribute('position', new THREE.Float32BufferAttribute(glp, 3));
  const glm = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: 'uniform float uScale; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(900.0, 34.0 * uScale / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; if (d > 1.0) discard; float a = pow(1.0 - d, 3.0) * 0.9 + pow(max(0.0, 1.0 - abs(p.y) * 22.0), 2.0) * (1.0 - d) * 0.6; gl_FragColor = vec4(vec3(1.6, 1.5, 1.35) * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const glare = new THREE.Points(glg, glm); glare.frustumCulled = false; glare.renderOrder = 6; grp.add(glare); S.glare = glm; S.glarePts = glare;
  S.mastPos = mastPos;
  // the ground outside, a plaza and the city
  const gtex = canvasTex(256, 256, (g, w, h) => { noiseFill(g, w, h, '#ffffff', 0.25, 3000, 61, 3); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; for (let i = 0; i < 8; i++) { g.beginPath(); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); } }, { repeat: [60, 60] });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400), std({ color: '#2a2a30', map: gtex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -0.05; grp.add(ground);
  buildCity(grp, S);
  S.grp = grp;
  return S;
}

/* ------------------------------------------------------------ the city beyond the roof */
function buildCity(grp, S) {
  const r = rng(303), items = [];
  for (let i = 0; i < 260; i++) {
    const an = r() * TAU, ring = 300 + Math.pow(r(), 0.6) * 650;
    const cluster = 0.5 + 0.5 * Math.sin(an * 3 + 1.3) * Math.sin(an * 5 + 0.4);
    const h = 14 + Math.pow(r(), 2.2) * 120 * (0.45 + cluster) * clamp((ring - 260) / 300, 0.35, 1.3) + (ring > 650 ? 35 : 0);
    items.push({ x: Math.cos(an) * ring, z: Math.sin(an) * ring, w: 14 + r() * 26, d: 14 + r() * 26, h, yaw: r() * TAU, s: r() });
  }
  const g = new THREE.BoxGeometry(1, 1, 1); g.translate(0, 0.5, 0);
  const seed = new Float32Array(items.length);
  const mat = new THREE.ShaderMaterial({
    uniforms: { fogColor: { value: new THREE.Color() }, fogDensity: { value: 0 }, uLit: { value: 0.5 }, uBase: { value: new THREE.Color('#1c1d26') }, uWin: { value: new THREE.Color('#ffd9a0') } },
    vertexShader: 'attribute float aSeed; varying vec3 vW; varying vec3 vN; varying float vS; varying float vFog; varying vec3 vL;' +
      'void main(){ vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0); vW = w.xyz; vN = normalize(mat3(instanceMatrix) * normal); vS = aSeed; vL = position; vec4 mv = viewMatrix * w; vFog = -mv.z; gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 fogColor; uniform float fogDensity; uniform float uLit; uniform vec3 uBase; uniform vec3 uWin; varying vec3 vW; varying vec3 vN; varying float vS; varying float vFog; varying vec3 vL;' +
      'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }' +
      'void main(){ vec3 c = uBase * (0.65 + 0.35 * vL.y) * (0.8 + 0.4 * vS);' +
      ' if (abs(vN.y) < 0.5) { float u = abs(vN.x) > 0.5 ? vW.z : vW.x; vec2 cell = vec2(floor(u / 3.2), floor(vW.y / 3.6)); vec2 f = vec2(fract(u / 3.2), fract(vW.y / 3.6));' +
      '  float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.25, f.y) * step(f.y, 0.75); float lit = step(1.0 - uLit, h21(cell + vS * 91.0)); float hue = h21(cell * 1.7 + vS);' +
      '  vec3 wc = mix(uWin, vec3(0.75, 0.88, 1.0), step(0.7, hue)) * (1.2 + 1.8 * h21(cell + 3.1)); c = mix(c, wc, win * lit * step(2.0, vW.y)); }' +
      ' else c *= 0.6;' +
      ' float f = 1.0 - exp(-fogDensity * fogDensity * vFog * vFog); c = mix(c, fogColor, f * 0.92); gl_FragColor = vec4(c, 1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n }'
  });
  const im = new THREE.InstancedMesh(g, mat, items.length);
  items.forEach((it, i) => { _q.setFromAxisAngle(_up, it.yaw); _m4.compose(_p3.set(it.x, 0, it.z), _q, _s3.set(it.w, it.h, it.d)); im.setMatrixAt(i, _m4); seed[i] = it.s; });
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  im.frustumCulled = false; grp.add(im); S.cityMat = mat; S.city = im; S.cityN = items.length;
  // landmarks: a tower with a lit crown, a domed hall with four minarets, a temple spire, a bridge with lit cables
  const L = [], E = [];
  const tower = (x, z) => { L.push(cylG(3, 5, 150, 12, '#22232b', [x, 75, z]), sphG(9, '#2a2b33', [x, 150, z], [1, 0.55, 1], 16, 10), cylG(0.6, 1.2, 40, 6, '#2a2b33', [x, 182, z])); E.push(cylG(9.3, 9.3, 1.2, 24, '#ffd28a', [x, 150, z]), sphG(1.4, '#ff3a2a', [x, 203, z], 1, 8, 6)); };
  const dome = (x, z) => {
    L.push(boxG(60, 22, 42, '#262630', [x, 11, z]), sphG(17, '#2d2d38', [x, 26, z], [1, 1.05, 1], 20, 12), cylG(1.6, 1.6, 10, 8, '#2d2d38', [x, 46, z]));
    [[1, 1], [-1, 1], [1, -1], [-1, -1]].forEach((m) => { L.push(cylG(2.2, 2.8, 52, 10, '#262630', [x + m[0] * 32, 26, z + m[1] * 23]), sphG(3, '#2d2d38', [x + m[0] * 32, 53, z + m[1] * 23], [1, 1.3, 1], 10, 8)); E.push(cylG(2.6, 2.6, 0.8, 12, '#ffc070', [x + m[0] * 32, 44, z + m[1] * 23])); });
    E.push(boxG(60.4, 0.8, 42.4, '#ffc070', [x, 21.8, z]));
  };
  const temple = (x, z) => {
    L.push(boxG(30, 10, 30, '#2a2626', [x, 5, z]));
    for (let k = 0; k < 9; k++) { const w = 18 - k * 1.8; L.push(boxG(w, 5.2, w, '#2c2828', [x, 12.5 + k * 5, z])); }
    L.push(coneG(3.4, 9, 10, '#2c2828', [x, 62, z])); E.push(sphG(1.2, '#ffcf6a', [x, 67, z], 1, 8, 6), boxG(30.4, 0.6, 30.4, '#ff9d4a', [x, 10, z]));
  };
  tower(-330, -260); dome(300, -330); temple(-380, 210); tower(420, 300);
  // the bridge
  const bx = 120, bz = 560;
  L.push(boxG(520, 3, 14, '#202027', [bx, 22, bz]), cylG(3, 4, 90, 8, '#24242c', [bx - 120, 45, bz]), cylG(3, 4, 90, 8, '#24242c', [bx + 120, 45, bz]));
  for (let k = -9; k <= 9; k++) { if (!k) continue; [-120, 120].forEach((px) => { const ex = px + k * 12, len = Math.hypot(k * 12, 60); const ag = Math.atan2(k * 12, 60); E.push(prep(new THREE.CylinderGeometry(0.25, 0.25, len, 4), '#cfe6ff', [bx + (px + ex) / 2, 22 + 30, bz], [0, 0, -ag])); }); }
  const lm = new THREE.Mesh(mergeG(L), new THREE.MeshLambertMaterial({ vertexColors: true })); grp.add(lm);
  const em = new THREE.Mesh(mergeG(E), new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3.2, 3.2, 3.2) })); grp.add(em);
  // a few far red beacons and moving traffic on an elevated road
  const bn = 40, bp = new Float32Array(bn * 3), bs = new Float32Array(bn);
  items.slice(0, bn).forEach((it, i) => { bp[i * 3] = it.x; bp[i * 3 + 1] = it.h + 1.5; bp[i * 3 + 2] = it.z; bs[i] = it.s; });
  const bgeo = new THREE.BufferGeometry(); bgeo.setAttribute('position', new THREE.BufferAttribute(bp, 3)); bgeo.setAttribute('aSeed', new THREE.BufferAttribute(bs, 1));
  const bmat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
    vertexShader: 'attribute float aSeed; uniform float uTime; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vA = step(0.6, fract(uTime * 0.5 + aSeed)); gl_PointSize = max(2.0, 3.0 * uScale / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard; gl_FragColor = vec4(vec3(4.0, 0.5, 0.3) * vA, (1.0 - d * 2.0) * vA); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const beacons = new THREE.Points(bgeo, bmat); beacons.frustumCulled = false; grp.add(beacons); S.beacons = bmat;
  const tn = 160, tp = new Float32Array(tn * 3), ts = new Float32Array(tn);
  for (let i = 0; i < tn; i++) { ts[i] = r(); tp[i * 3 + 1] = 12; }
  const tgeo = new THREE.BufferGeometry(); tgeo.setAttribute('position', new THREE.BufferAttribute(tp, 3)); tgeo.setAttribute('aSeed', new THREE.BufferAttribute(ts, 1));
  const tmat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uScale: { value: 400 } },
    vertexShader: 'attribute float aSeed; uniform float uTime; uniform float uScale; varying vec3 vC; void main(){ float dir = step(0.5, aSeed) * 2.0 - 1.0; float a = fract(aSeed * 7.31 + uTime * 0.012 * dir) * 6.2832; float r = 205.0 + dir * 4.0; vec3 p = vec3(cos(a) * r, 11.0, sin(a) * r * 1.15);' +
      ' vC = dir > 0.0 ? vec3(3.0, 2.6, 2.0) : vec3(3.0, 0.4, 0.3); vec4 mv = modelViewMatrix * vec4(p, 1.0); gl_PointSize = max(1.5, 1.6 * uScale / max(1.0, -mv.z)); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p); if (d > 0.5) discard; gl_FragColor = vec4(vC, 1.0 - d * 2.0); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
  });
  const traffic = new THREE.Points(tgeo, tmat); traffic.frustumCulled = false; grp.add(traffic); S.traffic = tmat;
  // the elevated road itself
  const road = new THREE.Mesh(new THREE.TorusGeometry(205, 3, 4, 96), new THREE.MeshLambertMaterial({ color: '#1e1f24' }));
  road.rotation.x = Math.PI / 2; road.scale.set(1, 1.15, 1); road.position.y = 9; grp.add(road);
}

/* ------------------------------------------------------------ boost pads */
function buildPads(scene, G) {
  const tx = textures(), P = {};
  const n = G.pads.length;
  const baseG = new THREE.CylinderGeometry(1.6, 1.9, 0.12, 24); baseG.translate(0, 0.06, 0);
  P.base = new THREE.InstancedMesh(baseG, std({ color: '#2a2b31', roughness: 0.4, metalness: 0.6 }), n);
  const ringG = new THREE.PlaneGeometry(4.6, 4.6); ringG.rotateX(-Math.PI / 2); ringG.translate(0, 0.14, 0);
  P.ring = new THREE.InstancedMesh(ringG, new THREE.MeshBasicMaterial({ map: tx.pad, color: new THREE.Color(1.9, 0.95, 0.28), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), n);
  const orbG = new THREE.IcosahedronGeometry(0.75, 2);
  const nb = G.pads.filter((p) => p.big).length;
  P.orb = new THREE.InstancedMesh(orbG, new THREE.MeshBasicMaterial({ color: new THREE.Color(4.2, 2.4, 0.6) }), nb);
  G.pads.forEach((p, i) => {
    _m4.compose(_p3.set(p.x, 0, p.z), _q.identity(), _s3.set(p.big ? 1.25 : 0.8, 1, p.big ? 1.25 : 0.8)); P.base.setMatrixAt(i, _m4);
    _m4.compose(_p3.set(p.x, 0, p.z), _q.identity(), _s3.set(p.big ? 1.3 : 0.75, 1, p.big ? 1.3 : 0.75)); P.ring.setMatrixAt(i, _m4);
    P.ring.setColorAt(i, _c.set(1, 1, 1));
  });
  P.base.instanceMatrix.needsUpdate = true; P.base.receiveShadow = true; P.ring.instanceColor.needsUpdate = true;
  [P.base, P.ring, P.orb].forEach((m) => { m.frustumCulled = false; scene.add(m); });
  P.big = G.pads.map((p, i) => (p.big ? i : -1)).filter((i) => i >= 0);
  return P;
}
function updatePads(P, G, t) {
  let bi = 0;
  G.pads.forEach((p, i) => {
    const on = p.t <= 0, k = on ? 1 : clamp(1 - p.t / (p.big ? 10 : 4), 0, 1) * 0.25;
    _c.setRGB(k, k * (on ? 1 : 0.6), k * (on ? 1 : 0.5)); P.ring.setColorAt(i, _c);
    if (p.big) {
      const s = on ? 1 + Math.sin(t * 3 + i) * 0.08 : 0.0001;
      _q.setFromAxisAngle(_up, t * 1.4 + i); _m4.compose(_p3.set(p.x, 1.25 + Math.sin(t * 2 + i) * 0.18, p.z), _q, _s3.set(s, s, s)); P.orb.setMatrixAt(bi++, _m4);
    }
  });
  P.ring.instanceColor.needsUpdate = true; P.orb.instanceMatrix.needsUpdate = true;
}

/* ------------------------------------------------------------ cars */
// Local frame: nose along +z, roof along +y, origin at the car's centre (H0 above the surface it drives on).
function carGeos(team) {
  const paint = TEAM[team].col, dark = '#17181c', trim = '#2c2e34', glassC = '#0b1420', stripe = '#f4efe6';
  const Y = -H0;
  const body = new THREE.Shape();
  const bp = [[2.05, 0.36], [2.14, 0.58], [1.8, 0.74], [0.62, 0.88], [-1.92, 0.92], [-2.12, 0.8], [-2.08, 0.38]];
  body.moveTo(bp[0][0], bp[0][1] + Y); bp.slice(1).forEach((p) => body.lineTo(p[0], p[1] + Y)); body.closePath();
  const bg = new THREE.ExtrudeGeometry(body, { depth: 1.66, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.11, bevelSegments: 3, curveSegments: 4 });
  bg.translate(0, 0, -0.83); bg.rotateY(-Math.PI / 2);
  const cab = new THREE.Shape();
  const cp = [[0.66, 0.84], [-0.28, 1.34], [-1.18, 1.32], [-1.9, 0.9]];
  cab.moveTo(cp[0][0], cp[0][1] + Y); cp.slice(1).forEach((p) => cab.lineTo(p[0], p[1] + Y)); cab.closePath();
  const cg = new THREE.ExtrudeGeometry(cab, { depth: 1.34, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.07, bevelSegments: 2 });
  cg.translate(0, 0, -0.67); cg.rotateY(-Math.PI / 2);
  const parts = [
    prep(bg, paint),
    boxG(1.36, 0.06, 0.95, paint, [0, 1.36 + Y, -0.72]),                      // roof panel
    boxG(0.32, 0.03, 2.2, stripe, [0, 0.93 + Y, 0.95]), boxG(0.32, 0.03, 0.9, stripe, [0, 1.4 + Y, -0.72]),  // racing stripe
    boxG(2.06, 0.12, 0.5, dark, [0, 0.33 + Y, 2.12]),                         // front splitter
    boxG(2.0, 0.22, 0.32, dark, [0, 0.46 + Y, -2.2]),                         // diffuser
    boxG(0.08, 0.36, 1.6, dark, [1.03, 0.52 + Y, 0.1]), boxG(0.08, 0.36, 1.6, dark, [-1.03, 0.52 + Y, 0.1]), // side intakes
    boxG(0.12, 0.42, 0.12, trim, [0.7, 1.12 + Y, -1.95]), boxG(0.12, 0.42, 0.12, trim, [-0.7, 1.12 + Y, -1.95]),
    boxG(2.2, 0.08, 0.5, paint, [0, 1.36 + Y, -2.02], [0.12, 0, 0]),           // wing
    boxG(0.06, 0.3, 0.55, dark, [1.1, 1.3 + Y, -2.0]), boxG(0.06, 0.3, 0.55, dark, [-1.1, 1.3 + Y, -2.0]),
    boxG(0.5, 0.06, 0.3, dark, [0, 0.95 + Y, 1.25]),                          // hood vent
    cylG(0.11, 0.13, 0.25, 10, trim, [0.35, 0.5 + Y, -2.22], [Math.PI / 2, 0, 0]), cylG(0.11, 0.13, 0.25, 10, trim, [-0.35, 0.5 + Y, -2.22], [Math.PI / 2, 0, 0]) // exhausts
  ];
  const lights = mergeG([
    boxG(0.46, 0.1, 0.06, '#ffffff', [0.7, 0.66 + Y, 2.16], [0, 0.18, 0]), boxG(0.46, 0.1, 0.06, '#ffffff', [-0.7, 0.66 + Y, 2.16], [0, -0.18, 0]),
    boxG(1.86, 0.07, 0.06, '#ff2a20', [0, 0.82 + Y, -2.2]),
    boxG(1.7, 0.03, 3.2, TEAM[team].col, [0, 0.16 + Y, 0])                      // underglow line
  ]);
  return { body: mergeG(parts), lights, glass: prep(cg, glassC) };
}
function wheelGeo() {
  const tire = prep(new THREE.CylinderGeometry(0.42, 0.42, 0.36, 18), '#141416', null, [0, 0, Math.PI / 2]);
  const rim = prep(new THREE.CylinderGeometry(0.27, 0.27, 0.38, 12), '#b8bcc4', null, [0, 0, Math.PI / 2]);
  const spokes = [];
  for (let k = 0; k < 5; k++) spokes.push(boxG(0.39, 0.05, 0.42, '#7a7f88', [0, 0, 0], [k * Math.PI / 5, 0, 0]));
  const hub = prep(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), '#e0a020', null, [0, 0, Math.PI / 2]);
  return mergeG([tire, rim, hub].concat(spokes));
}
function flameMat() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'attribute float aLen; varying vec2 vUv; varying float vY; void main(){ vUv = uv; vY = aLen; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform float uTime; varying vec2 vUv; varying float vY;' +
      'float h(float x){ return fract(sin(x * 91.7) * 4375.5); }' +
      'void main(){ float t = clamp(vY / 2.2, 0.0, 1.0); float n = 0.75 + 0.25 * sin(vUv.x * 30.0 + uTime * 40.0) * sin(vY * 9.0 - uTime * 55.0);' +
      ' vec3 core = vec3(4.0, 3.6, 2.6), mid = vec3(4.2, 1.6, 0.35), tip = vec3(1.4, 0.35, 0.9); vec3 c = mix(core, mid, smoothstep(0.0, 0.45, t)); c = mix(c, tip, smoothstep(0.45, 1.0, t));' +
      ' float a = (1.0 - t) * n; gl_FragColor = vec4(c * a, a); }',
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
}
let CARMAT = null;
function buildCars(scene) {
  CARMAT = std({ vertexColors: true, metalness: 0.35, roughness: 0.4, envMapIntensity: 0.6 });
  const C = { teams: [[], []], wheels: null, flames: null };
  [0, 1].forEach((t) => {
    const g = carGeos(t);
    const lm = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3.4, 3.4, 3.4) });
    for (let s = 0; s < 3; s++) {
      const root = new THREE.Group();
      const body = new THREE.Mesh(g.body, CARMAT); body.castShadow = true; body.receiveShadow = true;
      const lights = new THREE.Mesh(g.lights, lm);
      root.add(body, lights); root.visible = false; scene.add(root);
      C.teams[t].push({ root, body });
    }
  });
  C.wheels = new THREE.InstancedMesh(wheelGeo(), std({ vertexColors: true, roughness: 0.6, metalness: 0.4 }), 24);
  C.wheels.castShadow = true; C.wheels.frustumCulled = false; scene.add(C.wheels);
  // a cone with its wide end at the exhaust and its tip trailing behind; aLen runs 0 (hot) to 1.8 (tip)
  const flameG = new THREE.ConeGeometry(0.26, 2.2, 12, 4, true); flameG.translate(0, 1.1, 0);
  const fp = flameG.attributes.position, lenA = new Float32Array(fp.count); for (let i = 0; i < fp.count; i++) lenA[i] = fp.getY(i);
  flameG.setAttribute('aLen', new THREE.BufferAttribute(lenA, 1));
  flameG.rotateX(-Math.PI / 2);
  const fm = flameMat();
  C.flames = new THREE.InstancedMesh(flameG, fm, 12); C.flames.frustumCulled = false; scene.add(C.flames);
  C.flameMat = fm;
  // tinted canopy glass over a driver who sits, steers and looks where the ball is
  const glassMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: '#9fb4c8', transparent: true, opacity: 0.58, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.4, depthWrite: false });
  C.glass = new THREE.InstancedMesh(carGeos(0).glass, glassMat, 6); C.glass.frustumCulled = false; C.glass.renderOrder = 3; scene.add(C.glass);
  // a driver in every seat: a person from the shared people library, seated, hands on the wheel, in a
  // team helmet; the head follows the ball, the body leans against the turn, and a goal gets a fist
  // pump or hands on the helmet a moment later
  C.drv = [];
  const seats = [[11, 'm'], [12, 'f'], [13, 'm'], [21, 'm'], [22, 'm'], [23, 'f']];
  for (let i = 0; i < 6; i++) {
    const H = createHuman({ seed: seats[i][0], sex: seats[i][1], quality: R3 && R3.soft ? 0 : 2, lod: R3 && R3.soft ? 'far' : 'mid', unit: 0.85, castShadow: false,
      outfit: { top: '#ffffff', sleeves: 'long', bottom: '#202226', legs: 'trousers', gloves: '#202226', helmet: '#ffffff' } });
    H.play('drive', { hold: true });
    H.group.matrixAutoUpdate = false; H.group.visible = false; scene.add(H.group);
    C.drv.push({ H, team: -1, react: null, at: 0, phase: '' });
  }
  C.drvOff = new THREE.Matrix4().makeTranslation(0, 0.12 - H0, -0.62);
  // tyre marks on the turf: a ring of short dark strips that fade, one draw call
  const skN = 360, skG = new THREE.PlaneGeometry(1, 1); skG.rotateX(-Math.PI / 2);
  const skMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uLife: { value: 9 } },
    vertexShader: 'attribute float aBorn; attribute float aK; uniform float uTime; uniform float uLife; varying float vA; varying vec2 vUv; void main(){ vUv = uv; float age = uTime - aBorn; vA = aK * (1.0 - smoothstep(uLife * 0.3, uLife, age)) * step(0.0, age); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }',
    fragmentShader: 'varying float vA; varying vec2 vUv; void main(){ float e = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x); float n = 0.75 + 0.25 * sin(vUv.y * 40.0 + vUv.x * 9.0); gl_FragColor = vec4(0.05, 0.06, 0.04, vA * e * n); }',
    transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2
  });
  C.skid = new THREE.InstancedMesh(skG, skMat, skN); C.skid.frustumCulled = false; C.skid.renderOrder = 1;
  C.skBorn = new Float32Array(skN).fill(-99); C.skK = new Float32Array(skN);
  C.skid.geometry.setAttribute('aBorn', new THREE.InstancedBufferAttribute(C.skBorn, 1).setUsage(THREE.DynamicDrawUsage));
  C.skid.geometry.setAttribute('aK', new THREE.InstancedBufferAttribute(C.skK, 1).setUsage(THREE.DynamicDrawUsage));
  for (let i = 0; i < skN; i++) C.skid.setMatrixAt(i, _wm.makeScale(0.0001, 0.0001, 0.0001));
  C.skHead = 0; C.skLast = []; for (let i = 0; i < 12; i++) C.skLast.push({ x: 0, z: 0, on: false });
  scene.add(C.skid);
  // soft contact shadows under every car and the ball, so nothing floats when the shadow map is off
  const bt = canvasTex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,0.75)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.38)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }, { clamp: true });
  const blobG = new THREE.PlaneGeometry(1, 1); blobG.rotateX(-Math.PI / 2);
  C.blob = new THREE.InstancedMesh(blobG, new THREE.MeshBasicMaterial({ map: bt, transparent: true, depthWrite: false, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), 7);
  C.blob.frustumCulled = false; C.blob.renderOrder = 2; scene.add(C.blob);
  return C;
}
// Lay a stretch of tyre mark between where this wheel last marked and where it is now.
function skidAt(C, w, x, z, k, now) {
  const L = C.skLast[w];
  if (!L.on) { L.on = true; L.x = x; L.z = z; return; }
  const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
  if (d < 0.45) return;
  if (d > 4) { L.x = x; L.z = z; return; }
  const i = C.skHead; C.skHead = (C.skHead + 1) % C.skBorn.length;
  _q.setFromAxisAngle(_up, Math.atan2(dx, dz));
  _wm.compose(_p3.set((x + L.x) / 2, 0.035, (z + L.z) / 2), _q, _s3.set(0.3, 1, d + 0.06));
  C.skid.setMatrixAt(i, _wm); C.skBorn[i] = now; C.skK[i] = k;
  C.skid.instanceMatrix.needsUpdate = true;
  C.skid.geometry.attributes.aBorn.needsUpdate = true; C.skid.geometry.attributes.aK.needsUpdate = true;
  L.x = x; L.z = z;
}
const _cm = new THREE.Matrix4(), _cx = new THREE.Vector3(), _cy = new THREE.Vector3(), _cz = new THREE.Vector3(), _wm = new THREE.Matrix4(), _wq = new THREE.Quaternion(), _wq2 = new THREE.Quaternion();
const WHEELS = [[0.98, -0.3, 1.3, 1], [-0.98, -0.3, 1.3, 1], [0.98, -0.3, -1.28, 0], [-0.98, -0.3, -1.28, 0]];
function poseCars(C, G, t) {
  const r3t = t;
  let wi = 0, fi = 0;
  const used = [[false, false, false], [false, false, false]];
  G.cars.forEach((c, i) => {
    const P = G.pose.cars[i], M = C.teams[c.team][c.slot];
    used[c.team][c.slot] = true;
    M.root.visible = P.vis;
    _cz.set(P.fx, P.fy, P.fz); _cy.set(P.ux, P.uy, P.uz); _cx.crossVectors(_cy, _cz).normalize();
    _cy.crossVectors(_cz, _cx).normalize();
    _cm.makeBasis(_cx, _cy, _cz); _cm.setPosition(P.x + P.ux * P.susp * 0.6, P.y + P.uy * P.susp * 0.6, P.z + P.uz * P.susp * 0.6);
    M.root.matrixAutoUpdate = false; M.root.matrix.copy(_cm); M.root.matrixWorldNeedsUpdate = true;
    // wheels
    for (let w = 0; w < 4; w++) {
      const W = WHEELS[w];
      _wq.setFromAxisAngle(_up, W[3] ? -P.steer * 0.42 : 0);
      _wq2.setFromAxisAngle(_v1.set(1, 0, 0), P.spin); _wq.multiply(_wq2);
      _wm.compose(_p3.set(W[0], W[1] + (P.ground ? 0 : -0.08), W[2]), _wq, P.vis ? _s3.set(1, 1, 1) : _s3.set(0.0001, 0.0001, 0.0001));
      _wm.premultiply(_cm); C.wheels.setMatrixAt(wi++, _wm);
    }
    // canopy glass and the driver: leans against the turn, looks toward the ball, celebrates or slumps after a goal
    C.glass.setMatrixAt(i, P.vis ? _cm : _wm.makeScale(0.0001, 0.0001, 0.0001));
    const rxv = P.uy * P.fz - P.uz * P.fy, rzv = P.ux * P.fy - P.uy * P.fx;
    const D = C.drv[i], car = G.cars[i], gi = G.goalInfo, H = D.H;
    if (D.team !== c.team) { D.team = c.team; H.setOutfit({ top: TEAM[c.team].col, helmet: TEAM[c.team].col }); }
    H.group.visible = P.vis;
    if (P.vis) {
      H.group.matrix.multiplyMatrices(_cm, C.drvOff); H.group.matrixWorldNeedsUpdate = true;
      // a goal is felt a moment later: the scorers punch the air, the others put a hand to the helmet
      if (G.phase !== D.phase) {
        D.phase = G.phase;
        if (G.phase === 'goal' && gi) { D.react = gi.team === car.team ? 'fistPump' : (Math.random() < 0.6 ? 'handsOnHead' : 'shrug'); D.at = r3t + 0.25 + Math.random() * 0.35; }
      }
      if (D.react && r3t >= D.at) { H.play(D.react, { speed: 1.2, intensity: 0.8 }); D.react = null; }
      H.setMood(car.ai && car.ai.mood ? clamp(car.ai.mood, -1, 1) : 0);
      _v1.set(G.pose.ball.x, G.pose.ball.y, G.pose.ball.z);
      H.update(R3.realDt || 0, { speed: 0, steer: clamp(P.steer, -1, 1), look: _v1 });
      H.bones.spine.rotation.z += -P.steer * 0.12; H.bones.neck.rotation.z += -P.steer * 0.08;
    }
    // contact shadow, faded as the car leaves the ground
    const hgt = Math.max(0, P.y - H0), bk = clamp(1 - hgt / 6, 0, 1);
    _q.setFromAxisAngle(_up, Math.atan2(P.fx, P.fz));
    _wm.compose(_p3.set(P.x, (P.ground && P.uy < 0.9 ? P.y - H0 * P.uy : 0.04), P.z), _q, P.vis && bk > 0.02 && P.uy > 0.5 ? _s3.set(2.7 * (1 + hgt * 0.06), 1, 4.9 * (1 + hgt * 0.06)) : _s3.set(0.0001, 0.0001, 0.0001));
    C.blob.setMatrixAt(i, _wm);
    // tyre marks: rear wheels on the flat pitch when the car slides, lands hard or launches
    if (C.skidOn && G.phase !== 'replay' && P.ground && P.uy > 0.96 && Math.abs(P.x) < PW && Math.abs(P.z) < PL && P.vis) {
      const sp = Math.hypot(P.vx, P.vz), lat = Math.abs(P.vx * P.fz - P.vz * P.fx) / Math.max(1, sp);
      const k = lat > 0.32 && sp > 7 ? Math.min(0.85, 0.3 + lat) : (P.boost && sp < 12 ? 0.5 : 0);
      for (let w = 0; w < 2; w++) {
        const sx = w ? -0.98 : 0.98;
        const wx = P.x + rxv * sx - P.fx * 1.28, wz = P.z + rzv * sx - P.fz * 1.28;
        if (k > 0) skidAt(C, i * 2 + w, wx, wz, k, R3.time); else C.skLast[i * 2 + w].on = false;
      }
    } else { C.skLast[i * 2].on = false; C.skLast[i * 2 + 1].on = false; }
    // boost flames
    for (let k = 0; k < 2; k++) {
      const on = P.boost && P.vis, fl = on ? 0.85 + Math.sin(t * 60 + k * 2 + i) * 0.15 : 0.0001;
      _wm.compose(_p3.set(k ? -0.35 : 0.35, -0.22, -2.3), _wq.identity(), _s3.set(on ? 1 + (P.sonic ? 0.25 : 0) : 0.0001, on ? 1 : 0.0001, fl * (P.sonic ? 1.4 : 1)));
      _wm.premultiply(_cm); C.flames.setMatrixAt(fi++, _wm);
    }
  });
  for (; wi < 24; wi++) { _wm.makeScale(0.0001, 0.0001, 0.0001); C.wheels.setMatrixAt(wi, _wm); }
  for (; fi < 12; fi++) { _wm.makeScale(0.0001, 0.0001, 0.0001); C.flames.setMatrixAt(fi, _wm); }
  for (let i = G.cars.length; i < 6; i++) { _wm.makeScale(0.0001, 0.0001, 0.0001); C.glass.setMatrixAt(i, _wm); C.blob.setMatrixAt(i, _wm); C.drv[i].H.group.visible = false; }
  const Bp = G.pose.ball, bh = Math.max(0, Bp.y - BR), bk2 = clamp(1 - bh / 9, 0, 1);
  _wm.compose(_p3.set(Bp.x, 0.045, Bp.z), _wq.identity(), Bp.vis && bk2 > 0.02 ? _s3.set(BR * 2.4 * (1 + bh * 0.08), 1, BR * 2.4 * (1 + bh * 0.08)) : _s3.set(0.0001, 0.0001, 0.0001));
  C.blob.setMatrixAt(6, _wm);
  [C.glass, C.blob].forEach((m) => { m.instanceMatrix.needsUpdate = true; });
  C.wheels.count = 24; C.flames.count = 12;
  C.wheels.instanceMatrix.needsUpdate = true; C.flames.instanceMatrix.needsUpdate = true;
  [0, 1].forEach((t2) => C.teams[t2].forEach((M, s) => { if (!used[t2][s]) M.root.visible = false; }));
}

/* ------------------------------------------------------------ the ball */
function buildBall(scene) {
  // panel centres of a truncated icosahedron: 12 pentagons and 20 hexagons
  const pts = [], ph = (1 + Math.sqrt(5)) / 2;
  [[0, 1, ph], [0, -1, ph], [0, 1, -ph], [0, -1, -ph], [1, ph, 0], [-1, ph, 0], [1, -ph, 0], [-1, -ph, 0], [ph, 0, 1], [-ph, 0, 1], [ph, 0, -1], [-ph, 0, -1]].forEach((p) => pts.push(new THREE.Vector3(p[0], p[1], p[2]).normalize()));
  const ip = 1 / ph;
  [[1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1], [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1], [0, ip, ph], [0, ip, -ph], [0, -ip, ph], [0, -ip, -ph], [ip, ph, 0], [ip, -ph, 0], [-ip, ph, 0], [-ip, -ph, 0], [ph, 0, ip], [ph, 0, -ip], [-ph, 0, ip], [-ph, 0, -ip]].forEach((p) => pts.push(new THREE.Vector3(p[0], p[1], p[2]).normalize()));
  const mat = std({ color: '#e9ecf2', roughness: 0.32, metalness: 0.15 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uPts = { value: pts }; sh.uniforms.uGlow = { value: 1 }; R3.ballShader = sh;
    sh.vertexShader = 'varying vec3 vObjN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObjN = normalize(position);');
    sh.fragmentShader = 'uniform vec3 uPts[32]; uniform float uGlow; varying vec3 vObjN;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n vec3 on = normalize(vObjN); float d1 = -2.0, d2 = -2.0; int k1 = 0;\n for (int i = 0; i < 32; i++) { float d = dot(on, uPts[i]); if (d > d1) { d2 = d1; d1 = d; k1 = i; } else if (d > d2) { d2 = d; } }\n float seam = 1.0 - smoothstep(0.0, 0.035, d1 - d2);\n float pent = k1 < 12 ? 1.0 : 0.0;\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.09, 0.12), pent * 0.92);\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.15), seam * 0.8);')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += vec3(0.35, 0.85, 1.6) * seam * uGlow + vec3(1.0, 0.5, 0.15) * pent * uGlow * 0.12;');
  };
  const ball = new THREE.Mesh(new THREE.SphereGeometry(BR, 48, 32), mat);
  ball.castShadow = true; scene.add(ball);
  const ringT = textures().pad;
  const mark = new THREE.Mesh(new THREE.PlaneGeometry(BR * 2.6, BR * 2.6).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: ringT, color: new THREE.Color(1.6, 1.6, 1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  scene.add(mark);
  return { ball, mark, mat };
}

/* ------------------------------------------------------------ particles */
let FX = null;
function makePool(n, additive, square) {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n);
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uScale: { value: 400 } },
    vertexShader: 'attribute vec3 aColor; attribute float aSize; attribute float aAlpha; uniform float uScale; varying vec3 vC; varying float vA;' +
      'void main(){ vC = aColor; vA = aAlpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'varying vec3 vC; varying float vA; void main(){ vec2 p = gl_PointCoord - 0.5; ' +
      (square ? 'if (abs(p.x) > 0.42 || abs(p.y) > 0.26) discard; float a = vA;' : 'float d = length(p); if (d > 0.5) discard; float a = vA * ' + (additive ? 'pow(1.0 - d * 2.0, 1.6)' : 'smoothstep(0.5, 0.15, d)') + ';') +
      ' gl_FragColor = vec4(vC' + (additive ? ' * a' : '') + ', a); }',
    transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false
  });
  const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5;
  return { n, pos, col, size, alpha, geo, mat, pts, vel: new Float32Array(n * 3), life: new Float32Array(n), max: new Float32Array(n), s0: new Float32Array(n), grow: new Float32Array(n), grav: new Float32Array(n), drag: new Float32Array(n), a0: new Float32Array(n), spin: new Float32Array(n), head: 0 };
}
function createFX(scene) {
  const F = { add: makePool(900, true), soft: makePool(500, false), conf: makePool(700, false, true), density: 1 };
  scene.add(F.add.pts, F.soft.pts, F.conf.pts);
  F.emit = (pool, x, y, z, vx, vy, vz, life, size, hex, alpha, grav, drag, grow) => {
    const P = F[pool]; const i = P.head; P.head = (P.head + 1) % P.n;
    P.pos[i * 3] = x; P.pos[i * 3 + 1] = y; P.pos[i * 3 + 2] = z;
    P.vel[i * 3] = vx; P.vel[i * 3 + 1] = vy; P.vel[i * 3 + 2] = vz;
    if (typeof hex === 'string') _c.set(hex); else _c.copy(hex);
    P.col[i * 3] = _c.r; P.col[i * 3 + 1] = _c.g; P.col[i * 3 + 2] = _c.b;
    P.life[i] = life; P.max[i] = life; P.s0[i] = size; P.size[i] = size; P.a0[i] = alpha; P.alpha[i] = alpha;
    P.grav[i] = grav || 0; P.drag[i] = drag || 0; P.grow[i] = grow || 0; P.spin[i] = Math.random() * 6;
  };
  F.update = (dt, scale) => {
    ['add', 'soft', 'conf'].forEach((k) => {
      const P = F[k]; P.mat.uniforms.uScale.value = scale;
      let any = false;
      for (let i = 0; i < P.n; i++) {
        if (P.life[i] <= 0) { if (P.size[i] !== 0) { P.alpha[i] = 0; P.size[i] = 0; any = true; } continue; }
        any = true;
        P.life[i] -= dt;
        const f = Math.max(0, P.life[i] / P.max[i]), dr = Math.exp(-P.drag[i] * dt);
        P.vel[i * 3] *= dr; P.vel[i * 3 + 1] = P.vel[i * 3 + 1] * dr - P.grav[i] * dt; P.vel[i * 3 + 2] *= dr;
        if (k === 'conf') { P.spin[i] += dt * 9; P.vel[i * 3] += Math.sin(P.spin[i]) * dt * 2.5; P.vel[i * 3 + 2] += Math.cos(P.spin[i] * 0.7) * dt * 2.5; }
        P.pos[i * 3] += P.vel[i * 3] * dt; P.pos[i * 3 + 1] += P.vel[i * 3 + 1] * dt; P.pos[i * 3 + 2] += P.vel[i * 3 + 2] * dt;
        if (P.pos[i * 3 + 1] < 0.05 && P.vel[i * 3 + 1] < 0) { P.pos[i * 3 + 1] = 0.05; P.vel[i * 3 + 1] *= -0.25; P.vel[i * 3] *= 0.6; P.vel[i * 3 + 2] *= 0.6; }
        P.size[i] = P.s0[i] * (1 + P.grow[i] * (1 - f)) * (k === 'conf' ? 0.55 + 0.45 * Math.abs(Math.sin(P.spin[i])) : 1);
        P.alpha[i] = P.a0[i] * (k === 'add' ? f : Math.min(1, f * 2.5));
      }
      if (any) { P.geo.attributes.position.needsUpdate = true; P.geo.attributes.aColor.needsUpdate = true; P.geo.attributes.aSize.needsUpdate = true; P.geo.attributes.aAlpha.needsUpdate = true; }
    });
  };
  F.clear = () => { ['add', 'soft', 'conf'].forEach((k) => { F[k].life.fill(0); }); };
  return F;
}
const rand = (a) => (Math.random() - 0.5) * a;
const chance = (p) => Math.random() < p * (FX ? FX.density : 1);
const CONF = ['#ffffff', '#ffd36a'];
function burst(x, y, z, n, speed, cols, up, life) {
  for (let i = 0; i < n * FX.density; i++) {
    const a = Math.random() * TAU, e = Math.random() * 1.2 - 0.2, s = speed * (0.4 + Math.random() * 0.8);
    FX.emit('conf', x, y, z, Math.cos(a) * Math.cos(e) * s, Math.sin(e) * s + (up || 0), Math.sin(a) * Math.cos(e) * s, (life || 3) * (0.6 + Math.random() * 0.7), 0.42, cols[i % cols.length], 1, 4.5, 1.3, 0);
  }
}
function sparks(x, y, z, n, speed, hex, life) {
  for (let i = 0; i < n * FX.density; i++) FX.emit('add', x, y, z, rand(speed), Math.random() * speed * 0.7, rand(speed), (life || 0.5) * (0.5 + Math.random()), 0.18 + Math.random() * 0.12, hex, 1, 9, 1.5, -0.4);
}
function smoke(x, y, z, n, hex, sz) {
  for (let i = 0; i < n * FX.density; i++) FX.emit('soft', x + rand(1.4), y + rand(0.6), z + rand(1.4), rand(2.4), 0.5 + Math.random() * 1.5, rand(2.4), 1.4 + Math.random(), sz || 1.2, hex || '#8a8794', 0.35, -0.3, 1.2, 2.2);
}

/* ------------------------------------------------------------ the look: dusk or night */
const LOOKS = {
  dusk: { top: '#1d2150', mid: '#7a4a7e', hor: '#ff9a62', glow: '#ff8a4a', fog: '#5e4a66', fogD: 0.0021, sun: '#ffb27a', sunDir: [-0.55, 0.06, -0.83], hemiS: '#a99acb', hemiG: '#2a2018', hemiI: 0.95, key: '#fff1dc', keyI: 3.0, fill: '#b9c8ff', fillI: 0.45, exposure: 0.95, lit: 0.42, stars: 0.15, cloud: 0.55, phones: 0.35, env: 0.85 },
  night: { top: '#03050f', mid: '#0b1430', hor: '#2a2340', glow: '#c86a3a', fog: '#141729', fogD: 0.0024, sun: '#dfe6ff', sunDir: [0.45, 0.32, -0.83], hemiS: '#5468a8', hemiG: '#141210', hemiI: 0.7, key: '#fff6e8', keyI: 3.3, fill: '#8aa0ff', fillI: 0.35, exposure: 1.0, lit: 0.62, stars: 1, cloud: 0.3, phones: 1, env: 0.75 }
};
const SKY_VS = 'varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }';
const SKY_FS = [
  'uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uGlow; uniform vec3 uSunDir; uniform vec3 uSun; uniform float uCloud; uniform float uTime; uniform float uStars; uniform float uCloudOn;',
  'varying vec3 vDir;',
  'float h21(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
  'float h31(vec3 p){ p = fract(p * 0.1031); p += dot(p, p.yzx + 33.33); return fract((p.x + p.y) * p.z); }',
  'float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y); }',
  'float fbm(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vn(p); p *= 2.03; a *= 0.5; } return s; }',
  'void main(){',
  '  vec3 d = normalize(vDir); float y = d.y;',
  '  vec3 c = mix(uHor, uMid, smoothstep(0.0, 0.25, y));',
  '  c = mix(c, uTop, smoothstep(0.2, 0.9, y));',
  '  c += uGlow * pow(1.0 - clamp(y, 0.0, 1.0), 8.0) * 0.45;',
  '  float sd = max(dot(d, normalize(uSunDir)), 0.0);',
  '  c += uSun * (pow(sd, 1600.0) * 9.0 + pow(sd, 40.0) * 0.45 + pow(sd, 5.0) * 0.18);',
  '  vec3 sc = floor(d * 380.0); float st = step(0.9965, h31(sc)) * smoothstep(0.05, 0.4, y);',
  '  c += vec3(1.3, 1.25, 1.1) * st * uStars * (0.5 + 0.5 * sin(uTime * 3.0 + h31(sc + 1.0) * 40.0));',
  '  if (y > 0.0 && uCloudOn > 0.5) {',
  '    vec2 uv = d.xz / (y + 0.12) * 0.9 + vec2(uTime * 0.004, uTime * 0.0015);',
  '    float n = fbm(uv * 1.3);',
  '    float cl = smoothstep(0.55 - uCloud * 0.25, 0.92, n) * smoothstep(0.0, 0.25, y);',
  '    vec3 cc = mix(uHor * 1.1, uSun, 0.35) * (0.45 + 0.9 * pow(sd, 3.0)) + uGlow * 0.15;',
  '    c = mix(c, cc, cl * 0.8);',
  '  }',
  '  if (y < 0.0) c = mix(uHor * 0.6, uHor * 0.25, smoothstep(0.0, -0.3, y));',
  '  gl_FragColor = vec4(c, 1.0);',
  '  #include <tonemapping_fragment>',
  '  #include <colorspace_fragment>',
  '}'
].join('\n');

/* ------------------------------------------------------------ post: bloom, grade, vignette, grain */
const POST = { ok: false };
const PVS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
function setupPost(r) {
  const ext = r.extensions;
  const fl = ext.has('EXT_color_buffer_float') || ext.has('EXT_color_buffer_half_float');
  POST.type = fl ? THREE.HalfFloatType : THREE.UnsignedByteType;
  POST.scene = new THREE.WebGLRenderTarget(4, 4, { type: POST.type, depthBuffer: true });
  POST.mips = []; POST.ups = [];
  for (let i = 0; i < 6; i++) { POST.mips.push(new THREE.WebGLRenderTarget(4, 4, { type: POST.type, depthBuffer: false })); POST.ups.push(new THREE.WebGLRenderTarget(4, 4, { type: POST.type, depthBuffer: false })); }
  POST.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const tri = new THREE.BufferGeometry();
  tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
  tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 2, 0, 0, 2], 2));
  const mk = (fs, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: PVS, fragmentShader: fs, depthTest: false, depthWrite: false, toneMapped: false });
  POST.bright = mk('uniform sampler2D tMap; uniform vec2 uTexel; uniform float uThr; varying vec2 vUv;' +
    'void main(){ vec3 c = texture2D(tMap, vUv + uTexel * vec2(-0.5, -0.5)).rgb + texture2D(tMap, vUv + uTexel * vec2(0.5, -0.5)).rgb + texture2D(tMap, vUv + uTexel * vec2(-0.5, 0.5)).rgb + texture2D(tMap, vUv + uTexel * vec2(0.5, 0.5)).rgb;' +
    ' c = min(c * 0.25, vec3(24.0)); float l = max(c.r, max(c.g, c.b)); float k = clamp(l - uThr + 0.35, 0.0, 0.7); k = k * k / 0.7; float w = max(k, l - uThr) / max(l, 1e-4); gl_FragColor = vec4(c * w, 1.0); }',
  { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uThr: { value: 1.5 } });
  POST.down = mk('uniform sampler2D tMap; uniform vec2 uTexel; varying vec2 vUv;' +
    'void main(){ vec2 h = uTexel; vec3 s = texture2D(tMap, vUv).rgb * 4.0 + texture2D(tMap, vUv - h).rgb + texture2D(tMap, vUv + h).rgb + texture2D(tMap, vUv + vec2(h.x, -h.y)).rgb + texture2D(tMap, vUv - vec2(h.x, -h.y)).rgb; gl_FragColor = vec4(s / 8.0, 1.0); }',
  { tMap: { value: null }, uTexel: { value: new THREE.Vector2() } });
  POST.up = mk('uniform sampler2D tLow; uniform sampler2D tCur; uniform vec2 uTexel; uniform float uMix; varying vec2 vUv;' +
    'void main(){ vec2 h = uTexel; vec3 s = texture2D(tLow, vUv + vec2(-h.x * 2.0, 0.0)).rgb + texture2D(tLow, vUv + vec2(-h.x, h.y)).rgb * 2.0 + texture2D(tLow, vUv + vec2(0.0, h.y * 2.0)).rgb + texture2D(tLow, vUv + vec2(h.x, h.y)).rgb * 2.0 +' +
    ' texture2D(tLow, vUv + vec2(h.x * 2.0, 0.0)).rgb + texture2D(tLow, vUv + vec2(h.x, -h.y)).rgb * 2.0 + texture2D(tLow, vUv + vec2(0.0, -h.y * 2.0)).rgb + texture2D(tLow, vUv + vec2(-h.x, -h.y)).rgb * 2.0;' +
    ' gl_FragColor = vec4(s / 12.0 * uMix + texture2D(tCur, vUv).rgb, 1.0); }',
  { tLow: { value: null }, tCur: { value: null }, uTexel: { value: new THREE.Vector2() }, uMix: { value: 1 } });
  POST.comp = new THREE.ShaderMaterial({
    uniforms: { tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.5 }, uTime: { value: 0 }, uGrain: { value: 0.035 }, uVig: { value: 1 }, uFlash: { value: 0 }, uFlashCol: { value: new THREE.Color(1, 1, 1) }, uSat: { value: 1.0 }, uRes: { value: new THREE.Vector2(1, 1) }, uHasBloom: { value: 1 } },
    vertexShader: PVS,
    fragmentShader: 'uniform sampler2D tScene; uniform sampler2D tBloom; uniform float uBloom; uniform float uTime; uniform float uGrain; uniform float uVig; uniform float uFlash; uniform vec3 uFlashCol; uniform float uSat; uniform vec2 uRes; uniform float uHasBloom; varying vec2 vUv;' +
      'float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }' +
      'void main(){ vec3 c = texture2D(tScene, vUv).rgb; if (uHasBloom > 0.5) c += texture2D(tBloom, vUv).rgb * uBloom; c += uFlashCol * uFlash;' +
      ' float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); c = mix(vec3(l), c, uSat);' +
      ' c *= mix(vec3(0.93, 0.99, 1.07), vec3(1.05, 1.0, 0.93), smoothstep(0.02, 1.4, l));' +
      ' vec2 d = vUv - 0.5; d.x *= uRes.x / uRes.y; float v = smoothstep(1.05, 0.3, length(d) * (0.9 + 0.25 * uVig)); c *= mix(1.0, v, 0.55 * uVig);' +
      ' gl_FragColor = vec4(c, 1.0);\n #include <tonemapping_fragment>\n #include <colorspace_fragment>\n' +
      ' float g = hash(vUv * uRes + fract(uTime * 7.3) * 117.0) - 0.5; gl_FragColor.rgb += g * uGrain; }',
    depthTest: false, depthWrite: false
  });
  POST.quad = new THREE.Mesh(tri, POST.comp); POST.quad.frustumCulled = false;
  POST.qs = new THREE.Scene(); POST.qs.add(POST.quad);
  POST.ok = true;
}
const _sz = new THREE.Vector2();
function sizePost(r, t) {
  r.getDrawingBufferSize(_sz);
  const w = Math.max(1, _sz.x), h = Math.max(1, _sz.y);
  if (POST.scene.samples !== t.msaa) { POST.scene.dispose(); POST.scene.samples = t.msaa; }
  POST.scene.setSize(w, h);
  let mw = Math.max(1, w >> 1), mh = Math.max(1, h >> 1);
  for (let i = 0; i < POST.mips.length; i++) { POST.mips[i].setSize(mw, mh); POST.ups[i].setSize(mw, mh); mw = Math.max(1, mw >> 1); mh = Math.max(1, mh >> 1); }
  POST.w = w; POST.h = h;
}
function pass(r, mat, target) { POST.quad.material = mat; r.setRenderTarget(target); r.render(POST.qs, POST.cam); }
function renderPost(r, scene, camera, t, time, flash, rm) {
  if (!POST.ok || !t.post) { r.setRenderTarget(null); r.render(scene, camera); return; }
  r.setRenderTarget(POST.scene); r.render(scene, camera);
  const L = t.bloom, M = POST.mips, U = POST.ups;
  if (L > 0) {
    POST.bright.uniforms.tMap.value = POST.scene.texture; POST.bright.uniforms.uTexel.value.set(1 / POST.w, 1 / POST.h);
    pass(r, POST.bright, M[0]);
    for (let i = 1; i < L; i++) { POST.down.uniforms.tMap.value = M[i - 1].texture; POST.down.uniforms.uTexel.value.set(1 / M[i - 1].width, 1 / M[i - 1].height); pass(r, POST.down, M[i]); }
    let low = M[L - 1];
    for (let i = L - 2; i >= 0; i--) { POST.up.uniforms.tLow.value = low.texture; POST.up.uniforms.tCur.value = M[i].texture; POST.up.uniforms.uTexel.value.set(1 / low.width, 1 / low.height); POST.up.uniforms.uMix.value = 1; pass(r, POST.up, U[i]); low = U[i]; }
    POST.comp.uniforms.tBloom.value = low.texture;
  }
  const cu = POST.comp.uniforms;
  cu.tScene.value = POST.scene.texture; cu.uHasBloom.value = L > 0 ? 1 : 0; cu.uTime.value = time; cu.uRes.value.set(POST.w, POST.h);
  cu.uFlash.value = rm ? 0 : flash; cu.uGrain.value = rm ? 0.015 : 0.032;
  pass(r, POST.comp, null);
}

/* ------------------------------------------------------------ the 3D stage */
const TIERS = [
  { px: 0.5, budget: 150000, shadow: false, map: 1024, post: false, msaa: 0, bloom: 0, crowd: 0, fx: 0.45, cheap: true, aniso: 1, lite: true },
  { px: 0.75, budget: 640000, shadow: false, map: 1024, post: true, msaa: 0, bloom: 4, crowd: 0.42, fx: 0.7, cheap: false, aniso: 2 },
  { px: 0.9, budget: 1.1e6, shadow: true, map: 1024, post: true, msaa: 2, bloom: 5, crowd: 0.72, fx: 1, cheap: false, aniso: 4 },
  { px: 1, budget: 2.1e6, shadow: true, map: 2048, post: true, msaa: 4, bloom: 6, crowd: 1, fx: 1, cheap: false, aniso: 8 }
];
function setup3D(a) {
  let renderer;
  try { renderer = new THREE.WebGLRenderer({ canvas: a.canvas, antialias: !GLINFO.soft, powerPreference: 'high-performance' }); } catch (e) { return false; }
  if (!renderer || !renderer.getContext()) return false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2('#5e4a66', 0.002);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.3, 3200);
  const hemi = new THREE.HemisphereLight('#a99acb', '#2a2018', 0.9); scene.add(hemi);
  const key = new THREE.DirectionalLight('#fff1dc', 3);
  key.position.set(HW + 34, 95, HL + 30); key.target.position.set(0, 0, 0);
  key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
  const sc = key.shadow.camera; sc.left = -80; sc.right = 80; sc.top = 80; sc.bottom = -80; sc.near = 20; sc.far = 260;
  key.shadow.bias = -0.0005; key.shadow.normalBias = 0.04; key.shadow.radius = 3;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight('#b9c8ff', 0.45); fill.position.set(-(HW + 34), 80, -(HL + 30)); scene.add(fill, fill.target);
  const flashL = new THREE.PointLight('#ffffff', 0, 90, 1.6); scene.add(flashL);
  const skyU = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 0.1, -1) }, uSun: { value: new THREE.Color() }, uCloud: { value: 0.5 }, uTime: { value: 0 }, uStars: { value: 0 }, uCloudOn: { value: 1 } };
  const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = 50; scene.add(sky);
  R3 = { renderer, scene, camera, hemi, key, fill, flashL, sky, skyMat, skyU, pmrem: new THREE.PMREMGenerator(renderer), envs: {}, quality: -1, lockQ: false, fps: 60, qT: 0, qN: 0, qWarm: 0, soft: false, lost: false, lastNow: 0, time: 0,
    camPos: new THREE.Vector3(0, 20, -60), camTgt: new THREE.Vector3(), camInit: false, hd: new THREE.Vector2(0, 1), fov: 62, flash: 0, flashCol: new THREE.Color(1, 1, 1), look: null, shock: [], lastRp: -1, excite: 0, orbit: 0, demoAt: null };
  try {
    const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : '';
    R3.gpu = name; R3.soft = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name);
  } catch (e) { R3.soft = false; }
  a.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.lost = true; });
  a.canvas.addEventListener('webglcontextrestored', () => { R3.lost = false; });
  TEX_ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  R3.S = buildStadium(scene);
  R3.C = buildCars(scene);
  R3.B = buildBall(scene);
  FX = createFX(scene);
  // goal shockwave rings
  for (let i = 0; i < 3; i++) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 64), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 3, 3), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
    m.visible = false; scene.add(m); R3.shock.push({ m, t: 9, dur: 1, max: 20 });
  }
  try { setupPost(renderer); } catch (e) { POST.ok = false; }
  return true;
}
function shockAt(x, y, z, nx, ny, nz, col, max, dur) {
  const s = R3.shock.reduce((a, b) => (a.t / a.dur > b.t / b.dur ? a : b));
  s.t = 0; s.dur = dur || 0.9; s.max = max || 18; s.m.visible = true;
  s.m.position.set(x, y, z); s.m.lookAt(x + nx, y + ny, z + nz);
  s.m.material.color.set(col).multiplyScalar(3);
}
const cheapCache = new Map();
function cheapOf(m) {
  if (!m.isMeshStandardMaterial) return m;
  let c = cheapCache.get(m);
  if (!c) {
    c = new THREE.MeshLambertMaterial({ color: m.color.clone(), map: m.map, vertexColors: m.vertexColors, emissive: m.emissive.clone(), emissiveMap: m.emissiveMap, emissiveIntensity: m.emissiveIntensity, side: m.side, transparent: m.transparent, opacity: m.opacity, alphaMap: m.alphaMap, depthWrite: m.depthWrite });
    c.userData.full = m; cheapCache.set(m, c);
  }
  return c;
}
function applyTier() {
  const r = R3, t = TIERS[r.quality];
  r.scene.traverse((o) => {
    if ((o.isMesh || o.isInstancedMesh) && o.material && !Array.isArray(o.material) && o !== r.B.ball && o !== r.S.crowd && !(o.material.userData && o.material.userData.keepMat)) {
      const full = o.material.userData && o.material.userData.full ? o.material.userData.full : o.material;
      const want = t.cheap ? cheapOf(full) : full;
      if (o.material !== want) o.material = want;
    }
  });
  TEX_ANISO = Math.min(t.aniso, r.renderer.capabilities.getMaxAnisotropy());
  ALL_TEX.forEach((tx) => { if (tx.anisotropy !== TEX_ANISO) { tx.anisotropy = TEX_ANISO; tx.needsUpdate = true; } });
  QUAL.forEach((m) => { m.castShadow = t.shadow && r.quality >= 3; });
  r.renderer.shadowMap.enabled = t.shadow; r.key.castShadow = t.shadow;
  if (r.key.shadow.mapSize.x !== t.map) { r.key.shadow.mapSize.set(t.map, t.map); if (r.key.shadow.map) { r.key.shadow.map.dispose(); r.key.shadow.map = null; } }
  r.S.crowd.count = Math.floor(r.S.crowdN * t.crowd); r.S.crowd.visible = t.crowd > 0;
  r.S.glarePts.visible = !t.lite; r.S.phonePts.visible = !t.lite; r.S.city.count = t.lite ? 110 : r.S.cityN;
  r.skyU.uCloudOn.value = t.lite ? 0 : 1;
  r.fill.visible = !t.lite; r.flashL.visible = r.quality >= 2;
  FX.density = t.fx;
  if (VFX) VFX.setQuality(r.quality);
  r.C.skidOn = r.quality >= 1 && !(r.soft && !r.lockQ); r.C.skid.visible = r.C.skidOn;
  r.C.blob.material.opacity = t.shadow ? 0.5 : 0.85;
  r.scene.environment = t.cheap ? null : (r.look ? r.envs[r.look] : null);
  r.hemi.intensity = (r.look ? LOOKS[r.look].hemiI : 0.9) * (t.cheap ? 1.7 : 1);
  r.key.intensity = (r.look ? LOOKS[r.look].keyI : 3) * (t.cheap ? 0.9 : 1);
}
function setQuality(q) {
  if (!R3) return;
  q = clamp(q | 0, 0, 3);
  if (q === R3.quality) return;
  R3.quality = q;
  applyTier(); resize3D(ARC);
}
let ARC = null;
function resize3D(a) {
  if (!R3 || !a) return;
  const t = TIERS[Math.max(0, R3.quality)];
  const pr = Math.min(a.dpr * t.px, Math.sqrt(t.budget / Math.max(1, a.w * a.h)));
  R3.renderer.setPixelRatio(Math.max(0.3, pr));
  R3.renderer.setSize(a.w, a.h, false);
  R3.camera.aspect = a.w / a.h; R3.camera.updateProjectionMatrix();
  if (POST.ok) sizePost(R3.renderer, t);
}
function setLook(name) {
  const r = R3, L = LOOKS[name] || LOOKS.dusk;
  r.look = name;
  r.scene.fog.color.set(L.fog); r.scene.fog.density = L.fogD;
  r.hemi.color.set(L.hemiS); r.hemi.groundColor.set(L.hemiG);
  r.key.color.set(L.key); r.fill.color.set(L.fill); r.fill.intensity = L.fillI;
  const u = r.skyU;
  u.uTop.value.set(L.top); u.uMid.value.set(L.mid); u.uHor.value.set(L.hor); u.uGlow.value.set(L.glow); u.uSun.value.set(L.sun); u.uCloud.value = L.cloud; u.uStars.value = L.stars;
  u.uSunDir.value.set(L.sunDir[0], L.sunDir[1], L.sunDir[2]).normalize();
  r.renderer.toneMappingExposure = L.exposure;
  r.renderer.setClearColor(L.fog);
  const fogC = new THREE.Color(L.fog);
  [r.S.cityMat].concat(r.S.nets).forEach((m) => { m.uniforms.fogColor.value.copy(fogC); m.uniforms.fogDensity.value = L.fogD; });
  r.S.cityMat.uniforms.uLit.value = L.lit;
  r.S.phones.uniforms.uOn.value = L.phones;
  if (!r.envs[name]) {
    // image based light: this sky, plus the four lamp banks, so paint and chrome catch the floodlights
    const es = new THREE.Scene(), em = new THREE.Mesh(new THREE.SphereGeometry(60, 24, 12), r.skyMat); es.add(em);
    const lampM = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.6, 5.2) });
    r.S.mastPos.forEach((m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(5, 3.5, 0.5), lampM); b.position.set(m[0] * 0.3, 20, m[1] * 0.3); b.lookAt(0, 0, 0); es.add(b); });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(40, 2.5, 6, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.65, 0.45) })); ring.rotation.x = Math.PI / 2; ring.position.y = 6; es.add(ring);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.06, 0.12, 0.05) })); floor.rotation.x = -Math.PI / 2; floor.position.y = -2; es.add(floor);
    const keepFog = r.scene.fog;
    r.envs[name] = r.pmrem.fromScene(es, 0.03, 0.1, 300).texture;
    em.geometry.dispose(); r.scene.fog = keepFog;
  }
  const t = TIERS[Math.max(0, r.quality)];
  r.scene.environment = t.cheap ? null : r.envs[name];
  r.scene.environmentIntensity = L.env;
  r.hemi.intensity = L.hemiI * (t.cheap ? 1.7 : 1);
  r.key.intensity = L.keyI * (t.cheap ? 0.9 : 1);
}

/* ------------------------------------------------------------ the camera */
const _cp = new THREE.Vector3(), _ct = new THREE.Vector3(), _ca = new THREE.Vector3(), SQ = { nx: 0, ny: 1, nz: 0, curv: 0 };
function keepInside(p, margin) {
  for (let i = 0; i < 2; i++) {
    const d = surf(p.x, p.y, p.z, SQ);
    if (d < margin) { p.x += SQ.nx * (margin - d); p.y += SQ.ny * (margin - d); p.z += SQ.nz * (margin - d); }
  }
  if (p.y < 0.8) p.y = 0.8;
}
// a smooth path through points (Catmull-Rom), u 0..1
function cr(P, u, out) {
  const n = P.length - 1, f = clamp(u, 0, 0.9999) * n, i = Math.floor(f), t = f - i;
  const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[Math.min(n, i + 1)], p3 = P[Math.min(n, i + 2)];
  const t2 = t * t, t3 = t2 * t;
  const k = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return out.set(k(p0[0], p1[0], p2[0], p3[0]), k(p0[1], p1[1], p2[1], p3[1]), k(p0[2], p1[2], p2[2], p3[2]));
}
function camera(a, G, dt) {
  const r = R3, cam = r.camera, port = a.w / a.h < 0.85, rm = a.reducedMotion, ph = G.phase;
  const pi = G.player.id, P = G.pose.cars[pi], B = G.pose.ball;
  let fov = port ? 76 : 62, kPos = 1 - Math.exp(-dt * (rm ? 5 : 8)), kTgt = 1 - Math.exp(-dt * (rm ? 6 : 11)), snap = false;
  if (G.cfg.attract) {
    // broadcast: a slow orbit high over the stands, always on the ball
    r.orbit += dt * 0.045;
    const an = r.orbit + 0.6;
    _cp.set(Math.cos(an) * (HW - 12), 17 + Math.sin(r.orbit * 1.7) * 4, Math.sin(an) * (HL - 14));
    _ct.set(B.x * 0.7, Math.min(6, B.y * 0.5 + 1), B.z * 0.7);
    fov = port ? 78 : 58;
  } else if (ph === 'intro' || ph === 'introOut') {
    const u = smooth01(G.pt / 4.2);
    const s = G.player.team === 0 ? -1 : 1;
    const path = [[-260, 120, s * 260], [-150, 72, s * 140], [-70, 42, s * 72], [-18, 16, s * 40], [P.x - P.fx * 11, 5, P.z - P.fz * 11]];
    cr(path, u, _cp);
    _ct.set(lerp(0, P.x, smooth01((u - 0.55) / 0.45)), lerp(10, 1.5, u), lerp(0, P.z + P.fz * 10, smooth01((u - 0.55) / 0.45)));
    fov = lerp(port ? 62 : 44, port ? 76 : 62, u); snap = true;
  } else if (ph === 'replay' || ph === 'replayOut') {
    const R = G.rp, gi = G.goalInfo, late = R.t > R.tg - 1.1;
    const shot = late ? 1 : 0;
    if (shot !== R.shot) { R.shot = shot; snap = true; }
    if (!late) {
      // trackside: level with the ball, from the side it is not heading to
      const vx = B.vx, vz = B.vz, sp = Math.hypot(vx, vz) || 1, px = -vz / sp, pz = vx / sp, side = px * B.x + pz * B.z > 0 ? -1 : 1;
      _cp.set(B.x + px * side * 16 - vx / sp * 6, Math.max(3, B.y * 0.6 + 3.5), B.z + pz * side * 16 - vz / sp * 6);
      _ct.set(B.x, B.y, B.z); fov = 46;
    } else {
      // the goal camera, low in the corner of the net looking out at the ball
      const s = gi.side, cx = (gi.x > 0 ? -1 : 1) * (GW - 1.6);
      _cp.set(cx, 1.6, s * (HL + GD - 1.2)); _ct.set(B.x, B.y, B.z); fov = 58;
      if (!B.vis || R.t > R.tg) _ct.set(gi.x * 0.5, 3, s * (HL - 6));
    }
    kPos = 1 - Math.exp(-dt * 6); kTgt = 1 - Math.exp(-dt * 14);
  } else if (ph === 'over') {
    r.orbit += dt * 0.22;
    const R = 17, an = r.orbit + Math.PI;
    _cp.set(Math.sin(an) * R, 4.2 + Math.sin(r.orbit) * 1.2, -Math.cos(an) * R);
    _ct.set(0, 1.2, 0); fov = port ? 70 : 50; kPos = 1 - Math.exp(-dt * 3);
  } else if (G.player.demoT > 0 && r.demoAt) {
    // knocked out: hold on the spot and drift round it
    r.orbit += dt * 0.4;
    _cp.set(r.demoAt.x + Math.cos(r.orbit) * 12, r.demoAt.y + 6, r.demoAt.z + Math.sin(r.orbit) * 12);
    _ct.set(r.demoAt.x, r.demoAt.y + 1, r.demoAt.z);
  } else {
    // gameplay: ball cam or car cam
    let dx, dz;
    const ballCam = G.cam === 'ball' && B.vis;
    if (ballCam) { dx = B.x - P.x; dz = B.z - P.z; const l = Math.hypot(dx, dz); if (l < 2) { dx = P.fx; dz = P.fz; } else { dx /= l; dz /= l; } }
    else { const sp = Math.hypot(P.vx, P.vz); if (sp > 4 && P.ground && P.uy > 0.7) { dx = P.vx / sp; dz = P.vz / sp; } else { dx = P.fx; dz = P.fz; } }
    const hl = Math.hypot(dx, dz) || 1; dx /= hl; dz /= hl;
    r.hd.x += (dx - r.hd.x) * Math.min(1, dt * (ballCam ? 5 : 4)); r.hd.y += (dz - r.hd.y) * Math.min(1, dt * (ballCam ? 5 : 4));
    const hn = Math.hypot(r.hd.x, r.hd.y) || 1, hx = r.hd.x / hn, hz = r.hd.y / hn;
    const sp = Math.hypot(P.vx, P.vy, P.vz);
    const dist = (port ? 12.5 : 10.5) + clamp(sp / 30, 0, 1) * 1.5, h = port ? 4.3 : 3.2;
    _cp.set(P.x - hx * dist, P.y + h, P.z - hz * dist);
    if (P.ground && P.uy < 0.75) { _cp.x += P.ux * 3; _cp.y += P.uy * 1.5; _cp.z += P.uz * 3; }
    if (ballCam) {
      _ct.set(lerp(P.x, B.x, 0.62), lerp(P.y + 1.3, B.y, 0.62), lerp(P.z, B.z, 0.62));
      // never tilt so high that the car leaves the bottom of the frame
      const half = (r.fov || fov) * Math.PI / 360, carAng = Math.atan2(P.y - _cp.y, Math.hypot(P.x - _cp.x, P.z - _cp.z));
      const maxAng = carAng + Math.atan(0.56 * Math.tan(half)), hd = Math.hypot(_ct.x - _cp.x, _ct.z - _cp.z);
      if (Math.atan2(_ct.y - _cp.y, hd) > maxAng) _ct.y = _cp.y + Math.tan(maxAng) * hd;
    } else {
      _ct.set(P.x + hx * 9, P.y + 1.3, P.z + hz * 9);
    }
    if (ph === 'countdown') { const k = clamp(G.cd / 3, 0, 1); _cp.x -= hx * k * 4; _cp.z -= hz * k * 4; _cp.y += k * 2.2; }
    if (ph === 'goal' && G.goalInfo) {
      // the reaction shot: rise a little and turn to the goal mouth as it erupts
      const gi = G.goalInfo, k = smooth01(G.pt / 0.6);
      _cp.y += k * 3.5;
      _ct.x = lerp(_ct.x, gi.x * 0.6, k); _ct.y = lerp(_ct.y, GH * 0.55, k); _ct.z = lerp(_ct.z, gi.side * HL, k);
      kTgt = 1 - Math.exp(-dt * 5);
    }
    const kick = rm ? 0 : clamp((sp - 12) / 20, 0, 1) * 6 + (P.boost ? 4 : 0) + (P.sonic ? 3 : 0);
    fov += kick;
  }
  keepInside(_cp, G.cfg.attract || ph === 'intro' || ph === 'introOut' || ph === 'over' ? -9999 : 1.6);
  if (!r.camInit || snap && (ph === 'replay')) { r.camPos.copy(_cp); r.camTgt.copy(_ct); r.camInit = true; }
  else if (snap) { r.camPos.copy(_cp); r.camTgt.copy(_ct); }
  else { r.camPos.lerp(_cp, kPos); r.camTgt.lerp(_ct, kTgt); }
  cam.position.copy(r.camPos);
  const sx = a.shakeX || 0, sy = a.shakeY || 0;
  if (sx || sy) { cam.position.x += sx * 0.03; cam.position.y += sy * 0.03; }
  cam.up.set(0, 1, 0);
  cam.lookAt(r.camTgt);
  // a little lean into the turn
  if (ph === 'live' && !G.cfg.attract) { const roll = -(P.steer || 0) * (rm ? 0 : 0.025) * clamp(Math.hypot(P.vx, P.vz) / 20, 0, 1); r.roll = (r.roll || 0) + (roll - (r.roll || 0)) * Math.min(1, dt * 4); cam.rotateZ(r.roll); }
  r.fov += (fov - r.fov) * Math.min(1, dt * (snap ? 99 : 4));
  if (Math.abs(cam.fov - r.fov) > 0.01 || Math.abs(cam.aspect - a.w / a.h) > 1e-4) { cam.fov = r.fov; cam.aspect = a.w / a.h; cam.updateProjectionMatrix(); }
  cam.updateMatrixWorld();
}

/* ------------------------------------------------------------ effects from the rules */
// Spectacle from the shared library on top of the stadium's own particles: a goal is a stadium burst
// (confetti cannons, pyro jets, fireworks, a team-colour shockwave) with a slow-motion beat, a knock-out
// is a real explosion, big hits crack with sparks, boost is a flame jet with heat glow and smoke, speed
// streaks frame the screen at supersonic, the ball draws a ribbon when it flies, and full time ends in
// a victory shower over the pitch.
let VFX = null, VBT = null;
const VNI = [];
const _vp = new THREE.Vector3(), _vn = new THREE.Vector3();
function vfxFrame(G, dt) {
  // created a few frames in, once the menu is up, so it never delays the first paint
  if (!VFX && !R3.vfxTried && (R3.vfxWait = (R3.vfxWait || 0) + 1) > 3) {
    R3.vfxTried = true;
    try { VFX = createVFX(R3.renderer, R3.scene, R3.camera, { quality: Math.max(0, R3.quality), unit: 1, groundY: 0, soft: R3.soft }); VFX.warm(); } catch (e) { VFX = null; }
  }
  if (!VFX) return;
  const B = G.pose.ball, bs = Math.hypot(B.vx, B.vy, B.vz);
  if (B.vis && bs > 20 && !VBT) VBT = VFX.trail(R3.B.ball, { color: '#bfe8ff', width: 1.1, life: 0.4, core: 0.75 });
  else if ((!B.vis || bs < 12) && VBT) { VBT.stop(); VBT = null; }
  let speed = 0;
  G.cars.forEach((c, i) => {
    const P = G.pose.cars[i], M = R3.C.teams[c.team][c.slot];
    if (!VNI[i] || VNI[i].obj !== M.root) { if (VNI[i]) VNI[i].stop(); VNI[i] = VFX.nitro(M.root, { offset: [0, -0.22, -2.35], color: TEAM[c.team].glow, size: 0.9 }); VNI[i].obj = M.root; }
    VNI[i].set(P.boost && P.vis ? 1 : 0);
    if (c.isPlayer && P.vis && G.phase === 'live') speed = P.sonic ? 0.85 : P.boost ? 0.4 : 0;
  });
  VFX.speedLines(R3.camera, speed);
  VFX.setReduced(!!(ARC && ARC.reducedMotion));
  VFX.update(dt);
}
function fx(type, d, G) {
  if (!FX || !R3 || R3.lost) return;
  if (VFX) {
    if (type === 'goal') { _vp.set(d.x, Math.max(2, d.y), d.side * (HL - 1)); VFX.goalBurst(_vp, { color: TEAM[d.team].col, color2: TEAM[d.team].glow, size: 1.4 }); VFX.timeWarp(0.35, 1.4); }
    else if (type === 'demo') { _vp.set(d.x, d.y, d.z); VFX.explosion(_vp, { size: 1.5, color: '#ffb060' }); }
    else if (type === 'hit' && d.k > 0.55) { _vp.set(d.x, d.y, d.z); _vn.set(d.x - d.car.p.x, d.y - d.car.p.y, d.z - d.car.p.z).normalize(); VFX.impact(_vp, _vn, { kind: 'spark', color: TEAM[d.car.team].glow, size: 0.8 + d.k }); VFX.ring(_vp, TEAM[d.car.team].glow, { size: 2 + d.k * 3, normal: _vn, kind: 'shock' }); }
    else if (type === 'end') { _vp.set(0, 10, 0); VFX.winBurst(_vp, { colors: [TEAM[d.team == null ? 0 : d.team].col, '#ffd36a', '#ffffff'], size: 1.6 }); }
  }
  if (type === 'hit') {
    const k = d.k, c = TEAM[d.car.team];
    sparks(d.x, d.y, d.z, 6 + k * 26, 6 + k * 14, k > 0.5 ? '#ffe7b0' : c.glow, 0.45);
    if (k > 0.55) shockAt(d.x, d.y, d.z, d.x - d.car.p.x, d.y - d.car.p.y, d.z - d.car.p.z, c.glow, 4 + k * 6, 0.35);
    R3.ballGlow = Math.max(R3.ballGlow || 0, 0.6 + k * 2.4);
    if (ARC && !ARC.reducedMotion && k > 0.6 && d.car.isPlayer) ARC.shake = Math.max(ARC.shake || 0, k * 6);
  } else if (type === 'bounce' || type === 'post') {
    sparks(d.x, d.y, d.z, 4 + d.k * 14, 5 + d.k * 8, type === 'post' ? '#ffffff' : '#cfe8ff', 0.35);
    if (type === 'post') R3.flash = Math.max(R3.flash, 0.05);
    // the net shakes when the ball lands in it
    if (Math.abs(d.z) > HL - 0.5) { const t = d.z > 0 ? 1 : 0; const m = R3.S.nets[t]; m.uniforms.uHit.value.set(d.x, d.y, d.z); m.uniforms.uT.value = 0; m.uniforms.uAmp.value = 0.35 + d.k * 0.9; }
  } else if (type === 'goal') {
    const t = d.team, col = TEAM[t].col, glow = TEAM[t].glow, s = d.side;
    R3.flash = 0.55; R3.flashCol.set(glow); R3.excite = 1; R3.exAge = 0; R3.exTeam = t;
    R3.flashL.position.set(d.x, Math.max(2, d.y), s * (HL - 2)); R3.flashL.color.set(glow); R3.flashL.intensity = 4000;
    burst(d.x, Math.max(2, d.y), s * (HL - 1), 280, 22, [col, glow, '#ffffff', '#ffd36a'], 6, 4.2);
    sparks(d.x, d.y, d.z, 120, 28, '#fff2cc', 1.1);
    smoke(d.x, d.y, s * (HL - 1), 14, glow, 2.2);
    shockAt(0, GH / 2, s * (HL - 0.4), 0, 0, -s, glow, 34, 1.1);
    shockAt(0, GH / 2, s * (HL - 0.6), 0, 0, -s, '#ffffff', 22, 0.8);
    const m = R3.S.nets[s > 0 ? 1 : 0]; m.uniforms.uHit.value.set(d.x, d.y, s * (HL + GD)); m.uniforms.uT.value = 0; m.uniforms.uAmp.value = 1.6;
    // fireworks over the stand behind the goal
    R3.fireworks = [{ at: 0.2, x: -24, z: s * (HL + 26) }, { at: 0.55, x: 22, z: s * (HL + 22) }, { at: 0.9, x: 0, z: s * (HL + 34) }, { at: 1.3, x: -10, z: s * (HL + 18) }].map((f) => Object.assign(f, { col: [col, glow, '#ffffff'] }));
    R3.fwT = 0;
  } else if (type === 'demo') {
    const c = TEAM[d.car.team];
    R3.flash = Math.max(R3.flash, 0.25); R3.flashCol.set('#fff1d0');
    R3.flashL.position.set(d.x, d.y + 1, d.z); R3.flashL.color.set('#ffd9a0'); R3.flashL.intensity = 2500;
    sparks(d.x, d.y, d.z, 70, 18, '#ffd9a0', 0.9);
    burst(d.x, d.y + 1, d.z, 70, 10, [c.col, c.glow, '#ffffff'], 4, 2.2);
    smoke(d.x, d.y, d.z, 18, '#6d6a78', 1.8);
    shockAt(d.x, 0.15, d.z, 0, 1, 0, c.glow, 12, 0.7);
    if (d.car.isPlayer) R3.demoAt = { x: d.x, y: d.y, z: d.z };
  } else if (type === 'respawn') {
    const c = d.car; sparks(c.p.x, c.p.y + 0.5, c.p.z, 30, 6, TEAM[c.team].glow, 0.7);
  } else if (type === 'pad') {
    const p = d.pad;
    for (let i = 0; i < (p.big ? 40 : 10) * FX.density; i++) FX.emit('add', p.x + rand(1.5), 0.6 + Math.random(), p.z + rand(1.5), rand(3), 2 + Math.random() * 5, rand(3), 0.6, 0.3, '#ffb347', 1, 2, 1, 0);
  } else if (type === 'jump') {
    const c = d.car; if (!d.double) smoke(c.p.x, c.p.y - 0.5, c.p.z, 4, '#9a978f', 0.9);
  } else if (type === 'flip') {
    void d;
  } else if (type === 'land') {
    const c = d.car; smoke(c.p.x, c.p.y - 0.6, c.p.z, 3 + d.k * 8, '#9a978f', 1);
  } else if (type === 'bump') {
    sparks(d.x, d.y, d.z, 10 + d.k * 20, 8, '#ffe0a0', 0.4);
  } else if (type === 'end') {
    R3.excite = 1; R3.exAge = 0; R3.exTeam = d.team == null ? -1 : d.team; R3.endT = 0; R3.endTeam = d.team;
  }
}

/* ------------------------------------------------------------ per-frame */
const _pv = new THREE.Vector3(), _cfw = new THREE.Vector3();
function frame(a, G, dt) {
  const r = R3, S = r.S, t = TIERS[Math.max(0, r.quality)];
  r.time += dt; r.realDt = dt;
  r.C.skid.material.uniforms.uTime.value = r.time;
  vfxFrame(G, dt);
  poseCars(r.C, G, r.time);
  // ball
  const B = G.pose.ball, bm = r.B.ball;
  bm.visible = B.vis; bm.position.set(B.x, B.y, B.z); bm.quaternion.set(B.q[0], B.q[1], B.q[2], B.q[3]);
  r.ballGlow = Math.max(0, (r.ballGlow || 0) - dt * 2.4);
  if (r.ballShader) r.ballShader.uniforms.uGlow.value = 0.7 + r.ballGlow + clamp(Math.hypot(B.vx, B.vy, B.vz) / 40, 0, 1) * 0.6;
  const onPitch = Math.abs(B.x) < PW && Math.abs(B.z) < PL + (Math.abs(B.x) < GW ? 20 : 0);
  r.B.mark.visible = B.vis && onPitch && B.y > BR + 0.6;
  if (r.B.mark.visible) { r.B.mark.position.set(B.x, 0.04, B.z); const k = clamp((B.y - BR) / 14, 0, 1); r.B.mark.material.opacity = 0.9 - k * 0.5; r.B.mark.scale.setScalar(1 - k * 0.35); }
  // a replay starts clean: the confetti of the live goal is swept away
  if ((G.phase === 'replay') !== !!r.inReplay) { r.inReplay = G.phase === 'replay'; if (FX) FX.clear(); r.fireworks = null; }
  // replay: replay the explosion when the ball crosses the line
  if (G.phase === 'replay' && G.rp && G.goalInfo) {
    if (r.lastRp >= 0 && r.lastRp < G.rp.tg && G.rp.t >= G.rp.tg) { fx('goal', G.goalInfo, G); r.flash = 0.35; }
    r.lastRp = G.rp.t;
  } else r.lastRp = -1;
  // boost flames, supersonic streaks, ball trail
  if (FX) {
    G.cars.forEach((c, i) => {
      const P = G.pose.cars[i]; if (!P.vis) return;
      if (P.boost && chance(1)) {
        for (let k = 0; k < 2; k++) {
          _v1.set(k ? -0.35 : 0.35, -0.22, -2.4); _v2.set(P.fx, P.fy, P.fz); _v3.set(P.ux, P.uy, P.uz);
          const rx = _v3.y * _v2.z - _v3.z * _v2.y, ry = _v3.z * _v2.x - _v3.x * _v2.z, rz = _v3.x * _v2.y - _v3.y * _v2.x;
          const x = P.x + rx * _v1.x + _v3.x * _v1.y + _v2.x * _v1.z, y = P.y + ry * _v1.x + _v3.y * _v1.y + _v2.y * _v1.z, z = P.z + rz * _v1.x + _v3.z * _v1.y + _v2.z * _v1.z;
          FX.emit('add', x, y, z, -P.fx * 8 + rand(1.2), -P.fy * 8 + rand(1.2), -P.fz * 8 + rand(1.2), 0.22 + Math.random() * 0.1, 0.38, Math.random() < 0.5 ? '#ffb347' : TEAM[c.team].glow, 0.9, -1, 2, -0.6);
          if (Math.random() < 0.25) FX.emit('soft', x, y, z, -P.fx * 3 + rand(1), 0.6, -P.fz * 3 + rand(1), 0.9, 0.7, '#8a8590', 0.18, -0.3, 1.5, 2.5);
        }
      }
      if (P.sonic && chance(0.8)) {
        for (let k = -1; k <= 1; k += 2) FX.emit('add', P.x - P.fx * 2 + P.fz * k * 0.95, P.y + 0.1, P.z - P.fz * 2 - P.fx * k * 0.95, -P.vx * 0.05, 0, -P.vz * 0.05, 0.35, 0.28, '#e8f4ff', 0.7, 0, 0, -0.5);
      }
      if (P.ground && !P.boost && Math.hypot(P.vx, P.vz) > 14 && chance(0.15)) FX.emit('soft', P.x - P.fx * 2, P.y - 0.55, P.z - P.fz * 2, rand(1), 0.4, rand(1), 0.8, 0.8, '#7e7a74', 0.14, -0.2, 2, 2);
      // a hard slide tears turf: dark clumps thrown up and back that fall and settle, with a haze of dust behind them
      if (P.ground && P.uy > 0.9) {
        const sp = Math.hypot(P.vx, P.vz), lat = Math.abs(P.vx * P.fz - P.vz * P.fx) / Math.max(1, sp);
        if (sp > 8 && lat > 0.35 && chance(0.7)) {
          const side = Math.random() < 0.5 ? 1 : -1, wx = P.x + P.fz * side * 0.98 - P.fx * 1.3, wz = P.z - P.fx * side * 0.98 - P.fz * 1.3;
          FX.emit('soft', wx, Math.max(0.15, P.y - 0.6), wz, -P.vx * 0.12 + rand(2.2), 1.6 + Math.random() * 2.6, -P.vz * 0.12 + rand(2.2), 0.7 + Math.random() * 0.5, 0.16 + Math.random() * 0.12, Math.random() < 0.6 ? '#2f4a22' : '#4a3a26', 0.95, 11, 0.8, 0);
          if (chance(0.35)) FX.emit('soft', wx, Math.max(0.2, P.y - 0.5), wz, -P.vx * 0.05 + rand(1), 0.5 + Math.random() * 0.6, -P.vz * 0.05 + rand(1), 1.2 + Math.random() * 0.6, 0.9, '#8a8268', 0.16, -0.15, 1.6, 2.4);
        }
      }
    });
    const bs = Math.hypot(B.vx, B.vy, B.vz);
    if (B.vis && bs > 22 && chance(1)) FX.emit('add', B.x + rand(1.2), B.y + rand(1.2), B.z + rand(1.2), 0, 0, 0, 0.35, 0.9 + bs / 60, '#9fdcff', 0.5 * clamp((bs - 22) / 20, 0.2, 1), 0, 0, -0.6);
    // fireworks after a goal
    if (r.fireworks) {
      r.fwT += dt;
      r.fireworks.forEach((f) => {
        if (f.done || r.fwT < f.at) return; f.done = true;
        const y = 70 + Math.random() * 25;
        for (let i = 0; i < 90 * FX.density; i++) { const a2 = Math.random() * TAU, e = Math.acos(Math.random() * 2 - 1), sp = 14 + Math.random() * 6; FX.emit('add', f.x, y, f.z, Math.sin(e) * Math.cos(a2) * sp, Math.cos(e) * sp, Math.sin(e) * Math.sin(a2) * sp, 1.6 + Math.random() * 0.6, 1.4, f.col[i % 3], 1, 3, 0.9, -0.5); }
      });
      if (r.fwT > 2) r.fireworks = null;
    }
    // podium confetti
    if (G.phase === 'over' && chance(1)) for (let i = 0; i < 3; i++) FX.emit('conf', rand(30), 22 + Math.random() * 4, rand(30), rand(2), -1, rand(2), 6, 0.45, [TEAM[G.winner == null ? 0 : G.winner].col, '#ffd36a', '#ffffff'][i], 1, 1.2, 0.6, 0);
    FX.update(dt, a.h * r.renderer.getPixelRatio() * 0.5 / Math.tan(r.camera.fov * Math.PI / 360));
  }
  // shockwaves
  r.shock.forEach((s) => {
    if (s.t > s.dur) { s.m.visible = false; return; }
    s.t += dt; const f = s.t / s.dur, sc = 1 + smooth01(f) * s.max;
    s.m.scale.setScalar(sc); s.m.material.opacity = (1 - f) * 0.9;
  });
  // flash light decays
  r.flashL.intensity *= Math.exp(-dt * 5);
  r.flash = Math.max(0, r.flash - dt * 1.6);
  r.excite = Math.max(G.phase === 'goal' || G.phase === 'over' ? 0.7 : 0.0, r.excite - dt * 0.18);
  // animated materials
  r.exAge = (r.exAge == null ? 9 : r.exAge) + dt;
  if (S.crowdShader) { const u = S.crowdShader.uniforms; u.uTime.value = r.time; u.uExcite.value = Math.max(r.excite, G.crowd * 0.5); u.uAge.value = r.exAge; u.uTeam.value = r.exTeam == null ? -1 : r.exTeam; }
  S.phones.uniforms.uTime.value = r.time; S.beacons.uniforms.uTime.value = r.time; S.traffic.uniforms.uTime.value = r.time;
  S.led.offset.x = (r.time * 0.02) % 1;
  S.nets.forEach((m) => { m.uniforms.uT.value += dt; m.uniforms.uTime.value = r.time; });
  r.C.flameMat.uniforms.uTime.value = r.time;
  r.skyU.uTime.value = r.time;
  updatePads(r.pads, G, r.time);
  camera(a, G, dt);
  r.sky.position.copy(r.camera.position);
  const scale = a.h * r.renderer.getPixelRatio() * 0.5 / Math.tan(r.camera.fov * Math.PI / 360);
  S.phones.uniforms.uScale.value = scale; S.glare.uniforms.uScale.value = scale; S.beacons.uniforms.uScale.value = scale; S.traffic.uniforms.uScale.value = scale;
  renderPost(r.renderer, r.scene, r.camera, t, r.time, r.flash * (r.flashCol.r + r.flashCol.g + r.flashCol.b) / 3, a.reducedMotion);
  if (POST.ok && t.post) POST.comp.uniforms.uFlashCol.value.copy(r.flashCol);
}

/* ------------------------------------------------------------ the view the core talks to */
function measureFps(dt) {
  const r = R3;
  if (r.qWarm < 6) { r.qWarm++; return; }
  r.qT += dt; r.qN++;
  if (r.qT >= 1.2) {
    r.fps = r.qN / r.qT; r.qT = 0; r.qN = 0;
    if (!r.lockQ && r.fps < 38 && r.quality > 0) { setQuality(r.fps < 18 ? Math.max(0, r.quality - 2) : r.quality - 1); r.qWarm = 0; }
  }
}
const view = {
  name: '3d', three: true,
  camPos: new THREE.Vector3(),
  init(a) {
    ARC = a;
    if (!setup3D(a)) {
      a.panel({ eyebrow: 'Nitro Goal', title: '3D graphics <em>unavailable</em>', html: '<p>This browser could not start WebGL. The 2D edition of the game will load instead.</p>', actions: [{ label: 'Play in 2D', primary: true, on: () => { location.reload(); } }, { label: 'All games', href: '/games' }] });
      return false;
    }
    const q = /[?&]q=(\d)/.exec(location.search);
    setQuality(q ? +q[1] : R3.soft ? 0 : a.device === 'desktop' ? 3 : 2);
    if (q) R3.lockQ = true;
    resize3D(a);
    return true;
  },
  resize(a) { resize3D(a); },
  graphics(level) { if (!R3) return; if (level === 'auto') { R3.lockQ = false; return; } R3.lockQ = true; setQuality(level === 'sharp' ? 3 : 1); },
  newMatch(G, a) {
    const r = R3; if (!r) return;
    setLook(G.cfg.sky === 'night' ? 'night' : 'dusk');
    applyTier();
    if (!r.pads) { r.pads = buildPads(r.scene, G); applyTier(); }
    if (!G.cfg.attract) { FX.clear(); r.camInit = false; r.demoAt = null; r.fireworks = null; r.orbit = 0; }
    r.hd.set(G.player.f.x, G.player.f.z);
    r.qWarm = 0;
  },
  render(a, G, ctx) {
    const r = R3; if (!r) return false;
    const now = performance.now(), dtRaw = r.lastNow ? (now - r.lastNow) / 1000 : 1 / 60, dt = clamp(dtRaw, 0.001, 0.1); r.lastNow = now;
    let lost = r.lost;
    try { lost = lost || r.renderer.getContext().isContextLost(); } catch (e) { lost = true; }
    if (lost) {
      ctx.fillStyle = 'rgba(6,5,8,.9)'; ctx.fillRect(0, 0, a.w, a.h);
      ctx.font = '600 16px Inter, sans-serif'; ctx.fillStyle = '#fbf5ec'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('Graphics paused. Restoring...', a.w / 2, a.h / 2);
      return false;
    }
    measureFps(dtRaw);
    frame(a, G, a.state === 'pause' ? 0 : dt);
    view.camPos.copy(r.camera.position);
    return true;
  },
  project(x, y, z, out) {
    const cam = R3.camera;
    _cfw.set(0, 0, -1).applyQuaternion(cam.quaternion);
    _pv.set(x - cam.position.x, y - cam.position.y, z - cam.position.z);
    out.behind = _pv.dot(_cfw) < 0.2;
    _pv.set(x, y, z).project(cam);
    out.x = (_pv.x * 0.5 + 0.5) * ARC.w; out.y = (0.5 - _pv.y * 0.5) * ARC.h;
    out.on = !out.behind && out.x > 4 && out.x < ARC.w - 4 && out.y > 4 && out.y < ARC.h - 4;
    return true;
  },
  camBasis() {
    const cam = R3.camera, e = cam.matrixWorld.elements;
    const rx = e[0], ry = e[1], rz = e[2], ux = e[4], uy = e[5], uz = e[6], fx = -e[8], fy = -e[9], fz = -e[10];
    let hfx = fx, hfz = fz; const hl = Math.hypot(hfx, hfz) || 1; hfx /= hl; hfz /= hl;
    return { fx: hfx, fz: hfz, rx: -hfz, rz: hfx, r3x: rx, r3y: ry, r3z: rz, u3x: ux, u3y: uy, u3z: uz, f3x: fx, f3y: fy, f3z: fz };
  },
  fx,
  debug() {
    const r = R3; if (!r) return null;
    return { quality: r.quality, fps: Math.round(r.fps), soft: r.soft, post: !!(POST.ok && TIERS[Math.max(0, r.quality)].post), calls: r.renderer.info.render.calls, tris: r.renderer.info.render.triangles, crowd: r.S.crowd.count, look: r.look };
  },
  dev: { quality: (q) => { if (R3) R3.lockQ = true; setQuality(q); }, setQuality: (q) => { if (R3) R3.lockQ = true; setQuality(q); }, stage: () => R3 }
};

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
else { const s = document.createElement('script'); s.src = '/games/nitro-goal/game.js'; document.body.appendChild(s); }
