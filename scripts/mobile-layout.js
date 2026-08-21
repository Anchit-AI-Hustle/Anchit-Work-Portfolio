// Nothing is cut off on a phone.
//
// Reported as text cut off on mobile, and it was: the hero headline rendered as
// "Hey, I'" / "Anchi" / "Tando", clipped mid-word.
//
// The cause is worth remembering, because the fix for it was already written.
// `.hero-id` is a flex row holding the portrait, the eyebrow and the <h1>. A
// comment beside it describes this exact defect — "the portrait took 202px …
// leaving 61px display type to set in a 227px column" — and the grid that fixes
// it, giving the name a full-width row of its own. That grid lived inside
// `@media (min-width: 768px)`, which is the one place the defect barely showed.
// Below 768px the flex row survived, and the NARROWER the screen the worse it
// got: at 390px the h1 was left a 123px column for type whose natural width is
// 401px, wrapped to four lines, and ran 41px past the right edge.
//
// So this checks the phone, where the squeeze is worst, rather than trusting a
// rule that was verified at the width where it was least needed.
//
// Run against a served build:  node scripts/mobile-layout.js
// MUT=hero  restores the flex row      — the headline checks must fail.
// MUT=label restores the squeezed pills — the clipping check must fail.
// A single mutant would leave the other checks unverified, and a check nothing
// can break is a check that passes everything.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
// The narrow end of the range that actually reaches the site, plus the width
// just under the old breakpoint, which is where the fix used to stop.
const WIDTHS = [360, 390, 430, 767];

const MUTANTS = {
  // The layout as it was: the grid removed, the row restored.
  hero: {
    css: `
      .hero-id { display: flex !important; align-items: center !important; gap: 24px !important; }
      .hero-id > .hold-reveal, .hero-id > div:not(.hold-reveal), .hero-id .hero-name { grid-area: auto !important; }
      .hero-id .hero-portrait { width: 138px !important; height: 138px !important; }`,
    breaks: /headline/,
  },
  // The top-bar pills as they were: shrinkable, and ellipsis with no nowrap to
  // fire it, so the label hard-clipped to its first character.
  label: {
    css: `
      .top-bar-link { flex: 1 1 auto !important; min-width: 0 !important; }
      .top-bar-link .tb-label { white-space: normal !important; max-width: none !important; }`,
    breaks: /clipped/,
  },
};
const MUT = MUTANTS[process.env.MUT] ? process.env.MUT : (process.env.MUT ? 'hero' : '');

/** Boxes past the right edge, and text clipped by its own box. Deliberate
 *  horizontal scrollers and decorative bleeds are not defects: a marquee is
 *  meant to be wider than its frame, and a glow is meant to run off the card.
 *  Both are excluded by what they are, not by name. */
