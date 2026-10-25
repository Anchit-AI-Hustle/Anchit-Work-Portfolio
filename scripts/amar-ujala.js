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
// toggle do nothing; the translation check must fail.
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
  }
  await browser.close();

  check('study and prototype quote the same year-one base case',
    Number.isFinite(studyBase) && Number.isFinite(protoBase) && Math.abs(studyBase - protoBase) < 0.005,
    `study ₹${studyBase} crore, prototype ₹${protoBase} crore`);

  for (const [s, n, d] of results) console.log(`  ${s}  ${n}${d ? '  ' + d : ''}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed${MUT ? `  [MUT=${MUT}]` : ''}`);
  process.exit(failed ? 1 : 0);
})();
