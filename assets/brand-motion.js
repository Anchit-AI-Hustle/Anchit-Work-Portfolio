/* Brand motion layer — Gram Street Coffee and Deli Chic.
 *
 * Three effects, all of them meant to be NOTICED:
 *   1. headlines arrive word by word, tipped back in 3D
 *   2. CTAs are magnetic and tilt toward the cursor
 *   3. marked layers drift at their own depth as you scroll
 *
 * There was a fourth — sections leaning and squashing with scroll velocity —
 * and it is gone. See the note where it used to live, below.
 *
 * Self-hosted GSAP + ScrollTrigger from /assets/vendor — no CDN, and the same
 * copies the rest of the site uses.
 *
 * House rules this obeys (CLAUDE.md earned each of them the hard way):
 *   - GSAP owns `transform` on anything it drives. Where CSS also needs to move
 *     an element, this uses the separate `translate` / `rotate` properties,
 *     which compose instead of overwriting.
 *   - `will-change` goes on when an animation starts and comes off at rest.
 *   - Nothing decorative runs off screen: every tween is ScrollTrigger-bound,
 *     and the velocity loop parks itself when the page is hidden or idle.
 *   - prefers-reduced-motion gets the finished state immediately, never a
 *     half-played one.
 *   - Lenis is deliberately NOT used here: both pages declare
 *     `scroll-behavior: smooth`, which fights it, and native scroll is all
 *     ScrollTrigger needs.
 */
