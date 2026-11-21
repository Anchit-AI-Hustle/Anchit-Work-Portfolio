/*
 * Last Ridge, the shared core: menus, the Armory, the service record, saved
 * progress, input from every device (mouse with pointer lock, two thumbs,
 * a controller with aim assist), the fixed step loop, the final killcam and
 * the results. game3d.js (WebGL) and game.js (the 2D fallback) each pass a
 * view to boot(view); both play exactly the same war.
 */
import * as D from './data.js';
import * as S from './sim.js';
import * as SND from './audio.js';
import { drawHUD, drawBoard, txt } from './hud.js';

const { clamp, lerp, damp, angDiff, TAU } = S;
let ARC = null, VIEW = null, W = null, SAVE = null, NOVIEW = false;
const SKEY = 'arcade.last-ridge.save';

/* ------------------------------------------------------------ saved progress */
function freshSave() { return { xp: 0, missions: {}, unlocked: 1, stats: { matches: 0, wins: 0, kos: 0, downs: 0, shots: 0, hits: 0, missions: 0, heads: 0 }, course: null, medals: {} }; }
function loadSave() { const s = ARC.store.get(SKEY, null); SAVE = Object.assign(freshSave(), s && typeof s === 'object' ? s : {}); SAVE.stats = Object.assign(freshSave().stats, SAVE.stats || {}); }
function saveGame() { ARC.store.set(SKEY, SAVE); }
const rank = () => D.rankOf(SAVE.xp).level;

/* ------------------------------------------------------------ the loadout the player takes in */
function customClass() {
  const ch = ARC.choices, r = rank();
  const ok = (id, list) => list[id] && (list[id].unlock || 1) <= r;
  const prim = D.WEAPONS[ch.a_primary] && D.WEAPONS[ch.a_primary].unlock <= r && D.PRIMARY.indexOf(ch.a_primary) >= 0 ? ch.a_primary : 'vr7';
  const sec = D.WEAPONS[ch.a_secondary] && D.WEAPONS[ch.a_secondary].unlock <= r && D.SECONDARY.indexOf(ch.a_secondary) >= 0 ? ch.a_secondary : 'p11';
  const perks = [0, 1, 2].map((t) => { const id = ch['a_perk' + (t + 1)]; const p = D.PERKS[t].find((x) => x.id === id); return p && p.unlock <= r ? p.id : D.PERKS[t][0].id; });
  return { id: 'custom', name: 'Custom', primary: prim, optic: ok(ch.a_optic, D.OPTICS) ? ch.a_optic : 'iron', mod: ok(ch.a_mod, D.MODS) ? ch.a_mod : 'none', secondary: sec, tactical: ch.a_tactical === 'flash' ? 'flash' : 'smoke', perks };
}
function chosenClass() {
  const c = ARC.choices.cls || 'rifleman';
  if (c === 'custom') return customClass();
  const k = D.CLASSES[c] || D.CLASSES.rifleman;
  if ((k.unlock || 1) > rank()) return Object.assign({}, D.CLASSES.rifleman, { perks: D.CLASSES.rifleman.perks.slice() });
  return Object.assign({}, k, { perks: k.perks.slice() });
}

