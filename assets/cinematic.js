/* cinematic.js — the site's motion grammar, portable to any page.
 *
 * index.html carries this behaviour inline; every other page had none at all.
 * Rather than copy it 27 times, this is one self-contained file: it injects its
 * own CSS, so adding motion to a page is a single <script> tag and there is no
 * way to ship the script without the styles.
 *
 * The grammar matches index.html deliberately, so the site feels like one thing:
 *   section  → each arrives on its own beat as it enters the viewport
 *   block    → blocks within a section cascade in DOM order
 *   element  → children of a grid stagger sub-linearly, so a long row stays
 *              ordered without the last card waiting on a linear pile-up
 *
 * FAIL-VISIBLE BY DESIGN. Everything here starts hidden, which is exactly how a
 * motion system turns into a blank page — that has bitten this site twice. So:
 * elements are only hidden by JavaScript that has already decided to animate
 * them, a sweep re-checks on scroll and resize, and a hard deadline reveals
 * everything regardless. If any of it fails, the visitor sees the content.
 *
 * Honours the same data-motion contract as index.html: html[data-motion="off"]
 * disables it, and [data-no-motion] opts out any subtree.
 */
(function () {
  'use strict';
  if (window.__cinematicBooted) return;
  window.__cinematicBooted = true;

  // ── resolve the preference, same contract as index.html ──────────────────
  var root = document.documentElement;
  var on = true;
  try { if (localStorage.getItem('anchit-motion') === 'off') on = false; } catch (e) {}
  if (!root.hasAttribute('data-motion')) root.setAttribute('data-motion', on ? 'on' : 'off');
  var motionOff = root.getAttribute('data-motion') === 'off';

  // A control on EVERY page, because 'off' is stored globally.
  //
  // The Motion toggle only exists on the homepage, so one click there set
  // anchit-motion=off for the whole origin and left all 22 other pages
  // permanently static with no way to undo it — verified: tagged=0, played=0,
  // and no control anywhere on the page. A global switch needs a global way
  // back, so this injects a small one wherever the homepage's is absent.
  function injectToggle() {
    if (document.getElementById('motionToggle') || document.getElementById('cinMotion')) return;
    var btn = document.createElement('button');
    btn.id = 'cinMotion';
    btn.type = 'button';
    btn.setAttribute('aria-pressed', motionOff ? 'false' : 'true');
    btn.title = motionOff ? 'Motion is off — click to turn it on' : 'Click to turn motion off';
    btn.textContent = motionOff ? 'Motion: off' : 'Motion: on';
    btn.style.cssText = 'position:fixed;left:14px;bottom:14px;z-index:2147483000;' +
      'font:500 10px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;' +
      'text-transform:uppercase;padding:7px 11px;border-radius:99px;cursor:pointer;' +
      'color:#B3A996;background:#16130F;border:1px solid rgba(255,247,232,.16);opacity:.75';
    btn.addEventListener('mouseenter', function () { btn.style.opacity = '1'; });
    btn.addEventListener('mouseleave', function () { btn.style.opacity = '.75'; });
    btn.addEventListener('click', function () {
      var next = root.getAttribute('data-motion') === 'off' ? 'on' : 'off';
      try { localStorage.setItem('anchit-motion', next); } catch (e) {}
      location.reload();                       // simplest correct re-apply
    });
    (document.body || root).appendChild(btn);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectToggle);
  } else { injectToggle(); }

  if (motionOff) return;                       // calm mode: nothing else runs

  // ── styles, injected so the script can never arrive without them ─────────
  var css = document.createElement('style');
  css.id = 'cinematic-css';
  css.textContent = [
    '.cin{opacity:0;transform:translateY(22px);' +
      'transition:opacity .68s cubic-bezier(.16,1,.3,1),transform .68s cubic-bezier(.16,1,.3,1);' +
      'transition-delay:var(--cin-d,0s);will-change:opacity,transform}',
    '.cin-stagger>*{opacity:0;transform:translateY(18px);' +
      'transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1);' +
      'transition-delay:var(--cin-cd,0s);will-change:opacity,transform}',
    '.cin.cin-in,.cin-stagger.cin-in>*{opacity:1;transform:none}',
    // Anything still hidden when the deadline passes is shown outright.
    // Richer vocabulary. Depth (scale + blur) for feature cards, a lift for
    // parallax elements, and word-level reveal for headings.
    '.cin-depth{opacity:0;transform:scale(.965) translateY(16px);filter:blur(6px);' +
      'transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1),filter .8s ease;' +
      'transition-delay:var(--cin-d,0s)}',
    '.cin-depth.cin-in{opacity:1;transform:none;filter:blur(0)}',
    '.cin-word{display:inline-block;opacity:0;transform:translateY(.5em) rotate(1.5deg);' +
      'transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1);' +
      'transition-delay:var(--cin-wd,0s)}',
    '.cin-in .cin-word,.cin-word.cin-in{opacity:1;transform:none}',
    '.cin-par{will-change:transform}',
    // Controls and fields inside an arriving card ride in just behind it.
    '.cin-in .cin-ctl{animation:cinCtl .5s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--cin-cd,.18s)}',
    '@keyframes cinCtl{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}',
    'html.cin-bail .cin,html.cin-bail .cin-stagger>*,html.cin-bail .cin-depth,html.cin-bail .cin-word' +
      '{opacity:1!important;transform:none!important;filter:none!important;transition:none!important}'
  ].join('');
  (document.head || root).appendChild(css);

  // Controls and fields are no longer excluded outright — they now ride in
  // just behind the card they belong to (see enrich()). Only things that would
  // fight their own updates, or that animate themselves, stay out.
  var SKIP = 'canvas,svg,iframe,video,audio,' +
             '[data-no-motion],[aria-live],[role="alert"],[contenteditable="true"]';

  function skip(el) {
    return el.matches(SKIP) || el.closest('[data-no-motion],[aria-live]') !== null;
  }

  // Sub-linear steps: 20 cards land across ~0.6s, not ~1.5s, and no two share
  // an instant.
  function step(i) { return Math.round(Math.sqrt(i + 1) * 62) / 1000; }

  function boxLike(el) {
    var s = getComputedStyle(el);
    return s.borderRadius !== '0px' &&
      (parseFloat(s.borderTopWidth) > 0 ||
       s.backgroundColor !== 'rgba(0, 0, 0, 0)' ||
       s.boxShadow !== 'none');
  }

  // index.html and index-motion.html carry an older inline reveal system. This
  // runtime must not double-animate what that already owns, so anything it has
  // claimed counts as covered and is left completely alone. That makes the two
  // safe to run side by side: this one fills only the gaps.
  var INLINE = '.reveal,.reveal-stagger,.reveal-left,.reveal-right,.reveal-scale';
  function covered(el) {
    if (el.__cin || el.classList.contains('cin') || el.classList.contains('cin-stagger')) return true;
    if (el.parentElement &&
        (el.parentElement.classList.contains('cin-stagger') ||
         el.parentElement.classList.contains('reveal-stagger'))) return true;
    return el.matches(INLINE) || el.closest(INLINE) !== null;
  }

  function tag(scope) {
    var host = scope || document.body;
    if (!host) return;
    var all = host.querySelectorAll('*');
    if (all.length > 6000) return;            // pathological DOM: leave it alone

    // Pass 1 — anything holding two or more cards becomes a stagger scope, at
    // ANY depth. Walking only the direct children of known containers left
    // nested grids untouched: 78% of boxes across these pages had no beat.
    Array.prototype.forEach.call(all, function (el) {
      if (el.__cinGrid || covered(el)) return;
      if (skip(el)) return;
      var kids = Array.prototype.filter.call(el.children, function (c) {
        var cr = c.getBoundingClientRect();
        return cr.height > 40 && cr.width > 60;
      });
      if (kids.length < 2) return;
      var gridish = /grid|flex/.test(getComputedStyle(el).display);
      // A grid of anything cascades; a plain wrapper only when its children are
      // themselves cards, so ordinary prose wrappers are left alone.
      if (!gridish && kids.filter(boxLike).length < 2) return;
      el.classList.add('cin-stagger');
      el.__cinGrid = 1; el.__cin = 1;
    });

    // Pass 2 — every remaining card-like box arrives on its own.
    Array.prototype.forEach.call(all, function (el) {
      if (covered(el)) return;
      if (skip(el)) return;
      var r = el.getBoundingClientRect();
      if (r.height < 40 || r.width < 60) return;
      if (!boxLike(el)) return;
      if (el.querySelector('.cin,.cin-stagger')) return;   // a scope already covers its insides
      el.classList.add('cin');
      el.__cin = 1;
    });
  }

  var order = 0;
  function play(el) {
    if (el.classList.contains('cin-in')) return;
    // Blocks arriving in the same burst queue behind each other; a block
    // arriving alone gets no offset, because there is nothing to queue behind.
    el.style.setProperty('--cin-d', step(order % 6) + 's');
    if (el.classList.contains('cin-stagger')) {
      Array.prototype.forEach.call(el.children, function (c, i) {
        c.style.setProperty('--cin-cd', (step(order % 6) + step(i)) + 's');
      });
    }
    order++;
    el.classList.add('cin-in');
  }

  var io = null;
  function observe() {
    tag();
    if (!('IntersectionObserver' in window)) return bail();
    if (io) io.disconnect();
    io = new IntersectionObserver(function (entries) {
      entries.filter(function (e) { return e.isIntersecting; })
        .sort(function (a, z) {
          return a.target.compareDocumentPosition(z.target) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        })
        .forEach(function (e) { play(e.target); io.unobserve(e.target); });
      order = 0;                                   // each burst starts its own count
    }, { threshold: 0.08, rootMargin: '0px 0px -28px 0px' });
    document.querySelectorAll('.cin:not(.cin-in),.cin-stagger:not(.cin-in)').forEach(function (el) {
      io.observe(el);
    });
  }

  // Anything on screen but never reported gets played anyway.
  var queued = false;
  function sweep() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      setTimeout(function () {
        queued = false;
        document.querySelectorAll('.cin:not(.cin-in),.cin-stagger:not(.cin-in)').forEach(function (el) {
          var r = el.getBoundingClientRect();
          if (r.top < innerHeight && r.bottom > 0) play(el);
        });
      }, 160);
    });
  }

  function bail() { root.classList.add('cin-bail'); }

  // ── horizontal rails ──────────────────────────────────────────────────
  // Mixed into the vertical flow, but only where the content earns it. An
  // analysis across the tool pages found almost nothing qualifies: they are
  // forms and panels, not galleries. So this is a RULE rather than a list —
  // a row of five or more uniform cards costing real vertical height becomes
  // a side-scrolling rail, and anything else is left to scroll normally.
  function railify() {
    if (motionOff) return;
    document.querySelectorAll('.cin-stagger:not([data-railed])').forEach(function (grid) {
      var kids = Array.prototype.filter.call(grid.children, function (c) {
        var r = c.getBoundingClientRect();
        return r.height > 60 && r.width > 90;
      });
      if (kids.length < 5) return;                       // too few to be a gallery
      var hs = kids.map(function (k) { return k.getBoundingClientRect().height; });
      if (Math.max.apply(null, hs) - Math.min.apply(null, hs) > 70) return;  // not uniform
      if (grid.getBoundingClientRect().height < innerHeight * 0.7) return;   // costs no real height
      if (grid.closest('[data-no-rail]')) return;

      grid.dataset.railed = '1';
      grid.style.cssText += ';display:flex;gap:18px;overflow-x:auto;overflow-y:hidden;' +
        'scroll-snap-type:x mandatory;scroll-behavior:smooth;padding-bottom:16px;' +
        '-webkit-overflow-scrolling:touch;';
      grid.setAttribute('tabindex', '0');
      grid.setAttribute('role', 'region');
      grid.setAttribute('aria-label', 'Scrollable card row — use arrow keys or swipe');
      kids.forEach(function (c) {
        c.style.cssText += ';scroll-snap-align:start;flex:0 0 clamp(240px,24vw,340px);';
      });

      var nav = document.createElement('div');
      nav.style.cssText = 'display:flex;gap:6px;justify-content:flex-end;margin-bottom:8px';
      nav.innerHTML = '<button type="button" aria-label="Previous">\u2039</button>' +
                      '<button type="button" aria-label="Next">\u203a</button>';
      Array.prototype.forEach.call(nav.children, function (btn) {
        btn.style.cssText = 'width:28px;height:28px;border-radius:50%;cursor:pointer;' +
          'background:transparent;color:inherit;opacity:.6;' +
          'border:1px solid currentColor;line-height:1;font-size:13px';
      });
      grid.parentNode.insertBefore(nav, grid);
      function page(dir) {
        var max = grid.scrollWidth - grid.clientWidth;
        var t = Math.max(0, Math.min(max, grid.scrollLeft + dir * Math.round(grid.clientWidth * 0.85)));
        try { grid.scrollTo({ left: t, behavior: 'smooth' }); } catch (e) { grid.scrollLeft = t; }
        // scrollBy/scrollTo can be patched elsewhere on these pages; make sure.
        setTimeout(function () { if (Math.abs(grid.scrollLeft - t) > 4) grid.scrollLeft = t; }, 340);
      }
      nav.children[0].addEventListener('click', function () { page(-1); });
      nav.children[1].addEventListener('click', function () { page(1); });
    });
  }

  // ── (1) Pinned horizontal sections ────────────────────────────────────
  // Scrolling down drives the rail sideways. The reason this is normally a bad
  // idea is that it steals the scroll and traps people; this version only takes
  // over while the rail is centred AND has somewhere left to go, and hands the
  // page straight back at either end, so a determined scroll always continues
  // down. Desktop with a real wheel only — never on touch, where the native
  // swipe is already the right gesture.
  function pinRails() {
    if (motionOff || innerWidth < 900) return;
    if (matchMedia('(pointer: coarse)').matches) return;

    document.querySelectorAll('[data-railed]:not([data-pinned])').forEach(function (rail) {
      rail.dataset.pinned = '1';
      var releasing = false;

      rail.closest('section,div').addEventListener('wheel', function (e) {
        if (releasing) return;
        var dy = e.deltaY;
        if (Math.abs(e.deltaX) > Math.abs(dy)) return;      // genuine sideways gesture: leave it

        var r = rail.getBoundingClientRect();
        var centred = r.top < innerHeight * 0.35 && r.bottom > innerHeight * 0.65;
        if (!centred) return;                                // only while it owns the screen

        var max = rail.scrollWidth - rail.clientWidth;
        var atStart = rail.scrollLeft <= 1, atEnd = rail.scrollLeft >= max - 1;
        // Hand the page back at the ends so the section can never trap anyone.
        if ((dy < 0 && atStart) || (dy > 0 && atEnd)) return;

        e.preventDefault();
        rail.scrollLeft += dy;

        // If we just hit an end, stop intercepting briefly so the next wheel
        // event scrolls the page instead of fighting the boundary.
        if (rail.scrollLeft <= 1 || rail.scrollLeft >= max - 1) {
          releasing = true;
          setTimeout(function () { releasing = false; }, 320);
        }
      }, { passive: false });
    });
  }

  // ── enrich: apply the richer vocabulary once blocks are tagged ─────────
  function enrich() {
    // (3) Controls and fields ride in behind their card rather than being
    // excluded. They are never observed individually — a button that arrives
    // after its own card reads as lag, not choreography.
    document.querySelectorAll('.cin,.cin-stagger>*').forEach(function (card) {
      if (card.__enriched) return;
      card.__enriched = 1;
      var ctl = card.querySelectorAll('button,input,select,textarea,a.btn,.btn,.chip,.tag');
      Array.prototype.forEach.call(ctl, function (c, i) {
        if (c.closest('[aria-live],[data-no-motion]')) return;
        c.classList.add('cin-ctl');
        c.style.setProperty('--cin-cd', (0.16 + Math.min(i, 5) * 0.045) + 's');
      });
    });

    // (2) Depth for feature cards: the biggest boxes get scale + blur instead
    // of a plain rise, so a hero card lands with more weight than a chip.
    document.querySelectorAll('.cin:not(.cin-depth)').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.height > 220 && r.width > 260) el.classList.add('cin-depth');
    });

    // (2) Word-level reveal for headings — a sentence assembles rather than
    // fading as one slab. Split once, guarded so it never runs twice.
    document.querySelectorAll('h1,h2').forEach(function (h) {
      if (h.__split || h.closest('[data-no-motion]')) return;
      if (h.children.length || h.textContent.trim().length > 90) return;  // leave rich/long headings alone
      h.__split = 1;
      var words = h.textContent.split(/\s+/).filter(Boolean);
      if (words.length < 2 || words.length > 14) return;
      h.textContent = '';
      words.forEach(function (w, i) {
        var span = document.createElement('span');
        span.className = 'cin-word';
        span.textContent = w;
        span.style.setProperty('--cin-wd', (i * 0.045) + 's');
        h.appendChild(span);
        if (i < words.length - 1) h.appendChild(document.createTextNode(' '));
      });
      if (!h.closest('.cin,.cin-stagger')) h.classList.add('cin');   // give it something to trigger on
    });
  }

  // (2) Parallax — a slow counter-drift on large media so the page has depth.
  var parallax = [];
  function initParallax() {
    if (innerWidth < 720) return;                       // phones: no spare frames
    document.querySelectorAll('img,.stage,[data-parallax]').forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (r.height < 180 || el.__par) return;
      el.__par = 1; el.classList.add('cin-par'); parallax.push(el);
    });
  }
  var parQueued = false;
  function onParScroll() {
    if (parQueued || !parallax.length) return;
    parQueued = true;
    requestAnimationFrame(function () {
      parQueued = false;
      var vh = innerHeight;
      parallax.forEach(function (el) {
        var r = el.getBoundingClientRect();
        if (r.bottom < -100 || r.top > vh + 100) return;
        var mid = (r.top + r.height / 2 - vh / 2) / vh;   // -1 .. 1
        el.style.transform = 'translate3d(0,' + (mid * -14).toFixed(1) + 'px,0)';
      });
    });
  }

  function boot() {
    observe();
    setTimeout(function () { enrich(); railify(); pinRails(); initParallax(); onParScroll(); }, 400);
    addEventListener('scroll', onParScroll, { passive: true });
    sweep();
    addEventListener('scroll', sweep, { passive: true });
    addEventListener('resize', sweep, { passive: true });
    // New content (these are apps, not just documents) gets tagged too.
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function () { observe(); enrich(); });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    // Hard deadline. Whatever happened, nothing stays invisible.
    setTimeout(bail, 4000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else { boot(); }

  // If anything above throws, reveal everything rather than ship a blank page.
  addEventListener('error', function (e) {
    if (e && e.filename && e.filename.indexOf('cinematic.js') !== -1) bail();
  });
})();
