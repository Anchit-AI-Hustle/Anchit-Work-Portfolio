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
// MUT=auditnav and MUT=protonav remove the cross-links from the audit section
// and from the prototype's intro; the matching navigation check must fail.
// MUT=costdrift changes one running-cost input in the calculator; the check
// that the case study's net figure matches the calculator must fail.
// MUT=bigcall promises every high-risk learner a call within 24 hours again;
// the escalation check must fail.
// MUT=offer sends the Vidyapeeth trial to every learner in a centre city again;
// the results-day check must fail.
// MUT=oldname puts the Hindi working name back; the feature-name check must
// fail. MUT=deeplink stops the prototype reading its hash on load; the
// walkthrough landing checks must fail. MUT=walkurl points one walkthrough
// link somewhere other than the URL it shows; the walkthrough URL check must
// fail.
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
  if (MUT === 'dash') return src.replace('</body>', '<p>one \u2014 two</p></body>');
  if (MUT === 'auditnav') return src.replace(/<div class="hero-ctas" style="margin-top:6px"><a class="btn btn-outline sm" href="#top">.*?<\/div>/, '');
  if (MUT === 'protonav') return src.replace(/<div class="xlinks">.*?<\/div>/, '');
  if (MUT === 'costdrift') return src.replace('id="m-wa" type="number" step="0.001" min="0" value="0.115"', 'id="m-wa" type="number" step="0.001" min="0" value="1.15"');
  if (MUT === 'bigcall') return src.replace("t:'7-day AI comeback plan'", "t:'Human mentor call within 24 hours'")
    .replace("What we are doing: a 7-day catch-up plan is ready in the app.", "What we are doing: a PW mentor will call tomorrow at 6:30 pm.");
  if (MUT === 'oldname') return src.replace('<strong>Learner Retention Engine</strong>', '<strong>Agla Kadam</strong>');
  if (MUT === 'deeplink') return src.replace('function fromHash(scroll, focus){', 'function fromHash(scroll, focus){ if(!focus) return;');
  if (MUT === 'offer') return src.replace("var strong = p.offline && res.tier==='Low' && s.test>=70 && s.lec>=75", 'var strong = p.offline');
  if (MUT === 'walkurl') return src.replace('<a href="/pw-study/prototype#pulse">https://', '<a href="/pw-study/prototype#console">https://');
  return src;
}

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail == null ? '' : String(detail)]);
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function open(browser, vp, path) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const bag = { errors: [], failed: [] };
  let closed = false;
  ctx.on('close', () => { closed = true; });
  await ctx.route('**/*', async (route) => {
    try {
      const res = await route.fetch();
      const headers = { ...res.headers() };
      if (!(headers['content-type'] || '').includes('text/html')) return await route.fulfill({ response: res });
      headers['content-security-policy'] = CSP;
      const body = new URL(route.request().url()).pathname.startsWith('/pw-study') ? mutate(await res.text()) : await res.text();
      return await route.fulfill({ response: res, headers, body });
    } catch (e) {
      // A lazy image still in flight when a check closes its context is not a
      // page failure; anything else is.
      if (!closed && !/disposed|has been closed|Target closed/i.test(e.message)) throw e;
    }
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
  return (document.title + '\n' + c.textContent + '\n' + document.body.innerText).match(/.{0,30}[\u2013\u2014].{0,30}/g) || [];
});
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const FEATURES = ['Drift Score', 'Comeback Plan', 'Weekly Pulse', 'Results-Day Next Step', 'Growth Console'];

// One clear English name everywhere: page source, title and description.
async function names(page, L) {
  const html = await page.content();
  const old = html.match(/.{0,30}(agla|kadam).{0,30}/gi) || [];
  const title = await page.title();
  check(`${L}: feature named "Learner Retention Engine", no Hindi working name`, old.length === 0 && /Learner Retention Engine/.test(title), old.join(' | ') || title);
}

