// Posters for /games, captured from the games themselves.
//
// Each card on the hub and each game's social preview (og:image) is a real
// frame of that game in play, not an illustration of it: the script opens the
// game at 1200x630, presses Play, drives it for a few seconds, hides the page
// chrome and photographs the canvas. Re-run it whenever a game's look changes.
//
//   BASE=http://127.0.0.1:8099 node scripts/games-posters.js   (serve the repo root or www/)
//   ONLY=turf-kings  limits it to one game.
//
// Writes games/<slug>/poster.png (og:image), games/<slug>/poster.webp (hub
// card, with poster-480.webp and poster-800.webp beside it for the hub's srcset)
// and games/og.png (the hub's own preview, a contact sheet of every game).
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { chromium } = require('./_playwright.js');

const BASE = (process.env.BASE || 'http://127.0.0.1:8099').replace(/\/$/, '');
const ROOT = path.join(__dirname, '..');
const GAMES = ['saffron-city', 'midnight-apex', 'ghat-riders', 'turf-kings', 'super-over', 'gully-champs', 'court-lights', 'ring-rajas', 'sky-thread', 'tiffin-dash', 'board-strike', 'yard-catch', 'rally-cage', 'fare-run', 'chhat-hopper', 'kart-mela', 'paint-ops', 'nitro-goal', 'mela-pinball', 'laddoo-dash', 'rangoli-drop', 'akash-raiders', 'diya-breaker'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// How long to play before the photo, and what to hold. Tuned per game so the
// frame shows the game doing its thing rather than its first second.
const PLAY = {
  // The 3D games pick their own quality, and a machine with no GPU makes them choose the lowest. A poster is
  // one still, so each is pinned to full detail: a query flag where the game reads one, or its own test hook.
  'saffron-city': { ms: 5000, keys: ['ArrowUp'], taps: ['KeyF'], tapAt: 400, query: '?q=2&lod=1' },
  'midnight-apex': { ms: 9000, keys: ['ArrowUp'], taps: [], hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'ghat-riders': { ms: 6000, keys: ['ArrowUp'], taps: [], setup: () => window.__arcade.dev && window.__arcade.dev.skipIntro(), hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'turf-kings': { ms: 4500, keys: ['ArrowUp', 'ArrowRight'], taps: [], query: '?quality=0', setup: () => window.__arcade.dev && window.__arcade.dev.skip() },
  'super-over': { ms: 3600, keys: [], taps: [], query: '?q=3' },
  'gully-champs': { ms: 3200, keys: [], taps: [], query: '?q=3&fixq=1' },
  'court-lights': { ms: 3000, keys: [], taps: [], query: '?q=3', setup: () => { const d = window.__arcade.dev; d.live(); setTimeout(() => d.dunk(), 2400); }, hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'ring-rajas': { ms: 2500, keys: [], taps: [], setup: () => { const d = window.__arcade.dev; d.skip(); d.duo('press', 0.6, false, true); if (d.pyro) d.pyro(12); if (d.hud) d.hud(false); if (d.shot) d.shot('close'); }, hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'sky-thread': { ms: 3500, keys: ['ArrowUp', 'ArrowRight'], taps: ['Space'], tapAt: 500, query: '?q=3' },
  'tiffin-dash': { ms: 2800, keys: ['ArrowUp'], taps: ['Space'], tapAt: 400, hiq: () => window.__arcade.dev && window.__arcade.dev.setQuality(3) },
  'board-strike': { ms: 2600, keys: ['ArrowRight'], taps: ['Space'], tapAt: 500, query: '?q=3' },
  'yard-catch': { ms: 2800, keys: ['ArrowRight'], taps: [], query: '?q=3' },
  'rally-cage': { ms: 2800, keys: ['ArrowRight'], taps: ['Space'], tapAt: 200, query: '?q=3' },
  'chhat-hopper': { ms: 4500, keys: ['ArrowRight'], taps: ['Space'], tapAt: 1800, setup: () => window.__arcade.dev && window.__arcade.dev.level('1-1'), hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'kart-mela': { ms: 6000, keys: ['ArrowUp'], taps: [], setup: () => window.__arcade.dev && window.__arcade.dev.skip(), hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'paint-ops': { ms: 2200, keys: ['ArrowRight'], taps: [], setup: () => window.__arcade.dev && window.__arcade.dev.skipIntro(), hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'nitro-goal': { ms: 5000, keys: ['ArrowUp'], taps: ['Space'], tapAt: 300, hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'mela-pinball': { ms: 4500, keys: [], taps: ['Space'], tapAt: 400, setup: () => window.__arcade.dev && window.__arcade.dev.multiball(), hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'laddoo-dash': { ms: 2500, keys: [], taps: [], query: '?q=3', setup: () => { const d = window.__arcade.dev; d.bot(true); d.skip(); d.warp(9); d.power(); }, hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'rangoli-drop': { ms: 7000, keys: [], taps: [], setup: () => window.__arcade.dev && window.__arcade.dev.showcase(true), hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'akash-raiders': { ms: 2500, keys: [], taps: [], query: '?hq=1', setup: () => { const d = window.__arcade.dev; if (d) { d.skip(); d.level(2); d.ff(13.5, true); d.bot(true); } }, hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'diya-breaker': { ms: 11000, keys: [], taps: [], setup: () => { const d = window.__arcade.dev; if (!d) return; d.level(29); d.skip(); d.auto(true); setTimeout(() => d.power('multi'), 2500); }, hiq: () => window.__arcade.dev && window.__arcade.dev.quality(3) },
  'fare-run': { ms: 2800, keys: ['ArrowRight'], taps: [], hiq: () => window.__arcade.dev && window.__arcade.dev.setQuality(3) },
};

async function shoot(browser, slug) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 682 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const p = PLAY[slug] || { ms: 3000, keys: [], taps: [] };
  await page.goto(BASE + '/games/' + slug + (p.query || ''), { waitUntil: 'load' });
  await page.waitForFunction(() => window.__arcade && window.__arcade.frame > 5, null, { timeout: 10000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.click('.arc-card .arc-btn.primary');
  if (p.setup) await page.evaluate(p.setup);
  for (const k of p.keys) await page.keyboard.down(k);
  const start = Date.now();
  for (const t of p.taps) { await sleep(p.tapAt || 300); await page.keyboard.press(t); }
  while (Date.now() - start < p.ms) await sleep(100);
  // Freeze the frame: pause the loop without opening the pause panel.
  if (p.hiq) { await page.evaluate(p.hiq); await page.waitForFunction((f) => window.__arcade.frame > f + 3, await page.evaluate(() => window.__arcade.frame), { timeout: 60000 }); }
  await page.addStyleTag({ content: '.arc-bar,.arc-hint,.arc-toast,.arc-touch,.arc-panel,.arc-float{display:none!important}' });
  await sleep(250);
  // The stage, not one canvas: a 3D game draws on a WebGL canvas with its HUD on a second one above it.
  // A clip of the page, not an element shot: a stage that shakes on impact never reads as stable.
  const box = await page.locator('.arc-stage').boundingBox();
  const buf = await page.screenshot({ clip: box, timeout: 120000 });
  for (const k of p.keys) await page.keyboard.up(k);
  await ctx.close();
  const img = sharp(buf).resize(1200, 630, { fit: 'cover', position: 'centre' });
  const dir = path.join(ROOT, 'games', slug);
  await img.clone().png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(path.join(dir, 'poster.png'));
  await img.clone().webp({ quality: 78 }).toFile(path.join(dir, 'poster.webp'));
  // Smaller copies for the hub's srcset: a card is 360 to 480 CSS pixels wide, so
  // the full 1200px poster was three to six times the pixels it is shown at.
  for (const w of [480, 800]) await img.clone().resize(w).webp({ quality: 74, effort: 6 }).toFile(path.join(dir, `poster-${w}.webp`));
  console.log('  poster  ' + slug);
}

async function sheet() {
  const W = 1200, H = 630;
  // Every poster in one grid; a short last row is centred under the rest.
  // A near-square grid: the sheet is 1200x630 and so is every poster, so as many columns as rows keeps
  // each cell the posters' own shape.
  const cols = Math.ceil(Math.sqrt(GAMES.length));
  const rows = Math.ceil(GAMES.length / cols);
  const cellW = Math.floor(W / cols), cellH = Math.floor(H / rows);
  const thumbs = await Promise.all(GAMES.map((g) => sharp(path.join(ROOT, 'games', g, 'poster.png')).resize(cellW, cellH, { fit: 'cover' }).toBuffer()));
  const comp = thumbs.map((b, i) => {
    const row = Math.floor(i / cols), inRow = Math.min(cols, GAMES.length - row * cols);
    return { input: b, left: Math.round((W - inRow * cellW) / 2) + (i % cols) * cellW, top: row * cellH };
  });
  const label = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0.55" stop-color="#0F0D0A" stop-opacity="0"/><stop offset="1" stop-color="#0F0D0A" stop-opacity="0.92"/></linearGradient></defs>` +
    `<rect width="${W}" height="${H}" fill="url(#g)"/>` +
    `<text x="48" y="560" font-family="Georgia, serif" font-size="64" fill="#FBF5EC">Games</text>` +
    `<text x="50" y="598" font-family="monospace" font-size="20" letter-spacing="3" fill="#FFB736">ANCHIT-TANDON.COM/GAMES</text></svg>`);
  comp.push({ input: label, left: 0, top: 0 });
  await sharp({ create: { width: W, height: H, channels: 3, background: '#0F0D0A' } })
    .composite(comp).png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(path.join(ROOT, 'games', 'og.png'));
  console.log('  sheet   games/og.png');
}

(async () => {
  const browser = await chromium.launch();
  try {
    const only = process.env.ONLY ? process.env.ONLY.split(',') : GAMES;
    for (const g of only) await shoot(browser, g);
  } finally { await browser.close(); }
  if (GAMES.every((g) => fs.existsSync(path.join(ROOT, 'games', g, 'poster.png')))) await sheet();
})().catch((e) => { console.error(e); process.exit(1); });
