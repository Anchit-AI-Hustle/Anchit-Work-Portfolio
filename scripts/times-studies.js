// The two Times Internet studies, /ET_Study (The Economic Times, ET Markets,
// ET Prime) and /TimesHealth_Study (Times Health+, its yoga and diet plans and
// the Half Marathon), and their prototypes, at phone, tablet and desktop width
// under the site's real CSP.
//
// SHAPE
//   Each study is seven pages (overview, users, problems, evidence, fixes,
//   plan, about) and each prototype four, one per tab. Every page carries the
//   same nav, so the nav is checked on every page: every link lands, the
//   current page is marked, and nothing scrolls sideways.
//
// WHAT THIS GUARDS
//   Both studies are problem-first: every fix exists to solve a numbered
//   problem. Problems live on one page and fixes on another, so the fixes page
//   carries a legend of the problems, and both directions are checked against
//   the problems page itself: no fix may point at a problem that does not
//   exist, and no problem may be left without a fix. Problem cards link to the
//   fixes page with #P3, which must narrow the list to that problem's fixes.
//
//   The prototypes are driven for real: the My Stocks feed follows holdings,
//   cancelling takes exactly two taps, members are never sold to, the Times
//   Health price shows before sign-up, the goal chosen on Start is the one the
//   week page tracks, the race plan is held back when the runway is too short,
//   and the ET study quotes the prototype's own renewal maths.
//
//   The owner's rules hold on every page: no em or en dash, never the words
//   GitHub or repository, every user quote dated and linked.
//
// Run against a served build:  node scripts/times-studies.js
// MUT=dash plants an em dash; MUT=orphan points one ET fix at a problem that
// does not exist; MUT=filter makes the persona chips do nothing; MUT=quote
// strips the date from one Times Health quote; MUT=route looks for the ET
// study under a lower-case URL; MUT=cancel makes cancelling one tap; MUT=member
// shows members a pop-up; MUT=price hides the Times Health price; MUT=renewal
// drifts the prototype's renewal maths; MUT=nav drops a page from one nav.
// Each must turn the run red.
const { chromium } = require('./_playwright.js');
const vercel = require('../vercel.json');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MUT = process.env.MUT || '';
const WWW = path.join(__dirname, '..', 'www');

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '820', width: 820, height: 1180 },
  { name: '1440', width: 1440, height: 900 },
];
const PAGES = ['', '/users', '/problems', '/evidence', '/fixes', '/plan', '/about'];
const STUDIES = [
  { key: 'et', base: '/ET_Study', proto: ['', '/hub', '/rules', '/maths'] },
  { key: 'th', base: '/TimesHealth_Study', proto: ['', '/week', '/race', '/business'] },
];

const CSP = (() => {
  for (const h of vercel.headers) {
    if (h.source !== '/(.*)') continue;
    for (const x of h.headers) if (x.key === 'Content-Security-Policy') return x.value;
  }
  throw new Error('vercel.json has no site-wide Content-Security-Policy');
})();

