const TAU = Math.PI * 2;
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const shades = [
  [255, 173, 244], [171, 124, 255], [117, 151, 255],
  [94, 220, 250], [186, 251, 250], [255, 199, 154]
];

export function mountOptics(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let w, h, phone;
  const sprite = document.createElement('canvas');
  sprite.width = sprite.height = 48;
  const spriteCtx = sprite.getContext('2d');
  const soft = spriteCtx.createRadialGradient(24, 24, 0, 24, 24, 24);
  soft.addColorStop(0, '#fff'); soft.addColorStop(.17, '#e1c8ffb8');
  soft.addColorStop(.42, '#b887f63b'); soft.addColorStop(1, '#9f7cff00');
  spriteCtx.fillStyle = soft; spriteCtx.fillRect(0, 0, 48, 48);

  const seeds = Array.from({ length: 56 }, (_, i) => ({
    a: (i * 2.399963) % TAU,
    r: .42 + ((i * 17) % 37) / 70,
    speed: .11 + (i % 7) * .037,
    depth: .47 + (i % 8) * .093
  }));

  function size() {
    ({ width: w, height: h } = canvas.getBoundingClientRect());
    if (!w || !h) return;
    phone = w <= 680;
    // A soft glow with no hard edges: it upscales invisibly, and its cost is
    // per pixel, drawn every frame. 1x on a phone, 1.25x on a large screen.
    const ratio = Math.min(devicePixelRatio || 1, phone ? 1 : 1.25);
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  }

  function line(x, y, endX, endY, rgb, opacity, width = 1) {
    const grad = ctx.createLinearGradient(x, y, endX, endY);
    const c = rgb.join(',');
    grad.addColorStop(0, `rgba(${c},0)`);
    grad.addColorStop(.22, `rgba(${c},${opacity})`);
    grad.addColorStop(.66, `rgba(${c},${opacity * .64})`);
    grad.addColorStop(1, `rgba(${c},0)`);
    ctx.strokeStyle = grad; ctx.lineWidth = width;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(endX, endY); ctx.stroke();
  }

  function flare(x, y, power, warm = false) {
    ctx.globalAlpha = clamp(power, 0, 1);
    const diameter = 26 + power * 52;
    ctx.drawImage(sprite, x - diameter / 2, y - diameter / 2, diameter, diameter);
    ctx.globalAlpha = 1;
    const color = warm ? [255, 211, 150] : [226, 210, 255];
    line(x - 26 * power, y, x + 26 * power, y, color, power * .94, 1.25);
    line(x, y - 23 * power, x, y + 23 * power, color, power * .88);
  }

  function draw({ act, time, scroll, x, y, focused, structure }) {
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'screen';
    const span = Math.min(w, h);
    const cx = w * (phone ? .52 : .67) + x * (phone ? 18 : 40);
    const cy = h * (phone ? .32 : .50) + y * (phone ? 15 : 28);
    const scale = phone ? .66 : 1;
    const warm = act === 1;
    const tint = warm ? [255, 169, 96] : [184, 152, 255];

    for (let i = 0; i < seeds.length; i++) {
      const v = seeds[i];
      const a = v.a + time * v.speed + scroll * 2.1;
      const rad = span * (.26 + v.r * .25);
      const px = cx + Math.cos(a) * rad * (phone ? .78 : 1.37);
      const py = cy + Math.sin(a) * rad * .50 + Math.cos(a * 2) * 29 * v.depth;
      const power = .18 + .42 * (.5 + .5 * Math.sin(time * 2.4 + i));
      const r = 1.1 + (i % 3) * .45;
      ctx.globalAlpha = power;
      ctx.fillStyle = act === 2 ? `rgb(${shades[i % shades.length]})` : `rgb(${tint})`;
      ctx.beginPath(); ctx.arc(px, py, r, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
      if (i % 15 === 0) flare(px, py, power * .9, warm);
    }

    if (act === 0) {
      const angle = time * .49 + scroll * 1.6;
      for (let i = 0; i < 2; i++) {
        const ox = Math.cos(angle + i * 2.6) * span * .30 * scale;
        const oy = Math.sin(angle + i * 2.6) * span * .18 * scale;
        flare(cx + ox, cy + oy, .68 + .30 * Math.cos(angle * 2 + i));
      }
      const scan = Math.sin(time * 1.16 + scroll * 4);
      line(cx - span * .36, cy + scan * span * .24, cx + span * .63, cy - scan * span * .19,
        tint, focused ? .62 : .34, focused ? 1.6 : 1);
    } else if (act === 1) {
      const wave = time * .57 + scroll * 3.5;
      for (let i = 0; i < 6; i++) {
        const n = (wave + i * .17) % 1;
        const rad = (n * .42 + .05) * span;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rad * (phone ? .88 : 1.35), rad * .44, -.27 + x * .16, 0, TAU);
        ctx.strokeStyle = `rgba(255,176,105,${Math.sin(n * Math.PI) * (structure ? .38 : .27)})`;
        ctx.lineWidth = 1 + (1 - n) * 2; ctx.stroke();
      }
      flare(cx + Math.cos(wave * 3) * span * .17, cy, .91, true);
    } else {
      const turn = Math.sin(time * .81 + scroll * 8) * .24 + y * .34;
      for (let i = 0; i < 18; i++) {
        const angle = -.32 + i * .048 + turn;
        const d = (i % 3 === 0 ? 1 : .82) * span;
        const px = cx + Math.cos(angle) * d, py = cy + Math.sin(angle) * d;
        line(cx - 38, cy + (i - 9) * 2, px, py, shades[Math.floor(i / 3)],
          (focused ? .57 : .34) * (.72 + .25 * Math.cos(time + i)), i % 3 === 0 ? 2 : .7);
      }
      flare(cx, cy, focused ? 1 : .78);
    }
    ctx.globalCompositeOperation = 'source-over';
  }
  return { size, draw };
}
