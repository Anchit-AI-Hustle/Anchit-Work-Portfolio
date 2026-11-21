/*
 * Last Ridge, the sound: every shot, step, blast and radio blip synthesised
 * with Web Audio and placed left or right of the listener by where it
 * happened. Gated on the shell's mute. Safe to import where there is no
 * window (the headless rules tests): every call then does nothing.
 */
let ARC = null, AU = null, LIS = { x: 0, z: 0, yaw: 0, attract: true };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export function setArc(a) { ARC = a; }
export function listen(W) { if (!W) return; const P = W.P; LIS.x = P.mount ? P.mount.x : P.x; LIS.z = P.mount ? P.mount.z : P.z; LIS.yaw = P.yaw; LIS.attract = W.attract || W.phase === 'killcam' && false; LIS.replay = W.phase === 'killcam'; }
function muted() { return !ARC || ARC.sfx.muted || LIS.attract; }
export function ctx() {
  if (AU) return AU;
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
  let c; try { c = new AC(); } catch (e) { return null; }
  const master = c.createGain(); master.gain.value = 0.5; master.connect(c.destination);
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.2; comp.connect(master);
  const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  // a short room tail for close shots and blasts
  const ir = c.createBuffer(2, c.sampleRate * 1.2, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < x.length; i++) x[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / x.length, 3.2); }
  const verb = c.createConvolver(); verb.buffer = ir; const vg = c.createGain(); vg.gain.value = 0.22; verb.connect(vg); vg.connect(comp);
  AU = { c, master, comp, noise: buf, verb, amb: null, n: 0, nt: 0 };
  return AU;
}
export function unlock() { const A = ctx(); if (A && A.c.state === 'suspended') A.c.resume().catch(() => {}); }
export function pause(on) { if (!AU) return; try { AU.master.gain.setTargetAtTime(on ? 0 : 0.5, AU.c.currentTime, 0.05); } catch (e) { /* closed */ } }
// at most a handful of new voices per tenth of a second, so a firefight never clips
function budget(vol) { const now = performance.now(); if (now - AU.nt > 100) { AU.nt = now; AU.n = 0; } if (vol < 0.03) return false; return ++AU.n <= 7; }
function place(x, z) {
  const dx = x - LIS.x, dz = z - LIS.z, d = Math.hypot(dx, dz);
  const rx = Math.cos(LIS.yaw), rz = -Math.sin(LIS.yaw);
  const pan = d > 0.5 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.85 : 0;
  return { d, pan, vol: 1 / (1 + d * 0.06), far: clamp(d / 60, 0, 1) };
}
function out(pan, wet) {
  const A = AU;
  let node = A.comp;
  if (pan && A.c.createStereoPanner) { const p = A.c.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); p.connect(A.comp); if (wet) p.connect(A.verb); return p; }
  if (wet) { const g = A.c.createGain(); g.connect(A.comp); g.connect(A.verb); return g; }
  return node;
}
function noise(dur, f, type, vol, pan, q, slide, delay, wet) {
  if (!(dur > 0 && isFinite(dur) && isFinite(f) && isFinite(vol) && isFinite(pan || 0) && isFinite(slide || 0))) return;
  if (muted() || !ctx() || !budget(vol)) return;
  try { noiseX(dur, f, type, vol, pan, q, slide, delay, wet); } catch (e) { /* a closed context */ }
}
function noiseX(dur, f, type, vol, pan, q, slide, delay, wet) {
  const A = AU, t = A.c.currentTime + (delay || 0);
  const s = A.c.createBufferSource(); s.buffer = A.noise; s.playbackRate.value = 0.7 + Math.random() * 0.6;
  const fl = A.c.createBiquadFilter(); fl.type = type || 'lowpass'; fl.frequency.setValueAtTime(f, t); if (q) fl.Q.value = q; if (slide) fl.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t + dur);
  const g = A.c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl); fl.connect(g); g.connect(out(pan, wet));
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
}
function tone(freq, dur, type, vol, pan, slide, delay) {
  if (!(dur > 0 && isFinite(dur) && isFinite(freq) && isFinite(vol) && isFinite(pan || 0) && isFinite(slide || 0))) return;
  if (muted() || !ctx() || !budget(vol)) return;
  try { toneX(freq, dur, type, vol, pan, slide, delay); } catch (e) { /* a closed context */ }
}
function toneX(freq, dur, type, vol, pan, slide, delay) {
  const A = AU, t = A.c.currentTime + (delay || 0);
  const o = A.c.createOscillator(); o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + dur);
  const g = A.c.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + dur + 0.05);
}
// Gunfire: a crack, a body and a tail, shaped by the weapon and muffled by distance.
const VOICE = {
  rifle: [2600, 0.11, 140, 0.34], smg: [3200, 0.08, 170, 0.28], lmg: [2200, 0.13, 110, 0.38], dmr: [2000, 0.18, 95, 0.44], sniper: [1600, 0.32, 70, 0.55],
  shotgun: [1400, 0.26, 80, 0.55], pistol: [3000, 0.09, 190, 0.3], rocket: [600, 0.5, 60, 0.5],
};
export function shot(W, c, d, loud) {
  if (!d) return;
  const v = VOICE[d.sound] || VOICE.rifle;
  const mine = c.isPlayer && !LIS.replay;
  const p = mine ? { pan: 0, vol: 1, far: 0, d: 0 } : place(c.x, c.z);
  if (d.quiet) { noise(0.06, 1800, 'bandpass', 0.22 * p.vol * (mine ? 1 : 0.6), p.pan, 1.4, 700); tone(160, 0.05, 'triangle', 0.06 * p.vol, p.pan, 90); return; }
  const k = p.vol * (mine ? 1 : 0.75) * (loud || 1);
  const crack = v[0] * (1 - p.far * 0.7);
  noise(v[1] * (1 + p.far), crack, 'lowpass', 0.5 * k, p.pan, 0, crack * 0.25, 0, p.d < 25);
  tone(v[2], v[1] * 1.4, 'sine', 0.3 * k * (1 - p.far * 0.5), p.pan, v[2] * 0.45);
  if (p.far > 0.2) noise(0.5 + p.far, 500, 'lowpass', 0.08 * k, p.pan, 0, 120, 0.04 + p.far * 0.15);
  if (mine) noise(0.03, 5000, 'highpass', 0.05, 0.3, 0, 0, 0.06);
}
export function crack() { noise(0.05, 4200, 'bandpass', 0.16, (Math.random() - 0.5) * 1.4, 3); }
export function boom(size, dist) {
  const p = { vol: 1 / (1 + (dist || 0) * 0.04), far: clamp((dist || 0) / 80, 0, 1) };
  const s = size || 1;
  noise(1.2 + s * 0.6, 900 * (1 - p.far * 0.6), 'lowpass', 0.7 * p.vol * Math.min(1.3, s), 0, 0, 60, 0, true);
  tone(55, 0.9, 'sine', 0.5 * p.vol * Math.min(1.2, s), 0, 28);
  noise(0.25, 3000, 'bandpass', 0.15 * p.vol, 0, 0.7, 400, 0.02);
}
export function flashBang(dist) { boom(0.6, dist); if (dist < 16) tone(3800, 2.6 * (1 - dist / 16), 'sine', 0.05, 0, 3600, 0.05); }
export function step(W, c, loud) {
  if (c.isPlayer && !LIS.replay) { noise(0.07, W && W.look && W.look.snow ? 900 : 650, 'lowpass', 0.07 * loud + 0.02, (Math.random() - 0.5) * 0.3, 0, 180); return; }
  const p = place(c.x, c.z); if (p.d > 22) return;
  const ears = W && W.P && W.P.perks && W.P.perks.indexOf('ears') >= 0 ? 1.8 : 1;
  noise(0.08, 700, 'lowpass', 0.09 * loud * p.vol * ears, p.pan, 0, 200);
}
export function land(v) { noise(0.16, 380, 'lowpass', 0.22 * (v || 0.5), 0, 0, 90); }
export function jump() { noise(0.1, 600, 'lowpass', 0.08, 0, 0, 200); }
export function vault() { noise(0.2, 700, 'lowpass', 0.12, 0, 0, 160); noise(0.06, 2400, 'bandpass', 0.06, 0.2, 2, 0, 0.12); }
export function slide() { noise(0.7, 1200, 'bandpass', 0.14, 0, 0.6, 300); }
export function reload(d) { const k = d && d.slot ? 0.8 : 1; noise(0.05, 3000, 'bandpass', 0.16, 0.25, 4, 0, 0); noise(0.05, 2200, 'bandpass', 0.15, 0.25, 4, 0, 0.32 * k); tone(420, 0.04, 'square', 0.03, 0.25, null, 0.6 * k); }
export function shell() { noise(0.05, 2600, 'bandpass', 0.14, 0.25, 4); }
export function reloadDone() { noise(0.04, 3800, 'bandpass', 0.18, 0.2, 5); tone(900, 0.04, 'triangle', 0.05, 0.2, null, 0.02); }
export function swap() { noise(0.07, 2000, 'bandpass', 0.12, 0.2, 3); }
export function dry() { tone(1200, 0.03, 'square', 0.05, 0.2); }
export function hurt() { noise(0.18, 420, 'lowpass', 0.32, 0, 0, 110); tone(80, 0.18, 'sine', 0.25, 0, 45); }
export function hitMark(head) { tone(head ? 1900 : 1500, 0.04, 'square', 0.05, 0); if (head) tone(2600, 0.05, 'triangle', 0.05, 0, null, 0.03); }
export function koMark() { tone(880, 0.06, 'triangle', 0.09, 0); tone(1320, 0.1, 'triangle', 0.08, 0, null, 0.05); }
export function hitTarget() { tone(620, 0.08, 'triangle', 0.09, 0); noise(0.1, 1500, 'bandpass', 0.1, 0, 2); }
export function downed() { tone(320, 0.5, 'triangle', 0.12, 0, 140); noise(0.6, 600, 'lowpass', 0.18, 0, 0, 120); }
export function takedown() { noise(0.14, 500, 'lowpass', 0.25, 0, 0, 100); }
export function whoosh() { noise(0.16, 1800, 'bandpass', 0.08, 0, 0.8, 700); }
export function pin() { tone(3200, 0.04, 'square', 0.04, 0.2); noise(0.04, 4000, 'highpass', 0.05, 0.2); }
export function throwNade() { noise(0.16, 1200, 'bandpass', 0.1, 0, 0.7, 500); }
export function nadeBounce(n) { const p = place(n.x, n.z); if (p.d > 25) return; tone(900 + Math.random() * 400, 0.05, 'triangle', 0.06 * p.vol, p.pan); }
export function smokePop() { noise(1.6, 1400, 'bandpass', 0.12, 0, 0.5, 600); }
export function alarm() { tone(880, 0.22, 'square', 0.05, 0); tone(660, 0.22, 'square', 0.05, 0, null, 0.26); tone(880, 0.22, 'square', 0.05, 0, null, 0.52); }
export function streak() { [392, 523, 659, 784].forEach((f, i) => tone(f, 0.14, 'triangle', 0.07, 0, null, i * 0.06)); }
export function whistle(dist) { tone(1600, 1.05, 'sine', 0.05 / (1 + dist * 0.02), 0, 500); }
export function pickup() { tone(660, 0.08, 'triangle', 0.1, 0); tone(990, 0.14, 'triangle', 0.09, 0, null, 0.07); }
export function capture(mine) { (mine ? [523, 659, 784] : [523, 440, 349]).forEach((f, i) => tone(f, 0.18, 'triangle', 0.08, 0, null, i * 0.1)); }
export function beep(dist) { tone(1800, 0.06, 'square', 0.06 / (1 + dist * 0.03), 0); }
export function plant() { tone(1200, 0.08, 'square', 0.06, 0); tone(1600, 0.12, 'square', 0.06, 0, null, 0.1); }
export function defuse() { tone(900, 0.2, 'triangle', 0.08, 0, 500); }
export function roundEnd(mine) { (mine ? [523, 784] : [392, 311]).forEach((f, i) => tone(f, 0.3, 'triangle', 0.09, 0, null, i * 0.18)); }
export function medal() { tone(1046, 0.08, 'triangle', 0.06, 0); tone(1568, 0.12, 'triangle', 0.05, 0, null, 0.06); }
export function objective() { tone(523, 0.14, 'triangle', 0.1, 0); tone(784, 0.22, 'triangle', 0.1, 0, null, 0.12); }
export function go() { tone(587, 0.1, 'square', 0.05, 0); tone(880, 0.18, 'square', 0.05, 0, null, 0.1); }
export function radio() { noise(0.05, 2400, 'bandpass', 0.05, -0.3, 3); tone(1400, 0.03, 'square', 0.02, -0.3); }
export function finalSting(won) { (won ? [392, 494, 587, 784] : [392, 349, 311, 262]).forEach((f, i) => tone(f, 0.4, 'triangle', 0.1, 0, null, i * 0.16)); }
// Wind, rain or the hum of a works, held under everything.
export function ambience(look) {
  const A = ctx(); if (!A) return;
  ambienceOff();
  const s = A.c.createBufferSource(); s.buffer = A.noise; s.loop = true;
  const f = A.c.createBiquadFilter(); f.type = look.rain ? 'highpass' : 'lowpass'; f.frequency.value = look.rain ? 2400 : look.snow ? 600 : 380;
  const g = A.c.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(A.master); s.start();
  const vol = look.rain ? 0.05 : look.snow ? 0.045 : 0.03;
  g.gain.setTargetAtTime(muted() ? 0 : vol, A.c.currentTime, 0.6);
  A.amb = { s, g, vol };
}
export function ambienceOff() { if (AU && AU.amb) { const a = AU.amb; try { a.g.gain.setTargetAtTime(0, AU.c.currentTime, 0.2); a.s.stop(AU.c.currentTime + 0.8); } catch (e) { /* done */ } AU.amb = null; } }
export function mute(m) { if (AU && AU.amb) AU.amb.g.gain.setTargetAtTime(m ? 0 : AU.amb.vol, AU.c.currentTime, 0.1); }