function mutate(p, src) {
  if (MUT === 'dash' && p === '/ET_Study') return src.replace('</body>', '<p>one—two</p></body>');
  if (MUT === 'orphan' && p === '/ET_Study/fixes') return src.replace(/data-solves="([^"]*)"/, 'data-solves="P99"');
  if (MUT === 'filter' && /\/fixes$/.test(p)) return src.replace('</body>', '<script>document.addEventListener("click",function(e){if(e.target.closest("[data-filter]"))e.stopImmediatePropagation();},true);</script></body>');
  if (MUT === 'quote' && p === '/TimesHealth_Study/problems') return src.replace(/(<figcaption[^>]*>)([\s\S]*?)(<\/figcaption>)/, (m, a, b, c) => a + b.replace(/\b\d{1,2} [A-Z][a-z]{2} 20\d\d\b|\b[A-Z][a-z]{2} 20\d\d\b|\b20\d\d\b/g, '') + c);
  if (MUT === 'nav' && p === '/TimesHealth_Study/plan') return src.replace(/<a href="\/TimesHealth_Study\/evidence">Evidence<\/a>/, '');
  if (MUT === 'renewal' && p === '/ET_Study/prototype/maths') return src.replace('value="2699"', 'value="2999"');
  return src;
}
function mutateJs(p, src) {
  if (MUT === 'cancel' && p === '/ET_Study/prototype/proto.js') return src.replace("if(renew){$('#confirm').hidden=false;$('#confirm-yes').focus();}", 'if(renew){renew=false;renderTimeline();}');
  if (MUT === 'member' && p === '/ET_Study/prototype/proto.js') return src.replace("offer:'None. No sale banners", "pop:true,offer:'None. No sale banners").replace("pill:'Member',pop:false", "pill:'Member'");
  if (MUT === 'price' && p === '/TimesHealth_Study/prototype/proto.js') return src.replace("d.appendChild(el('b',null,x[1]))", "d.appendChild(el('b',null,'Sign up to see'))");
  return src;
}

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail == null ? '' : String(detail)]);
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function context(browser, vp) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  await ctx.route('**/*', async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    const p = new URL(route.request().url()).pathname.replace(/\/$/, '') || '/';
    const ct = headers['content-type'] || '';
    if (ct.includes('javascript')) return route.fulfill({ response: res, headers, body: mutateJs(p, await res.text()) });
    if (!ct.includes('text/html')) return route.fulfill({ response: res });
    headers['content-security-policy'] = CSP;
    return route.fulfill({ response: res, headers, body: mutate(p, await res.text()) });
  });
  return ctx;
}

async function open(ctx, url) {
  const page = await ctx.newPage();
  const bag = { errors: [], failed: [] };
  page.on('console', (m) => { if (m.type() === 'error') bag.errors.push(m.text()); });
  page.on('pageerror', (e) => bag.errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => bag.failed.push(r.url() + ' ' + (r.failure() || {}).errorText));
  page.on('response', (r) => { if (r.status() >= 400) bag.failed.push(r.url() + ' HTTP ' + r.status()); });
  const res = await page.goto(BASE + url, { waitUntil: 'networkidle' });
  return { page, bag, status: res.status() };
}

const rendered = (page) => page.evaluate(() => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return document.title + '\n' + c.textContent + '\n' + document.body.innerText;
});

// Rules every page keeps.
async function common(L, page, bag, status) {
  check(`${L}: HTTP 200`, status === 200, status);
  const text = await rendered(page);
  const d = text.match(/.{0,30}[–—].{0,30}/g) || [];
  check(`${L}: no em/en dash`, d.length === 0, d.join(' | '));
  const f = text.match(/.{0,30}\b(git\s?hub|repositor(?:y|ies)|repos?)\b.{0,30}/gi) || [];
  check(`${L}: never names GitHub or a repository`, f.length === 0, f.join(' | '));
  check(`${L}: no link to GitHub`, (await page.$$('a[href*="github.com"]')).length === 0, '');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(`${L}: no horizontal page scroll`, over <= 0, over + 'px');
  check(`${L}: exactly one h1`, (await page.$$('h1')).length === 1, '');
  const unsafe = await page.$$eval('a[target="_blank"]', (as) => as.filter((a) => !/noopener/.test(a.rel)).map((a) => a.href));
  check(`${L}: every new-tab link has rel=noopener`, unsafe.length === 0, unsafe.join(' '));
  const notice = (await page.textContent('.notice')) || '';
  check(`${L}: states it is independent and not affiliated`, /independent/i.test(notice) && /not affiliated/i.test(notice), '');
  await page.waitForTimeout(200);
  check(`${L}: zero console errors (CSP on)`, bag.errors.length === 0, bag.errors.join(' | '));
  check(`${L}: zero failed requests`, bag.failed.length === 0, bag.failed.join(' | '));
}

