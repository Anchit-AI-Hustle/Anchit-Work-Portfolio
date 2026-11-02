// Every game under /games loads, starts, actually plays, and fits the screen,
// on a phone, a tablet and a desktop.
//
// A game that renders its menu and then throws on the first frame of play
// looks fine in a screenshot of the hub. So this does what a player does:
// opens each game, presses Play, holds the controls for a few seconds through
// the keyboard on desktop and through the on-screen stick and pads on touch
// screens, and then reads the game's own state (window.__arcade.debug()) to
// prove something moved. It also pauses and resumes, and checks the canvas is
// not blank, that nothing scrolls sideways, and that the console stayed clean.
//
// Run against a served build:  node scripts/games-check.js
//   BASE=http://127.0.0.1:8099 (default, the CI server)
//   MUT=stall  freezes requestAnimationFrame, so "the game advances" must fail.
//   MUT=error  throws inside the first frame of play, so "no errors" must fail.
const { chromium } = require('./_playwright.js');

const BASE = (process.env.BASE || 'http://127.0.0.1:8099').replace(/\/$/, '');
const MUT = process.env.MUT || '';
const GAMES = ['saffron-city', 'midnight-apex', 'turf-kings', 'super-over', 'gully-champs'];
const VIEWPORTS = [
  { name: 'phone 390', viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  { name: 'tablet 820', viewport: { width: 820, height: 1180 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 },
  { name: 'desktop 1440', viewport: { width: 1440, height: 900 }, hasTouch: false, isMobile: false, deviceScaleFactor: 1 },
];

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const strip = (s) => JSON.stringify(s);

async function watchErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const t = m.text();
    // Third-party font CSS can be blocked by a sandboxed runner; that is the
    // network, not the game.
    if (/fonts\.(googleapis|gstatic)\.com|ERR_NAME_NOT_RESOLVED|ERR_TUNNEL|ERR_PROXY|net::ERR_/.test(t)) return;
    errors.push('console: ' + t);
  });
  return errors;
}

async function noSideScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
}

