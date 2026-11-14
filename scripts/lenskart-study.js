// The Lenskart case study (/lenskart-study) and its prototype
// (/lenskart-study/prototype) work at phone, tablet and desktop width, under
// the site's real CSP.
//
// WHAT THIS GUARDS
//   Both pages are self-contained HTML with inline logic: a recall engine, an
//   age-routed WhatsApp check-in, a seeded 5,000-customer console and an impact
//   calculator whose totals are quoted on the case study itself. A change to
//   the engine weights, the calculator defaults or a label could ship a page
//   that contradicts its own numbers without anything going red.
//
//   It also pins the product's promises, because they are what the case study
//   argues for: nothing is offered before an eye test, nothing is sent or
//   offered while a service ticket is open, and a check-in never carries a
//   price or an offer.
//
// CSP
//   `serve` sends no headers, and vercel.json's site-wide Content-Security-
//   Policy is what production enforces. Every HTML response here gets that
//   policy injected, so a violation shows up as a console error and fails the
//   run, as it would on the live site.
//
// Run against a served build:  node scripts/lenskart-study.js
// Each MUT plants one defect; the named check must then fail.
//   race        a late assistant reply lands in the next customer's chat
//   dash        an em dash on the page
//   auditnav, protonav   the cross-links between study, audit and prototype
//   costdrift   one running-cost input changes; study and calculator disagree
//   presale     a product is offered before the eye test
//   ticket      an offer is made while a service ticket is open
//   ticketchat  the assistant quotes a price while a service ticket is open
//   promo       a discount inside the check-in message
//   kidhome     a home eye test offered for a child under 14
//   symptom     a customer reporting trouble seeing is told all is fine
//   doctor      sudden loss, pain or flashes are treated as a routine test
//   reset       a re-test result does not reset the clock
//   refer       unchanged power with trouble seeing is closed out as "keep your pair"
//   doctorchat  the assistant quotes prices to someone told to see a doctor
//   goldtoggle  the Gold toggle changes nothing
//   leverdrift  the calculator's net by lever stops matching the case study
//   losssign    a loss in the console prints as a gain
//   referchat   the assistant quotes prices to someone referred to an eye doctor
//   nocall      the store calls a customer who never agreed to calls
//   consolemath the console table uses different maths from the calculator
//   embedbar    the embedded prototype shows a second consent bar
//   ambush      the case study opens on a claim with no explanation of what it is
//   deeplink    the prototype ignores its hash on load
//   walkurl     a walkthrough link points somewhere other than the URL it shows
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
  const R = {
    race: ['if(P[cur]===p && gen===chatGen) addMsg', 'addMsg'],
    dash: ['</body>', '<p>one\u2014two</p></body>'],
    costdrift: ['id="m-msg" type="number" step="0.0001" min="0" value="0.8631"', 'id="m-msg" type="number" step="0.0001" min="0" value="8.631"'],
    presale: ["if(s.result==='none'){", 'if(false){'],
    ticket: ["if(s.ticket) return {hold:true,tag:'On hold'", "if(false) return {hold:true,tag:'On hold'"],
    ticketchat: ["(simState.ticket && st!=='doctor') ?", 'false ?'],
    promo: ["you keep your pair.'+stop", "you keep your pair. Get 20% off a new pair today.'+stop"],
    kidhome: ['return p.home && p.age>=14 && p.age<=75;', 'return p.home;'],
    symptom: ["if(s.test>=iv || s.sym===1) return 'due';", "if(s.test>=iv) return 'due';"],
    doctor: ["if(s.sym===2) return 'doctor';", ''],
    reset: ['else simState.test = 0;', 'else simState.test = simState.test;'],
    nocall: ["a.push(s.callOk ? {t:'Store call on day 8 if no slot is booked'", "a.push(true ? {t:'Store call on day 8 if no slot is booked'"],
    consolemath: ['retests*perRetest(I)*I.incr - lost', 'n*0.07*4280'],
    refer: ["(s.result==='same' && s.sym===1) ? 'refer' : 'tested'", "'tested'"],
    doctorchat: ["var reply = st==='doctor' ?", 'var reply = false ?'],
    goldtoggle: ["[s.gold?'Or a home eye test in '+p.city+': free with your Gold membership.':", "[false?'':"],
    losssign: ["(n<0 && a>=unit/2 ? '−' : '')", "''"],
    referchat: ["    : st==='refer' ? (band(p.age)==='minor'?p.name+'\\'s':'Your')+' power has not changed, so new glasses will not help with this. Please see an eye doctor; the optometrist will write a referral. I will not suggest anything else until then.'\n", ''],
    leverdrift: ["['Store call on day 8', rCall*perRetest(I)*I.incr*mar - c4 - rCall*perT]", "['Store call on day 8', rCall*perRetest(I)*I.incr*mar]"],
    embedbar: ['html.embed #consentBar{display:none!important}', ''],
    ambush: ['<p class="lede">An outside-in look at Lenskart, the Indian eyewear retailer, built only from public data', '<p class="lede">Lenskart'],
    deeplink: ['function fromHash(scroll, focus){', 'function fromHash(scroll, focus){ if(!focus) return;'],
    walkurl: ['<a href="/lenskart-study/prototype#checkin">https://', '<a href="/lenskart-study/prototype#console">https://'],
  };
  if (MUT === 'auditnav') return src.replace(/<div class="hero-ctas" style="margin-top:6px"><a class="btn btn-outline sm" href="#top">.*?<\/div>/, '');
  if (MUT === 'protonav') return src.replace(/<div class="xlinks">.*?<\/div>/, '');
  if (MUT && !R[MUT]) throw new Error('unknown MUT ' + MUT);
  if (R[MUT] && src.includes('Vision Recall Engine') && !src.includes(R[MUT][0]) && /prototype|study/.test(src) && MUT !== 'dash') return src;
  return R[MUT] ? src.replace(R[MUT][0], R[MUT][1]) : src;
}

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail == null ? '' : String(detail)]);
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function open(browser, vp, path, slowFonts) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  const bag = { errors: [], failed: [] };
  let closed = false;
  ctx.on('close', () => { closed = true; });
  await ctx.route('**/*', async (route) => {
    try {
      if (slowFonts && /fonts\.g(oogleapis|static)\.com/.test(route.request().url())) await new Promise((r) => setTimeout(r, slowFonts));
      const res = await route.fetch();
      const headers = { ...res.headers() };
      if (!(headers['content-type'] || '').includes('text/html')) return await route.fulfill({ response: res });
      headers['content-security-policy'] = CSP;
      const body = new URL(route.request().url()).pathname.startsWith('/lenskart-study') ? mutate(await res.text()) : await res.text();
      return await route.fulfill({ response: res, headers, body });
    } catch (e) {
      if (!route.request().url().startsWith(BASE) && /ENOTFOUND|EAI_AGAIN|ENETUNREACH/.test(e.message)) {
        return await route.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {});
      }
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
  // Against the live site the host's edge now and then answers a burst of
  // headless loads with a 403 challenge page instead of ours (measured: 1 in
  // 36). That is the host, not the page, so retry it, and say so, rather than
  // let one challenge crash every check after it. Anything else still fails.
  let res = await page.goto(BASE + path, { waitUntil: 'networkidle' });
  for (let i = 1; res.status() === 403 && i <= 3; i++) {
    console.log(`  note  ${path}: host answered 403, retry ${i} of 3`);
    await page.waitForTimeout(3000 * i);
    // reload, not goto: the same URL again is a same-document hash change.
    res = (await page.reload({ waitUntil: 'networkidle' })) || res;
  }
  if (res.status() !== 403) bag.failed = bag.failed.filter((f) => f !== (BASE + path).split('#')[0] + ' HTTP 403');
  return { ctx, page, bag, status: res.status() };
}

// Title, textContent (hidden tabs included) and innerText, minus script/style.
const dashes = (frame) => frame.evaluate(() => {
  const c = document.body.cloneNode(true);
  c.querySelectorAll('script,style,noscript').forEach((n) => n.remove());
  return (document.title + '\n' + c.textContent + '\n' + document.body.innerText).match(/.{0,30}[\u2013\u2014].{0,30}/g) || [];
});
const hScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

// One family, in the order a customer meets them.
const FEATURES = ['Recall Date', 'Recall Reminder', 'Recall Booking', 'Recall Outcome', 'First Prescription Follow-up', 'Recall Dashboard'];

async function names(page, L) {
  const title = await page.title();
  check(`${L}: titled for the Vision Recall Engine or the Lenskart case study`, /Vision Recall Engine/.test(title) && /Anchit Tandon/.test(title), title);
}

// Where each shared link must land: a case study section heading on screen,
// or the prototype tab it names, selected and on screen.
const PROTO_TAB = { customer: 't-customer', due: 't-customer', plan: 't-customer', next: 't-customer', followup: 't-customer', checkin: 't-checkin', console: 't-console', brand: 't-brand' };
async function landed(page, href) {
  const u = new URL(href, BASE);
  const h = u.hash.slice(1);
  if (u.pathname === '/lenskart-study') {
    return page.evaluate((id) => {
      const s = document.getElementById(id); const hd = s && s.querySelector('h2');
      if (!hd) return false; const r = hd.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight;
    }, h);
  }
  if (u.pathname !== '/lenskart-study/prototype' || !PROTO_TAB[h]) return false;
  return page.evaluate(([tab, h]) => {
    const t = document.getElementById(tab);
    const target = document.getElementById(h);
    const barEl = document.getElementById('dl-bar');
    // A missing element fails this one check with what the page was, rather
    // than crashing every check after it.
    if (!t || !target || !barEl) return `missing ${[!t && '#' + tab, !target && '#' + h, !barEl && '#dl-bar'].filter(Boolean).join(' ')} on "${document.title}" (${document.readyState}, ${document.body ? document.body.innerText.length : 0} chars)`;
    const r = target.getBoundingClientRect();
    // A whole-tab link must also keep the concept notice bar on screen.
    const bar = barEl.getBoundingClientRect();
    const whole = t.getAttribute('aria-controls') === 'p-' + h;
    // The follow-up link also has to select Ravi, the first-test customer.
    if (h === 'followup' && target.getAttribute('aria-pressed') !== 'true') return false;
    return t.getAttribute('aria-selected') === 'true' && r.top >= 0 && r.top < innerHeight && (!whole || (bar.top >= 0 && bar.top < innerHeight));
  }, [PROTO_TAB[h], h]);
}

// The reviewer walkthrough: every step shows a complete URL, links to exactly
// that URL, and opening it cold lands on the right screen. "Copy all" copies
// the same full links.
async function walkthrough(browser, vp) {
  const L = `[${vp.name}] walkthrough`;
  const { ctx, page } = await open(browser, vp, '/lenskart-study#walkthrough');
  const steps = await page.$$eval('#walk li .wu a', (as) => as.map((a) => [a.getAttribute('href'), a.textContent.trim()]));
  steps.push(await page.$eval('.share a', (a) => [a.getAttribute('href'), a.textContent.trim()]));
  const tries = await page.$$eval('#bet a.try', (as) => as.map((a) => a.getAttribute('href')));
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

  // A shared link must still land when the web font arrives late and the text
  // above the target re-wraps. This is a guard, not a proof: `/lenskart-study#me`
  // missed once on CI at 390 and could not be reproduced in 36 local loads, with
  // or without the page's re-land script, so no planted defect backs this check.
  for (const href of ['/lenskart-study#me', '/lenskart-study#impact']) {
    const o = await open(browser, vp, href, 1500);
    await o.page.waitForTimeout(900);
    const ok = await landed(o.page, href);
    check(`${L}: ${href} lands on its section even when the web font is late`, ok === true, typeof ok === 'string' ? ok : o.page.url());
    await o.ctx.close();
  }
  for (const href of [...steps.map((s) => s[0]), ...tries, '/lenskart-study/prototype#brand']) {
    const o = await open(browser, vp, href);
    await o.page.waitForTimeout(500);
    const ok = await landed(o.page, href);
    check(`${L}: ${href} opens on the right screen`, ok === true, typeof ok === 'string' ? `${ok} HTTP ${o.status}` : o.page.url());
    await o.ctx.close();
  }
}

async function caseStudy(browser, vp) {
  const L = `[${vp.name}] /lenskart-study`;
  const { ctx, page, bag, status } = await open(browser, vp, '/lenskart-study');
  check(`${L}: HTTP 200`, status === 200, status);
  await names(page, L);

  // The 60-second summary comes first, then the problem; the proposed system by feature name.
  const sys = await page.evaluate(() => ({
    order: [...document.querySelectorAll('main > section')].slice(0, 2).map((s) => s.id),
    h2: (document.querySelector('#sys-h') || {}).textContent || '',
    feats: [...document.querySelectorAll('#bet .feat .step b')].map((b) => b.textContent.trim()),
    skip: (document.querySelector('a.skip') || { getAttribute() {} }).getAttribute('href'),
  }));
  check(`${L}: summary first, then the problem; the proposal is stated once, with six named features`,
    sys.order.join() === 'summary,problem' && /Vision Recall Engine/.test(sys.h2) && sys.feats.join() === FEATURES.join(), JSON.stringify(sys));
  // A first-time visitor must be told what this is before being told a claim:
  // that it is outside-in, from public data, not Lenskart's, the finding, and
  // how to read it. Reviewer feedback: no self-introduction in the opening, and
  // a tone that allows Lenskart may already have tried it.
  const intro = await page.evaluate(() => ({
    h1: document.querySelector('.hero h1').innerText, lede: document.querySelector('.hero .lede').innerText,
    finding: (document.querySelector('.finding') || {}).innerText || '', read: [...document.querySelectorAll('.howread li a')].map((a) => a.getAttribute('href')),
    units: (document.querySelector('.howread .units') || {}).innerText || '',
    order: [...document.querySelectorAll('.hero h1, .hero .lede, .hero .finding')].map((e) => e.className || e.tagName),
  }));
  check(`${L}: the page opens by saying what it is, who wrote it and how to read it`,
    /case study/i.test(intro.h1) && !/Anchit|product manager/.test(intro.lede) && /public data/.test(intro.lede) && /may well have tested/.test(intro.lede) && /not Lenskart's/.test(intro.lede) && /20\.7 million/.test(intro.finding)
      && intro.read.join() === '#summary,#walkthrough,#problem' && /crore/.test(intro.units) && intro.order.join() === 'H1,lede,finding', JSON.stringify(intro.order) + ' ' + intro.read.join());
  check(`${L}: a skip link to the content`, sys.skip === '#main' && !!(await page.$('main#main')), sys.skip);

  const counts = {}; const said = {};
  for (const f of ['live', 'part', 'none']) {
    await page.click(`.filters .chip[data-f="${f}"]`);
    counts[f] = await page.$$eval('#audit-tbl tbody tr', (rs) => rs.filter((r) => r.offsetParent !== null).length);
    said[f] = norm(await page.textContent('#audit-count'));
  }
  await page.click('.filters .chip[data-f="all"]');
  check(`${L}: audit filters show 12 live, 4 partial, 6 not found, and say so`,
    counts.live === 12 && counts.part === 4 && counts.none === 6 && /^Showing 6 of 22/.test(said.none), JSON.stringify(counts) + ' ' + said.none);
  // The audit could not load the rendered India storefront; the page must say so.
  const limit = await page.$eval('#audit .sec-head', (e) => e.innerText);
  check(`${L}: audit states that the rendered India storefront was not seen`, /redirected to its US storefront/.test(limit), limit.slice(0, 80));
  // On a phone the evidence column must be on screen, not off to the right.
  const clipped = await page.$$eval('table.stack', (ts) => ts.filter((t) => {
    const box = t.closest('.tbl').getBoundingClientRect();
    return [...t.querySelectorAll('tbody td, tbody th')].some((c) => { const r = c.getBoundingClientRect(); return r.width > 0 && (r.right > box.right + 1 || r.left < box.left - 1); });
  }).length);
  check(`${L}: every cell of the audit, gaps, ideas, bet and risks tables is inside its box`, clipped === 0, clipped + ' table(s) clipped');

  const imgs = [];
  for (const img of await page.$$('.shots.mob-only img')) {
    if (!(await img.isVisible())) continue;
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, img, { timeout: 10000 }).catch(() => {});
    imgs.push(await img.evaluate((el) => el.complete && el.naturalWidth === +el.getAttribute('width') && el.naturalHeight === +el.getAttribute('height')));
  }
  const frameEl = await page.$('iframe.proto-frame');
  const frameVisible = await frameEl.isVisible();
  if (vp.width >= 1140) {
    check(`${L}: iframe shown, screenshots hidden`, frameVisible && imgs.length === 0, `iframe=${frameVisible} imgs=${imgs.length}`);
    await frameEl.scrollIntoViewIfNeeded();
    const fr = await frameEl.contentFrame();
    await fr.waitForFunction(() => (document.getElementById('e-tier') || {}).textContent, null, { timeout: 15000 });
    await page.waitForTimeout(600);
    const hero = await fr.$eval('.hero', (h) => getComputedStyle(h).display);
    check(`${L}: embedded prototype hides its hero`, hero === 'none', hero);
    const tier = norm(await fr.textContent('#e-tier'));
    check(`${L}: embedded engine tag reads Overdue`, tier === 'Overdue', tier);
    // The frame is as tall as its content, so the page scrolls and the frame does not.
    const fit = await page.$eval('#proto-frame', (f) => [f.offsetHeight, f.contentDocument.documentElement.scrollHeight]);
    await fr.click('#t-console');
    await page.waitForTimeout(500);
    const fit2 = await page.$eval('#proto-frame', (f) => [f.offsetHeight, f.contentDocument.documentElement.scrollHeight]);
    await fr.click('#t-customer');
    check(`${L}: the embedded prototype is never cut off or scrolled inside its frame`, fit[0] >= fit[1] && fit2[0] >= fit2[1] && fit2[0] !== fit[0], `${fit.join('/')} then ${fit2.join('/')}`);
    // One consent bar on the page, not a second one inside the frame.
    const bars = await fr.$$eval('#consentBar', (b) => b.filter((x) => x.getBoundingClientRect().height > 0).length);
    check(`${L}: no second consent bar inside the embedded prototype`, bars === 0, bars + ' visible');
    const d = await dashes(fr);
    check(`${L}: no em/en dash inside the iframe`, d.length === 0, d.join(' | '));
  } else {
    check(`${L}: 3 screenshots load at their stated size, iframe hidden`, imgs.length === 3 && imgs.every(Boolean) && !frameVisible,
      `loaded=${imgs.filter(Boolean).length}/${imgs.length} iframe=${frameVisible}`);
  }

  // The section nav follows the reader: the active link is marked and on screen.
  await page.evaluate(() => document.getElementById('impact').scrollIntoView());
  await page.waitForTimeout(500);
  const navOn = await page.evaluate(() => {
    const a = document.querySelector('#links a[aria-current="true"]'); if (!a) return 'none';
    const r = a.getBoundingClientRect(); const b = document.getElementById('links').getBoundingClientRect();
    return a.getAttribute('href') + (r.left >= b.left - 1 && r.right <= b.right + 1 ? ' visible' : ' clipped');
  });
  check(`${L}: the section nav marks the current section and keeps it in view`, navOn === '#impact visible', navOn);

  const over = await hScroll(page);
  check(`${L}: no horizontal page scroll`, over <= 0, over + 'px');

  const range = await page.$$eval('#im-range tbody tr', (rs) => rs.map((r) => [...r.cells].map((c) => c.innerText.trim())));
  const row = (label) => (range.find((r) => r[0].startsWith(label)) || []).slice(1);
  check(`${L}: sizing shows low, base and high`, row('Extra revenue').join() === '4.0,14.0,24.1', JSON.stringify(row('Extra revenue')));
  check(`${L}: sizing is contribution net of running costs`, row('Net of running costs').join() === '−1.0,3.9,8.9', JSON.stringify(row('Net of running costs')));
  // Each column of levers must add up to the total printed under it.
  const f = (t) => parseFloat(String(t).replace('−', '-'));
  const sums = [0, 1, 2].map((i) => range.slice(0, 3).reduce((a, r) => a + f(r[i + 1]), 0));
  const tot = row('Extra revenue').map(f);
  check(`${L}: the two levers less the lens-swap loss add up to the total in every column`, sums.every((x, i) => Math.abs(x - tot[i]) <= 0.11), sums.map((x) => x.toFixed(1)).join());
  const costRows = await page.$$eval('#im-cost tbody tr', (rs) => rs.map((r) => parseFloat(r.cells[2].innerText)));
  const costTotal = costRows.pop();
  check(`${L}: running costs are itemised and add up`, costTotal === 3.94 && Math.abs(costRows.reduce((a, b) => a + b, 0) - costTotal) <= 0.011, costRows.join('+') + '=' + costTotal);
  // Which lever earns the money: the rows must add up to the net.
  const lev = await page.$$eval('#im-lever tbody tr', (rs) => rs.map((r) => r.cells[1].innerText.trim()));
  const levSum = lev.slice(0, -1).reduce((a, x) => a + f(x), 0);
  check(`${L}: the net is broken down by lever and the rows add up`, lev.length === 5 && lev[lev.length - 1] === row('Net of running costs')[1] && Math.abs(levSum - f(lev[lev.length - 1])) <= 0.11, lev.join(' , '));
  const sensBase = await page.$$eval('#im-sens tbody tr', (rs) => rs.map((r) => r.cells[2].innerText.trim()));
  check(`${L}: every sensitivity row shares the base case`, sensBase.length === 8 && sensBase.every((x) => x === row('Net of running costs')[1]), sensBase.join());
  const hidden = await page.$$eval('#im-range td.num, #im-cost td.num, #im-sens td.num', (cs) => cs.filter((c) => {
    const box = c.closest('.tbl').getBoundingClientRect(); const r = c.getBoundingClientRect();
    return r.right > box.right + 1 || r.left < box.left - 1;
  }).map((c) => c.innerText.trim()));
  check(`${L}: every sizing figure is visible without scrolling the table`, hidden.length === 0, hidden.slice(0, 6).join(' | '));
  const voices = await page.$$eval('#voices figure', (fs) => fs.map((f) => [f.querySelector('blockquote').innerText, f.querySelector('figcaption').innerText]));
  check(`${L}: at least six dated, rated user quotes`,
    voices.length >= 6 && voices.every(([q, c]) => /^".+"$/.test(q.trim()) && /\d★ · \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(norm(c))), voices.length + ' quotes');
  const d = await dashes(page);
  check(`${L}: no em/en dash`, d.length === 0, d.join(' | '));
  await page.waitForTimeout(300);
  check(`${L}: zero console errors (CSP on)`, bag.errors.length === 0, bag.errors.join(' | '));
  check(`${L}: zero failed requests`, bag.failed.length === 0, bag.failed.join(' | '));
  await ctx.close();
}

