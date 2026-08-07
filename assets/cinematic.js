/* cinematic.js — sequential section reveal, shared across every page.
 *
 * One idea: a page performs itself top-to-bottom, one section at a time, on a
 * steady beat. Sections never arrive in a clump, even when several enter the
 * viewport together or the page loads already scrolled.
 *
 * Why a queue rather than per-element transition delays: delays are fixed at
 * author time and can't know what is actually on screen. A visitor who lands
 * mid-page, or resizes, or has three short sections visible at once, would get
 * either a pile-up or dead waiting. The queue sorts whatever has genuinely
 * arrived into document order and releases on a beat, so the sequence is always
 * correct for what the visitor is really looking at.
 *
 * Self-contained: no dependencies, no build step, safe to include twice.
 * Pairs with cinematic.css.
 */
(function () {
  'use strict';
  if (window.__cinematicLoaded) return;      // included twice — harmless
  window.__cinematicLoaded = true;

  var root = document.documentElement;

  // Same preference order the rest of the site uses: an explicit choice wins,
  // otherwise the OS accessibility signal decides.
  function motionAllowed() {
    try {
      var m = localStorage.getItem('anchit-motion');
      if (m === 'on') return true;
      if (m === 'off') return false;
    } catch (e) { /* storage blocked */ }
    return !matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Finding the sections is the whole problem, because these pages are not built
  // alike: most have no <section> element at all, just one wrapper div holding
  // everything. So detection is structural rather than tag-based — find the
  // element that actually hosts the page's content blocks, and sequence its
  // direct children.
  var HOSTS = ['main', '.wrap', '.container', '.page', '#app', '#root', 'body'];

  function usable(el) {
    if (!el || el.nodeType !== 1) return false;
    if (/^(SCRIPT|STYLE|LINK|META|NOSCRIPT|TEMPLATE|CANVAS|SVG)$/i.test(el.tagName)) return false;
    var cs;
    try { cs = getComputedStyle(el); } catch (e) { return false; }
    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
    // Anything pinned to the viewport is chrome, not a section — and animating
    // a transform on it would break the pinning, because a transformed element
    // becomes the containing block for its fixed/sticky descendants.
    if (cs.position === 'fixed' || cs.position === 'sticky') return false;
    if (el.querySelector && el.querySelector('[style*="sticky"], .sticky')) return false;
    return el.getBoundingClientRect().height >= 40;   // skip rails and spacers
  }

  // Walk down until a level actually holds the page's blocks. These pages nest
  // differently — some put content straight in .wrap, others bury it a div or
  // two deeper — so a fixed depth guesses wrong. Fewer than three blocks at a
  // level means it is a wrapper, not the content, so it descends into the
  // tallest child and looks again, keeping the best level found.
  function pickFrom(host, depth) {
    if (!host || depth > 3) return [];
    var kids = [].filter.call(host.children, usable);
    if (kids.length >= 3) return kids;
    var tallest = kids.slice().sort(function (a, b) {
      return b.getBoundingClientRect().height - a.getBoundingClientRect().height;
    })[0];
    if (!tallest) return kids;
    var deeper = pickFrom(tallest, depth + 1);
    return deeper.length >= 3 ? deeper : kids;    // keep whichever is richer
  }

  function findSections() {
    // An explicit marking always wins.
    var explicit = [].slice.call(document.querySelectorAll('[data-cine]'));
    if (explicit.length) return explicit;

    for (var i = 0; i < HOSTS.length; i++) {
      var found = pickFrom(document.querySelector(HOSTS[i]), 0);
      if (found.length >= 2) return found;        // two blocks still sequence
    }
    return [];
  }

  function start() {
    if (!motionAllowed()) { root.classList.add('cine-static'); return; }

    var nodes = findSections();
    // Drop anything nested inside another candidate: only the outermost section
    // should be sequenced, or a parent and its child both animate and the child
    // appears to arrive twice.
    nodes = nodes.filter(function (el) {
      return !nodes.some(function (other) { return other !== el && other.contains(el); });
    });
    if (!nodes.length) return;

    root.classList.add('cine-on');
    nodes.forEach(function (el) { el.classList.add('cine-section'); });

    var STEP_MS = 120;                     // beat between consecutive sections
    var queue = [], releasing = false;

    function inDocOrder(a, b) {
      var pos = a.compareDocumentPosition(b);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
      if (pos & Node.DOCUMENT_POSITION_PRECEDING) return 1;
      return 0;
    }
    function enqueue(el) {
      if (el.__cineQueued || el.classList.contains('cine-in')) return;
      el.__cineQueued = true;
      queue.push(el);
      if (!releasing) { releasing = true; requestAnimationFrame(release); }
    }
    function release() {
      // Re-sorted every beat: more sections may have queued since the last
      // release, and a later arrival can sit above an earlier one.
      queue.sort(inDocOrder);
      var el = queue.shift();
      if (!el) { releasing = false; return; }
      el.classList.add('cine-in');
      setTimeout(release, STEP_MS);
    }

    // ── Deciding when a section has been reached ─────────────────────────────
    // Deliberately NOT IntersectionObserver alone. A section that never fires an
    // intersection — because the page loaded already scrolled past it, or it sits
    // in the footer below the last scroll stop, or it was resized to zero height
    // and back — would stay at opacity 0 permanently. That is content the visitor
    // can never read, which is far worse than an unanimated section.
    //
    // So the test is positional and re-run on scroll: anything whose top has
    // entered the lower viewport counts as reached, including everything already
    // above it. Nothing can be skipped, and there is no state to get stuck in.
    var pending = nodes.slice();
    var ticking = false;

    function sweep() {
      ticking = false;
      // Once the page cannot scroll any further, everything still pending is as
      // "reached" as it will ever be, so the threshold is dropped entirely.
      // Without this, a section just below the fold on a barely-scrollable page
      // can never cross the line: agent.html is 948px tall in an 880px viewport,
      // so its footer topped out at 822px and stayed invisible.
      var doc = document.documentElement;
      var atEnd = (window.innerHeight + (window.scrollY || doc.scrollTop || 0)) >= (doc.scrollHeight - 2);
      var limit = atEnd ? Infinity : window.innerHeight * 0.92;
      for (var i = pending.length - 1; i >= 0; i--) {
        var el = pending[i];
        var top;
        try { top = el.getBoundingClientRect().top; } catch (e) { top = 0; }
        if (top < limit) {
          enqueue(el);
          pending.splice(i, 1);
        }
      }
      if (!pending.length) {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
      }
    }
    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(sweep);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    sweep();                                   // whatever is on screen at load

    // Last resort: if a section is somehow still hidden a while after load — a
    // lazy layout, a panel that was never opened — show it rather than leave it
    // dark. With the end-of-page rule above this should never fire; it exists so
    // that no failure mode ends in unreadable content.
    setTimeout(function () {
      pending.forEach(enqueue);
      pending.length = 0;
    }, 4000);

    // A section that is added later (tab switch, async render) still gets
    // sequenced rather than appearing flat.
    window.addEventListener('cinematic:refresh', function () {
      try {
        findSections().forEach(function (el) {
          if (el.classList.contains('cine-section')) return;
          el.classList.add('cine-section');
          pending.push(el);
        });
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();
      } catch (e) { /* ignore */ }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