/* ------------------------------------------------------------ input */
const MOUSE = { left: false, right: false, leftHit: false, dx: 0, dy: 0, lx: null, ly: null, wheel: 0, lockLostAt: -1e9 };
const TOUCH = { move: null, look: null, mx: 0, mz: 0, ldx: 0, ldy: 0, tap: false, hold: false, aim: false, crouch: false, lean: 0 };
const PADS = { sprint: false, l3: false, r3: false, lb: false, rb: false, y: 0, yUsed: false };
const HOLD = { c: 0, cProne: false };
const locked = () => !!ARC && document.pointerLockElement === ARC.canvas;
function requestLock() { if (!ARC || ARC.touchMode || locked() || (VIEW && VIEW.flat)) return; try { const p = ARC.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not here */ } }
function releaseLock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* fine */ } }
function clearInput() { MOUSE.left = MOUSE.right = MOUSE.leftHit = false; MOUSE.dx = MOUSE.dy = MOUSE.wheel = 0; TOUCH.move = TOUCH.look = null; TOUCH.mx = TOUCH.mz = TOUCH.ldx = TOUCH.ldy = 0; TOUCH.tap = TOUCH.hold = false; TOUCH.aim = false; TOUCH.crouch = false; TOUCH.lean = 0; HOLD.c = 0; }
function wireInput(a) {
  const cv = a.canvas;
  cv.addEventListener('mousedown', (e) => {
    if (a.touchMode) return;
    if (e.button === 0) { MOUSE.left = true; MOUSE.leftHit = true; }
    if (e.button === 2) MOUSE.right = true;
    MOUSE.lx = e.clientX; MOUSE.ly = e.clientY;
    if (a.state === 'play') requestLock();
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) MOUSE.left = false; if (e.button === 2) MOUSE.right = false; });
  document.addEventListener('mousemove', (e) => {
    if (locked()) { MOUSE.dx += e.movementX || 0; MOUSE.dy += e.movementY || 0; return; }
    if (MOUSE.left && a.state === 'play' && !a.touchMode && MOUSE.lx != null && !(VIEW && VIEW.flat)) { MOUSE.dx += e.clientX - MOUSE.lx; MOUSE.dy += e.clientY - MOUSE.ly; }
    MOUSE.lx = e.clientX; MOUSE.ly = e.clientY;
  });
  cv.addEventListener('wheel', (e) => { if (a.state !== 'play') return; e.preventDefault(); MOUSE.wheel += Math.sign(e.deltaY); }, { passive: false });
  document.addEventListener('pointerlockchange', () => { if (!locked() && a.state === 'play' && W && W.phase === 'live' && !W.over) { MOUSE.lockLostAt = performance.now(); a.pause(); } });
  window.addEventListener('keydown', (e) => { if (e.code === 'Escape' && performance.now() - MOUSE.lockLostAt < 450) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);
  const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top, r.width]; };
  cv.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || a.state !== 'play') return;
    const [x, y, rw] = local(e), gest = a.touchStyle !== 'pads';
    if (gest && x < rw * 0.45 && !TOUCH.move) { TOUCH.move = { id: e.pointerId, sx: x, sy: y }; TOUCH.mx = TOUCH.mz = 0; }
    else if (!TOUCH.look) TOUCH.look = { id: e.pointerId, x, y, sx: x, sy: y, t0: performance.now(), moved: 0 };
  });
  cv.addEventListener('pointermove', (e) => {
    if (e.pointerType === 'mouse') return;
    const [x, y] = local(e);
    if (TOUCH.move && e.pointerId === TOUCH.move.id) {
      let dx = (x - TOUCH.move.sx) / 52, dy = (y - TOUCH.move.sy) / 52; const l = Math.hypot(dx, dy);
      if (l > 1) { dx /= l; dy /= l; TOUCH.move.sx = x - dx * 52; TOUCH.move.sy = y - dy * 52; }
      TOUCH.mx = dx; TOUCH.mz = dy;
    } else if (TOUCH.look && e.pointerId === TOUCH.look.id) {
      const dx = x - TOUCH.look.x, dy = y - TOUCH.look.y; TOUCH.ldx += dx; TOUCH.ldy += dy; TOUCH.look.moved += Math.abs(dx) + Math.abs(dy); TOUCH.look.x = x; TOUCH.look.y = y;
    }
  });
  const end = (e) => {
    if (TOUCH.move && e.pointerId === TOUCH.move.id) { TOUCH.move = null; TOUCH.mx = TOUCH.mz = 0; }
    if (TOUCH.look && e.pointerId === TOUCH.look.id) { if (TOUCH.look.moved < 14 && performance.now() - TOUCH.look.t0 < 280 && e.type === 'pointerup') TOUCH.tap = true; TOUCH.look = null; TOUCH.hold = false; }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
}
function firstPad() { if (!navigator.getGamepads) return null; try { const all = navigator.getGamepads(); for (let i = 0; i < all.length; i++) if (all[i] && all[i].connected) return all[i]; } catch (e) { /* none */ } return null; }
// The rival under (or near) the sight, for aim assist and touch auto fire.
const _e = { x: 0, y: 0, z: 0 }, _f = { x: 0, y: 0, z: 0 };
function sightTarget(P) {
  S.eyePos(P, _e); S.aimDir(P.yaw, P.pitch, _f);
  let best = null, ba = 1e9;
  for (const c of W.chars) {
    if (!c.alive || c === P || (!W.ffa && c.team === P.team)) continue;
    const ty = S.chestY(c), dx = c.x - _e.x, dy = ty - _e.y, dz = c.z - _e.z, d = Math.hypot(dx, dy, dz);
    if (d > 70) continue;
    const ang = Math.acos(clamp((dx * _f.x + dy * _f.y + dz * _f.z) / d, -1, 1));
    const cone = Math.atan2(0.5, d) + 0.02;
    if (ang > cone * 2.8) continue;
    if (!S.clearLine(W, _e.x, _e.y, _e.z, c.x, ty, c.z, true)) continue;
    if (ang < ba) { ba = ang; best = { c, ang, cone, d, yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) }; }
  }
  return best;
}
const I0 = () => ({ mx: 0, mz: 0, lx: 0, ly: 0, fire: false, fireHit: false, aim: false, reloadHit: false, jumpHit: false, crouchHit: false, proneHit: false, sprint: false, lean: 0, weaponTo: -1, nextWeapon: false, fragDown: false, tacHit: false, use: false, useHit: false, meleeHit: false, skip: false, abs: false, board: false });
let LASTI = I0();
function gatherInput(a, dt) {
  const inp = a.input, P = W.P, I = I0();
  const s = S.curW(P), d = s.def;
  if (inp.down('KeyA')) I.mx -= 1; if (inp.down('KeyD')) I.mx += 1;
  if (inp.down('KeyW', 'ArrowUp')) I.mz -= 1; if (inp.down('KeyS', 'ArrowDown')) I.mz += 1;
  const zoom = Math.pow(lerp(1, d.zoom, P.adsK), 0.9), sens = a.prefs.sens === 'high' ? 1.35 : a.prefs.sens === 'low' ? 0.72 : 1;
  const turnK = 2.2 / zoom;
  if (inp.down('ArrowLeft')) I.lx -= turnK * dt; if (inp.down('ArrowRight')) I.lx += turnK * dt;
  if (inp.stick.active) { I.mx += inp.stick.x; I.mz += inp.stick.y; }
  if (inp.pad.active) { I.mx += inp.pad.x; I.mz += inp.pad.y; }
  if (TOUCH.move) { I.mx += TOUCH.mx; I.mz += TOUCH.mz; }
  const ml = Math.hypot(I.mx, I.mz); if (ml > 1) { I.mx /= ml; I.mz /= ml; }
  I.lx += MOUSE.dx * 0.0023 / zoom; I.ly += MOUSE.dy * 0.0023 / zoom; MOUSE.dx = MOUSE.dy = 0;
  const touchLooked = TOUCH.ldx || TOUCH.ldy;
  I.lx += TOUCH.ldx * 0.0064 * sens / zoom; I.ly += TOUCH.ldy * 0.0064 * sens / zoom; TOUCH.ldx = TOUCH.ldy = 0;
  if (TOUCH.look && TOUCH.look.moved < 14 && performance.now() - TOUCH.look.t0 > 200) TOUCH.hold = true;
  // a controller: right stick looks, bumpers throw, clicks sprint and strike, a held Y calls a streak
  const gp = a.gamepad ? firstPad() : null;
  let padLook = false;
  if (gp) {
    const dz = (v) => (Math.abs(v) < 0.14 ? 0 : Math.sign(v) * Math.pow((Math.abs(v) - 0.14) / 0.86, 1.7));
    const rx = dz(gp.axes[2] || 0), ry = dz(gp.axes[3] || 0);
    if (rx || ry) { padLook = true; I.lx += rx * 3.2 * dt / zoom; I.ly += ry * 2.4 * dt / zoom; }
    const b = (i) => !!(gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5));
    const l3 = b(10), r3 = b(11), lb = b(4), rb = b(5), y = b(3);
    if (l3 && !PADS.l3) PADS.sprint = !PADS.sprint;
    if (r3 && !PADS.r3) I.meleeHit = true;
    I.fragDown = lb;
    if (rb && !PADS.rb) I.tacHit = true;
    if (y) { PADS.y += dt; if (PADS.y > 0.5 && !PADS.yUsed) { PADS.yUsed = true; const st = D.STREAKS.slice().reverse().find((x) => S.streakReady(W, P, x)); if (st) I['streak_' + st.id] = true; } }
    else { if (PADS.y > 0 && PADS.y <= 0.5) I.nextWeapon = true; PADS.y = 0; PADS.yUsed = false; }
    PADS.l3 = l3; PADS.r3 = r3; PADS.lb = lb; PADS.rb = rb;
    if (ml < 0.3) PADS.sprint = false;
  }
  const useAvail = S.useAvailable(W, P);
  I.fire = MOUSE.left || inp.down('KeyJ') || (a.touchMode && TOUCH.hold);
  I.fireHit = MOUSE.leftHit || inp.hit('KeyJ') || TOUCH.tap;
  if (TOUCH.tap) I.fire = true;
  if (a.touchMode) { if (inp.hit('KeyK')) TOUCH.aim = !TOUCH.aim; I.aim = TOUCH.aim; } else I.aim = MOUSE.right || inp.down('KeyK');
  // R reloads; held beside something to use, it uses it (the controller's X)
  I.use = inp.down('KeyF') || (useAvail && inp.down('KeyR'));
  I.useHit = inp.hit('KeyF') || (useAvail && inp.hit('KeyR'));
  I.reloadHit = inp.hit('KeyR') && !useAvail;
  I.jumpHit = inp.hit('Space');
  // C: tap to crouch, slide out of a sprint, hold to go prone; Z prone; Ctrl crouch
  if (inp.hit('KeyC') || inp.hit('ControlLeft') || inp.hit('ControlRight')) { I.crouchHit = true; HOLD.c = 0; HOLD.cProne = false; }
  if (inp.down('KeyC')) { HOLD.c += dt; if (HOLD.c > 0.45 && !HOLD.cProne && P.stance !== 'prone') { HOLD.cProne = true; I.proneHit = true; } } else HOLD.c = 0;
  if (inp.hit('KeyZ')) I.proneHit = true;
  I.sprint = inp.down('ShiftLeft', 'ShiftRight') || PADS.sprint || (TOUCH.move && TOUCH.mz < -0.92);
  I.lean = (inp.down('KeyE') ? 1 : 0) - (inp.down('KeyQ') ? 1 : 0);
  if (a.touchMode) { if (inp.hit('KeyL')) TOUCH.lean = TOUCH.lean === 0 ? 1 : TOUCH.lean === 1 ? -1 : 0; if (TOUCH.lean) I.lean = TOUCH.lean; if (Math.hypot(I.mx, I.mz) > 0.6) TOUCH.lean = 0; }
  if (inp.hit('Digit1')) I.weaponTo = 0; if (inp.hit('Digit2')) I.weaponTo = 1;
  if (inp.hit('KeyY') || inp.hit('Tab') && false) I.nextWeapon = true;
  if (MOUSE.wheel) { I.nextWeapon = true; MOUSE.wheel = 0; }
  if (inp.down('KeyG') || inp.down('KeyN')) I.fragDown = true;
  if (inp.hit('KeyX')) I.tacHit = true;
  if (inp.hit('KeyV')) I.meleeHit = true;
  D.STREAKS.forEach((st) => { if (inp.hit(st.key)) I['streak_' + st.id] = true; });
  if (inp.hit('KeyT')) { const st = D.STREAKS.slice().reverse().find((x) => S.streakReady(W, P, x)); if (st) I['streak_' + st.id] = true; }
  I.board = inp.down('Tab');
  I.skip = I.fireHit || I.jumpHit || inp.hit('Enter') || TOUCH.tap || (inp.tap && inp.tap());
  MOUSE.leftHit = false; TOUCH.tap = false;
  // the 2D view aims at the pointer instead of turning the head
  if (VIEW.flat && VIEW.aimYaw) { const y = VIEW.aimYaw(a, W, I); if (y != null) { I.lx = -angDiff(P.yaw, y); I.ly = 0; } I.abs = !!VIEW.absMove; }
  // aim assist for thumbs and sticks, never for a mouse
  const st = P.alive && W.phase === 'live' && !VIEW.flat ? sightTarget(P) : null;
  VIEW.aimOn = !!(st && st.ang < st.cone);
  if ((a.touchMode || a.inputMode === 'gamepad') && st) {
    const k = W.D.idx === 0 ? 1.4 : W.D.idx === 2 ? 0.75 : 1;
    if (st.ang < st.cone * 1.8) { I.lx *= 0.55; I.ly *= 0.55; }
    if (ml > 0.2 || padLook || touchLooked) { const rate = 0.75 * k * dt; I.lx += clamp(-angDiff(P.yaw, st.yaw), -rate, rate); I.ly += clamp(-(st.pitch - P.pitch), -rate * 0.6, rate * 0.6); }
    if (I.aim && !LASTI.aim && st.ang < 0.2) { I.lx += -angDiff(P.yaw, st.yaw) * 0.6 * k; I.ly += -(st.pitch - P.pitch) * 0.6 * k; }
    if (a.touchMode && a.choices.autofire !== 'off' && VIEW.aimOn && st.d < d.far * 1.5 + 8 && (d.mode === 'auto' || P.w[P.cur].fireT <= 0)) { I.fire = true; I.fireHit = true; }
  }
  if (VIEW.flat && VIEW.autoAim && P.alive) VIEW.autoAim(a, W, I);
  LASTI = I;
  return I;
}

