// The two Times Internet studies, /ET-study (The Economic Times, ET Markets,
// ET Prime) and /TimesHealth_Study (Times Health+, its yoga programme and the
// Half Marathon), work at phone, tablet and desktop width under the site's
// real CSP.
//
// WHAT THIS GUARDS
//   Both pages are problem-first: every suggestion exists to fix a numbered
//   problem. That link lives in markup, `data-solves="P1 P3"` on a fix and
//   `data-problem="P1"` on a problem, and nothing else would notice if a fix
//   pointed at a problem that had been renumbered or deleted, or if a problem
//   was left with no fix at all. So both directions are checked.
//
//   The fix list filters by who feels the problem. The filter is the page's
//   one piece of logic, so it is driven for real: a persona chip must hide
//   every fix that does not serve that persona and show every one that does.
//
//   The owner's rules for these pages are checked on the rendered text: no em
//   or en dash, never the words GitHub or repository, and every user quote
//   carries a dated, linked source.
//
//   The URLs the owner shared, /ET-study and /TimesHealth_Study, are the
//   folder names, so Vercel serves them from disk. A rewrite to an .html
//   destination would 404 under cleanUrls, so none is allowed for them.
//
// CSP
//   `serve` sends no headers. Every HTML response gets vercel.json's site-wide
//   policy injected, so a violation fails the run, as it would in production.
//
// Run against a served build:  node scripts/times-studies.js
// MUT=dash plants an em dash; the dash check must fail. MUT=orphan points one
// ET fix at a problem that does not exist; the mapping check must fail.
// MUT=cancel makes ET's auto-renew cancel in one tap; MUT=member shows a
// pop-up to members; MUT=price hides the Times Health price before sign-up;
// MUT=renewal drifts the prototype's renewal maths from the study's figure.
// MUT=filter makes the persona chips do nothing; the filter check must fail.
// MUT=quote strips the date from one Times Health quote; the source check
// must fail. MUT=route looks for the ET study under a lower-case URL; the route check
// must fail.
const { chromium } = require('./_playwright.js');
const vercelReal = require('../vercel.json');
const fs = require('fs');
const path = require('path');
const WWW = path.join(__dirname, '..', 'www');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MUT = process.env.MUT || '';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '820', width: 820, height: 1180 },
  { name: '1440', width: 1440, height: 900 },
];

const PROTOS = [
  { key: 'et', path: '/ET-study/prototype', publicUrl: '/ET-study/prototype', study: '/ET-study' },
  { key: 'th', path: '/TimesHealth_Study/prototype', publicUrl: '/TimesHealth_Study/prototype', study: '/TimesHealth_Study' },
];
const PAGES = [
  { key: 'et', path: '/ET-study', publicUrl: '/ET-study', minProblems: 6, minFixes: 8 },
  { key: 'th', path: '/TimesHealth_Study', publicUrl: '/TimesHealth_Study', minProblems: 6, minFixes: 8 },
];

const vercel = JSON.parse(JSON.stringify(vercelReal));

const CSP = (() => {
  for (const h of vercel.headers) {
    if (h.source !== '/(.*)') continue;
    for (const x of h.headers) if (x.key === 'Content-Security-Policy') return x.value;
  }
  throw new Error('vercel.json has no site-wide Content-Security-Policy');
})();

function mutate(key, src, path) {
  if (path && path.includes('prototype')) {
    if (MUT === 'cancel' && key === 'et') return src.replace("if(renew){$('#confirm').hidden=false;$('#confirm-yes').focus();}", "if(renew){renew=false;renderTimeline();}");
    if (MUT === 'member' && key === 'et') return src.replace("offer:'None. No sale banners", "pop:true,offer:'None. No sale banners").replace("pill:'Member',pop:false", "pill:'Member'");
    if (MUT === 'price' && key === 'th') return src.replace("d.appendChild(el('b',null,x[1]))", "d.appendChild(el('b',null,'Sign up to see'))");
    if (MUT === 'renewal' && key === 'et') return src.replace('value="2699"', 'value="2999"');
    return src;
  }
  if (MUT === 'dash' && key === 'et') return src.replace('</body>', '<p>one—two</p></body>');
  if (MUT === 'orphan' && key === 'et') return src.replace(/data-solves="([^"]*)"/, 'data-solves="P99"');
  if (MUT === 'filter') return src.replace('</body>', '<script>document.addEventListener("click",function(e){if(e.target.closest("[data-filter]"))e.stopImmediatePropagation();},true);</script></body>');
  if (MUT === 'quote' && key === 'th') return src.replace(/(<figcaption[^>]*>)([\s\S]*?)(<\/figcaption>)/, (m, a, b, c) => a + b.replace(/\b\d{1,2} [A-Z][a-z]{2} 20\d\d\b|\b[A-Z][a-z]{2} 20\d\d\b|\b20\d\d\b/g, '') + c);
  return src;
}

