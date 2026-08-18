// Motion regression tests for the homepage.
//
// These cover the four things that made the homepage cost several times more
// per frame than any other page on the site, each of which is easy to
// reintroduce by accident:
//   1. the hero scan line animating `top` (a layout property) forever
//   2. off-screen infinite CSS animations holding compositor layers
//   3. the hero's forever-running GSAP tweens never parking
//   4. the invisible sidebar backdrop staying composited via backdrop-filter
//
// Every test is paired with a MUTATION that undoes the fix, so the suite can be
// shown to actually fail when the bug comes back:
//
//   node scripts/build-www.mjs && npx serve -l 8099 www   # in another shell
//   node scripts/motionfix.js
//   MUT=scan_top node scripts/motionfix.js     # expect a FAIL
//   MUT=no_governor node scripts/motionfix.js  # expect a FAIL
//   MUT=no_park node scripts/motionfix.js      # expect a FAIL
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

  // ── 5. the invisible sidebar backdrop is out of compositing ──
  const sb = await p.evaluate(() => {
    const e = document.getElementById('sidebarBackdrop');
    return e ? { vis:getComputedStyle(e).visibility, op:getComputedStyle(e).opacity } : null;
  });
  chk('idle sidebar backdrop not composited', !!sb && sb.vis === 'hidden',
      sb ? `visibility:${sb.vis} opacity:${sb.op}` : 'element missing');

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
