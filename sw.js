/* Service worker — minimal offline cache for the portfolio shell.
 * Cache name is version-stamped so each deploy purges the previous cache
 * (the activate handler deletes every cache whose name !== CACHE). Bump
 * this string on every deploy that changes assets. */
const CACHE = 'anchit-portfolio-20260817-three-esm';
const SHELL = [
  '/',
  '/index.html',
  '/task-tracker.html',
  '/manifest.json',
  '/assets/task-tracker-shell.js',
  /* three.module.min.js is deliberately NOT precached. It is 670 KB, it is fetched
     lazily on idle and only on hardware that can keep the nebula, and half the
     visitors never request it at all — precaching it spent that download on
     every install. It still lands in the runtime cache the first time a page
     actually asks for it. */
  '/assets/vendor/gsap.min.js',
  '/assets/vendor/ScrollTrigger.min.js',
  /* The page renders the optimised WebP; the 1.5MB PNG it replaced is kept
     in the repo only for og:image, which social scrapers fetch server-side
     and never from this cache — so precaching it cost 1.5MB per install
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
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Network-first for HTML so updates ship fast
  if (req.mode === 'navigate' || req.destination === 'document') {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then(r => r || caches.match('/index.html')))
    );
    return;
  }

  // Cache-first for same-origin static assets
  if (url.origin === location.origin) {
    e.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req).then(res => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
          }
          return res;
        }).catch(() => cached);
      })
    );
  }
});
