// A route change is one motion, on every page.
//
// THE BUG THIS CATCHES
//   Moving between views felt heavy next to a scroll on the same page. Nothing
//   was broken; too much was happening at once. A route change started three
//   entrance animations on the view (a fade-up, a perspective tilt, viewIn), a
//   `filter: brightness()` tween on the whole view, and a four-layer
//   full-screen wipe, all on the same frame, over an ambient backdrop that
//   never stood down. Measured in a trace: about 26 render passes a frame.
//   Moving between PAGES was worse in a different way: a hard cut.
//
//   Each of those was added separately and each looked fine alone, so the
//   property worth guarding is the COUNT, not any one effect:
//     - exactly one animation on the incoming view, the 420ms turn
//     - no filter on the view while it turns
//     - the wipe is one band, and hidden once it has crossed
//     - the ambient layers are quiet during the turn and back afterwards
//     - no mix-blend-mode on the view's surfaces (an offscreen pass each)
//     - every built page opts into the cross-document turn, and a real
//       navigation between two pages reports an active view transition
//     - none of it throws
//
// Run against a served build:  node scripts/view-turn.js
// MUT=stack   puts a second entrance back on the view; the count must fail.
// MUT=blend   puts the blend mode back on a card surface; that must fail.
const fs = require('fs');
const path = require('path');
const { chromium } = require('./_playwright');

const BASE = process.env.BASE || 'http://localhost:8099';
const WWW = path.join(__dirname, '..', 'www');
const MUT = process.env.MUT || '';
let failed = 0;
const check = (ok, label, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  ' + detail : ''}`);
};

