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
//   race      a late assistant reply lands in the next customer's chat
//   dash      an em dash on the page
//   auditnav, protonav   the cross-links between study, audit and prototype
//   costdrift one running-cost input changes; study and calculator disagree
//   presale   a product is offered before the eye test
//   ticket    an offer is made while a service ticket is open
//   promo     a discount inside the check-in message
//   ticketchat the assistant quotes a price while a service ticket is open
//   kidhome   a home eye test offered for a child under 14
//   symptom   a customer reporting symptoms is told their prescription is fine
//   deeplink  the prototype ignores its hash on load
//   walkurl   a walkthrough link points somewhere other than the URL it shows
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
  if (MUT === 'dash') return src.replace('</body>', '<p>one\u2014two</p></body>');
  if (MUT === 'auditnav') return src.replace(/<div class="hero-ctas" style="margin-top:6px"><a class="btn btn-outline sm" href="#top">.*?<\/div>/, '');
  if (MUT === 'protonav') return src.replace(/<div class="xlinks">.*?<\/div>/, '');
  if (MUT === 'costdrift') return src.replace('id="m-msg" type="number" step="0.0001" min="0" value="0.8631"', 'id="m-msg" type="number" step="0.0001" min="0" value="8.631"');
  if (MUT === 'presale') return src.replace("if(s.result==='none'){", "if(false){");
  if (MUT === 'ticket') return src.replace("if(s.ticket) return {hold:true,tag:'On hold'", "if(false) return {hold:true,tag:'On hold'");
  if (MUT === 'promo') return src.replace("If your power is the same, you keep your pair.\\n\\nReply STOP", "If your power is the same, you keep your pair. Get 20% off a new pair today.\\n\\nReply STOP");
  if (MUT === 'kidhome') return src.replace('return p.home && p.age>=14 && p.age<=75;', 'return p.home;');
  if (MUT === 'symptom') return src.replace('(r>=35||s.sym>0||s.test>=iv)', '(r>=35)');
  if (MUT === 'ticketchat') return src.replace('var reply = simState.ticket ?', 'var reply = false ?');
  if (MUT === 'deeplink') return src.replace('function fromHash(scroll, focus){', 'function fromHash(scroll, focus){ if(!focus) return;');
  if (MUT === 'walkurl') return src.replace('<a href="/lenskart-study/prototype#checkin">https://', '<a href="/lenskart-study/prototype#console">https://');
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

const FEATURES = ['Recall Score', 'Re-test Plan', 'Sight Check-in', 'Next Pair Step', 'Growth Console'];

async function names(page, L) {
  const title = await page.title();
  check(`${L}: titled for the Vision Recall Engine or the Lenskart case study`, /Vision Recall Engine/.test(title) && /Anchit Tandon/.test(title), title);
}

// Where each shared link must land: a case study section heading on screen,
// or the prototype tab it names, selected and on screen.
const PROTO_TAB = { customer: 't-customer', recall: 't-customer', plan: 't-customer', next: 't-customer', checkin: 't-checkin', console: 't-console', brand: 't-brand' };
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
    const r = target.getBoundingClientRect();
    // A whole-tab link must also keep the concept notice bar on screen.
    const bar = document.getElementById('dl-bar').getBoundingClientRect();
    const whole = t.getAttribute('aria-controls') === 'p-' + h;
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

  for (const href of [...steps.map((s) => s[0]), ...tries, '/lenskart-study/prototype#brand']) {
    const o = await open(browser, vp, href);
    await o.page.waitForTimeout(500);
    const ok = await landed(o.page, href);
    check(`${L}: ${href} opens on the right screen`, ok === true, o.page.url());
    await o.ctx.close();
  }
}

