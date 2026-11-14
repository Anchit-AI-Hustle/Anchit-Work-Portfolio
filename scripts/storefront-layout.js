// The three concept storefronts use the screen they are on.
//
// Reported as broken UI on /xazina-revamp, /deli-chic and /gram-street-coffee:
// "ensure complete space utilisation as per device size". Measured, it was:
//
//   Xazina   every block of content captured from the original store rendered
//            as one 760px column of letterboxed photos, two thirds of a 1440
//            screen empty, on the home page and on all 160 collection, page
//            and policy routes. Shopify's hidden price labels ("Regular price
//            / Sale price / Unit price /per") and four leaked inline-style
//            strings were on screen as copy, and 35 collections opened on
//            "0 pieces in this edit" above an empty grid.
//   Deli     the disclaimer bar painted over the fixed header; the audio pill
//            sat on top of the nav at 1024, 1280 and 1920; a 404 image; the
//            chapter tabs and the loupe's cut chips ran off a phone.
//   Gram     the same disclaimer collision; at 1024-1280 every nav label
//            wrapped onto two or three lines in a 105px header; the roastery
//            and location tabs and the 3-up product cards clipped on a tablet.
//
// Run against a served build:  node scripts/storefront-layout.js
// Each mutant restores one defect, and the suite must then fail:
//   MUT=stack      card grids back to one column      -> utilisation check
//   MUT=letterbox  photos back to 760px + contain      -> lone-photo check
//   MUT=cover      disclaimer over the header again    -> header check
//   MUT=crowd      deli header back to 1280px + tagline-> nav overlap check
const { chromium } = require('./_playwright.js');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MUT = process.env.MUT || '';
const VIEWPORTS = [[390, 844], [820, 1180], [1440, 900]];
const XAZINA = [
  '/xazina-revamp',
  '/xazina-revamp/collections/the-classics',
  '/xazina-revamp/collections/the-wedding-edit',
  '/xazina-revamp/pages/for-her',
  '/xazina-revamp/pages/about-xazina',
  '/xazina-revamp/pages/xazinas-lab-grown-diamonds',
  '/xazina-revamp/products/the-golden-hour',
  '/xazina-revamp/blogs/lab-grown-diamond-journal-by-xazina/4-cs-diamonds-explained-lab-grown-xazina',
  // Journal photos sit in <p> tags: the one template with lone photos left.
  '/xazina-revamp/blogs/lab-grown-diamond-journal-by-xazina/the-ultimate-valentine-s-day-gift-guide-6-exquisite-lab-grown-heart-jewels-by-xazina',
  '/xazina-revamp/policies/refund-policy',
];
const CAFES = [
  { path: '/deli-chic', header: 'header.deli-site-header' },
  { path: '/gram-street-coffee', header: 'header.site-head' },
];
const MUTANT_CSS = {
  stack: '.src-grid{display:block!important}',
  letterbox: '.source-content img{width:min(100%,760px)!important;object-fit:contain!important;max-height:620px!important}',
  cover: 'header.deli-site-header,header.site-head{translate:none!important}',
  crowd: 'header.deli-site-header>div{max-width:1280px!important}.deli-tagline{display:inline!important}',
}[MUT];

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

async function open(browser, path, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addInitScript(() => { try { localStorage.setItem('cookie-consent', 'denied'); } catch (e) { /* private mode */ } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror ' + e.message));
  page.on('response', r => {
    if (r.status() >= 400 && r.url().startsWith(BASE)) errors.push(r.status() + ' ' + r.url().slice(BASE.length));
  });
  await page.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 });
  if (MUTANT_CSS) await page.addStyleTag({ content: MUTANT_CSS });
  await page.waitForTimeout(400);
  return { ctx, page, errors };
}

