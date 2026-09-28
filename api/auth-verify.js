// /api/auth-verify — turn a Google ID token into a verified user. Free, and
// with no database behind it.
//
// WHY THIS EXISTS
//   Every project's sign-in broke at once because they all leaned on one
//   Supabase organisation, and that organisation is blocked on an unpaid
//   invoice. Restoring is refused, and even settled, the free plan allows two
//   active projects against eight that need one.
//
//   None of that was ever about Google. Google does not charge for sign-in.
//   Supabase was wrapping an OAuth flow that is free on its own, so the fix is
//   to stop paying an intermediary - in outages, not money - for something
//   Google gives away.
//
// WHAT IT DOES NOT DO
//   No user table, no sessions table, no password storage, nothing to pause and
//   nothing to bill. A Google ID token is a signed JWT that already carries the
//   identity; verifying the signature is the whole job. If an app later needs
//   per-user DATA, that is a storage decision, separate from this one.
//
// WHY VERIFY SERVER-SIDE AT ALL
//   The browser can decode an ID token, but decoding is not verifying - anyone
//   can craft a JWT with any email in it. Only checking the signature against
//   Google's public keys, plus the audience and issuer, makes the claim worth
//   anything. Client-side decode is fine for showing a name; it is not fine for
//   deciding what someone is allowed to see.
//
// SETUP (once, free)
//   1. console.cloud.google.com → APIs & Services → Credentials
//   2. Create OAuth client ID → Web application
//   3. Authorised JavaScript origins: every origin that will sign people in
//      (https://anchit-tandon.com, https://the-third-eye.anchit-tandon.com, …)
//   4. Put the client ID in GOOGLE_CLIENT_ID here, and pass the same value to
//      assets/anchit-auth.js in the browser. The client ID is not a secret.
//
// POST { credential: "<google id token>" } → { ok, user: { sub, email, name, picture } }

// Read at CALL time, not module load. Read once at load, a cold start that
// happens before the env is populated freezes an empty value for the life of
// the instance - and an empty value used to mean "skip the audience check".
const clientId = () => process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || '';

// Google's signing keys rotate. Cache them, but briefly - a key that has been
// retired must stop being trusted, and an hour is the window Google's own
// cache headers suggest.
let jwks = { keys: [], fetchedAt: 0 };
const JWKS_TTL = 60 * 60 * 1000;

async function fetchKeys() {
  const r = await fetch('https://www.googleapis.com/oauth2/v3/certs');
  if (!r.ok) throw new Error('could not fetch Google signing keys');
  jwks = { keys: (await r.json()).keys || [], fetchedAt: Date.now() };
  return jwks.keys;
}

// One in-flight fetch, shared. Without this, N sign-ins arriving together on a
// cold or just-rotated instance are N simultaneous requests to Google for the
// same document, and no throttle below can see them - they are all the same
// first miss.
let inFlight = null;
function fetchKeysOnce() {
  if (!inFlight) inFlight = fetchKeys().finally(() => { inFlight = null; });
  return inFlight;
}

async function getKeys() {
  if (jwks.keys.length && Date.now() - jwks.fetchedAt < JWKS_TTL) return jwks.keys;
  return fetchKeysOnce();
}

// A kid we have never seen is the signal that Google rotated, not that the
// token is bad. Without a refetch, a warm instance holding the previous key set
// rejects every valid login for the rest of the hour-long TTL - an outage that
// starts on its own, affects everyone, and ends on its own, which is close to
// the worst shape a bug can have.
//
// THE THROTTLE IS PER KID. TWO EARLIER SHAPES WERE BOTH WRONG.
//
// 1. One shared timestamp, armed by any miss. That is what shipped, and this
//    endpoint is public: a stream of tokens carrying fabricated kids keeps the
//    single timestamp permanently fresh, so the genuinely rotated kid takes the
//    early return and never refetches. It hands an outsider, on demand, the
//    exact outage the refetch exists to prevent. (Codex, P2 on the Passion
//    Table PR carrying the same code. It is right, and this file was identical.)
//
// 2. A window on cache age. A long one ("only refetch if the set is over a
//    minute old") never fires for the rotation that matters, the one just after
//    a fetch - a test caught that. A short one still refuses every valid login
//    for the length of the window when a rotation lands inside it. Trading a
//    long hole for a short one is not a fix.
//
// So the cooldown is keyed on the kid that missed. One unknown kid can cost one
// refetch; it can never stop a different kid from getting its own. There is no
// shared state left for a forged token to poison.
//
// The residual is that N distinct fabricated kids cost N requests to Google's
// public certs endpoint - a 1:1 fan-out onto a CDN built for exactly that load,
// and strictly cheaper than the N invocations of this function the attacker is
// already paying for. That is an acceptable ceiling; refusing valid sign-ins is
// not.
const MISS_COOLDOWN = 60 * 1000;
// Bounded, because the keys come from the request. Insertion-ordered, and a
// re-noted kid is deleted before being set again, so the first entry is always
// the least recently missed.
const MISS_MAX = 500;
const missed = new Map();