async function caseStudy(browser, vp) {
  const L = `[${vp.name}] /lenskart-study`;
  const { ctx, page, bag, status } = await open(browser, vp, '/lenskart-study');
  check(`${L}: HTTP 200`, status === 200, status);
  await names(page, L);

  const sys = await page.evaluate(() => ({
    first: (document.querySelector('main > section') || {}).id,
    h2: (document.querySelector('#sys-h') || {}).textContent || '',
    feats: [...document.querySelectorAll('#system .feat .step b')].map((b) => b.textContent.trim()),
  }));
  check(`${L}: proposed system opens the page, five named features`,
    sys.first === 'system' && /Vision Recall Engine/.test(sys.h2) && sys.feats.join() === FEATURES.join(), JSON.stringify(sys));

  const counts = {};
  for (const f of ['live', 'part', 'none']) {
    await page.click(`.filters .chip[data-f="${f}"]`);
    counts[f] = await page.$$eval('#audit-tbl tbody tr', (rs) => rs.filter((r) => r.offsetParent !== null).length);
  }
  await page.click('.filters .chip[data-f="all"]');
  check(`${L}: audit filters show 9 live, 4 partial, 6 not found`, counts.live === 9 && counts.part === 4 && counts.none === 6, JSON.stringify(counts));
  // The audit could not reach the India storefront; the page must say so.
  const limit = await page.$eval('#audit .sec-head', (e) => e.innerText);
  check(`${L}: audit states that the India storefront pages were not seen`, /redirected to its US storefront/.test(limit), limit.slice(0, 80));

  const imgs = [];
  for (const img of await page.$$('.shots.mob-only img')) {
    if (!(await img.isVisible())) continue;
    await img.scrollIntoViewIfNeeded();
    await page.waitForFunction((el) => el.complete && el.naturalWidth > 0, img, { timeout: 10000 }).catch(() => {});
    imgs.push(await img.evaluate((el) => el.complete && el.naturalWidth === +el.getAttribute('width') && el.naturalHeight === +el.getAttribute('height')));
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
    check(`${L}: embedded engine tag reads Overdue`, tier === 'Overdue', tier);
    const d = await dashes(fr);
    check(`${L}: no em/en dash inside the iframe`, d.length === 0, d.join(' | '));
  } else {
    check(`${L}: 3 screenshots load at their stated size, iframe hidden`, imgs.length === 3 && imgs.every(Boolean) && !frameVisible,
      `loaded=${imgs.filter(Boolean).length}/${imgs.length} iframe=${frameVisible}`);
  }

  const over = await hScroll(page);
  check(`${L}: no horizontal page scroll`, over <= 0, over + 'px');

  const range = await page.$$eval('#im-range tbody tr', (rs) => rs.map((r) => [...r.cells].map((c) => c.innerText.trim())));
  const row = (label) => (range.find((r) => r[0].startsWith(label)) || []).slice(1);
  check(`${L}: sizing shows low, base and high`, row('Extra revenue').join() === '73.8,147.6,221.4', JSON.stringify(row('Extra revenue')));
  check(`${L}: sizing is product margin net of running costs`, row('Net of running costs').join() === '36.4,83.7,130.9', JSON.stringify(row('Net of running costs')));
  // Each column of levers must add up to the total printed under it.
  const sums = [0, 1, 2].map((i) => range.slice(0, 3).reduce((a, r) => a + parseFloat(r[i + 1]), 0));
  const tot = row('Extra revenue').map(parseFloat);
  check(`${L}: the three levers add up to the total in every column`, sums.every((x, i) => Math.abs(x - tot[i]) <= 0.11), sums.map((x) => x.toFixed(1)).join());
  const costRows = await page.$$eval('#im-cost tbody tr', (rs) => rs.map((r) => parseFloat(r.cells[2].innerText)));
  const costTotal = costRows.pop();
  check(`${L}: running costs are itemised and add up`, costTotal === 10.82 && Math.abs(costRows.reduce((a, b) => a + b, 0) - costTotal) <= 0.011, costRows.join('+') + '=' + costTotal);
  const hidden = await page.$$eval('#im-range td.num, #im-cost td.num', (cs) => cs.filter((c) => {
    const box = c.closest('.tbl').getBoundingClientRect(); const r = c.getBoundingClientRect();
    return r.right > box.right + 1 || r.left < box.left - 1;
  }).map((c) => c.innerText.trim()));
  check(`${L}: every sizing figure is visible without scrolling the table`, hidden.length === 0, hidden.slice(0, 6).join(' | '));
  const voices = await page.$$eval('#voices figure', (fs) => fs.map((f) => [f.querySelector('blockquote').innerText, f.querySelector('figcaption').innerText]));
  check(`${L}: at least six dated, rated user quotes`,
    voices.length >= 6 && voices.every(([q, c]) => /^".+"$/.test(q.trim()) && /\d★ · \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(c.trim())), voices.length + ' quotes');
  const d = await dashes(page);
  check(`${L}: no em/en dash`, d.length === 0, d.join(' | '));
  await page.waitForTimeout(300);
  check(`${L}: zero console errors (CSP on)`, bag.errors.length === 0, bag.errors.join(' | '));
  check(`${L}: zero failed requests`, bag.failed.length === 0, bag.failed.join(' | '));
  await ctx.close();
}