let studyRenewal = NaN, protoRenewal = NaN;
const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail == null ? '' : String(detail)]);

async function open(browser, vp, pg) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const bag = { errors: [], failed: [] };
  await ctx.route('**/*', async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    if (!(headers['content-type'] || '').includes('text/html')) return route.fulfill({ response: res });
    headers['content-security-policy'] = CSP;
    const body = mutate(pg.key, await res.text(), new URL(route.request().url()).pathname);
    return route.fulfill({ response: res, headers, body });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') bag.errors.push(m.text()); });
  page.on('pageerror', (e) => bag.errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => bag.failed.push(r.url() + ' ' + (r.failure() || {}).errorText));
  page.on('response', (r) => { if (r.status() >= 400) bag.failed.push(r.url() + ' HTTP ' + r.status()); });
  const res = await page.goto(BASE + pg.path, { waitUntil: 'networkidle' });
  return { ctx, page, bag, status: res.status() };
}

async function common(L, page, bag) {
  const text = await rendered(page);
  const d = text.match(/.{0,30}[\u2013\u2014].{0,30}/g) || [];
  check(`${L}: no em/en dash`, d.length === 0, d.join(' | '));
  const f = text.match(/.{0,30}\b(git\s?hub|repositor(?:y|ies)|repos?)\b.{0,30}/gi) || [];
  check(`${L}: never names GitHub or a repository`, f.length === 0, f.join(' | '));
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${L}: no horizontal page scroll`, over <= 0, over + 'px');
  await page.waitForTimeout(250);
  check(`${L}: zero console errors (CSP on)`, bag.errors.length === 0, bag.errors.join(' | '));
  check(`${L}: zero failed requests`, bag.failed.length === 0, bag.failed.join(' | '));
}

async function tabsWork(L, page) {
  const ids = await page.$$eval('[role=tab]', (ts) => ts.map((t) => t.getAttribute('aria-controls')));
  const bad = [];
  for (const id of ids) {
    await page.click(`[role=tab][aria-controls="${id}"]`);
    const vis = await page.$$eval('[role=tabpanel]', (ps) => ps.filter((p) => !p.hidden).map((p) => p.id));
    if (vis.length !== 1 || vis[0] !== id) bad.push(id + '->' + vis.join(','));
  }
  check(`${L}: each tab shows only its own panel`, ids.length >= 4 && bad.length === 0, bad.join(' ') || ids.join(','));
  return ids;
}

async function protoET(browser, vp, pg) {
  const L = `[${vp.name}] ${pg.publicUrl}`;
  const { ctx, page, bag, status } = await open(browser, vp, pg);
  check(`${L}: HTTP 200`, status === 200, status);
  check(`${L}: says its data is fictional`, /fictional demo data/i.test(await page.textContent('.notice')), '');
  check(`${L}: links back to the study`, (await page.$$(`a[href^="${pg.study}"]`)).length > 0, '');
  await tabsWork(L, page);

  // My Stocks: the feed is exactly the stories about the picked holdings.
  await page.click('[role=tab][aria-controls="stocks"]');
  const feedMatches = async () => page.evaluate(() => {
    const picked = [...document.querySelectorAll('#holdings [aria-pressed="true"]')].map((b) => b.dataset.co);
    const shown = [...document.querySelectorAll('#feed [data-story]')].map((a) => a.dataset.story);
    return { picked, ok: shown.every((c) => picked.includes(c)) && picked.every((c) => shown.includes(c)), n: shown.length, label: document.querySelector('#feed-count').textContent };
  });
  let r = await feedMatches();
  await page.click('#holdings [data-co="kon"]');
  let r2 = await feedMatches();
  check(`${L}: My Stocks feed follows the holdings`, r.ok && r2.ok && r2.n === r.n + 1 && r2.label.startsWith(String(r2.n)), JSON.stringify([r, r2]));
  for (const c of r2.picked) await page.click(`#holdings [data-co="${c}"]`);
  check(`${L}: no holdings shows an empty state, not a blank`, (await page.$$('#feed .empty')).length === 1, '');

  // Member hub: cancelling takes two taps, and says what happens.
  await page.click('[role=tab][aria-controls="hub"]');
  await page.click('#cancel');
  const after1 = (await page.textContent('#m-renew')).trim();
  const confirmShown = await page.isVisible('#confirm');
  await page.click('#confirm-yes');
  const after2 = (await page.textContent('#m-renew')).trim();
  check(`${L}: auto-renew turns off in exactly two taps`, after1 === 'On' && confirmShown && after2 === 'Off', `${after1} ${confirmShown} ${after2}`);
  check(`${L}: the reminder timeline drops the charge once cancelled`, !/charged/i.test(await page.textContent('#timeline')), '');
  await page.click('#restore');
  await page.waitForTimeout(1200);
  check(`${L}: restore access shows each step`, (await page.$$('#restore-log li.ok')).length === 3, '');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }).catch(() => null), page.click('#invoice')]);
  check(`${L}: the invoice downloads without an email`, !!dl && /invoice/.test(dl.suggestedFilename()), dl ? dl.suggestedFilename() : 'no download');

  // Who sees what: a member is never sold to; today's member is, for contrast.
  await page.click('[role=tab][aria-controls="rules"]');
  await page.click('#who [data-who="member"]');
  const mem = await page.evaluate(() => ({
    pop: !document.querySelector('#ph-pop').hidden,
    adTop: !!document.querySelector('#ph-body [data-ph="ad-top"]'),
    wall: !!document.querySelector('#ph-body [data-ph="wall"]'),
    call: document.querySelector('[data-rule="call"] td').textContent,
    offer: document.querySelector('[data-rule="offer"] td').textContent,
  }));
  check(`${L}: a member sees no pop-up, top ad, paywall, offer or sales call`, !mem.pop && !mem.adTop && !mem.wall && /^Never/.test(mem.call) && /^None/.test(mem.offer), JSON.stringify(mem));
  await page.click('#who [data-who="today"]');
  check(`${L}: the "member today" contrast shows the pop-up`, await page.isVisible('#ph-pop'), '');
  await page.click('#who [data-who="asked"]');
  check(`${L}: someone who asked for a call gets one, with limits`, /24 hours/.test(await page.textContent('[data-rule="call"] td')), '');

  // Renewal maths, default inputs.
  await page.click('[role=tab][aria-controls="maths"]');
  const tot = (await page.textContent('[data-testid="et-renewal-total"]')) || '';
  const m = /₹\s*([\d.]+)\s*lakh/.exec(tot);
  protoRenewal = m ? parseFloat(m[1]) : NaN;

  // Deep link straight to a view.
  await page.goto(BASE + pg.path + '#hub', { waitUntil: 'networkidle' });
  check(`${L}: #hub deep-links to the member hub`, !(await page.$eval('#hub', (n) => n.hidden)), '');
  await common(L, page, bag);
  await ctx.close();
}

