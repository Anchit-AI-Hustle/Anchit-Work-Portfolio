/* Lifecycle OS · shared tool-page helpers */
window.LOS = (function () {
  try { var t = localStorage.getItem('anchit-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch (e) {}
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  // Real D2C brands, one per industry, offered as ready-made subjects. Every
  // line below is quoted or condensed from the brand's own homepage (checked
  // Sep 2026), positioning only. No revenue, rates or results are claimed for
  // any of them, because none are public and inventing them would put false
  // numbers next to a real company's name. `wins` are the brand's own stated
  // promises, used as the "proof" line in generated assets.
  var BRANDS = [
    { brand: 'Glossier', url: 'glossier.com', industry: 'Beauty', category: 'Skincare & makeup',
      one: 'Glossier: "Skin First. Makeup Second." Beauty products inspired by real life.',
      wins: ['Skin First. Makeup Second.', 'Products inspired by real life', 'Beauty that celebrates freedom and being present'],
      audiences: ['First-time skincare buyers', 'Makeup-light everyday routine', 'Fragrance and gifting shoppers', 'Lapsed repeat buyers'],
      tags: ['#skincare', '#makeup'], cta: 'Shop now', mood: 'fresh, friendly, minimal' },
    { brand: 'Allbirds', url: 'allbirds.com', industry: 'Footwear', category: 'Everyday shoes from natural materials',
      one: 'Allbirds: "Wildly Comfortable. Super Natural." Everyday shoes made from wool, tree fiber and sugarcane.',
      wins: ['Wildly comfortable, all day', 'Designed for everyday wear', 'Natural materials: wool, tree fiber, sugarcane'],
      audiences: ['Comfort-first commuters', 'Sustainability-minded shoppers', 'Travellers', 'Repeat buyers due a new pair'],
      tags: ['#sneakers', '#sustainablefashion'], cta: 'Shop now', mood: 'calm, natural, understated' },
    { brand: 'Gymshark', url: 'gymshark.com', industry: 'Activewear', category: 'Gym & workout clothing',
      one: 'Gymshark: gym clothes built in the weight room, made to be sweated in.',
      wins: ['Built in the weight room', 'Functional, comfortable workout clothing', 'Founded with a love for training'],
      audiences: ['Lifters and gym regulars', 'New-to-training beginners', 'Matching-set shoppers', 'Lapsed members'],
      tags: ['#gymwear', '#training'], cta: 'Shop now', mood: 'bold, energetic, direct' },
    { brand: 'Warby Parker', url: 'warbyparker.com', industry: 'Eyewear', category: 'Glasses, sunglasses & contacts',
      one: 'Warby Parker: premium eyewear designed in-house, with lens coatings included.',
      wins: ['Free shipping and free 30-day returns', 'Premium eyewear, starting at $95', 'Frames designed in-house, lens coatings included'],
      audiences: ['First-time glasses buyers', 'Prescription renewals', 'Sunglasses shoppers', 'Contacts subscribers'],
      tags: ['#eyewear', '#glasses'], cta: 'Start with a quiz', mood: 'smart, warm, approachable' },
    { brand: 'Away', url: 'awaytravel.com', industry: 'Travel', category: 'Luggage & travel bags',
      one: 'Away: luggage built for modern travel, designed and tested by travel obsessives.',
      wins: ['Built for modern travel', 'Designed and tested by travel experts', 'Free returns on unused items for 100 days'],
      audiences: ['Frequent flyers', 'Holiday travellers', 'Gift buyers', 'Owners adding a second bag'],
      tags: ['#travel', '#luggage'], cta: 'Shop now', mood: 'clean, modern, optimistic' },
    { brand: "Harry's", url: 'harrys.com', industry: 'Grooming', category: 'Shaving & grooming',
      one: "Harry's: quality shaving and grooming products at a fair price.",
      wins: ['Quality shaving at a fair price', "If it's not better, we aren't launching it", 'High-performance products without overpaying'],
      audiences: ['Trial starters', 'Blade-refill subscribers', 'Skin and body add-on buyers', 'Lapsed subscribers'],
      tags: ['#shaving', '#grooming'], cta: 'Start shave trial', mood: 'straightforward, confident, friendly' },
    { brand: "The Farmer's Dog", url: 'thefarmersdog.com', industry: 'Pet', category: 'Fresh dog food',
      one: "The Farmer's Dog: \"Real food. Real difference.\" Human-grade fresh food made for dogs.",
      wins: ['Real food. Real difference.', 'Human-grade meat and veggies in simple recipes', 'Made to human-grade safety and quality standards'],
      audiences: ['New puppy owners', 'Owners switching from kibble', 'Active subscribers', 'Paused subscribers'],
      tags: ['#dogfood', '#doglife'], cta: 'See plans & pricing', mood: 'caring, honest, warm' },
    { brand: 'OLIPOP', url: 'drinkolipop.com', industry: 'Beverage', category: 'Prebiotic soda',
      one: 'OLIPOP: soda made with plant fiber and prebiotics, grounded in science.',
      wins: ['Made with plant fiber and prebiotics', 'Non-GMO, gluten-free and vegan', 'Grounded in science'],
      audiences: ['Soda switchers', 'Gut-health seekers', 'Variety-pack buyers', 'Flavour explorers'],
      tags: ['#prebioticsoda', '#guthealth'], cta: 'Find your flavor', mood: 'playful, nostalgic, upbeat' },
    { brand: 'Casper', url: 'casper.com', industry: 'Sleep', category: 'Mattresses & bedding',
      one: 'Casper: the best bed for better sleep, backed by a 100-night trial.',
      wins: ['100-night risk-free trial', '10-year limited warranty', 'Free mattress delivery'],
      audiences: ['Mattress researchers', 'New movers', 'Bedding add-on buyers', 'Owners due an upgrade'],
      tags: ['#sleep', '#mattress'], cta: 'Take the quiz', mood: 'soothing, reassuring, light' },
    { brand: 'Everlane', url: 'everlane.com', industry: 'Apparel', category: 'Responsibly made essentials',
      one: 'Everlane: responsibly crafted essentials, designed to last, at prices that make sense.',
      wins: ['Responsibly crafted, designed to last', 'Verified, traceable materials and factories', 'Beautiful essentials without traditional markups'],
      audiences: ['Wardrobe-basics buyers', 'Conscious shoppers', 'Denim and knitwear fans', 'Lapsed customers'],
      tags: ['#essentials', '#consciousfashion'], cta: 'Shop new arrivals', mood: 'clear, considered, transparent' },
  ];
  function norm(x) { return String(x || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '').replace(/[^a-z0-9.]+/g, ''); }
  function findBrand(brand, url) {
    var b = norm(brand), u = norm(url);
    for (var i = 0; i < BRANDS.length; i++) {
      var x = BRANDS[i];
      if ((b && b === norm(x.brand)) || (u && u === norm(x.url))) return x;
    }
    return null;
  }
  function subject() {
    try {
      var s = JSON.parse(localStorage.getItem('lifecycle-os-subject') || 'null');
      // The tools used to open on Anchit's own site; a subject saved from that
      // era is dropped so returning visitors land on a real brand too.
      if (s && /anchit/i.test(s.brand + ' ' + (s.url || ''))) { localStorage.removeItem('lifecycle-os-subject'); s = null; }
      if (s && s.brand) return s;
    } catch (e) {}
    return { brand: BRANDS[0].brand, url: BRANDS[0].url };
  }
  function saveSubject(brand, url) {
    try { localStorage.setItem('lifecycle-os-subject', JSON.stringify({ brand: brand, url: url })); } catch (e) {}
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
    var preset = findBrand(b, u);
    if (preset) return {
      anchit: false, preset: true, name: preset.brand, handle: preset.brand.toLowerCase().replace(/[^a-z0-9]+/g, ''), url: preset.url,
      industry: preset.industry, category: preset.category, one: preset.one, wins: preset.wins.slice(),
      audiences: preset.audiences.slice(), cta: preset.cta, mood: preset.mood, tags: preset.tags.slice(),
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

  // Brand picker: a row of ready-made subjects above the Subject field on every
  // tool page. Picking one fills the fields, remembers it for the other tools
  // and regenerates straight away, so each tool opens on a finished output.
  function mountBrandPicker() {
    var eb = document.getElementById('brand'), eu = document.getElementById('url');
    if (!eb || !eu || document.getElementById('losBrandPick')) return;
    var anchor = eb.closest('.subject, .form') || eb.parentNode;
    var wrap = document.createElement('div');
    wrap.className = 'brandpick'; wrap.id = 'losBrandPick';
    wrap.innerHTML = '<div class="bp-head"><span class="bp-lbl">Pick a brand</span>'
      + '<span class="bp-note">Real D2C brands · positioning quoted from each brand\u2019s own site · not affiliated</span></div>'
      + '<div class="bp-row" role="group" aria-label="Ready-made brands">'
      + BRANDS.map(function (x, i) {
          return '<button type="button" class="bp-chip" data-i="' + i + '" aria-pressed="false">'
            + '<span class="bp-ind">' + esc(x.industry) + '</span>' + esc(x.brand) + '</button>';
        }).join('') + '</div>';
    anchor.parentNode.insertBefore(wrap, anchor);
    function sync() {
      var cur = findBrand(eb.value, eu.value);
      Array.prototype.forEach.call(wrap.querySelectorAll('.bp-chip'), function (c) {
        c.setAttribute('aria-pressed', String(!!cur && BRANDS[+c.getAttribute('data-i')] === cur));
      });
    }
    wrap.addEventListener('click', function (e) {
      var c = e.target.closest('.bp-chip'); if (!c) return;
      var x = BRANDS[+c.getAttribute('data-i')];
      eb.value = x.brand; eu.value = x.url; saveSubject(x.brand, x.url); sync();
      fillBrief(x, true);
      eb.dispatchEvent(new Event('input', { bubbles: true }));
      var go = document.getElementById('go'); if (go) go.click();
    });
    eb.addEventListener('input', sync); eu.addEventListener('input', sync);
    // Typing your own brand is remembered for the other tools too.
    var t; function remember() { clearTimeout(t); t = setTimeout(function () { if (eb.value.trim()) saveSubject(eb.value.trim(), eu.value.trim()); }, 400); }
    eb.addEventListener('input', remember); eu.addEventListener('input', remember);
    var s = subject(); if (!eb.value || /anchit/i.test(eb.value)) { eb.value = s.brand; eu.value = s.url || ''; }
    sync();
    var cur = findBrand(eb.value, eu.value); if (cur) fillBrief(cur, false);
  }
  // Tools with a brief (Mailer Studio) get a ready-made one for the picked
  // brand, built only from that brand's own stated promise and audiences.
  var lastAutoBrief = '';
  function fillBrief(x, replace) {
    var br = document.getElementById('brief'); if (!br || br.tagName !== 'TEXTAREA') return;
    if (br.value.trim() && !(replace && br.value === lastAutoBrief)) return;
    lastAutoBrief = br.value = 'A welcome email for ' + x.audiences[0].toLowerCase() + ' at ' + x.brand + ', leading with "' + x.wins[0] + '" and closing on "' + x.cta + '".';
  }
  // Never let the picker take the tools down with it: LOS must always load.
  try { mountBrandPicker(); } catch (e) { if (window.console) console.warn('brand picker', e); }

  return { esc: esc, subject: subject, BRANDS: BRANDS, findBrand: findBrand, mountBrandPicker: mountBrandPicker, post: post, badge: badge, facts: facts, wireSubject: wireSubject, mountExtras: mountExtras, extra: extra, extraBrief: extraBrief, showCtx: showCtx, TOOLS: TOOLS };
})();
