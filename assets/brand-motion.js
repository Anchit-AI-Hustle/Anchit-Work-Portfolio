/* Brand motion layer, Gram Street Coffee and Deli Chic.
 *
 * Three effects, all of them meant to be NOTICED:
 *   1. headlines arrive word by word, tipped back in 3D
 *   2. CTAs are magnetic and tilt toward the cursor
 *   3. marked layers drift at their own depth as you scroll
 *
 * There was a fourth, sections leaning and squashing with scroll velocity,
 * and it is gone. See the note where it used to live, below.
 *
 * Self-hosted GSAP + ScrollTrigger from /assets/vendor, no CDN, and the same
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
    // A heading painted with background-clip:text (a gradient or chrome fill)
    // cannot be split: each word span gets its own transform, drops out of the
    // parent's clip and inherits the transparent fill, so the whole heading
    // vanished ("Lilac glass. Chrome accents." was a blank band). Leave it.
    // Nor a visually hidden heading (.sr-only): there is nothing to watch,
    // and its words would sit at opacity 0 forever in a 1px box.
    if (el.classList.contains('sr-only') || el.offsetHeight <= 1) return [];
    var cs = getComputedStyle(el);
    if ((cs.webkitBackgroundClip || cs.backgroundClip) === 'text' || cs.backgroundClip === 'text') return [];
    el.dataset.split = '1';
    el.textContent = '';
    return text.split(' ').map(function (word) {
      var outer = document.createElement('span');
      outer.className = 'bm-w';
      outer.style.display = 'inline-block';
      outer.style.overflow = 'hidden';
      outer.style.verticalAlign = 'top';
      // The mask is only needed while the word rises into it. Padding the
      // box below the baseline (and pulling the line back up by the same
      // amount) keeps descenders inside it: at line-height 1 a bare mask cut
      // the tails off g, p and y for good ("Discerning", "Alchemy").
      outer.style.paddingBottom = '0.16em';
      outer.style.marginBottom = '-0.16em';
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

      // Perspective on the heading, not on :root, a custom property or a
      // transform on the root invalidates every element on the page.
      h.style.perspective = '700px';

      // Driven by IntersectionObserver rather than ScrollTrigger. A heading
      // already past its start point when ScrollTrigger was created kept the
      // "from" state and never played, which left headings sitting tipped
      // back and invisible, i.e. worse than no animation at all. An observer
      // fires on what is on screen NOW and cannot get this wrong.
      gsap.set(words, { yPercent: 115, rotateX: -78, opacity: 0 });

      var play = function () {
        if (h.dataset.bmPlayed === '1') return;
        h.dataset.bmPlayed = '1';
        words.forEach(function (w) { w.style.willChange = 'transform, opacity'; });
        gsap.to(words, {
          yPercent: 0, rotateX: 0, opacity: 1,
          duration: 0.95, ease: 'power3.out', stagger: 0.045,
          onComplete: function () {
            // Off at rest: a layer left promoted costs memory for nothing.
            words.forEach(function (w) {
              w.style.willChange = '';
              // Release the mask once the word has landed, so nothing at rest
              // is ever clipped, whatever the line-height.
              if (w.parentNode) w.parentNode.style.overflow = '';
            });
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

      // Safety net: if the observer never reports a heading that IS on screen
      // (display quirks), play it rather than leave it hidden. Only one that
      // is on screen: this used to fire for every heading on the page, so
      // everything below the fold had already played, unseen, three seconds
      // after load, and the entrance was never once seen past the hero.
      // bmPlayed was also never set, so the guard it read could not work.
      setTimeout(function () {
        if (h.dataset.bmPlayed === '1') return;
        var r = h.getBoundingClientRect();
        if (r.bottom > 0 && r.top < (window.innerHeight || 0)) { io.disconnect(); play(); }
      }, 3000);
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

      // GSAP now writes an inline transform on every pointer move. A CSS
      // transition on transform (Tailwind's transition-all, mostly) eased each
      // of those writes a second time, so the button trailed the cursor, and
      // the inline transform silently cancelled the element's hover:scale-*.
      // Keep the colour transitions, hand transform to GSAP alone, and play
      // the hover scale through GSAP too.
      var tp = getComputedStyle(b).transitionProperty || '';
      if (/(^|,\s*)(all|transform)(\s*,|$)/.test(tp)) {
        b.style.transitionProperty = 'color, background-color, border-color, box-shadow, opacity, filter';
      }
      var hs = /(?:^|\s)hover:scale-(\d+)(?:\s|$)/.exec(b.className && b.className.baseVal === undefined ? b.className : '');
      var hoverScale = hs ? parseInt(hs[1], 10) / 100 : 1;

      b.addEventListener('pointerenter', function () {
        b.style.willChange = 'transform';
        gsap.set(b, { transformPerspective: 600, transformOrigin: 'center' });
        if (hoverScale !== 1) gsap.to(b, { scale: hoverScale, duration: 0.2, ease: 'power2.out', overwrite: 'auto' });
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
        if (hoverScale !== 1) gsap.to(b, { scale: 1, duration: 0.25, ease: 'power2.out', overwrite: 'auto' });
        setTimeout(function () { b.style.willChange = ''; }, 420);
      });
    });
  }

  /* 3 ─ Depth drift ---------------------------------------------------------- */
  // The only ScrollTrigger-bound tween in this file, and opt-in: it moves the
  // elements carrying [data-bm-depth] and nothing else. No page currently marks
  // any, so neither brand page loads ScrollTrigger (43 KB) any more, both were
  // fetching and registering the plugin for a tween with no targets. Marking a
  // layer means adding the plugin's <script> back to that page; without it this
  // returns instead of handing GSAP a scrollTrigger config it cannot honour.
  function depth(gsap) {
    if (reduced) return;
    var layers = pick('[data-bm-depth]');
    if (!layers.length) return;
    if (!window.ScrollTrigger) return;
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
