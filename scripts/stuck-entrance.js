// Nothing on screen may be parked at an unfinished entrance transform.
//
// THE BUG THIS CATCHES
//   #currentWork has its own bespoke pinned reveal. It was ALSO being claimed
//   by assets/cinematic.js, which gave .cw-body a 'cin-v3' 3D entrance that
//   never completed — leaving it at rotateY(~26deg) permanently. Under
//   .cw-stage's perspective:1400px that projects every child differently by
//   position, so the four skill items rendered at four different heights and
//   the panel read as skewed and broken.
//
//   CLAUDE.md warns that index.html's inline reveal system and cinematic.js
//   both exist and that "a change to arrival behaviour usually has to be made
//   twice". This is the check that notices when they fight over one subtree.
//
//   Separately, the panel's own reveal was driven by a SCRUBBED timeline whose
//   start is the pin start, so at the moment the section locked to the middle
//   of the screen its progress was 0 and the whole panel was invisible.
//
// Run against a served build:  node scripts/stuck-entrance.js
// MUT=1 re-parks the section on the generic runtime; every check must fail.
const { chromium } = require('/opt/node22/lib/node_modules/playwright');

const MUT = process.env.MUT === '1';
const PAGES = ['index.html', 'agent.html', 'lifecycle-os.html', 'marketing-101.html'];

// A transform that is not the identity and carries a rotation or a Z shift is
// an entrance that never landed. Pure translate/scale can be a legitimate
// resting style, so those alone are not flagged.
const PROBE = `(() => {
  const bad = [];
  for (const el of document.querySelectorAll('.cin, .cin-stagger, .cin-stagger > *, [class*="cin-v"]')) {
    const r = el.getBoundingClientRect();
    if (r.height < 4 || r.width < 4) continue;                    // not rendered
    if (r.bottom < 0 || r.top > innerHeight) continue;            // off screen: entrance not due yet
    const t = getComputedStyle(el).transform;
    if (!t || t === 'none') continue;
    if (!t.startsWith('matrix3d')) continue;                      // 2d transforms are not the 3d entrances
    const n = t.slice(9, -1).split(',').map(Number);
    // m13/m31 non-zero => rotateY; m23/m32 => rotateX; m34 => perspective tail.
    const rot = Math.max(Math.abs(n[2]), Math.abs(n[8]), Math.abs(n[6]), Math.abs(n[9]));
    const z = Math.abs(n[14]);
    if (rot > 0.01 || z > 1) bad.push((el.className || el.tagName).toString().slice(0, 40) + ' rot=' + rot.toFixed(3) + ' z=' + z.toFixed(0));
  }
  return bad;
})()`;

