// A static server that answers the way Vercel answers for this project.
//
// WHY THIS EXISTS
//   `npx serve www` is not production. It knows nothing about vercel.json, so
//   every redirect, every rewrite and every cleanUrls hop is invented by the
//   dev server and differs from what the site actually does. A redirect test
//   run against `serve` proves nothing about the deployed site.
//
//   This module reads vercel.json and applies the same four rules Vercel does,
//   in the same order:
//     1. redirects[]  — answered with 308/307 and a Location header
//     2. rewrites[]   — answered with the destination's body, URL unchanged
//     3. cleanUrls    — /foo serves foo.html, and /foo.html redirects to /foo
//     4. trailingSlash:false — /foo/ redirects to /foo
//
//   Used by scripts/redirects-resolve.js. Exported so the test can start it on
//   an ephemeral port rather than depending on a server someone remembered to
//   start.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WWW = path.join(ROOT, 'www');

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
};

// Vercel path patterns: :param matches one segment, :param* matches the rest.
function compile(source) {
  const names = [];
  const body = source.replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/:(\w+)\\\*/g, (_, n) => { names.push(n); return '(.*)'; })
    .replace(/:(\w+)\*/g, (_, n) => { names.push(n); return '(.*)'; })
    .replace(/:(\w+)/g, (_, n) => { names.push(n); return '([^/]+)'; });
  return { re: new RegExp('^' + body + '$'), names };
}

function loadRules() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
  const prep = (list) => (list || []).map((r) => ({ ...r, ...compile(r.source) }));
  return { cfg, redirects: prep(cfg.redirects), rewrites: prep(cfg.rewrites) };
}

function expand(destination, match, names) {
  let out = destination;
  names.forEach((n, i) => {
    out = out.split(':' + n + '*').join(match[i + 1] ?? '').split(':' + n).join(match[i + 1] ?? '');
  });
  return out;
}

function firstMatch(rules, pathname) {
  for (const r of rules) {
    const m = pathname.match(r.re);
    if (m) return { rule: r, destination: expand(r.destination, m, r.names) };
  }
  return null;
}

// Resolve a pathname to a file on disk, honouring cleanUrls.
function diskFor(pathname) {
  const rel = decodeURIComponent(pathname).replace(/^\/+/, '');
  const abs = path.join(WWW, rel);
  if (!abs.startsWith(WWW)) return null;                       // no traversal
  if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return abs;
  if (fs.existsSync(abs + '.html')) return abs + '.html';
  const idx = path.join(abs, 'index.html');
  if (fs.existsSync(idx)) return idx;
  return null;
}

export function createServer() {
  const { cfg, redirects, rewrites } = loadRules();

  return http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let pathname = url.pathname;
    const send = (code, headers, body) => { res.writeHead(code, headers); res.end(body); };
    const location = (to, code) => send(code, { Location: to + url.search }, '');

    // trailingSlash:false — /foo/ is not the canonical form of /foo.
    if (cfg.trailingSlash === false && pathname.length > 1 && pathname.endsWith('/')) {
      return location(pathname.replace(/\/+$/, ''), 308);
    }

    // cleanUrls — the .html form redirects to the extensionless one.
    if (cfg.cleanUrls && pathname.endsWith('.html')) {
      const clean = pathname.slice(0, -'.html'.length).replace(/\/index$/, '') || '/';
      if (diskFor(clean)) return location(clean, 308);
    }

    // 1. redirects — a real Location response, exactly as Vercel answers.
    const rd = firstMatch(redirects, pathname);
    if (rd) return location(rd.destination, rd.rule.permanent === false ? 307 : 308);

    // 2. the file itself, if one exists at this path
    let file = diskFor(pathname);

    // 3. rewrites — same URL, different body. External ones are proxied in
    //    production; the test only needs to know the rule fired, so the status
    //    line says so rather than pretending to serve someone else's site.
    if (!file) {
      const rw = firstMatch(rewrites, pathname);
      if (rw) {
        if (/^https?:/.test(rw.destination)) {
          return send(203, { 'content-type': 'text/plain', 'x-proxied-to': rw.destination },
            'external rewrite -> ' + rw.destination);
        }
        file = diskFor(rw.destination);
      }
    }

    if (!file) return send(404, { 'content-type': 'text/plain' }, 'not found: ' + pathname);

    const body = fs.readFileSync(file);
    send(200, {
      'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'content-length': body.length,
    }, body);
  });
}

export function listen(port = 0) {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(port, '127.0.0.1', () => resolve({ server: s, port: s.address().port }));
  });
}
