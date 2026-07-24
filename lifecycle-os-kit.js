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
    else { el.textContent = 'Generated'; el.className = 'badge'; }
  }
  // A coherent fact base for the current subject, so every deterministic tool
  // generates consistent, correct, on-context output with no API key required.
  function facts(brand, url) {
    var b = (brand || '').trim(), u = (url || '').trim();
    var anchit = /anchit/.test((b + ' ' + u).toLowerCase().replace(/\s+/g, '-')) || (!b && !u);
    if (anchit) return {
      anchit: true, name: 'Anchit Tandon', handle: 'anchittandon', url: 'anchit-tandon.com',
      category: 'Product & Growth leadership (personal brand)',
      one: 'An engineer who learned to love the funnel — now a Product & Growth leader.',
      wins: ['5× MRR on Assisted Sales (₹15L → ₹80L)', '₹3Cr+ incremental ARR from the ET Markets revamp', 'D2C growth across US, UK & global markets'],
      audiences: ['High-growth D2C brands', 'Media & subscription businesses', 'Seed–Series B startups', 'Product & growth recruiters'],
      cta: 'Open anchit-tandon.com', mood: 'confident, warm, precise',
    };
    var name = b || u.replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    return {
      anchit: false, name: name, handle: name.toLowerCase().replace(/[^a-z0-9]+/g, ''), url: u || (name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.com'),
      category: 'Direct-to-consumer', one: name + ' — a D2C brand built on repeat purchase, not just the first sale.',
      wins: ['Category-leading repeat-purchase rate', 'Email/SMS driving 25–35% of revenue', 'A loyal, high-LTV core'],
      audiences: ['First-time buyers', 'Repeat / loyal', 'VIP / high-LTV', 'At-risk / lapsing'],
      cta: 'Shop now', mood: 'warm, premium, detail-led',
    };
  }
  function wireSubject(idBrand, idUrl, run) {
    var s = subject(); var eb = document.getElementById(idBrand), eu = document.getElementById(idUrl);
    if (eb) eb.value = s.brand; if (eu) eu.value = s.url || '';
    var go = document.getElementById('go'); if (go) go.addEventListener('click', run);
  }

  // Every tool in the OS + a flow graph of what you'd naturally do next.
  var TOOLS = {
    hub:       { ic: '🧭', nm: 'Lifecycle OS', href: '/lifecycle-os' },
    analysis:  { ic: '📊', nm: 'Data Analysis', href: '/lifecycle-os-analysis' },
    calendar:  { ic: '🗓️', nm: 'Marketing Calendar', href: '/lifecycle-os-calendar' },
    studio:    { ic: '✉️', nm: 'Mailer Studio', href: '/lifecycle-os-studio' },
    social:    { ic: '📣', nm: 'Social Studio', href: '/lifecycle-os-social' },
    ads:       { ic: '🎯', nm: 'Ads Studio', href: '/lifecycle-os-ads' },
    creative:  { ic: '🎨', nm: 'Creative Gallery', href: '/lifecycle-os-creative' },
    landing:   { ic: '🖼️', nm: 'Landing Page Studio', href: '/lifecycle-os-landing' },
    intel:     { ic: '🔭', nm: 'Competitive Intelligence', href: '/lifecycle-os-intel' },
    cohorts:   { ic: '👥', nm: 'Cohort Builder', href: '/lifecycle-os-cohorts' },
    brain:     { ic: '🧠', nm: 'Smart Brain', href: '/lifecycle-os-brain' },
    playbook:  { ic: '📚', nm: 'Retention Playbook', href: '/lifecycle-os-playbook' },
    frameworks:{ ic: '🧩', nm: 'Frameworks', href: '/lifecycle-os-frameworks' },
    ask:       { ic: '💬', nm: 'Ask the Brand Brain', href: '/lifecycle-os-ask' },
    music:     { ic: '🎵', nm: 'Sonic Branding', href: '/lifecycle-os-music' },
    audit:     { ic: '🔍', nm: 'Growth Audit', href: '/lifecycle-os-audit' },
    plan:      { ic: '📋', nm: 'Full lifecycle plan', href: '/d2c-lifecycle-os' },
    connectors:{ ic: '🔌', nm: 'Connectors', href: '/lifecycle-os-connectors' },
  };
  var NEXT = {
    analysis: ['intel', 'cohorts', 'calendar'], calendar: ['studio', 'playbook', 'brain'],
    studio: ['social', 'ads', 'calendar'], social: ['ads', 'creative', 'studio'],
    ads: ['creative', 'studio', 'intel'], creative: ['social', 'ads', 'landing'],
    landing: ['ads', 'studio', 'creative'], intel: ['analysis', 'ads', 'landing'],
    cohorts: ['analysis', 'calendar', 'playbook'], brain: ['calendar', 'analysis', 'playbook'],
    playbook: ['calendar', 'studio', 'cohorts'], frameworks: ['analysis', 'playbook', 'brain'],
    ask: ['plan', 'analysis', 'frameworks'], music: ['social', 'creative', 'landing'],
    audit: ['analysis', 'intel', 'landing'], connectors: ['analysis', 'calendar', 'plan'],
    plan: ['studio', 'calendar', 'analysis'],
  };

  var _extra = { text: '', files: [] };
  function extra() { _extra.text = (document.getElementById('losExtraText') || {}).value || _extra.text; return _extra; }
  function fmtSize(n) { return n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB'; }

  // Injects the "Take it further" links + an all-format "Add your own context"
  // panel into #extras. `rerun` (optional) is called when the user hits Apply so
  // the tool can regenerate with the added text/files folded in.
  function mountExtras(slug, rerun) {
    var host = document.getElementById('extras'); if (!host) return;
    var rel = (NEXT[slug] || []).map(function (k) { var t = TOOLS[k]; return t ? '<a class="rchip" href="' + t.href + '" target="_blank" rel="noopener"><span class="ic">' + t.ic + '</span><span class="nm">' + esc(t.nm) + '</span><span class="go">Open ↗</span></a>' : ''; }).join('');
    host.innerHTML =
      '<div class="sectitle">Take it further</div><div class="related">' + rel + '</div>'
      + '<div class="sectitle">Add your own context</div><div class="extras">'
      + '<textarea id="losExtraText" placeholder="Add a brief, notes, positioning, or paste anything — it is folded into what this tool generates."></textarea>'
      + '<label class="uploader"><input type="file" id="losFiles" multiple />＋ Attach files — any format (doc, pdf, txt, md, image, video, audio…)</label>'
      + '<div class="filelist" id="losFileList"></div>'
      + '<div class="ctxnote">Text and .txt / .md files are read and folded into the output. Other formats (pdf, docx, images, video, audio…) attach as named context.</div>'
      + '<button class="applybtn" id="losApply">Apply my context ↻</button></div>'
      + '<div id="losCtx"></div>';
    var fi = document.getElementById('losFiles');
    fi.addEventListener('change', function () {
      Array.prototype.forEach.call(fi.files, function (f) {
        var rec = { name: f.name, type: f.type || (f.name.split('.').pop() || 'file'), size: f.size, textContent: '' };
        if (/^text\//.test(f.type) || /\.(txt|md|csv|json)$/i.test(f.name)) {
          var rd = new FileReader(); rd.onload = function () { rec.textContent = String(rd.result || '').slice(0, 8000); renderFiles(); }; rd.readAsText(f);
        }
        _extra.files.push(rec);
      });
      fi.value = ''; renderFiles();
    });
    function renderFiles() {
      document.getElementById('losFileList').innerHTML = _extra.files.map(function (f, i) {
        var t = (f.type || '').split('/').pop() || f.type; return '<div class="fitem"><span class="ft">' + esc(t) + '</span>' + esc(f.name) + ' <span style="color:var(--ink-mute)">· ' + fmtSize(f.size) + (f.textContent ? ' · read' : '') + '</span><button class="rm" data-i="' + i + '">✕</button></div>';
      }).join('');
      Array.prototype.forEach.call(document.querySelectorAll('#losFileList .rm'), function (b) { b.addEventListener('click', function () { _extra.files.splice(+b.getAttribute('data-i'), 1); renderFiles(); }); });
    }
    document.getElementById('losApply').addEventListener('click', function () {
      extra(); showCtx();
      if (typeof rerun === 'function') rerun();
    });
  }
  function showCtx() {
    var host = document.getElementById('losCtx'); if (!host) return;
    var e = extra(); var bits = [];
    if (e.text) bits.push('note (' + e.text.length + ' chars)');
    if (e.files.length) bits.push(e.files.length + ' file' + (e.files.length > 1 ? 's' : '') + ': ' + e.files.map(function (f) { return f.name; }).join(', '));
    host.innerHTML = bits.length ? '<div class="ctxcard"><div class="k">✓ Your context is folded in</div><p>' + esc(bits.join(' · ')) + '. Text and readable files inform the output above; other files are attached as named context.</p></div>' : '';
  }
  // Fold the user's extra text (+ any read text files) into a brief string a
  // generator can append. Returns '' when nothing was added.
  function extraBrief() {
    var e = extra(); var parts = [];
    if (e.text) parts.push(e.text);
    e.files.forEach(function (f) { if (f.textContent) parts.push('[' + f.name + ']\n' + f.textContent); });
    return parts.join('\n\n').slice(0, 4000);
  }

  return { esc: esc, subject: subject, post: post, badge: badge, facts: facts, wireSubject: wireSubject, mountExtras: mountExtras, extra: extra, extraBrief: extraBrief, showCtx: showCtx, TOOLS: TOOLS };
})();
