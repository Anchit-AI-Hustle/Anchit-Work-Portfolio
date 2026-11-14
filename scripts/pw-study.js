// The PW case study (/pw-study) and its prototype (/pw-study/prototype) work
// at phone, tablet and desktop width, under the site's real CSP.
//
// WHAT THIS GUARDS
//   Both pages are self-contained HTML with a lot of inline logic: a risk
//   engine, age-based Weekly Progress Report routing, a seeded 5,000-learner console and
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
//
// Added after the November 2026 review, each with a mutation that must fail it:
// MUT=pulsestale    the Weekly Pulse reads the persona's defaults, not the simulator
// MUT=gap           a learner watching every lecture but failing tests reads Low risk
// MUT=nocap         a conversion of 500% is taken at face value
// MUT=consoledrift  the console's groups no longer scale to the calculator's total
// MUT=minorprice    an under-18 sees a price and an offer in their own app
// MUT=block         a high-risk adult cannot choose the next batch
// MUT=final         a final-year learner is offered a Vidyapeeth trial
// MUT=pilot         the 90-day plan pilots NEET droppers, who have no next batch
// MUT=mentors       the case study's mentor head-count drifts from the calculator's
// MUT=ambush        the consent question covers the first screen again
// MUT=nostart       the case study opens with no 'start here' steps
// MUT=focussteal    the deferred consent question takes the visitor's focus
// MUT=oldfeature    a retired feature name comes back on a tab
// MUT=noalias       links shared before the rename stop landing
// MUT=noevidence    the research table behind the design is dropped
//
// Added for the min-9/10 pass (14 Nov 2026), each with a mutation that must fail it:
// MUT=vp         a UPSC learner in Delhi is offered a Vidyapeeth trial
// MUT=finalmsg   a final-year learner's results-day message sells a next batch
// MUT=parentend  a parent report no longer ends with one thing the parent can do
// MUT=pace       74% of lectures reads as ahead of batch pace
// MUT=zerowhy    a zero-risk learner is told their biggest driver is a 0.0 factor
// MUT=finsplit   final-year top scorers lose their in-year upgrade in the dashboard
// MUT=negmsg     a negative input is reported as "not a number"
// MUT=a11y       the phone preview loses its region role
// MUT=swatch     the Muted swatch drifts from the --muted token
// MUT=tutobase   AI Tuto reads as part of the base plan while the costs leave it out
// MUT=tutogate   AI Tuto's rollout gate sits below its cost break-even
// Second review (8.3 / 7.8), each with a mutation that must fail it:
// MUT=floor (3 weeks idle reads Low)  couple (streak and idle both above 0)  planfit (18 lectures in "3 short sessions")
// MUT=highpromo (discount shown at high risk)  plural ("1 lectures")  danda (Hindi ends with ".")
// MUT=limits (150pp uplift, high risk above at risk)  finalchat (final-year chat sells a next batch)
// MUT=noaiq / nosens / noleak / nested   case study AI-quality plan, sensitivity, problem size, nested iframe scroll
// Third review (8.2 / 8.0), each with a mutation that must fail it:
// MUT=pacecap nobacklog finalqueue doubtcouple sharecopy hindidefault plausible noskip (prototype)
// MUT=leak3 nostacked noembedscroll (case study)
// Fourth review (8.1 / 8.1): MUT=childproduct lowbehind cohort
// MUT=nosixq / nostack / breakeven / nogates / navcut / overclaim   case study blocks
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
  if (MUT === 'label') return src.replace("k:'Lectures short of pace'", "k:'Behind batch pace'");
  // Escaped so the site-wide no-dash sweep cannot "fix" the mutation itself, as it once did.
  if (MUT === 'dash') return src.replace('</body>', '<p>one \u2014 two</p></body>');
  if (MUT === 'auditnav') return src.replace(/<div class="hero-ctas" style="margin-top:6px"><a class="btn btn-outline sm" href="#top">.*?<\/div>/, '');
  if (MUT === 'protonav') return src.replace(/<div class="xlinks">.*?<\/div>/, '');
  if (MUT === 'costdrift') return src.replace('id="m-wa" type="number" step="0.001" min="0" value="0.115"', 'id="m-wa" type="number" step="0.001" min="0" value="1.15"');
  if (MUT === 'bigcall') return src.replace("t:'7-day AI catch-up plan'", "t:'Human mentor call within 24 hours'")
    .replace("What we are doing: a 7-day catch-up plan is ready in the app.", "What we are doing: a PW mentor will call tomorrow at 6:30 pm.");
  if (MUT === 'oldname') return src.replace('<strong>Learner Retention Engine</strong>', '<strong>Agla Kadam</strong>');
  if (MUT === 'deeplink') return src.replace('function fromHash(scroll, focus){', 'function fromHash(scroll, focus){ if(!focus) return;');
  if (MUT === 'offer') return src.replace("var strong = p.offline && res.tier==='Low' && s.test>=70 && s.lec>=75", 'var strong = p.offline');
  if (MUT === 'pulsestale') return src.replace('var p=P[cur], s=simState,', 'var p=P[cur], s=P[cur].s,');
  if (MUT === 'gap') return src.replace('v:s.test<40?', 'v:false&&s.test<40?');
  if (MUT === 'nocap') return src.replace('if(PCT[k] && x>100)', 'if(false && PCT[k] && x>100)');
  if (MUT === 'consoledrift') return src.replace('var reL=N*(v.elig/100)*(v.ren/100)', 'var reL=N*(v.elig/100)*(v.ren/100)*2');
  if (MUT === 'minorprice') return src.replace('  if(minor){\n    // DPDP', '  if(false){\n    // DPDP');
  if (MUT === 'block') return src.replace('type="button" data-act="buy">Continue', 'type="button" data-act="buy" disabled>Continue');
  if (MUT === 'final') return src.replace(' && !p.final && p.vp, held', ' && p.vp, held').replace('if(p.offline && p.vp && !p.final) a.push', 'if(p.offline && p.vp) a.push');
  if (MUT === 'pilot') return src.replace('<li>Class 10 and Class 11 (JEE, NEET): both have a next batch</li>', '<li>Class 11 JEE and NEET dropper</li>');
  if (MUT === 'mentors') return src.replace('about 51 full-time mentors at 60% of their week on calls, and more', 'roughly 30 full-time mentors, and more');
  if (MUT === 'ambush') return src.replace(' data-consent-defer', '');
  if (MUT === 'focussteal') return src.replace('</body>', '<script>document.addEventListener("click",function(){},true);(function w(){var b=document.querySelector("#consentBar .cb-primary");if(b&&!w.d){w.d=1;b.focus();}else if(!b)setTimeout(w,50);})();</script></body>');
  if (MUT === 'nostart') return src.replace(/<nav class="start"[\s\S]*?<\/nav>/, '');
  if (MUT === 'walkurl') return src.replace('<a href="/pw-study/prototype#report">https://', '<a href="/pw-study/prototype#dashboard">https://');
  if (MUT === 'oldfeature') return src.replace('tabindex="-1">Weekly Progress Report</button>', 'tabindex="-1">Weekly Pulse</button>');
  if (MUT === 'noevidence') return src.replace(/<div class="card" id="evidence"[\s\S]*?<\/details><\/div>/, '');
  if (MUT === 'noalias') return src.replace("h = ALIAS[h] || h;", '');
  if (MUT === 'vp') return src.replace('if(p.offline && p.vp && !p.final) a.push', 'if(p.offline && !p.final) a.push').replace(' && !p.final && p.vp, held', ' && !p.final, held').replace('!p.final && p.offline && p.vp && res.tier', '!p.final && p.offline && res.tier');
  if (MUT === 'finalmsg') return src.replace('var resultsEn = p.final ?', 'var resultsEn = false ?');
  // Anchored on the medium-risk line: the high-risk report has its own "One thing you can do: ask" earlier in the file.
  if (MUT === 'parentend') return src.replace("One thing you can do: ask '+p.name+' which session comes first tonight.", "Also: ask '+p.name+' which session comes first tonight.");
  if (MUT === 'pace') return src.replace('return lec>=75 ? 0 : Math.max(1, Math.ceil((75-lec)/100*LECTURES_SO_FAR));', 'return Math.max(0, Math.round((75-lec)/6));');
  if (MUT === 'zerowhy') return src.replace('(top.v>0 ? ', '(true ? ');
  if (MUT === 'finsplit') return src.replace('finT:lo.filter(function(x){return !x.nextBatch&&strong(x);})', 'finT:[]');
  if (MUT === 'negmsg') return src.replace("(raw!==''&&isFinite(x)&&x<0?neg:empty)", 'empty');
  if (MUT === 'a11y') return src.replace('role="region" aria-label="Student app preview"', 'aria-label="Student app preview"');
  if (MUT === 'swatch') return src.replace("['Muted','#6B6B6B'", "['Muted','#757575'");
  if (MUT === 'nosixq') return src.replace(/<section class="block" id="questions"[\s\S]*?<\/section>/, '');
  if (MUT === 'nostack') return src.replace(/<div class="card" id="stack">[\s\S]*?<\/table><\/div>\s*<\/div>/, '');
  if (MUT === 'breakeven') return src.replace('a lift of <b>0.62pp</b>', 'a lift of <b>2pp</b>');
  if (MUT === 'nogates') return src.replace(/<div class="card" id="gates"[\s\S]*?<\/table><\/div>/, '<div>');
  if (MUT === 'navcut') return src.replace('<a href="#risks">Risks</a>', '');
  if (MUT === 'floor') return src.replace("r = Math.max(r, s.idle>=14 ? 60 : s.idle>=7 ? 35 : 0);", '');
  if (MUT === 'couple') return src.replace("if(k==='streak' && simState.streak>0 && simState.idle>0)", 'if(false)').replace("if(k==='idle' && simState.idle>0 && simState.streak>0)", 'if(false)');
  if (MUT === 'planfit') return src.replace("return Math.min(behind, tier==='High'?6:3);", 'return behind;');
  if (MUT === 'highpromo') return src.replace("(high?'':'<s>'+INR(nx.mrp)+'</s>", "(false?'':'<s>'+INR(nx.mrp)+'</s>");
  if (MUT === 'plural') return src.replace("return n+' '+w+(n===1?'':'s');", "return n+' '+w+'s';");
  if (MUT === 'danda') return src.replace("return t.replace(/\\.(?=\\s|$)/g,'।');", 'return t;');
  if (MUT === 'limits') return src.replace('if(v.ren>60){', 'if(false){').replace('if(v.hi>v.risk){', 'if(false){');
  if (MUT === 'finalchat') return src.replace("else if(p.final) txt = ", "else if(false) txt = ");
  if (MUT === 'noaiq') return src.replace(/<div class="card" id="aiq"[\s\S]*?<\/ul><\/div>/, '');
  if (MUT === 'nosens') return src.replace(/<table class="t-fit" id="sens">[\s\S]*?<\/table>/, '');
  if (MUT === 'noleak') return src.replace('about <b>₹600 cr a year</b> of online fees', 'some online fees');
  if (MUT === 'nested') return src.replace("fr.addEventListener('load', function(){ fit();", "fr.addEventListener('load', function(){ return;");
  if (MUT === 'pacecap') return src.replace("v:Math.min(Math.max(0,75-s.lec)*1.3,60), max:60}", "v:(100-s.lec)*0.40, max:40}");
  if (MUT === 'nobacklog') return src.replace("(behind>0?'Aaj sirf 2 cheezein: 1 backlog lecture", "(true?'Aaj sirf 2 cheezein: 1 backlog lecture");
  if (MUT === 'finalqueue') return src.replace("    else if(p.final) a.push({t:'In-year upgrade in the app; results-day help queued'", "    else if(false) a.push({t:'In-year upgrade in the app; results-day help queued'");
  if (MUT === 'doubtcouple') return src.replace("if(k==='doubt' && simState.doubt>0 && simState.idle>=7)", 'if(false)');
  if (MUT === 'sharecopy') return src.replace("  var toParent = g==='minor';", "  var toParent = g==='minor' || (g==='young' && ppShare);");
  if (MUT === 'hindidefault') return src.replace("  ppL = P[cur].lang==='HINDI' ? 'hi' : 'en';", '');
  if (MUT === 'fxnan') return src.replace("if(!ok){ if(k!=='fx') (raw!==''", "if(!ok && k!=='fx'){ if(k!=='fx') (raw!==''");
  if (MUT === 'plausible') return src.replace("(t>3900e7*0.25?", '(false?');
  if (MUT === 'noskip') return src.replace('<a class="skip" href="#main">Skip to the prototype</a>', '');
  if (MUT === 'leak3') return src.replace("PW Pi's Daily Challenges lift week-three engagement, but no disclosed AI is aimed at renewal.", 'No disclosed AI aimed at retention or renewal.');
  if (MUT === 'nostacked') return src.replace('<table class="t-mid stack" id="six-q">', '<table class="t-mid" id="six-q">');
  if (MUT === 'noembedscroll') return src.replace("e.data.type !== 'pw-scroll') return;", "e.data.type !== 'pw-scroll' || true) return;");
  if (MUT === 'childproduct') return src.replace("title = minor ? nx.acad : nx.title;", "title = nx.title;");
  if (MUT === 'lowbehind') return src.replace("(behind>0?'On track overall, a little to catch up':'On track, keep going')", "'On track, keep going'");
  if (MUT === 'cohort') return src.replace('var eng=Math.pow(rnd(),0.7);', 'var eng=Math.pow(rnd(),0.55);').replace('Math.round(clamp(40+eng*60+(rnd()-0.5)*10,0,100))', 'Math.round(clamp(eng*100+(rnd()-0.5)*30,0,100))');
  if (MUT === 'tutogate') return src.replace('it scales only if recovery rises 11.3 points', 'it scales only if recovery rises 10 points');
  if (MUT === 'tutobase') return src.replace('<td>A pilot arm, not in the base cost: one hour', '<td>One hour');
  if (MUT === 'overclaim') return src.replace('found where PW does not yet act when paying students drift', 'found where paying students quietly drop off');
  return src;
}

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail == null ? '' : String(detail)]);
const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

