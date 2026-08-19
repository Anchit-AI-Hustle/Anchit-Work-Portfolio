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
    place(btn);
  }

  // Bottom-left is only the FIRST choice. This runtime is added to pages it did
  // not design, and some of them already own that corner — on the marketing
  // course it landed on top of two chapter links and a Library button, which
  // the toggle then covered and made unreachable. So it asks what is already
  // there and moves if the spot is taken. Measured once, after layout, with
  // elementFromPoint at the corners it is considering.
  function place(btn) {
    // The toggle has to be taken OUT of hit-testing while it looks, or
    // elementFromPoint just returns the toggle and every corner reads as free —
    // which is exactly how the first version of this decided the occupied
    // corner was fine and stayed there.
    function occupied(x, y) {
      var el = document.elementFromPoint(x, y);
      if (!el || el === btn || btn.contains(el)) return false;
      return !!(el.closest && el.closest('a, button, input, select, textarea, [role="button"], [onclick]'));
    }
    requestAnimationFrame(function () {
      var pe = btn.style.pointerEvents;
      btn.style.pointerEvents = 'none';
      try { choose(); } finally { btn.style.pointerEvents = pe; }
    });
    function choose() {
      var r = btn.getBoundingClientRect();
      var pad = 14, w = r.width || 92, h = r.height || 26;
      var spots = [
        { l: pad,                    b: pad },                       // bottom-left, as authored
        { l: innerWidth - w - pad,   b: pad },                       // bottom-right
        { l: pad,                    b: pad + h + 10 },              // one row up on the left
        { l: innerWidth - w - pad,   b: pad + h + 10 }               // one row up on the right
      ];
      for (var i = 0; i < spots.length; i++) {
        var s = spots[i];
        var cx = s.l + w / 2, cy = innerHeight - s.b - h / 2;
        if (cx < 0 || cy < 0) continue;
        // sample the middle and both ends, so a wide neighbour is not missed
        if (!occupied(cx, cy) && !occupied(s.l + 4, cy) && !occupied(s.l + w - 4, cy)) {
          btn.style.left = s.l + 'px';
          btn.style.right = 'auto';
          btn.style.bottom = s.b + 'px';
          return;
        }
      }
      // Every candidate is taken: sit above the last one rather than on a control.
      btn.style.left = 'auto';
      btn.style.right = pad + 'px';
      btn.style.bottom = (pad + (h + 10) * 2) + 'px';
    }
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
      'transition-delay:var(--cin-d,0s)}',
    '.cin-stagger>*{opacity:0;transform:translateY(18px);' +
      'transition:opacity .6s cubic-bezier(.16,1,.3,1),transform .6s cubic-bezier(.16,1,.3,1);' +
      'transition-delay:var(--cin-cd,0s)}',
    // .cin-stagger.cin-in itself, not only its children — see the note below.
    '.cin.cin-in,.cin-stagger.cin-in,.cin-stagger.cin-in>*{opacity:1;transform:none}',

    // Six distinct entrances, not one repeated. A page where every block does
    // the same thing reads as a template filling itself in; blocks that arrive
    // differently read as a sequence that was directed. Each variant only ever
    // sets transform and opacity, so they cost the same as the plain rise did.
    // Assigned so that no block matches the one before or after it (see
    // variantFor) rather than cycling 1..6, which is its own visible pattern.
    // Six entrances, each of them actually dimensional: every one carries its
    // own perspective and moves through Z, so a block arrives from somewhere in
    // space rather than sliding in on the flat. The perspective is written into
    // each transform rather than relying on an ancestor, because these are
    // applied to blocks all over the site and most of their parents are not
    // 3D contexts.
    //
    // Perspective values differ on purpose — a shorter one is a wider lens and
    // a more violent arrival — so a hinge and a swing do not read as the same
    // move at two angles.
    '.cin-v1{transform:perspective(1100px) translate3d(0,34px,-140px) rotateX(14deg)}',      // hinge up off the floor
    '.cin-v2{transform:perspective(900px)  translate3d(-58px,0,-120px) rotateY(-26deg)}',    // swing in, left
    '.cin-v3{transform:perspective(900px)  translate3d(58px,0,-120px)  rotateY(26deg)}',     // swing in, right
    '.cin-v4{transform:perspective(1400px) translate3d(0,0,-420px)}',                        // arrive out of depth
    '.cin-v5{transform:perspective(1000px) translate3d(0,26px,-90px) rotateX(10deg) rotateZ(-2.5deg)}', // tilt-roll
    '.cin-v6{transform:perspective(760px)  translate3d(0,-30px,-150px) rotateX(-24deg)}',    // drop from above

    // On a narrow screen there is no room to come in from the side. A block is
    // the full width of a phone, so holding it 58px to the left puts its first
    // characters past the edge — which is what a card mid-reveal looked like at
    // 390px: "Building the lifecycle OS" reading as "uilding". The sideways
    // entrances become short ones, and the deep push-back eases off too,
    // because at this width it shrinks a block enough to read as a glitch
    // rather than as depth.
    '@media (max-width:560px){' +
      '.cin-v2{transform:perspective(900px) translate3d(-16px,0,-70px) rotateY(-12deg)}' +
      '.cin-v3{transform:perspective(900px) translate3d(16px,0,-70px) rotateY(12deg)}' +
      '.cin-v4{transform:perspective(1400px) translate3d(0,0,-180px)}' +
      '.cin-v6{transform:perspective(760px) translate3d(0,-22px,-90px) rotateX(-16deg)}' +
    '}',
    // Scoped to .cin only, this left every .cin-stagger element that had been
    // given a variant parked at its entrance transform FOREVER: the variant
    // rules above match any element carrying .cin-vN, but nothing here cleared
    // it unless the element also had .cin. That is why the sidebar sat at a
    // permanent rotateX and .cw-body at a permanent rotateY — visible as a
    // skewed panel whose children each projected to a different height under
    // the ancestor's perspective. Match on .cin-in plus the variant, whichever
    // container class carries it.
    '.cin-in.cin-v1,.cin-in.cin-v2,.cin-in.cin-v3,' +
      '.cin-in.cin-v4,.cin-in.cin-v5,.cin-in.cin-v6{transform:none}',
    '.cin-anim,.cin-anim>*{will-change:opacity,transform}',
    // Anything still hidden when the deadline passes is shown outright.
    // Richer vocabulary. Depth for feature cards, a lift for parallax elements,
    // and word-level reveal for headings.
    //
    // Depth is a deeper scale + rise, not a blur. An animating `filter: blur()`
    // cannot run on the compositor — the element is re-rasterised on every
    // frame of the tween — and the resting state holds a render surface on
    // every card still waiting to arrive. A whole page of feature cards paid
    // that at once on the first scroll.
    '.cin-depth{opacity:0;transform:scale(.94) translateY(22px);' +
      'transition:opacity .8s cubic-bezier(.16,1,.3,1),transform .8s cubic-bezier(.16,1,.3,1);' +
      'transition-delay:var(--cin-d,0s)}',
    '.cin-depth.cin-in{opacity:1;transform:none}',
    '.cin-word{display:inline-block;opacity:0;transform:translateY(.5em) rotate(1.5deg);' +
      'transition:opacity .5s cubic-bezier(.16,1,.3,1),transform .5s cubic-bezier(.16,1,.3,1);' +
      'transition-delay:var(--cin-wd,0s)}',
    '.cin-in .cin-word,.cin-word.cin-in,.in .cin-word,.reveal.in .cin-word{opacity:1;transform:none}',
    '.cin-par{will-change:transform}',
    // Controls and fields inside an arriving card ride in just behind it.
    '.cin-in .cin-ctl,.in .cin-ctl{animation:cinCtl .5s cubic-bezier(.16,1,.3,1) both;animation-delay:var(--cin-cd,.18s)}',
    '@keyframes cinCtl{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}',
    'html.cin-bail .cin,html.cin-bail .cin-stagger>*,html.cin-bail .cin-depth,html.cin-bail .cin-word' +
      '{opacity:1!important;transform:none!important;filter:none!important;transition:none!important}',

    // ── futurist layer, on every page rather than only the homepage ──
    // A holographic sheen crosses a block as it arrives. A block that only
    // fades in has no surface; a light travelling over it says the block is a
    // panel catching a source somewhere off-frame. One pass, on arrival only —
    // transform and opacity, so it is compositor work and costs no repaint.
    '@keyframes cinSheen{from{transform:translate3d(-130%,0,0) skewX(-14deg);opacity:0}' +
      '18%{opacity:1}to{transform:translate3d(130%,0,0) skewX(-14deg);opacity:0}}',
    '.cin-sheen{position:relative}',
    '.cin-sheen>.cin-sheen-l{position:absolute;inset:0;z-index:4;pointer-events:none;' +
      'border-radius:inherit;opacity:0;background:linear-gradient(100deg,transparent 40%,' +
      'rgba(255,183,54,.16) 50%,transparent 60%)}',
    '.cin-sheen.cin-in>.cin-sheen-l,.cin-in .cin-sheen>.cin-sheen-l' +
      '{animation:cinSheen 1.15s cubic-bezier(.16,1,.3,1) .16s 1 both}',

    // A specular highlight that tracks the pointer across a panel. --mx/--my
    // are written on the ELEMENT, never on :root — a custom property on the
    // document root re-resolves the computed style of every element on the
    // page, once per pointer frame.
    '.cin-spec-host{position:relative}',
    '.cin-spec{position:absolute;inset:0;z-index:3;pointer-events:none;border-radius:inherit;' +
      'opacity:0;transition:opacity .35s ease;background:radial-gradient(220px circle at ' +
      'var(--mx,50%) var(--my,50%),rgba(255,183,54,.16),transparent 70%)}',
    '.cin-spec-host:hover>.cin-spec{opacity:1}',
    // Not every page has panels. The tool pages are dense UI — their blocks are
    // 30-70px headings, labels and rows — and a light sweeping across a 44px
    // label is noise rather than an effect. Those get an edge draw instead: a
    // hairline that wipes along the block's baseline as it arrives. Same
    // vocabulary, scaled to what is actually there, so no page is left with
    // nothing.
    '@keyframes cinEdge{from{transform:scaleX(0)}to{transform:scaleX(1)}}',
    '.cin-edge{position:relative}',
    '.cin-edge>.cin-edge-l{position:absolute;left:0;right:0;bottom:-1px;height:1px;' +
      'pointer-events:none;transform-origin:0 50%;transform:scaleX(0);' +
      'background:linear-gradient(90deg,rgba(255,183,54,.55),rgba(255,105,64,.25) 60%,transparent)}',
    '.cin-edge.cin-in>.cin-edge-l,.cin-in .cin-edge>.cin-edge-l' +
      '{animation:cinEdge .62s cubic-bezier(.16,1,.3,1) .1s both}',
    'html[data-motion="off"] .cin-spec,html[data-motion="off"] .cin-sheen-l,' +
      'html[data-motion="off"] .cin-edge-l{display:none}'
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

  // index.html carries an older inline reveal system. This runtime must not
  // double-animate what that already owns, so anything it has claimed counts as
  // covered and is left completely alone. That makes the two safe to run side
  // by side: this one fills only the gaps.
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

    // Pass 3 — structural blocks that are not card-like at all.
    //
    // Passes 1 and 2 only recognise grids and boxes (border, background or
    // shadow). That left whole pages untouched: hotel's six <section class=
    // "scene"> blocks scored 0/6, and the plain wrapper divs on the lifecycle
    // tool pages 0-50%. A block is a block whether or not it has a border, so
    // any section-sized container that nothing else has claimed now arrives on
    // its own beat — which is what makes the page progressive rather than a
    // few animated cards floating in a static layout.
    Array.prototype.forEach.call(
      host.querySelectorAll('section,article,main>div,.container>div,.wrap>div,.shell>div,.page>div'),
      function (el) {
        if (covered(el) || skip(el)) return;
        var r = el.getBoundingClientRect();
        if (r.height < 60 || r.width < 120) return;
        // If something inside is already choreographed, let that carry the
        // section — animating both would fade the same content twice.
        if (el.querySelector('.cin,.cin-stagger,.reveal,.reveal-stagger')) return;
        if (!(el.textContent || '').trim()) return;          // spacers and rules
        el.classList.add('cin');
        el.__cin = 1;
      }
    );

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

  // Which entrance a block gets. Deterministic from its position in the
  // document, and chosen so a block never matches its neighbour: cycling
  // 1..6 in order is a pattern people see after two screens, and random
  // assignment lets the same variant land twice in a row.
  var vSeq = 0, vLast = 0;
  function variantFor() {
    var v = 1 + ((vSeq * 2 + Math.floor(vSeq / 3)) % 6);
    if (v === vLast) v = 1 + (v % 6);
    vSeq++; vLast = v;
    return 'cin-v' + v;
  }

  // ── turn by turn ────────────────────────────────────────────────────────
  // Blocks used to arrive in bursts: everything that crossed the threshold in
  // the same frame animated together, separated only by a CSS delay. Six things
  // moving at once is a page loading, not a sequence.
  //
  // They queue instead, and each one waits for the one before it. The gap
  // tightens as the queue grows, because "one at a time" must never turn into
  // "content you cannot read yet": a long page scrolled quickly can put twenty
  // blocks on screen at once, and twenty times a comfortable gap is twenty
  // seconds of hidden text. Anything that has waited too long gives up its turn
  // and simply appears.
  var queue = [], draining = false;
  var GAP_MIN = 55, GAP_MAX = 190, PATIENCE = 1100;

  // The gap is enforced across bursts, not just inside one.
  //
  // The first version called drain() straight from enqueue() whenever it was
  // not already draining — and because each drain emptied the queue and cleared
  // the flag, a loop of enqueues found it idle every time and revealed each one
  // SYNCHRONOUSLY. Measured: thirteen blocks all landing at 309ms, which is the
  // burst the queue exists to prevent. Remembering when the last one played is
  // what makes the spacing real.
  var lastAt = 0;

  function enqueue(el) {
    if (el.classList.contains('cin-in') || el.__cinQueued) return;
    el.__cinQueued = performance.now();
    queue.push(el);
    schedule();
  }

  function gapFor() {
    var now = performance.now();
    if (queue.length && (now - queue[0].__cinQueued) > PATIENCE) return 16;
    return queue.length > 10 ? GAP_MIN
         : queue.length > 4  ? Math.round((GAP_MIN + GAP_MAX) / 2)
         : GAP_MAX;
  }

  function schedule() {
    if (draining) return;
    draining = true;
    setTimeout(drain, Math.max(0, gapFor() - (performance.now() - lastAt)));
  }

  function drain() {
    var el = queue.shift();
    while (el && el.classList.contains('cin-in')) el = queue.shift();
    if (!el) { draining = false; return; }
    reveal(el);
    lastAt = performance.now();
    // The more that is waiting, the less each one waits.
    // Still one at a time when it is behind, just faster: a block past its
    // patience gets the next frame instead of the next beat, so a twenty-block
    // backlog drains in about a third of a second and still arrives in order.
    if (queue.length) setTimeout(drain, gapFor());
    else draining = false;
  }

  function reveal(el) {
    if (!el || el.classList.contains('cin-in')) return;
    // A variant is for a BLOCK, never for a container the size of the page.
    //
    // These entrances hold their element off-screen in three dimensions until
    // it plays — cin-v4 sits at translateZ(-420px). That is a nice arrival for
    // a card and a catastrophe for a page wrapper: tag() had classed a site's
    // root .app element as a stagger scope, so the whole document was pushed
    // back in Z and rendered as an empty screen until its turn came. Caught on
    // the marketing course, where .app is 12,193px tall and was sitting at
    // top: 1789px with nothing above it.
    //
    // Anything taller than the viewport is scenery rather than a card, and
    // keeps the plain rise it always had.
    var box = el.getBoundingClientRect();
    var blockSized = box.height > 0 && box.height <= window.innerHeight;
    if (blockSized && !/(^|\s)cin-v[1-6](\s|$)/.test(el.className)) el.classList.add(variantFor());
    el.style.setProperty('--cin-d', '0s');          // the queue is the timing now
    if (el.classList.contains('cin-stagger')) {
      // One child at a time, and far enough apart to see it.
      //
      // step() is sub-linear — sqrt-based — which was written to stop a long
      // row pile-up. For six children it produces 62, 88, 107, 124, 139 and
      // 152ms: a spread of ninety milliseconds, which the eye reads as all of
      // them arriving together. That is why the elements inside a block never
      // looked like they were taking turns.
      //
      // Linear spacing instead, tightened as the count grows so a twenty-item
      // grid does not take three seconds to finish: six children land across
      // 600ms and are unmistakably sequential, twenty across 900ms.
      var kids = el.children, n = kids.length;
      var gap = n > 12 ? 0.045 : n > 6 ? 0.08 : 0.12;
      Array.prototype.forEach.call(kids, function (c, i) {
        var d = (i * gap).toFixed(3) + 's';
        c.style.setProperty('--cin-cd', d);
        // …and set the delay itself, not only the variable it is read from.
        // `.cin-stagger>*` declares `transition-delay:var(--cin-cd)`, but any
        // child carrying its own `transition:` SHORTHAND resets delay back to
        // zero — the shorthand sets every longhand it does not mention. The
        // variable was landing correctly (0.000s, 0.120s, 0.240s…) while the
        // computed delay stayed 0 on most blocks, which is why the children
        // still arrived together. An inline delay outranks the shorthand.
        c.style.transitionDelay = d;
      });
    }
    el.classList.add('cin-anim', 'cin-in');
    // Release the compositor layer once the reveal is done; holding will-change
    // forever is what turned ~250 elements into permanent GPU layers.
    setTimeout(function () { el.classList.remove('cin-anim'); }, 1600);
  }

  function play(el) { enqueue(el); }

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
    // Also reach cards owned by the inline reveal system on index.html —
    // otherwise the flagship page is the one place with no controls choreography.
    document.querySelectorAll('.cin,.cin-stagger>*,.reveal,.reveal-stagger>*').forEach(function (card) {
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

  // ── Lenis: filmic scroll, ticked by GSAP ──────────────────────────────
  // Running Lenis on its own rAF while ScrollTrigger runs another means two
  // loops disagree about "now" and every scroll-triggered animation lands a
  // frame late — the exact jerkiness Lenis is added to remove. So Lenis is
  // ticked BY gsap.ticker where GSAP exists, and ScrollTrigger updates on
  // every Lenis scroll.
  // Runs `fn` once the document has been at the same scroll offset for three
  // consecutive frames — i.e. nothing is animating it any more. See initLenis
  // for why that is the test rather than "is a scroll event firing".
  window.__whenPageStill = function (fn) { whenPageStill(fn); };
  function whenPageStill(fn) {
    var lastY = -1, still = 0;
    (function step() {
      var y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y === lastY) still++; else { still = 0; lastY = y; }
      if (still < 3) return requestAnimationFrame(step);
      fn();
    })();
  }

  function initLenis() {
    if (motionOff || window.__lenis) return;
    if (typeof window.Lenis !== 'function') return;          // script not loaded: native scroll
    if (matchMedia('(pointer: coarse)').matches) return;     // touch already has momentum

    // Callers must reach this through whenPageStill (see boot). Starting while
    // the browser's own wheel animation is still travelling puts two engines on
    // the same frames, and the page visibly snaps backwards.
    //
    // `window.__scrolling` is not a strict enough test for that: it is driven
    // by scroll EVENTS, which go quiet while the animation is still running.
    // The document itself is the authority — three consecutive frames at the
    // same offset means nothing is moving it any more.
    var lenis = new window.Lenis({
      duration: 1.05,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); },
      smoothWheel: true
    });
    window.__lenis = lenis;

    // Keep Lenis's idea of the scroll and the document's from drifting apart.
    //
    // Lenis normally re-syncs itself when something else scrolls the page — it
    // listens for the scroll event and calls onNativeScroll. But it also sets
    // `preventNextNativeScrollEvent` after each of its own writes, so that it
    // does not treat its own output as somebody else's input. During the
    // handover from native scrolling that flag lands on the WRONG event: the
    // visitor's real wheel scroll arrives, gets swallowed as "ours", and Lenis
    // carries on animating from a position the page left several frames ago.
    //
    // The symptom was always the same size — exactly one wheel notch backwards,
    // caught by sampling scrollY once per rendered frame and traced to
    // Lenis.setScroll writing 0.199px while the document sat at 200px.
    //
    // reset() is Lenis's own remedy: it snaps its internal state to where the
    // document actually is. It is called once on start-up and then watched for
    // over the handover window, after which no native scrolling remains to
    // race with and the watchdog retires.
    try { lenis.reset(); } catch (e) {}

    // Correct the drift IN Lenis's own tick, immediately before it computes the
    // frame. An earlier version did this from a separate requestAnimationFrame
    // and still let ~4 runs in 14 jump: rAF callbacks run in registration
    // order, so the correction landed BEFORE Lenis's tick and Lenis simply
    // overwrote it with the stale tween value in the same frame. Fixing the
    // start position has to be the last thing that happens before the tween is
    // evaluated.
    var driftUntil = (window.performance && performance.now ? performance.now() : 0) + 2500;
    function fixDrift() {
      var now = window.performance && performance.now ? performance.now() : driftUntil + 1;
      if (now > driftUntil) return;                 // handover is over; stop paying for it
      try {
        var y = window.scrollY || document.documentElement.scrollTop || 0;
        // The wheel notch that lands as Lenis starts up is applied TWICE, and
        // reset() is what un-does the duplicate.
        //
        // Captured frame by frame, with every write to scrollTop traced:
        //
        //     779ms  scrollY   0   (Lenis not up yet)
        //     894ms  scrollY 200   animated   0   target 200
        //     895ms  Lenis.setScroll writes 0.2
        //     976ms  scrollY   0   <- the visitor is thrown back to the top
        //
        // The browser handled that notch itself (page -> 200) and Lenis also
        // counted it (target -> 200) while its own position was still 0, so it
        // began tweening 0 -> 200 across a page that had already arrived — and
        // its first written frame put the visitor back at the top.
        //
        // Assigning `animatedScroll` cannot fix it: Lenis's Animate object owns
        // the tween's start value and writes it back out on every frame, so an
        // external assignment is overwritten before it can be painted. reset()
        // is the supported way to say "you are here now", and because the
        // movement has ALREADY been applied natively, dropping the duplicate
        // target is exactly right rather than a lost scroll.
        //
        // Do not add an `if (!lenis.isScrolling)` guard here. It reads as the
        // obvious safety check and it can never be true: isScrolling is the
        // STRING 'smooth' while Lenis animates, so an earlier version of this
        // never ran at all.
        if (Math.abs(lenis.animatedScroll - y) > 4) lenis.reset();
      } catch (e) {}
    }

    if (window.gsap && window.ScrollTrigger) {
      lenis.on('scroll', window.ScrollTrigger.update);
      window.gsap.ticker.add(function (time) { fixDrift(); lenis.raf(time * 1000); });
      window.gsap.ticker.lagSmoothing(0);
    } else {
      var raf = function (t) { fixDrift(); lenis.raf(t); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);
    }
    // The rails intercept the wheel; Lenis must not fight them.
    document.querySelectorAll('[data-railed]').forEach(function (r) {
      r.setAttribute('data-lenis-prevent', '');
    });
  }

  // ── futurist surface treatments ───────────────────────────────────────
  // Applied to blocks this runtime has already decided are card-like, so it
  // inherits all of tag()'s judgement about what is a panel and what is prose,
  // instead of inventing a second opinion about it.
  function initSurfaces() {
    if (motionOff) return;
    // `.cin` is included, not just `.cin-depth` and grid children: five pages
    // came back with no treatment at all because tag() had classed their blocks
    // as plain sections. A block is a panel whether or not it happens to sit in
    // a grid.
    var cards = document.querySelectorAll('.cin, .cin-depth, .cin-stagger > *');
    for (var i = 0; i < cards.length; i++) {
      var el = cards[i];
      if (el.__cinSurface) continue;
      el.__cinSurface = 1;
      var r = el.getBoundingClientRect();
      if (r.width < 130) continue;
      // A sweep across a whole screen-height section is a screen wipe, not a
      // highlight, so anything that tall keeps its plain arrival.
      if (r.height > window.innerHeight * 0.72) continue;
      var panel = r.height >= 90;
      el.classList.add(panel ? 'cin-sheen' : 'cin-edge');
      var l = document.createElement('span');
      l.className = panel ? 'cin-sheen-l' : 'cin-edge-l';
      l.setAttribute('aria-hidden', 'true');
      el.appendChild(l);
    }
  }

  // Pointer specular. Nothing is listened to until the pointer is actually over
  // a panel, and the listener is dropped again on leave, so a page full of them
  // costs nothing while you are only reading it.
  function initSpecular() {
    if (motionOff) return;
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    var hosts = document.querySelectorAll('.cin, .cin-depth, .cin-stagger > *, .device-card, .build-card, .cw-panel, .nav-card');
    for (var i = 0; i < hosts.length; i++) arm(hosts[i]);

    function arm(el) {
      if (el.__cinSpec) return;
      var r = el.getBoundingClientRect();
      if (r.height < 90 || r.width < 130) return;
      if (r.height > window.innerHeight * 0.72) return;   // a section, not a panel
      el.__cinSpec = 1;
      el.classList.add('cin-spec-host');
      var spec = document.createElement('span');
      spec.className = 'cin-spec'; spec.setAttribute('aria-hidden', 'true');
      el.appendChild(spec);

      var raf = 0, mx = 50, my = 50;
      function paint() {
        raf = 0;
        el.style.setProperty('--mx', mx.toFixed(1) + '%');
        el.style.setProperty('--my', my.toFixed(1) + '%');
      }
      function move(e) {
        var b = el.getBoundingClientRect();
        if (!b.width || !b.height) return;
        mx = ((e.clientX - b.left) / b.width) * 100;
        my = ((e.clientY - b.top) / b.height) * 100;
        if (!raf) raf = requestAnimationFrame(paint);
      }
      el.addEventListener('pointerenter', function () {
        el.addEventListener('pointermove', move, { passive: true });
      }, { passive: true });
      el.addEventListener('pointerleave', function () {
        el.removeEventListener('pointermove', move);
        if (raf) { cancelAnimationFrame(raf); raf = 0; }
      }, { passive: true });
    }
  }

  // ── custom cursor ─────────────────────────────────────────────────────
  function initCursor() {
    if (motionOff || !matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    if (document.getElementById('cinCursor')) return;
    var dot = document.createElement('div');
    dot.id = 'cinCursor';
    dot.setAttribute('aria-hidden', 'true');
    dot.style.cssText = 'position:fixed;left:0;top:0;z-index:2147482000;pointer-events:none;' +
      'width:8px;height:8px;border-radius:50%;background:currentColor;color:#EAEAEA;' +
      'mix-blend-mode:difference;transform:translate3d(-100px,-100px,0) translate(-50%,-50%);' +
      'transition:width .28s cubic-bezier(.16,1,.3,1),height .28s cubic-bezier(.16,1,.3,1),' +
      'background-color .28s ease,border-color .28s ease;border:1px solid transparent';
    document.body.appendChild(dot);

    var tx = -100, ty = -100, cx = -100, cy = -100;
    addEventListener('pointermove', function (e) { tx = e.clientX; ty = e.clientY; }, { passive: true });
    (function loop() {
      cx += (tx - cx) * 0.22; cy += (ty - cy) * 0.22;         // trails slightly: weight
      dot.style.transform = 'translate3d(' + cx.toFixed(1) + 'px,' + cy.toFixed(1) + 'px,0) translate(-50%,-50%)';
      requestAnimationFrame(loop);
    })();

    addEventListener('pointerover', function (e) {
      var t = e.target;
      var interactive = t && t.closest && t.closest('a,button,[role="button"],input,select,textarea,[data-cursor]');
      dot.style.width = dot.style.height = interactive ? '42px' : '8px';
      dot.style.background = interactive ? 'transparent' : '#EAEAEA';
      dot.style.borderColor = interactive ? '#EAEAEA' : 'transparent';
    }, { passive: true });
  }

  // ── magnetic buttons ──────────────────────────────────────────────────
  function initMagnetic() {
    if (motionOff || matchMedia('(pointer: coarse)').matches) return;
    document.querySelectorAll('a.btn,button.btn,.chip,[data-magnetic]').forEach(function (el) {
      if (el.__mag) return; el.__mag = 1;
      var raf = null;
      el.addEventListener('pointermove', function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          var r = el.getBoundingClientRect();
          var dx = (e.clientX - (r.left + r.width / 2)) * 0.28;
          var dy = (e.clientY - (r.top + r.height / 2)) * 0.28;
          el.style.transform = 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0)';
          el.style.transition = 'transform .08s linear';
        });
      });
      el.addEventListener('pointerleave', function () {
        el.style.transition = 'transform .5s cubic-bezier(.16,1,.3,1)';
        el.style.transform = '';
      });
    });
  }

  function boot() {
    observe();
    // Lenis goes up FIRST, not on a timer.
    //
    // Every jump this page used to make on an early scroll was exactly one
    // wheel notch backwards, and that is the signature of a handover: a wheel
    // event handled natively while Lenis is still being set up, then Lenis's
    // next frame writing its own position over the top of it. Deferring the
    // setup only widens the window in which that can happen. The fix is to
    // close it — be the scroll engine before there is a scroll to hand over.
    //
    // whenPageStill still guards it, for anyone who manages to scroll first.
    whenPageStill(initLenis);
    // Everything else is decoration and can wait. Loading it all at 400ms put
    // parallax scanning, 38 magnetic listeners and a cursor rAF into exactly
    // the frame budget the opening scroll was competing for.
    // The cursor rides up here, with enrich and railify, rather than in the
    // idle group below. It is the one effect a visitor sees before they do
    // anything at all — it replaces their pointer — and it was arriving at
    // 1150ms, which reads as the site booting rather than being alive. It costs
    // one element and one rAF loop, so it does not belong in the same bucket as
    // a full parallax scan.
    setTimeout(function () { enrich(); railify(); initSurfaces(); initCursor(); }, 300);

    // These genuinely scan the DOM, so they still wait for an idle moment.
    var idle = window.requestIdleCallback || function (fn) { return setTimeout(fn, 900); };
    idle(function () {
      pinRails(); initParallax(); onParScroll(); initMagnetic(); initSpecular();
    }, { timeout: 1200 });
    addEventListener('scroll', onParScroll, { passive: true });
    sweep();
    addEventListener('scroll', sweep, { passive: true });
    addEventListener('resize', sweep, { passive: true });
    // New content (these are apps, not just documents) gets tagged too.
    if ('MutationObserver' in window) {
      // Was: full rescan on EVERY mutation. On these app pages that fires
      // continuously, and each pass walks every element calling
      // getComputedStyle — 81 long tasks and 4 FPS while scrolling. Now it
      // only reacts to ADDED elements, and coalesces bursts into one pass.
      var moTimer = null;
      var mo = new MutationObserver(function (records) {
        var added = false;
        for (var i = 0; i < records.length && !added; i++) {
          var n = records[i].addedNodes;
          for (var j = 0; j < n.length; j++) {
            if (n[j].nodeType === 1) { added = true; break; }
          }
        }
        if (!added) return;
        clearTimeout(moTimer);
        moTimer = setTimeout(function () {
          observe(); enrich(); initMagnetic(); initSurfaces(); initSpecular();
        }, 350);
      });
      mo.observe(document.body, { childList: true, subtree: true });
    }
    // Re-scan on demand, for pages that reveal whole regions by removing a
    // `display:none` class rather than by inserting nodes. The MutationObserver
    // above only watches childList, and deliberately so — watching attributes
    // across the whole document would fire on every class toggle this site
    // makes, including the one it sets on <body> during a scroll. A page that
    // knows it just revealed something can say so instead.
    window.__cinRescan = function () {
      try { observe(); enrich(); initSurfaces(); initSpecular(); initMagnetic(); } catch (e) {}
    };

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
