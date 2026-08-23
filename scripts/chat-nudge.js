// The first-visit chat nudge: shown once, to someone who has never seen it.
//
// The two ways this goes wrong are opposites, so both are checked:
//   - it never appears, and new visitors never learn the AI chat exists
//   - it appears every time, and becomes the thing returning visitors close
//
// It also must not interrupt the cinematic boot sequence. The intro popup that
// used to live here was disabled for exactly that reason — it opened a blurred
// scrim over the title sequence on every load — so "waits for the boot" is a
// requirement, not a nicety.
//
// Run against a served build:  node scripts/chat-nudge.js
// MUT=1 removes the seen-flag guard; the returning-visitor check must fail.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const MUT = process.env.MUT === '1';
const URL = 'http://127.0.0.1:8099/index.html';
const KEY = 'anchit-chat-nudge-seen';
const AFTER_BOOT = 13500;   // boot sequence, plus the settle delay

const results = [];
const check = (n, ok, d) => results.push([ok ? 'PASS' : 'FAIL', n, d]);
const isShown = (p) => p.evaluate(() => {
  const n = document.getElementById('chatNudge');
  return !!n && !n.hidden && n.classList.contains('in') && getComputedStyle(n).display !== 'none';
});

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });

  // ── a brand-new visitor ──────────────────────────────────────────────────
  const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  // MUT wipes the seen-flag before every load, which is what a nudge with no
  // memory behaves like. Nothing about the first visit changes; only the
  // returning-visitor promise breaks, which is the point.
  if (MUT) await p.addInitScript((k) => { try { localStorage.removeItem(k); } catch (e) {} }, KEY);
  await p.goto(URL, { waitUntil: 'load', timeout: 25000 });

  await p.waitForTimeout(2000);
  check('it stays out of the way while the boot sequence plays',
    !(await isShown(p)), 'hidden at 2s');

  await p.waitForTimeout(AFTER_BOOT - 2000);
  const shown = await isShown(p);
  check('a new visitor is shown it', shown, shown ? 'visible after the boot' : 'never appeared');

  // The flag must be written on SHOW. Writing it on dismiss means anyone who
  // ignores the nudge — most people — is shown it again on every visit.
  const flag = await p.evaluate((k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, KEY);
  check('the flag is written when it is shown, not when it is dismissed',
    !!flag, flag ? 'flag present while still on screen' : 'no flag');

  // ── the same visitor, coming back ────────────────────────────────────────
  await p.goto(URL, { waitUntil: 'load', timeout: 25000 });
  await p.waitForTimeout(AFTER_BOOT);
  const again = await isShown(p);
  check('a returning visitor is not shown it again', !again, again ? 'shown a second time' : 'stayed hidden');
  await ctx.close();

  // ── a different person, first visit ──────────────────────────────────────
  const ctx2 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await ctx2.newPage();
  await p2.goto(URL, { waitUntil: 'load', timeout: 25000 });
  await p2.waitForTimeout(AFTER_BOOT);
  check('a different new visitor still gets it', (await isShown(p2)), 'fresh profile, shown');

  // Dismissible, and it must not trap focus or block the page.
  await p2.click('#chatNudgeClose');
  await p2.waitForTimeout(700);
  check('it can be dismissed', !(await isShown(p2)), 'closed on the dismiss button');
  await ctx2.close();

  // ── storage refused (private browsing, blocked cookies) ──────────────────
  // It must fail closed: no nudge rather than a nudge on every single load,
  // and certainly not a crash.
  const ctx3 = await b.newContext({ viewport: { width: 1280, height: 900 } });
  const p3 = await ctx3.newPage();
  await p3.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
  });
  await p3.goto(URL, { waitUntil: 'load', timeout: 25000 });
  await p3.waitForTimeout(AFTER_BOOT);
  const alive = await p3.evaluate(() => !!document.querySelector('.sidebar'));
  check('with storage refused it fails closed and the page still works',
    alive && !(await isShown(p3)), alive ? 'page renders, no nudge' : 'page broke');
  await ctx3.close();

  for (const [ok, n, d] of results) console.log(`  ${ok}  ${n.padEnd(58)} ${d}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await b.close();
  if (MUT) {
    // Only the returning-visitor promise depends on the guard; a first visit
    // looks identical either way, so demanding the rest fail would be theatre.
    const TARGET = /returning visitor/;
    const target = results.filter((r) => TARGET.test(r[1]));
    const wrong = target.filter((r) => r[0] === 'PASS').map((r) => r[1])
      .concat(results.filter((r) => !TARGET.test(r[1]) && r[0] === 'FAIL').map((r) => r[1] + ' (broke unexpectedly)'));
    if (!wrong.length) {
      console.log('MUT: the returning-visitor check failed, as it must, and the other ' +
        (results.length - target.length) + ' still pass');
      process.exit(0);
    }
    console.log('MUT: wrong outcome — ' + wrong.join('; '));
    process.exit(1);
  }
  process.exit(failed ? 1 : 0);
})();