let studyRenewal = NaN, protoRenewal = NaN;

async function study(browser, vp, st) {
  const ctx = await context(browser, vp);
  let problemList = [];
  for (const sub of PAGES) {
    const url = st.base + sub;
    const L = `[${vp.name}] ${url}`;
    const { page, bag, status } = await open(ctx, url);
    await common(L, page, bag, status);

    // The nav reaches every page and marks this one.
    const nav = await page.$$eval('#links a', (as) => as.map((a) => ({ h: a.getAttribute('href'), cur: a.getAttribute('aria-current') })));
    const want = [...PAGES.map((p) => st.base + p), st.base + '/prototype'];
    const missing = want.filter((h) => !nav.some((n) => n.h === h));
    check(`${L}: nav links every page and the prototype`, missing.length === 0, missing.join(','));
    const cur = nav.filter((n) => n.cur === 'page').map((n) => n.h);
    check(`${L}: nav marks this page as current`, cur.length === 1 && cur[0] === url, cur.join(','));
    check(`${L}: footer lists at least 10 sources`, (await page.$$('footer a[href^="http"]')).length >= 10, '');

    if (sub === '') {
      check(`${L}: opens with what it is, what goes wrong, what I would do`, (await page.$$('header .short .card')).length === 3, '');
      const cards = await page.$$eval('#pages a', (as) => as.map((a) => a.getAttribute('href')));
      check(`${L}: page-by-page cards link every page`, PAGES.slice(1).every((p) => cards.includes(st.base + p)) && cards.includes(st.base + '/prototype'), cards.join(','));
    } else {
      check(`${L}: breadcrumb leads back to the overview`, !!(await page.$(`.crumb a[href="${st.base}"]`)), '');
      check(`${L}: previous and next links`, (await page.$$('.pager a')).length === 2, '');
    }
    if (sub === '/users') check(`${L}: at least four users`, (await page.$$('.need')).length >= 4, '');
    if (sub === '/problems') {
      problemList = await page.$$eval('[data-problem]', (n) => n.map((x) => x.dataset.problem));
      check(`${L}: at least six numbered problems, unique`, problemList.length >= 6 && new Set(problemList).size === problemList.length, problemList.join(','));
      const links = await page.$$eval('[data-problem] a.jump', (as) => as.map((a) => a.getAttribute('href')));
      check(`${L}: every problem links to its fixes`, problemList.every((p) => links.includes(`${st.base}/fixes#${p}`)), links.join(','));
      const q = await page.$$eval('#voices figure', (fs) => fs.map((f) => ({
        q: (f.querySelector('blockquote') || {}).textContent || '',
        cap: (f.querySelector('figcaption') || {}).textContent || '',
        link: !!f.querySelector('figcaption a[href^="http"]'),
      })));
      const bad = q.filter((x) => !x.q.trim() || !/\b20\d\d\b/.test(x.cap) || !x.link);
      check(`${L}: at least four quotes, each dated and linked`, q.length >= 4 && bad.length === 0, bad.map((x) => x.cap.slice(0, 50)).join(' | '));
    }
    if (sub === '/evidence') check(`${L}: has today's offer, the audit and the competition`, !!(await page.$('#today')) && !!(await page.$('#audit-tbl')) && !!(await page.$('#compete')), '');
    if (sub === '/fixes') await fixesPage(L, page, problemList);
    if (sub === '/plan' && st.key === 'et') {
      const m = /about\s*₹\s*([\d.]+)\s*lakh a year/i.exec(norm(await page.textContent('#measure')));
      studyRenewal = m ? parseFloat(m[1]) : NaN;
    }
    await page.close();
  }
  // A link from a problem card lands with only that problem's fixes showing.
  const { page } = await open(ctx, `${st.base}/fixes#P2`);
  const p2 = await page.evaluate(() => [...document.querySelectorAll('[data-solves]')].every((n) => n.hidden === !n.dataset.solves.split(/\s+/).includes('P2')));
  check(`[${vp.name}] ${st.base}/fixes#P2: arrives showing only the fixes for P2`, p2, '');
  await page.close();
  await ctx.close();
}