async function open(browser, vp, path, noFonts) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
  // noFonts: the web fonts never arrive, as on a slow network or when the CI
  // runner cannot reach the font host. The layout must still hold.

  const bag = { errors: [], failed: [] };
  let closed = false;
  ctx.on('close', () => { closed = true; });
  await ctx.route('**/*', async (route) => {
    try {
      if (noFonts && /fonts\.g(oogleapis|static)\.com/.test(route.request().url())) return await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      const res = await route.fetch();
      const headers = { ...res.headers() };
      if (!(headers['content-type'] || '').includes('text/html')) return await route.fulfill({ response: res });
      headers['content-security-policy'] = CSP;
      const body = new URL(route.request().url()).pathname.startsWith('/pw-study') ? mutate(await res.text()) : await res.text();
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

const FEATURES = ['Drop-off Risk Score', 'Catch-up Plan', 'Weekly Progress Report', 'Next-Step Recommendation', 'Renewals Dashboard'];
// Names retired in Nov 2026: each said something the feature did not do, or the UI called it something else.
const RETIRED = /Drift Score|Comeback Plan|Weekly Pulse|Results-Day Next Step|Growth Console|Parent Pulse|Self Pulse|Study Pulse/i;
// Old deep links, shared before the rename, and where each must land now.
const ALIASES = { drift: 'risk', plan: 'catchup', next: 'recommendation', pulse: 'report', console: 'dashboard' };

// One clear English name everywhere: page source, title and description.
async function names(page, L) {
  const html = await page.content();
  const old = html.match(/.{0,30}(agla|kadam).{0,30}/gi) || [];
  const title = await page.title();
  check(`${L}: feature named "Learner Retention Engine", no Hindi working name`, old.length === 0 && /Learner Retention Engine/.test(title), old.join(' | ') || title);
  // Visible text on every tab, hidden ones included, plus titles and alt text.
  const text = await page.evaluate(() => {
    const c = document.body.cloneNode(true); c.querySelectorAll('script,style').forEach((n) => n.remove());
    return document.title + ' ' + c.textContent + ' ' + [...document.querySelectorAll('[alt],[aria-label],[title]')].map((e) => [e.getAttribute('alt'), e.getAttribute('aria-label'), e.getAttribute('title')].join(' ')).join(' ');
  });
  const hit = text.match(new RegExp('.{0,25}(' + RETIRED.source + ').{0,25}', 'gi')) || [];
  check(`${L}: no retired feature name anywhere on the page`, hit.length === 0, hit.slice(0, 3).join(' | '));
}

// Where each shared link must land: a case study section heading on screen,
// or the prototype tab it names, selected and on screen.
const PROTO_TAB = { student: 't-student', risk: 't-student', catchup: 't-student', recommendation: 't-student', report: 't-parent', dashboard: 't-console', brand: 't-brand',
  drift: 't-student', plan: 't-student', next: 't-student', pulse: 't-parent', console: 't-console' };
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
  return page.evaluate(([tab, h, aliases]) => {
    h = aliases[h] || h;
    const t = document.getElementById(tab);
    const target = document.getElementById(h);
    const r = target.getBoundingClientRect();
    // A whole-tab link must also keep the concept notice bar on screen.
    const bar = document.getElementById('dl-bar').getBoundingClientRect();
    const whole = t.getAttribute('aria-controls') === 'p-' + ({ report: 'parent', dashboard: 'console' }[h] || h);
    return t.getAttribute('aria-selected') === 'true' && r.top >= 0 && r.top < innerHeight && (!whole || (bar.top >= 0 && bar.top < innerHeight));
  }, [PROTO_TAB[h], h, ALIASES]);
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

  const old = Object.keys(ALIASES).map((k) => '/pw-study/prototype#' + k);
  for (const href of [...steps.map((s) => s[0]), ...tries, '/pw-study/prototype#brand', ...old]) {
    const o = await open(browser, vp, href);
    await o.page.waitForTimeout(500);
    const ok = await landed(o.page, href);
    check(`${L}: ${href} opens on the right screen`, ok === true, o.page.url());
    await o.ctx.close();
  }
}

// A first-time visitor must learn who this is from, what it is and where to
// start before any jargon, and no consent question may cover that first screen.
async function firstScreen(page, L, kind) {
  const f = await page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight; };
    const bar = document.getElementById('consentBar');
    return {
      lede: (document.querySelector('.hero .lede') || {}).textContent || '',
      steps: [...document.querySelectorAll('.start a')].filter(vis).length,
      consent: !!(bar && bar.getBoundingClientRect().height > 0 && bar.getAttribute('data-in') === '1'),
    };
  });
  if (kind === 'study') {
    check(`${L}: first screen says who and what, with three visible "start here" steps`,
      /application for a Product Manager role/.test(f.lede) && f.steps === 3, `steps=${f.steps} lede=${f.lede.slice(0, 60)}`);
  } else {
    check(`${L}: first screen says what the prototype is and how to use it`, /made-up students/.test(f.lede) && /Pick one/.test(f.lede), f.lede.slice(0, 80));
  }
  check(`${L}: no consent question covers the first screen`, !f.consent, 'consent bar up=' + f.consent);
  // It is deferred, not dropped: reading on brings the question.
  // A focused control is the visitor's place on the page; the late question must not take it,
  // or a Space meant for scrolling answers it.
  await page.focus('.hero a, .hero button').catch(() => {});
  const before = await page.evaluate(() => document.activeElement && (document.activeElement.textContent || '').trim().slice(0, 30));
  await page.evaluate(() => window.scrollTo(0, innerHeight * 1.5));
  await page.waitForTimeout(700);
  const later = await page.evaluate(() => ({ bar: !!document.getElementById('consentBar'), inBar: !!(document.activeElement && document.activeElement.closest('#consentBar')) }));
  check(`${L}: the consent question still comes once the visitor reads on`, later.bar, 'consent bar present=' + later.bar);
  check(`${L}: the late consent question leaves the visitor's focus where it was`, later.bar && !later.inBar, `focus was on "${before}", now in bar=${later.inBar}`);
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function caseStudy(browser, vp) {
  const L = `[${vp.name}] /pw-study`;
  const { ctx, page, bag, status } = await open(browser, vp, '/pw-study');
  check(`${L}: HTTP 200`, status === 200, status);
  await names(page, L);
  await firstScreen(page, L, 'study');

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
  // The pilot must use grades with a next batch, gate on a backtest and be sized to detect the lift.
  const plan = norm(await page.textContent('#plan'));
  check(`${L}: pilot uses grades with a next batch, a backtest gate and a sized holdout`,
    /Class 10 and Class 11/.test(plan) && !/Class 11 JEE and NEET dropper/.test(plan) && /AUC of 0\.70/.test(plan) && /14,500 learners/.test(plan), plan.slice(0, 160));
  const risks = norm(await page.textContent('#risks'));
  check(`${L}: risks cover DPDP s.9(3) and the holdout's fairness`, /s\.9\(3\)/.test(risks) && /never the child/.test(risks) && /holdout is fair/i.test(risks), risks.slice(0, 120));
  // The design choices rest on published evidence: each row names its source and links to it.
  const ev = await page.$$eval('#evidence tbody tr', (rs) => rs.map((r) => r.querySelectorAll('a[href^="https://"]').length)).catch(() => []);
  check(`${L}: research table backs the design, every row linked to its source`, ev.length >= 7 && ev.every((n) => n >= 1), JSON.stringify(ev));
  check(`${L}: DPDP row states when the children's rules apply and the fallback`, /May 2027/.test(risks) && /18\+ learners/.test(risks), risks.slice(0, 80));
  const q2 = norm(await page.textContent('#q2').catch(() => ''));
  check(`${L}: latest quarter (Q2 FY27) is reported with its source`, /₹1,242 cr/.test(q2) && /Inc42/.test(q2), q2.slice(0, 120));
  const six = await page.$$eval('#six-q tbody tr', (rs) => rs.map((r) => !!r.querySelector('a[href^="#"]'))).catch(() => []);
  check(`${L}: six reviewer questions, each answered and linked`, six.length === 6 && six.every(Boolean), JSON.stringify(six));
  const stack = await page.$$eval('#stack tbody tr', (rs) => rs.map((r) => r.cells[0].innerText.trim())).catch(() => []);
  const stackSrc = await page.$$eval('#stack a[href^="https://"]', (as) => as.length).catch(() => 0);
  check(`${L}: the engine is mapped onto PW's own AI products, with sources`,
    ['AI Guru', 'Guided AI tutor in practice sets', 'PW Pi Daily Challenges', 'AI Tuto', 'AI support'].every((n) => stack.includes(n)) && stackSrc >= 2, JSON.stringify(stack));
  // AI Tuto is not in the ₹6.15 cr running cost, so nothing may present it as part of the base plan.
  const tutoRow = norm(await page.$eval('#stack', (t) => [...t.querySelectorAll('tbody tr')].find((r) => r.cells[0].innerText.trim() === 'AI Tuto').innerText).catch(() => ''));
  const sysTxt = norm(await page.textContent('#system'));
  const tutoDown = norm(await page.textContent('#downside').catch(() => ''));
  check(`${L}: AI Tuto is a pilot arm outside the base cost, everywhere it appears`,
    /not in the base cost/.test(tutoRow) && /pilot arm/.test(sysTxt) && /outside the base cost/.test(tutoDown), tutoRow.slice(0, 120));
  // Its rollout gate is its true cost break-even: ₹17 an hour against ₹150 per avoided call.
  const gate = (17 / 150 * 100).toFixed(1);
  check(`${L}: AI Tuto scales only past its cost break-even of ${gate} points`,
    tutoDown.includes(`${gate} points`) && plan.includes(`${gate} points`) && !/rises 10 points/.test(plan), gate);
  // Break-even and the zero-renewal downside follow from the sizing table's own numbers.
  const down = norm(await page.textContent('#downside').catch(() => ''));
  const per1pp = 4.87e6 * 0.5 * 4104 / 1e9, be = (6.15 / per1pp).toFixed(2), zero = (4.87e6 * 0.5 * 0.35 * 0.01 * (36625 - 4104) / 1e7 + (4.87e6 - 0.96e6) * 0.015 * 3000 / 1e7 - 6.15).toFixed(1);
  check(`${L}: break-even and downside match the sizing`, down.includes(`${be}pp`) && down.includes(`₹${zero} cr`) && down.includes('₹10.0 cr'), `${be}pp ₹${zero} cr :: ${down.slice(0, 120)}`);
  const gates = await page.$$eval('#gates tbody tr', (rs) => rs.length).catch(() => 0);
  check(`${L}: scale gates say what passes and what happens if it fails`, gates === 3 && /0\.62pp/.test(plan + norm(await page.textContent('#plan'))), gates);
  const sysTxt2 = norm(await page.textContent('#system'));
  check(`${L}: the leak is sized before the fix`, /₹600 cr a year/.test(sysTxt2) && /about 7%/.test(sysTxt2), sysTxt2.slice(0, 80));
  const sens = await page.$$eval('#sens tbody tr', (rs) => rs.map((r) => r.cells[1].innerText.trim())).catch(() => []);
  check(`${L}: sensitivity flexes renewal base, eligibility, incidence and margin`,
    sens.join(' | ') === '69.1 / 79.1 / 89.1 | 65.6 / 79.1 / 92.6 | 79.1 / 71.0 | 79.1 / 74.2 | 57.3', sens.join(' | '));
  const aiq = await page.$$eval('#aiq li', (l) => l.length).catch(() => 0);
  check(`${L}: an AI quality plan backs the generated plans and reports`, aiq === 4, aiq);
  const risks2 = norm(await page.textContent('#risks'));
  check(`${L}: risks cover fairness, false alarms and AI safety; legal check comes first`,
    /The score is fair/.test(risks2) && /A false alarm does no harm/.test(risks2) && /The AI stays safe/.test(risks2) && /week 0/.test(risks2) && /Week 0/.test(plan), '');
  check(`${L}: scale rule uses the confidence bound, not the point estimate`, /about 87,000 learners, six times the pilot/.test(plan) && !/4x the sample/.test(plan) && /lower 90% confidence bound/.test(plan) && /April 2027/.test(plan) && /randomised by household/.test(plan), '');
  if (vp.width >= 1080) {
    const fr = await page.$('.proto-frame');
    await fr.scrollIntoViewIfNeeded();
    const f = await fr.contentFrame();
    await f.waitForFunction(() => document.readyState === 'complete');
    await page.waitForTimeout(600);
    const nest = await page.$eval('.proto-frame', (i) => { const d = i.contentDocument; return Math.ceil(d.body.getBoundingClientRect().height) - i.clientHeight; });
    check(`${L}: embedded prototype is sized to its content, no scroll inside a scroll`, nest <= 4, nest + 'px');
  }
  const gapsTxt = norm(await page.textContent('#gaps'));
  const sixTxt = norm(await page.textContent('#six-q'));
  check(`${L}: the leak list credits PW's retention AI; delivery economics are priced`, /Daily Challenges lift week-three engagement/.test(gapsTxt) && /₹9\.5 cr/.test(sixTxt) && /₹4\.5 cr/.test(sixTxt), '');
  const order = await page.$$eval('main > section[id]', (ss) => ss.map((x) => x.id).slice(0, 4).join(','));
  check(`${L}: "Why me" comes right after the short version`, order === 'system,questions,me,business', order);
  if (vp.width <= 600) {
    const wide = await page.$$eval('#six-q, #rk-main', (ts) => ts.map((t) => t.closest('.tbl').scrollWidth - t.closest('.tbl').clientWidth));
    check(`${L}: the six questions and the main risks stack on a phone, no sideways scroll`, wide.length === 2 && wide.every((w) => w <= 2), JSON.stringify(wide));
  }
  const labels = await page.$$eval('.tbl[role="region"]', (ts) => ts.map((t) => t.getAttribute('aria-label')));
  check(`${L}: every scrolling table has its own name`, new Set(labels).size === labels.length && labels.every((x) => !/^table, scrolls/i.test(x)), JSON.stringify(labels.slice(0, 4)));
  if (vp.width >= 1080) {
    const fr2 = await page.$('.proto-frame');
    await fr2.scrollIntoViewIfNeeded();
    const f2 = await fr2.contentFrame();
    await f2.waitForSelector('#s-next button[data-act="parent"]');
    await f2.click('#s-next button[data-act="parent"]');
    await page.waitForTimeout(800);
    const seen = await page.$eval('.proto-frame', (i) => { const r = i.getBoundingClientRect(); const t = i.contentDocument.getElementById('report').getBoundingClientRect(); const y = r.top + t.top; return { y: Math.round(y), ok: y >= 0 && y < innerHeight }; });
    check(`${L}: a link inside the embedded prototype brings its target into view`, seen.ok, JSON.stringify(seen));
  }
  const hero = norm(await page.textContent('.hero .lede'));
  check(`${L}: hero does not overclaim`, !/quietly drop off/.test(hero) && /does not yet act when paying students drift/.test(hero), hero.slice(0, 120));
  if (vp.width >= 1440) {
    const nav = await page.$$eval('.nav .links a', (as) => { const box = as[0].parentElement.getBoundingClientRect(); return as.map((a) => [a.getAttribute('href'), a.getBoundingClientRect().right <= box.right + 1]); });
    check(`${L}: every nav link, Risks to Walkthrough, fits on screen`,
      ['#risks', '#me', '#walkthrough', '#impact', '#plan'].every((h) => nav.some(([x]) => x === h)) && nav.every(([, v]) => v), JSON.stringify(nav.filter(([, v]) => !v)));
  }
  const d = await dashes(page);
  check(`${L}: no em/en dash`, d.length === 0, d.join(' | '));
  await page.waitForTimeout(300);
  check(`${L}: zero console errors (CSP on)`, bag.errors.length === 0, bag.errors.join(' | '));
  check(`${L}: zero failed requests`, bag.failed.length === 0, bag.failed.join(' | '));
  await ctx.close();
}