async function hub(browser, vp) {
  const ctx = await browser.newContext(vp);
  const page = await ctx.newPage();
  const errors = await watchErrors(page);
  const res = await page.goto(BASE + '/games', { waitUntil: 'load' });
  check(`[${vp.name}] /games answers 200`, res && res.status() === 200, res && String(res.status()));
  const cards = await page.$$eval('[data-slug]', (els) => els.map((e) => e.getAttribute('data-slug')));
  check(`[${vp.name}] hub lists all ${GAMES.length} games`, GAMES.every((g) => cards.includes(g)), cards.join(','));
  await page.evaluate(() => new Promise((r) => { let y = 0; const step = () => { y += 600; window.scrollTo(0, y); if (y < document.body.scrollHeight) setTimeout(step, 40); else r(); }; step(); }));
  await sleep(400);
  const broken = await page.$$eval('[data-slug] img', (imgs) => imgs.filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.src));
  check(`[${vp.name}] every poster loads`, broken.length === 0, broken.join(' '));
  check(`[${vp.name}] hub does not scroll sideways`, await noSideScroll(page));
  for (const g of GAMES) {
    const r = await page.request.get(BASE + '/games/' + g);
    if (!(r.status() === 200)) check(`[${vp.name}] /games/${g} answers 200`, false, String(r.status()));
  }
  check(`[${vp.name}] hub console clean`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

async function hold(page, vp, ms) {
  if (!vp.hasTouch) {
    // Drive like a player: forward plus a turn, tapping the main action.
    await page.keyboard.down('ArrowUp');
    await page.keyboard.down('ArrowRight');
    const end = Date.now() + ms;
    while (Date.now() < end) {
      await page.keyboard.press('Space');
      await sleep(350);
      await page.keyboard.press('KeyJ');
      await sleep(250);
    }
    await page.keyboard.up('ArrowRight');
    await page.keyboard.up('ArrowUp');
    return;
  }
  // Touch: push the stick up and to the right, and tap every pad in turn.
  const stick = await page.$('.arc-stick');
  if (stick && await stick.isVisible()) {
    const b = await stick.boundingBox();
    await page.dispatchEvent('.arc-stick', 'pointerdown', { pointerId: 11, pointerType: 'touch', isPrimary: true, clientX: b.x + b.width * 0.85, clientY: b.y + b.height * 0.2 });
  }
  const pads = await page.$$('.arc-pad');
  const end = Date.now() + ms;
  let i = 0;
  while (Date.now() < end) {
    if (pads.length) {
      const p = pads[i++ % pads.length];
      await p.dispatchEvent('pointerdown', { pointerId: 20 + i, pointerType: 'touch', isPrimary: false });
      await sleep(260);
      await p.dispatchEvent('pointerup', { pointerId: 20 + i, pointerType: 'touch', isPrimary: false });
    } else {
      await page.tap('canvas').catch(() => {});
    }
    await sleep(200);
  }
  if (stick) await page.dispatchEvent('.arc-stick', 'pointerup', { pointerId: 11, pointerType: 'touch', isPrimary: true });
}

async function game(browser, vp, slug) {
  const ctx = await browser.newContext(vp);
  if (MUT === 'stall') await ctx.addInitScript(() => { window.requestAnimationFrame = () => 0; });
  if (MUT === 'error') await ctx.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (f) => raf((t) => { if (window.__arcade && window.__arcade.state === 'play') throw new Error('mutant'); f(t); });
  });
  const page = await ctx.newPage();
  const errors = await watchErrors(page);
  const tag = `[${vp.name}] ${slug}`;
  const res = await page.goto(BASE + '/games/' + slug, { waitUntil: 'load' });
  check(`${tag} answers 200`, res && res.status() === 200, res && String(res.status()));
  await page.waitForFunction(() => window.__arcade && window.__arcade.frame > 5, null, { timeout: 8000 }).catch(() => {});

  const menu = await page.evaluate(() => {
    const a = window.__arcade; const card = document.querySelector('.arc-card');
    const r = card && card.getBoundingClientRect();
    return a ? { state: a.state, panel: !!card && !card.closest('[hidden]'), fits: !!r && r.left >= -1 && r.right <= innerWidth + 1, w: a.w, h: a.h } : null;
  });
  check(`${tag} shell boots to its menu`, !!menu && menu.state === 'menu' && menu.panel, strip(menu));
  check(`${tag} menu card fits the screen`, !!menu && menu.fits);

  const blank = await page.evaluate(() => {
    const c = document.querySelector('.arc-stage canvas');
    const g = c.getContext('2d');
    const d = g.getImageData(0, 0, c.width, c.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) << 8 | (d[i + 1] >> 4) << 4 | (d[i + 2] >> 4));
    return seen.size;
  });
  check(`${tag} canvas draws a scene behind the menu`, blank > 24, blank + ' colour buckets');

  await page.click('.arc-card .arc-btn.primary');
  await sleep(300);
  const before = await page.evaluate(() => ({ state: window.__arcade.state, frame: window.__arcade.frame, dbg: window.__arcade.debug ? window.__arcade.debug() : null }));
  check(`${tag} Play starts the game`, before.state === 'play', before.state);

  const touchShown = await page.evaluate(() => { const t = document.querySelector('.arc-touch'); return !!t && getComputedStyle(t).display !== 'none'; });
  check(`${tag} touch controls ${vp.hasTouch ? 'shown' : 'hidden'}`, touchShown === vp.hasTouch);

  await hold(page, vp, 4000);
  const after = await page.evaluate(() => ({ state: window.__arcade.state, frame: window.__arcade.frame, time: window.__arcade.time, dbg: window.__arcade.debug ? window.__arcade.debug() : null }));
  check(`${tag} frames advance during play`, after.frame - before.frame > 60, `${after.frame - before.frame} frames`);
  check(`${tag} game state changes under input`, strip(after.dbg) !== strip(before.dbg), strip(after.dbg).slice(0, 140));

  if (after.state === 'play') {
    await page.keyboard.press('Escape');
    await sleep(150);
    const paused = await page.evaluate(() => window.__arcade.state);
    const t0 = await page.evaluate(() => window.__arcade.time);
    await sleep(400);
    const t1 = await page.evaluate(() => window.__arcade.time);
    check(`${tag} Escape pauses and the clock stops`, paused === 'pause' && t1 === t0, paused);
    await page.click('.arc-card .arc-btn.primary');
    await sleep(150);
    check(`${tag} Resume returns to play`, (await page.evaluate(() => window.__arcade.state)) === 'play');
  }

  check(`${tag} page does not scroll sideways`, await noSideScroll(page));
  check(`${tag} console clean`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) {
      await hub(browser, vp);
      for (const g of GAMES) await game(browser, vp, g);
    }
  } finally {
    await browser.close();
  }
  console.log(`\n  ${pass}/${pass + fail} passed${MUT ? '   (mutant: ' + MUT + ')' : ''}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
