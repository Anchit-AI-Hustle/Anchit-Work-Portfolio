// The Amar Ujala case study (/amar-ujala/study) and its Aage Kya prototype
// (/amar-ujala/prototype) work at phone, tablet and desktop width, in English
// and Hindi, under the site's real CSP.
//
// WHAT THIS GUARDS
//   Both pages are self-contained HTML. The study quotes the prototype's
//   year-one base case (about ₹1.13 crore on 19,98,317 UP Board 2026 Class 12
//   passers); a change to the prototype's defaults would make the study
//   contradict its own prototype without anything going red. So the base case
//   is read off both pages and compared, and the 2026 pass count is pinned.
//
//   The owner's rules for these two pages are checked on the rendered text:
//   no em or en dash anywhere, and never the words GitHub or repository.
//
// CSP
//   `serve` sends no headers, and vercel.json's site-wide Content-Security-
//   Policy is what production enforces. Every HTML response here gets that
//   policy injected, so a violation shows up as a console error and fails the
//   run, as it would on the live site.
//
// Run against a served build:  node scripts/amar-ujala.js
// MUT=dash plants an em dash in the study; the dash check must fail.
// MUT=count puts the 2025 pass count back into the prototype; the pinned
// count and the cross-page base case must fail. MUT=lang makes the Hindi
// toggle do nothing; the translation check must fail. MUT=xnav drops the
// prototype's audit link and hides the study's prototype button on phones;
// the cross-navigation checks must fail. MUT=year3 raises the prototype's high
// bundle price; the study's year-three figure must stop matching.
const { chromium } = require('./_playwright.js');
const vercel = require('../vercel.json');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MUT = process.env.MUT || '';

const VIEWPORTS = [
  { name: '390', width: 390, height: 844 },
  { name: '820', width: 820, height: 1180 },
  { name: '1440', width: 1440, height: 900 },
];

const CSP = (() => {
  for (const h of vercel.headers) {
    if (h.source !== '/(.*)') continue;
    for (const x of h.headers) if (x.key === 'Content-Security-Policy') return x.value;
  }
  throw new Error('vercel.json has no site-wide Content-Security-Policy');
})();

function mutate(path, src) {
  if (MUT === 'dash' && path.endsWith('/study')) return src.replace('</body>', '<p>one — two</p></body>');
  if (MUT === 'count' && path.endsWith('/prototype')) return src.split('1998317').join('2109000');
  if (MUT === 'lang' && path.endsWith('/prototype')) return src.replace('</body>', '<script>document.addEventListener("click",function(e){if(e.target.closest("button[lang]"))e.stopImmediatePropagation();},true);</script></body>');
  if (MUT === 'year3' && path.endsWith('/prototype')) return src.replace('bundles: 150, bundlePrice: 200000', 'bundles: 150, bundlePrice: 300000');
  if (MUT === 'xnav' && path.endsWith('/prototype')) return src.split('/amar-ujala/study#audit').join('/amar-ujala/study');
  if (MUT === 'xnav' && path.endsWith('/study')) return src.replace('</head>', '<style>@media (max-width:699px){.nav .cta{display:none}}</style></head>');
  return src;
}

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail == null ? '' : String(detail)]);
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function open(browser, vp, path) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const bag = { errors: [], failed: [] };
  await ctx.route('**/*', async (route) => {
    const res = await route.fetch();
    const headers = { ...res.headers() };
    if (!(headers['content-type'] || '').includes('text/html')) return route.fulfill({ response: res });
    headers['content-security-policy'] = CSP;
    const p = new URL(route.request().url()).pathname;
    const body = p.startsWith('/amar-ujala') ? mutate(p, await res.text()) : await res.text();
    return route.fulfill({ response: res, headers, body });
  });
  const page = await ctx.newPage();
  page.on('console', (m) => { if (m.type() === 'error') bag.errors.push(m.text()); });
  page.on('pageerror', (e) => bag.errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => bag.failed.push(r.url() + ' ' + (r.failure() || {}).errorText));
  page.on('response', (r) => { if (r.status() >= 400) bag.failed.push(r.url() + ' HTTP ' + r.status()); });
  const res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  return { ctx, page, bag, status: res.status() };
}