async function protoTH(browser, vp, pg) {
  const L = `[${vp.name}] ${pg.publicUrl}`;
  const { ctx, page, bag, status } = await open(browser, vp, pg);
  check(`${L}: HTTP 200`, status === 200, status);
  check(`${L}: says prices are illustrative and it is not medical advice`, /illustrative/i.test(await page.textContent('.notice')) && /not medical advice/i.test(await page.textContent('.notice')), '');
  check(`${L}: links back to the study`, (await page.$$(`a[href^="${pg.study}"]`)).length > 0, '');
  await tabsWork(L, page);

  // Start: price and class times are visible before any sign-up.
  await page.click('[role=tab][aria-controls="start"]');
  const plans = await page.$$eval('#plans [data-plan]', (ps) => ps.map((p) => p.textContent));
  check(`${L}: price is on screen before sign-up`, plans.length >= 1 && plans.every((t) => /₹\s?[\d,]+/.test(t)), plans.join(' | '));
  const slot1 = await page.$$eval('#slots [data-slot]', (s) => s.map((x) => x.dataset.slot));
  check(`${L}: evening picks an evening batch as default`, slot1[0] === '4:45 PM', slot1.join(','));
  await page.click('#windows [data-v="evening"]');
  check(`${L}: no free time that fits falls back to catch-up`, (await page.$$eval('#slots [data-slot]', (s) => s.map((x) => x.dataset.slot))).join() === 'none', '');
  await page.click('#windows [data-v="morning"]');
  await page.click('#goals [data-v="sugar"]');
  const sugar = { name: await page.textContent('#prog-name'), safety: await page.isVisible('#safety'), slot: await page.$eval('#slots [data-slot]', (x) => x.dataset.slot) };
  check(`${L}: a condition gets its programme and a safety note`, /12-week/.test(sugar.name) && sugar.safety && sugar.slot === '8:00 AM', JSON.stringify(sugar));
  await page.click('#goals [data-v="fit"]');
  check(`${L}: general fitness shows no medical note`, !(await page.isVisible('#safety')), '');

  // My week: two misses in a row bring the catch-up; doing it logs a catch-up.
  await page.click('[role=tab][aria-controls="week"]');
  const n0 = await page.isVisible('#nudge');
  await page.click('#days [data-day="3"]'); // planned -> live
  await page.click('#days [data-day="3"]'); // -> catchup
  await page.click('#days [data-day="3"]'); // -> missed
  const n1 = await page.isVisible('#nudge');
  const c1 = +(await page.textContent('#st-catch'));
  await page.click('#nudge-do');
  const c2 = +(await page.textContent('#st-catch'));
  check(`${L}: two misses in a row bring a catch-up, which counts`, !n0 && n1 && c2 === c1 + 1 && !(await page.isVisible('#nudge')), `${n0} ${n1} ${c1}->${c2}`);

  // Race plan: weeks are counted from the demo today to the published date.
  await page.click('[role=tab][aria-controls="race"]');
  const wk = +(await page.textContent('[data-testid="th-weeks"]'));
  const items = await page.$$eval('#plan li', (l) => l.map((x) => x.dataset.week));
  check(`${L}: Mumbai 14 Feb 2027 is 15 weeks, one row a week plus after`, wk === 15 && items.length === 16 && items[15] === 'after', `${wk} weeks, ${items.length} rows`);
  check(`${L}: a long enough runway shows no warning`, !(await page.isVisible('#race-warn')), '');
  await page.selectOption('#city', 'blr');
  await page.click('#dist [data-v="21.1"]');
  check(`${L}: a first-timer 21.1K in 7 weeks is warned`, (await page.isVisible('#race-warn')) && +(await page.textContent('[data-testid="th-weeks"]')) === 7, '');

  // Business view: the funnel multiplies out.
  await page.click('[role=tab][aria-controls="biz"]');
  const mem = (await page.textContent('[data-testid="th-members"]')).replace(/,/g, '');
  check(`${L}: default funnel gives 1,200 members (15,000 x 4 x 40% x 20% x 25%)`, mem.trim() === '1200', mem);

  await page.goto(BASE + pg.path + '#race', { waitUntil: 'networkidle' });
  check(`${L}: #race deep-links to the race plan`, !(await page.$eval('#race', (n) => n.hidden)), '');
  await common(L, page, bag);
  await ctx.close();
}