/* ------------------------------------------------------------ touch pads, they follow what you can do */
let padKey = '';
function setPads(a) {
  if (!W || !a.touchMode) return;
  const P = W.P, auto = a.choices.autofire !== 'off', gest = a.touchStyle !== 'pads';
  const useAvail = S.useAvailable(W, P), streak = W.kind === 'mp' && D.STREAKS.some((s) => S.streakReady(W, P, s));
  const mount = !!P.mount;
  const key = [auto, gest, useAvail, streak, mount, P.cur].join(',');
  if (key === padKey) return;
  padKey = key;
  const pads = [];
  pads.push({ label: 'Fire', key: 'KeyJ', big: true, hot: true, keep: !auto || !gest });
  pads.push({ label: 'Aim', key: 'KeyK', keep: true });
  if (!mount) {
    pads.push({ label: 'Reload', key: 'KeyR', keep: true });
    pads.push({ label: 'Frag', key: 'KeyG', keep: true });
    pads.push({ label: 'Crouch', key: 'KeyC', keep: true });
    pads.push({ label: 'Jump', key: 'Space', keep: true });
    pads.push({ label: P.lo.tactical === 'flash' ? 'Flash' : 'Smoke', key: 'KeyX' });
    pads.push({ label: 'Swap', key: 'KeyY' });
    pads.push({ label: 'Prone', key: 'KeyZ' });
    pads.push({ label: 'Lean', key: 'KeyL' });
    pads.push({ label: 'Melee', key: 'KeyV' });
  }
  if (useAvail) pads.push({ label: 'Use', key: 'KeyF', keep: true, hot: true });
  if (streak) pads.push({ label: 'Streak', key: 'KeyT', keep: true, hot: true });
  a.setPads(pads);
}

/* ------------------------------------------------------------ worlds */
// the menu plays out on the very world the round will use (same map, light and weather), so every
// shader the round needs is compiled behind the menu and nothing compiles after Play
function attractCfg(a) {
  const ch = a.choices, mode = ch.mode === 'mp' || ch.mode === 'range' ? ch.mode : 'campaign';
  const base = { diff: 'normal', attract: true, seed: 3, loadout: D.CLASSES.rifleman };
  if (mode === 'campaign') return Object.assign(base, { mode, mission: Math.min(+ch.mission || 0, SAVE.unlocked - 1) });
  if (mode === 'range') return Object.assign(base, { mode, range: ch.range || 'lesson' });
  return Object.assign(base, { mode: 'mp', mp: D.MP_MODES[ch.mp] ? ch.mp : 'tdm', map: D.MAPS[ch.map] ? ch.map : 'ridge' });
}
const attractKey = (c) => c.mode + ':' + (c.mission != null ? c.mission : '') + ':' + (c.range || '') + ':' + (c.map || '') + ':' + (c.mp || '');
function attractWorld(a) {
  const cfg = attractCfg(a), key = attractKey(cfg);
  if (!W || !W.attract || W.akey !== key || W.over) { W = S.newWorld(cfg, SAVE); W.akey = key; if (VIEW.setWorld) VIEW.setWorld(W); }
}
function startWorld(a, ch) {
  const mode = ch.mode === 'mp' || ch.mode === 'range' ? ch.mode : 'campaign';
  let mission = +ch.mission || 0;
  if (mode === 'campaign' && mission >= SAVE.unlocked) { mission = SAVE.unlocked - 1; a.toast('That mission is locked', 'Playing ' + D.MISSIONS[mission].name, 2000); }
  const cfg = { mode, mission, mp: D.MP_MODES[ch.mp] ? ch.mp : 'tdm', map: D.MAPS[ch.map] ? ch.map : 'ridge', diff: D.DIFF[ch.diff] ? ch.diff : 'normal', range: ch.range || 'lesson', loadout: chosenClass(), seed: 1 + ((Math.random() * 1000) | 0) };
  if (mode === 'campaign' && D.MISSIONS[mission].map === 'road') cfg.seed = 3; // the road is built from the seed: keep the one built behind the menu
  W = S.newWorld(cfg, { rank: rank() });
  if (BOT) { S.makeBot(W, W.P); }
  if (VIEW.setWorld) VIEW.setWorld(W);
}
let BOT = false;

