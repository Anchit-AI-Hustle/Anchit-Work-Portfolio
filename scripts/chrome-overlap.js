// Injected floating chrome must not sit on top of the page's own content.
//
// THE BUG THIS CATCHES
//   assets/cinematic.js adds two floating controls to every page it runs on: a
//   motion toggle and a route back to the portfolio. It has a placer, place(),
//   which asks what is already in a corner and moves if the spot is taken -
//   written the last time this happened, with a comment recording that the
//   toggle had landed on two chapter links and a Library button.
//
//   It still got it wrong three ways, all found by measuring instead of reading:
//
//   1. It ran ONCE, at DOMContentLoaded. The Lifecycle OS modules build their
//      content from JavaScript after that, so the corner measured as free was
//      occupied a beat later. The toggle ended up over the "Retention Playbook"
//      and "Cohort Builder" links - the things the page exists to be clicked on.
//   2. It asked whether a corner held something CLICKABLE, so a paragraph or a
//      list item read as free and it parked on body copy.
//   3. With text finally counted, four candidate spots were not enough on a
//      dense page, and the give-up branch put it back on the content.
//
// WHAT IS ASSERTED
//   Not "the placer ran". The property a reader cares about: at the centre of
//   every small piece of fixed chrome, the thing underneath is not a leaf
//   element with text. Leaf, deliberately - <main> and section wrappers are hit
//   at every corner of every page, and a pill floating over a container's
//   padding is fine. Over a sentence or a link is not.
//
// Run against a served build:  node scripts/chrome-overlap.js
// MUT=1 pins the chrome back to a fixed corner with no placement, which is the
// pre-fix behaviour; pages with content in that corner must fail.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MUT = process.env.MUT === '1';

// The Lifecycle OS modules are the pages that exposed this: they are dense, and
// they render late. Plus the hub and the portfolio itself.
const PAGES = ['/lifecycle-os', '/lifecycle-os-calendar', '/lifecycle-os-cohorts',
  '/lifecycle-os-brain', '/lifecycle-os-playbook', '/lifecycle-os-frameworks',
  '/lifecycle-os-social', '/lifecycle-os-analysis', '/growth-school', '/index'];

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

(async () => {
  const browser = await chromium.launch();
  for (const route of PAGES) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    try {
      await page.goto(BASE + route + '.html', { waitUntil: 'networkidle', timeout: 25000 });
    } catch { /* a slow module still renders; the measurement below is what matters */ }
    await page.waitForTimeout(2600);

    if (MUT) {
      await page.evaluate(() => {
        for (const id of ['cinMotion', 'cinHome']) {
          const el = document.getElementById(id);
          if (el) { el.style.left = '14px'; el.style.bottom = '14px'; el.style.top = 'auto'; el.style.right = 'auto'; }
        }
      });
      await page.waitForTimeout(250);
    }

    const hits = await page.evaluate(() => {
      const vis = (el) => {
        const c = getComputedStyle(el), b = el.getBoundingClientRect();
        return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.01 && b.width > 2 && b.height > 2;
      };
      const chrome = [...document.querySelectorAll('body *')]
        .filter((e) => getComputedStyle(e).position === 'fixed' && vis(e))
        .filter((e) => { const r = e.getBoundingClientRect(); return r.height <= 300 && r.width >= 40; });
      const out = [];
      for (const f of chrome) {
        const r = f.getBoundingClientRect();
        const under = document.elementsFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2))
          .filter((e) => e !== f && !f.contains(e));
        const leaf = under.find((e) => e.children.length === 0 && (e.textContent || '').trim().length > 6);
        if (leaf) out.push(((f.id || f.className) + '').slice(0, 22) + ' over "' + leaf.textContent.trim().slice(0, 26) + '"');
      }
      return out;
    });

    check(`${route}: floating chrome covers no content`, hits.length === 0,
      hits.length ? hits.join(' | ') : 'clear');
    await page.close();
  }

  for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(52) + (d || ''));
  const pass = results.filter((r) => r[0] === 'PASS').length;
  console.log('\n' + pass + '/' + results.length + ' passed' + (MUT ? '  [MUT=1]' : ''));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