async function fixesPage(L, page, problemList) {
  const map = await page.evaluate(() => ({
    legend: [...document.querySelectorAll('.legend [data-problem]')].map((n) => n.dataset.problem),
    fixes: [...document.querySelectorAll('[data-solves]')].map((n) => ({ id: n.dataset.fix, solves: n.dataset.solves.split(/\s+/).filter(Boolean), who: (n.dataset.who || '').split(/\s+/).filter(Boolean) })),
  }));
  check(`${L}: legend lists exactly the problems page's problems`, map.legend.length > 0 && map.legend.join() === problemList.join(), map.legend.join(','));
  const set = new Set(problemList);
  const orphan = map.fixes.filter((x) => !x.solves.length || x.solves.some((p) => !set.has(p)));
  const unsolved = problemList.filter((p) => !map.fixes.some((x) => x.solves.includes(p)));
  check(`${L}: at least eight fixes`, map.fixes.length >= 8, map.fixes.length);
  check(`${L}: every fix solves a problem that exists`, orphan.length === 0, orphan.map((x) => x.id + '->' + x.solves.join('+')).join(', '));
  check(`${L}: every problem has at least one fix`, unsolved.length === 0, unsolved.join(','));
  check(`${L}: every fix names who it serves`, map.fixes.every((x) => x.who.length), '');

  const chips = await page.$$eval('[data-filter]', (bs) => bs.map((b) => b.dataset.filter));
  check(`${L}: persona filter has "all" and at least three personas`, chips.includes('all') && chips.length >= 4, chips.join(','));
  const bad = [];
  for (const who of chips) {
    await page.click(`[data-filter="${who}"]`);
    const r = await page.evaluate((w) => {
      const rows = [...document.querySelectorAll('[data-solves]')];
      const want = rows.filter((n) => w === 'all' || n.dataset.who.split(/\s+/).includes(w));
      const shown = rows.filter((n) => !n.hidden);
      return { want: want.length, shown: shown.length, same: want.every((n) => shown.includes(n)) && shown.length === want.length, pressed: document.querySelector(`[data-filter="${w}"]`).getAttribute('aria-pressed'), count: (document.querySelector('[data-fix-count]') || {}).textContent || '' };
    }, who);
    if (!r.same || r.pressed !== 'true' || !r.count.includes(String(r.want))) bad.push(`${who}: want ${r.want} shown ${r.shown} pressed ${r.pressed}`);
  }
  check(`${L}: persona filter shows exactly the matching fixes`, bad.length === 0, bad.join(' | '));
  const jump = await page.evaluate(() => {
    const out = [];
    for (const a of document.querySelectorAll('.legend [data-jump]')) {
      a.click();
      const p = a.dataset.jump;
      const rows = [...document.querySelectorAll('[data-solves]')];
      const shown = rows.filter((n) => !n.hidden).map((n) => n.dataset.fix);
      const want = rows.filter((n) => n.dataset.solves.split(/\s+/).includes(p)).map((n) => n.dataset.fix);
      if (shown.join() !== want.join() || !shown.length) out.push(p);
    }
    return out;
  });
  check(`${L}: each legend problem narrows the list to its own fixes`, jump.length === 0, jump.join(','));
  await page.click('[data-filter="all"]');
}

async function protoNav(L, page, st, sub) {
  const tabs = await page.$$eval('.tabs a', (as) => as.map((a) => ({ h: a.getAttribute('href'), cur: a.getAttribute('aria-current') })));
  const want = st.proto.map((p) => st.base + '/prototype' + p);
  const cur = tabs.filter((t) => t.cur === 'page').map((t) => t.h).join();
  check(`${L}: tabs link every prototype page and mark this one`, want.every((h) => tabs.some((t) => t.h === h)) && cur === st.base + '/prototype' + sub, JSON.stringify(tabs));
  check(`${L}: links back to the study`, (await page.$$(`a[href^="${st.base}/"]`)).length > 0, '');
}