/* ------------------------------------------------------------ results */
function showResults() {
  const a = ARC, s = W.stats, P = W.P;
  W.phase = 'results'; releaseLock();
  const won = W.winner === P.team && W.winner >= 0, draw = W.winner < 0;
  const before = D.rankOf(SAVE.xp);
  const pts = S.playerScore(W);
  let xp = s.xp.reduce((n, x) => n + x[1], 0);
  let eyebrow, title, again = 'Play again', extra = '';
  if (W.kind === 'campaign') {
    const Ms = W.mission, mi = W.cfg.mission;
    eyebrow = 'Mission ' + (mi + 1) + ', ' + Ms.kind;
    title = won ? Ms.name + ' <em>complete</em>' : Ms.name + ' <em>failed</em>';
    if (won) {
      const par = [300, 200, 420, 260, 360, 320][mi] || 300;
      const stars = 1 + (W.missionT < par ? 1 : 0) + ((Ms.stealth ? W.ghost : W.downsUsed <= 1) ? 1 : 0);
      const prev = SAVE.missions[mi] || { stars: 0, best: 0 };
      SAVE.missions[mi] = { stars: Math.max(prev.stars, stars), best: Math.max(prev.best || 0, pts), time: Math.min(prev.time || 1e9, Math.round(W.missionT)) };
      SAVE.unlocked = Math.max(SAVE.unlocked, Math.min(D.MISSIONS.length, mi + 2));
      SAVE.stats.missions++;
      xp += 800 + stars * 200;
      extra = '<p class="lr-stars">' + '&#9733;'.repeat(stars) + '<span>' + '&#9734;'.repeat(3 - stars) + '</span></p>' +
        '<p class="lr-sub">Stars: complete, under ' + Math.floor(par / 60) + ' min ' + (par % 60) + ' s, ' + (Ms.stealth ? 'never seen' : 'down no more than once') + '.</p>';
      if (mi + 1 < D.MISSIONS.length) { a.choices.mission = String(mi + 1); a.store.set('arcade.last-ridge.mission', String(mi + 1)); again = 'Next mission'; }
      else extra += '<p class="lr-unlock">The campaign is complete. Halberd came home.</p>';
    } else extra = '<p class="lr-sub">' + (W.why === 'truck' ? 'The convoy was stopped on the road.' : W.why === 'lost' ? 'The Grey Banner took the fountain square.' : W.why === 'timer' ? 'You were still in the yard when the tanks went up.' : 'Regroup and try again.') + '</p>';
  } else if (W.kind === 'range') {
    eyebrow = 'The Pit'; title = W.rangeMode === 'course' ? 'Kill house <em>cleared</em>' : 'Training <em>done</em>';
    if (s.course) { const pb = SAVE.course == null || s.course < SAVE.course; if (pb) SAVE.course = +s.course.toFixed(2); extra = '<p class="lr-big">' + s.course.toFixed(2) + ' s' + (pb ? ' &#9733; personal best' : '') + '</p><p class="lr-sub">Best: ' + SAVE.course.toFixed(2) + ' s</p>'; }
    else extra = '<p class="lr-sub">Every lesson done. Try the kill house for time, then take a mission or a match.</p>';
  } else {
    eyebrow = W.mp.name + ', ' + W.M.name;
    if (W.ffa) { const order = W.chars.slice().sort((p, q) => W.score[q.team] - W.score[p.team]); const place = order.indexOf(P) + 1; title = place === 1 ? 'First <em>place</em>' : 'Finished <em>' + place + (place === 2 ? 'nd' : place === 3 ? 'rd' : 'th') + '</em>'; extra = '<p class="lr-big">Podium: ' + order.slice(0, 3).map((c, i) => (i + 1) + '. ' + a.esc(c.name) + ' ' + W.score[c.team]).join(' &nbsp; ') + '</p>'; }
    else { title = draw ? 'A <em>draw</em>' : won ? 'Victory, <em>' + D.FACTIONS[0].short.toLowerCase() + '</em>' : 'Defeat, <em>regroup</em>'; extra = '<p class="lr-big">' + D.FACTIONS[0].short + ' ' + W.score[P.team] + ' : ' + W.score[1 - P.team] + ' ' + D.FACTIONS[1].short + '</p>'; }
    SAVE.stats.matches++; if (won) SAVE.stats.wins++;
  }
  SAVE.stats.kos += s.kos; SAVE.stats.downs += s.downs; SAVE.stats.shots += s.shots; SAVE.stats.hits += s.hits; SAVE.stats.heads += s.heads;
  for (const k in s.medals) SAVE.medals[k] = (SAVE.medals[k] || 0) + s.medals[k];
  xp = Math.round(xp * (W.D.idx === 2 ? 1.25 : 1));
  SAVE.xp += xp;
  const after = D.rankOf(SAVE.xp);
  saveGame();
  const acc = s.shots ? Math.round(s.hits / s.shots * 100) : 0;
  const rows = [['Knockdowns', s.kos], ['Times down', s.downs], ['Assists', s.assists], ['Accuracy', acc + '%'], ['Precision', s.heads], ['Best streak', s.bestStreak]];
  if (W.flags) rows.splice(2, 0, ['Flags taken', s.caps]);
  if (W.dem) rows.splice(2, 0, ['Plants / disarms', s.plants + ' / ' + s.defuses]);
  if (W.kind === 'campaign') rows.splice(0, 0, ['Objectives', s.objs + ' / ' + W.mission.objs.length], ['Time', Math.floor(W.missionT / 60) + ':' + String(Math.floor(W.missionT % 60)).padStart(2, '0')]);
  const xpRows = summarise(s.xp);
  let unlocks = '';
  if (after.level > before.level) {
    const got = [];
    for (let L = before.level + 1; L <= after.level; L++) {
      for (const id in D.WEAPONS) if (D.WEAPONS[id].unlock === L) got.push(D.WEAPONS[id].name);
      for (const id in D.OPTICS) if (D.OPTICS[id].unlock === L) got.push(D.OPTICS[id].name);
      for (const id in D.MODS) if (D.MODS[id].unlock === L) got.push(D.MODS[id].name);
      for (const t of D.PERKS) for (const p of t) if (p.unlock === L) got.push(p.name);
      for (const id in D.CLASSES) if (D.CLASSES[id].unlock === L) got.push(D.CLASSES[id].name + ' class');
    }
    unlocks = '<p class="lr-unlock">Promoted to ' + a.esc(after.title) + (got.length ? '. Unlocked: ' + a.esc(got.join(', ')) : '') + '.</p>';
  }
  const nxt = D.RANKS[Math.min(D.RANKS.length - 1, after.level)];
  const prog = after.level >= 30 ? 1 : (SAVE.xp - after.xp) / Math.max(1, nxt.xp - after.xp);
  const top = W.chars.slice().sort((p, q) => q.score - p.score).slice(0, 4);
  const medals = Object.keys(s.medals).map((k) => D.MEDALS[k] + (s.medals[k] > 1 ? ' x' + s.medals[k] : ''));
  const html = '<div class="lr-res">' + extra + unlocks +
    '<div class="lr-stats">' + rows.map((r) => '<span>' + r[0] + '<b>' + r[1] + '</b></span>').join('') + '</div>' +
    (medals.length ? '<p class="lr-sub">Medals: ' + a.esc(medals.join(', ')) + '</p>' : '') +
    '<p class="lr-sub">XP +' + xp + (xpRows ? ' (' + a.esc(xpRows) + ')' : '') + '</p>' +
    '<div class="lr-rank"><div><b>' + a.esc(after.title) + '</b> &nbsp;rank ' + after.level + '</div><i style="width:' + Math.round(prog * 100) + '%"></i></div>' +
    (W.kind === 'mp' ? '<div class="lr-top">' + top.map((c, i) => '<span>' + (i + 1) + '. ' + a.esc(c.name) + '<b>' + c.score + '</b></span>').join('') + '</div>' : '') + '</div>';
  a.over({ eyebrow, title, html, score: pts, scoreLabel: 'Points', again });
}
function summarise(list) {
  const m = new Map(); for (const [k, v] of list) m.set(k, (m.get(k) || 0) + v);
  return [...m.entries()].sort((p, q) => q[1] - p[1]).slice(0, 5).map((e) => e[0] + ' ' + e[1]).join(', ');
}

