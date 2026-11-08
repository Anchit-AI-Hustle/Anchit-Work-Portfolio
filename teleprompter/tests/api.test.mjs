// API acceptance tests. Usage: node api.test.mjs [baseUrl]
const BASE = process.argv[2] || 'http://localhost:8787';
const IP = '10.' + [1, 2, 3].map(() => Math.floor(Math.random() * 250)).join('.');
let pass = 0, fail = 0; const log = [];
function ok(cond, name, extra) { (cond ? pass++ : fail++); log.push((cond ? 'PASS ' : 'FAIL ') + name + (extra && !cond ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); }
const rndPhone = () => '+919' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
async function api(method, path, body, cookie, headers = {}) {
  const r = await fetch(BASE + '/api/' + path, { method, headers: { 'Content-Type': 'application/json', 'x-pc': '1', 'x-test-ip': IP, ...(cookie ? { cookie } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer());
  return { s: r.status, d: data, cookie: sc ? sc.split(';')[0] : null, ct };
}
const t0 = Date.now();
let r = await api('GET', 'health'); ok(r.s === 200 && r.d.db === true, 'health + db reachable', r);
r = await api('POST', 'auth/signup', { phone: '12345', pin: '4829' }); ok(r.s === 400, 'signup rejects bad phone', r);
r = await api('POST', 'auth/signup', { phone: '+915123456789', pin: '4829' }); ok(r.s === 400, 'signup rejects Indian number not starting 6-9', r);
r = await api('POST', 'auth/signup', { phone: rndPhone(), pin: '1234' }); ok(r.s === 400 && /easy/.test(r.d.error), 'signup rejects weak PIN', r);
r = await api('POST', 'auth/signup', { phone: rndPhone(), pin: '12a4' }); ok(r.s === 400, 'signup rejects non-numeric PIN', r);
const A = rndPhone(), B = rndPhone();
r = await fetch(BASE + '/api/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: A, pin: '4829' }) });
ok(r.status === 403, 'write without x-pc header blocked (CSRF guard)', r.status);
r = await api('POST', 'auth/signup', { phone: A.slice(0, 3) + ' ' + A.slice(3, 8) + '-' + A.slice(8), pin: '4829', name: '  Test   User ' });
ok(r.s === 201 && /^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(r.d.recoveryCode) && r.cookie, 'signup ok, recovery code + cookie (spaces/dashes in phone normalised)', r);
let cA = r.cookie; const recA = r.d.recoveryCode; ok(r.d.user && r.d.user.phone === A && r.d.user.name === 'Test User', 'phone stored E.164, name trimmed', r.d.user);
r = await api('POST', 'auth/signup', { phone: A, pin: '5830' }); ok(r.s === 409, 'duplicate signup 409', r);
r = await api('GET', 'me', null, cA); ok(r.s === 200 && r.d.user && r.d.user.phone === A, 'me with cookie', r);
r = await api('GET', 'me'); ok(r.s === 200 && r.d.user === null, 'me without cookie -> null', r);
r = await api('GET', 'me', null, cA.replace(/.$/, c => c === 'A' ? 'B' : 'A')); ok(r.d.user === null, 'tampered cookie rejected', r);
r = await api('GET', 'scripts'); ok(r.s === 401, 'scripts require auth', r);
r = await api('GET', 'scripts', null, cA); ok(r.s === 200 && r.d.scripts.length === 1 && r.d.scripts[0].words > 50, 'welcome script seeded with word count', r.d);
r = await api('POST', 'scripts', { title: '  My  reel ', body: 'one two three', settings: { wpm: 150, fontSize: 48 } }, cA);
ok(r.s === 201 && r.d.script.title === 'My reel' && r.d.script.settings.wpm === 150, 'create script', r); const sid = r.d.script?.id;
r = await api('PATCH', 'scripts/' + sid, { body: 'one two three four', settings: { wpm: 170, bg: { mode: 'blur' } } }, cA);
ok(r.s === 200 && r.d.script.body.endsWith('four') && r.d.script.settings.bg.mode === 'blur', 'update script body + settings', r);
r = await api('GET', 'scripts', null, cA); ok(r.d.scripts[0].id === sid && r.d.scripts[0].words === 4, 'list sorted by updated desc, words=4', r.d.scripts.map(s => [s.title, s.words]));
r = await api('PATCH', 'scripts/' + sid, { settings: [1, 2] }, cA); ok(r.s === 400, 'settings must be object', r);
r = await api('PATCH', 'scripts/' + sid, { body: 'x'.repeat(100001) }, cA); ok(r.s === 400, 'body length limit', r);
r = await api('GET', 'scripts/not-a-uuid', null, cA); ok(r.s === 404, 'bad id 404', r);
// second user isolation
r = await api('POST', 'auth/signup', { phone: B, pin: '7391' }); const cB = r.cookie; ok(r.s === 201, 'second user signup', r);
r = await api('GET', 'scripts/' + sid, null, cB); ok(r.s === 404, 'user B cannot read A script', r);
r = await api('PATCH', 'scripts/' + sid, { title: 'pwn' }, cB); ok(r.s === 404, 'user B cannot edit A script', r);
r = await api('DELETE', 'scripts/' + sid, null, cB); ok(r.s === 404, 'user B cannot delete A script', r);
// login + lockout
r = await api('POST', 'auth/login', { phone: A, pin: '4829' }); ok(r.s === 200 && r.cookie, 'login ok', r);
r = await api('POST', 'auth/login', { phone: rndPhone(), pin: '4829' }); ok(r.s === 401 && r.d.error === 'Mobile number or PIN is incorrect', 'unknown number generic error', r);
let last;
for (let i = 1; i <= 5; i++) { last = await api('POST', 'auth/login', { phone: A, pin: '0001' }); if (i === 1) ok(last.s === 401 && last.d.attemptsLeft === 4, 'wrong PIN -> 401 attemptsLeft=4', last); }
ok(last.s === 423, '5th wrong PIN locks account', last);
r = await api('POST', 'auth/login', { phone: A, pin: '4829' }); ok(r.s === 423, 'correct PIN refused while locked', r);
// reset via recovery code
r = await api('POST', 'auth/reset', { phone: A, recoveryCode: 'AAAAA-AAAAA', newPin: '6150' }); ok(r.s === 401, 'reset with wrong recovery code', r);
r = await api('POST', 'auth/reset', { phone: A, recoveryCode: recA.toLowerCase().replace('-', ' '), newPin: '6150' });
ok(r.s === 200 && r.d.recoveryCode && r.d.recoveryCode !== recA, 'reset with recovery code (case/format tolerant) issues new code', r);
const cA2 = r.cookie; const recA2 = r.d.recoveryCode;
r = await api('GET', 'me', null, cA); ok(r.d.user === null, 'old session invalid after PIN reset', r);
r = await api('GET', 'me', null, cA2); ok(r.d.user && r.d.user.phone === A, 'new session valid', r);
r = await api('POST', 'auth/login', { phone: A, pin: '6150' }); ok(r.s === 200, 'login with new PIN (lock cleared)', r); cA = r.cookie;
r = await api('POST', 'auth/reset', { phone: A, recoveryCode: recA, newPin: '7777' }); ok(r.s === 400 || r.s === 401, 'old recovery code no longer works', r);
r = await api('POST', 'auth/reset', { phone: A, recoveryCode: recA2.replace('-', ''), newPin: '7777' }); ok(r.s === 400, 'weak new PIN rejected on reset', r);
// change PIN / recovery / prefs
r = await api('POST', 'me/pin', { currentPin: '0000', newPin: '3958' }, cA); ok(r.s === 401, 'change PIN needs current PIN', r);
r = await api('POST', 'me/pin', { currentPin: '6150', newPin: '3958' }, cA); ok(r.s === 200 && r.cookie, 'change PIN ok', r); cA = r.cookie;
r = await api('POST', 'me/recovery', { pin: '3958' }, cA); ok(r.s === 200 && r.d.recoveryCode, 'regenerate recovery code', r);
r = await api('PATCH', 'me', { name: 'Renamed', prefs: { fontSize: 56, theme: 'x' } }, cA); ok(r.s === 200 && r.d.user.prefs.fontSize === 56 && r.d.user.name === 'Renamed', 'update name + default prefs', r);
// backgrounds
const png1x1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
r = await api('POST', 'backgrounds', { name: 'Dot', dataUrl: 'data:image/png;base64,' + png1x1 }, cA); ok(r.s === 201 && r.d.background.bytes > 0, 'upload background', r); const bid = r.d.background?.id;
r = await api('POST', 'backgrounds', { dataUrl: 'data:text/html;base64,PGh0bWw+' }, cA); ok(r.s === 400, 'non-image background rejected', r);
r = await api('GET', 'backgrounds', null, cA); ok(r.d.backgrounds.length === 1 && !('data_b64' in r.d.backgrounds[0]), 'list backgrounds (no payload)', r);
r = await api('GET', 'backgrounds/' + bid, null, cA); ok(r.s === 200 && r.ct === 'image/png' && r.d.length === 70, 'fetch background bytes', { s: r.s, ct: r.ct, len: r.d.length });
r = await api('GET', 'backgrounds/' + bid, null, cB); ok(r.s === 404, 'user B cannot fetch A background', r);
r = await api('DELETE', 'backgrounds/' + bid, null, cA); ok(r.s === 200, 'delete background', r);
r = await api('DELETE', 'scripts/' + sid, null, cA); ok(r.s === 200, 'delete script', r);
r = await api('POST', 'auth/logout', null, cA); ok(r.s === 200 && /Max-Age=0/.test('Max-Age=0'), 'logout', r);
// cleanup: delete accounts
r = await api('DELETE', 'me', { pin: '0000' }, cA); ok(r.s === 401, 'delete account needs PIN', r);
r = await api('DELETE', 'me', { pin: '3958' }, cA); ok(r.s === 200, 'delete account A', r);
r = await api('GET', 'me', null, cA); ok(r.d.user === null, 'deleted account session dead', r);
r = await api('DELETE', 'me', { pin: '7391' }, cB); ok(r.s === 200, 'delete account B', r);
// ---- regression tests for review findings ----
// Regression block needs direct DB access: set PC_DB_URL (unpooled Neon URL). Skipped otherwise.
const DBURL = process.env.PC_DB_URL;
async function dbq(sql) { const host = new URL(DBURL).host; const r = await fetch(`https://${host}/sql`, { method: 'POST', headers: { 'Neon-Connection-String': DBURL, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql, params: [] }) }); return JSON.stringify(await r.json()); }
if (DBURL) {
const C = rndPhone();
r = await api('POST', 'auth/signup', { phone: C, pin: '5829' }); let cC = r.cookie; ok(r.s === 201, 'R: signup C');
const par = await Promise.all(Array.from({ length: 15 }, () => api('POST', 'auth/login', { phone: C, pin: '0002' })));
const counts = par.reduce((m, x) => (m[x.s] = (m[x.s] || 0) + 1, m), {});
const fc = JSON.parse(await dbq(`select failed_count, locked_until is not null as locked from users where phone='${C}'`)).rows[0];
ok(fc.failed_count <= 5 && fc.locked === true, 'R: 15 parallel wrong PINs -> at most 5 counted, account locked', { counts, fc });
r = await api('POST', 'auth/login', { phone: C, pin: '5829' }); ok(r.s === 423, 'R: correct PIN refused after parallel attack lock', r);
await dbq(`update users set locked_until = now() - interval '1 second' where phone='${C}'`);
r = await api('POST', 'auth/login', { phone: C, pin: '0003' }); ok(r.s === 401 && r.d.attemptsLeft === 4, 'R: expired lock resets counter (1 wrong PIN does not relock)', r);
r = await api('POST', 'auth/login', { phone: C, pin: '5829' }); ok(r.s === 200, 'R: login after lock expiry', r); cC = r.cookie;
for (let i = 0; i < 5; i++) r = await api('POST', 'me/recovery', { pin: '0004' }, cC);
ok(r.s === 423, 'R: PIN guessing on signed-in endpoint is locked after 5 tries', r);
r = await api('POST', 'me/recovery', { pin: '5829' }, cC); ok(r.s === 423, 'R: locked even with correct PIN on signed-in endpoint', r);
r = await api('GET', 'me', null, 'pc_session=1.1.9999999999.' + 'é'.repeat(43)); ok(r.s === 200 && r.d.user === null, 'R: non-ASCII cookie signature -> no 500', r);
await dbq(`delete from users where phone='${C}'`);
}
console.log(log.join('\n')); console.log(`\n${pass} passed, ${fail} failed in ${((Date.now() - t0) / 1000).toFixed(1)}s against ${BASE}`);
process.exit(fail ? 1 : 0);
