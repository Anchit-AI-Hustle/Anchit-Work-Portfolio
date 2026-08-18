// Motion regression tests for the homepage.
//
// These cover the four things that made the homepage cost several times more
// per frame than any other page on the site, each of which is easy to
// reintroduce by accident:
//   1. the hero scan line animating `top` (a layout property) forever
//   2. off-screen infinite CSS animations holding compositor layers
//   3. the hero's forever-running GSAP tweens never parking
//   4. the invisible sidebar backdrop staying composited via backdrop-filter
//   5. native `scroll-behavior: smooth` fighting Lenis, which stopped the page
//      scrolling at all once Lenis had initialised
//   6. the browser and Lenis both applying the same wheel notch as Lenis starts
//      up, which threw an early scroller back to the top of the page
//   7. the mobile nav panel painting over its own close button, so the menu
//      opened and could not be shut
//
// Every test is paired with a MUTATION that undoes the fix, so the suite can be
// shown to actually fail when the bug comes back:
//
//   node scripts/build-www.mjs && npx serve -l 8099 www   # in another shell
//   node scripts/motionfix.js
//   MUT=scan_top node scripts/motionfix.js     # expect a FAIL
//   MUT=no_governor node scripts/motionfix.js  # expect a FAIL
//   MUT=no_park node scripts/motionfix.js      # expect a FAIL
//   MUT=smooth_scroll node scripts/motionfix.js # expect a FAIL
//   MUT=no_drift_fix node scripts/motionfix.js  # see the caveat on check 7
const { chromium } = require('/opt/node22/lib/node_modules/playwright');
const MUT = process.env.MUT || '';
const BASE = process.env.BASE || 'http://127.0.0.1:8099';

const mutations = {
  // put the scan line back on `top`
  scan_top: () => {
    const t = setInterval(() => {
      const s = document.getElementById('cineScan');
      if (!s) return;
      clearInterval(t);
      if (window.gsap) { gsap.killTweensOf(s); gsap.set(s, { y: 0, clearProps: 'transform' });
        gsap.fromTo(s, { top: '4%' }, { top: '94%', duration: 2.6, repeat: -1, yoyo: true, ease: 'sine.inOut' }); }
    }, 50);
  },
  // disable the ambient governor at the source: it can never tag anything.
  // (An earlier attempt used a CSS override of `animation: revert`, which
  // resolves to `none` — it did not restore anything, so the suite "passed"
  // under a mutation that had not actually mutated. Kill the class instead.)
  no_governor: () => {
    const t = DOMTokenList.prototype.toggle, a = DOMTokenList.prototype.add;
    DOMTokenList.prototype.toggle = function (c) { if (c === 'amb-idle') return false; return t.apply(this, arguments); };
    DOMTokenList.prototype.add = function () {
      const rest = [...arguments].filter(c => c !== 'amb-idle');
      return rest.length ? a.apply(this, rest) : undefined;
    };
  },
  // put native smooth scrolling back, which is what broke scrolling entirely:
  // Lenis calls scrollTo every frame, and the browser restarts an animated
  // scroll for each one, so the document never gets anywhere.
  smooth_scroll: () => {
    const apply = () => document.documentElement.style.setProperty('scroll-behavior', 'smooth', 'important');
    apply();
    setInterval(apply, 100);
  },
  // stop the handover correction from running, so Lenis is free to tween from
  // a position the page has already left
  no_drift_fix: () => {
    const iv = setInterval(() => {
      const l = window.__lenis;
      if (!l) return;
      clearInterval(iv);
      l.reset = function () {};        // the correction becomes a no-op
    }, 10);
  },
  // put the nav panel back on top of the header bar, which is what hid the
  // close button. The panel is a CHILD of .site-header, so its z-index resolves
  // against its siblings there — raising it above .hdr-glass buries the
  // hamburger even though the header outranks the panel on the page.
  panel_over_ham: () => {
    const st = document.createElement('style');
    st.textContent = '.hdr-panel{z-index:9 !important}.hdr-glass{z-index:1 !important}';
    document.documentElement.appendChild(st);
  },
  // never park the hero loops
  no_park: () => {
    const O = window.IntersectionObserver;
    window.IntersectionObserver = function (cb, o) { return new O(function (e) {
      cb(e.map(x => Object.assign(Object.create(Object.getPrototypeOf(x)), { isIntersecting: true, target: x.target })), this); }, o); };
  },
};