function noteMiss(kid) {
  if (missed.size >= MISS_MAX) missed.delete(missed.keys().next().value);
  missed.delete(kid);
  missed.set(kid, Date.now());
}

async function keyFor(kid) {
  const key = (await getKeys()).find((k) => k.kid === kid);
  if (key) return key;
  const last = missed.get(kid);
  if (last !== undefined && Date.now() - last < MISS_COOLDOWN) return undefined;
  noteMiss(kid);
  return (await fetchKeysOnce()).find((k) => k.kid === kid);
}

const b64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

async function verify(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = JSON.parse(b64url(parts[0]).toString('utf8'));
  const payload = JSON.parse(b64url(parts[1]).toString('utf8'));

  const key = await keyFor(header.kid);
  if (!key) throw new Error('unknown signing key');

  const { createPublicKey, createVerify } = require('node:crypto');
  const pub = createPublicKey({ key, format: 'jwk' });
  const ok = createVerify('RSA-SHA256')
    .update(parts[0] + '.' + parts[1])
    .verify(pub, b64url(parts[2]));
  if (!ok) throw new Error('bad signature');

  // Signature alone is not enough. A token Google signed for SOMEONE ELSE'S app
  // is still validly signed - the audience check is what stops it being replayed
  // here, and it is the check people most often leave out.
  //
  // FAILS CLOSED. This was written as `if (CLIENT_ID && aud !== CLIENT_ID)`,
  // which reads as a sensible "only check when configured" - and means a
  // deployment missing GOOGLE_CLIENT_ID accepts a validly-signed Google token
  // from ANY application on the internet as a login here. A missing environment
  // variable must take sign-in offline, never take the lock off it. Caught by
  // scripts/auth-google.js before this shipped.
  const aud = clientId();
  if (!aud) throw new Error('GOOGLE_CLIENT_ID is not configured on this deployment');
  if (payload.aud !== aud) throw new Error('token was not issued for this app');
  if (!['https://accounts.google.com', 'accounts.google.com'].includes(payload.iss)) {
    throw new Error('wrong issuer');
  }
  if (payload.exp * 1000 < Date.now()) throw new Error('token expired');
  if (payload.email && payload.email_verified === false) throw new Error('email not verified');

  return {
    sub: payload.sub,
    email: payload.email || '',
    name: payload.name || '',
    picture: payload.picture || '',
    exp: payload.exp,
  };
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'content-type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  // A health check that reveals whether it is configured, and nothing else.
  // The client ID is public by design; it still is not echoed here, because a
  // status endpoint should not become a way to enumerate configuration.
  if (req.method === 'GET') {
    // The client id is returned, not just a boolean. It is public by design -
    // there is no client secret in this flow - and a browser has no other way
    // to get it: a server-side environment variable cannot reach a static
    // <script> tag, which is exactly why auth-demo.html rendered "not
    // configured" no matter what was set in Vercel.
    return res.status(200).json({ ok: true, configured: Boolean(clientId()), clientId: clientId() });
  }
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'POST a credential' });

  try {
    let body = req.body;
    if (typeof body === 'string') body = JSON.parse(body || '{}');
    const user = await verify((body || {}).credential);
    return res.status(200).json({ ok: true, user });
  } catch (e) {
    // Deliberately vague to the caller, specific in the log. "Which check
    // failed" is useful to an attacker and useless to an honest user.
    console.error('[auth-verify]', e && e.message);
    return res.status(401).json({ ok: false, error: 'sign-in could not be verified' });
  }
};

// Test hook. The key cache and the miss cooldown are module state, so a suite
// that probes a forged kid leaves the cooldown armed for the next case - which
// made the rotation test fail for the suite's own reasons rather than the
// code's. Production never calls this.
module.exports._resetKeyCache = () => { jwks = { keys: [], fetchedAt: 0 }; inFlight = null; missed.clear(); };
