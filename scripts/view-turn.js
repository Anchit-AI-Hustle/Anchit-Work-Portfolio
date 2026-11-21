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