(async () => {
  const b = await chromium.launch({ executablePath:'/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const ctx = await b.newContext({ viewport:{width:1440,height:900} });
  const p = await ctx.newPage();
  await p.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  if (MUT) {
    const src = mutations[MUT].toString();
    // Inject after the document exists — addInitScript runs before <head>.
    await p.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{(${src})()})`);
  }
  const results = [];
  const chk = (name, ok, detail) => results.push({ name, ok, detail });

  await p.goto(BASE + '/index.html', { waitUntil:'load' });
  await p.waitForTimeout(5500);

  // ── 1. scan line moves on transform, and `top` never changes ──
  const scan = await p.evaluate(() => new Promise(res => {
    const el = document.getElementById('cineScan');
    if (!el) return res({ missing:true });
    const tops = new Set(), ys = new Set();
    let n = 0;
    const t = setInterval(() => {
      const c = getComputedStyle(el);
      tops.add(c.top);
      const m = new DOMMatrixReadOnly(c.transform);
      ys.add(Math.round(m.m42));
      if (++n >= 30) { clearInterval(t); res({ tops:[...tops], ys:[...ys].sort((a,z)=>a-z) }); }
    }, 60);
  }));
  if (scan.missing) chk('scan line', false, 'no #cineScan');
  else {
    const moved = scan.ys.length > 2 && (scan.ys[scan.ys.length-1] - scan.ys[0]) > 40;
    const topStable = scan.tops.length === 1;
    chk('scan sweeps on transform', moved && topStable,
      `translateY spread ${scan.ys[0]}..${scan.ys[scan.ys.length-1]}px over ${scan.ys.length} samples; top values seen: ${scan.tops.join(',')}`);
  }

  // ── 2. ambient governor: off-screen loops stop, and come back ──
  const gov = await p.evaluate(() => {
    const all = [...document.querySelectorAll('.amb-idle')];
    // pick one that is genuinely off screen and genuinely below
    const off = all.filter(e => { const r = e.getBoundingClientRect(); return r.top > innerHeight * 1.5; });
    return { tagged: all.length, offscreen: off.length,
             sample: off[0] ? (off[0].id || off[0].className) : (all[0] ? (all[0].id||all[0].className) : null) };
  });
  chk('governor parks off-screen loops', gov.tagged > 0,
      `${gov.tagged} elements idled, ${gov.offscreen} of them below the fold (e.g. "${(gov.sample||'').slice(0,50)}")`);

  // ── 3. and releases them again when scrolled to ──
  const released = await p.evaluate(async () => {
    const el = [...document.querySelectorAll('.amb-idle')]
      .find(e => e.getBoundingClientRect().top > innerHeight);
    if (!el) return { skip:true };
    const before = getComputedStyle(el).animationName;
    el.scrollIntoView({ block:'center' });
    await new Promise(r => setTimeout(r, 900));
    return { skip:false, before, stillIdle: el.classList.contains('amb-idle'),
             after: getComputedStyle(el).animationName };
  });
  if (released.skip) chk('governor releases on approach', false, 'no off-screen idled element to test');
  else chk('governor releases on approach', !released.stillIdle && released.after !== 'none',
      `animation-name "${released.before}" while idle → "${released.after}" once in view`);

  // ── 4. hero forever-tweens park when the hero is off screen ──
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(800);
  const park = await p.evaluate(() => new Promise(res => {
    const arc = document.querySelector('#cineHero .cine-arc.a1');
    if (!arc) return res({ missing:true });
    const read = () => getComputedStyle(arc).transform;
    const near = new Set(); let n1 = 0;
    const t1 = setInterval(() => { near.add(read());
      if (++n1 >= 8) { clearInterval(t1);
        // now scroll the hero well out of view and watch again
        window.scrollTo(0, innerHeight * 4);
        setTimeout(() => {
          const far = new Set(); let n2 = 0;
          const t2 = setInterval(() => { far.add(read());
            if (++n2 >= 8) { clearInterval(t2); res({ nearStates: near.size, farStates: far.size }); }
          }, 90);
        }, 1400);
      }
    }, 90);
  }));
  if (park.missing) chk('hero loops park off-screen', false, 'no .cine-arc.a1');
  else chk('hero loops park off-screen', park.nearStates > 1 && park.farStates === 1,
      `arc transform took ${park.nearStates} distinct values while the hero was on screen, ${park.farStates} while it was not`);

  // ── 5. the page actually scrolls, from the first gesture after Lenis is up ──
  // The window matters: before Lenis initialises the page scrolls natively and
  // this passes trivially, so the check waits until Lenis has taken over.
  const scrolled = await (async () => {
    const p2 = await ctx.newPage();
    await p2.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    if (MUT) {
      const src = mutations[MUT].toString();
      await p2.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{(${src})()})`);
    }
    await p2.goto(BASE + '/index.html', { waitUntil: 'commit' });
    await p2.waitForTimeout(1600);
    const lenisUp = await p2.evaluate(() => !!window.__lenis);
    await p2.mouse.move(720, 500);
    for (let i = 0; i < 12; i++) { await p2.mouse.wheel(0, 200); await p2.waitForTimeout(40); }
    await p2.waitForTimeout(700);
    const r = await p2.evaluate(() => ({
      y: Math.round(scrollY),
      behavior: getComputedStyle(document.documentElement).scrollBehavior,
      lenisScroll: window.__lenis ? Math.round(window.__lenis.scroll || 0) : null,
    }));
    await p2.close();
    return { ...r, lenisUp };
  })();
  chk('page scrolls once Lenis is driving', scrolled.y > 1500 && scrolled.behavior === 'auto',
      `wheeled 2400px → scrollY ${scrolled.y} (lenis ${scrolled.lenisUp ? 'up at ' + scrolled.lenisScroll : 'not up'}), `
      + `computed scroll-behavior "${scrolled.behavior}"`);

  // ── 6. the idle nav overlay is out of compositing ──
  // Originally this guarded #sidebarBackdrop. The sidebar is gone, but the
  // hazard moved rather than disappearing: #hdrPanel is the same shape of
  // thing — a full-viewport fixed element carrying backdrop-filter, which
  // composites whether or not anyone can see it. Repointed rather than
  // deleted, because deleting it would have retired the guard at exactly the
  // moment a new element inherited the bug it was written for.
  const sb = await p.evaluate(() => {
    const e = document.getElementById('hdrPanel');
    return e ? { vis:getComputedStyle(e).visibility, op:getComputedStyle(e).opacity,
                 bf:getComputedStyle(e).backdropFilter } : null;
  });
  chk('idle nav overlay not composited', !!sb && sb.vis === 'hidden',
      sb ? `visibility:${sb.vis} opacity:${sb.op} backdrop-filter:${sb.bf}` : 'element missing');

  // ── 7. an early scroll is never thrown backwards ──
  // Sampled once per RENDERED frame: a backwards step between two painted
  // frames is something a person sees, whereas two scroll events inside one
  // frame are not. Repeated across the load window because the fault was
  // intermittent — 4 to 7 runs in 14 before the fix, 0 in 26 after it.
  //
  // CAVEAT, so nobody reads more into this check than it earns: unlike the
  // others here, it has NOT been shown to fail on demand. `MUT=no_drift_fix`
  // stubs out the correction — verified to be installed, and the correction is
  // verified to fire twice in a normal run — yet ten mutated passes did not
  // reproduce a visible jump. The fault is timing-dependent enough that a fixed
  // set of start times cannot be relied on to provoke it. Treat this as a guard
  // that will catch a regression which reproduces, not as proof of one that
  // does not.
  const jumps = [];
  for (const startAt of [0, 77, 150, 231, 300, 385, 500, 650, 800, 1000]) {
    const p3 = await ctx.newPage();
    await p3.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    if (MUT) {
      const src = mutations[MUT].toString();
      await p3.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{(${src})()})`);
    }
    await p3.addInitScript(() => {
      window.__fr = [];
      const t = () => { window.__fr.push([Math.round(performance.now()), Math.round(scrollY)]); requestAnimationFrame(t); };
      requestAnimationFrame(t);
    });
    await p3.goto(BASE + '/index.html', { waitUntil: 'commit' });
    if (startAt) await p3.waitForTimeout(startAt);
    await p3.mouse.move(720, 500);
    for (let i = 0; i < 14; i++) { await p3.mouse.wheel(0, 200); await p3.waitForTimeout(25); }
    await p3.waitForTimeout(3000);
    const fr = await p3.evaluate(() => window.__fr);
    for (let i = 1; i < fr.length; i++) {
      const d = fr[i][1] - fr[i-1][1];
      if (d < -4) jumps.push(`T=${startAt}ms: ${fr[i-1][1]}px -> ${fr[i][1]}px at ${fr[i][0]}ms`);
    }
    await p3.close();
  }
  chk('early scroll is never thrown back', jumps.length === 0,
      jumps.length ? jumps.join('; ') : '10 start times across the load window, no backwards step between any two painted frames');

  // ── 8. the mobile menu can always be closed ──
  // It opened over its own hamburger once. A menu you cannot shut is a trap,
  // so this asserts the close button is the thing under the cursor while the
  // panel is open, and that tapping it actually closes.
  const menu = await (async () => {
    const m = await ctx.newPage();
    await m.setViewportSize({ width: 390, height: 844 });
    await m.route(/fonts\.(googleapis|gstatic)\.com/, r=>r.fulfill({status:200,contentType:'text/css',body:''}));
    if (MUT) {
      const src = mutations[MUT].toString();
      await m.addInitScript(`document.addEventListener('DOMContentLoaded',()=>{(${src})()})`);
    }
    await m.goto(BASE + '/index.html', { waitUntil: 'load' });
    await m.waitForTimeout(4000);
    await m.click('#hdrHam');
    await m.waitForTimeout(600);
    const probe = await m.evaluate(() => {
      const ham = document.getElementById('hdrHam').getBoundingClientRect();
      const hit = document.elementFromPoint(ham.x + ham.width / 2, ham.y + ham.height / 2);
      return { open: document.getElementById('hdrPanel').classList.contains('open'),
               reachable: !!(hit && hit.closest && hit.closest('#hdrHam')) };
    });
    let closed = false;
    if (probe.reachable) {
      await m.click('#hdrHam').catch(() => {});
      await m.waitForTimeout(600);
      closed = await m.evaluate(() => !document.getElementById('hdrPanel').classList.contains('open'));
    }
    await m.close();
    return { ...probe, closed };
  })();
  chk('mobile menu can be closed', menu.open && menu.reachable && menu.closed,
      `opened=${menu.open}, close button reachable=${menu.reachable}, second tap closed=${menu.closed}`);

  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  chk('no page errors', errs.length === 0, errs[0] || 'none');

  const pass = results.filter(r=>r.ok).length;
  console.log(`\n${MUT ? 'MUTATION '+MUT+' → ' : ''}${pass}/${results.length} passed`);
  results.forEach(r => console.log('  ' + (r.ok?'PASS':'FAIL') + '  ' + r.name.padEnd(34) + r.detail));
  if (MUT) console.log('  (a good mutation should make at least one of these FAIL)');
  await b.close();
  process.exit(0);
})();
