// A faceted 3D mesh and perspective projections of actual 4D/5D hypercubes.
const TAU = Math.PI * 2;
const lerp = (a, b, n) => a + (b - a) * n;
const mod = (n, base) => ((n % base) + base) % base;

function turn(p, a, b, radians) {
  const c = Math.cos(radians), s = Math.sin(radians);
  const x = p[a], y = p[b];
  p[a] = c * x - s * y;
  p[b] = s * x + c * y;
}

function gemstone() {
  const ring = (n, r, y, offset = 0) => Array.from({ length: n }, (_, i) => {
    const a = TAU * (i + offset) / n;
    return [r * Math.cos(a), y, r * Math.sin(a)];
  });
  const top = ring(8, .52, .42);
  const star = ring(8, .74, .28, .5);
  const girdle = ring(16, 1, .065);
  const lower = ring(16, .993, -.006);
  const keel = ring(8, .54, -.37);
  const culet = [0, -.89, 0];
  const faces = [top];
  for (let i = 0; i < 8; i++) {
    const j = (i + 1) % 8, a = i * 2, b = a + 1, c = j * 2;
    faces.push([top[i], top[j], star[i]], [top[i], star[i], girdle[a]],
      [top[j], girdle[c], star[i]], [girdle[a], star[i], girdle[b]],
      [girdle[b], star[i], girdle[c]], [lower[a], keel[i], lower[b]],
      [lower[b], keel[i], keel[j]], [lower[b], keel[j], lower[c]],
      [keel[i], culet, keel[j]]);
  }
  for (let i = 0; i < 16; i++) {
    const j = (i + 1) % 16;
    faces.push([girdle[i], girdle[j], lower[j], lower[i]]);
  }
  return faces;
}

function hypercube(dim) {
  const vertices = Array.from({ length: 1 << dim }, (_, i) =>
    Array.from({ length: dim }, (_, axis) => i & (1 << axis) ? 1 : -1));
  const edges = vertices.flatMap((p, i) => p.flatMap((sign, axis) =>
    sign < 0 ? [[i, i | (1 << axis), axis]] : []));
  return { vertices, edges };
}

export const facets = gemstone();
const cubes = { 4: hypercube(4), 5: hypercube(5) };

