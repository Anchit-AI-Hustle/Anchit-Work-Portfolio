// The free Google sign-in actually verifies, and actually refuses.
//
// WHY THIS SUITE EXISTS
//   Auth is the one thing on this site where "it looks signed in" and "it IS
//   signed in" are different states, and only the second matters. A client-side
//   decode of a Google ID token shows a name and an email and proves nothing:
//   anyone can mint a JWT with any email in it. So these checks are all about
//   REFUSAL - the paths where a forged or foreign token must not be accepted.
//
//   The previous setup failed for a reason no test could catch: eight apps
//   shared one Supabase organisation, and that organisation was blocked on an
//   unpaid invoice. This replacement has no shared account to lose.
//
// Run:  node scripts/auth-google.js
const path = require('path');
const ROOT = path.join(__dirname, '..');
const verify = require(path.join(ROOT, 'api', 'auth-verify.js'));
const { generateKeyPairSync, createSign } = require('node:crypto');

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

// A local key pair standing in for Google's, so the refusal paths can be driven
// without the network. The signature checks are exercised for real; only the
// source of the key is swapped.
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
jwk.kid = 'test-key'; jwk.alg = 'RS256'; jwk.use = 'sig';

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(payload, { kid = 'test-key', key = privateKey } = {}) {
  const head = b64({ alg: 'RS256', kid });
  const body = b64(payload);
  const sig = createSign('RSA-SHA256').update(head + '.' + body).sign(key).toString('base64url');
  return head + '.' + body + '.' + sig;
}
const base = (over = {}) => Object.assign({
  iss: 'https://accounts.google.com',
  aud: 'test-client-id.apps.googleusercontent.com',
  sub: '1234567890',
  email: 'anchit@example.com',
  email_verified: true,
  name: 'Anchit Tandon',
  exp: Math.floor(Date.now() / 1000) + 3600,
}, over);

process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
global.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });

function res() {
  const r = { code: 0, body: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.code = c; return r; };
  r.json = (b) => { r.body = b; return r; };
  r.end = () => r;
  return r;
}
const post = async (credential) => {
  const r = res();
  await verify({ method: 'POST', body: { credential } }, r);
  return r;
};

(async () => {
  let r = await post(token(base()));
  check('a valid Google token signs the user in', r.code === 200 && r.body.ok && r.body.user.email === 'anchit@example.com',
    r.code + ' ' + (r.body.user ? r.body.user.email : r.body.error));

  // The check people leave out. A token Google signed for a DIFFERENT app is
  // validly signed; without the audience check it would be accepted here.
  r = await post(token(base({ aud: 'someone-elses-app.apps.googleusercontent.com' })));
  check('a token issued for another app is refused', r.code === 401, r.code + ' ' + (r.body.error || 'ACCEPTED'));

  const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  r = await post(token(base(), { key: other }));
  check('a forged signature is refused', r.code === 401, r.code + ' ' + (r.body.error || 'ACCEPTED'));

  r = await post(token(base({ exp: Math.floor(Date.now() / 1000) - 60 })));
  check('an expired token is refused', r.code === 401, r.code + ' ' + (r.body.error || 'ACCEPTED'));

  r = await post(token(base({ iss: 'https://evil.example.com' })));
  check('a token from the wrong issuer is refused', r.code === 401, r.code + ' ' + (r.body.error || 'ACCEPTED'));

  r = await post(token(base({ email_verified: false })));
  check('an unverified email is refused', r.code === 401, r.code + ' ' + (r.body.error || 'ACCEPTED'));

  r = await post(token(base(), { kid: 'not-a-google-key' }));
  check('an unknown signing key is refused', r.code === 401, r.code + ' ' + (r.body.error || 'ACCEPTED'));

  r = await post('not-a-jwt');
  check('a malformed token is refused', r.code === 401, r.code + ' ' + (r.body.error || 'ACCEPTED'));

  // The error returned to the caller must not say WHICH check failed.
  const vague = ['sign-in could not be verified'];
  const leaks = [];
  for (const t of [token(base({ aud: 'x' })), token(base(), { key: other }), 'not-a-jwt']) {
    const rr = await post(t);
    if (rr.body && rr.body.error && !vague.includes(rr.body.error)) leaks.push(rr.body.error);
  }
  check('failures do not reveal which check failed', leaks.length === 0, leaks.join(' | ') || 'one generic message');

  // Key rotation. A kid the cache has never seen means Google rotated, not that
  // the token is forged - and a warm instance that refuses to refetch rejects
  // every valid login until its hour-long TTL expires. Simulated by swapping
  // the key set Google serves AFTER the first verification has warmed the cache.
  const rotated = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const rotatedJwk = rotated.publicKey.export({ format: 'jwk' });
  rotatedJwk.kid = 'rotated-key'; rotatedJwk.alg = 'RS256'; rotatedJwk.use = 'sig';

  // Clear the cooldown the forged-kid cases above armed, then warm the cache
  // with the OLD key set so the rotation is the only thing under test.
  verify._resetKeyCache();
  await post(token(base()));
  global.fetch = async () => ({ ok: true, json: async () => ({ keys: [rotatedJwk] }) });
  r = await post(token(base(), { kid: 'rotated-key', key: rotated.privateKey }));
  check('a token signed with a rotated key still verifies', r.code === 200,
    r.code === 200 ? 'refetched and accepted' : 'REJECTED A VALID TOKEN AFTER ROTATION');

  // ...but a genuinely unknown kid is still refused, refetch or not.
  verify._resetKeyCache();
  global.fetch = async () => ({ ok: true, json: async () => ({ keys: [rotatedJwk] }) });
  r = await post(token(base(), { kid: 'never-existed' }));
  check('an unknown key is still refused after a refetch', r.code === 401,
    r.code + ' ' + (r.body.error || 'ACCEPTED'));

  global.fetch = async () => ({ ok: true, json: async () => ({ keys: [jwk] }) });

  // No secret is needed in the browser, and none is shipped there.
  // Strip comments first. The header explains WHY there is no password flow, and
  // matching that prose reported a leak in a file that has none - a check that
  // fails on its own documentation gets deleted rather than fixed.
  const client = require('fs').readFileSync(path.join(ROOT, 'assets', 'anchit-auth.js'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const secrets = client.match(/CLIENT_SECRET|api[_-]?key\s*[:=]|\.password\b|type=["']password["']/gi) || [];
  check('the browser file carries no secret and no password flow',
    secrets.length === 0, secrets.length ? secrets.join(', ') : 'client is public by design');

  // A deployment with no client id must refuse everything rather than accept
  // anything. Verified by clearing the env, not by reading the code.
  const saved = process.env.GOOGLE_CLIENT_ID;
  delete process.env.GOOGLE_CLIENT_ID; delete process.env.GOOGLE_OAUTH_CLIENT_ID;
  const unconfigured = await post(token(base()));
  process.env.GOOGLE_CLIENT_ID = saved;
  check('an unconfigured deployment refuses every token', unconfigured.code === 401,
    unconfigured.code + ' ' + (unconfigured.body.error || 'ACCEPTED A TOKEN WITH NO AUDIENCE CHECK'));

  for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(52) + (d || ''));
  const pass = results.filter((x) => x[0] === 'PASS').length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  process.exit(pass === results.length ? 0 : 1);
})();
