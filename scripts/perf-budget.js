// Load-time budgets on a throttled phone: the games hub, the home page and
// every game, measured the way a visitor on mobile data meets them.
//
// WHAT IT MEASURES
//   Each page opens in a fresh browser (empty cache) with the network held to
//   Chrome's "Fast 4G" profile (9 Mbps down, 1.5 Mbps up, 165 ms latency per
//   request) and the CPU slowed 4x, at 390x844. For the hub and the home page
//   it reads the Largest Contentful Paint. For each game it reads two times
//   from the navigation: when the menu was first painted (what a player sees)
//   and when it is ready, the frame loop running behind it (when a press of
//   Play is answered at once). The second is mostly the game building and
//   drawing its first 3D frame; on a machine with no GPU (CI, this container)
//   that is software rendering and swings by a second or more between runs,
//   so its budget is wide and only catches something gross.
//
// WHY ITS OWN SERVER
//   `npx serve` compresses with gzip and sends no Cache-Control at all, and an
//   uncompressed three.js costs three times the download it costs in
//   production. This starts a small server on a free port that answers the way
//   the CDN does for these files: brotli for text, cleanUrls, the rewrites,
//   and the Cache-Control rules from vercel.json (including the ?v= rule that
//   makes versioned /games files immutable). It serves the built www/, so run
//   `npm run build` first.
//
// BUDGETS are generous on purpose: a shared CI runner is slower and noisier
// than a laptop, and a budget that fails one run in ten teaches people to
// ignore it. They catch a regression of the kind this was written after (a
// 1.5 MB favicon, a module fetched only after DOMContentLoaded, a stylesheet
// that holds the first paint), not a 5% drift. Override with env:
//   HUB_LCP=2500  HOME_LCP=3500  MENU=6500  READY=10000   (milliseconds)
//   GAMES=turf-kings,kart-mela   limit the games measured
//   VERBOSE=1                    print every measurement
const path = require('path');
const fs = require('fs');
const http = require('http');
const zlib = require('zlib');
const { chromium } = require('./_playwright.js');

