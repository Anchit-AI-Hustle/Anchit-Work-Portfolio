// The PW case study (/pw-study) and its prototype (/pw-study/prototype) work
// at phone, tablet and desktop width, under the site's real CSP.
//
// WHAT THIS GUARDS
//   Both pages are self-contained HTML with a lot of inline logic: a risk
//   engine, age-based Weekly Pulse routing, a seeded 5,000-learner console and
//   an impact calculator whose total is quoted on the case study itself. None
//   of that was covered by any suite, so a change to the engine weights, the
//   calculator defaults or a label could ship a page that contradicts its own
//   numbers without anything going red.
//
//   It also pins two defects that review found after launch:
//   - The engine labelled its lecture factor "Behind batch pace" and counted it
//     against 100%, while the card and the chat treat 75% as on pace. Aman, at
//     82%, read "Ahead of batch pace" on the card and "Behind batch pace +7.2"
//     beside it. The factor is now "Lectures not done".
//   - A simulated mentor reply is posted 250 ms after the question. Switching
//     learner inside that window dropped the old learner's reply into the new
//     learner's freshly cleared chat.
//
// CSP
//   `serve` sends no headers, and vercel.json's site-wide Content-Security-
//   Policy is what production enforces. Every HTML response here gets that
//   policy injected, so a violation shows up as a console error and fails the
//   run, as it would on the live site.
//
// Run against a served build:  node scripts/pw-study.js
// MUT=race removes the learner guard on the delayed reply; the chat check must
// fail. MUT=label restores "Behind batch pace"; the consistency check must
// fail. MUT=dash plants an em dash; the dash check must fail.
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

function mutate(src) {
  if (MUT === 'race') return src.replace('if(P[cur]===p) addMsg', 'addMsg');
  if (MUT === 'label') return src.replace("k:'Lectures not done'", "k:'Behind batch pace'");
  if (MUT === 'dash') return src.replace('</body>', '<p>one — two</p></body>');
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
    const body = new URL(route.request().url()).pathname.startsWith('/pw-study') ? mutate(await res.text()) : await res.text();
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
const dashes = (frame) => frame.evaluate(() => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return (document.title + '\n' + c.textContent + '\n' + document.body.innerText).match(/.{0,30}[–—].{0,30}/g) || [];
});
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function caseStudy(browser, vp) {
  const L = `[${vp.name}] /pw-study`;
  const { ctx, page, bag, status } = await open(browser, vp, '/pw-study');
  check(`${L}: HTTP 200`, status === 200, status);

  await page.click('.filters .chip[data-f="none"]');
  const rows = await page.$$eval('#audit-tbl tbody tr', (rs) => rs.filter((r) => r.offsetParent !== null).length);
  check(`${L}: audit "Not found" filter shows 5 rows`, rows === 5, rows);

  // The screenshots stand in for the iframe below 1080px and hide above it.
  const imgs = [];
  for (const img of await page.$$('.shots.mob-only img')) {
    if (!(await img.isVisible())) continue;
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, img, { timeout: 10000 }).catch(() => {});
    imgs.push(await img.evaluate((el) => el.complete && el.naturalWidth > 0));
  }
  const frameEl = await page.$('iframe.proto-frame');
  const frameVisible = await frameEl.isVisible();
  if (vp.width >= 1080) {
    check(`${L}: iframe shown, screenshots hidden`, frameVisible && imgs.length === 0, `iframe=${frameVisible} imgs=${imgs.length}`);
    await frameEl.scrollIntoViewIfNeeded();
    const fr = await frameEl.contentFrame();
    await fr.waitForFunction(() => (document.getElementById('e-tier') || {}).textContent, null, { timeout: 15000 });
    const hero = await fr.$eval('.hero', (h) => getComputedStyle(h).display);
    check(`${L}: embedded prototype hides its hero`, hero === 'none', hero);
    const tier = norm(await fr.textContent('#e-tier'));
    check(`${L}: embedded engine tag reads High risk`, tier === 'High risk', tier);
    const d = await dashes(fr);
    check(`${L}: no em/en dash inside the iframe`, d.length === 0, d.join(' | '));
  } else {
    check(`${L}: 3 screenshots load after scroll, iframe hidden`, imgs.length === 3 && imgs.every(Boolean) && !frameVisible,
      `loaded=${imgs.filter(Boolean).length}/${imgs.length} iframe=${frameVisible}`);
  }

  const over = await hScroll(page);
  check(`${L}: no horizontal page scroll`, over <= 0, over + 'px');
  const d = await dashes(page);
  check(`${L}: no em/en dash`, d.length === 0, d.join(' | '));
  await page.waitForTimeout(300);
  check(`${L}: zero console errors (CSP on)`, bag.errors.length === 0, bag.errors.join(' | '));
  check(`${L}: zero failed requests`, bag.failed.length === 0, bag.failed.join(' | '));
  await ctx.close();
}