// Drag a simulator slider the way a person would: set it and fire input.
const slide = (page, vals) => page.evaluate((vals) => {
  for (const [id, v] of Object.entries(vals)) { const e = document.getElementById(id); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }
}, vals);

// Contrast ratio of an element's text on a given background colour.
const contrast = (page, sel, bgSel) => page.evaluate(([sel, bgSel]) => {
  const rgb = (c) => c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number);
  const lum = (c) => { const [r, g, b] = rgb(c).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const out = [];
  document.querySelectorAll(sel).forEach((t) => {
    const bg = getComputedStyle(t.closest(bgSel)).backgroundColor;
    const a = lum(getComputedStyle(t).color), b = lum(bg);
    out.push((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05));
  });
  return out;
}, [sel, bgSel]);

async function reviewFixes(page, L) {
  // 1. The weekly report is built from the simulator, not from the persona's defaults.
  await page.click('#t-student');
  await page.click('.persona-row .chip[data-p="0"]');
  await slide(page, { 'in-lec': 90, 'in-test': 85, 'in-idle': 0, 'in-doubt': 4, 'in-streak': 14 });
  await page.click('#t-parent');
  const pulse = norm(await page.textContent('#wa-body'));
  const status = norm(await page.textContent('#pp-status'));
  check(`${L}: Weekly Progress Report follows the simulator`, /90% of lectures done/.test(pulse) && !/has not studied/.test(pulse) && /low risk/.test(status), status);
  // A minor who turns strong: the trial goes to the parent, never into the child's app.
  check(`${L}: a strong under-18's trial offer goes to the parent`, /trial class is also available/.test(pulse), pulse.slice(-160));

  // 2. Watching everything but failing tests is not "on track".
  await page.click('#t-student');
  await slide(page, { 'in-lec': 100, 'in-test': 30, 'in-idle': 0, 'in-doubt': 3, 'in-streak': 10 });
  const gapTier = norm(await page.textContent('#e-tier'));
  check(`${L}: 100% lectures with a 30% test average is not Low risk`, gapTier !== 'Low risk', gapTier);

  // 3. Under-18s see no price or offer; adults do, even at high risk.
  const card = {};
  for (const i of [0, 2, 1]) { await page.click(`.persona-row .chip[data-p="${i}"]`); card[i] = norm(await page.textContent('#s-next')); }
  check(`${L}: under-18s see no price in their own app; adults do`,
    !/₹|% OFF/.test(card[0]) && !/₹|% OFF/.test(card[2]) && /never to you/.test(card[0]) && /₹/.test(card[1]), JSON.stringify([card[0].slice(-90), card[1].slice(-60)]));
  await page.click('.persona-row .chip[data-p="3"]');
  await slide(page, { 'in-lec': 20, 'in-test': 30, 'in-idle': 14, 'in-doubt': 0, 'in-streak': 0 });
  const kTier = norm(await page.textContent('#e-tier'));
  const buy = await page.$eval('#s-next button[data-act="buy"]', (b) => !b.disabled).catch(() => false);
  await page.click('#s-next button[data-act="buy"]').catch(() => {});
  const msg = norm(await page.textContent('#s-next-msg').catch(() => ''));
  check(`${L}: a high-risk adult can still choose the next batch, and the button responds`, kTier === 'High risk' && buy && /Prototype only/.test(msg), `${kTier} enabled=${buy} msg=${msg}`);

  // 4. A final-year learner gets no Vidyapeeth trial anywhere.
  await page.click('.persona-row .chip[data-p="1"]');
  const amanSteps = norm(await page.textContent('#e-actions'));
  await page.click('#t-parent');
  const amanPulse = norm(await page.textContent('#wa-body'));
  check(`${L}: final-year Aman gets an in-year upgrade, never a trial`, !/trial/i.test(amanSteps) && !/trial class/.test(amanPulse) && /Infinity Pro/.test(amanSteps), amanSteps.slice(0, 120));

  // 5. Inputs are capped, and the console scales exactly to the calculator.
  await page.click('#t-console');
  const totalAt = async (v) => { await page.fill('#m-off', String(v)); return norm(await page.textContent('#m-total')); };
  const at100 = await totalAt(100), at500 = await totalAt(500);
  const note = norm(await page.textContent('#m-note'));
  await page.fill('#m-off', '1');
  check(`${L}: percentage inputs are capped at 100 and say so`, at100 === at500 && /Capped at 100%/.test(note), `${at100} vs ${at500}; ${note}`);
  const scaled = async () => [(norm(await page.textContent('#seg-scale')).match(/= (₹[\d,.]+ cr)/) || [])[1], (norm(await page.textContent('#m-total')).match(/^(₹[\d,.]+ cr)/) || [])[1]];
  const s1 = await scaled();
  await page.fill('#m-ren', '2');
  const s2 = await scaled();
  await page.fill('#m-ren', '4');
  check(`${L}: console groups scale to the calculator's total, and follow its edits`, s1[0] && s1[0] === s1[1] && s2[0] === s2[1] && s1[0] !== s2[0], JSON.stringify([s1, s2]));

  // 6. WhatsApp timestamps meet AA contrast on both bubble colours.
  await page.click('#t-parent');
  const ratios = await contrast(page, '#wa-body .wa-time', '.wa-msg');
  check(`${L}: WhatsApp timestamps reach 4.5:1 contrast`, ratios.length > 0 && ratios.every((r) => r >= 4.5), ratios.map((r) => r.toFixed(2)).join(', '));
  await page.click('#t-student');
  await page.click('.persona-row .chip[data-p="0"]');
}