(function () {
  'use strict';

  var reduced = window.matchMedia &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  // --- element selection -----------------------------------------------------
  // Opt-in by attribute so a page chooses what moves, with a sensible default
  // set for pages that mark nothing.
  function pick(sel, fallback) {
    var found = document.querySelectorAll(sel);
    if (found.length) return Array.prototype.slice.call(found);
    return fallback ? Array.prototype.slice.call(document.querySelectorAll(fallback)) : [];
  }

  /* 1 ─ Word-by-word 3D headline entrance ----------------------------------- */
  function splitWords(el) {
    if (el.dataset.split === '1') return [];
    // Only split plain text. A heading carrying markup keeps its markup.
    var text = el.textContent.replace(/\s+/g, ' ').trim();
    if (!text || el.children.length) return [];
    el.dataset.split = '1';
    el.textContent = '';
    return text.split(' ').map(function (word) {
      var outer = document.createElement('span');
      outer.className = 'bm-w';
      outer.style.display = 'inline-block';
      outer.style.overflow = 'hidden';
      outer.style.verticalAlign = 'top';
      var inner = document.createElement('span');
      inner.className = 'bm-wi';
      inner.style.display = 'inline-block';
      // NOT promoted here. Splitting happens for every heading on the page at
      // once, while most of them are still far below the fold - setting
      // will-change at split time left dozens of words holding a compositor
      // layer each, for minutes, waiting for a scroll that may never come.
      // It goes on in play(), one heading at a time, and comes off again.
      inner.textContent = word;
      outer.appendChild(inner);
      el.appendChild(outer);
      el.appendChild(document.createTextNode(' '));
      return inner;
    });
  }

  function headlines(gsap) {
    var heads = pick('[data-bm="head"]', 'h1, h2');
    heads.forEach(function (h) {
      var words = splitWords(h);
      if (!words.length) return;

      if (reduced) {
        gsap.set(words, { clearProps: 'all' });
        words.forEach(function (w) { w.style.willChange = ''; });
        return;
      }

      // Perspective on the heading, not on :root — a custom property or a
      // transform on the root invalidates every element on the page.
      h.style.perspective = '700px';

      // Driven by IntersectionObserver rather than ScrollTrigger. A heading
      // already past its start point when ScrollTrigger was created kept the
      // "from" state and never played — which left headings sitting tipped
      // back and invisible, i.e. worse than no animation at all. An observer
      // fires on what is on screen NOW and cannot get this wrong.
      gsap.set(words, { yPercent: 115, rotateX: -78, opacity: 0 });

      var play = function () {
        words.forEach(function (w) { w.style.willChange = 'transform, opacity'; });
        gsap.to(words, {
          yPercent: 0, rotateX: 0, opacity: 1,
          duration: 0.95, ease: 'power3.out', stagger: 0.045,
          onComplete: function () {
            // Off at rest: a layer left promoted costs memory for nothing.
            words.forEach(function (w) { w.style.willChange = ''; });
            h.style.perspective = '';
          }
        });
      };

      if (typeof IntersectionObserver === 'undefined') { play(); return; }
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        io.disconnect();
        play();
      }, { threshold: 0.15 });
      io.observe(h);

      // Safety net: if nothing ever observes it (display quirks, print), make
      // sure the words are never left in the hidden start state.
      setTimeout(function () {
        if (h.dataset.bmPlayed) return;
        if (parseFloat(getComputedStyle(words[0]).opacity) < 0.05) { io.disconnect(); play(); }
      }, 3000);
      h.dataset.bmPlayed = '';
    });
  }

  /* (removed) Scroll-velocity lean.
     Sections used to skew and squash with scroll speed. On a real page it does
     not read as craft, it reads as the page being rendered wrong, so it is
     gone rather than tuned. */

  /* 2 ─ Magnetic, tilting CTAs ---------------------------------------------- */
  function magnetic(gsap) {
    if (reduced) return;
    if (window.matchMedia && window.matchMedia('(hover: none)').matches) return;

    var btns = pick('[data-bm="magnet"]',
      '.btn, .cbtn, a.big, button.go, .deli-cta, .deli-btn, .cta, a[class*="bg-[#CD2653]"], button[class*="bg-[#CD2653]"]');
    btns.forEach(function (b) {
      if (b.dataset.bmMagnet === '1') return;
      b.dataset.bmMagnet = '1';
      var qx = gsap.quickTo(b, 'x', { duration: 0.4, ease: 'power3.out' });
      var qy = gsap.quickTo(b, 'y', { duration: 0.4, ease: 'power3.out' });
      var qrx = gsap.quickTo(b, 'rotateX', { duration: 0.4, ease: 'power3.out' });
      var qry = gsap.quickTo(b, 'rotateY', { duration: 0.4, ease: 'power3.out' });

      b.addEventListener('pointerenter', function () {
        b.style.willChange = 'transform';
        gsap.set(b, { transformPerspective: 600, transformOrigin: 'center' });
      });
      b.addEventListener('pointermove', function (e) {
        var r = b.getBoundingClientRect();
        var dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        var dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        qx(dx * 9); qy(dy * 6);
        qry(dx * 11); qrx(-dy * 9);
      });
      b.addEventListener('pointerleave', function () {
        qx(0); qy(0); qrx(0); qry(0);
        setTimeout(function () { b.style.willChange = ''; }, 420);
      });
    });
  }

  /* 3 ─ Depth drift ---------------------------------------------------------- */
  function depth(gsap) {
    if (reduced) return;
    var layers = pick('[data-bm-depth]');
    layers.forEach(function (el) {
      var amt = parseFloat(el.getAttribute('data-bm-depth')) || 12;
      gsap.fromTo(el,
        { yPercent: -amt },
        {
          yPercent: amt, ease: 'none',
          scrollTrigger: {
            trigger: el.closest('section') || el,
            start: 'top bottom', end: 'bottom top', scrub: 0.6
          }
        }
      );
    });
  }

  /* boot --------------------------------------------------------------------- */
  ready(function () {
    var gsap = window.gsap;
    if (!gsap) return;                       // page renders fine without any of this
    if (window.ScrollTrigger) gsap.registerPlugin(window.ScrollTrigger);

    try { headlines(gsap); } catch (e) {}
    try { magnetic(gsap); } catch (e) {}
    try { depth(gsap); } catch (e) {}
  });
})();
