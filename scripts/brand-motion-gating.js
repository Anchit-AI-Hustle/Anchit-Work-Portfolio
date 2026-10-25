// Motion regression tests for the two brand microsites.
//
// Every check here is a bug that was actually shipped on these pages, and each
// one is invisible in the diff — the source looked right in all five cases, and
// only the rendered page showed otherwise. That is why this suite drives a real
// browser instead of grepping.
//
//   1. decorations animating off screen. The house rule is that nothing
//      decorative runs while off screen. The timeline and the bench honoured
//      it; the counter scene (nine loops), the marquee, the orbit pulse and the
//      Deli Chic ticker did not, and ran for the length of the page.
//   2. the gate has to PAUSE, not restart. The counter scene is a 14s cycle; if
//      re-entering view snapped it back to the portafilter lock it would read as
//      a glitch rather than a loop.
//   3. pointer-driven effects writing `left`/`top`. Both the custom cursor
//      (page-wide, every mousemove) and the loupe (the interaction the brand
//      actually sells) forced layout at pointer-polling rate.
//   4. those writes have to be coalesced to a frame. mousemove fires more often
//      than the compositor paints.
//   5. reduced motion must not be handed smooth scrolling back. Gram Street
//      re-declared `scroll-behavior: smooth` INSIDE its own
//      prefers-reduced-motion block.
//
// Also guards the thing that started the audit: neither page should fetch
// ScrollTrigger, because neither page uses it.
//
// Each check is paired with a MUTATION that undoes the fix, so the suite can be
// shown to fail when the bug comes back:
//
//   npm run build && npx serve -l 8099 www          # in another shell
//   node scripts/brand-motion-gating.js
//   MUT=no_gate       node scripts/brand-motion-gating.js  # expect a FAIL
//   MUT=gate_restarts node scripts/brand-motion-gating.js  # expect a FAIL
//   MUT=cursor_layout node scripts/brand-motion-gating.js  # expect a FAIL
//   MUT=loupe_layout  node scripts/brand-motion-gating.js  # expect a FAIL
//   MUT=no_coalesce   node scripts/brand-motion-gating.js  # expect a FAIL
//   MUT=rm_smooth     node scripts/brand-motion-gating.js  # expect a FAIL
const { chromium } = require('./_playwright.js');
const MUT = process.env.MUT || '';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

const results = [];
const chk = (name, ok, detail) => results.push({ name, ok: !!ok, detail: detail || '' });

// Loops that must be running in view and idle out of it. `sel` is the element
// that actually carries the animation — for the rails that is a pseudo-element,
// which is why the probe takes one.
const PAGES = [
  {
    name: 'Gram Street', path: '/gram-street-coffee/',
    loops: [
      { label: 'counter scene csGlow',  sel: '.cs-bulb',         scope: '.counter-scene' },
      { label: 'counter scene csSteam', sel: '.cs-steam path',   scope: '.counter-scene' },
      { label: 'counter scene csMote',  sel: '.cs-motes circle', scope: '.counter-scene' },
      { label: 'counter scene csSheen', sel: '.cs-sheen',        scope: '.counter-scene' },
      { label: 'marquee slide',         sel: '.track',           scope: '.marquee' },
      { label: 'orbit pulse',           sel: '#orbit .pulse',    scope: '#orbit' },
      { label: 'timeline fill',         sel: '.timeline',        scope: '.timeline', pseudo: '::after' },
    ],
    // loops whose gate must preserve phase rather than restart
    phase: [{ label: 'counter scene', sel: '.cs-bulb', scope: '.counter-scene' }],
  },
  {
    name: 'Deli Chic', path: '/deli-chic/',
    loops: [
      { label: 'ticker deliMarquee', sel: '.deli-track', scope: '.deli-ticker' },
    ],
    phase: [{ label: 'ticker', sel: '.deli-track', scope: '.deli-ticker' }],
  },
];

