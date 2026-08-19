// Enforces the DESIGN.md scales against the rendered page.
//
// DESIGN.md named three font families and a spacing scale but never a SIZE
// scale, so sizes drifted with nothing to catch them: one home-page viewport
// rendered 11 distinct ones (9, 11, 12, 14, 15, 16, 18, 19, 20, 24, 60), and
// the main layout blocks carried 170 off-scale paddings and gaps. Both are
// tokens now, and this is what keeps them that way — a design system nothing
// checks is a document, not a system.
//
// Run against a served build:  node scripts/design-system.js
// MUT=1 injects off-scale values; every check must fail.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const MUT = process.env.MUT === '1';
const TYPE = [11, 12, 14, 16, 20, 25, 31, 39, 49, 61, 76, 88];
const SPACE = [0, 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 88];
// Sizes clamp against the viewport, so a step can land a pixel either side.
const near = (v, scale) => scale.some((s) => Math.abs(s - v) <= 1);

// Enough distinct off-scale steps to reproduce the sprawl the scale was
// introduced to end, not just one stray value.
const MUTANT = `
  .hero-lede { font-size: 18.5px !important; }
  .hero-lede-sub { font-size: 17px !important; }
  .hero-problem { font-size: 15px !important; }
  .bp-label { font-size: 9px !important; }
  .build-card p { font-size: 15px !important; }
  .build-details li { font-size: 13px !important; }
  .build-tag { font-size: 10px !important; }
  #homeHeroTile { padding: 22px !important; }
  .build-card { padding: 18px !important; }
`;

