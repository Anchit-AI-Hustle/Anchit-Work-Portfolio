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
  if (root.getAttribute('data-motion') === 'off') return;   // calm mode: do nothing at all

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
    'html.cin-bail .cin,html.cin-bail .cin-stagger>*{opacity:1!important;transform:none!important;transition:none!important}'
  ].join('');
  (document.head || root).appendChild(css);

  var SKIP = 'input,textarea,select,button,canvas,svg,iframe,video,audio,' +
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

  function tag(scope) {
    var host = scope || document.body;
    if (!host) return;

    // Blocks: direct content children of the page's main containers.
    var containers = host.querySelectorAll(
      'main,section,article,.container,.wrap,.content,.page,.shell,.panel,.card-grid,.grid');
    var seen = [];
    Array.prototype.forEach.call(containers, function (c) {
      Array.prototype.forEach.call(c.children, function (el) { seen.push(el); });
    });
    if (!seen.length && host.children) {
      Array.prototype.forEach.call(host.children, function (el) { seen.push(el); });
    }

    seen.forEach(function (el) {
      if (el.__cin || el.classList.contains('cin') || el.classList.contains('cin-stagger')) return;
      if (skip(el)) return;
      var r = el.getBoundingClientRect();
      if (r.height < 36 || r.width < 60) return;                 // rules, spacers, icons
      // A container of cards cascades its children; anything else arrives whole.
      var kids = Array.prototype.filter.call(el.children, function (c) {
        var cr = c.getBoundingClientRect();
        return cr.height > 40 && cr.width > 60;
      });
      var s = getComputedStyle(el);
      var gridish = /grid|flex/.test(s.display);
      var cardKids = kids.filter(boxLike);
      el.classList.add((gridish && kids.length >= 2) || cardKids.length >= 2 ? 'cin-stagger' : 'cin');
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

  function boot() {
    observe();
    sweep();
    addEventListener('scroll', sweep, { passive: true });
    addEventListener('resize', sweep, { passive: true });
    // New content (these are apps, not just documents) gets tagged too.
    if ('MutationObserver' in window) {
      var mo = new MutationObserver(function () { observe(); });
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