const rendered = (page) => page.evaluate(() => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return document.title + '\n' + c.textContent + '\n' + document.body.innerText;
});

async function run(browser, vp, pg) {
  const L = `[${vp.name}] ${pg.publicUrl}`;
  const { ctx, page, bag, status } = await open(browser, vp, pg);
  check(`${L}: HTTP 200`, status === 200, status);

  const text = await rendered(page);
  const d = text.match(/.{0,30}[–—].{0,30}/g) || [];
  check(`${L}: no em/en dash`, d.length === 0, d.join(' | '));
  const f = text.match(/.{0,30}\b(git\s?hub|repositor(?:y|ies)|repos?)\b.{0,30}/gi) || [];
  check(`${L}: never names GitHub or a repository`, f.length === 0, f.join(' | '));
  const gh = await page.$$eval('a[href*="github.com"]', (as) => as.length);
  check(`${L}: no link to GitHub`, gh === 0, gh);

  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${L}: no horizontal page scroll`, over <= 0, over + 'px');

  // Sections the study is built around, each reachable from the nav.
  const nav = await page.$$eval('#links a', (as) => as.map((a) => a.getAttribute('href')));
  const missingTargets = await page.evaluate((hrefs) => hrefs.filter((h) => !document.querySelector(h)), nav);
  check(`${L}: every nav link lands on a section`, nav.length >= 6 && missingTargets.length === 0, missingTargets.join(',') || nav.length + ' links');
  for (const id of ['#problems', '#voices', '#fixes', '#measure', '#me']) {
    check(`${L}: has ${id}`, !!(await page.$(id)), '');
  }

  // Problems and fixes point at each other.
  const map = await page.evaluate(() => {
    const probs = [...document.querySelectorAll('[data-problem]')].map((n) => n.dataset.problem);
    const fixes = [...document.querySelectorAll('[data-solves]')].map((n) => ({ id: n.dataset.fix, solves: n.dataset.solves.split(/\s+/).filter(Boolean), who: (n.dataset.who || '').split(/\s+/).filter(Boolean) }));
    return { probs, fixes };
  });
  const probSet = new Set(map.probs);
  const orphanFix = map.fixes.filter((x) => !x.solves.length || x.solves.some((p) => !probSet.has(p)));
  const unsolved = map.probs.filter((p) => !map.fixes.some((x) => x.solves.includes(p)));
  check(`${L}: at least ${pg.minProblems} numbered problems, unique`, map.probs.length >= pg.minProblems && probSet.size === map.probs.length, map.probs.join(','));
  check(`${L}: at least ${pg.minFixes} fixes`, map.fixes.length >= pg.minFixes, map.fixes.length);
  check(`${L}: every fix solves a problem that exists`, orphanFix.length === 0, orphanFix.map((x) => x.id + '->' + x.solves.join('+')).join(', '));
  check(`${L}: every problem has at least one fix`, unsolved.length === 0, unsolved.join(','));
  const noWho = map.fixes.filter((x) => !x.who.length);
  check(`${L}: every fix names who it serves`, noWho.length === 0, noWho.map((x) => x.id).join(','));

  // Persona filter: pick each chip, the visible set must be exactly the fixes
  // tagged with it; "all" brings every fix back.
  const chips = await page.$$eval('[data-filter]', (bs) => bs.map((b) => b.dataset.filter));
  check(`${L}: persona filter has an "all" chip and at least three personas`, chips.includes('all') && chips.length >= 4, chips.join(','));
  const filterBad = [];
  for (const who of chips) {
    await page.click(`[data-filter="${who}"]`);
    await page.waitForTimeout(60);
    const r = await page.evaluate((w) => {
      const rows = [...document.querySelectorAll('[data-solves]')];
      const want = rows.filter((n) => w === 'all' || n.dataset.who.split(/\s+/).includes(w));
      const shown = rows.filter((n) => n.offsetParent !== null || n.getClientRects().length > 0);
      const pressed = document.querySelector(`[data-filter="${w}"]`).getAttribute('aria-pressed');
      const count = (document.querySelector('[data-fix-count]') || {}).textContent || '';
      return { want: want.length, shown: shown.length, same: want.every((n) => shown.includes(n)) && shown.length === want.length, pressed, count };
    }, who);
    if (!r.same || r.pressed !== 'true' || !r.count.includes(String(r.want))) filterBad.push(`${who}: want ${r.want} shown ${r.shown} pressed ${r.pressed} count "${r.count}"`);
  }
  await page.click('[data-filter="all"]');
  check(`${L}: persona filter shows exactly the matching fixes`, filterBad.length === 0, filterBad.join(' | '));

  // Problem cards jump to their fixes: the list narrows to exactly the fixes
  // that solve that problem.
  const jumpOk = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('[data-problem] [data-jump]')) {
      a.click();
      const p = a.dataset.jump;
      const rows = [...document.querySelectorAll('[data-solves]')];
      const shown = rows.filter((n) => !n.hidden).map((n) => n.dataset.fix);
      const want = rows.filter((n) => n.dataset.solves.split(/\s+/).includes(p)).map((n) => n.dataset.fix);
      if (shown.join() !== want.join() || !shown.length) out.push(p + ': ' + shown.join('+') + ' vs ' + want.join('+'));
    }
    document.querySelector('[data-filter="all"]').click();
    return { n: document.querySelectorAll('[data-problem] [data-jump]').length, bad: out };
  });
  check(`${L}: every problem card narrows the fix list to its own fixes`, jumpOk.n === map.probs.length && jumpOk.bad.length === 0, jumpOk.bad.join(' | ') || jumpOk.n + ' cards');

  // User needs and the prototype are part of the study, and linked.
  check(`${L}: has #needs with at least four users`, (await page.$$('#needs .need')).length >= 4, '');
  const protoHrefs = await page.$$eval(`a[href^="${pg.publicUrl}/prototype"]`, (as) => as.length);
  check(`${L}: links to its prototype at least twice`, protoHrefs >= 2, protoHrefs);
  if (pg.key === 'et') {
    const t = (await page.textContent('#measure')) || '';
    const m = /about\s*<?b?>?\s*₹\s*([\d.]+)\s*lakh a year/i.exec(t.replace(/\s+/g, ' '));
    studyRenewal = m ? parseFloat(m[1]) : NaN;
  }

  // User quotes: verbatim, dated, linked.
  const quotes = await page.$$eval('#voices figure', (fs) => fs.map((f) => ({
    q: (f.querySelector('blockquote') || {}).textContent || '',
    cap: (f.querySelector('figcaption') || {}).textContent || '',
    link: !!f.querySelector('figcaption a[href^="http"]'),
  })));
  const badQ = quotes.filter((x) => !x.q.trim() || !/\b20\d\d\b/.test(x.cap) || !x.link);
  check(`${L}: at least four user quotes`, quotes.length >= 4, quotes.length);
  check(`${L}: every quote is dated and linked to its source`, badQ.length === 0, badQ.map((x) => x.cap.trim().slice(0, 50)).join(' | '));

  // External links open safely; sources are listed.
  const unsafe = await page.$$eval('a[target="_blank"]', (as) => as.filter((a) => !/noopener/.test(a.rel)).map((a) => a.href));
  check(`${L}: every new-tab link has rel=noopener`, unsafe.length === 0, unsafe.join(' '));
  const sources = await page.$$eval('footer a[href^="http"]', (as) => as.length);
  check(`${L}: footer lists at least 10 sources`, sources >= 10, sources);

  // Independence is stated up front.
  const notice = (await page.textContent('.notice')) || '';
  check(`${L}: states it is independent and uses public information only`, /independent/i.test(notice) && /public/i.test(notice) && /not affiliated/i.test(notice), notice.slice(0, 80));

  await page.waitForTimeout(250);
  check(`${L}: zero console errors (CSP on)`, bag.errors.length === 0, bag.errors.join(' | '));
  check(`${L}: zero failed requests`, bag.failed.length === 0, bag.failed.join(' | '));
  await ctx.close();
}