// Where each shared link must land: a case study section heading on screen,
// or the prototype tab it names, selected and on screen.
const PROTO_TAB = { student: 't-student', drift: 't-student', plan: 't-student', next: 't-student', pulse: 't-parent', console: 't-console', brand: 't-brand' };
async function landed(page, href) {
  const u = new URL(href, BASE);
  const h = u.hash.slice(1);
  if (u.pathname === '/pw-study') {
    return page.evaluate((id) => {
      const s = document.getElementById(id); const hd = s && s.querySelector('h2');
      if (!hd) return false; const r = hd.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight;
    }, h);
  }
  if (u.pathname !== '/pw-study/prototype' || !PROTO_TAB[h]) return false;
  return page.evaluate(([tab, h]) => {
    const t = document.getElementById(tab);
    const target = document.getElementById(h);
    const r = target.getBoundingClientRect();
    // A whole-tab link must also keep the concept notice bar on screen.
    const bar = document.getElementById('dl-bar').getBoundingClientRect();
    const whole = t.getAttribute('aria-controls') === 'p-' + ({ pulse: 'parent' }[h] || h);
    return t.getAttribute('aria-selected') === 'true' && r.top >= 0 && r.top < innerHeight && (!whole || (bar.top >= 0 && bar.top < innerHeight));
  }, [PROTO_TAB[h], h]);
}

// The recruiter walkthrough: every step shows a complete URL, links to exactly
// that URL, and opening it cold lands on the right screen. "Copy all" copies
// the same full links.
async function walkthrough(browser, vp) {
  const L = `[${vp.name}] walkthrough`;
  const { ctx, page } = await open(browser, vp, '/pw-study#walkthrough');
  const steps = await page.$$eval('#walk li .wu a', (as) => as.map((a) => [a.getAttribute('href'), a.textContent.trim()]));
  steps.push(await page.$eval('.share a', (a) => [a.getAttribute('href'), a.textContent.trim()]));
  const tries = await page.$$eval('#system a.try', (as) => as.map((a) => a.getAttribute('href')));
  const bad = steps.filter(([href, txt]) => {
    if (!txt.startsWith('https://anchit-tandon.com/')) return true;
    const u = new URL(txt); return u.pathname + u.hash !== href;
  });
  check(`${L}: 7 steps plus a share link, each a full URL matching its link`, steps.length === 8 && bad.length === 0, bad.map((b) => b.join(' -> ')).join(' | ') || steps.length);

  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE });
  await page.click('#copy-walk');
  await page.waitForTimeout(300);
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch((e) => 'ERR ' + e.message);
  const lines = clip.split('\n');
  const urls = lines.slice(1).map((l) => (l.match(/https:\/\/\S+$/) || [''])[0]);
  check(`${L}: "Copy all" copies the 7 full links in order`,
    lines.length === 8 && urls.join() === steps.slice(0, 7).map((s) => s[1]).join(), clip.replace(/\n/g, ' | ').slice(0, 160));
  await ctx.close();

  for (const href of [...steps.map((s) => s[0]), ...tries, '/pw-study/prototype#brand']) {
    const o = await open(browser, vp, href);
    await o.page.waitForTimeout(500);
    const ok = await landed(o.page, href);
    check(`${L}: ${href} opens on the right screen`, ok === true, o.page.url());
    await o.ctx.close();
  }
}

