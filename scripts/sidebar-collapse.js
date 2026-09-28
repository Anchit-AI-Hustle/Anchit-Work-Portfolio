// Wherever there is a left menu, there is a way to collapse it - and the
// control is actually tappable.
//
// THE BUG THIS CATCHES
//   Reported as "I can't collapse the LHS and it's blocking my view", with the
//   marketing course rail covering a phone screen.
//
//   The page HAD a collapse control. growth-school.js builds a full-width
//   sticky "Chapters / Hide chapters" bar at top 0, height 50, and it worked.
//   What it did not have was that control being REACHABLE: the page also
//   carries a hand-written "back to the portfolio" chip pinned at top 14 /
//   left 14 with z-index 2147483000, which landed inside the bar, on top of the
//   label, and won. Tapping to collapse navigated home. So the drawer opened
//   and would not close.
//
//   Checking "a toggle exists" would have passed the whole time. The property
//   that was false is that tapping it does what it says, so that is what this
//   asserts: at the control's own coordinates, the control is the topmost
//   element - and after a click, the menu is actually closed.
//
// Run against a served build:  node scripts/sidebar-collapse.js
// MUT=1 restores the top-left chip on the course page; the reachability and
// the close checks must both fail.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MUT = process.env.MUT === '1';
const PHONE = { width: 390, height: 844 };

// page -> how its left menu and its collapse control are found.
const PAGES = [
  { url: '/growth-school.html',            menu: '.gs-rail',  toggle: '.gs-menu-btn', openClass: 'open' },
  { url: '/ayushi/course.html',            menu: '.gs-rail',  toggle: '.gs-menu-btn', openClass: 'open' },
  { url: '/index.html',                    menu: '.sidebar',  toggle: '.sidebar-toggle' },
];

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

(async () => {
  const browser = await chromium.launch();

  for (const spec of PAGES) {
    const page = await browser.newPage({ viewport: PHONE });
    await page.goto(BASE + spec.url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);

    if (MUT) {
      await page.evaluate(() => {
        const c = document.getElementById('cinHome');
        if (c) { c.style.top = '14px'; c.style.bottom = 'auto'; }
      });
      await page.waitForTimeout(200);
    }

    const label = spec.url;
    const found = await page.evaluate((s) => !!document.querySelector(s.toggle), spec);
    check(`${label}: a collapse control exists`, found, found ? spec.toggle : 'NOT FOUND');
    if (!found) { await page.close(); continue; }

    // Open it first where it starts closed, so we are testing the state the
    // visitor is stuck in - a menu covering the screen.
    if (spec.openClass) {
      await page.evaluate((s) => {
        const m = document.querySelector(s.menu);
        if (!m.classList.contains(s.openClass)) document.querySelector(s.toggle).click();
      }, spec);
      await page.waitForTimeout(500);
    }

    const reach = await page.evaluate((s) => {
      const t = document.querySelector(s.toggle);
      const r = t.getBoundingClientRect();
      // Sample across the control, not just its centre: a chip covering only
      // the left third still eats the tap a thumb aims at a label.
      const ys = r.top + r.height / 2;
      const xs = [r.left + 6, r.left + r.width * 0.25, r.left + r.width / 2];
      const blockers = [];
      for (const x of xs) {
        const el = document.elementFromPoint(Math.round(x), Math.round(ys));
        const ok = el && (el === t || t.contains(el));
        if (!ok) blockers.push(`x=${Math.round(x)} -> ${(el && (el.id || el.className) || 'null').toString().slice(0, 24)}`);
      }
      return { blockers, rect: { t: Math.round(r.top), h: Math.round(r.height) } };
    }, spec);
    check(`${label}: the control is tappable across its width`, reach.blockers.length === 0,
      reach.blockers.length ? 'covered at ' + reach.blockers.join(', ') : 'topmost at every sample');

    // And the thing it promises actually happens.
    if (spec.openClass) {
      const before = await page.evaluate((s) => document.querySelector(s.menu).classList.contains(s.openClass), spec);
      const box = await page.evaluate((s) => {
        const r = document.querySelector(s.toggle).getBoundingClientRect();
        return { x: Math.round(r.left + 6), y: Math.round(r.top + r.height / 2) };
      }, spec);
      await page.mouse.click(box.x, box.y);
      await page.waitForTimeout(600);
      const after = await page.evaluate((s) => ({
        open: !!document.querySelector(s.menu)?.classList.contains(s.openClass),
        path: location.pathname,
      }), spec);
      check(`${label}: tapping it closes the menu`, before === true && after.open === false,
        !before ? 'menu was not open to begin with' : (after.open ? 'still open after the tap' : 'closed'));
      check(`${label}: tapping it does not navigate away`, after.path.replace(/\/index\.html$/, '/') === spec.url.replace(/\/index\.html$/, '/'),
        after.path);
    }
    await page.close();
  }

  for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(56) + (d || ''));
  const pass = results.filter((r) => r[0] === 'PASS').length;
  console.log('\n' + pass + '/' + results.length + ' passed' + (MUT ? '  [MUT=1]' : ''));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