(async () => {
  // The owner's URLs are served straight from disk: folders named exactly
  // /ET-study and /TimesHealth_Study. A vercel.json rewrite to an .html file
  // 404s under cleanUrls (routes-resolve.js fails the build for one).
  for (const pg of [...PAGES, ...PROTOS]) {
    const isPage = PAGES.includes(pg);
    const url = MUT === 'route' && pg.key === 'et' ? pg.publicUrl.toLowerCase() : pg.publicUrl;
    const ok = fs.existsSync(isPage ? path.join(WWW, url, 'index.html') : path.join(WWW, url + '.html'));
    check(`${pg.publicUrl} is a built file in www/, no rewrite needed`, ok, ok ? '' : 'missing for ' + url);
    const rw = (vercel.rewrites || []).filter((r) => r.source.toLowerCase().startsWith(pg.publicUrl.toLowerCase()));
    check(`${pg.publicUrl} has no vercel.json rewrite to break it`, rw.length === 0, rw.map((r) => r.source).join(','));
  }
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    for (const pg of PAGES) await run(browser, vp, pg);
    await protoET(browser, vp, PROTOS[0]);
    await protoTH(browser, vp, PROTOS[1]);
  }
  await browser.close();
  check('the ET study quotes the prototype\'s renewal maths (one point of renewal)',
    Number.isFinite(studyRenewal) && Number.isFinite(protoRenewal) && Math.abs(studyRenewal - protoRenewal) < 1,
    `study about ₹${studyRenewal} lakh, prototype ₹${protoRenewal} lakh`);

  for (const [s, n, d] of results) console.log(`  ${s}  ${n}${d ? '  ' + d : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed${MUT ? `  [MUT=${MUT}]` : ''}`);
  process.exit(failed ? 1 : 0);
})();