async function nineFixes(page, L) {
  const strongSim = { 'in-lec': 90, 'in-test': 85, 'in-idle': 0, 'in-doubt': 4, 'in-streak': 14 };
  // 1. Vidyapeeth teaches JEE, NEET and school: a UPSC learner in Delhi is never offered it.
  await page.click('#t-student');
  await page.click('.persona-row .chip[data-p="3"]');
  await slide(page, strongSim);
  const kSteps = norm(await page.textContent('#e-actions')), kCard = norm(await page.textContent('#s-next'));
  await page.click('#t-parent');
  const kRep = norm(await page.textContent('#wa-body'));
  check(`${L}: a strong UPSC learner is never offered a Vidyapeeth trial`,
    /Prelims Test Series 2027/.test(kSteps) && /Prelims Test Series 2027/.test(kCard) && !/Vidyapeeth|trial/i.test(kSteps + kCard) && !/trial class/.test(kRep), kSteps.slice(0, 120));
  // 2. A final-year learner's results-day message sells nothing after the exam.
  await page.click('#pp-learner button[data-p="1"]');
  const aRep = norm(await page.textContent('#wa-body'));
  const aRes = aRep.slice(aRep.indexOf('Results-day message'));
  check(`${L}: final-year results-day message recommends no next batch`,
    aRep.includes('Results-day message') && /No next batch is recommended/.test(aRes) && !/Infinity Pro|Yakeen/.test(aRes), aRes.slice(0, 140));
  // 3. Every parent report ends with one thing the parent can do, as the research table promises.
  await page.click('#pp-learner button[data-p="2"]');
  const ends = {};
  for (const [tier, sim] of [['medium', null], ['low', strongSim]]) {
    if (sim) { await page.click('#t-student'); await slide(page, sim); await page.click('#t-parent'); }
    for (const l of ['en', 'hi']) { await page.click(`#pp-lang button[data-l="${l}"]`); ends[tier + l] = norm(await page.textContent('#wa-body')); }
  }
  await page.click('#pp-lang button[data-l="en"]');
  check(`${L}: Meena's parent reports end with one thing to do, in English and Hindi`,
    /One thing you can do/.test(ends.mediumen) && /One thing you can do/.test(ends.lowen) && /आप क्या कर सकते हैं/.test(ends.mediumhi) && /आप क्या कर सकते हैं/.test(ends.lowhi),
    Object.keys(ends).filter((k) => !/One thing you can do|आप क्या कर सकते हैं/.test(ends[k])).join(','));
  // 4. Pace is counted in real lectures: 74% of 40 is one lecture behind, 75% is on pace.
  await page.click('#t-student');
  await page.click('.persona-row .chip[data-p="0"]');
  const pace = {};
  for (const v of [74, 75, 40]) { await slide(page, { 'in-lec': v }); pace[v] = norm(await page.textContent('#s-sub')); }
  check(`${L}: batch pace is counted in real lectures`,
    pace[74] === '1 lecture behind batch pace' && pace[75] === 'On or ahead of batch pace' && pace[40] === '14 lectures behind batch pace', JSON.stringify(pace));
  // 5. Nothing driving the risk says so, instead of naming a 0.0 driver.
  await slide(page, { 'in-lec': 100, 'in-test': 100, 'in-idle': 0, 'in-doubt': 15, 'in-streak': 30 });
  const why = norm(await page.textContent('#e-why'));
  check(`${L}: a zero-risk learner gets an honest "why"`, /nothing is pulling the risk up/.test(why) && !/\(0\.0 pts\)|\(\+?-?\d+\.\d pts\)/.test(why.split('.')[0]), why.slice(0, 100));
  // 6. Accessible names and values on the previews, sliders and dashboard rows.
  const a11y = await page.evaluate(() => ({
    regions: ['.phone', '.wa'].map((q) => (document.querySelector(q) || {}).getAttribute && document.querySelector(q).getAttribute('role')),
    vt: document.getElementById('in-lec').getAttribute('aria-valuetext'),
  }));
  await page.click('#t-console');
  const rowBtns = await page.$$eval('#segtbl tbody tr', (rs) => rs.map((r) => (r.querySelector('button.rowpick') || {}).getAttribute ? r.querySelector('button.rowpick').getAttribute('aria-pressed') : null));
  check(`${L}: previews are named regions, sliders speak their value, rows are buttons`,
    a11y.regions.every((r) => r === 'region') && /% of lectures done$/.test(a11y.vt || '') && rowBtns.every((x) => x !== null) && rowBtns.filter((x) => x === 'true').length === 1,
    JSON.stringify([a11y, rowBtns]));
  // 7. Final-year top scorers take their share of upgrades, as the app offers them one;
  //    every row explains its own price.
  const rowsNow = await page.$$eval('#segtbl tbody tr', (rs) => rs.map((r) => [r.cells[0].innerText.trim(), r.cells[r.cells.length - 1].innerText.trim()]));
  const val = (name) => +((rowsNow.find((r) => r[0] === name) || [, ''])[1].replace(/[^\d]/g, '') || 0);
  const notes = {};
  for (const name of ['Final year, top scorer', 'On track, top scorer, centre city', 'High risk, under 18']) {
    await page.click(`#segtbl tbody tr[data-seg="${name}"] button.rowpick`);
    notes[name] = norm(await page.textContent('#seg-detail'));
  }
  check(`${L}: final-year top scorers get in-year upgrades; others are ₹0`,
    val('Final year, top scorer') > 0 && val('Final year, others') === 0 && rowsNow.some((r) => r[0] === 'Final year, others'), JSON.stringify(rowsNow.slice(-2)));
  check(`${L}: each dashboard row names its own price`,
    /price gap to Infinity Pro/.test(notes['Final year, top scorer']) && /offline ARPU/.test(notes['On track, top scorer, centre city']) && /online fee per learner/.test(notes['High risk, under 18']),
    Object.values(notes).map((n) => n.slice(0, 40)).join(' | '));
  // 8. A negative number is called what it is.
  await page.fill('#m-upg', '-1');
  const negNote = norm(await page.textContent('#m-note'));
  await page.fill('#m-upg', '1.5');
  check(`${L}: a negative input says "below zero", not "not a number"`, /Below zero, so counted as 0: Plan upgrade uplift/.test(negNote) && !/Not a number/.test(negNote), negNote);
  // 10. Second review: signals that contradict each other, plans that do not fit, words that do not agree.
  await page.click('#t-student');
  await page.click('.persona-row .chip[data-p="0"]');
  await slide(page, { 'in-lec': 100, 'in-test': 100, 'in-doubt': 0, 'in-idle': 21 });
  const away = [norm(await page.textContent('#e-tier')), norm(await page.textContent('#s-nudge-title'))];
  check(`${L}: three weeks away is high risk, whatever the averages`, away[0] === 'High risk' && !/Great week/.test(away[1]), away.join(' | '));
  await slide(page, { 'in-idle': 5, 'in-streak': 3 });
  const idleAfter = await page.$eval('#in-idle', (e) => +e.value);
  await slide(page, { 'in-idle': 2 });
  const streakAfter = await page.$eval('#in-streak', (e) => +e.value);
  check(`${L}: a current streak and days away cannot both be above zero`, idleAfter === 0 && streakAfter === 0, `idle=${idleAfter} streak=${streakAfter}`);
  await slide(page, { 'in-lec': 45, 'in-test': 90, 'in-idle': 0, 'in-doubt': 2, 'in-streak': 0 });
  const fit = norm(await page.textContent('#s-plan'));
  await page.click('#quick button[data-q="backlog"]'); await page.waitForTimeout(400);
  const backlogReply = norm(await page.$$eval('#chat .bubble.ai', (b) => b[b.length - 1].textContent));
  check(`${L}: a 3-session plan holds 3 lectures and moves the rest to next week, and the chat agrees`,
    /Session 1: 3 backlog lectures \(the other 9 over the next 3 weeks\)/.test(fit) && /12 lecture peeche/.test(backlogReply) && /plan mein 3/.test(backlogReply), fit.slice(0, 90) + ' || ' + backlogReply);
  const live = norm(await page.textContent('#chat-live'));
  check(`${L}: the screen reader hears the AI's reply, not the learner's own question`, live === backlogReply, live.slice(0, 60));
  await page.click('.persona-row .chip[data-p="1"]');
  await slide(page, { 'in-test': 0 });
  const amanWhy = norm(await page.textContent('#s-next'));
  await page.click('#quick button[data-q="next"]'); await page.waitForTimeout(400);
  const amanNext = norm(await page.$$eval('#chat .bubble.ai', (b) => b[b.length - 1].textContent));
  check(`${L}: Aman's reason follows his score, and his chat sells no batch after the exam`,
    !/strongest/.test(amanWhy) && /koi next batch nahi/.test(amanNext) && !/Infinity Pro|Yakeen/.test(amanNext), amanNext.slice(0, 90));
  await page.click('.persona-row .chip[data-p="3"]');
  await slide(page, { 'in-lec': 20, 'in-test': 30, 'in-idle': 14, 'in-doubt': 0, 'in-streak': 0 });
  const kHigh = norm(await page.textContent('#s-next'));
  check(`${L}: no discount or struck price is shown while an adult is high risk`, !/% OFF/.test(kHigh) && /₹/.test(kHigh) && /Continue/.test(kHigh), kHigh.slice(-140));
  // Plurals, zero states and the Hindi danda in the weekly report.
  await page.click('.persona-row .chip[data-p="2"]');
  await slide(page, { 'in-lec': 73, 'in-test': 40, 'in-idle': 6 });
  await page.click('#t-parent');
  await page.click('#pp-lang button[data-l="en"]');
  const meenaRep = norm(await page.textContent('#wa-body'));
  await page.click('#pp-lang button[data-l="hi"]');
  const meenaHi = await page.textContent('#wa-body');
  await page.click('#pp-lang button[data-l="en"]');
  await page.click('#t-student');
  await page.click('.persona-row .chip[data-p="0"]');
  await slide(page, { 'in-lec': 0, 'in-test': 0, 'in-idle': 0, 'in-doubt': 0, 'in-streak': 0 });
  await page.click('#t-parent');
  const zeroRep = norm(await page.textContent('#wa-body'));
  check(`${L}: weekly report says "1 lecture", never "0 days" or "0-day streak"`,
    /1 lecture behind/.test(meenaRep) && !/\b1 lectures\b/.test(meenaRep) && !/\b0 days?\b|0-day/.test(zeroRep + meenaRep), meenaRep.slice(0, 120));
  check(`${L}: Hindi sentences end with a danda`, /।/.test(meenaHi) && !/[\u0900-\u097F%]\.(\s|$)/.test(meenaHi), (meenaHi.match(/.{12}[\u0900-\u097F%]\.(\s|$)/) || [''])[0]);
  // Keyboard: toggling the share checkbox keeps focus on it.
  await page.click('#pp-learner button[data-p="1"]');
  await page.focus('#pp-share');
  await page.keyboard.press('Space');
  const focusId = await page.evaluate(() => document.activeElement && document.activeElement.id);
  await page.keyboard.press('Space');
  check(`${L}: the share checkbox keeps keyboard focus when toggled`, focusId === 'pp-share', focusId);
  const tbl = norm(await page.textContent('#aud-tbl'));
  check(`${L}: recipient table has no doubled punctuation`, !/, ,|\. \./.test(tbl), tbl.slice(0, 80));
  // Calculator limits the model itself implies.
  await page.click('#t-console');
  await page.fill('#m-ren', '150');
  await page.fill('#m-hi', '60');
  const lim = norm(await page.textContent('#m-note'));
  await page.fill('#m-ren', '4'); await page.fill('#m-hi', '13');
  await page.fill('#m-fx', '0');
  const fxInvalid = await page.getAttribute('#m-fx', 'aria-invalid');
  await page.fill('#m-fx', '95.1');
  const costLine = norm(await page.textContent('#m-net-sub'));
  check(`${L}: calculator holds uplift to 60pp and high risk within at risk, flags a bad FX`,
    /Held re-enrolment uplift to 60pp/.test(lim) && /high risk to the at-risk share/.test(lim) && fxInvalid === 'true', lim);
  check(`${L}: running costs show two decimals, matching the case study`, /Running costs ₹6\.15 cr/.test(costLine), costLine.slice(0, 40));
  await page.fill('#m-acpu', '40000');
  await page.click('#segtbl tbody tr[data-seg="On track, top scorer, centre city"] button.rowpick');
  const zeroNet = norm(await page.textContent('#seg-detail'));
  await page.fill('#m-acpu', '4104');
  await page.fill('#m-u', '0');
  const kpiZero = norm(await page.textContent('#kpis'));
  await page.fill('#m-u', '4870000');
  check(`${L}: a ₹0 net price and zero users read as what they are`,
    /Net price is ₹0 at these inputs/.test(zeroNet) && !/No next batch/.test(zeroNet) && /₹0\s*Expected extra fees/.test(kpiZero), zeroNet.slice(0, 80) + ' || ' + kpiZero.slice(-40));

  // 11. Third review: the score counts lectures against pace; screens never contradict each other.
  await page.click('#t-student');
  await page.click('.persona-row .chip[data-p="0"]');
  await slide(page, { 'in-lec': 0, 'in-test': 100, 'in-idle': 0, 'in-doubt': 0, 'in-streak': 0 });
  const zeroLec = norm(await page.textContent('#e-tier'));
  await page.click('#quick button[data-q="today"]'); await page.waitForTimeout(350);
  await slide(page, { 'in-lec': 75, 'in-test': 70, 'in-doubt': 1, 'in-streak': 5 });
  const atPace = await page.$$eval('#e-factors .factor', (fs) => fs.map((f) => f.innerText.replace(/\s+/g, ' ').trim()).find((t) => /short of pace/.test(t)) || '');
  check(`${L}: no lectures done is high risk; a learner at pace carries no lecture risk`, zeroLec === 'High risk' && /\+0\.0$/.test(atPace), `${zeroLec} | ${atPace}`);
  await slide(page, { 'in-lec': 100, 'in-test': 100, 'in-doubt': 0, 'in-streak': 0, 'in-idle': 14 });
  await page.click('#quick button[data-q="today"]'); await page.waitForTimeout(350);
  const today = norm(await page.$$eval('#chat .bubble.ai', (b) => b[b.length - 1].textContent));
  const noBack = [norm(await page.textContent('#e-actions')), norm(await page.textContent('#s-plan'))].join(' ');
  check(`${L}: high risk with no backlog gets practice, not backlog lectures`, !/backlog/i.test(today + noBack) && /still high risk/.test(noBack), today.slice(0, 80));
  await page.click('.persona-row .chip[data-p="1"]');
  await slide(page, { 'in-lec': 60, 'in-test': 60, 'in-idle': 2, 'in-doubt': 1, 'in-streak': 0 });
  const amanLow = norm(await page.textContent('#e-actions'));
  check(`${L}: a final-year learner never has a next batch queued`, /results-day help queued/.test(amanLow) && !/next batch shown/.test(amanLow), amanLow.slice(0, 120));
  await slide(page, { 'in-idle': 21 });
  await slide(page, { 'in-doubt': 5 });
  const idleNow = await page.$eval('#in-idle', (e) => +e.value);
  check(`${L}: asking doubts this week means the learner was active this week`, idleNow <= 6, idleNow);
  await page.click('.persona-row .chip[data-p="2"]');
  const meenaPlan = norm(await page.textContent('#s-plan'));
  const meenaLang = await page.getAttribute('#pp-lang button[data-l="hi"]', 'aria-pressed');
  check(`${L}: plan grammar reads naturally, and a Hindi-medium report opens in Hindi`, /\(one more next week\)/.test(meenaPlan) && meenaLang === 'true', meenaPlan.slice(0, 80) + ' | hi=' + meenaLang);
  await page.click('.persona-row .chip[data-p="3"]');
  const kTag = norm(await page.textContent('#s-next .banner'));
  await slide(page, { 'in-lec': 10, 'in-test': 15, 'in-idle': 12, 'in-doubt': 0, 'in-streak': 0 });
  const kBanner = norm(await page.textContent('#s-next .banner'));
  check(`${L}: no results-day claim for a February start; a held offer stops saying "Recommended"`, /Next-step offer/.test(kTag) && !/Results-day offer/.test(kTag) && /when you are ready/.test(kBanner) && !/Recommended for/.test(kBanner), kTag + ' | ' + kBanner);
  await page.click('#t-parent');
  await page.click('#pp-learner button[data-p="1"]');
  await page.check('#pp-share');
  const shared = [norm(await page.textContent('#wa-to')), norm(await page.textContent('#wa-body'))];
  await page.uncheck('#pp-share');
  check(`${L}: sharing sends the parent a copy; the learner still sees their own report`, shared[0] === 'To Aman, copy to a parent' && /^Hi Aman/.test(shared[1]), shared[0] + ' | ' + shared[1].slice(0, 30));
  await page.click('#t-console');
  await page.fill('#m-fx', '');
  const fxNote = norm(await page.textContent('#m-note'));
  const fxFigures = norm(await page.textContent('#p-console'));
  await page.fill('#m-fx', '95.1');
  await page.fill('#m-off', '100');
  const plaus = norm(await page.textContent('#m-total-sub'));
  await page.fill('#m-off', '1');
  check(`${L}: one honest message per calculator problem, and a plausibility warning`, !/US\$/.test(fxNote) && !/NaN/.test(fxFigures) && /\$8\.97M/.test(fxFigures) && /more than a quarter of FY26 revenue/.test(plaus), fxNote + ' | ' + plaus.slice(-70));
  const a11y3 = await page.evaluate(() => ({
    skip: !!document.querySelector('a.skip[href="#main"]') && !!document.querySelector('main#main .hero'),
    names: ['lec', 'test', 'idle', 'doubt', 'streak'].every((k) => document.getElementById('v-' + k).getAttribute('aria-hidden') === 'true'),
    arrow: [...document.querySelectorAll('#segtbl th button')].every((b) => !/[▼▲]/.test([...b.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(''))),
    live: !document.getElementById('seg-detail').hasAttribute('aria-live') && !!document.getElementById('risk-live'),
  }));
  check(`${L}: skip link, stable slider names, silent sort arrows, quiet detail panel`, Object.values(a11y3).every(Boolean), JSON.stringify(a11y3));

  // 12. Fourth review: a child sees an academic step, never a product; numbers in view agree.
  await page.click('#t-student');
  await page.click('.persona-row .chip[data-p="0"]');
  await slide(page, { 'in-lec': 90, 'in-test': 85, 'in-idle': 0, 'in-doubt': 4, 'in-streak': 14 });
  const childCard = norm(await page.textContent('#s-next'));
  check(`${L}: an under-18 sees an academic next step, not a product, plan tier or price`,
    /Class 12 JEE preparation, same faculty/.test(childCard) && !/Lakshya|Multiple plans inside|Recommended for|₹/.test(childCard), childCard.slice(0, 120));
  await slide(page, { 'in-lec': 50, 'in-test': 100, 'in-idle': 0, 'in-doubt': 3, 'in-streak': 14 });
  const lowBehind = norm(await page.textContent('#s-status'));
  check(`${L}: low risk with a backlog says there is a little to catch up`, /a little to catch up/.test(lowBehind), lowBehind);
  await page.click('#t-console');
  const kpi = norm(await page.textContent('#kpis'));
  const hiShare = +((kpi.match(/(\d+)%\s*Drifting/) || [])[1] || 0);
  check(`${L}: the demo cohort sits near the costed high-risk share`, hiShare >= 10 && hiShare <= 18, hiShare + '%');

  // 9. The brand schema swatch matches the token the page uses.
  await page.click('#t-brand');
  const brand = await page.textContent('#p-brand');
  check(`${L}: Muted swatch matches the --muted token`, brand.includes('#6B6B6B') && !brand.includes('#757575'), '');
  await page.click('#t-student');
  await page.click('.persona-row .chip[data-p="0"]');
}

async function prototype(browser, vp) {
  const L = `[${vp.name}] /pw-study/prototype`;
  const { ctx, page, bag, status } = await open(browser, vp, '/pw-study/prototype');
  check(`${L}: HTTP 200`, status === 200, status);
  await names(page, L);
  await firstScreen(page, L, 'proto');

  const feats = await page.$$eval('.feats a', (as) => as.map((a) => a.textContent.replace(/^\d/, '').trim()));
  check(`${L}: the five features carry the same names as the case study`, feats.join() === FEATURES.join(), JSON.stringify(feats));
  // The hero's feature links switch tabs; a tab click writes its own link.
  await page.click('.feats a[href="#dashboard"]');
  const viaFeat = await page.getAttribute('#t-console', 'aria-selected');
  await page.click('#t-parent');
  const hashNow = await page.evaluate(() => location.hash);
  await page.click('#t-student');
  check(`${L}: feature links switch tabs and each tab has its own link`, viaFeat === 'true' && hashNow === '#report', `dashboard=${viaFeat} hash=${hashNow}`);

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
    steps[0] === '7-day AI catch-up plan' && steps.some((t) => /^Mentor call on day 8/.test(t)) && !steps.some((t) => /24 hours/.test(t)), JSON.stringify(steps));

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
  const title = norm(await page.textContent('#wa-title'));
  const kabir = norm(await page.textContent('#wa-to'));
  await page.click('#pp-learner button[data-p="1"]');
  const amanBefore = norm(await page.textContent('#wa-to'));
  await page.check('#pp-share');
  const amanAfter = norm(await page.textContent('#wa-to'));
  check(`${L}: weekly report keeps one name, recipient by age and opt-in`,
    title === 'PW Weekly Progress Report' && kabir === 'To Kabir' && amanBefore === 'To Aman' && amanAfter === 'To Aman, copy to a parent',
    `${title}: Kabir=${kabir} Aman=${amanBefore} -> ${amanAfter}`);

  // Riya's high-risk report, in both languages, states the escalation and never
  // promises a call tomorrow: that is a promise PW's mentors cannot keep at scale.
  await page.click('#pp-learner button[data-p="0"]');
  const pulse = {};
  for (const l of ['en', 'hi']) { await page.click(`#pp-lang button[data-l="${l}"]`); pulse[l] = norm(await page.textContent('#wa-body')); }
  await page.click('#pp-lang button[data-l="en"]');
  // Riya is high risk: results day holds the next batch back and offers no
  // Vidyapeeth trial, which only strong learners in centre cities get.
  check(`${L}: next-step recommendation holds offers back at high risk`,
    /shown once the catch-up plan is done/.test(pulse.en) && !/trial class/.test(pulse.en) && !/ट्रायल/.test(pulse.hi), pulse.en.slice(-200));
  check(`${L}: weekly report escalates to a mentor after a week, in English and Hindi`,
    /still behind after a week, a PW mentor will call/.test(pulse.en) && /एक हफ्ते बाद भी/.test(pulse.hi)
      && !/tomorrow|6:30/.test(pulse.en) && !/कल शाम|6:30/.test(pulse.hi), pulse.en.slice(0, 120));

  await reviewFixes(page, L);
  await nineFixes(page, L);

  const total = norm(await page.textContent('#m-total'));
  check(`${L}: impact total ₹85.3 cr · $8.97M`, total === '₹85.3 cr · $8.97M', total);
  const netTxt = norm(await page.textContent('#m-net'));
  check(`${L}: net of running costs ₹79.1 cr · $8.32M`, netTxt === '₹79.1 cr · $8.32M', netTxt);

  await page.click('#t-console');
  const head = norm(await page.textContent('#segtbl th:last-child'));
  check(`${L}: value column is labelled as extra fees`, /^Extra fees/.test(head), head);
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

  if (vp.width < 1080) {
    await page.click('#t-student');
    await page.$eval('#in-test', (e) => e.scrollIntoView({ block: 'center' }));
    await slide(page, { 'in-test': 20 });
    const mini = await page.$eval('#mini', (m) => { const r = m.getBoundingClientRect(); return { on: r.top >= 0 && r.bottom <= innerHeight && r.height > 0, t: m.textContent }; });
    const tier = norm(await page.textContent('#e-tier'));
    check(`${L}: on a phone or tablet the score stays in view while dragging`, mini.on && mini.t.includes(tier.replace(' risk', '')), JSON.stringify(mini));
  }
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
  const a2 = await open(browser, vp, '/pw-study');
  const mStudy = ((await a2.page.textContent('#impact')).match(/about (\d+) full-time mentors/) || [])[1];
  await a2.ctx.close();
  const b2 = await open(browser, vp, '/pw-study/prototype');
  await b2.page.click('#t-console');
  const mCalc = ((await b2.page.textContent('#m-net-sub')).match(/about (\d+) full-time mentors/) || [])[1];
  await b2.ctx.close();
  check('case study mentor head-count matches the prototype calculator', !!mStudy && mStudy === mCalc, `case study ${mStudy} vs calculator ${mCalc}`);
}