async function caseStudy(browser, vp) {
  const L = `[${vp.name}] /pw-study`;
  const { ctx, page, bag, status } = await open(browser, vp, '/pw-study');
  check(`${L}: HTTP 200`, status === 200, status);
  await names(page, L);

  // The proposed system is the first thing after the hero, by its feature names.
  const sys = await page.evaluate(() => ({
    first: (document.querySelector('main > section') || {}).id,
    h2: (document.querySelector('#sys-h') || {}).textContent || '',
    feats: [...document.querySelectorAll('#system .feat .step b')].map((b) => b.textContent.trim()),
  }));
  check(`${L}: proposed system opens the page, five named features`,
    sys.first === 'system' && /Learner Retention Engine/.test(sys.h2) && sys.feats.join() === FEATURES.join(), JSON.stringify(sys));

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

  const range = await page.$$eval('#im-range tbody tr', (rs) => rs.map((r) => [...r.cells].map((c) => c.innerText.trim())));
  const row = (label) => (range.find((r) => r[0].startsWith(label)) || []).slice(1);
  check(`${L}: sizing shows low, base and high`, row('Extra collections').join() === '42.6,85.3,127.9', JSON.stringify(row('Extra collections')));
  check(`${L}: sizing is net of running costs`, row('Net of running costs').join() === '36.5,79.1,121.8', JSON.stringify(row('Net of running costs')));
  const costTotal = await page.$eval('#im-cost tr.hl td:last-child', (c) => c.innerText.trim()).catch(() => '');
  // The figures are the point of these tables: none may sit past the edge of
  // the table's own box, where a phone would have to scroll sideways to see it.
  const hidden = await page.$$eval('#im-range td.num, #im-cost td.num', (cs) => cs.filter((c) => {
    const box = c.closest('.tbl').getBoundingClientRect(); const r = c.getBoundingClientRect();
    return r.right > box.right + 1 || r.left < box.left - 1;
  }).map((c) => c.innerText.trim()));
  check(`${L}: every sizing figure is visible without scrolling the table`, hidden.length === 0, hidden.slice(0, 6).join(' | '));
  check(`${L}: running costs are itemised`, costTotal === '6.15', costTotal);
  const voices = await page.$$eval('#voices figure', (fs) => fs.map((f) => [f.querySelector('blockquote').innerText, f.querySelector('figcaption').innerText]));
  check(`${L}: at least six dated, rated user quotes`,
    voices.length >= 6 && voices.every(([q, c]) => /^".+"$/.test(q.trim()) && /\d★ · \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(c.trim())), voices.length + ' quotes');
  const body = await page.evaluate(() => document.body.textContent);
  const unverified = ['30 of 330', 'mainly for new enrollments', 'monthly mentor sessions'].filter((q) => body.includes(q));
  check(`${L}: no quote that could not be verified`, unverified.length === 0, unverified.join(' | '));
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
  await names(page, L);

  // The hero's feature links switch tabs; a tab click writes its own link.
  await page.click('.feats a[href="#console"]');
  const viaFeat = await page.getAttribute('#t-console', 'aria-selected');
  await page.click('#t-parent');
  const hashNow = await page.evaluate(() => location.hash);
  await page.click('#t-student');
  check(`${L}: feature links switch tabs and each tab has its own link`, viaFeat === 'true' && hashNow === '#pulse', `console=${viaFeat} hash=${hashNow}`);

  const tiers = { 0: 'High risk', 1: 'Low risk', 2: 'Medium risk', 3: 'Medium risk' };
  const got = {};
  for (const i of [1, 2, 3, 0]) {
    await page.click(`.persona-row .chip[data-p="${i}"]`);
    got[i] = norm(await page.textContent('#e-tier'));
  }
  check(`${L}: Riya High, Aman Low, Meena Medium, Kabir Medium`,
    Object.keys(tiers).every((i) => got[i] === tiers[i]), JSON.stringify(got));

  // High risk gets the AI plan first and a person only if it fails: a call for
  // every high-risk learner is more mentor time than PW has.
  await page.click('.persona-row .chip[data-p="0"]');
  const steps = await page.$$eval('#e-actions .step b', (b) => b.map((x) => x.textContent.trim()));
  check(`${L}: high risk escalates to a mentor, never calls everyone`,
    steps[0] === '7-day AI comeback plan' && steps.some((t) => /^Mentor call on day 8/.test(t)) && !steps.some((t) => /24 hours/.test(t)), JSON.stringify(steps));

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

  // Riya's high-risk Pulse, in both languages, states the escalation and never
  // promises a call tomorrow: that is a promise PW's mentors cannot keep at scale.
  await page.click('#pp-learner button[data-p="0"]');
  const pulse = {};
  for (const l of ['en', 'hi']) { await page.click(`#pp-lang button[data-l="${l}"]`); pulse[l] = norm(await page.textContent('#wa-body')); }
  await page.click('#pp-lang button[data-l="en"]');
  // Riya is high risk: results day holds the next batch back and offers no
  // Vidyapeeth trial, which only strong learners in centre cities get.
  check(`${L}: results-day Pulse holds offers back at high risk`,
    /shown once the catch-up plan is done/.test(pulse.en) && !/trial class/.test(pulse.en) && !/ट्रायल/.test(pulse.hi), pulse.en.slice(-200));
  check(`${L}: Pulse escalates to a mentor after a week, in English and Hindi`,
    /still behind after a week, a PW mentor will call/.test(pulse.en) && /एक हफ्ते बाद भी/.test(pulse.hi)
      && !/tomorrow|6:30/.test(pulse.en) && !/कल शाम|6:30/.test(pulse.hi), pulse.en.slice(0, 120));

  const total = norm(await page.textContent('#m-total'));
  check(`${L}: impact total ₹85.3 cr · $8.97M`, total === '₹85.3 cr · $8.97M', total);
  const netTxt = norm(await page.textContent('#m-net'));
  check(`${L}: net of running costs ₹79.1 cr · $8.32M`, netTxt === '₹79.1 cr · $8.32M', netTxt);

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

// The case study, its live audit and the prototype are three ways in. Whichever
// one a visitor lands on, the other two must be on screen without scrolling,
// and following each must land where it says.
const ENTRY = {
  study: { path: '/pw-study', to: { audit: 'a[href="#audit"]', proto: 'a[href="/pw-study/prototype"]' } },
  audit: { path: '/pw-study#audit', to: { study: '#audit a[href="#top"]', proto: '#audit a[href="/pw-study/prototype"]' } },
  proto: { path: '/pw-study/prototype', to: { study: '.xlinks a[href="/pw-study"]', audit: '.xlinks a[href="/pw-study#audit"]' } },
};
const LANDS = {
  study: async (page) => (new URL(page.url())).pathname === '/pw-study' && page.$eval('.hero h1', (h) => { const r = h.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }),
  audit: async (page) => (new URL(page.url())).pathname === '/pw-study' && page.$eval('#au-h', (h) => { const r = h.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }),
  proto: async (page) => (new URL(page.url())).pathname === '/pw-study/prototype' && !!(await page.$('#e-tier')),
};

async function crossNav(browser, vp) {
  for (const [from, spec] of Object.entries(ENTRY)) {
    for (const [to, sel] of Object.entries(spec.to)) {
      const L = `[${vp.name}] nav ${from} -> ${to}`;
      const { ctx, page } = await open(browser, vp, spec.path);
      await page.waitForTimeout(400);
      // Visible and inside the first screen: the first match that is, if any.
      const link = await page.evaluateHandle((s) => [...document.querySelectorAll(s)].find((a) => {
        const r = a.getBoundingClientRect(); const cs = getComputedStyle(a);
        return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && r.top >= 0 && r.bottom <= innerHeight
          && r.left >= 0 && r.right <= innerWidth;
      }) || null, sel);
      const el = link.asElement();
      check(`${L}: link on screen without scrolling`, !!el, el ? norm(await el.innerText()) : 'no visible ' + sel);
      if (el) {
        await Promise.all([page.waitForLoadState('domcontentloaded'), el.click()]);
        await page.waitForTimeout(700);
        const ok = await LANDS[to](page);
        check(`${L}: following it lands there`, ok, page.url());
      }
      await ctx.close();
    }
  }
  // Inside the case study's iframe the prototype's intro, links included, stays
  // hidden: the visitor is already on the case study.
  const { ctx, page } = await open(browser, vp, '/pw-study/prototype?embed=1');
  const shown = await page.$eval('.xlinks', (x) => x.getBoundingClientRect().height > 0).catch(() => false);
  check(`[${vp.name}] nav: embedded prototype does not repeat the links`, !shown, 'visible=' + shown);
  await ctx.close();
}

// The case study quotes the calculator's result. Read both and compare, so the
// page can never claim a number the calculator does not produce.
async function consistency(browser) {
  const vp = VIEWPORTS[2];
  const a = await open(browser, vp, '/pw-study');
  const study = await a.page.$$eval('#im-range tbody tr', (rs) => {
    const r = rs.find((x) => x.cells[0].innerText.trim().startsWith('Net of running costs'));
    return r ? r.cells[2].innerText.trim() : '';
  });
  await a.ctx.close();
  const b = await open(browser, vp, '/pw-study/prototype');
  await b.page.click('#t-console');
  const calc = (norm(await b.page.textContent('#m-net')).match(/₹(-?[\d.]+) cr/) || [])[1] || '';
  await b.ctx.close();
  check('case study net base matches the prototype calculator', study !== '' && study === calc, `case study ${study} vs calculator ${calc}`);
}

(async () => {
  const browser = await chromium.launch();
  await consistency(browser);
  for (const vp of VIEWPORTS) {
    await caseStudy(browser, vp);
    await prototype(browser, vp);
    await crossNav(browser, vp);
    await walkthrough(browser, vp);
  }
  for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(70) + (d || ''));
  const pass = results.filter((r) => r[0] === 'PASS').length;
  console.log('\n' + pass + '/' + results.length + ' passed' + (MUT ? '  [MUT=' + MUT + ']' : ''));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(2); });