// Title, textContent (hidden tabs included) and innerText, minus script/style.
const rendered = (page) => page.evaluate(() => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return document.title + '\n' + c.textContent + '\n' + document.body.innerText;
});
const dashes = async (page) => (await rendered(page)).match(/.{0,30}[–—].{0,30}/g) || [];
const forbidden = async (page) => (await rendered(page)).match(/.{0,30}\b(git\s?hub|repositor(?:y|ies)|repos?)\b.{0,30}/gi) || [];
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// "₹1.13 crore" -> 1.13
const crore = (s) => { const m = /₹\s*([\d.]+)\s*crore/i.exec(s || ''); return m ? parseFloat(m[1]) : NaN; };

let studyBase = NaN, protoBase = NaN;

async function common(L, page, bag) {
  const over = await hScroll(page);
  check(`${L}: no horizontal page scroll`, over <= 0, over + 'px');
  const d = await dashes(page);
  check(`${L}: no em/en dash`, d.length === 0, d.join(' | '));
  const f = await forbidden(page);
  check(`${L}: never names GitHub or a repository`, f.length === 0, f.join(' | '));
  await page.waitForTimeout(300);
  check(`${L}: zero console errors (CSP on)`, bag.errors.length === 0, bag.errors.join(' | '));
  check(`${L}: zero failed requests`, bag.failed.length === 0, bag.failed.join(' | '));
}

async function study(browser, vp) {
  const L = `[${vp.name}] /amar-ujala/study`;
  const { ctx, page, bag, status } = await open(browser, vp, '/amar-ujala/study');
  check(`${L}: HTTP 200`, status === 200, status);

  const rows = await page.$$eval('#audit-tbl tbody tr', (rs) => rs.length);
  check(`${L}: #audit lists the six live assets`, rows === 6, rows);
  const passed = norm(await page.textContent('#questions'));
  check(`${L}: pins the 2026 Class 12 pass count`, passed.includes('19,98,317'), '');
  check(`${L}: cites two sources for the 2026 counts`,
    (await page.$$('#questions a[href*="organiser.org"]')).length > 0 && (await page.$$('#questions a[href*="allen.in"]')).length > 0, '');
  const protoLinks = await page.$$eval('a[href^="/amar-ujala/prototype"]', (as) => as.length);
  check(`${L}: links to the prototype`, protoLinks >= 2, protoLinks);
  studyBase = crore(norm(await page.textContent('#questions')).match(/base case[^:]*:\s*about ₹[\d.]+ crore/i)?.[0]);

  await common(L, page, bag);
  await ctx.close();
}

async function prototype(browser, vp) {
  const L = `[${vp.name}] /amar-ujala/prototype`;
  const { ctx, page, bag, status } = await open(browser, vp, '/amar-ujala/prototype');
  check(`${L}: HTTP 200`, status === 200, status);

  // Both languages render, and the toggle actually switches the page.
  const toggle = async (lang) => {
    const b = await page.$(`button[lang="${lang}"]`);
    if (!b) return false;
    await b.click();
    await page.waitForTimeout(250);
    return true;
  };
  // Compared on one translated element, before and after. Any Devanagari on
  // the page proves nothing: the English page already shows it in the title
  // and in the "हिंदी" button label, so a dead toggle used to pass.
  const leadOf = () => page.evaluate(() => ({
    lead: (document.querySelector('.ak-lead') || {}).textContent || '',
    lang: document.documentElement.lang,
  }));
  const en = await leadOf();
  const hasHi = await toggle('hi');
  const hi = await leadOf();
  const switched = hasHi && hi.lang === 'hi' && hi.lead !== en.lead &&
    /[ऀ-ॿ]{3,}/.test(hi.lead) && !/[ऀ-ॿ]/.test(en.lead);
  check(`${L}: Hindi toggle translates the page`, switched,
    hasHi ? `lang ${en.lang} -> ${hi.lang}; lead "${en.lead.slice(0, 24)}" -> "${hi.lead.slice(0, 24)}"` : 'no button[lang="hi"]');
  const overHi = await hScroll(page);
  check(`${L}: no horizontal page scroll in Hindi`, overHi <= 0, overHi + 'px');
  await toggle('en');

  // The model's own input, not the page copy: the copy quotes 19,98,317 in
  // more than one place, so a stale preset could hide behind it.
  const base = await readProtoBase(page);
  const passed = await page.inputValue('#rev-passed');
  check(`${L}: revenue model starts from the 2026 pass count`, passed === '1998317', passed);
  if (vp.width === 1440) protoBase = base;

  await common(L, page, bag);
  await ctx.close();
}