const PAGES = [
  ['index.html', 'home', '#homeHeroTile'],
  ['index.html', 'projects', '.builds-grid'],
];

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const results = [];
  const check = (n, ok, d) => results.push([ok ? 'PASS' : 'FAIL', n, d]);
  const allSizes = new Set();
  const perView = [];
  const badType = [];
  const badSpace = [];
  const badContrast = [];

  for (const [page, view, anchor] of PAGES) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    await p.goto(`http://127.0.0.1:8099/${page}`, { waitUntil: 'load', timeout: 25000 });
    await p.waitForTimeout(2000);
    if (MUT) await p.addStyleTag({ content: MUTANT });
    if (view !== 'home') { await p.click(`.sidebar-item[data-view="${view}"]`); await p.waitForTimeout(1500); }
    await p.evaluate((a) => document.querySelector(a)?.scrollIntoView({ block: 'center', behavior: 'instant' }), anchor);
    await p.waitForTimeout(2500);

    const found = await p.evaluate(({ TYPE, SPACE }) => {
      const nearJs = (v, s) => s.some((x) => Math.abs(x - v) <= 1);
      const lum = (c) => { const [r, g, bl] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * bl; };
      const rgba = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(',').map(Number); return { c: a.slice(0, 3), a: a.length > 3 ? a[3] : 1 }; };
      const over = (fg, bg, a) => fg.map((v, i) => v * a + bg[i] * (1 - a));
      // Two ways this got contrast wrong before, both of which reported a
      // failure where the design is fine:
      //   1. A translucent background was read as opaque. Gold text on a 12%
      //      tint OF THAT SAME GOLD measured 1:1, when the real backdrop is the
      //      card behind it and the true ratio is ~8:1.
      //   2. A gradient was invisible. .btn.primary paints with
      //      background-image, so backgroundColor is transparent and the
      //      near-black label on an orange button measured against nothing.
      // So: composite the alpha stack, and take a gradient's colour stops into
      // account, scoring against the worst one.
      const stopsOf = (bgi) => (bgi.match(/rgba?\([^)]+\)/g) || []).map(rgba).filter(Boolean);
      const backdropsOf = (el) => {
        let n = el, acc = null, out = [];
        while (n && n !== document.documentElement) {
          const cs = getComputedStyle(n);
          // Only a FILLING gradient is a backdrop. The bullet dots in
          // .build-details are 3px radial-gradients; scoring body text against
          // that dot's orange reported 1.39:1 on copy that is actually fine.
          const fills = /linear-gradient|conic-gradient/.test(cs.backgroundImage || '');
          const stops = fills ? stopsOf(cs.backgroundImage) : [];
          if (stops.length) { stops.forEach((st) => out.push(acc ? over(acc.c, st.c, acc.a) : st.c)); return out.length ? out : [[15, 13, 10]]; }
          const b = rgba(cs.backgroundColor);
          if (b && b.a > 0) {
            if (b.a >= 0.999) return [acc ? over(acc.c, b.c, acc.a) : b.c];
            acc = acc ? { c: over(acc.c, b.c, acc.a), a: 1 - (1 - acc.a) * (1 - b.a) } : b;
          }
          n = n.parentElement;
        }
        return [acc ? over(acc.c, [15, 13, 10], acc.a) : [15, 13, 10]];
      };
      const onScreen = (el) => { const r = el.getBoundingClientRect(); return r.height > 4 && r.width > 4 && r.bottom > 0 && r.top < innerHeight; };

      const sizes = [], type = [], space = [], contrast = [];
      for (const el of document.querySelectorAll('.view.active *')) {
        if (!onScreen(el)) continue;
        const cs = getComputedStyle(el);
        if (el.textContent.trim() && !el.children.length) {
          const fs = Math.round(parseFloat(cs.fontSize) * 10) / 10;
          sizes.push(Math.round(fs));
          if (!nearJs(fs, TYPE)) type.push({ cls: (el.className || el.tagName).toString().slice(0, 34), fs });
          if (+cs.opacity > 0.3) {
            const f = rgba(cs.color);
            if (f) {
              const px = parseFloat(cs.fontSize), need = (px >= 24 || (px >= 18.66 && +cs.fontWeight >= 700)) ? 3 : 4.5;
              let worst = Infinity;
              for (const bg of backdropsOf(el)) {
                const fgc = f.a >= 0.999 ? f.c : over(f.c, bg, f.a);
                const L1 = lum(fgc), L2 = lum(bg);
                worst = Math.min(worst, (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05));
              }
              if (worst < need) contrast.push({ t: el.textContent.trim().slice(0, 26), cr: +worst.toFixed(2), need });
            }
          }
        }
      }
      for (const el of document.querySelectorAll('.view.active .build-card, .view.active #homeHeroTile, .view.active .cw-panel, .view.active .mod, .view.active .device-card')) {
        if (!onScreen(el)) continue;
        const cs = getComputedStyle(el);
        for (const k of ['paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight', 'rowGap', 'columnGap']) {
          const v = parseFloat(cs[k]);
          if (isNaN(v)) continue;
          // Sub-scale hairlines (<=2px) are borders and insets, not spacing.
          if (v > 2 && !nearJs(v, SPACE)) space.push({ cls: (el.className || '').toString().split(' ')[0], k, v: +v.toFixed(1) });
        }
      }
      return { sizes, type, space, contrast };
    }, { TYPE, SPACE });

    found.sizes.forEach((s) => allSizes.add(s));
    perView.push([view, new Set(found.sizes).size]);
    badType.push(...found.type.map((x) => `${view}:${x.cls}@${x.fs}px`));
    badSpace.push(...found.space.map((x) => `${view}:${x.cls} ${x.k}=${x.v}`));
    badContrast.push(...found.contrast.map((x) => `${view}:"${x.t}" ${x.cr}:1 (needs ${x.need})`));
    await p.close();
  }

  const uniq = (a) => [...new Set(a)];
  check('every rendered font size is a step on the type scale',
    badType.length === 0,
    badType.length ? uniq(badType).slice(0, 4).join(', ') : `${[...allSizes].sort((a, z) => a - z).join(', ')}px — all on scale`);

  // Per view, not the union: home and projects are different compositions and
  // are entitled to different steps. The union was 12 and meant nothing.
  check('no single view sprawls across more than 8 steps',
    perView.every(([, n]) => n >= 3 && n <= 8),
    perView.map(([v, n]) => `${v}:${n}`).join(', ') + ' (home was 11 before the scale existed)');

  check('every padding and gap is on the spacing scale',
    badSpace.length === 0,
    badSpace.length ? uniq(badSpace).slice(0, 4).join(', ') : 'none off-scale');

  check('all body text meets WCAG AA contrast',
    badContrast.length === 0,
    badContrast.length ? uniq(badContrast).slice(0, 3).join(', ') : 'no failures');

  for (const [ok, n, d] of results) console.log(`  ${ok}  ${n.padEnd(52)} ${d}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await b.close();

  if (MUT) {
    // The contrast check is not touched by a size/padding mutation and should
    // stay green — saying so beats pretending the mutation covers everything.
    const target = results.filter((r) => !/contrast/.test(r[1]));
    const wrong = target.filter((r) => r[0] === 'PASS').map((r) => r[1]);
    if (!wrong.length) { console.log(`MUT: all ${target.length} scale checks failed, as they must (contrast is not size-breakable)`); process.exit(0); }
    console.log('MUT: still passing — ' + wrong.join('; '));
    process.exit(1);
  }
  process.exit(failed ? 1 : 0);
})();