const MEASURE = (vw) => {
  const out = { overflow: [], clipped: [], hero: null };
  // Stops BELOW body on purpose. `html, body { overflow-x: clip }` is the
  // page's last-resort guard against a sideways shift, not a decision that a
  // particular row scrolls — counting it excluded every element on the page and
  // left this check unable to fail at all.
  const clipsOrScrolls = (el) => {
    for (let n = el; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (/hidden|clip|auto|scroll/.test(cs.overflowX)) return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    if (cs.pointerEvents === 'none' && !el.textContent.trim()) continue; // decorative layer
    const b = el.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) continue;
    const id = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '')
      + (typeof el.className === 'string' && el.className.trim()
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const hasOwnText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (hasOwnText && b.right - vw > 1 && !clipsOrScrolls(el)) {
      out.overflow.push(`${id} +${Math.round(b.right - vw)}px`);
    }
    // Text laid out wider than the box drawing it, with no way to reach it and
    // no sign that anything is missing. `text-overflow: ellipsis` is excluded:
    // that is truncation the reader can SEE, which is a choice. A hard clip is
    // not — it is how "WhatsApp" became "W".
    const truncatesVisibly = cs.textOverflow === 'ellipsis' && cs.whiteSpace === 'nowrap';
    if (hasOwnText && el.scrollWidth - el.clientWidth > 2
        && /hidden|clip/.test(cs.overflowX) && !truncatesVisibly) {
      out.clipped.push(`${id} ${el.scrollWidth}>${el.clientWidth}`);
    }
  }
  const h = document.querySelector('.hero-name');
  if (h) {
    const b = h.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(h).fontSize);
    const probe = h.cloneNode(true);
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap;width:auto;left:-9999px';
    document.body.appendChild(probe);
    const natural = Math.round(probe.getBoundingClientRect().width);
    probe.remove();
    out.hero = { w: Math.round(b.width), right: Math.round(b.right),
      lines: Math.round(b.height / fs), natural, fits: b.right <= vw + 1 };
  }
  return out;
};

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const results = [];
  const check = (n, ok, d) => results.push([ok ? 'PASS' : 'FAIL', n, d]);

  const overflow = [], clipped = [], heroes = [];
  for (const vw of WIDTHS) {
    const page = await b.newPage({ viewport: { width: vw, height: 844 } });
    await page.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    if (MUT) await page.addStyleTag({ content: MUTANTS[MUT].css });
    await page.waitForTimeout(1200);
    const r = await page.evaluate(MEASURE, vw);
    overflow.push(...r.overflow.map((x) => `${vw}px ${x}`));
    clipped.push(...r.clipped.map((x) => `${vw}px ${x}`));
    if (r.hero) heroes.push([vw, r.hero]);
    await page.close();
  }

  // Proof the sweep looked at a real page. A check that measures nothing
  // passes everything.
  check('the phone sweep rendered every width',
    heroes.length === WIDTHS.length,
    heroes.map(([v, h]) => `${v}:${h.w}px/${h.lines}L`).join(' '));

  check('no text runs past the right edge of the phone',
    overflow.length === 0,
    overflow.length ? [...new Set(overflow)].slice(0, 4).join(', ') : 'nothing overflows');

  check('no text is clipped by the box drawing it',
    clipped.length === 0,
    clipped.length ? [...new Set(clipped)].slice(0, 4).join(', ') : 'nothing clipped');

  // The headline is the page's name. It gets its measure at every width, not
  // only above the breakpoint where the grid used to start.
  const heroFits = heroes.every(([, h]) => h.fits);
  check('the headline fits the viewport at every phone width',
    heroFits,
    heroes.map(([v, h]) => `${v}:right=${h.right}`).join(' '));

  // Display type set in a column narrower than a third of its natural width is
  // the shape of the defect: four lines of five characters.
  const heroMeasure = heroes.every(([, h]) => h.w >= h.natural * 0.55 || h.lines <= 2);
  check('the headline gets a usable measure, not a four-line sliver',
    heroMeasure,
    heroes.map(([v, h]) => `${v}:${h.w}/${h.natural}px ${h.lines}L`).join(' '));

  for (const [ok, n, d] of results) console.log(`  ${ok}  ${n.padEnd(52)} ${d}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await b.close();

  if (MUT) {
    // Each mutant names the checks it is supposed to break. Demanding that ALL
    // of them fail would be dishonest — a hero-layout mutation cannot break a
    // top-bar label, and pretending otherwise hides which check is really
    // covered.
    const target = results.filter((r) => MUTANTS[MUT].breaks.test(r[1]));
    const wrong = target.filter((r) => r[0] === 'PASS').map((r) => r[1]);
    if (!target.length) { console.log(`MUT=${MUT}: matched no checks — the mutant and the checks have drifted apart`); process.exit(1); }
    if (!wrong.length) { console.log(`MUT=${MUT}: all ${target.length} check(s) it targets failed, as they must`); process.exit(0); }
    console.log(`MUT=${MUT}: still passing — ` + wrong.join('; '));
    process.exit(1);
  }
  process.exit(failed ? 1 : 0);
})();