async function xazina(browser, path, w, h) {
  const where = `${path} @${w}`;
  const { ctx, page, errors } = await open(browser, path, w, h);
  // Reveal everything lazy, then measure.
  await page.evaluate(async () => {
    for (let y = 0; y < document.documentElement.scrollHeight; y += 700) { scrollTo(0, y); await new Promise(r => setTimeout(r, 25)); }
    scrollTo(0, 0);
  });
  const r = await page.evaluate((w) => {
    const de = document.documentElement;
    const out = { overflow: de.scrollWidth - de.clientWidth, grids: [], lone: [], text: '' };
    for (const g of document.querySelectorAll('.source-content .src-grid:not(.src-flat)')) {
      // Cards inside a flattened carousel column belong to the grid that lays them out.
      const cards = [...g.querySelectorAll('.src-card:not(.src-flat)')]
        .filter(c => c.offsetParent && c.parentElement.closest('.src-grid:not(.src-flat)') === g);
      if (cards.length < 2) continue;
      // Measured against the grid's own box: a grid nested in half of a split
      // is meant to fill that half, not the whole column.
      const host = g.getBoundingClientRect();
      const tops = new Set(cards.map(c => Math.round(c.getBoundingClientRect().top)));
      const perRow = cards.filter(c => Math.round(c.getBoundingClientRect().top) === Math.min(...tops)).length;
      const used = Math.max(...cards.map(c => c.getBoundingClientRect().right)) - Math.min(...cards.map(c => c.getBoundingClientRect().left));
      out.grids.push({ cards: cards.length, perRow, used: used / host.width, gw: host.width, wide: g.classList.contains('src-grid-wide'), text: g.classList.contains('src-grid-text') });
    }
    for (const img of document.querySelectorAll('.source-content img')) {
      if (img.closest('.src-card,.src-split-media,.src-swap') || !img.offsetParent) continue;
      const host = img.closest('.source-content').getBoundingClientRect();
      const box = img.getBoundingClientRect();
      if (box.width > 40) out.lone.push(box.width / host.width);
    }
    // A closing quote mark on its own line was the giveaway of an unstyled testimonial.
    out.strayMarks = [...document.querySelectorAll('.source-content .src-qmark')].filter(m => m.offsetParent && getComputedStyle(m).fontSize === getComputedStyle(m.parentElement).fontSize).length;
    out.text = document.body.innerText;
    return out;
  }, w);

  if (r.overflow > 1) fail(where, `page scrolls sideways by ${r.overflow}px`);
  for (const e of errors) fail(where, e);
  if (r.strayMarks) fail(where, `${r.strayMarks} testimonial quote marks shown as loose lines`);
  for (const k of ['Regular price', 'Unit price', 'Sale price', 'transform:translate', '\nType:\n', '0 pieces in this edit', 'This edit has no listed items']) {
    if (r.text.includes(k)) fail(where, `visible capture artefact "${k.trim()}"`);
  }
  for (const g of r.grids) {
    // A grid of cards must spread across its column, not stack down one side.
    if (g.used < 0.9) fail(where, `card grid uses ${(g.used * 100).toFixed(0)}% of its column`);
    // The fewest cards per row the track minimums in shop.css allow at this
    // grid's width (cards: 150-320px, long-copy and text tiles: 220-440px).
    const fits = g.wide || g.text ? (g.gw >= 1100 ? 3 : g.gw >= 600 ? 2 : 1) : (g.gw >= 1100 ? 4 : g.gw >= 600 ? 3 : g.gw >= 330 ? 2 : 1);
    const want = Math.min(g.cards, fits);
    if (g.perRow < want) fail(where, `${g.cards}-card grid ${Math.round(g.gw)}px wide shows ${g.perRow} per row, expected at least ${want}`);
  }
  for (const share of r.lone) if (share < 0.95) fail(where, `a photo fills only ${(share * 100).toFixed(0)}% of its column (letterbox)`);
  await ctx.close();
  return { grids: r.grids.length, lone: r.lone.length };
}