/* ------------------------------------------------------------ menus */
const CSS = '.lr-brief{margin:10px 0 4px;padding:12px 14px;border-radius:12px;background:rgba(255,255,255,.05);border:1px solid rgba(244,239,230,.1);font-size:14px;line-height:1.45;color:var(--ink-soft,#d8d0c4)}.lr-brief b{color:var(--ink,#fbf5ec)}.lr-brief ol{margin:6px 0 0 18px;padding:0}' +
  '.lr-big{font-family:var(--font-mono,monospace);font-size:15px;letter-spacing:.05em;margin:4px 0 8px}.lr-sub{font-size:13px;opacity:.82;margin:0 0 6px}.lr-unlock{font-size:13px;color:#ffd36a;margin:0 0 8px}' +
  '.lr-stars{font-size:24px;color:#ffd36a;letter-spacing:.1em;margin:2px 0 4px}.lr-stars span{color:rgba(244,239,230,.3)}' +
  '.lr-stats,.lr-top{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}.lr-stats span,.lr-top span{flex:1 1 28%;min-width:92px;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05);font-size:11px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-mute,#b8b0a4)}.lr-stats b,.lr-top b{display:block;font-size:17px;color:var(--ink,#fbf5ec);text-transform:none}' +
  '.lr-rank{margin:8px 0;padding:8px 10px;border-radius:10px;background:rgba(255,255,255,.05);font-size:13px;position:relative;overflow:hidden}.lr-rank i{display:block;height:4px;margin-top:6px;border-radius:2px;background:#ffd36a}' +
  'details.lr-more{margin:6px 0 10px}details.lr-more summary{cursor:pointer;font-size:13px;color:var(--accent,#ff9a4a)}.lr-rules{font-size:13px;line-height:1.5;opacity:.88;margin:6px 0}.lr-rules b{color:var(--accent,#ff9a4a)}' +
  '.lr-card{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:12.5px;margin:6px 0 12px}.lr-card kbd{font-family:var(--font-mono,monospace);font-size:11px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,.08);white-space:nowrap}.lr-h{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#ffd36a;margin:12px 0 4px}';
