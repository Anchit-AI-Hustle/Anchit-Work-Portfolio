/*
 * Kart Mela: the chase camera stays behind the kart whichever way it faces.
 *
 * The camera once blended the kart's heading and its direction of travel with a plain lerp,
 * which takes the long way round across the +-180 degree seam: facing that way, the view swung
 * about 150 degrees off and looked at the kart from the front. This teleports the kart to twelve
 * points round the circuit (every direction), lets the camera settle, and fails if it ends up more
 * than 35 degrees off the kart's heading, at desktop and phone size.
 *
 * Usage: BASE=http://127.0.0.1:8099 node scripts/kart-camera-check.js
 */
const { chromium } = require('./_playwright.js');
const BASE = (process.env.BASE || 'http://127.0.0.1:8099').replace(/\/$/, '');
(async () => {
  const b = await chromium.launch();
  let worst = 0, n = 0, errs = [];
  for (const vp of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    const p = await b.newPage({ viewport: vp });
    p.on('pageerror', (e) => errs.push(String(e)));
    await p.goto(BASE + '/games/kart-mela', { waitUntil: 'load' });
    await p.waitForFunction(() => window.__arcade && window.__arcade.frame > 5, null, { timeout: 60000 });
    await p.click('.arc-card .arc-btn.primary');
    await p.waitForFunction(() => window.__arcade.dev && window.__arcade.dev.world && window.__arcade.dev.world(), null, { timeout: 60000 });
    await p.evaluate(() => { const d = window.__arcade.dev; d.skip(); d.skip(); d.bot(true); });
    await p.waitForTimeout(3000);
    const L = await p.evaluate(() => window.__arcade.dev.world().T.L);
    for (let i = 0; i < 12; i++) {
      await p.evaluate((s) => window.__arcade.dev.teleport(s), (L * i) / 12);
      await p.waitForTimeout(2500);
      const r = await p.evaluate(() => { const W = window.__arcade.dev.world(), P = W.P, c = window.__arcade.dev.cam();
        const look = Math.atan2(P.x - c.x, P.z - c.z); let d = look - P.h; d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
        return { h: P.h, dev: Math.abs(d) * 180 / Math.PI, v: P.v, mode: c.mode, spin: P.spinT > 0 || P.tumbleT > 0 }; });
      n++; if (!r.spin && r.mode === 'chase') worst = Math.max(worst, r.dev);
      console.log(vp.width, i, 'heading', (r.h * 180 / Math.PI).toFixed(0), 'camera off-axis', r.dev.toFixed(1), 'deg', r.mode, r.spin ? 'spin' : '');
    }
    await p.close();
  }
  await b.close();
  console.log('worst off-axis (chase, not spinning):', worst.toFixed(1), 'deg over', n, 'samples; page errors:', errs.length);
  process.exit(worst < 35 && !errs.length ? 0 : 1);
})();
