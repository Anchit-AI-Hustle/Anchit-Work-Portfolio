// Local harness: static public/ + /api/* -> api/main.js (same rewrite as vercel.json). Uses real Neon via the egress proxy.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// Needs DATABASE_URL, SESSION_SECRET, PIN_PEPPER in the environment, e.g. `vercel env pull .env` then `node --env-file=.env tests/server.mjs`.
for (const k of ['DATABASE_URL', 'SESSION_SECRET', 'PIN_PEPPER']) if (!process.env[k]) { console.error('Missing env ' + k); process.exit(1); }
const { default: handler } = await import(ROOT + '/api/main.js?' + Date.now());
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname.startsWith('/api/')) {
    const route = u.pathname.slice(5); u.searchParams.set('route', route);
    req.url = '/api/main?' + u.searchParams.toString();
    // emulate Vercel's https + forwarded ip
    req.headers['x-forwarded-for'] = req.headers['x-test-ip'] || '127.0.0.1';
    return handler(req, res);
  }
  let p = path.join(ROOT, 'public', decodeURIComponent(u.pathname));
  if (p.endsWith('/')) p += 'index.html';
  fs.readFile(p, (e, d) => { if (e) { res.statusCode = 404; return res.end('nf'); } res.setHeader('Content-Type', types[path.extname(p)] || 'application/octet-stream'); res.end(d); });
}).listen(process.env.PORT || 8787, () => console.log('dev on', process.env.PORT || 8787));