// CI failed on main (14 Nov 2026) with "steps=2" at 390 and a 45px sideways
// scroll at 820, on code that had passed minutes earlier. Cause: when the web
// font does not load, the fallback font is wider, the hero grows until the
// third "start here" step drops below the fold, and a no-wrap tag in a card
// sticks out past the page. Block the fonts and the first screen must hold.
async function fallbackFonts(browser, vp) {
  const L = `[${vp.name}] /pw-study, web font blocked`;
  const { ctx, page } = await open(browser, vp, '/pw-study', true);
  const f = await page.evaluate(() => {
    // 40px of room: fallback fonts differ between machines, so a step that
    // only just fits here can fall below the fold on the CI runner.
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.top >= 0 && r.bottom <= innerHeight - 40; };
    const last = [...document.querySelectorAll('.start a')].pop();
    return { steps: [...document.querySelectorAll('.start a')].filter(vis).length, bottom: last ? Math.round(last.getBoundingClientRect().bottom) : -1, vh: innerHeight, over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  check(`${L}: all three "start here" steps on the first screen, with room to spare`, f.steps === 3, `steps=${f.steps} last bottom ${f.bottom}/${f.vh}`);
  check(`${L}: no horizontal page scroll`, f.over <= 0, f.over + 'px');
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  await consistency(browser);
  for (const vp of VIEWPORTS) {
    await fallbackFonts(browser, vp);
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
