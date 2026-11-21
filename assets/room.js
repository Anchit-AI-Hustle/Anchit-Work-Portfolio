/* The room: a moving backdrop for every page.
 *
 * Loaded by assets/cinematic.js on the pages that use that runtime, and
 * directly by the few that do not. One file, so the room is the same room.
 */
(function () {
  'use strict';
  if (window.__roomBooted) return;
  window.__roomBooted = true;
  var root = document.documentElement;
  // Two switches exist on this site: the shared one (data-motion, saved as
  // anchit-motion) and the freelance page's own (html.motion-off).
  function isOff() {
    if (root.getAttribute('data-motion') === 'off' || root.classList.contains('motion-off')) return true;
    try { if (localStorage.getItem('anchit-motion') === 'off') return true; } catch (e) {}
    return false;
  }

  // ── The room: a moving backdrop on every page ─────────────────────────
  // The portfolio's home has a backdrop that never stops: slow pools of light,
  // dust rising in depth, a foil sheen. The pages it links to had a flat
  // colour behind them. This gives each of them the same room, plus one 3D
  // piece of its own so no two feel like the same page:
  //   horizon  a floor grid running to a vanishing point
  //   gyro     three rings turning on three axes around a core
  //   veil     tall curtains of light leaning and swaying
  // All of it is static paint moved by compositor-only transforms: no script
  // per frame, no layout, no repaint. It sits behind the page (z-index -1),
  // leaves the compositor while the page is being scrolled, and is not built
  // at all with Motion off, on a light page, or where the page already has a
  // backdrop of its own.
  // The page's background, if it is dark enough to carry the room; else null.
  // Asked again whenever the theme changes, because several pages have a
  // light/dark switch of their own.
  function darkBg() {
    var bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || [];
    if (bg.length < 3 || (bg.length > 3 && +bg[3] === 0)) bg = (getComputedStyle(root).backgroundColor.match(/[\d.]+/g) || [0, 0, 0]);
    var lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    return lum > 0.32 ? null : [Math.round(bg[0]), Math.round(bg[1]), Math.round(bg[2])];
  }

  function initRoom() {
    if (isOff() || document.querySelector('.lux, .cin-room')) return;
    var bg = darkBg();
    if (!bg) return;                                     // a light page: gold dust on white is dirt
    var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
    // A full-screen app shell covers the whole viewport with an opaque panel;
    // a backdrop behind it would be composited and never seen.
    if (path === '/task-tracker') return;
    var named = { '/freelancer': 'plain', '/hotel': 'veil', '/growth-school': 'horizon', '/marketing-101': 'veil',
      '/agent': 'gyro', '/jobhunt': 'horizon', '/task-tracker': 'veil', '/lifecycle-os': 'horizon', '/lifecycle-os-landing': 'gyro' };
    var kinds = ['horizon', 'gyro', 'veil'], h = 0;
    for (var i = 0; i < path.length; i++) h = (h * 31 + path.charCodeAt(i)) >>> 0;
    var kind = named[path] || kinds[h % 3];
    var A = 'var(--accent-warm, var(--accent, #FFB736))', B = 'var(--primary, #FF6940)';
    var mix = function (c, pct) { return 'color-mix(in srgb, ' + c + ' ' + pct + '%, transparent)'; };
    var css = [
      '.cin-room{position:fixed;inset:0;z-index:-1;pointer-events:none;overflow:hidden;contain:strict;transition:opacity .4s ease}',
      '.cin-room>i,.cin-room>i>i{position:absolute;display:block;will-change:transform}',
      '.cin-room.is-quiet{opacity:0;visibility:hidden;transition:opacity .12s ease,visibility 0s .12s}',
      '.cin-room.is-quiet *{animation-play-state:paused!important}',
      '.cr-g{width:78vmax;height:78vmax;border-radius:50%}',
      '.cr-g1{left:-20vmax;top:-32vmax;background:radial-gradient(closest-side,' + mix(A, 8) + ',transparent 70%);animation:crA 47s ease-in-out infinite alternate}',
      '.cr-g2{right:-28vmax;bottom:-36vmax;background:radial-gradient(closest-side,' + mix(B, 6) + ',transparent 68%);animation:crB 61s ease-in-out infinite alternate}',
      '@keyframes crA{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(22vmax,16vmax,0) scale(1.18)}}',
      '@keyframes crB{from{transform:translate3d(0,0,0) scale(1.1)}to{transform:translate3d(-26vmax,-14vmax,0) scale(.9)}}',
      '.cr-dust{left:0;right:0;top:0;height:calc(100% + 1024px);opacity:.5;background-size:1024px 1024px;animation:crRise 120s linear infinite}',
      '@keyframes crRise{to{transform:translate3d(0,-1024px,0)}}',
      '.cr-sheen{top:-30vh;left:0;width:10vw;height:160vh;opacity:0;background:linear-gradient(90deg,transparent,' + mix(A, 5) + ' 44%,' + mix(A, 20) + ' 50%,' + mix(A, 5) + ' 56%,transparent);animation:crSheen 23s cubic-bezier(.45,0,.2,1) infinite}',
      '@keyframes crSheen{0%{transform:translate3d(-60vw,0,0) rotate(16deg);opacity:0}8%,46%{opacity:1}54%,100%{transform:translate3d(150vw,0,0) rotate(16deg);opacity:0}}',
      // horizon: a floor running away to a vanishing point
      '.cr-floor{left:-50%;right:-50%;bottom:0;height:30vh;perspective:520px;perspective-origin:50% 0}',
      '.cr-floor>i{left:0;right:0;top:0;height:300%;transform-origin:50% 0;background-image:linear-gradient(' + mix(A, 16) + ' 1px,transparent 1px),linear-gradient(90deg,' + mix(A, 12) + ' 1px,transparent 1px);background-size:96px 96px;animation:crFloor 5.2s linear infinite}',
      '@keyframes crFloor{from{transform:rotateX(76deg) translate3d(0,0,0)}to{transform:rotateX(76deg) translate3d(0,96px,0)}}',
      '.cr-fade{left:0;right:0;bottom:0;height:32vh;background:linear-gradient(180deg,VAR_BG 4%,transparent 70%)}',
      // gyro: three rings on three axes
      '.cr-gyro{right:8%;top:22%;width:46vmin;height:46vmin;perspective:900px}',
      '.cr-gyro>i{inset:0;border-radius:50%;border:1px solid ' + mix(A, 26) + '}',
      '.cr-gyro>i:nth-child(1){animation:crGx 23s linear infinite}',
      '.cr-gyro>i:nth-child(2){border-color:' + mix(A, 18) + ';animation:crGy 31s linear infinite}',
      '.cr-gyro>i:nth-child(3){border-style:dashed;animation:crGz 41s linear infinite}',
      '.cr-gyro>i:nth-child(4){inset:44%;border:0;background:radial-gradient(circle,' + mix(A, 90) + ',transparent 70%);animation:crPulse 5s ease-in-out infinite alternate}',
      '@keyframes crGx{from{transform:rotateX(72deg) rotateZ(0)}to{transform:rotateX(72deg) rotateZ(360deg)}}',
      '@keyframes crGy{from{transform:rotateY(68deg) rotateZ(0)}to{transform:rotateY(68deg) rotateZ(-360deg)}}',
      '@keyframes crGz{from{transform:rotate3d(1,1,0,58deg) rotateZ(0)}to{transform:rotate3d(1,1,0,58deg) rotateZ(360deg)}}',
      '@keyframes crPulse{from{transform:scale(.7);opacity:.5}to{transform:scale(1.25);opacity:1}}',
      // veil: curtains of light
      '.cr-veil{top:-20vh;width:16vw;height:140vh;background:linear-gradient(90deg,transparent,' + mix(A, 5) + ' 50%,transparent)}',
      '.cr-v1{left:6%;animation:crV1 27s ease-in-out infinite alternate}',
      '.cr-v2{left:34%;animation:crV2 35s ease-in-out infinite alternate;background:linear-gradient(90deg,transparent,' + mix(A, 4) + ' 50%,transparent)}',
      '.cr-v3{left:62%;animation:crV1 43s ease-in-out infinite alternate-reverse}',
      '.cr-v4{left:84%;animation:crV2 31s ease-in-out infinite alternate-reverse}',
      '@keyframes crV1{from{transform:translate3d(-8vw,0,0) skewX(-14deg) scaleX(.8)}to{transform:translate3d(10vw,0,0) skewX(9deg) scaleX(1.5)}}',
      '@keyframes crV2{from{transform:translate3d(9vw,0,0) skewX(11deg) scaleX(1.3)}to{transform:translate3d(-11vw,0,0) skewX(-12deg) scaleX(.7)}}',
      '@media (max-width:700px){.cr-gyro{right:-6%;top:12%;width:60vmin;height:60vmin}.cr-floor{height:34vh}}'
    ].join('').replace('VAR_BG', 'rgb(' + [bg[0], bg[1], bg[2]].join(',') + ')');
    var old = document.getElementById('cin-room-css');
    if (old) old.parentNode.removeChild(old);
    var st = document.createElement('style');
    st.id = 'cin-room-css'; st.textContent = css;
    document.head.appendChild(st);
    var room = document.createElement('div');
    room.className = 'cin-room cin-room-' + kind; room.setAttribute('aria-hidden', 'true');
    room.setAttribute('data-no-motion', '');
    room.setAttribute('data-bg', bg.join(','));          // the colour the floor fades into
    var parts = '<i class="cr-g cr-g1"></i><i class="cr-g cr-g2"></i>';
    if (kind === 'horizon') parts += '<i class="cr-floor"><i></i></i><i class="cr-fade"></i>';
    if (kind === 'gyro') parts += '<i class="cr-gyro"><i></i><i></i><i></i><i></i></i>';
    // Explicit classes, not :nth-of-type: every child of the room is an <i>,
    // so the two glows ahead of the curtains took positions 1 and 2 and only
    // half the curtains were ever placed or moved.
    if (kind === 'veil') parts += '<i class="cr-veil cr-v1"></i><i class="cr-veil cr-v2"></i><i class="cr-veil cr-v3"></i><i class="cr-veil cr-v4"></i>';
    room.innerHTML = parts + '<i class="cr-dust"></i><i class="cr-sheen"></i>';
    // The specks are scattered once into a sprite; tiled CSS dots sat in a
    // visible lattice.
    var dustEl = room.querySelector('.cr-dust');
    try {
      var cv = document.createElement('canvas'); cv.width = cv.height = 1024;
      var cx2 = cv.getContext('2d'), seed = 7 + (h % 97);
      var rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      var cs = getComputedStyle(root);
      var tones = [(cs.getPropertyValue('--accent-warm') || cs.getPropertyValue('--accent') || '#FFB736').trim() || '#FFB736', '#FBF5EC'];
      for (var n = 0; n < 150; n++) {
        var px = rnd() * 1024, py = rnd() * 1024, rad = 0.35 + rnd() * rnd() * 1.1;
        cx2.globalAlpha = 0.25 + rnd() * 0.75; cx2.fillStyle = tones[(rnd() * tones.length) | 0];
        for (var ox = -1024; ox <= 1024; ox += 1024) for (var oy = -1024; oy <= 1024; oy += 1024) {
          if (px + ox < -4 || px + ox > 1028 || py + oy < -4 || py + oy > 1028) continue;
          cx2.beginPath(); cx2.arc(px + ox, py + oy, rad, 0, 6.2832); cx2.fill();
        }
      }
      dustEl.style.backgroundImage = 'url(' + cv.toDataURL('image/png') + ')';
    } catch (e) { dustEl.style.display = 'none'; }
    document.body.insertBefore(room, document.body.firstChild);
    // The page is moving: the room stands down until it stops.
    var quiet = 0;
    addEventListener('scroll', function () {
      room.classList.add('is-quiet');
      clearTimeout(quiet);
      quiet = setTimeout(function () { room.classList.remove('is-quiet'); }, 220);
    }, { passive: true });
    document.addEventListener('visibilitychange', function () { room.classList.toggle('is-quiet', document.hidden); });
  }


  // Each page has its own Motion switch and it can be flipped at any time, in
  // either direction. Watching it only from inside initRoom meant a page that
  // LOADED with motion off never built a room when it was turned back on.
  //
  // The same goes for the theme. A page switched to its light theme kept gold
  // dust and a dark fade band over a white page, and a page loaded light and
  // switched to dark never got a room. So eligibility (motion on, background
  // dark) is re-asked on every change, and a room built for one dark colour is
  // rebuilt if the background is now a different one.
  function sync() {
    var room = document.querySelector('.cin-room'), bg = isOff() ? null : darkBg();
    if (!bg) { if (room) room.style.display = 'none'; return; }
    if (room && room.getAttribute('data-bg') !== bg.join(',')) { room.parentNode.removeChild(room); room = null; }
    if (room) room.style.display = '';
    else initRoom();
  }
  // ── Live edges ────────────────────────────────────────────────────────
  // The room moves behind the page; this is the page itself showing signs of
  // life. A point of light travels the border of each card that is on screen,
  // one lap every several seconds, each card on its own phase so no two move
  // together.
  //
  // How: a child covers the card and is masked down to its 1px border ring; a
  // square with one bright arc painted on it turns inside that mask. The arc
  // is static paint and the turn is a compositor transform, so nothing is
  // repainted. A card only animates while it is in view, and the whole layer
  // pauses during a scroll and stops with Motion off or on a light theme.
  var CARD = '.nav-card,.work-stat,.work-item,.contact-card,.device-card,.study-card,.project-hero,.project-section,' +
    '.now-role-card,.now-metrics-card,.now-stack-card,.now-focus-item,.about-value-item,.meta-block,.cw-panel,[class*="card"]';
  var liveSeen = typeof WeakSet === 'function' ? new WeakSet() : null, liveIO = null, liveCount = 0, liveCards = [], liveSerial = 0, liveIn = new Set();
  function liveCss() {
    if (document.getElementById('lv-css')) return;
    var A = 'var(--accent-warm, var(--accent, #FFB736))';
    var st = document.createElement('style');
    st.id = 'lv-css';
    st.textContent = [
      '.lv-beam{position:absolute;inset:0;border-radius:inherit;padding:1px;pointer-events:none;overflow:hidden;z-index:1;opacity:0;transition:opacity .7s ease;',
      '-webkit-mask:linear-gradient(#000 0 0) content-box,linear-gradient(#000 0 0);-webkit-mask-composite:xor;mask:linear-gradient(#000 0 0) content-box exclude,linear-gradient(#000 0 0)}',
      '.lv-beam>i{position:absolute;left:50%;top:50%;width:220%;aspect-ratio:1;margin:-110% 0 0 -110%;display:block;',
      'background:conic-gradient(from 0deg,transparent 0 292deg,color-mix(in srgb,' + A + ' 55%,transparent) 330deg,' + A + ' 352deg,#fff 358deg,transparent 360deg)}',
      'html.room-live .is-live>.lv-beam{opacity:.9}',
      'html.room-live .is-live>.lv-beam>i{animation:lvLap var(--lv-t,9s) linear infinite;animation-delay:var(--lv-d,0s)}',
      'html[data-room-quiet] .lv-beam>i{animation-play-state:paused!important}',
      '@keyframes lvLap{to{transform:rotate(360deg)}}'
    ].join('');
    document.head.appendChild(st);
  }
  function scanLive() {
    if (!liveSeen || !('IntersectionObserver' in window)) return;
    liveCss();
    if (!liveIO) {
      liveIO = new IntersectionObserver(function (es) {
        // Every lit card is one more masked, turning layer for the GPU to
        // blend, so only a handful run at once however many are in view: fewer
        // on a phone. The rest wait their turn as others scroll away.
        es.forEach(function (e) { if (e.isIntersecting) liveIn.add(e.target); else liveIn.delete(e.target); });
        var cap = (innerWidth < 821 || matchMedia('(pointer: coarse)').matches) ? 3 : 6, lit = 0;
        liveCards.forEach(function (c) {
          var on = liveIn.has(c) && c.isConnected && lit < cap;
          if (on) lit++;
          c.classList.toggle('is-live', on);
        });
      }, { rootMargin: '-6% 0px -6% 0px' });
    }
    // What counts as a card is decided by how it is drawn, not what it is
    // called: the pages here name their panels a dozen different ways and some
    // not at all. A card is a box of card size with a visible border on at
    // least three sides, that is not already inside a card.
    var list = document.querySelectorAll(CARD + ',main div,main a,main article,main li,main section,main figure,body>div div,body>section div,article');
    // Pages that rebuild their content (the course swaps a whole chapter) take
    // decorated cards with them. Give those back, or the budget below fills up
    // with cards that no longer exist and new ones never get an edge.
    liveCards = liveCards.filter(function (c) {
      if (c.isConnected) return true;
      liveIO.unobserve(c); liveIn.delete(c);
      return false;
    });
    liveCount = liveCards.length;
    var looked = 0;
    for (var i = 0; i < list.length && liveCount < 70 && looked < 5000; i++) {
      var el = list[i];
      if (liveSeen.has(el)) continue;
      var w = el.offsetWidth, h = el.offsetHeight;
      if (!w && !h) continue;                            // hidden for now (another view): look again later
      looked++;
      liveSeen.add(el);
      if (w < 170 || h < 80 || w > 1300 || h > 820) continue;
      if (el.closest('.folio, nav, aside, header, footer, .cin-room, .lux, [data-no-live], #fdDeck, .chat-panel, dialog, .is-lv')) continue;
      var cs = getComputedStyle(el);
      if (cs.display === 'inline' || cs.visibility === 'hidden') continue;
      // Still waiting for its entrance: not a no, a not-yet. Marking it seen
      // here skipped most of the home page for good, since its blocks start
      // transparent and arrive as they are scrolled to.
      if (+cs.opacity < 0.5) { liveSeen.delete(el); continue; }
      var sides = (parseFloat(cs.borderTopWidth) > 0) + (parseFloat(cs.borderRightWidth) > 0) + (parseFloat(cs.borderBottomWidth) > 0) + (parseFloat(cs.borderLeftWidth) > 0);
      var ink = (cs.borderTopColor.match(/[\d.]+/g) || []);
      if (sides < 3 || (ink.length > 3 && +ink[3] < 0.04)) continue;
      if (cs.position === 'static') el.style.position = 'relative';
      el.classList.add('is-lv');
      var beam = document.createElement('span');
      beam.className = 'lv-beam'; beam.setAttribute('aria-hidden', 'true');
      beam.appendChild(document.createElement('i'));
      // A lap takes longer round a bigger card, and every card starts
      // somewhere different on its lap.
      var per = Math.max(7, Math.min(16, (w + h) / 70));
      beam.style.setProperty('--lv-t', per.toFixed(1) + 's');
      beam.style.setProperty('--lv-d', (-((liveSerial++ * 2.7) % per)).toFixed(1) + 's');
      el.appendChild(beam);
      liveIO.observe(el);
      liveCards.push(el);
      liveCount++;
    }
  }
  function syncLive() {
    var on = !isOff() && !!darkBg();
    root.classList.toggle('room-live', on);
    if (on) scanLive();
  }
  window.__roomScan = function () { if (root.classList.contains('room-live')) scanLive(); };

  function start() {
    setTimeout(initRoom, 600);
    setTimeout(syncLive, 900);
    // Pages reveal views and inject cards after load; look again when they do,
    // and stand the edges down while the page is being scrolled.
    // After the arrival has finished (blocks are transparent until their turn,
    // and a transparent block is read as not there yet).
    document.addEventListener('viewChanged', function () { setTimeout(window.__roomScan, 1500); setTimeout(window.__roomScan, 2800); });
    setTimeout(window.__roomScan, 3200);
    var lq = 0;
    addEventListener('scroll', function () {
      // An attribute the theme watcher does not listen for, so a scroll does not
      // make it re-read the page background twice per gesture.
      root.setAttribute('data-room-quiet', '');
      clearTimeout(lq);
      lq = setTimeout(function () { root.removeAttribute('data-room-quiet'); setTimeout(window.__roomScan, 900); }, 220);
    }, { passive: true });
    if ('MutationObserver' in window) {
      var later = 0;
      // Answer at once, so turning Motion off stops the room now, and again
      // once a theme switch has finished fading the background it is read from.
      var ask = function () { sync(); syncLive(); clearTimeout(later); later = setTimeout(function () { sync(); syncLive(); }, 420); };
      var mo = new MutationObserver(ask);
      var watch = { attributes: true, attributeFilter: ['class', 'data-motion', 'data-theme', 'style'] };
      mo.observe(root, watch);
      if (document.body) mo.observe(document.body, watch);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
