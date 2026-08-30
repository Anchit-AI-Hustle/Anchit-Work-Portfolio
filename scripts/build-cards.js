// Are the Side Hustle cards actually the same size, and does every one explain
// what the tool is for?
//
// The fault: descriptions ran 91-507 characters across 13 cards. The rail is a
// flexbox so the cards stretched to match the tallest, which meant one card set
// the height, the rest carried a void, and on a laptop the row overshot the
// viewport and was clipped mid-card. Shortening the copy alone does not hold —
// the next long paragraph re-breaks it — so each field has a fixed line budget
// and this measures the rendered result rather than the source.
//
// Run against a served build:  node scripts/build-cards.js
// MUT=1 relaxes the thresholds to what the old layout produced; every check
// must then fail, or the check is not measuring what it claims.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const MUT = process.env.MUT === '1';
const TOL = 2;                    // px; sub-pixel rounding across 13 cards

// The mutation puts the ACTUAL pre-fix layout back, rather than tightening a
// tolerance — a stricter threshold against a spread of exactly 0 still passes
// and proves nothing. Each line here is one of the faults that was measured:
// an oversized placeholder, unclamped copy, two competing auto margins, and a
// wrapping action row.
const MUTANT_CSS = `
  .build-card { contain-intrinsic-size: auto 640px !important; }
  .build-purpose { display: none !important; }
  .build-card > p:not(.build-purpose) { -webkit-line-clamp: none !important; display: block !important; min-height: 0 !important; }
  .build-details { height: auto !important; }
  .build-details li { -webkit-line-clamp: none !important; display: flex !important; }
  .build-tag { flex-wrap: wrap !important; height: auto !important; }
  .build-card .build-actions { height: auto !important; min-height: 68px !important; flex-wrap: wrap !important; margin-top: auto !important; }
  .hero-problem { display: none !important; }
  .hero-problem .bp-text { -webkit-line-clamp: 1 !important; display: -webkit-box !important; overflow: hidden !important; }
  .builds-grid { align-items: flex-start !important; }
  .build-card:nth-child(3) { height: 380px !important; }
`;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  const results = [];
  // covered=false marks a content assertion: true or false regardless of CSS,
  // so the mutation run neither can nor should break it. Same honesty as the
  // 'early scroll is never thrown back' note in README.
  const check = (name, ok, detail, covered = true) =>
    results.push([ok ? 'PASS' : 'FAIL', name, detail, covered]);

  await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load', timeout: 25000 });
  // Assigning location.hash does NOT activate the view — switchView is wired to
  // clicks on [data-view]. Setting the hash alone left #view-projects at
  // display:none, so every card measured 0x0 and the whole suite passed on
  // nothing. Drive it the way a visitor does.
  await p.click('.sidebar-item[data-view="projects"]');
  // Reveal everything up front, with no stagger, and measure the state a
  // visitor ends in.
  //
  // Reveals are one-at-a-time and blockDelay accumulates across the whole page,
  // so the cards at the end of this row are still mid-entrance many SECONDS
  // after the section opens, and every element added above the grid pushes them
  // later still. Measuring on a fixed timer therefore measured whatever the
  // queue had reached: a child still at .reveal-stagger > *'s start state,
  // scale(.96) translateY(34px), reports a rect 4% short of its own layout box,
  // which reads here as unequal action rows and text cut mid-line. That is how
  // a section added ABOVE the grid could fail card geometry that had not
  // changed.
  //
  // Not data-motion="off": that is the reduced-motion path and it also collapses
  // the horizontal rail, so the cards stop being the fixed-basis row this suite
  // exists to measure (widths went 351-722px). Only the reveal state is forced.
  // Entrances that never finish are a real defect, but they belong to
  // scripts/stuck-entrance.js, not here.
  await p.evaluate(() => {
    document.querySelectorAll('.reveal, .reveal-stagger, .reveal-left, .reveal-right, .reveal-scale')
      .forEach((el) => {
        el.style.transitionDelay = '0s';
        for (const k of el.children) k.style.transitionDelay = '0s';
        el.classList.add('in');
      });
  });
  if (MUT) await p.addStyleTag({ content: MUTANT_CSS });
  await p.waitForTimeout(2500);
  const visible = await p.evaluate(() =>
    getComputedStyle(document.querySelector('#view-projects')).display !== 'none' &&
    document.querySelector('.builds-grid .build-card').getBoundingClientRect().height > 0);
  if (!visible) { console.log('  FAIL  the projects view never rendered — measurements would be meaningless'); process.exit(1); }

  // .build-card carries content-visibility:auto with contain-intrinsic-size,
  // so a card parked outside the rail's visible window is NOT laid out and
  // reports its placeholder size instead of its real one. Measuring the row in
  // one pass therefore compares 8 real cards against 5 estimates. Scroll each
  // one into the rail before reading it.
  const n = await p.evaluate(() => document.querySelectorAll('.builds-grid .build-card').length);
  for (let i = 0; i < n; i++) {
    await p.evaluate((i) => {
      const c = document.querySelectorAll('.builds-grid .build-card')[i];
      c.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' });
    }, i);
    await p.waitForTimeout(120);
  }
  // 0.7s transitions with the delays zeroed; wait for the geometry itself to
  // stop moving rather than trusting a timer, and FAIL if it never does.
  const settled = await p.waitForFunction(() => {
    const identity = (el) => {
      const t = getComputedStyle(el).transform;
      if (t === 'none') return true;
      const m = t.match(/matrix\(([^)]+)\)/);
      if (!m) return false;
      const v = m[1].split(',').map(Number);
      // The easing (cubic-bezier(.16,1,.3,1)) has a long asymptotic tail, so
      // "finished" is never exactly identity. These bounds admit the tail and
      // still catch a park: the start state is scale(.96) translateY(34px), an
      // order of magnitude outside both. At 1% the residual on a 41px box is
      // 0.4px, inside the 2px these checks allow.
      return Math.abs(v[0] - 1) < 0.01 && Math.abs(v[3] - 1) < 0.01 && Math.abs(v[5]) < 3;
    };
    return [...document.querySelectorAll('.builds-grid .build-card')]
      .every((c) => c.classList.contains('in') && [...c.children].every(identity));
  }, { timeout: 20000 }).then(() => true).catch(() => false);
  if (!settled) {
    console.log('  FAIL  the cards never stopped moving, so they cannot be measured');
    process.exit(1);
  }

  const m = await p.evaluate(() => {
    const cards = [...document.querySelectorAll('.builds-grid .build-card')];
    return {
      count: cards.length,
      heights: cards.map((c) => Math.round(c.getBoundingClientRect().height)),
      widths: cards.map((c) => Math.round(c.getBoundingClientRect().width)),
      // Offset of the actions row from the card's own top — the thing that reads
      // as "misaligned" when it differs card to card.
      actionTop: cards.map((c) => {
        const a = c.querySelector('.build-actions');
        return a ? Math.round(a.getBoundingClientRect().top - c.getBoundingClientRect().top) : -1;
      }),
      purpose: cards.map((c) => {
        const el = c.querySelector('.build-purpose');
        // Rendered, not merely present — textContent is still returned for a
        // display:none node, so reading it alone proves nothing.
        if (!el || el.getBoundingClientRect().height === 0) return '';
        return (el.textContent || '').replace(/\s+/g, ' ').trim();
      }),
      // Does any card's content spill past its own box?
      overflow: cards.map((c) => Math.max(0, c.scrollHeight - Math.round(c.getBoundingClientRect().height))),
      titles: cards.map((c) => (c.querySelector('h3')?.textContent || '').replace(/\s+/g, ' ').trim()),
      // Any clamped box whose visible height is not a whole multiple of its own
      // line-height is rendering a half-cut row of text.
      // The purpose line is the one field that must never be truncated — a
      // half-shown explanation is worse than none, and the clamp will happily
      // ellipsis it if the sentence is a few characters too long.
      clipped: cards.map((c) => {
        const el = c.querySelector('.bp-text');
        // A missing or hidden purpose line is the worst possible truncation,
        // not a pass — 0px of overflow on a 0px box is not "it fits".
        if (!el || el.getBoundingClientRect().height === 0) return 999;
        return Math.max(0, el.scrollHeight - el.clientHeight);
      }),
      sliced: cards.map((c) => {
        const bad = [];
        for (const sel of ['.bp-text', '.build-details li', 'p:not(.build-purpose)']) {
          for (const el of c.querySelectorAll(sel)) {
            const cs = getComputedStyle(el);
            const lh = parseFloat(cs.lineHeight);
            const h = el.getBoundingClientRect().height;
            if (!lh || !h) continue;
            const rem = h % lh;
            if (Math.min(rem, lh - rem) > 1.5) bad.push(sel + ' ' + h.toFixed(1) + 'px/' + lh.toFixed(1) + 'lh');
          }
        }
        return bad;
      }),
    };
  });

  const span = (a) => Math.max(...a) - Math.min(...a);

  check('all 13 cards are present', m.count === 13, `${m.count} cards`, false);

  check('every card is the same height',
    span(m.heights) <= TOL,
    `heights ${Math.min(...m.heights)}-${Math.max(...m.heights)}px (spread ${span(m.heights)}px)`);

  // Structural: .h-rail > * sets a fixed flex-basis, so this is guaranteed by
  // the rail rather than by the card. Recorded, not claimed as covered.
  check('every card is the same width',
    span(m.widths) <= TOL,
    `widths ${Math.min(...m.widths)}-${Math.max(...m.widths)}px (spread ${span(m.widths)}px)`, false);

  check('the action row sits at the same height on every card',
    span(m.actionTop) <= TOL,
    `action top ${Math.min(...m.actionTop)}-${Math.max(...m.actionTop)}px (spread ${span(m.actionTop)}px)`);

  const missing = m.purpose.map((t, i) => (t ? null : m.titles[i])).filter(Boolean);
  check('every card says what the tool is for',
    missing.length === 0,
    missing.length ? 'missing on: ' + missing.join(', ') : `all ${m.purpose.length} carry a purpose line`);

  // The purpose lines should read as one consistent field, not 13 different
  // lengths — that inconsistency is what made the old copy feel unsynchronised.
  const lens = m.purpose.map((t) => t.length);
  check('the purpose lines are a consistent length',
    span(lens) <= 45,
    `${Math.min(...lens)}-${Math.max(...lens)} chars (spread ${span(lens)})`, false);

  // The rail is a flexbox: an over-large contain-intrinsic-size on a card that
  // has not been laid out yet makes the whole row take that height on first
  // paint. This is the check that would have caught the 640px-vs-428px gap.
  // contain-intrinsic-size sizes the CONTENT box, so the placeholder a skipped
  // card contributes to the row is that value PLUS the card's vertical padding.
  // Comparing it against the border-box height directly is the mistake that put
  // 430px here and inflated every card to 476px on first paint.
  const intrinsic = await p.evaluate(() => {
    const el = document.querySelector('.build-card');
    const cs = getComputedStyle(el);
    const px = (cs.containIntrinsicSize || '').match(/(\d+(?:\.\d+)?)px/);
    return px ? parseFloat(px[1]) + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) : null;
  });
  check('the placeholder a not-yet-laid-out card contributes matches the real height',
    intrinsic !== null && Math.abs(intrinsic - m.heights[0]) <= 4,
    `placeholder resolves to ${intrinsic}px vs measured ${m.heights[0]}px`);

  const clipped = m.clipped.map((o, i) => (o > 1 ? `${m.titles[i]} (+${o}px)` : null)).filter(Boolean);
  check('no card’s purpose line is truncated',
    clipped.length === 0,
    clipped.length ? 'ellipsised on: ' + clipped.join(', ') : 'all 13 fit in full');

  const sliced = m.sliced.map((b, i) => (b.length ? m.titles[i] + ': ' + b[0] : null)).filter(Boolean);
  check('no clamped text is cut through the middle of a line',
    sliced.length === 0,
    sliced.length ? sliced.slice(0, 3).join(' | ') : 'every clamped box is a whole number of lines');

  // Back to home, then scroll the hero tile into view — it sits below the
  // cinematic boot sequence, so measuring it at scroll 0 measures an element
  // that has not been reached yet, not one that is broken.
  await p.click('.sidebar-item[data-view="home"]');
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('#homeHeroTile')
    .scrollIntoView({ block: 'center', behavior: 'instant' }));
  await p.waitForTimeout(2500);

  const spill = m.overflow.map((o, i) => (o > TOL ? `${m.titles[i]}:+${o}px` : null)).filter(Boolean);
  check('no card overflows its own box',
    spill.length === 0,
    spill.length ? spill.join(', ') : 'none');

  // The homepage has to answer the same question the cards do — what problem
  // is this solving — and it must not be truncated or hidden.
  const home = await p.evaluate(() => {
    const el = document.querySelector('.hero-problem');
    if (!el) return { present: false };
    const t = el.querySelector('.bp-text');
    return {
      present: true,
      visible: el.getBoundingClientRect().height > 0 && parseFloat(getComputedStyle(el).opacity) > 0.9,
      label: (el.querySelector('.bp-label')?.textContent || '').trim(),
      chars: (t?.textContent || '').trim().length,
      // A hidden box has scrollHeight === clientHeight === 0, which reads as
      // "nothing is cut off". It is the most cut off it can possibly be.
      truncated: (!t || t.getBoundingClientRect().height === 0)
        ? 999 : Math.max(0, t.scrollHeight - t.clientHeight),
    };
  });
  check('the homepage states the problem it solves',
    home.present && home.visible && home.chars > 80,
    home.present ? `"${home.label}", ${home.chars} chars, visible=${home.visible}` : 'no .hero-problem on the page');
  check('that statement is not truncated',
    home.truncated === 0, `${home.truncated}px cut off`);

  for (const [ok, name, detail, covered] of results)
    console.log(`  ${ok}  ${name.padEnd(56)}${covered ? '' : ' [content]'} ${detail}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);

  await b.close();
  if (MUT) {
    const cov = results.filter((r) => r[3]);
    const covFailed = cov.filter((r) => r[0] === 'FAIL');
    if (covFailed.length === cov.length) {
      console.log(`MUT: all ${cov.length} layout checks failed, as they must ` +
        `(${results.length - cov.length} content assertions are not CSS-breakable and are excluded)`);
      process.exit(0);
    }
    console.log('MUT: still passing — ' + cov.filter((r) => r[0] === 'PASS').map((r) => r[1]).join('; '));
    process.exit(1);
  }
  process.exit(failed ? 1 : 0);
})();
