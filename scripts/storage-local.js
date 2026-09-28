// Browser storage actually stores, actually scopes, and actually survives.
//
// WHY THIS IS DRIVEN IN A BROWSER
//   assets/anchit-store.js is IndexedDB with a localStorage fallback. Neither
//   exists in Node, so a unit test here would be testing a mock. The questions
//   that matter - does it survive a reload, do two users on one device stay
//   separate, does it degrade when IndexedDB is refused - are only answerable
//   in a real engine.
//
// WHAT IS ASSERTED
//   The properties an app depends on, not the implementation:
//     - a write is readable back, and after a full page reload
//     - two signed-in users on the same device cannot read each other's data
//     - two apps on the same origin cannot read each other's data
//     - a failed write REJECTS rather than silently dropping the record
//     - export/import round-trips, which is the only way data leaves the device
//     - it still works when IndexedDB is unavailable
//
// Run against a served build:  node scripts/storage-local.js
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const load = async (p = page) => {
    await p.goto(BASE + '/auth-demo.html', { waitUntil: 'domcontentloaded' });
    await p.addScriptTag({ url: '/assets/anchit-store.js' });
    await p.waitForFunction(() => !!window.AnchitStore);
  };
  // Pin the identity the store scopes by, so user isolation can be driven
  // without a real Google sign-in.
  const asUser = (p, sub) => p.evaluate((s) => {
    window.AnchitAuth = { user: () => (s ? { sub: s } : null) };
  }, sub);

  await load();
  const eng = await page.evaluate(() => AnchitStore.available());
  check('storage is available in the browser', eng.ok, eng.engine);

  await asUser(page, 'user-A');
  const wrote = await page.evaluate(async () => {
    await AnchitStore.set('orders', 'o1', { total: 420, items: ['dal', 'roti'] });
    const back = await AnchitStore.get('orders', 'o1');
    return back && back.total;
  });
  check('a write is readable back', wrote === 420, 'total=' + wrote);

  const listed = await page.evaluate(async () => {
    await AnchitStore.set('orders', 'o2', { total: 99 });
    return (await AnchitStore.list('orders')).map((r) => r.id).sort();
  });
  check('list returns the collection', JSON.stringify(listed) === '["o1","o2"]', listed.join(','));

  // The real question for browser storage: does it come back?
  await load();
  await asUser(page, 'user-A');
  const survived = await page.evaluate(async () => {
    const r = await AnchitStore.get('orders', 'o1');
    return r && r.total;
  });
  check('data survives a full page reload', survived === 420, 'total=' + survived);

  // Two people on one laptop.
  await asUser(page, 'user-B');
  const isolated = await page.evaluate(async () => {
    const seen = await AnchitStore.get('orders', 'o1');
    const mine = await AnchitStore.list('orders');
    return { seen: seen === undefined, count: mine.length };
  });
  check('a second user cannot read the first user\'s data', isolated.seen && isolated.count === 0,
    isolated.seen ? 'isolated' : 'LEAKED user-A data to user-B');

  // Two apps on the same origin.
  const appIsolated = await page.evaluate(async () => {
    delete window.AnchitStore;
    const s = document.createElement('script');
    s.src = '/assets/anchit-store.js'; s.setAttribute('data-app', 'other-app');
    document.head.appendChild(s);
    await new Promise((r) => { s.onload = r; });
    window.AnchitAuth = { user: () => ({ sub: 'user-A' }) };
    return (await AnchitStore.get('orders', 'o1')) === undefined;
  });
  check('a second app cannot read the first app\'s data', appIsolated,
    appIsolated ? 'isolated by app' : 'LEAKED across apps');

  // Export is the only route off the device, so it has to round-trip.
  await load();
  await asUser(page, 'user-A');
  const round = await page.evaluate(async () => {
    const blob = await AnchitStore.export();
    await AnchitStore.clear();
    const empty = (await AnchitStore.list('orders')).length;
    const n = await AnchitStore.import(JSON.stringify(blob));
    const back = await AnchitStore.get('orders', 'o1');
    return { records: blob.records.length, empty, n, restored: back && back.total };
  });
  check('export / clear / import round-trips', round.empty === 0 && round.restored === 420,
    `${round.records} exported, cleared to ${round.empty}, restored total=${round.restored}`);

  // A dropped write that reports success is how an app tells someone their
  // order was saved when it was not.
  // Driven with a value IndexedDB genuinely cannot persist - a structured-clone
  // failure - rather than by patching a connection. The first version of this
  // check monkey-patched `transaction` on a SEPARATE IDBDatabase it had opened
  // itself, while the store kept using its own cached connection, so the write
  // succeeded and the test reported a silent drop that never happened. A test
  // that fails for its own reasons is worse than no test.
  const rejects = await page.evaluate(async () => {
    let threw = false;
    try { await AnchitStore.set('orders', 'o9', { fn: function () {} }); } catch (e) { threw = true; }
    const leaked = await AnchitStore.get('orders', 'o9');
    return { threw, absent: leaked === undefined };
  });
  check('a failed write rejects instead of dropping the record', rejects.threw && rejects.absent,
    rejects.threw ? (rejects.absent ? 'rejects, nothing half-written' : 'rejected but left a partial record')
                  : 'SILENTLY DROPPED');

  // adopt() had a bug that no test could have caught, because no test existed:
  // it wrote the record under the signed-in user and then called remove(),
  // which derives its key from that SAME user - so it deleted the copy it had
  // just made and left the anonymous one untouched, while returning a
  // successful count. The caller got a number and no data.
  await load();
  await asUser(page, null);                       // signed out
  await page.evaluate(() => AnchitStore.set('notes', 'draft', { text: 'written signed out' }));
  await asUser(page, 'user-C');
  const adopted = await page.evaluate(async () => {
    const before = await AnchitStore.get('notes', 'draft');   // must not see it yet
    const n = await AnchitStore.adopt();
    const after = await AnchitStore.get('notes', 'draft');
    return { isolatedFirst: before === undefined, n, text: after && after.text };
  });
  check('adopt moves anonymous data to the signed-in user',
    adopted.isolatedFirst && adopted.n === 1 && adopted.text === 'written signed out',
    adopted.n + ' adopted, reads back: ' + JSON.stringify(adopted.text));

  // And the anonymous copy must be GONE, not merely also present - that is the
  // half the old code got backwards.
  await asUser(page, null);
  const leftBehind = await page.evaluate(() => AnchitStore.get('notes', 'draft'));
  check('the anonymous copy is removed, not duplicated', leftBehind === undefined,
    leftBehind === undefined ? 'anon copy gone' : 'STILL THERE: ' + JSON.stringify(leftBehind));

  // Private-browsing shapes where IndexedDB is refused.
  const page2 = await ctx.newPage();
  await page2.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { get() { throw new Error('blocked'); } });
  });
  await load(page2);
  await asUser(page2, 'user-A');
  const fallback = await page2.evaluate(async () => {
    const eng = await AnchitStore.available();
    await AnchitStore.set('notes', 'n1', { text: 'hello' });
    const back = await AnchitStore.get('notes', 'n1');
    return { engine: eng.engine, ok: back && back.text === 'hello' };
  });
  check('it still works when IndexedDB is refused', fallback.ok, 'engine=' + fallback.engine);

  for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(54) + (d || ''));
  const pass = results.filter((r) => r[0] === 'PASS').length;
  console.log('\n' + pass + '/' + results.length + ' passed');
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
