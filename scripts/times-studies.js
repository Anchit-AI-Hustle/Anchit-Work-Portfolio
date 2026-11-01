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
//   The URLs the owner shared, /ET-study and /TimesHealth_Study, are not the
//   directory names, so they only work through a vercel.json rewrite. `serve`
//   ignores vercel.json, so the rewrites are read and asserted here.
//
// CSP
//   `serve` sends no headers. Every HTML response gets vercel.json's site-wide
//   policy injected, so a violation fails the run, as it would in production.
//
// Run against a served build:  node scripts/times-studies.js
// MUT=dash plants an em dash; the dash check must fail. MUT=orphan points one
// ET fix at a problem that does not exist; the mapping check must fail.
// MUT=filter makes the persona chips do nothing; the filter check must fail.
// MUT=quote strips the date from one Times Health quote; the source check
// must fail. MUT=route drops the /ET-study rewrite; the route check must fail.
const { chromium } = require('./_playwright.js');
const vercelReal = require('../vercel.json');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MUT = process.env.MUT || '';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '820', width: 820, height: 1180 },
  { name: '1440', width: 1440, height: 900 },
];

const PAGES = [
  { key: 'et', path: '/et-study/', publicUrl: '/ET-study', file: '/et-study/index.html', minProblems: 6, minFixes: 8 },
  { key: 'th', path: '/times-health-study/', publicUrl: '/TimesHealth_Study', file: '/times-health-study/index.html', minProblems: 6, minFixes: 8 },
];

const vercel = JSON.parse(JSON.stringify(vercelReal));
if (MUT === 'route') vercel.rewrites = vercel.rewrites.filter((r) => r.source !== '/ET-study');

const CSP = (() => {
  for (const h of vercel.headers) {
    if (h.source !== '/(.*)') continue;
    for (const x of h.headers) if (x.key === 'Content-Security-Policy') return x.value;
  }
  throw new Error('vercel.json has no site-wide Content-Security-Policy');
})();

function mutate(key, src) {
  if (MUT === 'dash' && key === 'et') return src.replace('</body>', '<p>one—two</p></body>');
  if (MUT === 'orphan' && key === 'et') return src.replace(/data-solves="([^"]*)"/, 'data-solves="P99"');
  if (MUT === 'filter') return src.replace('</body>', '<script>document.addEventListener("click",function(e){if(e.target.closest("[data-filter]"))e.stopImmediatePropagation();},true);</script></body>');
  if (MUT === 'quote' && key === 'th') return src.replace(/(<figcaption[^>]*>)([\s\S]*?)(<\/figcaption>)/, (m, a, b, c) => a + b.replace(/\b\d{1,2} [A-Z][a-z]{2} 20\d\d\b|\b[A-Z][a-z]{2} 20\d\d\b|\b20\d\d\b/g, '') + c);
  return src;
}

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
    const body = mutate(pg.key, await res.text());
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

  // Problem cards jump to their fixes.
  const jump = await page.$('[data-problem] a[href^="#fix-"]');
  check(`${L}: a problem links to its fixes`, !!jump, '');

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
  for (const pg of PAGES) {
    const r = (vercel.rewrites || []).find((x) => x.source === pg.publicUrl);
    check(`vercel.json rewrites ${pg.publicUrl} to ${pg.file}`, !!r && r.destination === pg.file, r ? r.destination : 'missing');
  }
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) for (const pg of PAGES) await run(browser, vp, pg);
  await browser.close();

  for (const [s, n, d] of results) console.log(`  ${s}  ${n}${d ? '  ' + d : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed${MUT ? `  [MUT=${MUT}]` : ''}`);
  process.exit(failed ? 1 : 0);
})();