let cssDone = false;
function injectCss() { if (cssDone) return; cssDone = true; const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); }
function briefHtml() {
  const ch = ARC.choices, mode = ch.mode || 'campaign', a = ARC;
  if (mode === 'campaign') {
    const mi = +ch.mission || 0, Ms = D.MISSIONS[mi], lock = mi >= SAVE.unlocked, rec = SAVE.missions[mi];
    return '<b>' + (mi + 1) + '. ' + a.esc(Ms.name) + '</b> &middot; ' + a.esc(Ms.kind) + ' &middot; ' + a.esc(Ms.when) + (rec ? ' &middot; ' + '&#9733;'.repeat(rec.stars) : '') + '<br>' +
      (lock ? 'Locked: finish mission ' + mi + ' first.' : a.esc(Ms.brief)) + '<ol>' + Ms.objs.map((o) => '<li>' + a.esc(o.text) + '</li>').join('') + '</ol>';
  }
  if (mode === 'range') {
    const r = ch.range || 'lesson';
    return '<b>The Pit</b> &middot; Halberd training ground<br>' + (r === 'lesson' ? 'Eleven short lessons: look, move, fire, aim down sights, reload, crouch and prone, slide, lean, vault, grenades, then a timed run through the kill house.' : r === 'course' ? 'The kill house for time: twelve boards pop up one after another. Hit each to raise the next. Best: ' + (SAVE.course ? SAVE.course.toFixed(2) + ' s' : 'none yet') + '.' : 'Free practice: lanes, moving boards, the grenade pit and the kill house, with your chosen class.');
  }
  const M = D.MAPS[ch.map] || D.MAPS.ridge, md = D.MP_MODES[ch.mp] || D.MP_MODES.tdm;
  return '<b>' + a.esc(md.name) + '</b> &middot; ' + a.esc(M.name) + ', ' + a.esc(M.when) + '<br>' + a.esc(md.rules) + '<br><span style="opacity:.75">' + a.esc(M.blurb) + '</span>';
}
function refreshBrief() { const el = document.querySelector('.lr-brief'); if (el) el.innerHTML = briefHtml(); }
function menuProps() {
  const r = rank(), R = D.rankOf(SAVE.xp);
  const lock = (n) => (n > r ? ' (rank ' + n + ')' : '');
  const opts = [
    { id: 'mode', label: 'Mode', value: 'campaign', choices: [{ v: 'campaign', label: 'Campaign' }, { v: 'mp', label: 'Multiplayer' }, { v: 'range', label: 'Firing range' }] },
    { id: 'mission', label: 'Mission (campaign)', value: '0', choices: D.MISSIONS.map((m, i) => ({ v: String(i), label: (i + 1) + '. ' + m.name + (i >= SAVE.unlocked ? ' (locked)' : '') })) },
    { id: 'mp', label: 'Match (multiplayer, against bots)', value: 'tdm', choices: Object.values(D.MP_MODES).map((m) => ({ v: m.id, label: m.name })) },
    { id: 'map', label: 'Map (multiplayer)', value: 'ridge', choices: D.MP_MAPS.map((id) => ({ v: id, label: D.MAPS[id].name })) },
    { id: 'range', label: 'Range', value: 'lesson', choices: [{ v: 'lesson', label: 'Lessons' }, { v: 'course', label: 'Kill house' }, { v: 'free', label: 'Free practice' }] },
    { id: 'cls', label: 'Class', value: 'rifleman', choices: Object.values(D.CLASSES).map((c) => ({ v: c.id, label: c.name + lock(c.unlock || 1) })).concat([{ v: 'custom', label: 'Custom (Armory)' }]) },
    { id: 'diff', label: 'Difficulty', value: 'normal', choices: [{ v: 'easy', label: 'Easy' }, { v: 'normal', label: 'Normal' }, { v: 'hard', label: 'Hard' }], note: 'Easy rivals react slower and aim wider. Hard earns a quarter more XP.' },
  ];
  if (ARC.touchMode) opts.push({ id: 'autofire', label: 'Auto fire', value: 'on', choices: [{ v: 'on', label: 'On' }, { v: 'off', label: 'Off' }], note: 'Fires when your sight rests on a rival. Off: tap or hold the right of the screen to fire.' });
  return {
    eyebrow: 'Military shooter, ' + R.title + ', rank ' + R.level, title: 'Last <em>Ridge</em>',
    html: '<p>Task Force Halberd of the Northmarch Union against the Grey Banner, in the mountains, docks, towns and fuel works of an invented frontier. A six mission campaign, multiplayer modes against squads of bots, and a firing range. Hits are sparks and dust; a soldier who takes too many is knocked down and out of the fight.</p><div class="lr-brief"></div>',
    options: opts,
    showKeys: false, // every control is under How to play; the menu stays short enough to show its buttons
    actions: [{ label: 'Play', primary: true, on: ARC.start }, { label: 'Armory', on: armory }, { label: 'How to play', on: howTo }, { label: 'Service record', on: record }, { label: 'All games', href: '/games' }],
  };
}
function armory() {
  const r = rank();
  const lk = (n) => (n > r ? ' (rank ' + n + ')' : '');
  const w = (ids) => ids.map((id) => ({ v: id, label: D.WEAPONS[id].name + lk(D.WEAPONS[id].unlock) }));
  const o = [
    { id: 'a_primary', label: 'Primary', value: 'vr7', choices: w(D.PRIMARY) },
    { id: 'a_optic', label: 'Optic', value: 'iron', choices: Object.values(D.OPTICS).map((x) => ({ v: x.id, label: x.name + lk(x.unlock) })) },
    { id: 'a_mod', label: 'Mod', value: 'none', choices: Object.values(D.MODS).map((x) => ({ v: x.id, label: x.name + lk(x.unlock) })) },
    { id: 'a_secondary', label: 'Secondary', value: 'p11', choices: w(D.SECONDARY) },
    { id: 'a_tactical', label: 'Tactical grenade (two frags always)', value: 'smoke', choices: Object.values(D.TACTICAL).map((x) => ({ v: x.id, label: x.name })) },
  ].concat(D.PERKS.map((t, i) => ({ id: 'a_perk' + (i + 1), label: 'Perk ' + (i + 1), value: t[0].id, choices: t.map((p) => ({ v: p.id, label: p.name + lk(p.unlock) })) })));
  ARC.panel({
    eyebrow: 'Armory, rank ' + r, title: 'Custom <em>class</em>',
    html: '<p class="lr-sub">Build the Custom class here, then pick Custom on the main menu. Anything above your rank falls back to the standard pick until you reach it.</p><div class="lr-brief lr-arm"></div>',
    options: o, actions: [{ label: 'Done', primary: true, on: () => { ARC.choices.cls = 'custom'; ARC.store.set('arcade.last-ridge.cls', 'custom'); ARC.menu(); } }, { label: 'Back', on: () => ARC.menu() }],
  });
  const paint = () => {
    const c = customClass(), p = D.WEAPONS[c.primary], sc = D.WEAPONS[c.secondary];
    const el = document.querySelector('.lr-arm'); if (!el) return;
    el.innerHTML = '<b>' + p.name + '</b>, ' + p.cls + ': ' + p.blurb + '<br>' + D.OPTICS[c.optic].name + ': ' + D.OPTICS[c.optic].note + ' ' + D.MODS[c.mod].name + ': ' + D.MODS[c.mod].note + '<br><b>' + sc.name + '</b>: ' + sc.blurb + '<br>' +
      c.perks.map((id, i) => { const pk = D.PERKS[i].find((x) => x.id === id); return '<b>' + pk.name + '</b>: ' + pk.note; }).join('<br>');
  };
  paint();
  const card = document.querySelector('.arc-card'); if (card) card.querySelectorAll('.arc-seg').forEach((seg) => seg.addEventListener('click', () => setTimeout(paint, 0)));
}
function howTo() {
  const k = (rows) => '<div class="lr-card">' + rows.map((r) => '<kbd>' + r[0] + '</kbd><span>' + r[1] + '</span>').join('') + '</div>';
  ARC.panel({
    eyebrow: 'Field manual', title: 'How to <em>play</em>',
    html: '<p class="lr-rules">Knock rivals down with hits to the body (the head counts for more). Your health comes back if you stay out of fire for a few seconds. Aim down the sights for accuracy; crouch and go prone for steadier fire and less of a target; sprint to move, slide into cover, lean round corners and vault low walls. Cook a frag by holding it, smoke blocks sight lines, a flash leaves anyone facing it helpless. Scorestreaks: earn points in one life for a Recon Drone (400), a Supply Drop (600) and a Mortar Strike (900).</p>' +
      '<div class="lr-h">Keyboard and mouse</div>' + k([['WASD', 'Move'], ['Mouse', 'Look (click the game to lock the pointer)'], ['Left click / J', 'Fire'], ['Right click / K', 'Aim down sights'], ['R', 'Reload'], ['Shift', 'Sprint; while aiming a scope, hold breath'], ['C', 'Crouch, slide from a sprint, hold for prone'], ['Z', 'Prone'], ['Space', 'Jump, vault a low wall'], ['Q / E', 'Lean left / right'], ['G', 'Frag: hold to cook, let go to throw'], ['X', 'Smoke or flash'], ['F', 'Use: hold to plant, disarm, tag; press to resupply'], ['V', 'Melee; from behind, a quiet takedown'], ['1 2 / wheel', 'Switch weapon'], ['4 5 6 / T', 'Scorestreaks'], ['Tab', 'Scoreboard'], ['Esc', 'Pause']]) +
      '<div class="lr-h">Touch</div>' + k([['Left of the screen', 'A move stick under your thumb; push it all the way up to sprint'], ['Right of the screen', 'Drag to look; tap or hold to fire'], ['Auto fire', 'Fires when the sight rests on a rival (menu option)'], ['Aim', 'Aim down sights (toggle)'], ['Reload, Frag, Crouch, Jump', 'Buttons; Use and Streak appear when you can'], ['Stick & buttons', 'Settings: the classic stick plus every action on a button']]) +
      '<div class="lr-h">Controller</div>' + k([['Left stick', 'Move; click to sprint'], ['Right stick', 'Look, with a little aim assist'], ['RT / LT', 'Fire / aim down sights'], ['A', 'Jump, vault'], ['B', 'Crouch, slide; hold for prone'], ['X', 'Reload; hold beside an objective to use it'], ['Y', 'Switch weapon; hold for a scorestreak'], ['LB / RB', 'Frag (hold to cook) / smoke or flash'], ['R3', 'Melee, quiet takedown'], ['Start', 'Pause']]) +
      '<div class="lr-h">Modes</div><p class="lr-rules">' + Object.values(D.MP_MODES).map((m) => '<b>' + m.name + ':</b> ' + m.rules).join(' ') + ' <b>Campaign:</b> six linked missions: an assault, a defence, a stealth infiltration, a convoy on the mounted gun, a sabotage and an extraction. Each scores up to three stars. If you go down, you get back up at the last checkpoint. <b>Ranks:</b> every match and mission earns XP; ranks unlock weapons, optics, mods, perks and classes.</p>',
    actions: [{ label: 'Back', primary: true, on: () => ARC.menu() }],
  });
}
function record() {
  const R = D.rankOf(SAVE.xp), nxt = D.RANKS[Math.min(29, R.level)], st = SAVE.stats;
  const acc = st.shots ? Math.round(st.hits / st.shots * 100) : 0;
  const nextUnlock = [];
  for (let L = R.level + 1; L <= 30 && nextUnlock.length < 3; L++) { for (const id in D.WEAPONS) if (D.WEAPONS[id].unlock === L) nextUnlock.push(D.WEAPONS[id].name + ' at rank ' + L); for (const id in D.OPTICS) if (D.OPTICS[id].unlock === L) nextUnlock.push(D.OPTICS[id].name + ' at rank ' + L); for (const id in D.MODS) if (D.MODS[id].unlock === L) nextUnlock.push(D.MODS[id].name + ' at rank ' + L); }
  ARC.panel({
    eyebrow: 'Service record', title: ARC.esc(R.title),
    html: '<div class="lr-res"><div class="lr-rank"><div>Rank ' + R.level + ' &nbsp;&middot;&nbsp; ' + SAVE.xp + ' XP' + (R.level < 30 ? ' &nbsp;&middot;&nbsp; next at ' + nxt.xp : '') + '</div><i style="width:' + (R.level >= 30 ? 100 : Math.round((SAVE.xp - R.xp) / Math.max(1, nxt.xp - R.xp) * 100)) + '%"></i></div>' +
      '<div class="lr-stats"><span>Matches<b>' + st.matches + '</b></span><span>Wins<b>' + st.wins + '</b></span><span>Knockdowns<b>' + st.kos + '</b></span><span>Times down<b>' + st.downs + '</b></span><span>Accuracy<b>' + acc + '%</b></span><span>Missions<b>' + st.missions + '</b></span></div>' +
      '<p class="lr-sub">Campaign: ' + D.MISSIONS.map((m, i) => (i + 1) + '. ' + m.name + ' ' + (SAVE.missions[i] ? '&#9733;'.repeat(SAVE.missions[i].stars) : i < SAVE.unlocked ? 'open' : 'locked')).join(' &middot; ') + '</p>' +
      '<p class="lr-sub">Kill house best: ' + (SAVE.course ? SAVE.course.toFixed(2) + ' s' : 'none yet') + '</p>' +
      (nextUnlock.length ? '<p class="lr-unlock">Next: ' + nextUnlock.join(', ') + '</p>' : '') + '</div>',
    actions: [{ label: 'Back', primary: true, on: () => ARC.menu() }],
  });
}