(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const results = [];
  const check = (n, ok, d) => results.push([ok ? 'PASS' : 'FAIL', n, d]);

  // ── 0. No entrance may rotate ────────────────────────────────────────────
  // A rotation under a shared perspective foreshortens the far edge, so the
  // element is visibly crooked for the whole time it plays and its children
  // each project by a different amount. Five of the six variants used to do
  // this, in both runtimes; when one got stuck it tilted the sidebar on every
  // page. Variety comes from six different kinds of movement instead.
  {
    const fsMod = require('fs');
    const sources = [
      ['assets/cinematic.js', /\.cin-v[1-6]\{transform:[^}]*\}/g],
      ['index.html',          /\.reveal\.rv-v[1-6] \{ transform:[^}]*\}/g],
    ];
    const spinning = [];
    for (const [file, re] of sources) {
      const src = fsMod.readFileSync(require('path').join(__dirname, '..', file), 'utf8');
      const rules = src.match(re) || [];
      if (!rules.length) spinning.push(file + ': no variant rules found (did they move?)');
      for (const r of rules) if (/rotate/i.test(r)) spinning.push(file + ': ' + r.slice(0, 52));
    }
    check('no entrance variant rotates, in either runtime',
      spinning.length === 0,
      spinning.length ? spinning.slice(0, 3).join(' | ') : '12 variants across both runtimes, none rotating');
  }

  // ── 1. The section that broke: readable the moment it is on screen ────────
  {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    // Registered BEFORE the first navigation. Registering it afterwards and
    // re-navigating served the second request from cache, so the rewrite never
    // ran and the mutation silently did nothing to this section.
    if (MUT) {
      await p.route('**/index.html', async (route) => {
        const r = await route.fetch();
        route.fulfill({ response: r, body: (await r.text()).replace(/ data-no-motion(?=>)/g, '') });
      });
    }
    await p.goto('http://127.0.0.1:8099/index.html', { waitUntil: 'load', timeout: 25000 });
    await p.waitForTimeout(2000);
    // Re-break the ROOT cause, not just the opt-out. The fix was in
    // cinematic.js — its transform-clearing rule was scoped to .cin, so a
    // .cin-stagger element carrying a variant never cleared its entrance.
    // Removing data-no-motion alone no longer reproduces anything, because
    // the transform now clears correctly; this puts the old scoping back.
    if (MUT) {
      await p.addStyleTag({ content:
        '.cin-stagger.cin-in.cin-v1{transform:perspective(1100px) translate3d(0,34px,-140px) rotateX(14deg)!important}' +
        '.cin-stagger.cin-in.cin-v2{transform:perspective(900px) translate3d(-58px,0,-120px) rotateY(-26deg)!important}' +
        '.cin-stagger.cin-in.cin-v3{transform:perspective(900px) translate3d(58px,0,-120px) rotateY(26deg)!important}' +
        '.cin-stagger.cin-in.cin-v5{transform:perspective(1000px) translate3d(0,26px,-90px) rotateX(10deg) rotateZ(-2.5deg)!important}' +
        '.cin-stagger.cin-in.cin-v6{transform:perspective(760px) translate3d(0,-30px,-150px) rotateX(-24deg)!important}' +
        '.cw-panel{opacity:0!important}' +
        // The skills were misaligned but still VISIBLE in the transform bug.
        // Their invisibility was the other fault — the scrub-driven reveal —
        // which is a JS change and cannot be injected as CSS, so it gets its
        // own mutation here rather than being left unexercised.
        '.cw-skills li{opacity:0!important}' });
    }
    await p.evaluate(() => document.querySelector('#currentWork').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await p.waitForTimeout(5000);

    const m = await p.evaluate(() => {
      const panel = document.querySelector('.cw-panel');
      const lis = [...document.querySelectorAll('.cw-skills li')];
      const rows = {};
      lis.forEach((l) => {
        const top = Math.round(l.getBoundingClientRect().top);
        const key = Object.keys(rows).find((k) => Math.abs(k - top) < 12) ?? top;
        (rows[key] = rows[key] || []).push(top);
      });
      return {
        panelOpacity: parseFloat(getComputedStyle(panel).opacity),
        skillOpacities: lis.map((l) => parseFloat(getComputedStyle(l).opacity)),
        skillHeights: lis.map((l) => +l.getBoundingClientRect().height.toFixed(1)),
        rowSpreads: Object.values(rows).map((tops) => Math.max(...tops) - Math.min(...tops)),
      };
    });

    check('the current-work panel is visible when it is on screen',
      m.panelOpacity > 0.9, `panel opacity ${m.panelOpacity}`);
    check('every skill in that panel is visible',
      m.skillOpacities.every((o) => o > 0.9), `opacities ${m.skillOpacities.join(', ')}`);
    check('skills in the same row share a top edge',
      m.rowSpreads.every((s) => s <= 2), `row spreads ${m.rowSpreads.join(', ')}px`);
    check('every skill renders at the same height',
      new Set(m.skillHeights).size === 1, `heights ${m.skillHeights.join(', ')}`);

    const stuck = await p.evaluate(PROBE);
    check('nothing in view is parked at an unfinished 3D entrance (index.html)',
      stuck.length === 0, stuck.length ? stuck.slice(0, 3).join(' | ') : 'none');
    await p.close();
  }

  // ── 2. The same sweep across the other pages the runtime touches ──────────
  for (const page of PAGES.slice(1)) {
    const p = await (await b.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    try { await p.goto(`http://127.0.0.1:8099/${page}`, { waitUntil: 'load', timeout: 25000 }); }
    catch { check(`${page} loads`, false, 'load failed'); await p.close(); continue; }
    await p.waitForTimeout(3500);
    const found = [];
    for (const frac of [0, 0.35, 0.7]) {
      await p.evaluate((f) => scrollTo(0, document.body.scrollHeight * f), frac);
      await p.waitForTimeout(2200);
      found.push(...(await p.evaluate(PROBE)));
    }
    check(`nothing is parked at an unfinished 3D entrance (${page})`,
      found.length === 0, found.length ? found.slice(0, 2).join(' | ') : 'none');
    await p.close();
  }

  for (const [ok, n, d] of results) console.log(`  ${ok}  ${n.padEnd(58)} ${d}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  await b.close();

  if (MUT) {
    // By name, not by position — this was results.slice(0, 5) and quietly
    // pointed at the wrong set as soon as a check was added above it.
    // The no-rotation check reads the SOURCE, and the other pages were never
    // mis-wired, so neither is touched by a mutation of the rendered page.
    const NOT_MUTATED = /rotates, in either runtime|agent\.html|lifecycle-os\.html|marketing-101\.html/;
    const target = results.filter((r) => !NOT_MUTATED.test(r[1]));
    const wrong = target.filter((r) => r[0] === 'PASS').map((r) => r[1])
      .concat(results.filter((r) => NOT_MUTATED.test(r[1]) && r[0] === 'FAIL').map((r) => r[1] + ' (broke unexpectedly)'));
    if (!wrong.length) {
      console.log(`MUT: all ${target.length} checks it targets failed, and the other ${results.length - target.length} still pass`);
      process.exit(0);
    }
    console.log('MUT: wrong outcome — ' + wrong.join('; '));
    process.exit(1);
  }
  process.exit(failed ? 1 : 0);
})();
