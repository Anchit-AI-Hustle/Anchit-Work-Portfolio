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
    await pg.waitForTimeout(1500);
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