async function protoET(browser, vp) {
  const st = STUDIES[0];
  const ctx = await context(browser, vp);
  const P = (s) => `[${vp.name}] ${st.base}/prototype${s}`;
  let o = await open(ctx, `${st.base}/prototype`);
  let page = o.page;
  await protoNav(P(''), page, st, '');
  check(`${P('')}: says its data is fictional`, /fictional demo data/i.test(await page.textContent('.notice')), '');
  const feed = async () => page.evaluate(() => {
    const picked = [...document.querySelectorAll('#holdings [aria-pressed="true"]')].map((b) => b.dataset.co);
    const shown = [...document.querySelectorAll('#feed [data-story]')].map((a) => a.dataset.story);
    return { picked, ok: shown.every((c) => picked.includes(c)) && picked.every((c) => shown.includes(c)), n: shown.length };
  });
  const r1 = await feed();
  await page.click('#holdings [data-co="kon"]');
  const r2 = await feed();
  check(`${P('')}: My Stocks feed follows the holdings`, r1.ok && r2.ok && r2.n === r1.n + 1, JSON.stringify([r1, r2]));
  for (const c of r2.picked) await page.click(`#holdings [data-co="${c}"]`);
  check(`${P('')}: no holdings shows an empty state`, (await page.$$('#feed .empty')).length === 1, '');
  await common(P(''), page, o.bag, o.status); await page.close();

  o = await open(ctx, `${st.base}/prototype/hub`); page = o.page;
  await protoNav(P('/hub'), page, st, '/hub');
  await page.click('#cancel');
  const a1 = norm(await page.textContent('#m-renew'));
  const shown = await page.isVisible('#confirm');
  if (shown) await page.click('#confirm-yes');
  const a2 = norm(await page.textContent('#m-renew'));
  check(`${P('/hub')}: auto-renew turns off in exactly two taps`, a1 === 'On' && shown && a2 === 'Off', `${a1} ${shown} ${a2}`);
  check(`${P('/hub')}: once cancelled, no charge is scheduled`, !/charged/i.test(await page.textContent('#timeline')), '');
  await page.click('#restore'); await page.waitForTimeout(1200);
  check(`${P('/hub')}: restore access shows each step`, (await page.$$('#restore-log li.ok')).length === 3, '');
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 3000 }).catch(() => null), page.click('#invoice')]);
  check(`${P('/hub')}: the invoice downloads without an email`, !!dl && /invoice/.test(dl.suggestedFilename()), dl ? dl.suggestedFilename() : 'none');
  await common(P('/hub'), page, o.bag, o.status); await page.close();

  o = await open(ctx, `${st.base}/prototype/rules`); page = o.page;
  await protoNav(P('/rules'), page, st, '/rules');
  await page.click('#who [data-who="member"]');
  const mem = await page.evaluate(() => ({
    pop: !document.querySelector('#ph-pop').hidden,
    adTop: !!document.querySelector('#ph-body [data-ph="ad-top"]'),
    wall: !!document.querySelector('#ph-body [data-ph="wall"]'),
    call: document.querySelector('[data-rule="call"] td').textContent,
    offer: document.querySelector('[data-rule="offer"] td').textContent,
  }));
  check(`${P('/rules')}: a member sees no pop-up, top ad, paywall, offer or sales call`, !mem.pop && !mem.adTop && !mem.wall && /^Never/.test(mem.call) && /^None/.test(mem.offer), JSON.stringify(mem));
  await page.click('#who [data-who="today"]');
  check(`${P('/rules')}: the "member today" contrast shows the pop-up`, await page.isVisible('#ph-pop'), '');
  await page.click('#who [data-who="asked"]');
  check(`${P('/rules')}: someone who asked for a call gets one, with limits`, /24 hours/.test(await page.textContent('[data-rule="call"] td')), '');
  await common(P('/rules'), page, o.bag, o.status); await page.close();

  o = await open(ctx, `${st.base}/prototype/maths`); page = o.page;
  await protoNav(P('/maths'), page, st, '/maths');
  const m = /₹\s*([\d.]+)\s*lakh/.exec(await page.textContent('[data-testid="et-renewal-total"]'));
  protoRenewal = m ? parseFloat(m[1]) : NaN;
  await common(P('/maths'), page, o.bag, o.status); await page.close();

  // Links to the old one-page prototype land on the page that tab became.
  o = await open(ctx, `${st.base}/prototype#hub`);
  check(`${P('#hub')}: an old tab link lands on the member hub page`, /\/prototype\/hub$/.test(new URL(o.page.url()).pathname), o.page.url());
  await o.page.close();
  await ctx.close();
}