function probe(a) {
  const el = document.querySelector(a.sel);
  if (!el) return { missing: true };
  const cs = getComputedStyle(el, a.pseudo || undefined);
  return {
    play: cs.animationPlayState,
    name: cs.animationName,
    delay: cs.animationDelay,
  };
}
function scopeInView(sel) {
  const el = document.querySelector(sel);
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.top < innerHeight;
}

const mutations = {
  // 1. remove the off-screen gate
  no_gate: () => {
    const s = document.createElement('style');
    s.textContent = `
      .counter-scene:not(.is-live) *,
      .marquee:not(.is-live) .track,
      #orbit:not(.is-live) .pulse,
      .deli-ticker:not(.is-live) .deli-track { animation-play-state: running !important; }`;
    document.head.appendChild(s);
  },
  // 2. gate by dropping the animation instead of pausing it, so returning to
  //    view restarts the cycle from zero
  gate_restarts: () => {
    const s = document.createElement('style');
    s.textContent = `
      .counter-scene:not(.is-live) *,
      .deli-ticker:not(.is-live) .deli-track { animation: none !important; }`;
    document.head.appendChild(s);
  },
  // 3a. put the cursor back on left/top
  cursor_layout: () => {
    const el = document.getElementById('customCursor');
    if (!el) return;
    addEventListener('mousemove', (e) => {
      el.style.left = e.clientX + 'px';
      el.style.top = e.clientY + 'px';
    });
  },
  // 3b. put the loupe back on left/top
  loupe_layout: () => {
    const g = document.getElementById('heroLoupeGlass');
    const c = document.querySelector('.loupe-container');
    if (!g || !c) return;
    c.addEventListener('mousemove', (e) => {
      const r = c.getBoundingClientRect();
      g.style.left = (e.clientX - r.left) + 'px';
      g.style.top = (e.clientY - r.top) + 'px';
    });
  },
  // 4. write on every sample instead of once a frame
  no_coalesce: () => {
    const el = document.getElementById('customCursor');
    if (!el) return;
    addEventListener('mousemove', (e) => {
      el.style.setProperty('--cx', e.clientX + 'px');
      el.style.setProperty('--cy', e.clientY + 'px');
    });
  },
  // 5. hand smooth scrolling back under reduced motion
  rm_smooth: () => {
    const s = document.createElement('style');
    s.textContent = `@media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: smooth !important; } }`;
    document.head.appendChild(s);
  },
};

async function newPage(b, opts) {
  const p = await b.newPage(Object.assign({ viewport: { width: 1280, height: 860 } }, opts));
  if (MUT && mutations[MUT]) {
    // addInitScript runs before the document exists: document.head is null and
    // getElementById returns null, so a mutation applied straight from here
    // silently does not apply — and the suite then reports a false PASS for the
    // bug it was meant to catch. Each mutation is deferred until after the
    // page's own script has run, so it really is undoing the fix.
    await p.addInitScript({
      content:
        'var __mut = ' + mutations[MUT].toString() + ';\n' +
        'function __applyMut() { try { __mut(); } catch (e) { console.error("mutation failed:", e); } }\n' +
        'if (document.readyState === "loading") {\n' +
        '  document.addEventListener("DOMContentLoaded", function () { setTimeout(__applyMut, 50); });\n' +
        '} else { setTimeout(__applyMut, 50); }\n',
    });
  }
  return p;
}


