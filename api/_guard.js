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
//   repo's own scripts/ suites are exactly that. A missing Origin is allowed
//   on a GET (browsers omit it on same-origin GETs) but refused on a POST
//   that came over the network: see guard() below.
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
const VERCEL_TEAM_HOST = 'anchit-ai-hustle.vercel.app';
const ALLOW_EXACT = ['http://localhost:3000', 'http://localhost:8099', 'http://127.0.0.1:8099'];

function originAllowed(origin) {
  if (!origin) return true;                     // no Origin: not a browser page
  if (ALLOW_EXACT.includes(origin)) return true;
  let host;
  try { host = new URL(origin).hostname; } catch { return false; }
  // Vercel previews, but OURS. vercel.app is a shared multi-tenant suffix:
  // matching it accepted any stranger's deployment, which handed the origin
  // check back to anyone willing to deploy on Vercel. The generated hostname
  // ends in the TEAM slug, and another team cannot mint ours.
  if (host === VERCEL_TEAM_HOST || host.endsWith('-' + VERCEL_TEAM_HOST)) return true;
  return ALLOW_SUFFIX.some((s) => host === s || host.endsWith('.' + s));
}

function clientKey(req) {
  const h = req.headers || {};
  const fwd = h['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim();
  return ip || h['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
}

const WINDOW_MS = 60_000;
const MAX_KEYS = 5_000;
const buckets = new Map();                       // route -> Map(ip -> timestamps)

function rateLimited(req, route, max) {
  // An unidentifiable caller is not a caller. Vercel's proxy sets
  // x-forwarded-for on every request that arrives over the internet, so a
  // request with no address at all is a handler being invoked directly - the
  // repo's own e2e suites do exactly that, and bucketing them together under
  // 'unknown' made the seventh assertion in a file fail as rate-limited.
  // Nothing reachable from outside can strip the header, so this is not a way
  // in: it only exempts calls that never crossed the network.
  if (clientKey(req) === 'unknown') return false;

  let hits = buckets.get(route);
  if (!hits) { hits = new Map(); buckets.set(route, hits); }
  const key = clientKey(req);
  const now = Date.now();
  const seen = (hits.get(key) || []).filter((t) => now - t < WINDOW_MS);
  // Stop recording once the window is already full. Appending first meant a
  // sustained flood from one address grew its own bucket without bound, and
  // each refusal cost more than the last.
  if (seen.length >= max) { hits.set(key, seen); return true; }
  seen.push(now);
  hits.set(key, seen);

  if (hits.size > MAX_KEYS) {                    // bound it; a map that only grows is its own outage
    for (const [k, v] of hits) {
      if (!v.length || now - v[v.length - 1] > WINDOW_MS) hits.delete(k);
      if (hits.size <= MAX_KEYS) break;
    }
  }
  return false;
}

/**
 * Set CORS, answer the preflight, and apply the limit.
 * Returns true when the response is already finished and the handler must stop.
 *
 *   if (guard(req, res, { route: 'cascade', max: 6, methods: 'GET, POST, OPTIONS' })) return;
 */
function guard(req, res, { route, max, methods = 'POST, OPTIONS' }) {
  const origin = (req.headers || {}).origin;
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
  // A browser always sends Origin on a POST, same-origin included, so a POST
  // that crossed the network without one is a script. Refusing it does not
  // stop a determined caller (Origin is forgeable outside a browser), but it
  // stops every copy-pasted curl from spending the owner's keys. Handlers
  // invoked directly (no address, the repo's own suites) are unaffected.
  if (req.method === 'POST' && !origin && clientKey(req) !== 'unknown') {
    res.status(403).json({ error: 'origin_required' });
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

// Outbound guard for the one route that fetches a URL the caller chose
// (/api/apply reads a portfolio page). Without it the function would fetch
// anything it can reach - loopback, the private network, cloud metadata - on
// behalf of anyone. A URL passes only if it is http(s), carries no
// credentials, and every address its host resolves to is public.
//
// HONEST LIMITATION: the address is checked, then fetched, so a host that
// changes its DNS answer between the two (rebinding) can still slip through.
// Callers also refuse redirects, which closes the easier version of that.
const net = require('net');
const dns = require('dns').promises;

function privateAddress(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  }
  if (net.isIPv6(ip)) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return privateAddress(mapped[1]);
    return s === '::' || s === '::1' || /^(fc|fd|fe[89ab])/.test(s) || /^::ffff:/.test(s);
  }
  return true;                                   // not an address at all: refuse
}

async function publicHttpUrl(raw, lookup = dns.lookup) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return false;
  if (u.username || u.password) return false;
  const host = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!host || host === 'localhost' || /\.(localhost|local|internal)$/.test(host)) return false;
  if (net.isIP(host)) return !privateAddress(host);
  try {
    const addrs = await lookup(host, { all: true });
    return addrs.length > 0 && addrs.every((a) => !privateAddress(a.address));
  } catch { return false; }
}

module.exports = { guard, originAllowed, rateLimited, clientKey, publicHttpUrl };