/* ------------------------------------------------------------ debug */
function debugState() {
  const a = ARC;
  if (!W) return { state: a.state, phase: 'none', renderer: VIEW ? VIEW.name : 'none' };
  const P = W.P, s = S.curW(P);
  return {
    state: a.state, phase: W.attract ? 'attract' : W.phase, mode: W.kind, mp: W.mp ? W.mp.id : null, map: W.mapId, mission: W.mission ? W.mission.id : null, diff: W.cfg.diff, renderer: VIEW ? VIEW.name : 'none', alive: !W.over,
    playerOut: !P.alive, x: +P.x.toFixed(2), y: +P.y.toFixed(2), z: +P.z.toFixed(2), yaw: +P.yaw.toFixed(3), pitch: +P.pitch.toFixed(3), hp: Math.round(P.hp), armor: Math.round(P.armor),
    weapon: s.def.id, ammo: s.mag, spare: s.spare, reloading: s.reloadT > 0, stance: P.stance, ads: +P.adsK.toFixed(2), sprint: P.sprint, lean: +P.leanK.toFixed(2), frag: P.frag, tac: P.tac, cook: P.cookT >= 0,
    kos: W.stats.kos, downs: W.stats.downs, shots: W.stats.shots, hits: W.stats.hits, streakPts: P.streakPts, score: W.score.slice(0, 2), time: +W.t.toFixed(2), clock: Math.round(S.matchClock(W)),
    objective: W.obj ? { i: W.objI, kind: W.obj.def.t, text: W.obj.def.text, prog: +W.obj.prog.toFixed(2) } : null, alarm: !!W.alarm, convoy: W.convoy ? { z: +W.convoy.trucks[0].z.toFixed(1), hp: Math.round(W.convoy.trucks[0].hp), block: W.convoy.block } : null,
    flags: W.flags ? W.flags.map((f) => f.owner) : null, dem: W.dem ? { round: W.dem.round, wins: W.dem.wins.slice(), charge: !!W.dem.charge, attack: W.dem.attack } : null, lesson: W.lesson ? W.lesson.i : null,
    nades: W.nades.length, smokes: W.smokes.length, chars: W.chars.length, alive: !W.over, killcam: W.phase === 'killcam',
    result: W.over ? { winner: W.winner, why: W.why, points: S.playerScore(W) } : null, locked: locked(), touchStyle: a.touchStyle, inputMode: a.inputMode, aimOn: !!(VIEW && VIEW.aimOn),
    rank: rank(), xp: SAVE.xp, gfx: VIEW && VIEW.debug ? VIEW.debug() : null,
  };
}