const ROOT = path.join(__dirname, '..');
// WWW=<dir> measures another built tree, e.g. a copy of the previous build.
const WWW = process.env.WWW ? path.resolve(process.env.WWW) : path.join(ROOT, 'www');
const BUDGET = { hub: +(process.env.HUB_LCP || 2500), home: +(process.env.HOME_LCP || 3500), menu: +(process.env.MENU || 6500), ready: +(process.env.READY || 10000) };
const ALL_GAMES = ['saffron-city', 'midnight-apex', 'ghat-riders', 'turf-kings', 'super-over', 'gully-champs', 'court-lights', 'sky-thread', 'tiffin-dash', 'board-strike', 'yard-catch', 'rally-cage', 'fare-run', 'chhat-hopper', 'kart-mela', 'paint-ops', 'nitro-goal'];
const GAMES = (process.env.GAMES || ALL_GAMES.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

let pass = 0, fail = 0;
const check = (label, ok, detail) => { ok ? pass++ : fail++; console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '   ' + detail : ''}`); };

/* ---------------------------------------------------------------- server */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain' };
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
// Vercel sources: text outside (...) is literal, a (...) group is a regex.
const sourceRe = (src) => { let out = '', depth = 0; for (const ch of src) { if (ch === '(') depth++; if (depth) out += ch; else out += ch.replace(/[.+?^${}|[\]\\*]/g, '\\$&'); if (ch === ')') depth--; } return new RegExp('^' + out + '$'); };
const HEADERS = (cfg.headers || []).map((h) => ({ re: sourceRe(h.source), has: h.has || [], headers: h.headers }));
const REWRITES = (cfg.rewrites || []).filter((r) => !/^https?:/.test(r.destination) && !r.source.includes(':'));
const fileFor = (p) => {
  const abs = path.join(WWW, decodeURIComponent(p).replace(/^\/+/, ''));
  if (!abs.startsWith(WWW)) return null;
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  if (fs.existsSync(abs + '.html')) return abs + '.html';
  if (fs.existsSync(path.join(abs, 'index.html'))) return path.join(abs, 'index.html');
  return null;
};
const packed = new Map();
function start() {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    let file = fileFor(url.pathname);
    if (!file) { const rw = REWRITES.find((r) => r.source === url.pathname); if (rw) file = fileFor(rw.destination); }
    if (!file) { res.writeHead(404); return res.end(); }
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const head = { 'content-type': type, 'cache-control': 'public, max-age=0, must-revalidate' };
    for (const h of HEADERS) {
      if (!h.re.test(url.pathname) || !h.has.every((c) => c.type === 'query' && url.searchParams.has(c.key))) continue;
      for (const kv of h.headers) if (/^cache-control$/i.test(kv.key)) head['cache-control'] = kv.value;
    }
    let body = fs.readFileSync(file);
    if (/text|json|javascript|svg/.test(type) && /\bbr\b/.test(req.headers['accept-encoding'] || '')) {
      if (!packed.has(file)) packed.set(file, zlib.brotliCompressSync(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } }));
      body = packed.get(file); head['content-encoding'] = 'br';
    }
    head['content-length'] = body.length;
    res.writeHead(200, head); res.end(body);
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)));
}

/* ---------------------------------------------------------------- probes */
const PROBE = () => {
  const P = window.__budget = { lcp: 0, menu: 0, painted: 0 };
  let shown = false;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true }); } catch (e) { /* old engine */ }
  const look = (t) => {
    try {
      const a = window.__arcade, card = document.querySelector('.arc-card'), panel = card && card.closest('.arc-panel');
      const visible = !!(panel && !panel.hidden && card.querySelector('.arc-btn.primary'));
      // A frame starts after the previous one painted: if the menu was there
      // last frame, it is on screen now.
      if (!P.painted && visible && shown) P.painted = t;
      shown = visible;
      if (!P.menu && a && a.state === 'menu' && a.frame >= 2 && visible) P.menu = performance.now();
      if (P.menu && P.painted) return;
    } catch (e) { /* not booted yet */ }
    requestAnimationFrame(look);
  };
  requestAnimationFrame(look);
};

async function open(browser, url) {
  const ctx = await browser.newContext(PHONE);
  await ctx.addInitScript(PROBE);
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 165, downloadThroughput: 9e6 * 0.9 / 8, uploadThroughput: 1.5e6 * 0.9 / 8 });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  // Third-party fonts are not ours to budget and their timing is the
  // network's; they are answered empty so every run measures the same thing.
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: r.request().resourceType() === 'stylesheet' ? 'text/css' : 'font/woff2', body: '' }));
  return { ctx, page, url };
}

async function lcpOf(browser, url) {
  const { ctx, page } = await open(browser, url);
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(1500);
  const lcp = await page.evaluate(() => window.__budget.lcp);
  await ctx.close();
  return Math.round(lcp);
}

async function menuOf(browser, url) {
  const { ctx, page } = await open(browser, url);
  await page.goto(url, { waitUntil: 'commit', timeout: 60000 });
  const ok = await page.waitForFunction(() => window.__budget.menu > 0 && window.__budget.painted > 0, null, { timeout: 60000, polling: 200 }).then(() => true, () => false);
  const t = ok ? await page.evaluate(() => window.__budget) : { painted: Infinity, menu: Infinity };
  await ctx.close();
  return { painted: Math.round(t.painted), ready: Math.round(t.menu) };
}

(async () => {
  if (!fs.existsSync(path.join(WWW, 'games', 'index.html'))) { console.error('www/ is missing: run `npm run build` first.'); process.exit(1); }
  const server = await start();
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch();
  try {
    console.log(`Budgets on a Fast 4G phone with a 4x slower CPU (${base})`);
    const hub = await lcpOf(browser, base + '/games');
    check(`/games largest paint under ${BUDGET.hub} ms`, hub < BUDGET.hub, hub + ' ms');
    const home = await lcpOf(browser, base + '/');
    check(`/ largest paint under ${BUDGET.home} ms`, home < BUDGET.home, home + ' ms');
    const ms = (t) => (Number.isFinite(t) ? t + ' ms' : 'never');
    for (const g of GAMES) {
      const t = await menuOf(browser, base + '/games/' + g);
      check(`${g} menu on screen under ${BUDGET.menu} ms`, t.painted < BUDGET.menu, ms(t.painted));
      check(`${g} menu ready under ${BUDGET.ready} ms`, t.ready < BUDGET.ready, ms(t.ready));
    }
  } finally {
    await browser.close();
    server.close();
  }
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
