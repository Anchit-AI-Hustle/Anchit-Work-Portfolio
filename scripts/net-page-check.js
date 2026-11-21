// The global leaderboard in a real game page, in a browser, both ways round:
//
//   1. Server down. The page is served by a plain static server and told to
//      use a server that is not there (?net=http://127.0.0.1:9). The game must
//      boot to its menu, play, pause and end exactly as it does offline: no
//      board, no error, nothing waiting.
//   2. Server up. The page is served by the local Worker (wrangler dev, which
//      also runs /net/*). The menu shows the global board; a finished run posts
//      its score, and the results panel shows the player's rank and row.
//
//   npm run build
//   NET_BASE=http://127.0.0.1:8788 STATIC_BASE=http://127.0.0.1:8099 node scripts/net-page-check.js
//   GAMES=rangoli-drop,turf-kings (default)
// NET_BASE serves www/ through the Worker (wrangler dev); STATIC_BASE serves
// www/ with no /net at all (the CI server). Without NET_BASE only part 1 runs.
const { chromium } = require('./_playwright.js');

const NET_BASE = (process.env.NET_BASE || '').replace(/\/$/, '');
const STATIC_BASE = (process.env.STATIC_BASE || 'http://127.0.0.1:8099').replace(/\/$/, '');
const GAMES = (process.env.GAMES || 'rangoli-drop,turf-kings').split(',').map((s) => s.trim()).filter(Boolean);
let pass = 0, fail = 0;
const check = (label, ok, detail) => { console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`); ok ? pass++ : fail++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function watch(page, allowRefused) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (/fonts\.(googleapis|gstatic)\.com/.test(t)) return;
    // The dead server's refused connection is the point of part 1.
    if (allowRefused && /ERR_CONNECTION_REFUSED|net::ERR_/.test(t)) return;
    errors.push('console: ' + t);
  });
  return errors;
}

async function bootAndPlay(page, tag) {
  await page.waitForFunction(() => window.__arcade && window.__arcade.frame > 5 && window.__arcade.state === 'menu', null, { timeout: 15000 }).catch(() => {});
  check(`${tag} boots to its menu`, await page.evaluate(() => !!window.__arcade && window.__arcade.state === 'menu'));
  await page.click('.arc-card .arc-btn.primary');
  await sleep(300);
  const f0 = await page.evaluate(() => window.__arcade.frame);
  check(`${tag} Play starts the game`, (await page.evaluate(() => window.__arcade.state)) === 'play');
  await page.keyboard.down('ArrowRight'); await sleep(1500); await page.keyboard.up('ArrowRight');
  const f1 = await page.evaluate(() => window.__arcade.frame);
  check(`${tag} frames advance during play`, f1 - f0 > 20, (f1 - f0) + ' frames');
  await page.keyboard.press('Escape'); await sleep(150);
  check(`${tag} pause works`, (await page.evaluate(() => window.__arcade.state)) === 'pause');
  await page.click('.arc-card .arc-btn.primary'); await sleep(150);
  check(`${tag} resume works`, (await page.evaluate(() => window.__arcade.state)) === 'play');
}

async function serverDown(browser, slug) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors = watch(page, true);
  const tag = `[down] ${slug}`;
  const started = Date.now();
  await page.goto(STATIC_BASE + '/games/' + slug + '?net=http://127.0.0.1:9', { waitUntil: 'load' });
  await bootAndPlay(page, tag);
  check(`${tag} menu came up without waiting on the server`, Date.now() - started < 20000);
  await page.evaluate(() => window.__arcade.over({ score: 120, title: 'Test over' }));
  await sleep(2500);
  const st = await page.evaluate(() => ({ state: window.__arcade.state, lb: Array.from(document.querySelectorAll('.arc-lb')).filter((e) => !e.hidden).length, net: !!window.ArcadeNet }));
  check(`${tag} results panel shows and no global board appears`, st.state === 'over' && st.lb === 0, JSON.stringify(st));
  check(`${tag} the online client loaded and stood down`, st.net === true);
  await page.click('.arc-card .arc-btn.primary'); await sleep(300);
  check(`${tag} Play again works`, (await page.evaluate(() => window.__arcade.state)) === 'play');
  check(`${tag} no page errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function serverUp(browser, slug, vp) {
  const ctx = await browser.newContext(vp);
  const page = await ctx.newPage();
  const errors = watch(page, false);
  const tag = `[up ${vp.name}] ${slug}`;
  await page.goto(NET_BASE + '/games/' + slug + '?net=' + encodeURIComponent(NET_BASE), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__arcade && window.__arcade.state === 'menu', null, { timeout: 15000 }).catch(() => {});
  const menuBoard = await page.waitForSelector('.arc-lb:not([hidden]) .arc-lb-list', { timeout: 10000 }).then(() => true).catch(() => false);
  check(`${tag} the menu shows the global board`, menuBoard);
  const fits = await page.evaluate(() => { const e = document.querySelector('.arc-lb'); const r = e && e.getBoundingClientRect(); return !!r && r.left >= -1 && r.right <= innerWidth + 1; });
  check(`${tag} the board fits the panel`, fits);
  await page.click('.arc-card .arc-btn.primary');
  await sleep(1600); // longer than the test server's NET_MIN_RUN_MS
  const tokenAsked = await page.evaluate(() => !!window.ArcadeNet);
  check(`${tag} a run asks for a token in the background`, tokenAsked);
  await page.evaluate(() => window.__arcade.over({ score: 240, title: 'Test over' }));
  const ranked = await page.waitForFunction(() => { const r = document.querySelector('.arc-lb-rank'); return r && /#\d+/.test(r.textContent); }, null, { timeout: 10000 }).then(() => true).catch(() => false);
  check(`${tag} the results panel shows a global rank`, ranked, await page.evaluate(() => (document.querySelector('.arc-lb-rank') || {}).textContent));
  const mine = await page.waitForFunction(() => document.querySelector('.arc-lb-list li.me'), null, { timeout: 8000 }).then(() => true).catch(() => false);
  check(`${tag} the player's own row is on the board`, mine);
  // First score on a board: asked for a name once, inline.
  const asked = await page.$('.arc-lb-form input');
  check(`${tag} a name is asked for once, inline`, !!asked);
  if (asked) {
    await asked.fill('Test Ace');
    await page.press('.arc-lb-form input', 'Enter');
    const renamed = await page.waitForFunction(() => Array.from(document.querySelectorAll('.arc-lb-list li.me .n')).some((e) => /Test Ace/.test(e.textContent)), null, { timeout: 8000 }).then(() => true).catch(() => false);
    check(`${tag} the new name shows on the board`, renamed);
    check(`${tag} typing the name did not restart the game`, (await page.evaluate(() => window.__arcade.state)) === 'over');
  }
  // Period switch.
  await page.click('.arc-lb-per button[data-p="all"]');
  await sleep(600);
  check(`${tag} the period switch works`, await page.evaluate(() => document.querySelector('.arc-lb-per button[data-p="all"]').getAttribute('aria-pressed') === 'true' && !!document.querySelector('.arc-lb-list li')));
  check(`${tag} no page or console errors`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const g of GAMES) await serverDown(browser, g);
    if (NET_BASE) {
      for (const g of GAMES) {
        await serverUp(browser, g, { name: 'desktop', viewport: { width: 1440, height: 900 } });
        await serverUp(browser, g, { name: 'phone', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
      }
    } else {
      console.log('  (NET_BASE not set: the server-up half was skipped)');
    }
  } finally {
    await browser.close();
  }
  console.log(`\n  ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