// The three places people are sent, the study, its audit and the prototype,
// each show a link to the other two without scrolling, at every width and in
// both prototype languages. Hiding a link on phones counts as missing it: the
// study's "Open prototype" button used to be display:none below 700px.
const STUDY = 'a[href="#top"], a[href="/amar-ujala/study"]';
const AUDIT = 'a[href="#audit"], a[href="/amar-ujala/study#audit"]';
const PROTO = 'a[href^="/amar-ujala/prototype"]';
const inView = (page, sel) => page.$$eval(sel, (as) => as.some((a) => {
  const r = a.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight &&
    getComputedStyle(a).visibility !== 'hidden';
}));
const auditTop = (page) => page.evaluate(() => Math.round(document.getElementById('audit').getBoundingClientRect().top));

async function crossNav(browser, vp) {
  const L = `[${vp.name}] cross-navigation`;

  let { ctx, page } = await open(browser, vp, '/amar-ujala/study');
  check(`${L}: study shows the audit and the prototype`,
    (await inView(page, AUDIT)) && (await inView(page, PROTO)), '');
  await ctx.close();

  ({ ctx, page } = await open(browser, vp, '/amar-ujala/study#audit'));
  await page.waitForTimeout(300);
  const top = await auditTop(page);
  check(`${L}: the audit opens in view and shows the study and the prototype`,
    top >= 0 && top < 160 && (await inView(page, STUDY)) && (await inView(page, PROTO)), `#audit at ${top}px`);
  await ctx.close();

  ({ ctx, page } = await open(browser, vp, '/amar-ujala/prototype'));
  for (const lang of ['en', 'hi']) {
    if (lang === 'hi') { await page.click('button[lang="hi"]'); await page.waitForTimeout(250); }
    check(`${L}: prototype (${lang}) shows the study and the audit`,
      (await inView(page, 'a[href="/amar-ujala/study"]')) && (await inView(page, 'a[href="/amar-ujala/study#audit"]')), '');
  }
  const link = (await page.$$('a[href="/amar-ujala/study#audit"]'))[0];
  if (link) {
    await Promise.all([page.waitForURL(/\/amar-ujala\/study#audit$/), link.click()]);
    await page.waitForTimeout(300);
  }
  const landed = link ? await auditTop(page) : NaN;
  check(`${L}: the prototype's audit link lands on the audit`, landed >= 0 && landed < 160, link ? `#audit at ${landed}px` : 'no link');
  await ctx.close();
}

// What a hiring manager reads first: one recommendation on the first screen,
// how success is measured and when to stop, the first 90 days, the two internal
// tensions, the revenue maths behind the base case, published research on the
// families, and no security detail about Amar Ujala's servers in public.
let studyYear3 = NaN, protoHigh = NaN;
async function submission(browser, vp) {
  const L = `[${vp.name}] /amar-ujala/study submission`;
  const { ctx, page } = await open(browser, vp, '/amar-ujala/study');
  const one = await page.evaluate(() => {
    const el = document.querySelector('#top #one-thing');
    return el ? Math.round(el.getBoundingClientRect().bottom) : null;
  });
  check(`${L}: one recommendation sits on the first screen`, one !== null && one <= vp.height, `bottom ${one}px of ${vp.height}`);
  const text = norm(await page.evaluate(() => document.body.textContent));
  const leak = text.match(/.{0,30}\b(PHP|OpenSSL)\b.{0,30}/);
  check(`${L}: no server or security detail in public`, !leak, leak ? leak[0] : '');
  for (const id of ['upgrades', 'revamps']) {
    const d = await page.$eval(`#${id}`, (s) => {
      const det = s.querySelector('details');
      return det ? { open: det.open, rows: det.querySelectorAll('tbody tr').length } : null;
    });
    check(`${L}: #${id} table is collapsed with all seven rows`, !!d && !d.open && d.rows === 7, JSON.stringify(d));
  }
  const plan = await page.evaluate(() => ({
    north: !!document.querySelector('#plan [data-k="north-star"]'),
    pilot: (document.querySelector('#plan [data-k="pilot"]') || {}).textContent || '',
    days: document.querySelectorAll('#plan [data-k="day"]').length,
    tensions: document.querySelectorAll('#plan [data-k="tension"]').length,
  }));
  check(`${L}: #plan has the one number, a pilot stop line, three 30-day steps and two tensions`,
    plan.north && /3%/.test(plan.pilot) && /15%/.test(plan.pilot) && /₹150/.test(plan.pilot) && plan.days === 3 && plan.tensions === 2,
    JSON.stringify({ ...plan, pilot: plan.pilot.slice(0, 60) }));
  const funnel = norm(await page.textContent('#funnel'));
  check(`${L}: the base case shows its funnel`, ['19,98,317', '87,926', '8,793', '15,387'].every((n) => funnel.includes(n)), funnel.slice(0, 80));
  studyYear3 = crore(norm(await page.textContent('#year3')));
  const sources = await page.$$eval('#research a[href^="http"]', (as) => as.length);
  check(`${L}: published research on families, with sources`, sources >= 5, sources);
  const research = await page.$eval('#research', (s) => ({
    shown: [...s.querySelectorAll('.card')].filter((c) => !c.closest('details')).length,
    folded: s.querySelectorAll('details:not([open]) .card').length,
  }));
  check(`${L}: research shows two findings and folds the rest`, research.shown === 2 && research.folded === 2, JSON.stringify(research));

  // The role asks for 4 to 5 years and prefers an edtech background; the
  // section that answers "why me" has to answer both, in view.
  const me = norm(await page.innerText('#me'));
  check(`${L}: why me states the years and the edtech work`,
    /4\+ years in product/.test(me) && /Edu\s?AI/.test(me) && /early years/i.test(me) &&
    (await page.$$('#me a[href="https://edu-ai.anchit-tandon.com/"]')).length > 0, me.slice(0, 80));
  check(`${L}: revamps name the early years in view`, /early years/i.test(norm(await page.innerText('#revamps .lead-in'))), '');
  // Calls to families are a step before the study goes to the company, not a
  // promise on the public page.
  const calls = text.match(/.{0,30}(Call 20 families|have not spoken to these families).{0,30}/);
  check(`${L}: no promise of family calls on the page`, !calls, calls ? calls[0] : '');
  await ctx.close();
}

// The prototype's revenue tab, high scenario, year-one total in crore.
async function readProtoHigh(browser) {
  const { ctx, page } = await open(browser, VIEWPORTS[2], '/amar-ujala/prototype');
  await page.click('#tab-revenue');
  await page.click('#scen-high');
  await page.waitForTimeout(300);
  protoHigh = crore(norm(await page.textContent('[data-testid="ak-total"]')));
  await ctx.close();
}

// The prototype's revenue tab, base scenario, year-one total in crore.
async function readProtoBase(page) {
  await page.click('#tab-revenue');
  await page.waitForSelector('#scen-base');
  await page.click('#scen-base');
  await page.waitForTimeout(300);
  return crore(norm(await page.textContent('[data-testid="ak-total"]')));
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    await study(browser, vp);
    await prototype(browser, vp);
    await crossNav(browser, vp);
    await submission(browser, vp);
  }
  await readProtoHigh(browser);
  await browser.close();

  check('the study\'s year-three figure is the prototype\'s high scenario',
    Number.isFinite(studyYear3) && Number.isFinite(protoHigh) && Math.abs(studyYear3 - protoHigh) < 0.05,
    `study ₹${studyYear3} crore, prototype high ₹${protoHigh} crore`);

  check('study and prototype quote the same year-one base case',
    Number.isFinite(studyBase) && Number.isFinite(protoBase) && Math.abs(studyBase - protoBase) < 0.005,
    `study ₹${studyBase} crore, prototype ₹${protoBase} crore`);

  for (const [s, n, d] of results) console.log(`  ${s}  ${n}${d ? '  ' + d : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed${MUT ? `  [MUT=${MUT}]` : ''}`);
  process.exit(failed ? 1 : 0);
})();
