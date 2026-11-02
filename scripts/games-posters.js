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
// card) and games/og.png (the hub's own preview, a contact sheet of all five).
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const { chromium } = require('./_playwright.js');

const BASE = (process.env.BASE || 'http://127.0.0.1:8099').replace(/\/$/, '');
const ROOT = path.join(__dirname, '..');
const GAMES = ['saffron-city', 'midnight-apex', 'turf-kings', 'super-over', 'gully-champs'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// How long to play before the photo, and what to hold. Tuned per game so the
// frame shows the game doing its thing rather than its first second.
const PLAY = {
  'saffron-city': { ms: 5000, keys: ['ArrowUp'], taps: ['KeyF'], tapAt: 400 },
  'midnight-apex': { ms: 9000, keys: ['ArrowUp'], taps: [] },
  'turf-kings': { ms: 4500, keys: ['ArrowUp', 'ArrowRight'], taps: [] },
  'super-over': { ms: 3600, keys: [], taps: [] },
  'gully-champs': { ms: 3200, keys: [], taps: [] },
};

async function shoot(browser, slug) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 682 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.goto(BASE + '/games/' + slug, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__arcade && window.__arcade.frame > 5, null, { timeout: 10000 });
  await page.evaluate(() => document.fonts && document.fonts.ready);
  await page.click('.arc-card .arc-btn.primary');
  const p = PLAY[slug] || { ms: 3000, keys: [], taps: [] };
  for (const k of p.keys) await page.keyboard.down(k);
  const start = Date.now();
  for (const t of p.taps) { await sleep(p.tapAt || 300); await page.keyboard.press(t); }
  while (Date.now() - start < p.ms) await sleep(100);
  // Freeze the frame: pause the loop without opening the pause panel.
  await page.addStyleTag({ content: '.arc-bar,.arc-hint,.arc-toast,.arc-touch,.arc-panel{display:none!important}' });
  await sleep(250);
  const buf = await page.locator('.arc-stage canvas').screenshot();
  for (const k of p.keys) await page.keyboard.up(k);
  await ctx.close();
  const img = sharp(buf).resize(1200, 630, { fit: 'cover', position: 'centre' });
  const dir = path.join(ROOT, 'games', slug);
  await img.clone().png({ compressionLevel: 9, palette: true, quality: 90 }).toFile(path.join(dir, 'poster.png'));
  await img.clone().webp({ quality: 78 }).toFile(path.join(dir, 'poster.webp'));
  console.log('  poster  ' + slug);
}

async function sheet() {
  const W = 1200, H = 630;
  // Feature poster large on the left, four small ones in a 2x2 grid on the right.
  const big = await sharp(path.join(ROOT, 'games', GAMES[0], 'poster.png')).resize(600, 630, { fit: 'cover' }).toBuffer();
  const small = await Promise.all(GAMES.slice(1).map((g) => sharp(path.join(ROOT, 'games', g, 'poster.png')).resize(300, 315, { fit: 'cover' }).toBuffer()));
  const comp = [{ input: big, left: 0, top: 0 }];
  small.forEach((b, i) => comp.push({ input: b, left: 600 + (i % 2) * 300, top: Math.floor(i / 2) * 315 }));
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
