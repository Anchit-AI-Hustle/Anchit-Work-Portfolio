/*
 * Arcade shell, shared by every game under /games.
 *
 * One place for the parts every game needs and none should write twice:
 * the page chrome, a DPR-aware canvas, the frame loop, keyboard plus touch
 * input (a stick and pads that press the same keys), start / pause / game
 * over panels, a tiny Web Audio synth, and a saved best score per game.
 *
 *   const arc = Arcade.create({
 *     slug: 'turf-kings', title: 'Turf Kings', genre: 'Arcade football',
 *     keys: [['WASD / arrows', 'Move'], ['J / Space / click', 'Pass']],
 *     mouse: { steer: 'x', keys: [['Move mouse', 'Aim'], ['Click / hold', 'Action']] },
 *     touch: { stick: true, pads: [{ label: 'Pass', key: 'KeyJ' }] },
 *     start(arc) {}, update(dt, arc) {}, render(ctx, arc) {}
 *   });
 *   arc.menu({ title: 'Turf Kings', html: '<p>...</p>' });
 *
 * window.__arcade is the instance, so a test can read arc.state, arc.frame
 * and whatever the game returns from arc.debug().
 */
(function () {
  'use strict';

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode: play on */ } },
  };
  // Seeded random, so a city or a fixture can be rebuilt identically.
  const rng = (seed) => {
    let a = (seed >>> 0) || 1;
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const ICON = {
    back: '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5v14M15 5v14"/></svg>',
    play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z"/></svg>',
    sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/></svg>',
    mute: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    full: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  };

  /* ---------------------------------------------------------------- audio */
  function Sfx() {
    let ctx = null, master = null;
    let muted = !!store.get('arcade.muted', false);
    const ensure = () => {
      if (ctx) return ctx;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.6;
      master.connect(ctx.destination);
      return ctx;
    };
    const unlock = () => { const c = ensure(); if (c && c.state === 'suspended') c.resume().catch(() => {}); };
    const tone = (freq, dur, o) => {
      o = o || {};
      const c = ensure(); if (!c || muted) return;
      const t = c.currentTime;
      const osc = c.createOscillator(); const g = c.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(freq, t);
      if (o.slide) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.slide), t + dur);
      const v = o.vol == null ? 0.18 : o.vol;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + Math.min(0.02, dur / 4));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g); g.connect(master);
      osc.start(t + (o.delay || 0)); osc.stop(t + dur + (o.delay || 0) + 0.02);
    };
    let noiseBuf = null;
    const noise = (dur, o) => {
      o = o || {};
      const c = ensure(); if (!c || muted) return;
      if (!noiseBuf) {
        noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      const t = c.currentTime;
      const src = c.createBufferSource(); src.buffer = noiseBuf;
      const f = c.createBiquadFilter(); f.type = o.filter || 'lowpass'; f.frequency.value = o.freq || 1200;
      const g = c.createGain(); const v = o.vol == null ? 0.2 : o.vol;
      g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(master);
      src.start(t); src.stop(t + dur + 0.02);
    };
    // A held, adjustable tone for engines and crowds. set(freq, vol) every frame.
    const hum = (type) => {
      const c = ensure(); if (!c) return { set() {}, stop() {} };
      const osc = c.createOscillator(); const g = c.createGain(); const f = c.createBiquadFilter();
      osc.type = type || 'sawtooth'; f.type = 'lowpass'; f.frequency.value = 900; g.gain.value = 0;
      osc.connect(f); f.connect(g); g.connect(master); osc.start();
      let dead = false;
      return {
        set(freq, vol) {
          if (dead) return;
          const t = c.currentTime;
          osc.frequency.setTargetAtTime(Math.max(20, freq), t, 0.05);
          g.gain.setTargetAtTime(muted ? 0 : clamp(vol, 0, 0.3), t, 0.08);
        },
        stop() { if (dead) return; dead = true; try { g.gain.setTargetAtTime(0, c.currentTime, 0.05); osc.stop(c.currentTime + 0.3); } catch (e) { /* already stopped */ } },
      };
    };
    return {
      unlock, tone, noise, hum,
      get muted() { return muted; },
      setMuted(m) { muted = !!m; store.set('arcade.muted', muted); if (master) master.gain.value = muted ? 0 : 0.6; },
    };
  }

  /* ---------------------------------------------------------------- input */
  // Keyboard (WASD + arrows + Space), mouse (position + click) and the on-screen
  // stick all write into the same axis / action so a game does not have to care
  // which device the player brought.
  function Input(canvas) {
    const down = new Set(); const hit = new Set();
    const stick = { x: 0, y: 0, active: false };
    const pointer = { x: 0, y: 0, nx: 0.5, ny: 0.5, down: false, pressed: false, released: false, id: null, type: 'mouse', seen: false };
    // Tap-to-play: one finger on the canvas is a tap, a swipe or a drag. A drag
    // can steer (dragSteer 'x' or 'xy') like a stick that appears under the
    // thumb; a tilt of the phone can steer too (tiltSteer). Read with
    // input.tap() / input.swipe() (one frame each) and input.gesture (live).
    const gesture = { active: false, sx: 0, sy: 0, x: 0, y: 0, dx: 0, dy: 0, t0: 0, type: '' };
    const tilt = { x: 0, y: 0, active: false };
    let tapped = null, swiped = null;
    const DRAG_R = 56;
    const AXIS = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'] };
    const any = (list) => list.some((k) => down.has(k));
    const api = {
      down: (...codes) => codes.some((c) => down.has(c)),
      hit: (...codes) => codes.some((c) => hit.has(c)),
      press(code) { if (!down.has(code)) hit.add(code); down.add(code); },
      release(code) { down.delete(code); },
      // Primary action: Space, J, Enter, or a click / tap on the canvas.
      action() { return api.down('Space', 'KeyJ') || pointer.down; },
      actionHit() { return api.hit('Space', 'KeyJ', 'Enter', 'NumpadEnter') || pointer.pressed; },
      axis() {
        let x = (any(AXIS.right) ? 1 : 0) - (any(AXIS.left) ? 1 : 0);
        let y = (any(AXIS.down) ? 1 : 0) - (any(AXIS.up) ? 1 : 0);
        if (stick.active) { x += stick.x; y += stick.y; }
        if (api.dragSteer && gesture.active && gesture.type !== 'mouse') {
          x += clamp(gesture.dx / DRAG_R, -1, 1);
          if (api.dragSteer === 'xy') y += clamp(gesture.dy / DRAG_R, -1, 1);
        }
        if (api.tiltSteer && tilt.active) { x += tilt.x; if (api.tiltSteer === 'xy') y += tilt.y; }
        const keyed = x !== 0 || y !== 0 || stick.active || gesture.active || (api.tiltSteer && tilt.active);
        const ms = api.mouseSteer;
        if (ms && pointer.seen && !keyed) {
          const ax = pointer.nx * 2 - 1, ay = pointer.ny * 2 - 1;
          if (ms === 'x' || ms === 'xy') x = Math.abs(ax) < 0.04 ? 0 : clamp(ax, -1, 1);
          if (ms === 'y' || ms === 'xy') y = Math.abs(ay) < 0.04 ? 0 : clamp(ay, -1, 1);
        }
        const m = Math.hypot(x, y);
        if (m > 1) { x /= m; y /= m; }
        return { x, y };
      },
      stick, pointer, gesture, tilt, mouseSteer: false, dragSteer: false, tiltSteer: false,
      tap() { return tapped; },
      swipe() { return swiped; },
      clear() {
        down.clear(); hit.clear();
        stick.x = stick.y = 0; stick.active = false;
        pointer.down = false; pointer.pressed = false; pointer.released = false;
        // Drop mouseSteer ghosts so pause/resume does not keep yanking the axis.
        pointer.seen = false; pointer.nx = 0.5; pointer.ny = 0.5;
        gesture.active = false; gesture.dx = gesture.dy = 0; tapped = swiped = null;
      },
      endFrame() { hit.clear(); pointer.pressed = false; pointer.released = false; tapped = swiped = null; },
    };
    const local = (e) => {
      const r = canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      return { x, y, nx: r.width ? x / r.width : 0.5, ny: r.height ? y / r.height : 0.5 };
    };
    const apply = (e, extra) => {
      const p = local(e);
      pointer.x = p.x; pointer.y = p.y; pointer.nx = p.nx; pointer.ny = p.ny;
      pointer.type = e.pointerType || 'mouse'; pointer.seen = true;
      if (extra) extra();
    };
    const now = () => (window.performance ? performance.now() : Date.now());
    canvas.addEventListener('pointerdown', (e) => {
      apply(e, () => { pointer.down = true; pointer.pressed = true; pointer.id = e.pointerId; });
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
      if (!gesture.active) {
        gesture.active = true; gesture.type = pointer.type; gesture.t0 = now();
        gesture.sx = gesture.x = pointer.x; gesture.sy = gesture.y = pointer.y; gesture.dx = gesture.dy = 0; gesture.id = e.pointerId;
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      apply(e);
      if (gesture.active && e.pointerId === gesture.id) {
        gesture.x = pointer.x; gesture.y = pointer.y; gesture.dx = gesture.x - gesture.sx; gesture.dy = gesture.y - gesture.sy;
      }
    });
    const endGesture = (e) => {
      if (!gesture.active || (e && e.pointerId != null && gesture.id != null && e.pointerId !== gesture.id)) return;
      const ms = Math.max(1, now() - gesture.t0), dist = Math.hypot(gesture.dx, gesture.dy);
      const r = canvas.getBoundingClientRect();
      const at = { x: gesture.x, y: gesture.y, nx: r.width ? gesture.x / r.width : 0.5, ny: r.height ? gesture.y / r.height : 0.5, ms };
      if (e && e.type === 'pointercancel') { /* no gesture */ }
      else if (dist < 14 && ms < 350) tapped = at;
      else if (dist >= 36 && ms < 500) {
        const ax = Math.abs(gesture.dx), ay = Math.abs(gesture.dy);
        swiped = Object.assign(at, {
          dir: ax > ay ? (gesture.dx > 0 ? 'right' : 'left') : (gesture.dy > 0 ? 'down' : 'up'),
          dx: gesture.dx, dy: gesture.dy, angle: Math.atan2(gesture.dy, gesture.dx),
          power: clamp(dist / ms / 2.2, 0.2, 1),
          x0: gesture.sx, y0: gesture.sy, nx0: r.width ? gesture.sx / r.width : 0.5, ny0: r.height ? gesture.sy / r.height : 0.5,
        });
      }
      gesture.active = false; gesture.dx = gesture.dy = 0; gesture.id = null;
    };
    canvas.addEventListener('pointerup', endGesture);
    canvas.addEventListener('pointercancel', endGesture);
    // Phone tilt, landscape aware: x = left/right lean, y = forward/back lean.
    window.addEventListener('deviceorientation', (e) => {
      if (e.gamma == null || e.beta == null) return;
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let lr = e.gamma, fb = e.beta - 35;
      if (ang === 90) { lr = e.beta; fb = -e.gamma - 35; } else if (ang === -90 || ang === 270) { lr = -e.beta; fb = e.gamma - 35; }
      tilt.x = clamp(lr / 28, -1, 1); tilt.y = clamp(fb / 28, -1, 1);
      if (Math.abs(tilt.x) < 0.06) tilt.x = 0;
      tilt.active = true;
    });
    const up = () => { if (pointer.down) pointer.released = true; pointer.down = false; pointer.id = null; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    return api;
  }

  /* ---------------------------------------------------------------- shell */
  function create(opts) {
    opts = opts || {};
    const slug = opts.slug || 'game';
    const reducedMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

    // Chrome
    document.body.classList.add('arcade');
    const app = document.createElement('div');
    app.className = 'arc-app';
    app.innerHTML =
      '<header class="arc-bar">' +
        '<a class="arc-back" href="/games" aria-label="All games">' + ICON.back + '<span>Games</span></a>' +
        '<div class="arc-title"><b>' + esc(opts.title || 'Game') + '</b>' + (opts.genre ? '<span>' + esc(opts.genre) + '</span>' : '') + '</div>' +
        '<div class="arc-tools">' +
          '<button class="arc-tool" type="button" data-arc="pause" aria-label="Pause">' + ICON.pause + '</button>' +
          '<button class="arc-tool" type="button" data-arc="sound" aria-label="Sound"></button>' +
          '<button class="arc-tool" type="button" data-arc="full" aria-label="Full screen">' + ICON.full + '</button>' +
        '</div>' +
      '</header>' +
      '<main class="arc-stage">' +
        '<canvas aria-label="' + esc(opts.title || 'Game') + ' play area" role="img"></canvas>' +
        (opts.three ? '<canvas class="arc-hud" aria-hidden="true"></canvas>' : '') +
        '<div class="arc-float" aria-hidden="true"><i></i></div>' +
        '<div class="arc-hint"></div>' +
        '<div class="arc-toast" role="status" aria-live="polite"></div>' +
        '<div class="arc-touch"></div>' +
        '<div class="arc-panel" hidden><div class="arc-card" role="dialog" aria-modal="true"></div></div>' +
      '</main>';
    document.body.prepend(app);

    const stage = app.querySelector('.arc-stage');
    const canvas = app.querySelector('canvas');
    // 3D games (opts.three) draw the world with WebGL on `canvas` and their HUD
    // on a transparent 2D overlay; ctx is always the 2D surface a game draws on.
    const hud = opts.three ? app.querySelector('.arc-hud') : null;
    const ctx = (hud || canvas).getContext('2d');
    const floatEl = app.querySelector('.arc-float');
    const panel = app.querySelector('.arc-panel');
    const card = app.querySelector('.arc-card');
    const toastEl = app.querySelector('.arc-toast');
    const hintEl = app.querySelector('.arc-hint');
    const touchEl = app.querySelector('.arc-touch');
    const btnPause = app.querySelector('[data-arc="pause"]');
    const btnSound = app.querySelector('[data-arc="sound"]');
    const btnFull = app.querySelector('[data-arc="full"]');
    const input = Input(canvas);
    const mouseOpts = opts.mouse === true ? {} : (opts.mouse || null);
    if (mouseOpts) {
      input.mouseSteer = mouseOpts.steer || false;
      canvas.style.cursor = mouseOpts.cursor || 'crosshair';
    }
    const sfx = Sfx();

    const arc = {
      slug, opts, canvas, ctx, input, sfx, stage, app,
      hud, three: !!opts.three,
      state: 'menu', w: 0, h: 0, dpr: 1, time: 0, frame: 0, reducedMotion,
      choices: {}, debug: null,
      clamp, lerp, rng, store, esc,
    };
    // Shared safe zone so in-game HUD never sits under the stick and pads.
    arc.hudPad = () => {
      const touch = !!arc.touchMode;
      const gest = touch && arc.touchStyle !== 'pads' && !!opts.gestures;
      return { top: 12, left: 12, right: 12, bottom: touch ? (gest ? 64 : 188) : 52, touch };
    };

    /* sizing */
    const fit = () => {
      const r = stage.getBoundingClientRect();
      const area = Math.max(1, r.width * r.height);
      // 2x on a tablet (820×1180) is a 1640×2360 canvas. Heavy games then drop
      // under 15fps. Cap at 1.5x, then keep the backing store under ~1.6M
      // pixels so Gully Champs does not blit two ~3k-wide wall caches onto 3.4M px.
      const MAX_PX = 1.6e6;
      let dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      if (area * dpr * dpr > MAX_PX) dpr = Math.max(1, Math.sqrt(MAX_PX / area));
      arc.w = Math.max(1, Math.round(r.width)); arc.h = Math.max(1, Math.round(r.height)); arc.dpr = dpr;
      if (hud) { hud.width = Math.round(arc.w * dpr); hud.height = Math.round(arc.h * dpr); }
      else { canvas.width = Math.round(arc.w * dpr); canvas.height = Math.round(arc.h * dpr); }
      if (opts.resize) opts.resize(arc);
    };
    if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); else window.addEventListener('resize', fit);
    fit();

    /* touch */
    const isCoarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    const paintHint = () => {
      const g = arc.touchMode && opts.gestures && arc.touchStyle !== 'pads' && arc.state === 'play';
      const h = g ? (opts.gestures.hint || '') : arc.touchMode ? (opts.touchHint || 'Stick to move, pads to act') : (opts.hint || '');
      hintEl.textContent = h;
    };
    const setTouch = (on) => { app.classList.toggle('touch', !!on); arc.touchMode = !!on; paintHint(); };
    setTouch(isCoarse);
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') setTouch(true); }, { passive: true });
    window.addEventListener('keydown', () => { if (arc.touchMode && !isCoarse) setTouch(false); });
    const t = opts.touch || {};
    if (t.stick) {
      const s = document.createElement('div'); s.className = 'arc-stick'; s.setAttribute('aria-hidden', 'true');
      s.innerHTML = '<i></i>'; touchEl.appendChild(s);
      const knob = s.firstChild; let pid = null;
      const move = (e) => {
        const r = s.getBoundingClientRect(); const R = r.width / 2 - 10;
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const m = Math.hypot(dx, dy); if (m > R) { dx = dx / m * R; dy = dy / m * R; }
        input.stick.x = dx / R; input.stick.y = dy / R; input.stick.active = true;
        knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      };
      const end = () => { pid = null; input.stick.x = input.stick.y = 0; input.stick.active = false; knob.style.transform = ''; };
      s.addEventListener('pointerdown', (e) => { e.preventDefault(); pid = e.pointerId; try { s.setPointerCapture(pid); } catch (err) { /* synthetic */ } move(e); sfx.unlock(); });
      s.addEventListener('pointermove', (e) => { if (e.pointerId === pid) move(e); });
      s.addEventListener('pointerup', end); s.addEventListener('pointercancel', end); s.addEventListener('lostpointercapture', end);
    }
    const pads = document.createElement('div'); pads.className = 'arc-pads'; touchEl.appendChild(pads);
    arc.setPads = (list) => {
      pads.innerHTML = '';
      (list || []).forEach((p) => {
        const b = document.createElement('button'); b.type = 'button';
        b.className = 'arc-pad' + (p.big ? ' big' : '') + (p.hot ? ' hot' : '') + (p.keep ? ' keep' : '');
        b.textContent = p.label; b.setAttribute('aria-label', p.label);
        const on = (e) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ } input.press(p.key); b.classList.add('on'); sfx.unlock(); };
        const off = () => { input.release(p.key); b.classList.remove('on'); };
        b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('lostpointercapture', off);
        pads.appendChild(b);
      });
    };
    arc.setPads(t.pads);
    // Games that steer with left / right halves of the screen can hide the stick.
    arc.showStick = (on) => { const s = touchEl.querySelector('.arc-stick'); if (s) s.style.display = on ? '' : 'none'; };

    /* keyboard */
    const GAME_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].concat(opts.gameKeys || []));
    window.addEventListener('keydown', (e) => {
      sfx.unlock();
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (arc.state === 'play') { arc.pause(); e.preventDefault(); return; }
        if (arc.state === 'pause') { arc.resume(); e.preventDefault(); return; }
      }
      if (!panel.hidden && (e.code === 'Enter' || e.code === 'NumpadEnter')) {
        const primary = card.querySelector('.arc-btn.primary');
        if (primary && document.activeElement && document.activeElement.tagName !== 'BUTTON') { primary.click(); e.preventDefault(); }
        return;
      }
      if (arc.state !== 'play') return;
      if (GAME_KEYS.has(e.code) || /^Key[A-Z]$/.test(e.code) || /^Shift/.test(e.code)) e.preventDefault();
      if (!e.repeat) input.press(e.code);
    });
    window.addEventListener('keyup', (e) => input.release(e.code));
    window.addEventListener('blur', () => { input.clear(); if (arc.state === 'play') arc.pause(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && arc.state === 'play') arc.pause(); });

    /* tools */
    const paintSound = () => {
      btnSound.innerHTML = sfx.muted ? ICON.mute : ICON.sound;
      btnSound.setAttribute('aria-label', sfx.muted ? 'Sound off, turn on' : 'Sound on, turn off');
      btnSound.setAttribute('aria-pressed', String(!sfx.muted));
    };
    paintSound();
    btnSound.addEventListener('click', () => { sfx.unlock(); sfx.setMuted(!sfx.muted); paintSound(); if (opts.onMute) opts.onMute(sfx.muted); });
    btnPause.addEventListener('click', () => { if (arc.state === 'play') arc.pause(); else if (arc.state === 'pause') arc.resume(); });
    const fsTarget = app;
    if (!(fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen)) btnFull.hidden = true;
    btnFull.addEventListener('click', () => {
      const d = document;
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else (fsTarget.requestFullscreen || fsTarget.webkitRequestFullscreen).call(fsTarget);
    });
    const paintPause = () => {
      btnPause.innerHTML = arc.state === 'pause' ? ICON.play : ICON.pause;
      btnPause.setAttribute('aria-label', arc.state === 'pause' ? 'Resume' : 'Pause');
      btnPause.disabled = !(arc.state === 'play' || arc.state === 'pause');
    };

    /* panels */
    const keysHtml = () => {
      let k = (opts.keys || []).slice();
      const gstyle = opts.gestures && arc.touchMode && (arc.choices.touchStyle || 'gesture') !== 'pads';
      if (gstyle && opts.gestures.keys) k = opts.gestures.keys.slice();
      else if (arc.touchMode) {
        if (opts.touchKeys && opts.touchKeys.length) k = opts.touchKeys.slice();
        else k.push(['On-screen stick and buttons', 'Move and act on a phone']);
      } else if (mouseOpts && mouseOpts.keys && mouseOpts.keys.length) {
        k = k.concat(mouseOpts.keys);
      }
      if (!k.some((r) => /pause/i.test(r[1] || '') || /^Esc/i.test(r[0] || ''))) k.push(['Esc / P', 'Pause']);
      if (!k.length) return '';
      return '<div class="arc-keys">' + k.map((r) => '<kbd>' + esc(r[0]) + '</kbd><span>' + esc(r[1]) + '</span>').join('') + '</div>';
    };
    arc.keysHtml = keysHtml;
    const optionsHtml = (list) => {
      if (!list || !list.length) return '';
      return '<div class="arc-opts">' + list.map((o) => {
        if (arc.choices[o.id] == null) arc.choices[o.id] = store.get('arcade.' + slug + '.' + o.id, o.value != null ? o.value : o.choices[0].v);
        if (!o.choices.some((c) => c.v === arc.choices[o.id])) arc.choices[o.id] = o.choices[0].v;
        return '<div><div class="label">' + esc(o.label) + '</div><div class="arc-seg" data-opt="' + esc(o.id) + '">' +
          o.choices.map((c) => '<button type="button" data-v="' + esc(c.v) + '" aria-pressed="' + (arc.choices[o.id] === c.v) + '">' + esc(c.label) + '</button>').join('') +
          '</div></div>';
      }).join('') + '</div>';
    };
    arc.panel = (p) => {
      p = p || {};
      card.innerHTML =
        (p.eyebrow ? '<div class="eyebrow">' + esc(p.eyebrow) + '</div>' : '') +
        (p.title ? '<h2>' + p.title + '</h2>' : '') +
        (p.html || '') + optionsHtml(p.options) + (p.showKeys ? keysHtml() : '') +
        '<div class="arc-actions"></div>';
      const actions = card.querySelector('.arc-actions');
      (p.actions || []).forEach((a) => {
        const el = document.createElement(a.href ? 'a' : 'button');
        el.className = 'arc-btn' + (a.primary ? ' primary' : '');
        el.textContent = a.label;
        if (a.href) el.href = a.href; else { el.type = 'button'; el.addEventListener('click', () => { sfx.unlock(); a.on && a.on(); }); }
        actions.appendChild(el);
      });
      card.querySelectorAll('.arc-seg').forEach((seg) => {
        const id = seg.getAttribute('data-opt');
        seg.addEventListener('click', (e) => {
          const b = e.target.closest('button'); if (!b) return;
          const def = (p.options || []).find((o) => o.id === id);
          const c = def && def.choices.find((x) => String(x.v) === b.getAttribute('data-v'));
          if (!c) return;
          arc.choices[id] = c.v; store.set('arcade.' + slug + '.' + id, c.v);
          seg.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
      });
      panel.hidden = false; app.classList.add('panel-open');
      const first = card.querySelector('.arc-btn.primary') || card.querySelector('.arc-btn');
      if (first && !arc.touchMode) setTimeout(() => { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }, 30);
    };
    arc.hidePanel = () => { panel.hidden = true; app.classList.remove('panel-open'); card.innerHTML = ''; try { canvas.focus && canvas.focus(); } catch (e) { /* ignore */ } };

    arc.touchStyle = 'pads';
    const applyTouchStyle = () => {
      const g = opts.gestures;
      let style = 'pads';
      if (g && arc.touchMode) style = arc.choices.touchStyle || store.get('arcade.' + slug + '.touchStyle', 'gesture') || 'gesture';
      arc.touchStyle = style;
      app.classList.toggle('gestures', style !== 'pads' && !!g && !!arc.touchMode);
      input.dragSteer = style === 'gesture' ? (g.drag || false) : false;
      input.tiltSteer = style === 'tilt' ? (g.tilt === true ? 'x' : g.tilt) : false;
      if (style === 'tilt') {
        const D = window.DeviceOrientationEvent;
        // iOS asks once, and only from inside a tap: arc.start runs from the Play tap.
        if (D && typeof D.requestPermission === 'function') D.requestPermission().catch(() => {});
      }
      paintHint();
    };
    arc.start = () => {
      arc.hidePanel(); input.clear(); arc.time = 0; arc.state = 'play'; paintPause(); sfx.unlock();
      applyTouchStyle();
      store.set('arcade.played.' + slug, (store.get('arcade.played.' + slug, 0) || 0) + 1);
      if (opts.start) opts.start(arc, arc.choices);
    };
    arc.menu = (p) => {
      arc.state = 'menu'; paintPause();
      const m = Object.assign({ actions: [{ label: 'Play', primary: true, on: arc.start }, { label: 'All games', href: '/games' }], showKeys: true }, opts.menu || {}, p || {});
      if (opts.gestures && arc.touchMode) {
        const ch = [{ v: 'gesture', label: 'Tap & swipe' }];
        if (opts.gestures.tilt) ch.push({ v: 'tilt', label: 'Tilt to steer' });
        ch.push({ v: 'pads', label: 'Stick & buttons' });
        m.options = [{ id: 'touchStyle', label: 'Touch controls', choices: ch, value: 'gesture' }].concat(m.options || []);
      }
      const best = arc.best();
      if (best != null && m.html != null && !m.noBest) m.html += '<div class="stat"><div>Your best<b>' + esc(opts.formatScore ? opts.formatScore(best) : best) + '</b></div></div>';
      arc.panel(m);
      if (opts.onMenu) opts.onMenu(arc);
    };
    arc.pause = () => {
      if (arc.state !== 'play') return;
      arc.state = 'pause'; paintPause(); input.clear();
      if (opts.onPause) opts.onPause(arc);
      arc.panel({
        eyebrow: 'Paused', title: esc(opts.title || 'Paused'), html: opts.pauseHtml ? opts.pauseHtml(arc) : '', showKeys: true,
        actions: [{ label: 'Resume', primary: true, on: arc.resume }, { label: 'Restart', on: arc.start }, { label: 'Quit to menu', on: () => arc.menu() }],
      });
    };
    arc.resume = () => { if (arc.state !== 'pause') return; arc.hidePanel(); arc.state = 'play'; paintPause(); if (opts.onResume) opts.onResume(arc); };

    /* scores */
    const bestKey = 'arcade.best.' + slug;
    arc.best = () => { const b = store.get(bestKey, null); return b && typeof b.score === 'number' ? b.score : null; };
    arc.record = (score, lowerIsBetter) => {
      const prev = arc.best();
      const better = prev == null || (lowerIsBetter ? score < prev : score > prev);
      if (better) store.set(bestKey, { score, at: Date.now() });
      return { best: better ? score : prev, isNew: better && prev != null, first: prev == null };
    };
    arc.over = (o) => {
      o = o || {};
      arc.state = 'over'; paintPause(); input.clear();
      if (opts.onOver) opts.onOver(arc);
      let stats = '';
      if (typeof o.score === 'number') {
        const r = arc.record(o.score, o.lowerIsBetter);
        const f = opts.formatScore || ((v) => v);
        stats = '<div class="stat"><div>' + esc(o.scoreLabel || 'Score') + '<b>' + esc(f(o.score)) + '</b></div><div>Best<b>' + esc(f(r.best)) + '</b></div>' +
          (r.isNew ? '<div class="new">New best<b class="new">&#9733;</b></div>' : '') + '</div>';
      }
      arc.panel({
        eyebrow: o.eyebrow || 'Game over', title: o.title || 'Game over', html: (o.html || '') + stats,
        actions: [{ label: o.again || 'Play again', primary: true, on: arc.start }, { label: 'Change settings', on: () => arc.menu() }, { label: 'All games', href: '/games' }],
      });
    };

    /* toast */
    let toastTimer = 0;
    arc.toast = (text, small, ms) => {
      toastEl.innerHTML = (small ? '<small>' + esc(small) + '</small>' : '') + esc(text);
      toastEl.classList.add('show');
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => toastEl.classList.remove('show'), ms || 1400);
    };
    arc.shake = 0; // games may add to this; cleared each frame, ignored under reduced motion

    /* loop */
    let last = 0;
    const tick = (now) => {
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 1 / 60;
      last = now;
      try {
        if (arc.state === 'play') { arc.time += dt; if (opts.update) opts.update(dt, arc); }
        else if (arc.state !== 'pause' && opts.idle) opts.idle(dt, arc);
        if (hud) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, hud.width, hud.height); }
        ctx.setTransform(arc.dpr, 0, 0, arc.dpr, 0, 0);
        arc.shakeX = arc.shakeY = 0;
        if (arc.shake > 0 && !reducedMotion) {
          const s = arc.shake;
          arc.shakeX = (Math.random() - 0.5) * s * 2; arc.shakeY = (Math.random() - 0.5) * s * 2;
          // A 3D game moves its camera by shakeX/shakeY; the HUD stays put.
          if (!hud) ctx.translate(arc.shakeX, arc.shakeY);
          arc.shake = Math.max(0, s - dt * 48);
        } else {
          arc.shake = 0;
        }
        if (opts.render) opts.render(ctx, arc);
      } catch (err) {
        console.error(err);
      }
      // The stick that appears under the thumb while a drag steers.
      const gz = input.gesture;
      const showFloat = arc.state === 'play' && input.dragSteer && gz.active && gz.type !== 'mouse';
      if (showFloat) {
        const R = 56, kx = clamp(gz.dx, -R, R), ky = input.dragSteer === 'xy' ? clamp(gz.dy, -R, R) : 0;
        floatEl.style.transform = 'translate(' + (gz.sx - 60) + 'px,' + (gz.sy - 60) + 'px)';
        floatEl.firstChild.style.transform = 'translate(' + kx + 'px,' + ky + 'px)';
      }
      if (floatEl.classList.contains('on') !== showFloat) floatEl.classList.toggle('on', showFloat);
      input.endFrame();
      arc.frame++;
      requestAnimationFrame(tick);
    };

    window.__arcade = arc;
    if (opts.init) opts.init(arc);
    paintPause();
    requestAnimationFrame(tick);
    return arc;
  }

  window.Arcade = { create, clamp, lerp, rng };
})();