export function mountModel(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let w = 0, h = 0;
  function size() {
    const rect = canvas.getBoundingClientRect();
    w = rect.width;
    h = rect.height;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  function camera(p, yaw, pitch) {
    turn(p, 0, 2, yaw);
    turn(p, 1, 2, pitch);
    turn(p, 0, 1, -.17);
    return p;
  }
  function project(p, scale) {
    const depth = 4.7 / (4.7 - p[2]);
    return [w * .5 + scale * depth * p[0], h * .48 - scale * depth * p[1]];
  }
  function glow(x, y, r, color) {
    if (r <= 0) return;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, 'transparent');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  function drawGem(yaw, pitch, scale, time) {
    const transformed = facets.map((face, i) => {
      const p = face.map(v => camera(v.slice(), yaw, pitch));
      return { p, i, z: p.reduce((s, v) => s + v[2], 0) / p.length };
    }).sort((a, b) => a.z - b.z);
    for (const { p, i } of transformed) {
      const xy = p.map(v => project(v, scale));
      const a = p[1].map((x, k) => x - p[0][k]);
      const b = p[2].map((x, k) => x - p[0][k]);
      const n = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
      const len = Math.hypot(...n) || 1;
      const key = Math.abs((n[0] * (-.48 + Math.sin(time * 1.25) * .42) + n[1] * .68 + n[2] * .55) / len);
      const contrast = mod(i * 29, 17) / 17;
      const shine = Math.min(97, 11 + 72 * key ** 2 + 24 * contrast);
      const color = i % 9 === 0 ? 215 : i % 7 === 0 ? 23 : 37;
      const x = xy[0][0], y = xy[0][1], end = xy[2];
      const grad = ctx.createLinearGradient(x, y, end[0] + .01, end[1] + .01);
      grad.addColorStop(0, `hsl(${color} 49% ${Math.min(99, shine + 14)}%)`);
      grad.addColorStop(.62, `hsl(${color} 24% ${shine}%)`);
      grad.addColorStop(1, `hsl(${color} 38% ${Math.max(8, shine - 20)}%)`);
      ctx.beginPath();
      for (let j = 0; j < xy.length; j++) {
        if (j === 0) ctx.moveTo(...xy[j]);
        else ctx.lineTo(...xy[j]);
      }
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = .58;
      ctx.strokeStyle = key > .82 ? '#fff3d3b0' : '#ffdfb83c';
      ctx.stroke();
      if (key > .965 && i % 3 === 0) glow(x, y, scale * .13, '#fff3d892');
    }
  }
  function drawCube(dim, phase, dispersion, yaw, pitch, scale, time) {
    const { vertices, edges } = cubes[dim];
    const points = vertices.map(v => {
      const p = v.slice();
      turn(p, 0, 3, .36 + phase);
      turn(p, 1, 3, -.28 - phase);
      if (dim === 5) {
        turn(p, 2, 4, .32 + phase * .62);
        turn(p, 3, 4, .5 + phase * .39 + dispersion * .42);
      }
      for (let d = dim - 1; d >= 3; d--) {
        const factor = 3.65 / (4.1 - p[d]);
        for (let axis = 0; axis < d; axis++) p[axis] *= factor;
      }
      return camera(p, yaw, pitch);
    });
    const xy = points.map(p => project(p, scale));
    const palette = [37, 329, 183, 215, 270];
    const sorted = edges.slice().sort(([a, b], [c, d]) =>
      points[a][2] + points[b][2] - points[c][2] - points[d][2]);
    for (const [a, b, axis] of sorted) {
      const front = Math.max(.16, Math.min(.91, .47 + (points[a][2] + points[b][2]) * .12));
      const hue = dim === 5 ? lerp(39, palette[axis], dispersion) : axis === 3 ? 23 : 43;
      const [x, y] = xy[a], [ex, ey] = xy[b];
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(ex, ey);
      ctx.lineWidth = dim === 4 && axis === 3 ? 1.8 : 1.35;
      ctx.shadowColor = `hsl(${hue},95%,64%)`;
      ctx.shadowBlur = dim === 5 ? 9 * dispersion : axis === 3 ? 6 : 0;
      ctx.strokeStyle = `hsla(${hue}, ${dim === 5 ? 86 : 63}%, 74%, ${front})`;
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (dim === 5 && dispersion > .12) {
        ctx.beginPath();
        ctx.moveTo(x + 3 * dispersion, y - 2 * dispersion);
        ctx.lineTo(ex + 3 * dispersion, ey - 2 * dispersion);
        ctx.lineWidth = .8;
        ctx.strokeStyle = `hsla(${hue + 48}, 95%, 66%, ${front * dispersion * .5})`;
        ctx.stroke();
      }
    }
    for (let i = 0; i < sorted.length; i += dim === 5 ? 5 : 4) {
      const [a, b, axis] = sorted[i];
      const progress = mod(time * (.27 + axis * .038) + (a + b) * .136, 1);
      const x = lerp(xy[a][0], xy[b][0], progress), y = lerp(xy[a][1], xy[b][1], progress);
      const hue = dim === 5 ? lerp(39, palette[axis], dispersion) : 40;
      glow(x, y, dim === 5 ? 16 : 12, `hsla(${hue},100%,73%,.82)`);
      ctx.fillStyle = '#fff4e3';
      ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
    }
    for (let i = 0; i < xy.length; i++) {
      const [x, y] = xy[i];
      const hue = dim === 5 ? lerp(39, palette[i % 5], dispersion) : 42;
      glow(x, y, 9, `hsla(${hue},90%,72%,.37)`);
      ctx.fillStyle = `hsl(${hue},85%,84%)`;
      ctx.fillRect(x - 1, y - 1, 2, 2);
    }
  }
  function draw({ mode, time, angle, phase, dispersion, yaw, pitch }) {
    if (w < 2 || h < 2) return;
    ctx.clearRect(0, 0, w, h);
    const span = Math.min(w, h);
    ctx.save();
    ctx.translate(w * .5, h * .76);
    ctx.scale(1, .14);
    glow(0, 0, span * .36, mode === 5 ? '#8b56ad57' : '#d597595c');
    ctx.restore();
    if (mode === 3) drawGem(.3 + yaw + angle, .82 + pitch, span * .325, time);
    else drawCube(mode, mode === 4 ? phase : time * .32, dispersion,
      .48 + yaw, .35 + pitch, span * (mode === 4 ? .192 : .178), time);
  }
  return { size, draw };
}