const setRange = (page, id, v) => page.$eval(id, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const setNum = setRange;
const nextCard = async (page) => ({ title: norm(await page.$eval('#s-next .banner b', (b) => b.textContent)), text: norm(await page.textContent('#s-next')), hold: await page.$eval('#s-next', (e) => e.classList.contains('hold')) });
const who = (page, i) => page.click(`.persona-row .chip[data-p="${i}"]`);
const tierOf = async (page) => norm(await page.textContent('#e-tier'));
const stepsOf = (page) => page.$$eval('#e-actions .step b', (b) => b.map((x) => x.textContent.trim()));
const checkinText = async (page) => { await page.click('#t-checkin'); const t = norm(await page.textContent('#wa-body')); await page.click('#t-customer'); return t; };
const ask = async (page, q) => { await page.click(`#quick button[data-q="${q}"]`); await page.waitForTimeout(400); return (await page.$$eval('#chat .bubble.ai', (b) => b.map((x) => x.textContent))).pop(); };
const SALES = /₹|%|\boff\b|offer|discount|gold|छूट|ऑफ़र/i;

async function prototype(browser, vp) {
  const L = `[${vp.name}] /lenskart-study/prototype`;
  const { ctx, page, bag, status } = await open(browser, vp, '/lenskart-study/prototype');
  check(`${L}: HTTP 200`, status === 200, status);
  await names(page, L);

  const pIntro = await page.evaluate(() => ({ h1: document.querySelector('.hero h1').innerText, lede: document.querySelector('.hero .lede').innerText, steps: document.querySelectorAll('.hero .start li').length }));
  check(`${L}: the demo opens by saying what it is and how to use it`,
    /demo/i.test(pIntro.h1) && !/Anchit/.test(pIntro.lede) && /public data/.test(pIntro.lede) && /made up/.test(pIntro.lede) && pIntro.steps === 3, JSON.stringify(pIntro).slice(0, 120));
  await page.click('.feats a[href="#console"]');
  const viaFeat = await page.getAttribute('#t-console', 'aria-selected');
  await page.click('#t-checkin');
  const hashNow = await page.evaluate(() => location.hash);
  await page.focus('#t-checkin');
  await page.keyboard.press('End');
  const endTab = await page.getAttribute('#t-brand', 'aria-selected');
  await page.keyboard.press('Home');
  const homeTab = await page.getAttribute('#t-customer', 'aria-selected');
  check(`${L}: feature links switch tabs, each tab has its own link, Home and End work`,
    viaFeat === 'true' && hashNow === '#checkin' && endTab === 'true' && homeTab === 'true', `console=${viaFeat} hash=${hashNow} end=${endTab} home=${homeTab}`);

  // Status per customer, the phone agreeing with the engine, and nothing for
  // sale before an eye test.
  const tiers = { 0: 'Overdue', 1: 'Not due', 2: 'Due now', 3: 'Due now', 4: 'First Prescription Follow-up', 5: 'Due now' };
  const got = {}; const disagree = []; const presale = [];
  for (const i of [1, 2, 3, 4, 5, 0]) {
    await who(page, i);
    got[i] = await tierOf(page);
    const st = norm(await page.textContent('#s-status'));
    if (/overdue/.test(st) !== (got[i] === 'Overdue') || /up to date/.test(st) !== (got[i] === 'Not due')) disagree.push(`p${i}: "${st}" vs ${got[i]}`);
    const n = await nextCard(page);
    if (i !== 4 ? (!n.hold || /₹/.test(n.text)) : SALES.test(n.text)) presale.push(`p${i}: ${n.title}`);
  }
  check(`${L}: Neha Overdue, Arjun Not due, Kabir, Meera and Usha Due now, Ravi in follow-up`, Object.keys(tiers).every((i) => got[i] === tiers[i]), JSON.stringify(got));
  check(`${L}: phone and engine agree on how due the test is`, disagree.length === 0, disagree.join(' | '));
  check(`${L}: nothing is priced or offered before an eye test`, presale.length === 0, presale.join(' | '));

  // The due status comes from the test date and the age band only. The age of
  // the pair must not make anyone overdue; a long gap must.
  await who(page, 3); await setRange(page, '#in-pair', 60);
  const pairOnly = await tierOf(page);
  await who(page, 2); await setRange(page, '#in-test', 48);
  const longGap = [await tierOf(page), norm(await page.textContent('#s-status'))];
  check(`${L}: an old pair does not change the due status; a long gap does`, pairOnly === 'Due now' && longGap[0] === 'Overdue' && /^Kabir's eye test is overdue/.test(longGap[1]) && /Sana agreed to a call/.test(norm(await page.textContent('#e-actions'))), `${pairOnly} | ${longGap.join(' | ')}`);

  // Overdue gets a booking first; the store calls only a customer who agreed.
  await who(page, 0);
  const steps = await stepsOf(page);
  await page.uncheck('#in-call');
  const noCall = await stepsOf(page);
  const noCallMsg = await checkinText(page);
  await page.check('#in-call');
  check(`${L}: overdue books a re-test first, then one store call on day 8`,
    steps[0] === 'Free re-test, booked in two taps' && steps.some((t) => /^Store call on day 8/.test(t)), JSON.stringify(steps));
  check(`${L}: no store call for a customer who did not agree to one`,
    !noCall.some((t) => /^Store call/.test(t)) && noCall.some((t) => /^No store call/.test(t)) && !/will call/.test(noCallMsg) && /remind you once more/.test(noCallMsg), JSON.stringify(noCall));

  // Gold members get the home eye test free; the plan and the assistant must say so.
  const goldPlan = [norm(await page.textContent('#s-plan'))];
  await page.check('#in-gold'); goldPlan.push(norm(await page.textContent('#s-plan')), await ask(page, 'cost'));
  await page.uncheck('#in-gold');
  check(`${L}: the Gold toggle changes the home eye test price`, /₹99, free for Gold members/.test(goldPlan[0]) && /free with your Gold membership/.test(goldPlan[1]) && /free with your Gold membership/.test(goldPlan[2]), goldPlan[1].slice(0, 90));

  // What a customer tells us can only add care. Trouble seeing brings a test
  // forward; just after a test it is a re-check, never a sale; red-flag
  // symptoms go to a doctor and stop everything else.
  await who(page, 1);
  await page.click('#in-sym button[data-s="1"]');
  const sym = [await tierOf(page), norm(await page.textContent('#s-status')), await ask(page, 'need')];
  check(`${L}: reported trouble seeing always leads to an eye test`, sym[0] === 'Due now' && /is due/.test(sym[1]) && /eye test first/.test(sym[2]), sym.slice(0, 2).join(' | '));
  await setRange(page, '#in-test', 2);
  const re = { tier: await tierOf(page), card: await nextCard(page), steps: await stepsOf(page), msg: await checkinText(page) };
  check(`${L}: trouble seeing just after a test is a free re-check, not a reminder or a sale`,
    re.tier === 'Re-check' && re.card.hold && !/₹/.test(re.card.text) && /^Free re-check/.test(re.steps[0]) && /^No message is sent/.test(re.msg), `${re.tier} | ${re.card.title} | ${re.steps[0]}`);
  await page.click('#in-sym button[data-s="2"]');
  await page.check('#in-ticket');
  const doc = { tier: await tierOf(page), card: await nextCard(page), steps: await stepsOf(page), chat: [await ask(page, 'need'), await ask(page, 'frame'), await ask(page, 'cost')], msg: await checkinText(page) };
  check(`${L}: sudden loss, pain or flashes go to an eye doctor and hold everything`,
    doc.tier === 'See an eye doctor' && doc.card.hold && /eye doctor/.test(doc.card.title) && /eye doctor/.test(doc.steps[0]) && doc.chat.every((r) => /eye doctor today/.test(r) && !/₹/.test(r)) && /^No message is sent/.test(doc.msg), `${doc.tier} | ${doc.card.title} | ${doc.steps[0]}`);

  // A re-test happens today: it resets the clock everywhere at once.
  await who(page, 0);
  await page.click('#in-result button[data-r="same"]');
  const after = {};
  after.same = { tier: await tierOf(page), card: await nextCard(page), plan: norm(await page.textContent('#s-nudge-title')), disabled: await page.$eval('#in-test', (e) => e.disabled), reply: await ask(page, 'need'), msg: await checkinText(page) };
  check(`${L}: a re-test result resets the clock in the plan, the assistant and the check-in`,
    after.same.tier === 'Tested today' && after.same.plan === 'Re-test done' && after.same.disabled && /has not changed/.test(after.same.reply) && /^No message is sent/.test(after.same.msg) && !/overdue/i.test(after.same.msg),
    `${after.same.tier} | ${after.same.plan} | ${after.same.msg.slice(0, 50)}`);
  check(`${L}: unchanged power keeps the pair, with no price`, after.same.card.title === 'Your power is the same' && after.same.card.hold && !/₹/.test(after.same.card.text), after.same.card.title);
  // Tested, power unchanged, and still trouble seeing: glasses are not the
  // answer, so the customer is referred on instead of told to keep the pair.
  await page.click('#in-sym button[data-s="1"]');
  const ref = { tier: await tierOf(page), card: await nextCard(page), steps: await stepsOf(page), reply: await ask(page, 'need'), other: [await ask(page, 'frame'), await ask(page, 'cost')] };
  check(`${L}: unchanged power with trouble seeing is referred to an eye doctor`,
    ref.tier === 'Refer to an eye doctor' && ref.card.hold && /eye doctor/.test(ref.card.text) && !/Keep your pair/.test(ref.card.text) && /^Refer to an eye doctor/.test(ref.steps[0]) && /see an eye doctor/.test(ref.reply) && ref.other.every((r) => /see an eye doctor/.test(r) && !/₹/.test(r)), `${ref.tier} | ${ref.card.title} | ${ref.steps[0]}`);
  await page.click('#in-result button[data-r="none"]');
  const back = [await tierOf(page), await page.$eval('#in-test', (e) => e.value + (e.disabled ? ' disabled' : ''))];
  check(`${L}: "Not tested yet" puts the customer's own test date back`, back[0] === 'Overdue' && back[1] === '38', back.join(' | '));

  // What follows a changed power depends on the wearer, never on selling a frame.
  await page.click('#in-result button[data-r="changed"]'); after.oldFrame = await nextCard(page);
  await setRange(page, '#in-pair', 12); after.youngFrame = await nextCard(page);
  await who(page, 2); await page.click('#in-result button[data-r="changed"]'); after.child = await nextCard(page);
  await who(page, 3); await page.click('#in-result button[data-r="changed"]'); after.near = await nextCard(page);
  check(`${L}: changed power means new lenses in the current frame for the ₹199 fitting fee, whatever the frame's age`,
    after.oldFrame.title === 'New lenses in your current frame' && after.youngFrame.title === after.oldFrame.title && /₹199 fitting fee/.test(after.oldFrame.text)
      && /over two years old/.test(after.oldFrame.text) && /a new frame is your choice/.test(after.oldFrame.text) && !/over two years old/.test(after.youngFrame.text),
    `${after.oldFrame.title} | ${after.youngFrame.title}`);
  check(`${L}: a child on myopia control gets the lens the optometrist confirms, with no ₹199 claim; near blur after 40 gets progressives at the published price`,
    /^New myopia-control lenses in Kabir's current frame/.test(after.child.title) && /optometrist confirms the lens/.test(after.child.text) && !/₹199/.test(after.child.text)
      && /^Progressive lenses/.test(after.near.title) && /From ₹649/.test(after.near.text) && !/Gold/.test(after.near.text), `${after.child.title} | ${after.near.title}`);

  // An open ticket stops every offer, every message and every priced answer.
  await who(page, 0);
  await page.click('#in-result button[data-r="changed"]');
  await page.check('#in-ticket');
  const held = await nextCard(page);
  const heldSteps = await stepsOf(page);
  const heldChat = [await ask(page, 'need'), await ask(page, 'frame'), await ask(page, 'cost')];
  const heldMsg = await checkinText(page);
  check(`${L}: an open service ticket holds the offer, the actions, the assistant and the check-in`,
    held.hold && held.title === 'No offer while your ticket is open' && heldSteps[0] === 'Hold every message and offer' && /^No message is sent/.test(heldMsg)
      && heldChat.every((r) => /open ticket first/.test(r) && !/₹/.test(r)),
    `${held.title} | ${heldSteps[0]} | ${heldMsg.slice(0, 40)}`);

  // Ask Neha a question, switch to Arjun inside the 250 ms reply window.
  await who(page, 0);
  await page.click('#quick button[data-q="need"]');
  await who(page, 1);
  await page.waitForTimeout(500);
  const chat = await page.$$eval('#chat .bubble', (b) => b.map((x) => x.textContent));
  check(`${L}: a late reply never lands in the next customer's chat`, chat.length === 1 && /Arjun/.test(chat[0]), JSON.stringify(chat));

  await page.click('#t-checkin');
  await page.click('#pp-person button[data-p="2"]');
  const kabir = norm(await page.textContent('#pp-channel'));
  const kabirBtns = await page.$$eval('#wa-body .wa-btns span', (b) => b.map((x) => x.textContent));
  await page.click('#pp-person button[data-p="3"]');
  const meera = norm(await page.textContent('#pp-channel'));
  const before = norm(await page.textContent('#pp-channel'));
  await page.check('#pp-share');
  const afterShare = norm(await page.textContent('#pp-channel'));
  check(`${L}: check-in goes to the parent under 18, to the wearer otherwise, family copy only on opt-in`,
    /^Recall Reminder to Sana, Kabir's parent/.test(kabir) && /^Recall Reminder to Meera\./.test(meera) && /No one else sees it/.test(before) && /A copy also goes/.test(afterShare),
    `Kabir=${kabir.slice(0, 50)} Meera=${meera.slice(0, 40)}`);
  // Lenskart's home eye test is for ages 14 to 75; a 9-year-old is sent to the
  // store, in the message, the plan and the actions, even when overdue.
  await page.click('#t-customer');
  await who(page, 2);
  await setRange(page, '#in-test', 20);
  const kid = norm(await page.textContent('#s-plan')) + ' ' + norm(await page.textContent('#e-actions'));
  check(`${L}: no home eye test is offered for a child under 14`, kabirBtns.length === 3 && !kabirBtns.some((b) => /home/i.test(b)) && !/home eye test/i.test(kid) && /Free re-test/.test(kid), kabirBtns.join(' | ') + ' | ' + kid.slice(0, 80));

  // Neha's overdue check-in, in both languages: a slot and one store call, and
  // never a price or a discount.
  await page.click('#t-checkin');
  await page.click('#pp-person button[data-p="0"]');
  const msg = {}; const langs = {};
  for (const l of ['en', 'hi']) { await page.click(`#pp-lang button[data-l="${l}"]`); msg[l] = norm(await page.textContent('#wa-body')); langs[l] = await page.getAttribute('#wa-body', 'lang'); }
  await page.click('#pp-lang button[data-l="en"]');
  check(`${L}: check-in escalates to one store call, in English and Hindi, each marked with its language`,
    /your store will call once/.test(msg.en) && /आपका स्टोर एक बार फ़ोन करेगा/.test(msg.hi) && langs.en === 'en' && langs.hi === 'hi', msg.en.slice(0, 100));
  check(`${L}: check-in carries no price, offer or discount, and says how to opt out`, !SALES.test(msg.en) && !SALES.test(msg.hi) && /Reply STOP to stop these reminders/.test(msg.en), (msg.en.match(/.{0,30}(₹|%|off|offer|discount|gold).{0,20}/i) || [''])[0]);
  await page.click('#pp-person button[data-p="1"]');
  const arjun = norm(await page.textContent('#wa-body'));
  check(`${L}: a customer who is not due gets no message`, /^No message is sent/.test(arjun), arjun.slice(0, 60));

  // Ravi's first-test follow-up: two messages inside 30 days, then silence.
  await page.click('#pp-person button[data-p="4"]');
  const ravi = { title: norm(await page.textContent('#pp-channel')), d12: norm(await page.textContent('#wa-body')) };
  await page.click('#t-customer');
  for (const [k, d] of [['d1', 1], ['d25', 25], ['d40', 40]]) { await setRange(page, '#in-days', d); ravi[k] = await checkinText(page); }
  ravi.end = await tierOf(page);
  await setRange(page, '#in-days', 12);
  await page.click('#in-sym button[data-s="1"]');
  ravi.sym = [await tierOf(page), await checkinText(page)];
  await page.click('#in-sym button[data-s="0"]');
  check(`${L}: first-test follow-up sends two messages in 30 days, then stops; trouble seeing turns it into a re-check`,
    /^First Prescription Follow-up to Ravi/.test(ravi.title) && /message 1 of 2/.test(ravi.d12) && /^No message is sent/.test(ravi.d1) && /message 2 of 2/.test(ravi.d25)
      && /^No message is sent/.test(ravi.d40) && ravi.end === 'Follow-up ended' && !SALES.test(ravi.d12) && !SALES.test(ravi.d25)
      && ravi.sym[0] === 'Re-check' && /^No message is sent/.test(ravi.sym[1]), `${ravi.title} | ${ravi.d12.slice(0, 60)} | ${ravi.end}`);

  await page.click('#t-console');
  const total = norm(await page.textContent('#m-total'));
  check(`${L}: impact total ₹14.0 cr · $1.49M`, total === '₹14.0 cr · $1.49M', total);
  const netTxt = norm(await page.textContent('#m-net'));
  check(`${L}: contribution after running costs ₹3.9 cr · $0.42M`, netTxt === '₹3.9 cr · $0.42M', netTxt);
  const head = norm(await page.textContent('#segtbl th:last-child'));
  check(`${L}: value column is labelled as incremental revenue`, /^Incremental revenue/.test(head), head);
  // The table and the calculator share their assumptions: with no extra
  // re-tests the recall groups are worth nothing, and the KPI is the row total.
  const money = (t) => +t.replace(/[^\d]/g, '') || 0;
  const table = () => page.$$eval('#segtbl tbody tr', (rs) => rs.map((r) => [r.cells[0].innerText.trim(), r.cells[3].innerText.trim()]));
  const t1 = await table();
  const kpi = money(norm(await page.$eval('#kpis .kpi:last-child b', (b) => b.textContent)));
  await setNum(page, '#m-take', 0); await setNum(page, '#m-calllift', 0); await setNum(page, '#m-cann', 0);
  const t0 = await table();
  await setNum(page, '#m-take', 2); await setNum(page, '#m-calllift', 8); await setNum(page, '#m-cann', 3);
  const recall0 = t0.filter(([n]) => /due or overdue/.test(n)).map(([, v]) => v);
  const follow = t0.find(([n]) => /^First test/.test(n));
  check(`${L}: the console table uses the calculator's assumptions`,
    Math.abs(t1.reduce((a, [, v]) => a + money(v), 0) - kpi) <= 3 && recall0.length === 3 && recall0.every((v) => v === '0') && money(follow[1]) > 0, `kpi=${kpi} recall at 0pp=${recall0.join()}`);
  // With no uplift but the lens-swap loss still on, the recall groups lose money and must say so.
  await setNum(page, '#m-take', 0); await setNum(page, '#m-calllift', 0);
  const tLoss = await table(); const kpiLoss = norm(await page.$eval('#kpis .kpi:last-child b', (b) => b.textContent));
  await setNum(page, '#m-take', 2); await setNum(page, '#m-calllift', 8);
  const lossRows = tLoss.filter(([n]) => /due or overdue/.test(n)).map(([, v]) => v);
  check(`${L}: a loss in the console keeps its minus sign`, lossRows.length === 3 && lossRows.every((v) => /^−₹/.test(v)) && /^−₹/.test(kpiLoss), lossRows.join(' ') + ' kpi ' + kpiLoss);
  const zero = t1.filter(([n]) => /Open service ticket|Not due/.test(n)).map(([, v]) => v);
  check(`${L}: held and not-due groups get no message and are worth nothing`, zero.length === 2 && zero.every((z) => z === '0'), zero.join());
  // Selecting a row keeps keyboard focus on it and says it is expanded; a sort is announced.
  const picked = [];
  for (const idx of [-1, 0]) {
    const btns = await page.$$('#segtbl tbody .rowbtn');
    const bEl = btns[idx < 0 ? btns.length + idx : idx];
    const name = norm(await bEl.innerText());
    await bEl.focus();
    await page.keyboard.press('Enter');
    picked.push([name, norm(await page.textContent('#seg-detail h3')), norm(await page.textContent('#seg-detail .label')),
      await page.evaluate(() => { const a = document.activeElement; return a.className + ' ' + a.getAttribute('aria-expanded'); })]);
  }
  check(`${L}: a console row opens its detail by keyboard and keeps focus`,
    picked.every(([n, h, l, f]) => l === 'Selected group' && n === h && f === 'rowbtn true') && picked[0][1] !== picked[1][1], JSON.stringify(picked));
  await page.click('#segtbl th button[data-k="n"]');
  const sorted = await page.$$eval('#segtbl thead th', (ths) => ths.map((th) => th.getAttribute('aria-sort')));
  await page.click('#segtbl th button[data-k="value"]');
  check(`${L}: the sorted column is exposed`, sorted.join() === 'none,none,descending,none', sorted.join());
  // Nonsense inputs must not produce nonsense output.
  await setNum(page, '#m-acc', -5000000); await setNum(page, '#m-fx', 0); await setNum(page, '#m-pm', 250);
  const junk = norm(await page.textContent('#m-total')) + ' ' + norm(await page.textContent('#m-net')) + ' ' + norm(await page.textContent('#costs'));
  const noFx = !/\$/.test(norm(await page.textContent('#m-total')));
  await setNum(page, '#m-acc', 9900000); await setNum(page, '#m-fx', 94.24); await setNum(page, '#m-pm', 64);
  check(`${L}: the calculator never shows NaN, Infinity, negative revenue or a dollar figure without a rate`, !/NaN|Infinity/.test(junk) && !/^−/.test(junk) && noFx && norm(await page.textContent('#m-net')) === '₹3.9 cr · $0.42M', junk.slice(0, 90));

  let worst = 0;
  for (const tab of ['#t-customer', '#t-checkin', '#t-console', '#t-brand']) {
    await page.click(tab);
    worst = Math.max(worst, await hScroll(page));
  }
  check(`${L}: no horizontal page scroll on any tab`, worst <= 0, worst + 'px');
  const inner = await page.evaluate(() => {
    const out = [];
    for (const id of ['t-checkin', 't-console']) { document.getElementById(id).click();
      document.querySelectorAll('#aud-tbl, #segtbl').forEach((t) => { if (t.offsetParent && t.scrollWidth > t.parentElement.clientWidth + 1) out.push(t.id + ' ' + t.scrollWidth + '>' + t.parentElement.clientWidth); }); }
    document.getElementById('t-customer').click();
    return out;
  });
  check(`${L}: the check-in and console tables fit their boxes`, inner.length === 0, inner.join(' | '));
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
  study: { path: '/lenskart-study', to: { audit: 'a[href="#audit"]', proto: 'a[href="/lenskart-study/prototype"]' } },
  audit: { path: '/lenskart-study#audit', to: { study: '#audit a[href="#top"]', proto: '#audit a[href="/lenskart-study/prototype"]' } },
  proto: { path: '/lenskart-study/prototype', to: { study: '.xlinks a[href="/lenskart-study"]', audit: '.xlinks a[href="/lenskart-study#audit"]' } },
};
const LANDS = {
  study: async (page) => (new URL(page.url())).pathname === '/lenskart-study' && page.$eval('.hero h1', (h) => { const r = h.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }),
  audit: async (page) => (new URL(page.url())).pathname === '/lenskart-study' && page.$eval('#au-h', (h) => { const r = h.getBoundingClientRect(); return r.top >= 0 && r.top < innerHeight; }),
  proto: async (page) => (new URL(page.url())).pathname === '/lenskart-study/prototype' && !!(await page.$('#e-tier')),
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
  const { ctx, page } = await open(browser, vp, '/lenskart-study/prototype?embed=1');
  const shown = await page.$eval('.xlinks', (x) => x.getBoundingClientRect().height > 0).catch(() => false);
  check(`[${vp.name}] nav: embedded prototype does not repeat the links`, !shown, 'visible=' + shown);
  await ctx.close();
}

// The case study quotes the calculator's results: the base case, the low and
// high cases, and every sensitivity row. Drive the calculator through each and
// compare, so the page can never claim a number the calculator does not produce.
async function consistency(browser) {
  const vp = VIEWPORTS[2];
  const a = await open(browser, vp, '/lenskart-study');
  const study = await a.page.evaluate(() => {
    const cells = (label) => { const r = [...document.querySelectorAll('#im-range tbody tr')].find((x) => x.cells[0].innerText.trim().startsWith(label)); return r ? [1, 2, 3].map((i) => r.cells[i].innerText.trim()) : []; };
    return {
      net: cells('Net of running costs'), rev: cells('Extra revenue'), cost: cells('Less running costs').map((c) => c.replace('−', '')),
      lever: [...document.querySelectorAll('#im-lever tbody tr')].slice(0, 4).map((r) => r.cells[1].innerText.trim()),
      sens: [...document.querySelectorAll('#im-sens tbody tr')].map((r) => ({ k: r.dataset.k, lo: r.dataset.lo, hi: r.dataset.hi, cells: [1, 3].map((i) => r.cells[i].innerText.trim()) })),
    };
  });
  await a.ctx.close();
  const b = await open(browser, vp, '/lenskart-study/prototype');
  await b.page.click('#t-console');
  const num = async (id) => { const m = norm(await b.page.textContent(id)).match(/(−?)₹([\d.]+) cr/); return m ? m[1] + m[2] : ''; };
  const set = (o) => b.page.evaluate((o) => { for (const k in o) { const e = document.getElementById(k); e.value = o[k]; e.dispatchEvent(new Event('input', { bubbles: true })); } }, o);
  const BASE_IN = { 'm-take': 2, 'm-calllift': 8, 'm-conv': 3, 'm-order': 3650, 'm-fval': 1950, 'm-incr': 75, 'm-reach': 80, 'm-cann': 3 };
  const read = async (o) => { await set({ ...BASE_IN, ...o }); return { net: await num('#m-net'), rev: await num('#m-total'), cost: await num('#m-cost') }; };
  const cases = [await read({ 'm-take': 1, 'm-calllift': 4, 'm-conv': 1.5 }), await read({}), await read({ 'm-take': 3, 'm-calllift': 12, 'm-conv': 4.5 })];
  const okCases = cases.every((c, i) => c.net === study.net[i] && c.rev === study.rev[i] && c.cost === study.cost[i]);
  check('case study low, base and high match the prototype calculator', study.net.length === 3 && okCases,
    `case study ${JSON.stringify([study.rev, study.cost, study.net])} vs calculator ${JSON.stringify(cases)}`);
  await read({});
  const byLever = await b.page.$$eval('#bylever .lever-head span:last-child', (xs) => xs.map((x) => x.textContent.replace('₹', '').replace(' cr', '').trim()));
  check('the case study\'s net by lever matches the prototype calculator', study.lever.length === 4 && study.lever.join() === byLever.join(), `case study ${study.lever.join()} vs calculator ${byLever.join()}`);
  const bad = [];
  for (const r of study.sens) {
    const lo = (await read({ [r.k]: r.lo })).net; const hi = (await read({ [r.k]: r.hi })).net;
    if (lo !== r.cells[0] || hi !== r.cells[1]) bad.push(`${r.k}: page ${r.cells.join('/')} vs calculator ${lo}/${hi}`);
  }
  check('every sensitivity figure on the case study matches the prototype calculator', study.sens.length === 8 && bad.length === 0, bad.join(' | ') || study.sens.length + ' rows');
  await b.ctx.close();
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