(async () => {
  // Static half: the opt-in is in the head of every first-party page.
  const top = fs.readdirSync(WWW).filter(f => f.endsWith('.html'));
  const missing = top.filter(f => !/@view-transition/.test(fs.readFileSync(path.join(WWW, f), 'utf8')));
  check(missing.length === 0, `all ${top.length} top-level pages opt into the page turn`, missing.slice(0, 5).join(', '));

  // Every page that turns must also be able to NOT turn: the reduced-motion
  // rule and the Motion-toggle reader travel with the opt-in. A bare opt-in on
  // the late-copied pages once gave reduced-motion visitors a crossfade.
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.html') ? [path.join(d, e.name)] : []);
  const turning = walk(WWW).filter(f => /@view-transition/.test(fs.readFileSync(f, 'utf8')));
  const unguarded = turning.filter(f => { const h = fs.readFileSync(f, 'utf8'); return !(h.includes('id="page-turn"') && h.includes('pt-off') && h.includes('prefers-reduced-motion')); });
  check(unguarded.length === 0, `all ${turning.length} turning pages carry both motion opt-outs`, unguarded.slice(0, 4).map(f => path.relative(WWW, f)).join(', '));

  const browser = await chromium.launch();
  for (const [name, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(BASE + '/', { waitUntil: 'load' });
    await page.waitForTimeout(3000);
    if (MUT === 'stack') await page.addStyleTag({ content: '@keyframes mutTilt{from{transform:perspective(1400px) rotateX(4deg)}to{transform:none}} .view.d3-enter{animation:viewIn .42s both, mutTilt .62s both !important}' });
    if (MUT === 'blend') await page.addStyleTag({ content: '.work-stat::before{mix-blend-mode:screen}' });

    await page.evaluate(() => window.switchView('experience'));
    await page.waitForTimeout(140);
    const mid = await page.evaluate(() => {
      const v = document.querySelector('.view.active');
      const w = document.getElementById('view-wipe');
      return {
        id: v.id,
        anims: v.getAnimations().map(a => `${a.animationName || a.transitionProperty} ${Math.round(a.effect.getComputedTiming().duration)}ms`),
        filter: getComputedStyle(v).filter,
        quiet: document.body.classList.contains('is-scrolling') && window.__scrolling === true,
        wipe: w ? { kids: w.children.length, vw: Math.round(w.getBoundingClientRect().width / innerWidth * 100) } : null,
      };
    });
    check(mid.id === 'view-experience', `${name}: the route changed`);
    check(mid.anims.length === 1 && mid.anims[0] === 'viewIn 420ms', `${name}: exactly one entrance on the view`, JSON.stringify(mid.anims));
    check(mid.filter === 'none', `${name}: no filter on the turning view`, mid.filter);
    check(mid.quiet, `${name}: ambient layers are quiet during the turn`);
    // GSAP is not loaded on every viewport class; where the wipe exists it is one band.
    if (mid.wipe) check(mid.wipe.kids === 1 && mid.wipe.vw <= 30, `${name}: the wipe is one narrow band`, JSON.stringify(mid.wipe));

    await page.waitForTimeout(1300);
    const end = await page.evaluate(() => {
      const v = document.querySelector('.view.active');
      const w = document.getElementById('view-wipe');
      const blended = [...v.querySelectorAll('*')].filter(e =>
        getComputedStyle(e, '::before').mixBlendMode !== 'normal' || getComputedStyle(e, '::after').mixBlendMode !== 'normal').length;
      return {
        opacity: getComputedStyle(v).opacity, transform: getComputedStyle(v).transform,
        quiet: document.body.classList.contains('is-scrolling'),
        wipeHidden: !w || getComputedStyle(w).visibility === 'hidden', blended,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    check(end.opacity === '1' && end.transform === 'none', `${name}: the view lands fully opaque and untransformed`, `${end.opacity} ${end.transform}`);
    check(!end.quiet, `${name}: ambient layers return after the turn`);
    check(end.wipeHidden, `${name}: the wipe holds no layer at rest`);
    check(end.blended === 0, `${name}: no blend-mode surfaces in the view`, String(end.blended));
    check(end.overflow <= 1, `${name}: no horizontal overflow`, String(end.overflow));
    check(errors.length === 0, `${name}: no script errors`, errors.slice(0, 2).join(' | '));
    await page.close();
  }

  // Dynamic half: a real navigation between two pages runs a view transition.
  const nav = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await nav.addInitScript(() => addEventListener('pagereveal', e =>
    sessionStorage.setItem('vt:' + location.pathname, e.viewTransition ? 'yes' : 'no')));
  await nav.goto(BASE + '/', { waitUntil: 'load' });
  await nav.waitForTimeout(1200);
  for (const href of ['/lifecycle-os', '/growth-school', '/']) {
    await nav.evaluate(h => { const a = document.createElement('a'); a.href = h; document.body.appendChild(a); a.click(); }, href);
    await nav.waitForLoadState('load');
    await nav.waitForTimeout(800);
    const got = await nav.evaluate(() => sessionStorage.getItem('vt:' + location.pathname));
    check(got === 'yes', `page turn runs on navigation to ${href}`, String(got));
  }
  // Entrances outlive the first four seconds. The shared runtime used to bail
  // on a timer, which switched off every entrance below the fold before anyone
  // scrolled to it: the first screen performed and the rest of the page sat.
  for (const href of ['/', '/lifecycle-os']) {
    const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pg.goto(BASE + href, { waitUntil: 'load' });
    await pg.waitForTimeout(6000);
    const before = await pg.evaluate(() => ({
      bail: document.documentElement.classList.contains('cin-bail'),
      played: document.querySelectorAll('.cin-in').length,
      waiting: document.querySelectorAll('.cin:not(.cin-in),.cin-stagger:not(.cin-in)').length }));
    check(!before.bail, `${href}: entrances are not switched off after six seconds`);
    check(before.waiting > 0, `${href}: blocks below the fold are still waiting for their entrance`, String(before.waiting));
    for (let i = 0; i < 4; i++) { await pg.mouse.wheel(0, 700); await pg.waitForTimeout(500); }
    // Blocks arrive one at a time through a queue, so "settled" is a state to
    // wait for, not a delay to guess: a fixed 1.5s caught the queue mid-drain.
    // First that something new has played at all, then that nothing is left.
    await pg.waitForFunction((n) => document.querySelectorAll('.cin-in').length > n, before.played, { timeout: 8000 }).catch(() => {});
    await pg.waitForFunction(() => ![...document.querySelectorAll('.cin:not(.cin-in),.cin-stagger:not(.cin-in)')].some(e => {
      const r = e.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight && r.bottom > 0; }), null, { timeout: 6000 }).catch(() => {});
    const after = await pg.evaluate(() => ({
      played: document.querySelectorAll('.cin-in').length,
      stuck: [...document.querySelectorAll('.cin:not(.cin-in),.cin-stagger:not(.cin-in)')].filter(e => {
        const r = e.getBoundingClientRect(); return r.height > 0 && r.top < innerHeight && r.bottom > 0; }).length }));
    check(after.played > before.played, `${href}: scrolling plays new entrances`, `${before.played} -> ${after.played}`);
    check(after.stuck === 0, `${href}: nothing on screen is left unrevealed`, String(after.stuck));
    await pg.close();
  }

  // The Projects book turns a real, two-sided page. What it replaced was a
  // blank flap rotating with no perspective while the pages slid sideways.
  {
    const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await pg.goto(BASE + '/#projects', { waitUntil: 'load' });
    await pg.waitForTimeout(3200);
    await pg.mouse.move(1100, 500);
    await pg.keyboard.press('ArrowRight');
    await pg.waitForTimeout(1300);
    await pg.keyboard.press('ArrowRight');
    // Wait for the turn to be under way rather than for a fixed delay: on a
    // loaded machine the first animation frame can land late, and a leaf at
    // exactly 0deg reports a 2D matrix.
    await pg.waitForFunction(() => {
      const l = document.querySelector('.folio-leaf');
      return l && getComputedStyle(l).transform.startsWith('matrix3d');
    }, null, { timeout: 2000 }).catch(() => {});
    const mid = await pg.evaluate(() => {
      const st = document.querySelector('.folio-stage'), l = document.querySelector('.folio-leaf'), c = document.querySelector('.folio-cover');
      const g = document.querySelector('.builds-grid[data-folio]');
      // Any page will do for size: every page in a spread is half the grid.
      const right = g.children[2];
      return l && c && right ? {
        persp: getComputedStyle(st).perspective, faces: l.querySelectorAll('.folio-face').length,
        is3d: getComputedStyle(l).transform.startsWith('matrix3d'),
        aligned: Math.abs(l.offsetWidth - right.offsetWidth) < 2 && Math.abs(l.offsetHeight - right.offsetHeight) < 2 && Math.abs(c.offsetTop - l.offsetTop) < 2,
        bothFilled: [...l.querySelectorAll('.folio-face')].every(f => f.querySelector('.build-card, .folio-preface, .folio-colophon')),
      } : null;
    });
    check(!!mid, 'book: a leaf and a cover exist mid-turn');
    if (mid) {
      check(mid.persp !== 'none', 'book: the stage has a camera', mid.persp);
      check(mid.faces === 2 && mid.bothFilled, 'book: the leaf has two faces and both carry a real page', JSON.stringify(mid));
      check(mid.is3d, 'book: the leaf is rotating in 3D');
      check(mid.aligned, 'book: leaf and cover match the pages they stand in for');
    }
    await pg.waitForTimeout(1400);
    const end = await pg.evaluate(() => {
      const g = document.querySelector('.builds-grid[data-folio]');
      const on = [...g.children].filter(k => { const x = k.offsetLeft - g.scrollLeft; return x > -3 && x < g.clientWidth - 3; });
      return { leftover: document.querySelectorAll('.folio-leaf,.folio-cover,.folio-cast').length,
        label: document.querySelector('[data-folio-progress]').textContent,
        level: on.length === 2 && Math.abs(on[0].getBoundingClientRect().top - on[1].getBoundingClientRect().top) < 2 };
    });
    check(end.leftover === 0, 'book: nothing is left on the stage after the turn', String(end.leftover));
    check(/4.5 of/.test(end.label), 'book: two turns land on the third spread', end.label);
    check(errors.length === 0, 'book: no script errors', errors.slice(0, 2).join(' | '));
    await pg.close();
  }

  // The flight deck: orbit, warp, command deck, rail. Each is checked for what
  // it does, not that it exists: the orbit once had all four nodes pinned to
  // one point by another script's fill mode, and looked fine in the markup.
  for (const [name, width, height] of [['phone', 390, 844], ['tablet', 820, 1180], ['desktop', 1440, 900]]) {
    const pg = await browser.newPage({ viewport: { width, height } });
    const errors = [];
    pg.on('pageerror', e => errors.push(e.message));
    await pg.goto(BASE + '/', { waitUntil: 'load' });
    await pg.waitForTimeout(6500);
    const orbit = await pg.evaluate(() => {
      const ns = [...document.querySelectorAll('.fd-node')].map(n => { const r = n.getBoundingClientRect(); return { t: n.textContent, l: r.left, r: r.right, x: Math.round(r.left + r.width / 2) }; });
      return { n: ns.length, spread: new Set(ns.map(n => n.x)).size, inside: ns.every(n => n.l >= 0 && n.r <= innerWidth),
        clean: ns.every(n => n.t.length < 14), overflow: document.documentElement.scrollWidth - innerWidth };
    });
    check(orbit.n === 4 && orbit.spread === 4, `${name}: four orbit nodes at four different places`, JSON.stringify(orbit));
    check(orbit.inside, `${name}: every orbit node is on screen`);
    // The orbit turns on its own, so one sample proves nothing: watch it for
    // most of a turn and require every label inside the screen every time.
    const swept = await pg.evaluate(() => new Promise((resolve) => {
      let worst = 0, n = 0;
      const t = setInterval(() => {
        for (const el of document.querySelectorAll('.fd-node')) { const r = el.getBoundingClientRect(); worst = Math.max(worst, -r.left, r.right - innerWidth); }
        if (++n >= 60) { clearInterval(t); resolve(Math.round(worst)); }
      }, 100);
    }));
    check(swept <= 0, `${name}: no orbit label leaves the screen at any point of the turn`, `${swept}px past the edge at worst`);
    check(orbit.clean, `${name}: orbit labels are the nav names, not name plus caption`);
    check(orbit.overflow <= 1, `${name}: the orbit causes no horizontal overflow`, String(orbit.overflow));
    const near = await pg.evaluate(() => {
      for (const n of document.querySelectorAll('.fd-node:not(.is-far)')) {
        const r = n.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (document.elementFromPoint(x, y) === n) return { x, y, h: r.height };
      }
      return null;
    });
    check(!!near, `${name}: a near orbit node is the topmost thing where it sits`);
    if (near) {
      await pg.mouse.click(near.x, near.y);
      await pg.waitForTimeout(250);
      const mid = await pg.evaluate(() => ({ view: document.querySelector('.view.active').id, warp: getComputedStyle(document.getElementById('fdWarp')).display }));
      check(mid.view !== 'view-home', `${name}: clicking an orbit node changes the route`, mid.view);
      check(mid.warp === 'block', `${name}: the warp fires on the route change`, mid.warp);
      await pg.waitForTimeout(900);
      check(await pg.evaluate(() => getComputedStyle(document.getElementById('fdWarp')).display) === 'none', `${name}: the warp is gone once it has played`);
    }
    await pg.keyboard.press('Control+k');
    await pg.waitForTimeout(300);
    const deck = await pg.evaluate(() => ({ open: document.getElementById('fdDeck').classList.contains('is-open'), focus: document.activeElement.id,
      groups: [...document.querySelectorAll('.fd-group')].map(g => g.textContent), items: document.querySelectorAll('.fd-item').length }));
    check(deck.open && deck.focus === 'fdInput', `${name}: Ctrl+K opens the command deck with the field focused`, JSON.stringify(deck));
    check(deck.groups.length === 3 && deck.items > 10, `${name}: the deck lists pages, projects and contact channels`, JSON.stringify(deck));
    await pg.keyboard.type('now');
    await pg.keyboard.press('Enter');
    await pg.waitForTimeout(800);
    const went = await pg.evaluate(() => ({ open: document.getElementById('fdDeck').classList.contains('is-open'), view: document.querySelector('.view.active').id,
      sector: document.querySelector('[data-fd-sector]').textContent }));
    check(!went.open && went.view === 'view-now', `${name}: typing and Enter in the deck opens that page`, JSON.stringify(went));
    check(/Now/i.test(went.sector), `${name}: the rail names the current sector`, went.sector);
    await pg.keyboard.press('Control+k'); await pg.waitForTimeout(200); await pg.keyboard.press('Escape'); await pg.waitForTimeout(150);
    check(!(await pg.evaluate(() => document.getElementById('fdDeck').classList.contains('is-open'))), `${name}: Escape closes the deck`);
    check(errors.length === 0, `${name}: the flight deck throws nothing`, errors.slice(0, 2).join(' | '));
    await pg.close();
  }

  // The book opens, and a swipe turns a page. A two-finger trackpad swipe used
  // to scroll the row natively: the pages slid sideways with no leaf, on the
  // one gesture the hint asks for, while every keyboard check passed.
  {
    const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pg.goto(BASE + '/', { waitUntil: 'load' });
    await pg.waitForTimeout(3200);
    await pg.evaluate(() => window.switchView('projects'));
    const opened = await pg.waitForFunction(() => {
      const f = document.querySelector('.folio-leaf .folio-front');
      return f && f.textContent.trim().length > 3 && !!document.querySelector('.folio-leaf .is-back .folio-preface, .folio-leaf .is-back .build-card');
    }, null, { timeout: 2500 }).then(() => true, () => false);
    check(opened, 'book: a cover opens on arrival, and its back is the first page');
    await pg.waitForTimeout(1700);
    check(await pg.evaluate(() => document.querySelectorAll('.folio-leaf,.folio-cover').length) === 0, 'book: the cover leaves nothing behind');
    const label = () => pg.evaluate(() => document.querySelector('[data-folio-progress]').textContent);
    // A burst, then an inertia tail, as a trackpad sends it. Dispatched from
    // inside the page on its own timers: driven from here, each event waits on
    // a round trip, and a slow machine turns one gesture into several.
    const swipe = async (dir) => {
      const flipped = await pg.evaluate((dir) => new Promise((resolve) => {
        const st = document.querySelector('.folio-stage'), r = st.getBoundingClientRect();
        let i = 0, seen = false;
        const send = () => {
          st.dispatchEvent(new WheelEvent('wheel', { deltaX: dir * (i < 5 ? 30 : 5), deltaY: 0, clientX: r.left + r.width / 2, clientY: r.top + 200, bubbles: true, cancelable: true }));
          if (document.querySelector('.folio-leaf')) seen = true;
          if (++i < 40) setTimeout(send, 16); else resolve(seen);
        };
        send();
      }), dir);
      await pg.waitForTimeout(1500);
      return flipped;
    };
    await pg.mouse.move(800, 600);
    const l0 = await label();
    const f1 = await swipe(1); const l1 = await label();
    const f2 = await swipe(1); const l2 = await label();
    const f3 = await swipe(-1); const l3 = await label();
    check(f1 && f2 && f3, 'book: a sideways swipe turns a leaf, both directions');
    check(l1 !== l0 && l2 !== l1 && l3 === l1, 'book: one swipe is exactly one page, inertia included', [l0, l1, l2, l3].join(' > '));
    const y0 = await pg.evaluate(() => scrollY);
    await pg.mouse.wheel(0, 400);
    await pg.waitForTimeout(700);
    check((await pg.evaluate(() => scrollY)) > y0, 'book: a vertical scroll over the book still scrolls the page');
    await pg.close();
  }

  // The reticle: brackets lock onto the block being read, in the views that
  // are made of blocks, and move to the next one as the page scrolls.
  for (const [name, width, height] of [['phone', 390, 844], ['desktop', 1440, 900]]) {
    const pg = await browser.newPage({ viewport: { width, height } });
    await pg.goto(BASE + '/', { waitUntil: 'load' });
    await pg.waitForTimeout(3200);
    const read = () => pg.evaluate(() => {
      const el = document.querySelector('.fd-reticle'), c = el.querySelectorAll('i');
      const a = c[0].getBoundingClientRect(), z = c[3].getBoundingClientRect();
      const hit = [...document.querySelectorAll('.view.active .contact-card, .view.active .work-item, .view.active .study-card')]
        .some(n => { const r = n.getBoundingClientRect(); return Math.abs(r.left - 6 - a.left) < 3 && Math.abs(r.top - 6 - a.top) < 3 && Math.abs(r.right + 6 - z.right) < 3 && Math.abs(r.bottom + 6 - z.bottom) < 3; });
      return { on: el.classList.contains('is-on'), tag: el.querySelector('span').textContent, hit, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    await pg.evaluate(() => window.switchView('contact'));
    await pg.waitForTimeout(900);
    await pg.mouse.wheel(0, 200);
    await pg.waitForTimeout(1500);
    const one = await read();
    check(one.on && one.hit, `${name}: the reticle frames a block exactly, 6px out`, JSON.stringify(one));
    check(/^\d\d \/ \d\d$/.test(one.tag), `${name}: the reticle numbers the block`, one.tag);
    check(one.overflow <= 1, `${name}: the reticle causes no horizontal overflow`, String(one.overflow));
    await pg.mouse.wheel(0, 420);
    await pg.waitForTimeout(1500);
    const two = await read();
    check(two.on && two.hit && two.tag !== one.tag, `${name}: scrolling moves the reticle to another block`, `${one.tag} -> ${two.tag}`);
    await pg.evaluate(() => window.switchView('projects'));
    await pg.waitForTimeout(1300);
    check(!(await read()).on, `${name}: the reticle stands down on Projects, where the book has its own frame`);
    await pg.close();
  }

  // The book's arrows sit at the middle of its sides, and the sidebar's
  // submenu never renders unstyled: its rules used to arrive thousands of lines
  // after its markup, so a slow load showed a 200px warning-sign icon.
  {
    const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pg.goto(BASE + '/#projects', { waitUntil: 'load' });
    await pg.waitForTimeout(5200);
    const side = await pg.evaluate(() => {
      const st = document.querySelector('.folio-stage').getBoundingClientRect(), mid = st.top + st.height / 2;
      return [...document.querySelectorAll('.folio-side')].map(b => { const r = b.getBoundingClientRect();
        return { dy: Math.round(r.top + r.height / 2 - mid), onEdge: Math.abs(r.left + r.width / 2 - st.left) < 4 || Math.abs(r.left + r.width / 2 - st.right) < 4, size: Math.round(r.width) }; });
    });
    check(side.length === 2 && side.every(a => Math.abs(a.dy) <= 2 && a.onEdge && a.size >= 44), 'book: arrows are centred on the left and right edges, 44px', JSON.stringify(side));
    const l0 = await pg.evaluate(() => document.querySelector('[data-folio-progress]').textContent);
    await pg.locator('.folio-side.is-next').click();
    await pg.waitForTimeout(1300);
    check((await pg.evaluate(() => document.querySelector('[data-folio-progress]').textContent)) !== l0, 'book: the side arrow turns the page');
    await pg.close();

    const html = fs.readFileSync(path.join(WWW, 'index.html'), 'utf8');
    const firstStyle = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
    const sidebarAt = html.indexOf('id="sidebarContactSub"');
    check(html.indexOf('<style>') < sidebarAt && /\.sidebar-subnav\s*\{\s*display:\s*none/.test(firstStyle) && /\.sidebar-subitem svg[^{]*\{[^}]*width:\s*16px/.test(firstStyle),
      'sidebar: the submenu is collapsed and its icons sized before its markup is parsed');
  }

  // The room moves, everywhere, and stands down when it should. The backdrop
  // was static dust on black; "continuous" is a property to measure, so each
  // piece is sampled twice and has to have moved.
  {
    const pg = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pg.goto(BASE + '/', { waitUntil: 'load' });
    await pg.waitForTimeout(6000);
    const snap = () => pg.evaluate(() => ({
      node: document.querySelector('.fd-node').getBoundingClientRect().left,
      glow: document.querySelector('.lux-a').getBoundingClientRect().left,
      dust: document.querySelector('.lux-d1').getBoundingClientRect().top,
      ring: getComputedStyle(document.querySelector('.lux-r1')).transform }));
    const a = await snap();
    await pg.waitForTimeout(3000);
    const z = await snap();
    check(Math.abs(z.glow - a.glow) > 1 && Math.abs(z.dust - a.dust) > 5 && z.ring !== a.ring, 'home: light, dust and rings are all moving with nobody touching the page', JSON.stringify({ glow: Math.round(z.glow - a.glow), dust: Math.round(z.dust - a.dust) }));
    check(Math.abs(z.node - a.node) > 5, 'home: the orbit turns on its own', String(Math.round(z.node - a.node)));
    // Keep the page moving and wait for the state, rather than sampling at a
    // guessed moment between the scroll starting and the governor releasing.
    const stoodDown = pg.waitForFunction(() => getComputedStyle(document.querySelector('.lux')).visibility === 'hidden', null, { timeout: 3000, polling: 30 }).then(() => true, () => false);
    for (let i = 0; i < 12; i++) { await pg.mouse.wheel(0, 120); await pg.waitForTimeout(40); }
    check(await stoodDown, 'home: the room stands down while the page scrolls');
    await pg.waitForTimeout(1200);
    check(await pg.evaluate(() => getComputedStyle(document.querySelector('.lux')).visibility === 'visible'), 'home: the room comes back when the scroll stops');
    await pg.close();

    const off = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const po = await off.newPage();
    await po.addInitScript(() => { try { localStorage.setItem('anchit-motion', 'off'); } catch (e) {} });
    await po.goto(BASE + '/', { waitUntil: 'load' });
    await po.waitForTimeout(2500);
    check(await po.evaluate(() => document.querySelector('.lux').getAnimations({ subtree: true }).length === 0), 'home: with Motion off nothing in the room animates');
    await po.goto(BASE + '/lifecycle-os', { waitUntil: 'load' });
    await po.waitForTimeout(2500);
    check(!(await po.evaluate(() => !!document.querySelector('.cin-room'))), 'linked pages: with Motion off the room is not built');
    await off.close();

    for (const [href, want] of [['/freelancer', true], ['/lifecycle-os', true], ['/growth-school', true], ['/deli-chic/', false], ['/task-tracker', false]]) {
      const p2 = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await p2.goto(BASE + href, { waitUntil: 'load' });
      await p2.waitForTimeout(3000);
      const r = await p2.evaluate(() => { const room = document.querySelector('.cin-room');
        return { room: !!room, running: room ? room.getAnimations({ subtree: true }).filter(x => x.playState === 'running').length : 0,
          behind: room ? getComputedStyle(room).zIndex === '-1' && getComputedStyle(room).pointerEvents === 'none' : true,
          overflow: document.documentElement.scrollWidth - innerWidth }; });
      if (want) check(r.room && r.running >= 4 && r.behind && r.overflow <= 1, `${href}: has a moving room, behind the page, no overflow`, JSON.stringify(r));
      else check(!r.room, `${href}: is left without a room (a storefront or a full-screen app)`);
      await p2.close();
    }

    // Curtains: all four placed and moving. A selector that counted siblings
    // of the same tag left two of them unpositioned and still.
    const pv = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pv.goto(BASE + '/hotel', { waitUntil: 'load' });
    await pv.waitForTimeout(3000);
    const veil = await pv.evaluate(() => [...document.querySelectorAll('.cin-room .cr-veil')].map(v => ({
      x: Math.round(v.getBoundingClientRect().left), moving: v.getAnimations().some(a => a.playState === 'running') })));
    check(veil.length === 4 && veil.every(v => v.moving) && new Set(veil.map(v => Math.round(v.x / 60))).size === 4, '/hotel: four curtains, four places, all moving', JSON.stringify(veil));
    await pv.close();

    // A page that loads with its own Motion switch off builds the room when
    // the switch is turned on, and hides it again when turned off.
    const cf = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pf = await cf.newPage();
    await pf.addInitScript(() => { try { localStorage.setItem('freelancer-motion', 'off'); } catch (e) {} });
    await pf.goto(BASE + '/freelancer', { waitUntil: 'load' });
    await pf.waitForTimeout(2500);
    const before = await pf.evaluate(() => !!document.querySelector('.cin-room'));
    await pf.locator('#motion-toggle').click();
    await pf.waitForTimeout(1200);
    const on = await pf.evaluate(() => { const r = document.querySelector('.cin-room'); return !!r && getComputedStyle(r).display !== 'none'; });
    await pf.locator('#motion-toggle').click();
    await pf.waitForTimeout(400);
    const offAgain = await pf.evaluate(() => { const r = document.querySelector('.cin-room'); return !r || getComputedStyle(r).display === 'none'; });
    check(!before && on && offAgain, '/freelancer: the room follows the Motion switch in both directions after load', JSON.stringify({ before, on, offAgain }));
    await cf.close();

    // The room follows a page's own theme switch: gone on light, back on dark.
    const pt = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await pt.goto(BASE + '/lifecycle-os', { waitUntil: 'load' });
    await pt.waitForTimeout(3000);
    const shown = () => pt.evaluate(() => { const r = document.querySelector('.cin-room'); return !!r && getComputedStyle(r).display !== 'none'; });
    const theme = () => pt.evaluate(() => document.documentElement.getAttribute('data-theme'));
    const t0 = await theme(), dark0 = await shown();
    const btn = pt.locator('button:has-text("Theme")').first();
    await btn.click();
    await pt.waitForTimeout(1500);
    const t1 = await theme(), light = await shown();
    await btn.click();
    await pt.waitForTimeout(1500);
    const dark1 = await shown();
    check(dark0 && t1 !== t0 && !light && dark1, '/lifecycle-os: the room hides on the light theme and returns on dark', JSON.stringify({ t0, t1, dark0, light, dark1 }));
    await pt.close();
  }

  // Motion off, saved on the origin, must hold on the incoming page before its
  // first frame, including a page that never loads the shared motion runtime.
  for (const href of ['/growth-school', '/pw-study/', '/ayushi-rawat/']) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const pg = await ctx.newPage();
    await pg.addInitScript(() => { try { localStorage.setItem('anchit-motion', 'off'); } catch (e) {} });
    await pg.goto(BASE + href, { waitUntil: 'domcontentloaded' });
    const off = await pg.evaluate(() => document.documentElement.classList.contains('pt-off'));
    check(off, `Motion off is honoured on arrival at ${href}`);
    await ctx.close();
  }
  await browser.close();

  console.log(failed ? `\n${failed} check(s) failed` : '\nall checks passed');
  process.exit(failed ? 1 : 0);
})();
