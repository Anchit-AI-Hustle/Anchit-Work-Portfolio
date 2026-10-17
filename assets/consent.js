/* Cookie / analytics consent.
 *
 * What this actually gates. The site's one cookie (sb_collapsed) and its
 * localStorage keys are strictly functional — they remember choices the
 * visitor made about the interface, carry no identifier and are exempt from
 * consent. The only thing that is NOT exempt is analytics, so that is the one
 * thing this banner controls: decline, and the script is never requested.
 * A banner that gates nothing is theatre, so this one gates the real thing.
 *
 * Analytics is Vercel Web Analytics, served first-party from /_vercel/insights.
 * It sets no cookie and does not fingerprint. If Web Analytics is not enabled
 * on the project the request simply 404s and the page is unaffected.
 */
(function () {
  'use strict';

  var KEY = 'cookie-consent';          // 'granted' | 'denied'
  var ANALYTICS_SRC = '/_vercel/insights/script.js';
  var loaded = false;

  function read() {
    try { return localStorage.getItem(KEY); } catch (e) { return null; }
  }
  function write(v) {
    try { localStorage.setItem(KEY, v); } catch (e) { /* private mode: honour it for this page only */ }
  }

  function loadAnalytics() {
    if (loaded || document.querySelector('script[data-analytics]')) return;
    loaded = true;
    var s = document.createElement('script');
    s.defer = true;
    s.src = ANALYTICS_SRC;
    s.setAttribute('data-analytics', '');
    document.head.appendChild(s);
  }

  function banner() {
    if (document.getElementById('consentBar')) return;

    var bar = document.createElement('div');
    bar.id = 'consentBar';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-live', 'polite');
    bar.setAttribute('aria-label', 'Cookies and analytics');
    bar.innerHTML =
      '<div class="cb-inner">' +
        '<p class="cb-text">This site stores a couple of display preferences, which need no permission. ' +
        'May I also load <strong>privacy-friendly analytics</strong>' +
        '<span class="cb-long"> (no cookies, no tracking across sites)</span>' +
        ' to see which pages get read? <a href="/privacy">Privacy Policy</a>.</p>' +
        '<div class="cb-actions">' +
          '<button type="button" class="cb-btn" data-consent="denied">No thanks</button>' +
          '<button type="button" class="cb-btn cb-primary" data-consent="granted">Allow analytics</button>' +
        '</div>' +
      '</div>';

    var css = document.createElement('style');
    css.textContent =
      '#consentBar{position:fixed;left:0;right:0;bottom:0;z-index:2147483000;' +
        'background:#1A1814;border-top:1px solid #3D3830;color:#FBF5EC;' +
        'font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;' +
        'box-shadow:0 -8px 30px rgba(0,0,0,.45);' +
        'padding:14px 16px calc(14px + env(safe-area-inset-bottom,0px));' +
        'transform:translateY(100%);transition:transform .32s cubic-bezier(.22,1,.36,1)}' +
      '#consentBar[data-in="1"]{transform:translateY(0)}' +
      '#consentBar .cb-inner{max-width:900px;margin:0 auto;display:flex;gap:16px;' +
        'align-items:center;flex-wrap:wrap}' +
      '#consentBar .cb-text{margin:0;flex:1 1 340px;font-size:13.5px;line-height:1.55;color:#A39E94}' +
      '#consentBar .cb-text strong{color:#FBF5EC;font-weight:600}' +
      '#consentBar .cb-text a{color:#FF6940}' +
      '#consentBar .cb-actions{display:flex;gap:10px;flex:0 0 auto}' +
      '#consentBar .cb-btn{font:inherit;font-size:13px;font-weight:600;cursor:pointer;' +
        'padding:10px 16px;border-radius:12px;border:1px solid #3D3830;' +
        'background:transparent;color:#FBF5EC;transition:border-color .18s ease,color .18s ease}' +
      '#consentBar .cb-btn:hover{border-color:#FF6940;color:#FF6940}' +
      '#consentBar .cb-primary{background:linear-gradient(100deg,#FF6940,#FF4D1F);' +
        'color:#1a0d06;border-color:transparent}' +
      '#consentBar .cb-primary:hover{color:#1a0d06}' +
      '#consentBar .cb-btn:focus-visible{outline:2px solid #FF6940;outline-offset:3px}' +
      '@media (prefers-reduced-motion: reduce){#consentBar{transition:none}}' +
      '@media (max-width:560px){#consentBar .cb-actions{width:100%}' +
        '#consentBar .cb-btn{flex:1}' +
        /* On a 320x626 screen the full paragraph ate a third of the page. */
        '#consentBar{padding:11px 14px calc(11px + env(safe-area-inset-bottom,0px))}' +
        '#consentBar .cb-inner{gap:10px}' +
        '#consentBar .cb-text{font-size:12.5px;line-height:1.45;flex-basis:100%}' +
        '#consentBar .cb-text .cb-long{display:none}' +
        '#consentBar .cb-btn{padding:9px 12px;font-size:12.5px}}';

    document.head.appendChild(css);
    document.body.appendChild(bar);

    // Next frame, so the entrance transition has a start value to animate from.
    requestAnimationFrame(function () {
      requestAnimationFrame(function () { bar.setAttribute('data-in', '1'); });
    });

    bar.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-consent]');
      if (!btn) return;
      var choice = btn.getAttribute('data-consent');
      write(choice);
      if (choice === 'granted') loadAnalytics();
      bar.setAttribute('data-in', '0');
      setTimeout(function () { bar.remove(); }, 340);
    });

    // Escape is the same as declining: it is the privacy-preserving default.
    bar.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      write('denied');
      bar.setAttribute('data-in', '0');
      setTimeout(function () { bar.remove(); }, 340);
    });

    var first = bar.querySelector('.cb-primary');
    if (first) first.focus({ preventScroll: true });
  }

  function init() {
    var choice = read();
    if (choice === 'granted') { loadAnalytics(); return; }
    if (choice === 'denied') return;
    banner();
  }

  // Any page can offer a way back to the choice.
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-cookie-reopen]');
    if (!el) return;
    e.preventDefault();
    try { localStorage.removeItem(KEY); } catch (err) { /* nothing to clear */ }
    banner();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
