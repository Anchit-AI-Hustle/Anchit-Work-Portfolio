// Minimising the chat must never leave a blank page.
//
// THE BUG THIS CATCHES
//   Reported as "the AI Chat Clone page loads this" with a screenshot of an
//   empty screen: the fixed background grid, the fixed contact bar, and nothing
//   else. It was not a loading failure and not the chat rendering wrong.
//
//   Only the .active view is displayed. minimizeChat() added
//   .chat-view-minimized - which is `display: none !important` - to #view-chat
//   while leaving .active ON it and activating no other view. So the one view
//   allowed to display was the one being hidden, and the document collapsed to
//   a single empty viewport: 0 painted elements, scrollHeight equal to the
//   window. Every other view was already display:none for not being active.
//
//   It hid on a desktop because you rarely minimise instead of navigating, and
//   on a phone the floating chat button is right there.
//
// WHAT IS ASSERTED
//   Not "the class was removed" - that is the implementation. The assertion is
//   the property a visitor cares about: after minimising, a real page is on
//   screen. Counting painted elements is the only version of that which cannot
//   pass while the screen is empty.
//
// Run against a served build:  node scripts/chat-blank.js
// MUT=1 restores the pre-fix behaviour and the checks must fail.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MUT = process.env.MUT === '1';

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.waitForTimeout(6000);

  if (MUT) {
    // The exact pre-fix minimizeChat: hide the active view, restore nothing.
    await page.evaluate(() => {
      window.minimizeChat = () => {
        document.querySelector('.chat-block')?.classList.add('minimized');
        document.getElementById('view-chat')?.classList.add('chat-view-minimized');
        document.body.classList.remove('view-chat', 'chat-guide-open');
      };
    });
  }

  await page.evaluate(() => document.querySelector('a.nav-card[data-view="chat"]').click());
  await page.waitForTimeout(1500);

  const opened = await page.evaluate(() => ({
    active: [...document.querySelectorAll('.view.active')].map((v) => v.id),
    painted: [...document.querySelectorAll('#view-chat *')].filter((el) => {
      const c = getComputedStyle(el), r = el.getBoundingClientRect();
      return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.01 && r.height > 2;
    }).length,
  }));
  check('opening chat shows the chat view', opened.active.includes('view-chat') && opened.painted > 20,
    `${opened.active.join(',')} · ${opened.painted} elements`);

  await page.evaluate(() => window.minimizeChat && window.minimizeChat());
  await page.waitForTimeout(1200);

  const after = await page.evaluate(() => {
    const views = [...document.querySelectorAll('.view')];
    const shown = views.filter((v) => getComputedStyle(v).display !== 'none');
    const painted = [...document.querySelectorAll('.view *')].filter((el) => {
      const c = getComputedStyle(el), r = el.getBoundingClientRect();
      return c.display !== 'none' && c.visibility !== 'hidden' && +c.opacity > 0.01 &&
        r.width > 40 && r.height > 20 && r.bottom > 0 && r.top < innerHeight;
    }).length;
    return { shown: shown.map((v) => v.id), painted,
      docHeight: Math.round(document.documentElement.scrollHeight), viewport: innerHeight,
      chatStillActive: !!document.querySelector('#view-chat.active') };
  });

  check('a view is still displayed after minimising', after.shown.length > 0,
    after.shown.length ? after.shown.join(',') : 'NO view is displayed - the screen is blank');
  check('content is actually painted after minimising', after.painted > 0,
    `${after.painted} elements in the viewport`);
  // The empty state collapsed the document to exactly one viewport. A real page
  // is taller than the window, so this catches the blankness by a second route.
  check('the document is a page, not one empty viewport', after.docHeight > after.viewport + 200,
    `scrollHeight ${after.docHeight} vs viewport ${after.viewport}`);
  check('the hidden chat view is no longer the active one', !after.chatStillActive,
    after.chatStillActive ? '#view-chat is .active AND display:none' : 'active view handed back');

  for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(50) + (d || ''));
  const pass = results.filter((r) => r[0] === 'PASS').length;
  console.log('\n' + pass + '/' + results.length + ' passed' + (MUT ? '  [MUT=1]' : ''));
  await browser.close();
  process.exit(pass === results.length ? 0 : 1);
})();
