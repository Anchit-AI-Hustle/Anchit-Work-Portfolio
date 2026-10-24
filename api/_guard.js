// Inbound guard for the routes that spend money: a per-IP rate limit and an
// origin allow-list, in one place so the six that had neither cannot drift
// apart from the one that did.
//
// WHY THIS EXISTS
//   Every LLM-calling route answered any caller, from any origin, at any rate,
//   with Access-Control-Allow-Origin: *. A single unauthenticated POST to
//   /api/cascade from an unrelated origin returned 18KB of generated content
//   in 25 seconds. That makes this site a free, public proxy for the API keys
//   behind it, and the bill is the owner's.
//
// WHAT EACH HALF ACTUALLY STOPS — they are not the same thing, and neither is
// a substitute for the other:
//
//   The origin list stops a BROWSER on someone else's site calling these.
//   It does nothing to curl: CORS is enforced by browsers, and a request with
//   no Origin header is indistinguishable from a server-to-server call. The
//   repo's own scripts/ suites are exactly that, which is why a missing
//   Origin is allowed rather than refused.
//
//   The rate limit is what actually caps the bill, because it does not care
//   who is asking. It is the real defence here.
//
// HONEST LIMITATION, inherited from the counter in chat.js that this
// generalises: serverless instances do not share memory, so a caller is
// capped per warm instance rather than globally. It stops casual hammering
// and a loose script; a distributed flood needs a shared store (Vercel KV or
// Upstash). Worth adding if this ever takes real traffic.

const ALLOW_SUFFIX = ['anchit-tandon.com'];
const ALLOW_EXACT = ['http://localhost:3000', 'http://localhost:8099', 'http://127.0.0.1:8099'];

function originAllowed(origin) {
  if (!origin) return true;                     // no Origin: not a browser page
  if (ALLOW_EXACT.includes(origin)) return true;
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  // Vercel gives every deployment its own hostname; previews of this project
  // are ours and must keep working.
  if (/\.vercel\.app$/.test(host)) return true;
  return ALLOW_SUFFIX.some((s) => host === s || host.endsWith('.' + s));
}

function clientKey(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim();
  return ip || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;
const buckets = new Map();                       // route -> Map(ip -> timestamps)

function rateLimited(req, route, max) {
  let hits = buckets.get(route);
  if (!hits) { hits = new Map(); buckets.set(route, hits); }
  const key = clientKey(req);
  const now = Date.now();
  const seen = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  seen.push(now);
  hits.set(key, seen);

  if (hits.size > MAX_KEYS) {                    // bound it; a map that only grows is its own outage
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
      if (hits.size <= MAX_KEYS) break;
    }
  }
  return seen.length > max;
}

/**
 * Set CORS, answer the preflight, and apply the limit.
 * Returns true when the response is already finished and the handler must stop.
 *
 *   if (guard(req, res, { route: 'cascade', max: 6, methods: 'GET, POST, OPTIONS' })) return;
 */
function guard(req, res, { route, max, methods = 'POST, OPTIONS' }) {
  const origin = req.headers.origin;
  const ok = originAllowed(origin);

  // Echo the caller's origin rather than '*', so the allow-list means
  // something and credentials stay possible later.
  if (ok && origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', methods);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(ok ? 200 : 403).end(); return true; }

  if (!ok) {
    res.status(403).json({ error: 'origin_not_allowed' });
    return true;
  }
  // Every method but the preflight counts. GET is not automatically cheap:
  // /api/step-video takes its query from the query string, so a GET there
  // spends exactly what a POST does.
  if (rateLimited(req, route, max)) {
    res.setHeader('Retry-After', '60');
    res.status(429).json({ error: 'rate_limited', message: 'Too many requests. Try again in a minute.' });
    return true;
  }
  return false;
}

module.exports = { guard, originAllowed, rateLimited, clientKey };