async function protoTH(browser, vp) {
  const st = STUDIES[1];
  const ctx = await context(browser, vp);
  const P = (s) => `[${vp.name}] ${st.base}/prototype${s}`;
  let o = await open(ctx, `${st.base}/prototype`);
  let page = o.page;
  await protoNav(P(''), page, st, '');
  const notice = (await page.textContent('.notice')) || '';
  check(`${P('')}: says prices are illustrative and it is not medical advice`, /illustrative/i.test(notice) && /not medical advice/i.test(notice), '');
  const plans = await page.$$eval('#plans [data-plan]', (ps) => ps.map((p) => p.textContent));
  check(`${P('')}: price is on screen before sign-up`, plans.length >= 1 && plans.every((t) => /₹\s?[\d,]+/.test(t)), plans.join(' | '));
  const s1 = await page.$$eval('#slots [data-slot]', (s) => s.map((x) => x.dataset.slot));
  check(`${P('')}: evening picks an evening batch as default`, s1[0] === '4:45 PM', s1.join(','));
  await page.click('#windows [data-v="evening"]');
  check(`${P('')}: no free time that fits falls back to catch-up`, (await page.$$eval('#slots [data-slot]', (s) => s.map((x) => x.dataset.slot))).join() === 'none', '');
  await page.click('#windows [data-v="morning"]');
  await page.click('#goals [data-v="sugar"]');
  const sugar = { name: await page.textContent('#prog-name'), safety: await page.isVisible('#safety'), slot: await page.$eval('#slots [data-slot]', (x) => x.dataset.slot) };
  check(`${P('')}: a condition gets its programme and a safety note`, /12-week/.test(sugar.name) && sugar.safety && sugar.slot === '8:00 AM', JSON.stringify(sugar));
  await common(P(''), page, o.bag, o.status); await page.close();

  // The goal picked on Start is the one the week page tracks, in its unit.
  o = await open(ctx, `${st.base}/prototype/week`); page = o.page;
  await protoNav(P('/week'), page, st, '/week');
  const unit = { name: await page.textContent('#goal-name'), goal: await page.textContent('#o-goal'), out: await page.textContent('#checkin-out') };
  check(`${P('/week')}: tracks the goal chosen on Start, fasting sugar in mg/dL`, /sugar/i.test(unit.name) && /mg\/dL/.test(unit.goal) && /^Logged: Fasting sugar, \d+ mg\/dL/.test(unit.out), JSON.stringify(unit));
  const n0 = await page.isVisible('#nudge');
  for (let i = 0; i < 3; i++) await page.click('#days [data-day="3"]');
  const n1 = await page.isVisible('#nudge');
  const c1 = +(await page.textContent('#st-catch'));
  await page.click('#nudge-do');
  const c2 = +(await page.textContent('#st-catch'));
  check(`${P('/week')}: two misses in a row bring a catch-up, which counts`, !n0 && n1 && c2 === c1 + 1 && !(await page.isVisible('#nudge')), `${n0} ${n1} ${c1}->${c2}`);
  await common(P('/week'), page, o.bag, o.status); await page.close();

  o = await open(ctx, `${st.base}/prototype/race`); page = o.page;
  await protoNav(P('/race'), page, st, '/race');
  const wk = +(await page.textContent('[data-testid="th-weeks"]'));
  const rows = await page.$$eval('#plan li', (l) => l.map((x) => x.dataset.week));
  check(`${P('/race')}: Mumbai 14 Feb 2027 is 15 weeks, one row a week plus after`, wk === 15 && rows.length === 16 && rows[15] === 'after', `${wk} weeks, ${rows.length} rows`);
  await page.selectOption('#city', 'blr');
  await page.click('#dist [data-v="21.1"]');
  const held = await page.$$eval('#plan li', (l) => l.map((x) => x.dataset.week));
  check(`${P('/race')}: a first-timer 21.1K in 7 weeks is warned, with no squeezed plan`, (await page.isVisible('#race-warn')) && held.join() === 'held', held.join());
  await page.selectOption('#city', 'del');
  const longs = await page.$$eval('#plan li .sub', (l) => l.map((x) => (/long run ([\d.]+) km/.exec(x.textContent) || [])[1]).filter(Boolean).map(Number));
  check(`${P('/race')}: Delhi 21.1K long runs build up and never pass 18 km`, longs.length > 10 && Math.max(...longs) <= 18 && longs[0] < longs[longs.length - 3], longs.join(','));
  await common(P('/race'), page, o.bag, o.status); await page.close();

  o = await open(ctx, `${st.base}/prototype/business`); page = o.page;
  await protoNav(P('/business'), page, st, '/business');
  const members = norm(await page.textContent('[data-testid="th-members"]')).replace(/,/g, '');
  check(`${P('/business')}: default funnel gives 1,200 members (15,000 x 4 x 40% x 20% x 25%)`, members === '1200', members);
  await common(P('/business'), page, o.bag, o.status); await page.close();

  o = await open(ctx, `${st.base}/prototype#race`);
  check(`${P('#race')}: an old tab link lands on the race plan page`, /\/prototype\/race$/.test(new URL(o.page.url()).pathname), o.page.url());
  await o.page.close();
  await ctx.close();
}

