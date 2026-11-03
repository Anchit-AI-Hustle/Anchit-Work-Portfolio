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
 *     keys: [['WASD', 'Move'], ['J', 'Pass']],
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
  function Input(canvas) {
    const down = new Set(); const hit = new Set();
    const stick = { x: 0, y: 0, active: false };
    const pointer = { x: 0, y: 0, down: false, pressed: false, released: false, id: null };
    const AXIS = { left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'] };
    const any = (list) => list.some((k) => down.has(k));
    const api = {
      down: (...codes) => codes.some((c) => down.has(c)),
      hit: (...codes) => codes.some((c) => hit.has(c)),
      press(code) { if (!down.has(code)) hit.add(code); down.add(code); },
      release(code) { down.delete(code); },
      axis() {
        let x = (any(AXIS.right) ? 1 : 0) - (any(AXIS.left) ? 1 : 0);
        let y = (any(AXIS.down) ? 1 : 0) - (any(AXIS.up) ? 1 : 0);
        if (stick.active) { x += stick.x; y += stick.y; }
        const m = Math.hypot(x, y);
        if (m > 1) { x /= m; y /= m; }
        return { x, y };
      },
      stick, pointer,
      clear() { down.clear(); hit.clear(); stick.x = stick.y = 0; stick.active = false; pointer.down = false; },
      endFrame() { hit.clear(); pointer.pressed = false; pointer.released = false; },
    };
    const local = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', (e) => {
      const p = local(e); pointer.x = p.x; pointer.y = p.y; pointer.down = true; pointer.pressed = true; pointer.id = e.pointerId;
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic event */ }
    });
    canvas.addEventListener('pointermove', (e) => { const p = local(e); pointer.x = p.x; pointer.y = p.y; });
    const up = (e) => { if (pointer.down) pointer.released = true; pointer.down = false; pointer.id = null; };
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
        '<div class="arc-hint"></div>' +
        '<div class="arc-toast" role="status" aria-live="polite"></div>' +
        '<div class="arc-touch"></div>' +
        '<div class="arc-panel" hidden><div class="arc-card" role="dialog" aria-modal="true"></div></div>' +
      '</main>';
    document.body.prepend(app);

    const stage = app.querySelector('.arc-stage');
    const canvas = app.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    const panel = app.querySelector('.arc-panel');
    const card = app.querySelector('.arc-card');
    const toastEl = app.querySelector('.arc-toast');
    const hintEl = app.querySelector('.arc-hint');
    const touchEl = app.querySelector('.arc-touch');
    const btnPause = app.querySelector('[data-arc="pause"]');
    const btnSound = app.querySelector('[data-arc="sound"]');
    const btnFull = app.querySelector('[data-arc="full"]');
    hintEl.textContent = opts.hint || '';

    const input = Input(canvas);
    const sfx = Sfx();

    const arc = {
      slug, opts, canvas, ctx, input, sfx, stage, app,
      state: 'menu', w: 0, h: 0, dpr: 1, time: 0, frame: 0, reducedMotion,
      choices: {}, debug: null,
      clamp, lerp, rng, store, esc,
    };
    // Shared safe zone so in-game HUD never sits under the stick and pads.
    arc.hudPad = () => {
      const touch = !!arc.touchMode;
      return { top: 12, left: 12, right: 12, bottom: touch ? 188 : 52, touch };
    };

    /* sizing */
    const fit = () => {
      const r = stage.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      arc.w = Math.max(1, Math.round(r.width)); arc.h = Math.max(1, Math.round(r.height)); arc.dpr = dpr;
      canvas.width = Math.round(arc.w * dpr); canvas.height = Math.round(arc.h * dpr);
      if (opts.resize) opts.resize(arc);
    };
    if (window.ResizeObserver) new ResizeObserver(fit).observe(stage); else window.addEventListener('resize', fit);
    fit();

    /* touch */
    const isCoarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;
    const setTouch = (on) => { app.classList.toggle('touch', !!on); arc.touchMode = !!on; };
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
        b.className = 'arc-pad' + (p.big ? ' big' : '') + (p.hot ? ' hot' : '');
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
      const k = opts.keys || [];
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

    arc.start = () => {
      arc.hidePanel(); input.clear(); arc.time = 0; arc.state = 'play'; paintPause(); sfx.unlock();
      store.set('arcade.played.' + slug, (store.get('arcade.played.' + slug, 0) || 0) + 1);
      if (opts.start) opts.start(arc, arc.choices);
    };
    arc.menu = (p) => {
      arc.state = 'menu'; paintPause();
      const m = Object.assign({ actions: [{ label: 'Play', primary: true, on: arc.start }, { label: 'All games', href: '/games' }], showKeys: true }, opts.menu || {}, p || {});
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
        else if (opts.idle) opts.idle(dt, arc);
        ctx.setTransform(arc.dpr, 0, 0, arc.dpr, 0, 0);
        if (opts.render) opts.render(ctx, arc);
      } catch (err) {
        console.error(err);
      }
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