/* ------------------------------------------------------------ the loop */
let acc = 0;
const STEP = 1 / 60;
function advance(a, dt, I) {
  // fixed steps; the look and the one frame presses go to the first one only
  W.slow = W.phase === 'final' ? 0.3 : (W.downCam && !W.P.alive && W.downCam.t < 0.8 && W.kind === 'mp') ? 0.5 : 1;
  acc += dt * W.slow;
  let n = 0;
  while (acc >= STEP && n < 13) {
    S.step(W, STEP, n === 0 || !I ? I : Object.assign({}, I, { lx: 0, ly: 0, fireHit: false, reloadHit: false, jumpHit: false, crouchHit: false, proneHit: false, tacHit: false, useHit: false, meleeHit: false, weaponTo: -1, nextWeapon: false, skip: false, streak_drone: false, streak_supply: false, streak_mortar: false }));
    acc -= STEP; n++;
  }
  if (n >= 13) acc = 0;
}
export function boot(view) {
  VIEW = view;
  window.Arcade.create({
    three: !!view.three,
    slug: 'last-ridge', title: 'Last Ridge', genre: 'Military shooter',
    graphics(level) { if (VIEW.graphics) VIEW.graphics(level); },
    hint: 'WASD move, mouse look, click fire, right click aim. R reload, Shift sprint, C crouch or slide, Z prone, Q E lean, G frag, X smoke, F use.',
    touchHint: 'Stick moves, drag the right of the screen to look. Fire, Aim, Reload, Frag, Crouch and Jump on the buttons.',
    keys: [['WASD / Up Down', 'Move'], ['Mouse', 'Look (click to lock the pointer)'], ['Click / J', 'Fire'], ['Right click / K', 'Aim down sights'], ['R', 'Reload'], ['Shift', 'Sprint, hold breath with a scope'], ['C', 'Crouch, slide, hold for prone'], ['Z', 'Prone'], ['Space', 'Jump, vault'], ['Q / E', 'Lean'], ['G (hold)', 'Frag grenade, cook it'], ['X', 'Smoke or flash'], ['F', 'Use: plant, disarm, resupply'], ['V', 'Melee, quiet takedown'], ['1 2 / wheel', 'Switch weapon'], ['4 5 6', 'Scorestreaks'], ['Tab', 'Scoreboard'], ['Left Right', 'Turn without a mouse']],
    gameKeys: ['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'Digit1', 'Digit2', 'Digit4', 'Digit5', 'Digit6', 'Tab'],
    mouse: { steer: false, cursor: 'crosshair' },
    // Controller: RT fire, LT aim, A jump, X reload or use, B crouch (hold prone), Y switch (hold: streak); LB frag, RB tactical, L3 sprint, R3 melee.
    gamepad: { buttons: ['Space', 'KeyR', 'KeyC', 'KeyY'], rt: 'KeyJ', lt: 'KeyK' },
    touch: { stick: true, pads: [{ label: 'Fire', key: 'KeyJ', big: true, hot: true }, { label: 'Aim', key: 'KeyK', keep: true }, { label: 'Reload', key: 'KeyR', keep: true }, { label: 'Frag', key: 'KeyG', keep: true }, { label: 'Crouch', key: 'KeyC', keep: true }, { label: 'Jump', key: 'Space', keep: true }] },
    touchKeys: [['Stick', 'Move'], ['Drag the screen', 'Look'], ['Fire / Aim', 'Shoot, aim down sights (toggle)'], ['Reload, Frag, Crouch, Jump', 'Buttons; Smoke, Swap, Prone, Lean, Melee too'], ['Use / Streak', 'Appear when you can use them']],
    gestures: {
      drag: false, tilt: false,
      hint: 'Left thumb moves, right thumb looks. Tap or hold the right side to fire; auto fire shoots when your sight is on a rival.',
      keys: [['Left of the screen', 'Move stick under your thumb, all the way up to sprint'], ['Right of the screen, drag', 'Look around'], ['Right of the screen, tap or hold', 'Fire'], ['Sight on a rival', 'Auto fire (menu option)'], ['Aim, Reload, Frag, Crouch, Jump', 'Buttons'], ['Use, Streak', 'Appear when you can use them']],
    },
    formatScore: (v) => Math.round(v).toLocaleString('en-IN') + ' pts',
    pauseHtml: () => (W && !W.attract ? '<p class="lr-sub">' + ARC.esc(W.kind === 'campaign' ? W.mission.name + ': ' + (W.obj ? W.obj.def.text : '') : W.kind === 'mp' ? W.mp.name + ' on ' + W.M.name + ', ' + W.score[W.P.team] + ' : ' + (W.ffa ? '' : W.score[1 - W.P.team]) : 'The Pit') + '</p>' : ''),
    resize: (a) => { if (VIEW.resize) VIEW.resize(a); },
    init(a) {
      ARC = a; SND.setArc(a);
      loadSave();
      if (!VIEW.init(a)) { NOVIEW = true; a.panel({ eyebrow: 'Last Ridge', title: 'Graphics <em>unavailable</em>', html: '<p>This browser could not start the game graphics. Try another browser or turn on hardware acceleration.</p>', actions: [{ label: 'All games', href: '/games', primary: true }] }); return; }
      VIEW.touch = TOUCH;
      wireInput(a);
      const origMenu = a.menu;
      a.menu = function (p) { releaseLock(); SND.ambienceOff(); return origMenu(Object.assign(menuProps(), p || {})); };
      a.debug = debugState;
      a.dev = Object.assign({
        world: () => W, save: () => SAVE,
        skipIntro: () => { if (W && W.phase === 'intro') W.phaseT = W.introDur; },
        skip: () => { if (W && W.phase === 'intro') W.phaseT = W.introDur; },
        ff: (sec) => { const n = Math.round((sec || 5) * 60); for (let i = 0; i < n && W && !W.over; i++) S.step(W, STEP, null); W.ev.length = 0; },
        bot: (on) => { BOT = on !== false; if (W && BOT) S.makeBot(W, W.P); if (W && !BOT) W.P.bot = null; },
        win: () => { if (W && !W.over) { const T = W.chars.find((c) => c.alive && (W.ffa ? c !== W.P : c.team !== W.P.team)); if (T) { T.spawnShield = 0; W.score[W.P.team] = Math.max(W.score[W.P.team], (W.target || 1) - 1); S.damage(W, T, W.P, 999, T.x, 1, T.z, true, 'gun', 20); } if (!W.over) S.finishMatch(W, W.P.team, 'score', T); } },
        lose: () => { if (W && !W.over) S.finishMatch(W, W.ffa ? 5 : 1, W.convoy ? 'truck' : 'score', null); },
        down: () => { if (W) { W.P.spawnShield = 0; S.damage(W, W.P, W.chars.find((c) => c.team !== W.P.team) || null, 999, W.P.x, 1, W.P.z, false, 'gun', 10); } },
        streaks: () => { if (W) W.P.streakPts = 2000; },
        // poster and screenshot tooling: face the middle of the field and let the fight run on a few seconds
        vista: (sec) => { if (!W) return; const P = W.P; P.yaw = Math.atan2(P.x, P.z); P.pitch = -0.04; const n = Math.round((sec || 3) * 60); for (let i = 0; i < n && !W.over; i++) S.step(W, STEP, null); P.yaw = Math.atan2(P.x, P.z); W.ev.length = 0; },
        tp: (x, z) => { if (W) { W.P.x = x; W.P.z = z; } },
        obj: () => { if (W && W.obj && !W.over) W.devDone = true; },
        hud: (on) => { HUDOFF = on === false; },
      }, VIEW.dev || {});
      a.dev.quality = (q) => { if (VIEW.quality) VIEW.quality(q, true); };
      a.menu();
    },
    onMenu(a) {
      if (NOVIEW) return;
      injectCss(); releaseLock(); refreshBrief();
      const card = document.querySelector('.arc-card'); if (!card) return;
      card.querySelectorAll('.arc-seg').forEach((seg) => seg.addEventListener('click', () => setTimeout(() => { refreshBrief(); attractWorld(a); }, 0)));
    },
    start(a, ch) {
      if (NOVIEW) return;
      injectCss(); clearInput(); padKey = '';
      startWorld(a, ch);
      setPads(a);
      SND.unlock(); SND.pause(false); SND.ambience(W.look);
      W.fadeIn = 1; acc = 0; lastWall = 0;
      requestLock();
    },
    update(dt, a) {
      if (!W || NOVIEW || W.attract) return;
      // the shell caps a frame at 50 ms; on a slow device keep the match on the clock by catching up to 200 ms
      const now = performance.now();
      if (lastWall && now - lastWall > 55) dt = Math.max(dt, Math.min(0.2, (now - lastWall) / 1000));
      lastWall = now;
      SND.listen(W);
      const I = gatherInput(a, dt);
      if (W.phase === 'killcam') {
        const done = S.stepKillcam(W, dt);
        if (done || (I.skip && W.phaseT > 0.4)) showResults();
        W.phaseT += dt;
        return;
      }
      if (W.phase === 'results') return;
      advance(a, dt, BOT ? null : I);
      if (W.phase === 'final' && W.final.t >= W.final.dur) {
        if (!(W.kind === 'mp' && S.startKillcam(W))) showResults();
      }
      if (a.touchMode && (a.frame % 10) === 0) setPads(a);
      // controller rumble and phone buzz from the world
      for (const e of W.ev) if (e.k === 'haptic' && a.haptic) a.haptic(e.kind, e.s);
      if (W.shakeK > 0.05) a.shake = Math.max(a.shake, W.shakeK * 6);
    },
    idle(dt, a) {
      if (NOVIEW) return;
      if (a.state === 'menu') { attractWorld(a); SND.listen(W); advance(a, dt, null); }
      else if (a.state === 'over' && W && W.attract) { SND.listen(W); advance(a, dt, null); }
      else if (a.state === 'over' && W && !W.attract) {
        if (W.phase === 'results') S.step(W, dt * 0.5, null);
        // a new mission is next: build its world behind the results panel, so nothing compiles after Play
        W.resT = (W.resT || 0) + dt;
        if (W.phase === 'results' && W.resT > 2.5 && W.kind === 'campaign' && attractCfg(a).mission !== W.cfg.mission) attractWorld(a);
      }
    },
    render(ctx, a) {
      if (NOVIEW) return;
      if (!W) { ctx.fillStyle = '#07080a'; ctx.fillRect(0, 0, a.w, a.h); return; }
      let ok = true;
      try { ok = VIEW.render(a, W, ctx) !== false; } catch (e) { ok = false; console.warn(e); }
      for (const e of W.ev) if (e.k === 'toast' && !W.attract && a.state === 'play') a.toast(e.text, e.small, 1800);
      W.ev.length = 0;
      if (!ok) return;
      if (!W.attract && a.state !== 'menu' && !HUDOFF) drawHUD(ctx, a, W, VIEW, LASTI);
    },
    onPause() { lastWall = 0; releaseLock(); clearInput(); SND.pause(true); },
    onResume() { lastWall = 0; clearInput(); requestLock(); SND.pause(false); },
    onOver() { releaseLock(); clearInput(); SND.ambienceOff(); },
    onMute(m) { SND.mute(m); },
  });
}
let HUDOFF = false, lastWall = 0;
export { drawBoard, txt };
