/* Service worker, minimal offline cache for the portfolio shell.
 *
 * The cache name is STAMPED BY THE BUILD, from a hash of every js/css/html/json
 * file it will serve (see stampServiceWorker in scripts/build-www.mjs). Do not
 * hand-edit it. It used to be a hand-written date with a comment saying "bump
 * this string on every deploy"; it was last bumped on 2026-08-17 and drifted a
 * month, which served August's JavaScript to every returning visitor while the
 * HTML updated underneath it, new markup running against old scripts. */
const CACHE = 'anchit-portfolio-dev';
const SHELL = [
  '/',
  '/index.html',
  '/task-tracker.html',
  '/manifest.json',
  '/assets/task-tracker-shell.js',
  /* three.module.min.js is deliberately NOT precached. It is 670 KB, it is fetched
     lazily on idle and only on hardware that can keep the nebula, and half the
     visitors never request it at all, precaching it spent that download on
     every install. It still lands in the runtime cache the first time a page
     actually asks for it. */
  '/assets/vendor/gsap.min.js',
  '/assets/vendor/ScrollTrigger.min.js',
  /* The page renders the optimised WebP; the 1.5MB PNG it replaced is kept
     in the repo only for og:image, which social scrapers fetch server-side
     and never from this cache, so precaching it cost 1.5MB per install
     for a file no visitor loads. */
  '/assets/anchit-mark-220.webp',
  '/assets/logo-at-330.webp',
  '/icons/apple-touch-icon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable-512.png',
  '/icons/anchit-apple-touch-20260607.png',
  '/icons/anchit-app-icon-192-20260607.png',
  '/icons/anchit-app-icon-512-20260607.png',
  '/icons/anchit-app-icon-maskable-512-20260607.png',
  '/icons/favicon.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {}))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(Promise.all([
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ),
    // Navigation preload: the browser starts the page request while this
    // worker is still waking up, instead of after. Pages are network-first, so
    // without it every controlled navigation paid the worker's start-up time
    // (tens to a couple of hundred ms on a phone) before the request even left.
    self.registration.navigationPreload ? self.registration.navigationPreload.enable().catch(() => {}) : null,
  ]));
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Films: never cache video. /movies/ serves HLS segments and MP4s (hundreds
  // of MB); stale-while-revalidate would copy every segment into Cache
  // Storage, and Cache.put rejects the 206 partial responses MP4 seeking
  // produces. Let the browser handle these requests natively.
  if (url.pathname.startsWith('/movies/')) return;

  // Network-first for HTML so updates ship fast
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      Promise.resolve(e.preloadResponse)
        .then(pre => pre || fetch(req))
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Stale-while-revalidate for same-origin static assets.
  //
  // Was cache-first with no revalidation: a hit returned and nothing ever
  // re-fetched, so an asset stayed frozen for the whole life of a cache
  // version. That is only safe if the version always changes, and once it
  // didn't, every script on the site was a month stale.
  //
  // The cached copy is still served immediately, so this costs nothing that
  // anyone can feel; the network copy lands in the cache for the next load.
  // Belt and braces with the build stamp: if a version ever fails to change,
  // the site now heals itself on the following visit instead of staying stuck.
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(cached => {
        const fresh = fetch(req).then(res => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
        return cached || fresh;
      })
    );
  }
});