const setRange = (page, id, v) => page.$eval(id, (e, v) => { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }, v);
const nextCard = async (page) => ({ title: norm(await page.$eval('#s-next .banner b', (b) => b.textContent)), text: norm(await page.textContent('#s-next')), hold: await page.$eval('#s-next', (e) => e.classList.contains('hold')) });

async function prototype(browser, vp) {
  const L = `[${vp.name}] /lenskart-study/prototype`;
  const { ctx, page, bag, status } = await open(browser, vp, '/lenskart-study/prototype');
  check(`${L}: HTTP 200`, status === 200, status);
  await names(page, L);

  await page.click('.feats a[href="#console"]');
  const viaFeat = await page.getAttribute('#t-console', 'aria-selected');
  await page.click('#t-checkin');
  const hashNow = await page.evaluate(() => location.hash);
  await page.click('#t-customer');
  check(`${L}: feature links switch tabs and each tab has its own link`, viaFeat === 'true' && hashNow === '#checkin', `console=${viaFeat} hash=${hashNow}`);

  // Tier per customer, the card agreeing with the engine, and nothing for
  // sale before an eye test: the three things the first screen claims.
  const tiers = { 0: 'Overdue', 1: 'Not due', 2: 'Due now', 3: 'Due now' };
  const got = {}; const disagree = []; const presale = [];
  for (const i of [1, 2, 3, 0]) {
    await page.click(`.persona-row .chip[data-p="${i}"]`);
    got[i] = norm(await page.textContent('#e-tier'));
    const st = norm(await page.textContent('#s-status'));
    if (/overdue/.test(st) !== (got[i] === 'Overdue') || /up to date/.test(st) !== (got[i] === 'Not due')) disagree.push(`p${i}: "${st}" vs ${got[i]}`);
    const n = await nextCard(page);
    if (!n.hold || /₹/.test(n.text)) presale.push(`p${i}: ${n.title}`);
  }
  check(`${L}: Neha Overdue, Arjun Not due, Kabir Due now, Meera Due now`, Object.keys(tiers).every((i) => got[i] === tiers[i]), JSON.stringify(got));
  check(`${L}: card and engine agree on how due the test is`, disagree.length === 0, disagree.join(' | '));
  check(`${L}: nothing is offered before the eye test`, presale.length === 0, presale.join(' | '));

  // A reported symptom is never "not due": Arjun, tested 7 months ago, reports
  // two symptoms and must be sent to an eye test, not told he is fine.
  await page.click('.persona-row .chip[data-p="1"]');
  await setRange(page, '#in-sym', 2);
  const sym = [norm(await page.textContent('#e-tier')), norm(await page.textContent('#s-status'))];
  await page.click('#quick button[data-q="need"]');
  await page.waitForTimeout(400);
  const symReply = (await page.$$eval('#chat .bubble.ai', (b) => b.map((x) => x.textContent))).pop();
  check(`${L}: a reported symptom always leads to an eye test`, sym[0] === 'Due now' && /is due/.test(sym[1]) && /eye test first/.test(symReply), sym.join(' | '));
  await page.click('.persona-row .chip[data-p="0"]');

  // Overdue gets a booking first and one store call only if that fails.
  const steps = await page.$$eval('#e-actions .step b', (b) => b.map((x) => x.textContent.trim()));
  check(`${L}: overdue books a re-test first, then one store call on day 8`,
    steps[0] === 'Free re-test, booked in two taps' && steps.some((t) => /^Store call on day 8/.test(t)) && !steps.some((t) => /24 hours/.test(t)), JSON.stringify(steps));

  // What follows the re-test depends on its result, the wearer and the frame.
  const after = {};
  await page.click('#in-result button[data-r="same"]'); after.same = await nextCard(page);
  await page.click('#in-result button[data-r="changed"]'); after.oldFrame = await nextCard(page);
  await setRange(page, '#in-pair', 12); after.youngFrame = await nextCard(page);
  await page.click('.persona-row .chip[data-p="2"]'); await page.click('#in-result button[data-r="changed"]'); after.child = await nextCard(page);
  await page.click('.persona-row .chip[data-p="3"]'); await page.click('#in-result button[data-r="changed"]'); after.senior = await nextCard(page);
  check(`${L}: unchanged power keeps the pair, with no price`, after.same.title === 'Your power is the same' && after.same.hold && !/₹/.test(after.same.text), after.same.title);
  check(`${L}: changed power, young frame: new lenses for the ₹199 fitting fee`,
    after.youngFrame.title === 'New lenses in your current frame' && /₹199 fitting fee/.test(after.youngFrame.text) && /^A new pair/.test(after.oldFrame.title),
    `${after.oldFrame.title} -> ${after.youngFrame.title}`);
  check(`${L}: a child gets the lenses the optometrist recommends, 40 and above gets progressives`,
    /^New lenses in/.test(after.child.title) && /If the optometrist recommends them, these can be myopia-control lenses/.test(after.child.text) && /^Progressive lenses/.test(after.senior.title), `${after.child.title} | ${after.senior.title}`);

  // An open ticket stops every offer and every message, even with a changed power.
  await page.click('.persona-row .chip[data-p="0"]');
  await page.click('#in-result button[data-r="changed"]');
  await page.check('#in-ticket');
  const held = await nextCard(page);
  const heldSteps = await page.$$eval('#e-actions .step b', (b) => b.map((x) => x.textContent.trim()));
  const heldChat = [];
  for (const q of ['need', 'frame', 'cost']) {
    await page.click(`#quick button[data-q="${q}"]`);
    await page.waitForTimeout(400);
    heldChat.push((await page.$$eval('#chat .bubble.ai', (b) => b.map((x) => x.textContent))).pop());
  }
  await page.click('#t-checkin');
  const heldMsg = norm(await page.textContent('#wa-body'));
  await page.click('#t-customer');
  check(`${L}: an open service ticket holds the offer, the actions, the assistant and the check-in`,
    held.hold && held.title === 'No offer while your ticket is open' && heldSteps[0] === 'Hold every message and offer' && /^No message is sent/.test(heldMsg)
      && heldChat.every((r) => /open ticket first/.test(r) && !/₹/.test(r)),
    `${held.title} | ${heldSteps[0]} | ${heldMsg.slice(0, 40)}`);

  // Ask Neha a question, switch to Arjun inside the 250 ms reply window.
  await page.click('.persona-row .chip[data-p="0"]');
  await page.click('#quick button[data-q="need"]');
  await page.click('.persona-row .chip[data-p="1"]');
  await page.waitForTimeout(500);
  const chat = await page.$$eval('#chat .bubble', (b) => b.map((x) => x.textContent));
  check(`${L}: a late reply never lands in the next customer's chat`, chat.length === 1 && /Arjun/.test(chat[0]), JSON.stringify(chat));

  await page.click('#t-checkin');
  await page.click('#pp-person button[data-p="2"]');
  const kabir = norm(await page.textContent('#wa-title'));
  const kabirBtns = await page.$$eval('#wa-body .wa-btns span', (b) => b.map((x) => x.textContent));
  await page.click('#pp-person button[data-p="3"]');
  const meera = norm(await page.textContent('#wa-title'));
  const before = norm(await page.textContent('#pp-channel'));
  await page.check('#pp-share');
  const afterShare = norm(await page.textContent('#pp-channel'));
  check(`${L}: check-in goes to the parent under 18, to the wearer otherwise, family copy only on opt-in`,
    kabir === 'Lenskart Parent Check-in' && meera === 'Lenskart Sight Check-in' && /No one else sees it/.test(before) && /A copy also goes/.test(afterShare),
    `Kabir=${kabir} Meera=${meera}`);
  // Lenskart's home eye test is for ages 14 to 75; a 9-year-old is sent to the store.
  // Make him overdue too: the plan and the actions must still send him to a store.
  await page.click('#t-customer');
  await page.click('.persona-row .chip[data-p="2"]');
  await setRange(page, '#in-test', 20);
  const kid = norm(await page.textContent('#s-plan')) + ' ' + norm(await page.textContent('#e-actions'));
  await page.click('#t-checkin');
  check(`${L}: no home eye test is offered for a child under 14`, kabirBtns.length === 2 && !kabirBtns.some((b) => /home/i.test(b)) && !/home eye test/i.test(kid) && /Free re-test/.test(kid), kabirBtns.join(' | ') + ' | ' + kid.slice(0, 80));

  // Neha's overdue check-in, in both languages: a slot and one store call, and
  // never a product, a price or a discount.
  await page.click('#pp-person button[data-p="0"]');
  const msg = {};
  for (const l of ['en', 'hi']) { await page.click(`#pp-lang button[data-l="${l}"]`); msg[l] = norm(await page.textContent('#wa-body')); }
  await page.click('#pp-lang button[data-l="en"]');
  check(`${L}: check-in escalates to one store call, in English and Hindi`,
    /your store will call once/.test(msg.en) && /आपका स्टोर एक बार फ़ोन करेगा/.test(msg.hi), msg.en.slice(0, 100));
  const sales = /₹|%|\boff\b|offer|discount|gold|छूट|ऑफ़र/i;
  check(`${L}: check-in carries no price, offer or discount`, !sales.test(msg.en) && !sales.test(msg.hi), (msg.en.match(/.{0,30}(₹|%|off|offer|discount|gold).{0,20}/i) || [''])[0]);
  await page.click('#pp-person button[data-p="1"]');
  const arjun = norm(await page.textContent('#wa-body'));
  check(`${L}: a customer who is not due gets no message`, /^No message is sent/.test(arjun), arjun.slice(0, 60));

  await page.click('#t-console');
  const total = norm(await page.textContent('#m-total'));
  check(`${L}: impact total ₹147.6 cr · $15.66M`, total === '₹147.6 cr · $15.66M', total);
  const netTxt = norm(await page.textContent('#m-net'));
  check(`${L}: product margin net of running costs ₹83.7 cr · $8.88M`, netTxt === '₹83.7 cr · $8.88M', netTxt);
  const head = norm(await page.textContent('#segtbl th:last-child'));
  check(`${L}: value column is labelled as revenue won back`, /^Revenue won back/.test(head), head);
  const zero = await page.$$eval('#segtbl tbody tr', (rs) => rs.filter((r) => /Open service ticket|Not due/.test(r.cells[0].innerText)).map((r) => r.cells[4].innerText.trim()));
  check(`${L}: held and not-due groups are worth nothing this week`, zero.length === 2 && zero.every((z) => z === '0'), zero.join());
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
  for (const tab of ['#t-customer', '#t-checkin', '#t-console', '#t-brand']) {
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

// The case study quotes the calculator's results. Read both and compare, so the
// page can never claim a number the calculator does not produce.
async function consistency(browser) {
  const vp = VIEWPORTS[2];
  const a = await open(browser, vp, '/lenskart-study');
  const study = await a.page.evaluate(() => {
    const cell = (label, i) => { const r = [...document.querySelectorAll('#im-range tbody tr')].find((x) => x.cells[0].innerText.trim().startsWith(label)); return r ? r.cells[i].innerText.trim() : ''; };
    return { net: cell('Net of running costs', 2), rev: cell('Extra revenue', 2), cost: document.querySelector('#im-cost tr.hl td:last-child').innerText.trim() };
  });
  await a.ctx.close();
  const b = await open(browser, vp, '/lenskart-study/prototype');
  await b.page.click('#t-console');
  const num = async (id) => (norm(await b.page.textContent(id)).match(/₹(-?[\d.]+) cr/) || [])[1] || '';
  const calc = { net: await num('#m-net'), rev: await num('#m-total'), cost: await num('#m-cost') };
  await b.ctx.close();
  check('case study revenue, running cost and net match the prototype calculator',
    study.net !== '' && study.net === calc.net && study.rev === calc.rev && study.cost === calc.cost, `case study ${JSON.stringify(study)} vs calculator ${JSON.stringify(calc)}`);
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
