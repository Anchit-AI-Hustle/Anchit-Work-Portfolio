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
  function initRoom() {
    if (isOff() || document.querySelector('.lux, .cin-room')) return;
    var bg = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g) || [];
    if (bg.length < 3 || (bg.length > 3 && +bg[3] === 0)) bg = (getComputedStyle(root).backgroundColor.match(/[\d.]+/g) || [0, 0, 0]);
    var lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255;
    if (lum > 0.32) return;                              // a light page: gold dust on white is dirt
    var path = location.pathname.replace(/\.html$/, '').replace(/\/$/, '');
    // A full-screen app shell covers the whole viewport with an opaque panel;
    // a backdrop behind it would be composited and never seen.
    if (path === '/task-tracker') return;
    var named = { '/freelancer': 'gyro', '/hotel': 'veil', '/growth-school': 'horizon', '/marketing-101': 'veil',
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
      '.cr-g1{left:-20vmax;top:-32vmax;background:radial-gradient(closest-side,' + mix(A, 22) + ',transparent 72%);animation:crA 47s ease-in-out infinite alternate}',
      '.cr-g2{right:-28vmax;bottom:-36vmax;background:radial-gradient(closest-side,' + mix(B, 18) + ',transparent 70%);animation:crB 61s ease-in-out infinite alternate}',
      '@keyframes crA{from{transform:translate3d(0,0,0) scale(1)}to{transform:translate3d(22vmax,16vmax,0) scale(1.18)}}',
      '@keyframes crB{from{transform:translate3d(0,0,0) scale(1.1)}to{transform:translate3d(-26vmax,-14vmax,0) scale(.9)}}',
      '.cr-dust{left:0;right:0;top:0;height:calc(100% + 720px);opacity:.6;background-image:radial-gradient(circle,' + mix(A, 80) + ' 0 1px,transparent 1.6px),radial-gradient(circle,' + mix(B, 70) + ' 0 1px,transparent 1.8px);background-size:220px 240px,340px 360px;background-position:30px 60px,170px 20px;animation:crRise 96s linear infinite}',
      '@keyframes crRise{to{transform:translate3d(0,-720px,0)}}',
      '.cr-sheen{top:-30vh;left:0;width:34vw;height:160vh;opacity:0;background:linear-gradient(90deg,transparent,' + mix(A, 10) + ' 46%,' + mix(A, 16) + ' 50%,' + mix(A, 10) + ' 54%,transparent);animation:crSheen 19s cubic-bezier(.45,0,.2,1) infinite}',
      '@keyframes crSheen{0%{transform:translate3d(-60vw,0,0) rotate(16deg);opacity:0}8%,46%{opacity:1}54%,100%{transform:translate3d(150vw,0,0) rotate(16deg);opacity:0}}',
      // horizon: a floor running away to a vanishing point
      '.cr-floor{left:-50%;right:-50%;bottom:0;height:44vh;perspective:520px;perspective-origin:50% 0}',
      '.cr-floor>i{left:0;right:0;top:0;height:300%;transform-origin:50% 0;background-image:linear-gradient(' + mix(A, 24) + ' 1px,transparent 1px),linear-gradient(90deg,' + mix(A, 18) + ' 1px,transparent 1px);background-size:96px 96px;animation:crFloor 5.2s linear infinite}',
      '@keyframes crFloor{from{transform:rotateX(76deg) translate3d(0,0,0)}to{transform:rotateX(76deg) translate3d(0,96px,0)}}',
      '.cr-fade{left:0;right:0;bottom:0;height:46vh;background:linear-gradient(180deg,VAR_BG 4%,transparent 70%)}',
      // gyro: three rings on three axes
      '.cr-gyro{right:8%;top:22%;width:46vmin;height:46vmin;perspective:900px}',
      '.cr-gyro>i{inset:0;border-radius:50%;border:1px solid ' + mix(A, 46) + '}',
      '.cr-gyro>i:nth-child(1){animation:crGx 23s linear infinite}',
      '.cr-gyro>i:nth-child(2){border-color:' + mix(B, 44) + ';animation:crGy 31s linear infinite}',
      '.cr-gyro>i:nth-child(3){border-style:dashed;animation:crGz 41s linear infinite}',
      '.cr-gyro>i:nth-child(4){inset:44%;border:0;background:radial-gradient(circle,' + mix(A, 90) + ',transparent 70%);animation:crPulse 5s ease-in-out infinite alternate}',
      '@keyframes crGx{from{transform:rotateX(72deg) rotateZ(0)}to{transform:rotateX(72deg) rotateZ(360deg)}}',
      '@keyframes crGy{from{transform:rotateY(68deg) rotateZ(0)}to{transform:rotateY(68deg) rotateZ(-360deg)}}',
      '@keyframes crGz{from{transform:rotate3d(1,1,0,58deg) rotateZ(0)}to{transform:rotate3d(1,1,0,58deg) rotateZ(360deg)}}',
      '@keyframes crPulse{from{transform:scale(.7);opacity:.5}to{transform:scale(1.25);opacity:1}}',
      // veil: curtains of light
      '.cr-veil{top:-20vh;width:16vw;height:140vh;background:linear-gradient(90deg,transparent,' + mix(A, 9) + ' 50%,transparent)}',
      '.cr-veil:nth-of-type(1){left:6%;animation:crV1 27s ease-in-out infinite alternate}',
      '.cr-veil:nth-of-type(2){left:34%;animation:crV2 35s ease-in-out infinite alternate;background:linear-gradient(90deg,transparent,' + mix(B, 8) + ' 50%,transparent)}',
      '.cr-veil:nth-of-type(3){left:62%;animation:crV1 43s ease-in-out infinite alternate-reverse}',
      '.cr-veil:nth-of-type(4){left:84%;animation:crV2 31s ease-in-out infinite alternate-reverse}',
      '@keyframes crV1{from{transform:translate3d(-8vw,0,0) skewX(-14deg) scaleX(.8)}to{transform:translate3d(10vw,0,0) skewX(9deg) scaleX(1.5)}}',
      '@keyframes crV2{from{transform:translate3d(9vw,0,0) skewX(11deg) scaleX(1.3)}to{transform:translate3d(-11vw,0,0) skewX(-12deg) scaleX(.7)}}',
      '@media (max-width:700px){.cr-gyro{right:-6%;top:12%;width:60vmin;height:60vmin}.cr-floor{height:34vh}}'
    ].join('').replace('VAR_BG', 'rgb(' + [bg[0], bg[1], bg[2]].join(',') + ')');
    var st = document.createElement('style');
    st.id = 'cin-room-css'; st.textContent = css;
    document.head.appendChild(st);
    var room = document.createElement('div');
    room.className = 'cin-room cin-room-' + kind; room.setAttribute('aria-hidden', 'true');
    room.setAttribute('data-no-motion', '');
    var parts = '<i class="cr-g cr-g1"></i><i class="cr-g cr-g2"></i>';
    if (kind === 'horizon') parts += '<i class="cr-floor"><i></i></i><i class="cr-fade"></i>';
    if (kind === 'gyro') parts += '<i class="cr-gyro"><i></i><i></i><i></i><i></i></i>';
    if (kind === 'veil') parts += '<i class="cr-veil"></i><i class="cr-veil"></i><i class="cr-veil"></i><i class="cr-veil"></i>';
    room.innerHTML = parts + '<i class="cr-dust"></i><i class="cr-sheen"></i>';
    document.body.insertBefore(room, document.body.firstChild);
    // The page is moving: the room stands down until it stops.
    var quiet = 0;
    addEventListener('scroll', function () {
      room.classList.add('is-quiet');
      clearTimeout(quiet);
      quiet = setTimeout(function () { room.classList.remove('is-quiet'); }, 220);
    }, { passive: true });
    document.addEventListener('visibilitychange', function () { room.classList.toggle('is-quiet', document.hidden); });
    // Motion can be turned off after load (each page has its own switch).
    if ('MutationObserver' in window) {
      new MutationObserver(function () { room.style.display = isOff() ? 'none' : ''; })
        .observe(root, { attributes: true, attributeFilter: ['class', 'data-motion'] });
    }
  }


  function start() { setTimeout(initRoom, 600); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