async function cafe(browser, { path, header }, w, h) {
  const where = `${path} @${w}`;
  const { ctx, page, errors } = await open(browser, path, w, h);
  await page.waitForTimeout(300);
  const r = await page.evaluate((sel) => {
    const de = document.documentElement;
    const head = document.querySelector(sel).getBoundingClientRect();
    const bar = document.querySelector('.concept-bar').getBoundingClientRect();
    const broken = [...document.images].filter(i => i.complete && i.naturalWidth === 0 && i.getAttribute('src')?.startsWith('/')).map(i => i.getAttribute('src'));
    // Segmented tab rows that must show every tab at this width.
    const rows = ['#craftTab-extraction', '#locTab-phase1', '#loupeTab-charcuterie', '#deliNav0']
      .map(id => document.querySelector(id)?.parentElement).filter(el => el && el.offsetParent);
    const clipped = rows.flatMap(row => [...row.children].filter(b => {
      const r = b.getBoundingClientRect(), p = row.getBoundingClientRect();
      return r.right > Math.min(p.right, de.clientWidth) + 1 || r.left < Math.max(p.left, 0) - 1 || b.scrollWidth > b.clientWidth + 1;
    }).map(b => b.textContent.trim()));
    return { overflow: de.scrollWidth - de.clientWidth, headTop: head.top, barBottom: bar.bottom, headH: head.height, broken, clipped };
  }, header);
  if (r.overflow > 1) fail(where, `page scrolls sideways by ${r.overflow}px`);
  if (r.headTop < r.barBottom - 1) fail(where, `disclaimer covers the header by ${Math.round(r.barBottom - r.headTop)}px`);
  if (w >= 1024 && r.headH > 70) fail(where, `header wraps to ${Math.round(r.headH)}px`);
  for (const b of r.broken) fail(where, `broken image ${b}`);
  for (const t of r.clipped) fail(where, `tab cut off: "${t}"`);
  for (const e of errors) fail(where, e);
  await ctx.close();
}

async function headerRow(browser, { path, header }, w) {
  const { ctx, page } = await open(browser, path, w, 800);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(500);
  const hits = await page.evaluate((sel) => {
    const h = document.querySelector(sel);
    const items = [...h.querySelectorAll('a, button')].filter(e => e.offsetParent && e.getBoundingClientRect().width > 0 && !e.closest('#navLinks.is-open'))
      .filter(e => !e.parentElement.closest('a, button'));
    const out = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i].getBoundingClientRect(), b = items[j].getBoundingClientRect();
      if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) out.push(`${items[i].textContent.trim()} x ${items[j].textContent.trim()}`);
    }
    return out;
  }, header);
  for (const x of hits) fail(`${path} header @${w}`, `items overlap: ${x.replace(/\s+/g, ' ')}`);
  await ctx.close();
}

(async () => {
  // The build-time shaper must be lossless before anything it shapes is trusted.
  const { parse, serialize } = await import('./xazina-tidy.mjs');
  const snap = require('../xazina-revamp/catalog/snapshot.json');
  const frags = [...snap.home.map(b => b.html), ...Object.values(snap.entries).flatMap(e => [...(e.blocks || []).map(b => b.html), e.content, e.description]), ...Object.values(snap.products).map(p => p.description)].filter(Boolean);
  const lossy = frags.filter(h => serialize(parse(h)) !== h).length;
  if (lossy) fail('xazina-tidy', `${lossy} of ${frags.length} captured fragments do not survive parse/serialize`);

  const browser = await chromium.launch();
  let grids = 0, lone = 0;
  for (const [w, h] of VIEWPORTS) {
    for (const p of XAZINA) { const n = await xazina(browser, p, w, h); grids += n.grids; lone += n.lone; }
    for (const c of CAFES) await cafe(browser, c, w, h);
  }
  for (const w of [1024, 1180, 1280, 1440, 1920]) for (const c of CAFES) await headerRow(browser, c, w);
  await browser.close();

  if (grids < 40) fail('suite', `only ${grids} card grids measured; the pages did not render their captured content`);
  if (lone < 10) fail('suite', `only ${lone} lone photos measured; the letterbox check has nothing to test`);
  if (failures.length) {
    console.error(`storefront-layout: ${failures.length} failure(s)${MUT ? ` [MUT=${MUT}]` : ''}`);
    for (const f of failures.slice(0, 40)) console.error('  ' + f);
    process.exit(1);
  }
  console.log(`storefront-layout: ${XAZINA.length + CAFES.length} pages x ${VIEWPORTS.length} viewports, ${grids} card grids, ${lone} lone photos, ${frags.length} fragments round-tripped, headers clean at 5 widths.`);
})().catch(e => { console.error(e); process.exit(1); });
