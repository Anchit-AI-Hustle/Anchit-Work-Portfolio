// What api/_guard.js lets through, and what it turns away.
//
// These run with nothing installed and no network: the guard is pure, which
// is the point — the thing standing between the API keys and the open
// internet should be checkable without deploying it first.
const { guard, originAllowed } = require('../api/_guard.js');

let pass = 0, fail = 0;
function is(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  ok ? pass++ : fail++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${ok ? '' : `\n        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`}`);
}

function call(origin, ip, method = 'POST', route = 't', max = 6) {
  const res = {
    code: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    status(c) { this.code = c; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  const req = { method, headers: { origin, 'x-forwarded-for': ip }, socket: {} };
  const stopped = guard(req, res, { route, max, methods: 'POST, OPTIONS' });
  return { stopped, code: res.code, acao: res.headers['access-control-allow-origin'] || null, err: (res.body || {}).error || null };
}

const OURS = 'https://anchit-tandon.com';
const PASSES = { stopped: false, code: 0, acao: OURS, err: null };

console.log('api guard');
is('our own origin is allowed, and echoed back rather than *', call(OURS, '1.1.1.1'), PASSES);
is('a subdomain of ours is allowed', call('https://ai-tele-suite.anchit-tandon.com', '1.1.1.2'),
   { stopped: false, code: 0, acao: 'https://ai-tele-suite.anchit-tandon.com', err: null });
is('a domain we do not own is refused, even one named for this site', originAllowed('https://ayushi-rawat.app'), false);
is('a Vercel preview of OURS is allowed', originAllowed('https://anchit-work-portfolio-git-x-anchit-ai-hustle.vercel.app'), true);
is("someone else's vercel.app deployment is NOT", originAllowed('https://evil-project-abc123-someone-else.vercel.app'), false);
is('a bare vercel.app is not', originAllowed('https://vercel.app'), false);
is('no Origin at all is allowed: that is a script, not a page', call(undefined, '1.1.1.3'),
   { stopped: false, code: 0, acao: null, err: null });
is('another site is refused', call('https://not-anchits-site.example', '1.1.1.4'),
   { stopped: true, code: 403, acao: null, err: 'origin_not_allowed' });
is('a host that merely STARTS with ours is refused', call('https://anchit-tandon.com.evil.com', '1.1.1.5'),
   { stopped: true, code: 403, acao: null, err: 'origin_not_allowed' });
is('an unparseable Origin is refused', originAllowed('garbage'), false);
is('our preflight answers 200', call(OURS, '1.1.1.6', 'OPTIONS'), { stopped: true, code: 200, acao: OURS, err: null });
is('a foreign preflight answers 403', call('https://evil.example', '1.1.1.7', 'OPTIONS'),
   { stopped: true, code: 403, acao: null, err: null });

let last;
for (let i = 0; i < 6; i++) last = call(OURS, '9.9.9.9', 'POST', 'rl', 6);
is('the 6th call within the minute still passes', last, PASSES);
is('the 7th is refused with 429', call(OURS, '9.9.9.9', 'POST', 'rl', 6),
   { stopped: true, code: 429, acao: OURS, err: 'rate_limited' });
is('another caller is unaffected by that one', call(OURS, '8.8.8.8', 'POST', 'rl', 6), PASSES);
is('another route is unaffected by that one', call(OURS, '9.9.9.9', 'POST', 'rl2', 6), PASSES);
// GET is not exempt: /api/step-video takes its query from the query string.
for (let i = 0; i < 6; i++) call(OURS, '7.7.7.7', 'GET', 'rlget', 6);
is('a GET is counted too', call(OURS, '7.7.7.7', 'GET', 'rlget', 6),
   { stopped: true, code: 429, acao: OURS, err: 'rate_limited' });

// A handler can be invoked directly by a test harness, with no headers at all.
// Reading req.headers.origin on one of those threw and took test:auth down.
is('a request with no headers object does not throw', (() => {
  const res = { code: 0, headers: {}, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
  try { guard({ method: 'POST', socket: {} }, res, { route: 'noheaders', max: 6 }); return 'no throw'; }
  catch (e) { return 'threw: ' + e.message; }
})(), 'no throw');

// A handler invoked directly, with no address, is not a caller over the
// network - the repo's own e2e suites call handlers that way.
is('a call with no client address is never limited', (() => {
  const { rateLimited } = require('../api/_guard.js');
  const req = { headers: {}, socket: {} };
  for (let i = 0; i < 50; i++) rateLimited(req, 'direct', 3);
  return rateLimited(req, 'direct', 3);
})(), false);

// The bucket must not grow while it refuses: a flood was making each later
// refusal more expensive than the last.
is('a flood does not grow its own bucket', (() => {
  const { rateLimited } = require('../api/_guard.js');
  const req = { headers: { 'x-forwarded-for': '6.6.6.6' }, socket: {} };
  for (let i = 0; i < 500; i++) rateLimited(req, 'flood', 5);
  // 5 recorded and no more, however long the flood runs
  return rateLimited(req, 'flood', 5);
})(), true);

// /api/apply fetched any URL a caller sent, from inside the function, and ran
// open with no rate limit. These pin both halves of the fix. DNS is injected,
// so nothing here touches the network.
(async () => {
  const { publicHttpUrl } = require('../api/_guard.js');
  const resolvesTo = (ip) => async () => [{ address: ip, family: ip.includes(':') ? 6 : 4 }];
  const pub = resolvesTo('93.184.216.34');
  const cases = [
    ['a public https page is fetchable', 'https://example.com/cv', pub, true],
    ['loopback is not', 'http://127.0.0.1/', pub, false],
    ['cloud metadata is not', 'http://169.254.169.254/latest/meta-data/', pub, false],
    ['a private range is not', 'http://10.1.2.3/', pub, false],
    ['localhost by name is not', 'http://localhost:3000/', pub, false],
    ['IPv6 loopback is not', 'http://[::1]/', pub, false],
    ['IPv4 mapped into IPv6 is not', 'http://[::ffff:127.0.0.1]/', pub, false],
    ['a decimal-encoded loopback is not', 'http://2130706433/', pub, false],
    ['a public name that resolves to a private address is not', 'https://sneaky.example/', resolvesTo('192.168.1.5'), false],
    ['a file: URL is not', 'file:///etc/passwd', pub, false],
    ['credentials in the URL are not', 'https://user:pw@example.com/', pub, false],
    ['a name that does not resolve is not', 'https://nope.invalid/', async () => { throw new Error('ENOTFOUND'); }, false],
  ];
  for (const [label, url, lookup, want] of cases) is(label, await publicHttpUrl(url, lookup), want);

  const apply = require('../api/apply.js');
  // An empty result proves nothing on its own: from a sandbox the metadata
  // address simply fails to connect. What matters is that no request is made.
  const realFetch = globalThis.fetch;
  const asked = [];
  globalThis.fetch = async (u) => { asked.push(String(u)); return new Response('<p>cv</p>'); };
  await apply._test.fetchProfileFromUrl('http://169.254.169.254/latest/meta-data/');
  await apply._test.fetchProfileFromUrl('http://127.0.0.1:8080/');
  is('apply never requests an internal URL', asked, []);
  await apply._test.fetchProfileFromUrl('http://93.184.216.34/cv');
  is('apply still fetches a public one', asked, ['http://93.184.216.34/cv']);
  globalThis.fetch = realFetch;

  const run = async (ip) => {
    const res = { code: 0, body: null, setHeader() {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, end() { return this; } };
    await apply({ method: 'POST', headers: { 'x-forwarded-for': ip }, socket: {}, body: {} }, res);
    return res.code;
  };
  const codes = [];
  for (let i = 0; i < 5; i++) codes.push(await run('5.5.5.5'));
  is('apply is rate-limited: the 5th call in a minute is refused', codes[4], 429);
  is('apply serves the first four', codes.slice(0, 4).every((c) => c !== 429), true);

  console.log(`\n  ${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
})();