(async () => {
  const b = await chromium.launch();

  for (const page of PAGES) {
    const p = await newPage(b);
    const errs = [];
    const reqs = [];
    p.on('pageerror', (e) => errs.push(e.message));
    p.on('request', (r) => reqs.push(r.url()));
    await p.goto(BASE + page.path, { waitUntil: 'load' });
    await p.waitForTimeout(1500);

    chk(`${page.name}: ScrollTrigger not fetched`,
        !reqs.some((u) => u.includes('ScrollTrigger')),
        reqs.filter((u) => u.includes('ScrollTrigger')).join(', ') || 'no request for it');

    /* ---- 1. every ambient loop idles off screen ---- */
    for (const l of page.loops) {
      const exists = await p.evaluate((s) => !!document.querySelector(s), l.sel);
      if (!exists) { chk(`${page.name}: ${l.label} idles off screen`, true, 'not in DOM — skipped'); continue; }

      await p.evaluate((s) => document.querySelector(s)
        .scrollIntoView({ block: 'center', behavior: 'instant' }), l.scope);
      await p.waitForTimeout(2600);
      const on = await p.evaluate(probe, { sel: l.sel, pseudo: l.pseudo });
      const onVis = await p.evaluate(scopeInView, l.scope);

      if (on.name === 'none') { chk(`${page.name}: ${l.label} idles off screen`, true, 'no animation on this element — skipped'); continue; }

      await p.evaluate((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        window.scrollBy(0, r.bottom + window.innerHeight * 1.5);
      }, l.scope);
      await p.waitForTimeout(900);
      const off = await p.evaluate(probe, { sel: l.sel, pseudo: l.pseudo });
      const offVis = await p.evaluate(scopeInView, l.scope);

      if (offVis) { chk(`${page.name}: ${l.label} idles off screen`, true, 'could not clear the viewport — skipped'); continue; }

      // idle means either paused, or the gating selector dropped the animation
      const idle = off.play === 'paused' || off.name === 'none';
      const ran = on.play === 'running' && onVis;
      chk(`${page.name}: ${l.label} idles off screen`, ran && idle,
          `${on.name}: in view ${on.play}, out of view ${off.name === 'none' ? 'no animation' : off.play}`);
    }

    /* ---- 2. the gate preserves phase ---- */
    for (const ph of page.phase) {
      const exists = await p.evaluate((s) => !!document.querySelector(s), ph.sel);
      if (!exists) { chk(`${page.name}: ${ph.label} gate resumes, not restarts`, true, 'not in DOM — skipped'); continue; }
      await p.evaluate((s) => document.querySelector(s)
        .scrollIntoView({ block: 'center', behavior: 'instant' }), ph.scope);
      await p.waitForTimeout(600);
      const back = await p.evaluate(probe, { sel: ph.sel, pseudo: ph.pseudo });
      // A gate that removes the animation reports animationName "none" while
      // out of view; a gate that pauses keeps the name throughout. Pausing is
      // what preserves the cycle's phase.
      await p.evaluate((s) => {
        const r = document.querySelector(s).getBoundingClientRect();
        window.scrollBy(0, r.bottom + window.innerHeight * 1.5);
      }, ph.scope);
      await p.waitForTimeout(700);
      const away = await p.evaluate(probe, { sel: ph.sel, pseudo: ph.pseudo });
      chk(`${page.name}: ${ph.label} gate resumes, not restarts`,
          away.name !== 'none' && away.play === 'paused',
          away.name === 'none' ? 'animation removed off screen — returning restarts the cycle'
                               : `held as ${away.name}, ${away.play}`);
    }

    chk(`${page.name}: no page errors`, errs.length === 0, errs[0] || 'none');
    await p.close();
  }

  /* ---- 3 + 4. pointer-driven effects: transform, not layout; one write a frame ---- */
  {
    const p = await newPage(b);
    await p.goto(BASE + '/gram-street-coffee/', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    await p.mouse.move(400, 300);
    await p.mouse.move(900, 620);
    await p.waitForTimeout(200);
    const cur = await p.evaluate(() => {
      const el = document.getElementById('customCursor');
      if (!el) return null;
      const cs = getComputedStyle(el);
      return { inlineLeft: el.style.left, inlineTop: el.style.top,
               left: cs.left, top: cs.top, tf: cs.transform };
    });
    chk('Gram Street: cursor moves by transform, not left/top',
        cur && cur.inlineLeft === '' && cur.inlineTop === '' && cur.left === '0px' && cur.top === '0px' && /matrix/.test(cur.tf),
        cur ? `inline left "${cur.inlineLeft}", computed left ${cur.left}, ${cur.tf.slice(0, 32)}…` : 'cursor not on the page');

    const co = await p.evaluate(async () => {
      const el = document.getElementById('customCursor');
      if (!el) return null;
      let writes = 0;
      const real = el.style.setProperty.bind(el.style);
      el.style.setProperty = (n, v) => { if (n === '--cx') writes++; return real(n, v); };
      const EVENTS = 120;
      for (let i = 0; i < EVENTS; i++) {
        window.dispatchEvent(new MouseEvent('mousemove', { clientX: 100 + i * 4, clientY: 300, bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 400));
      return { events: EVENTS, writes };
    });
    chk('Gram Street: cursor writes are coalesced to the frame',
        co && co.writes > 0 && co.writes < co.events / 4,
        co ? `${co.events} mousemove events → ${co.writes} style write(s)` : 'cursor not on the page');
    await p.close();
  }

  {
    const p = await newPage(b);
    await p.goto(BASE + '/deli-chic/', { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    const has = await p.evaluate(() => !!document.querySelector('.loupe-container'));
    if (!has) chk('Deli Chic: loupe moves by transform, not left/top', true, 'loupe not on the page — skipped');
    else {
      await p.evaluate(() => document.querySelector('.loupe-container')
        .scrollIntoView({ block: 'center', behavior: 'instant' }));
      await p.waitForTimeout(400);
      const r = await p.evaluate(() => {
        const b = document.querySelector('.loupe-container').getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      });
      await p.mouse.move(r.x + r.w * 0.5, r.y + r.h * 0.5);
      await p.waitForTimeout(120);
      await p.mouse.move(r.x + r.w * 0.7, r.y + r.h * 0.35);
      await p.waitForTimeout(250);
      const g = await p.evaluate(() => {
        const el = document.getElementById('heroLoupeGlass');
        if (!el) return null;
        const cs = getComputedStyle(el);
        return { inlineLeft: el.style.left, inlineTop: el.style.top,
                 left: cs.left, top: cs.top, tf: cs.transform,
                 display: cs.display, bg: el.style.backgroundPosition };
      });
      chk('Deli Chic: loupe moves by transform, not left/top',
          g && g.inlineLeft === '' && g.inlineTop === '' && g.left === '0px' && g.top === '0px' && /matrix/.test(g.tf),
          g ? `inline left "${g.inlineLeft}", computed left ${g.left}` : 'glass not found');
      chk('Deli Chic: loupe still magnifies and shows',
          g && g.display === 'block' && g.bg !== '' && !/NaN/.test(g.bg),
          g ? `display ${g.display}, background-position ${g.bg}` : 'glass not found');
    }
    await p.close();
  }

  /* ---- 5. reduced motion keeps scroll-behavior auto on both pages ---- */
  for (const page of PAGES) {
    const p = await newPage(b, { reducedMotion: 'reduce' });
    await p.goto(BASE + page.path, { waitUntil: 'load' });
    await p.waitForTimeout(600);
    const sb = await p.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    chk(`${page.name}: reduced motion keeps scroll-behavior auto`, sb === 'auto', `computed "${sb}"`);
    const h1 = await p.evaluate(() => {
      const h = document.querySelector('h1');
      return h ? getComputedStyle(h).opacity : null;
    });
    chk(`${page.name}: reduced motion leaves the headline visible`,
        h1 === null || parseFloat(h1) > 0.9, `h1 opacity ${h1}`);
    await p.close();
  }

  const pass = results.filter((r) => r.ok).length;
  console.log(`\n${MUT ? 'MUTATION ' + MUT + ' → ' : ''}${pass}/${results.length} passed`);
  results.forEach((r) => console.log('  ' + (r.ok ? 'PASS' : 'FAIL') + '  ' + r.name.padEnd(56) + r.detail));
  if (MUT) console.log('  (a good mutation should make at least one of these FAIL)');
  await b.close();
  process.exit(pass === results.length ? 0 : 1);
})();