async function prototype(browser, vp) {
  const L = `[${vp.name}] /pw-study/prototype`;
  const { ctx, page, bag, status } = await open(browser, vp, '/pw-study/prototype');
  check(`${L}: HTTP 200`, status === 200, status);

  const tiers = { 0: 'High risk', 1: 'Low risk', 2: 'Medium risk', 3: 'Medium risk' };
  const got = {};
  for (const i of [1, 2, 3, 0]) {
    await page.click(`.persona-row .chip[data-p="${i}"]`);
    got[i] = norm(await page.textContent('#e-tier'));
  }
  check(`${L}: Riya High, Aman Low, Meena Medium, Kabir Medium`,
    Object.keys(tiers).every((i) => got[i] === tiers[i]), JSON.stringify(got));

  // The card and the engine must not disagree about pace. A learner the card
  // calls ahead must not have an engine factor that says they are behind.
  const pace = [];
  for (const i of [0, 1, 2, 3]) {
    await page.click(`.persona-row .chip[data-p="${i}"]`);
    const sub = norm(await page.textContent('#s-sub'));
    const factors = norm(await page.textContent('#e-factors')).toLowerCase();
    if (/ahead/i.test(sub) && /behind/.test(factors)) pace.push(`p${i}: "${sub}" vs engine "behind"`);
  }
  check(`${L}: card and engine agree on pace`, pace.length === 0, pace.join(' | '));

  // Ask Riya a question, switch to Aman inside the 250 ms reply window. Aman's
  // chat must hold only his own greeting.
  await page.click('.persona-row .chip[data-p="0"]');
  await page.click('#quick button[data-q="backlog"]');
  await page.click('.persona-row .chip[data-p="1"]');
  await page.waitForTimeout(500);
  const chat = await page.$$eval('#chat .bubble', (b) => b.map((x) => x.textContent));
  check(`${L}: a late reply never lands in the next learner's chat`,
    chat.length === 1 && /Aman/.test(chat[0]), JSON.stringify(chat));

  await page.click('#t-parent');
  await page.click('#pp-learner button[data-p="3"]');
  const kabir = norm(await page.textContent('#wa-title'));
  await page.click('#pp-learner button[data-p="1"]');
  const amanBefore = norm(await page.textContent('#wa-title'));
  await page.check('#pp-share');
  const amanAfter = norm(await page.textContent('#wa-title'));
  check(`${L}: Pulse title by age and opt-in`,
    kabir === 'PW Study Pulse' && amanBefore === 'PW Study Pulse' && amanAfter === 'PW Parent Pulse',
    `Kabir=${kabir} Aman=${amanBefore} -> ${amanAfter}`);

  const total = norm(await page.textContent('#m-total'));
  check(`${L}: impact total ₹85.3 cr · $8.97M`, total === '₹85.3 cr · $8.97M', total);

  await page.click('#t-console');
  const head = norm(await page.textContent('#segtbl th:last-child'));
  check(`${L}: value column is labelled as fees won back`, /^Fees won back/.test(head), head);
  const picked = [];
  for (const idx of [-1, 0]) {
    const rows = await page.$$('#segtbl tbody tr');
    const r = rows[idx < 0 ? rows.length + idx : idx];
    const name = norm(await r.$eval('td', (td) => td.innerText));
    await r.click();
    picked.push([name, norm(await page.textContent('#seg-detail h3')), norm(await page.textContent('#seg-detail .label'))]);
  }
  check(`${L}: console row click updates "Selected group"`,
    picked.every(([n, h, l]) => l === 'Selected group' && n === h) && picked[0][1] !== picked[1][1], JSON.stringify(picked));

  let worst = 0;
  for (const tab of ['#t-student', '#t-parent', '#t-console', '#t-brand']) {
    await page.click(tab);
    worst = Math.max(worst, await hScroll(page));
  }
  check(`${L}: no horizontal page scroll on any tab`, worst <= 0, worst + 'px');
  const d = await dashes(page);
  check(`${L}: no em/en dash`, d.length === 0, d.join(' | '));
  await page.waitForTimeout(300);
  check(`${L}: zero console errors (CSP on)`, bag.errors.length === 0, bag.errors.join(' | '));
  check(`${L}: zero failed requests`, bag.failed.length === 0, bag.failed.join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  for (const vp of VIEWPORTS) {
    await caseStudy(browser, vp);
    await prototype(browser, vp);
  }
  for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(70) + (d || ''));
  const pass = results.filter((r) => r[0] === 'PASS').length;
  console.log('\n' + pass + '/' + results.length + ' passed' + (MUT ? '  [MUT=' + MUT + ']' : ''));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
