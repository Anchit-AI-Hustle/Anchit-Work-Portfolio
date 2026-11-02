/* Brand sense layer: opt-in sound and haptics for the two brand pages.
 *
 * Off by default, always. Nothing plays and nothing vibrates until the person
 * turns it on with the page's own toggle, and the choice is remembered on this
 * device only. Each brand has its own voice, synthesised here, never a file:
 *   gram  a short glassy chime, the chrome-and-lilac bar
 *   deli  a dry wooden knock, a cleaver set down on walnut
 *
 * What makes a sound: pressing a button or tab, a chapter changing in a pinned
 * stage, and turning a 3D model. Phones also get a short vibration on the same
 * moments where the browser supports it. Reduced motion keeps sound available
 * but drops the haptics, which are motion felt rather than seen.
 */
(function () {
  'use strict';
  var KEY = 'brand-sense';
  var brand = document.documentElement.getAttribute('data-brand') || 'gram';
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var on = false, ctx = null, lastAt = 0;

  // A page whose toggle also starts something that needs a gesture (Gram
  // Street's ambient bed) opts out of remembering, so the button and the
  // sound can never disagree after a reload.
  var persist = document.documentElement.getAttribute('data-sense-persist') !== '0';
  if (persist) { try { on = localStorage.getItem(KEY + ':' + brand) === '1'; } catch (e) {} }

  function audio() {
    if (!ctx) {
      var A = window.AudioContext || window.webkitAudioContext;
      if (!A) return null;
      ctx = new A();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function chime(c, t, pitch) {
    [1, 2.01, 3.03].forEach(function (h, i) {
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine'; o.frequency.value = pitch * h;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05 / (i + 1), t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45 - i * 0.1);
      o.connect(g); g.connect(c.destination); o.start(t); o.stop(t + 0.5);
    });
  }
  function knock(c, t, pitch) {
    var len = Math.floor(c.sampleRate * 0.08), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    var src = c.createBufferSource(), bp = c.createBiquadFilter(), g = c.createGain();
    src.buffer = buf; bp.type = 'bandpass'; bp.frequency.value = pitch; bp.Q.value = 4;
    g.gain.value = 0.35;
    src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(t);
  }

  // kind: 'tap' | 'step' | 'turn'
  function cue(kind) {
    if (!on) return;
    var now = performance.now();
    if (now - lastAt < 70) return;          // a burst of events is one cue
    lastAt = now;
    var c = audio();
    if (c) {
      var t = c.currentTime + 0.005;
      if (brand === 'deli') knock(c, t, kind === 'step' ? 520 : kind === 'turn' ? 900 : 700);
      else chime(c, t, kind === 'step' ? 784 : kind === 'turn' ? 1175 : 988);
    }
    if (!reduced && navigator.vibrate) { try { navigator.vibrate(kind === 'step' ? [8, 30, 8] : 8); } catch (e) {} }
  }

  function set(v) {
    on = !!v;
    if (persist) { try { localStorage.setItem(KEY + ':' + brand, on ? '1' : '0'); } catch (e) {} }
    document.querySelectorAll('[data-sense-toggle]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(on));
      var l = b.querySelector('[data-sense-label]');
      if (l) l.textContent = on ? l.getAttribute('data-on') : l.getAttribute('data-off');
    });
    if (on) cue('tap');
  }

  function boot() {
    document.querySelectorAll('[data-sense-toggle]').forEach(function (b) {
      b.addEventListener('click', function () { set(!on); });
    });
    set(on);
    // a press on any button or tab in the page
    document.addEventListener('click', function (e) {
      var t = e.target.closest && e.target.closest('button, [role="tab"], a.btn, .cbtn');
      if (t && !t.hasAttribute('data-sense-toggle')) cue('tap');
    }, true);
    // a chapter changing in a pinned stage: watch the nav's current marker
    var navs = document.querySelectorAll('.ch-nav button, .deli-stage-btn');
    if (navs.length && 'MutationObserver' in window) {
      var mo = new MutationObserver(function (list) {
        for (var i = 0; i < list.length; i++) {
          var b = list[i].target;
          if (b.getAttribute('aria-current') === 'true') { cue('step'); break; }
        }
      });
      navs.forEach(function (b) { mo.observe(b, { attributes: true, attributeFilter: ['aria-current'] }); });
    }
  }

  window.BrandSense = {
    set: set,
    get on() { return on; },
    cue: cue,
    bind: function (el) { el.addEventListener('pointerdown', function () { cue('turn'); }); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
