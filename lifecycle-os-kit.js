/* Lifecycle OS · shared tool-page helpers */
window.LOS = (function () {
  try { var t = localStorage.getItem('anchit-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function subject() {
    try { var s = JSON.parse(localStorage.getItem('lifecycle-os-subject') || 'null'); if (s && s.brand) return s; } catch (e) {}
    return { brand: 'Anchit Tandon', url: 'anchit-tandon.com' };
  }
  function post(url, payload) {
    return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload || {}) }).then(function (r) { return r.json(); });
  }
  function badge(el, source) {
    if (source === 'ai' || source === 'ai+ci') { el.textContent = 'AI-generated'; el.className = 'badge ai'; }
    else if (source === 'anchit') { el.textContent = 'Marketing myself · anchit-tandon.com'; el.className = 'badge ai'; }
    else { el.textContent = 'Sample data'; el.className = 'badge'; }
  }
  return { esc: esc, subject: subject, post: post, badge: badge };
})();
