// Does a returning visitor get the current assets?
//
// THE BUG THIS CATCHES
//   sw.js served same-origin assets cache-first with no revalidation, under a
//   hand-written cache name last bumped 2026-08-17. HTML was network-first, so
//   the markup updated while every script and stylesheet stayed a month stale:
//   new HTML running against August's JavaScript on any browser that had
//   visited before. Nothing failed loudly; the site was simply wrong.
//
// Run against a served build:  node scripts/sw-freshness.js
// MUT=1 writes the PRE-FIX worker into www/ and runs the same checks against
// it, then restores. The mutation changes the INPUT — a hand-written cache
// name and a cache-first branch that never refetches — rather than flipping
// the assertions, so a check that passes under it is not measuring anything.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const MUT = process.env.MUT === '1';
const BASE = 'http://127.0.0.1:8099';
const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

const fs = require('fs');
const path = require('path');
const SW_PATH = path.join(__dirname, '..', 'www', 'sw.js');

// The worker exactly as it behaved before the fix.
const PRE_FIX = `const CACHE = 'anchit-portfolio-20260817-three-esm';
self.addEventListener('install', (e) => { self.skipWaiting(); });
self.addEventListener('activate', (e) => { self.clients.claim(); });
self.addEventListener('fetch', (e) => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate' || req.destination === 'document') return;
  // Cache-first for same-origin static assets
  if (url.origin === location.origin) {
    e.respondWith(caches.match(req).then(cached => cached || fetch(req)));
  }
});
`;

(async () => {
  const original = fs.readFileSync(SW_PATH, 'utf8');
  if (MUT) fs.writeFileSync(SW_PATH, PRE_FIX);
  const restore = () => { if (MUT) fs.writeFileSync(SW_PATH, original); };
  process.on('exit', restore);
  const sw = fs.readFileSync(SW_PATH, 'utf8');

  // 1. The build stamped it — a hand-written date can drift, a content hash cannot.
  const m = sw.match(/const CACHE = '([^']+)'/);
  const name = m ? m[1] : '(none)';
  check('the cache name is stamped by the build, not by hand',
    /^anchit-portfolio-[0-9a-f]{12}$/.test(name) && name !== 'anchit-portfolio-dev',
    name);

  // 2. Assets revalidate rather than being frozen for the life of a version.
  check('same-origin assets revalidate in the background',
    /stale-while-revalidate/i.test(sw) && /const fresh = fetch\(req\)/.test(sw),
    /const fresh = fetch\(req\)/.test(sw) ? 'fetch runs on every asset hit' : 'cache hit short-circuits, nothing refetches');

  // 3. End to end: a visitor holding a PREVIOUS cache must end up on current bytes.
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 800 }, serviceWorkers: 'allow' });
  const p = await ctx.newPage();
  await p.goto(BASE + '/index.html', { waitUntil: 'load', timeout: 30000 });
  await p.waitForFunction(() => navigator.serviceWorker && navigator.serviceWorker.controller, null, { timeout: 20000 })
        .catch(() => {});

  // Poison the cache the way a month-old deploy would have: a stale asset body
  // stored under the live cache name.
  const marker = 'STALE_MARKER_' + Date.now();
  const poisoned = await p.evaluate(async (mk) => {
    const keys = await caches.keys();
    if (!keys.length) return null;
    const c = await caches.open(keys[0]);
    await c.put('/assets/cinematic.js', new Response('/* ' + mk + ' */', { headers: { 'Content-Type': 'application/javascript' } }));
    const got = await c.match('/assets/cinematic.js');
    return got ? (await got.text()).slice(0, 40) : null;
  }, marker);

  const read = () => p.evaluate(async () =>
    (await (await fetch('/assets/cinematic.js')).text()).slice(0, 60));

  // Both halves of stale-while-revalidate are worth asserting, and the first
  // read was previously taken and thrown away - which github-code-quality
  // correctly flagged as a dead store. It is not a useless read, it is the
  // half that says the cache still answers instantly.
  let firstLoad = '(not fetched)', secondLoad = '(not fetched)';
  if (poisoned) {
    firstLoad = await read();          // serves the cached (poisoned) body at once
    await p.waitForTimeout(700);       // and refetches behind it
    secondLoad = await read();         // which the next load picks up
  }

  check('the cached copy still answers immediately',
    poisoned !== null && firstLoad.includes('STALE_MARKER'),
    poisoned === null ? 'no cache to poison (service worker never took control)'
      : (firstLoad.includes('STALE_MARKER') ? 'cache hit served without waiting on the network'
                                            : 'did not serve from cache: ' + firstLoad.slice(0, 30)));

  check('a poisoned cache heals on the next load',
    poisoned !== null && !secondLoad.includes('STALE_MARKER') && /cinematic\.js|motion grammar|use strict/.test(secondLoad),
    poisoned === null ? 'no cache to poison (service worker never took control)'
      : (secondLoad.includes('STALE_MARKER') ? 'still serving the stale body' : 'current body served back'));

  await b.close();

  for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(52) + (d || ''));
  const pass = results.filter(r => r[0] === 'PASS').length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  restore();
  if (MUT) { console.log('MUT: the pre-fix worker must fail the checks above'); process.exit(0); }
  process.exit(pass === results.length ? 0 : 1);
})();