(async () => {
  // The owner's URLs are folders on disk, so Vercel serves them without a
  // rewrite (a rewrite to an .html file 404s under cleanUrls).
  for (const st of STUDIES) {
    const dir = MUT === 'route' && st.key === 'et' ? st.base.toLowerCase() : st.base;
    const files = [...PAGES.map((p) => (p ? dir + p + '.html' : dir + '/index.html')), ...st.proto.map((p) => dir + '/prototype' + (p ? p + '.html' : '/index.html'))];
    const missing = files.filter((f) => !fs.existsSync(path.join(WWW, f)));
    check(`${st.base}: all ${files.length} pages are built files in www/`, missing.length === 0, missing.join(','));
    const rw = (vercel.rewrites || []).filter((r) => r.source.toLowerCase().startsWith(st.base.toLowerCase()));
    check(`${st.base}: no vercel.json rewrite to break it`, rw.length === 0, rw.map((r) => r.source).join(','));
  }
  for (const [from, to] of [['/ET-study', '/ET_Study'], ['/ET-study/prototype', '/ET_Study/prototype']]) {
    const r = (vercel.redirects || []).find((x) => x.source === from);
    check(`${from} redirects permanently to ${to}`, !!r && r.destination === to && r.permanent === true, r ? r.destination : 'missing');
  }

  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    for (const st of STUDIES) await study(browser, vp, st);
    await protoET(browser, vp);
    await protoTH(browser, vp);
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
