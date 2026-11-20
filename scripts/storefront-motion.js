#!/usr/bin/env node
/**
 * storefront-motion: the runtime rules for the concept storefronts, measured.
 *
 * Every rule here was a real bug on the live site, reported as "laggy" or
 * "broken" before it was understood. The rules are in DESIGN.md (Motion,
 * Runtime budget); this suite is what keeps them true.
 *
 *  1. Idle is idle. With nobody touching the page, the main thread does almost
 *     nothing. The three homes once spent 400-660 ms of every second redrawing
 *     shaders, restyling a whole film and repainting SVG loops.
 *  2. Shaders rest and wake. A WebGL background draws on load and while the
 *     visitor scrolls, points or touches, then holds its last frame. Counted in
 *     real drawArrays calls: reading a WebGL canvas back without
 *     preserveDrawingBuffer returns blank, so pixels cannot show motion.
 *  3. Reduced motion draws nothing new on scroll.
 *  4. Pinned scroll stories settle on one whole scene. A scene that scrubs
 *     continuously spends most of its scroll range half-dissolved, with the
 *     caption faded out between steps; that is what a visitor screenshots as
 *     broken.
 *  5. No backdrop blur on phones and tablets: each one is a full re-blur of
 *     whatever moves behind it.
 *  6. No per-frame custom property on a scene container: it restyles every
 *     element inside it.
 *
 * Mutations, each of which must fail the suite:
 *   MUT=idle      a page loop restyles an element every frame   -> idle budget
 *   MUT=halfstate one Deli chapter held at half opacity          -> whole scene
 *   MUT=blur      a backdrop blur back on the Gram header        -> phone blur
 *   MUT=wake      the Gram shader ignores reduced motion         -> reduced motion
 */
const { chromium } = require('./_playwright.js');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const MUT = process.env.MUT || '';

// Idle main-thread work, ms per second, unthrottled. Measured locally at
// 1-3 for Deli and Gram and 62-71 for the Xazina film (which plays on its own
// by design). The ceilings leave room for a slower CI runner.
const IDLE_BUDGET = { '/deli-chic/': 40, '/gram-street-coffee/': 40, '/xazina-revamp/': 200 };

const failures = [];
const fail = (where, msg) => failures.push(`${where}: ${msg}`);

const INIT = (mut) => {
  try { localStorage.setItem('cookie-consent', 'denied'); } catch (e) { /* private mode */ }
  window.__draws = {};
  const orig = WebGLRenderingContext.prototype.drawArrays;
  WebGLRenderingContext.prototype.drawArrays = function () {
    const id = (this.canvas && this.canvas.id) || '?';
    window.__draws[id] = (window.__draws[id] || 0) + 1;
    return orig.apply(this, arguments);
  };
  if (mut === 'idle') {
    addEventListener('load', () => { const tick = () => { document.body.style.setProperty('--mut', String(Math.random())); getComputedStyle(document.body).color; requestAnimationFrame(tick); }; requestAnimationFrame(tick); });
  }
  if (mut === 'halfstate') {
    addEventListener('load', () => { const c = document.getElementById('deliCh2'); if (c) new MutationObserver(() => { if (c.style.opacity !== '0.5') c.style.opacity = '0.5'; }).observe(c, { attributes: true }); });
  }
  if (mut === 'blur') {
    addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.site-head{backdrop-filter:blur(14px)!important}'; document.head.appendChild(s); });
  }
};

async function open(browser, path, w, h, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500, reducedMotion: opts.reduce ? 'reduce' : 'no-preference' });
  await ctx.addInitScript(INIT, MUT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 });
  if (MUT === 'wake' && path.includes('gram')) {
    // Undo the reduced-motion guard on the hero's wake-up: the regression it caught.
    await page.evaluate(() => { const c = document.getElementById('fx'); const gl = c && c.getContext('webgl'); if (!gl) return; const draw = () => gl.drawArrays(gl.TRIANGLES, 0, 3); addEventListener('scroll', () => { const t0 = performance.now(); const f = () => { draw(); if (performance.now() - t0 < 1500) requestAnimationFrame(f); }; requestAnimationFrame(f); }, { passive: true }); });
  }
  return { ctx, page, errors };
}

const draws = (page, id) => page.evaluate((id) => (window.__draws || {})[id] || 0, id);

async function wheelTo(page, y) {
  let cur = await page.evaluate(() => scrollY);
  for (let i = 0; i < 300 && Math.abs(y - cur) > 4; i++) {
    await page.mouse.wheel(0, Math.max(-180, Math.min(180, y - cur)));
    await page.waitForTimeout(30);
    const n = await page.evaluate(() => scrollY);
    if (n === cur) break;
    cur = n;
  }
}

async function idleBudget(browser, path, w, h) {
  const { ctx, page, errors } = await open(browser, path, w, h);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.waitForTimeout(4000);       // past the load-time animation window
  const get = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
  const a = await get(); await page.waitForTimeout(4000); const z = await get();
  const ms = Math.round((z.TaskDuration - a.TaskDuration) * 1000 / 4);
  if (ms > IDLE_BUDGET[path]) fail(`${path}@${w}`, `idle main-thread work ${ms} ms/s, budget ${IDLE_BUDGET[path]}`);
  if (errors.length) fail(`${path}@${w}`, `page errors: ${errors.join(' | ').slice(0, 200)}`);
  await ctx.close();
  return ms;
}

async function shaderRestsAndWakes(browser, path, id, w, h) {
  const { ctx, page } = await open(browser, path, w, h);
  const shown = await page.evaluate((id) => { const c = document.getElementById(id); return !!c && getComputedStyle(c).display !== 'none'; }, id);
  if (!shown) { await ctx.close(); return; }
  // Counted from navigation, not from the load event: the shaders start their
  // 2.5s rest deadline during inline init, so on a slow runner they can finish
  // before 'load' fires. Init and the first resize draw a frame or two; a
  // moving shader draws about 75 in its 2.5s window at 30fps, so 10 is the bar.
  // Read 0.8s after load: the loop starts when its visibility observer fires,
  // just after load, and by then it has drawn ~24 if still going, ~55 if done.
  await page.waitForTimeout(800);
  const d1 = await draws(page, id);
  if (d1 < 10) fail(`${path}@${w}`, `#${id} does not move on load (${d1} draw${d1 === 1 ? '' : 's'})`);
  await page.waitForTimeout(3500); const r0 = await draws(page, id); await page.waitForTimeout(900); const r1 = await draws(page, id);
  if (r1 !== r0) fail(`${path}@${w}`, `#${id} keeps drawing at idle (${r1 - r0} draws in 0.9s)`);
  await page.mouse.wheel(0, 60); await page.waitForTimeout(500);
  if ((await draws(page, id)) === r1) fail(`${path}@${w}`, `#${id} does not wake on scroll`);
  await ctx.close();
}

async function reducedMotion(browser, path, id) {
  const { ctx, page } = await open(browser, path, 1440, 900, { reduce: true });
  await page.waitForTimeout(3000);
  const a = await draws(page, id);
  for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, 400); await page.waitForTimeout(150); }
  await page.waitForTimeout(1200);
  const z = await draws(page, id);
  if (z !== a) fail(`${path} reduced motion`, `#${id} drew ${z - a} frames after scrolling`);
  await ctx.close();
}

async function noBlurOnPhones(browser, path, w, h) {
  const { ctx, page } = await open(browser, path, w, h);
  const n = await page.evaluate(() => [...document.querySelectorAll('*')].filter((e) => { const s = getComputedStyle(e).backdropFilter; return s && s !== 'none'; }).map((e) => e.id || e.className.toString().split(' ')[0]));
  if (n.length) fail(`${path}@${w}`, `${n.length} backdrop blur(s) on a phone/tablet: ${n.slice(0, 4).join(', ')}`);
  await ctx.close();
}

async function wholeScenes(browser, w, h) {
  // Gram walk-in: every position settles on one captioned scene.
  let { ctx, page } = await open(browser, '/gram-street-coffee/', w, h);
  await page.waitForTimeout(800);
  let box = await page.evaluate(() => { const el = document.querySelector('.walk'); return el ? { top: el.getBoundingClientRect().top + scrollY, h: el.offsetHeight } : null; });
  if (box) {
    for (let i = 0; i <= 8; i++) {
      await wheelTo(page, Math.round(box.top + (box.h - h) * (i / 8))); await page.waitForTimeout(1000);
      const s = await page.evaluate(() => ({ cap: +getComputedStyle(document.getElementById('walkCap')).opacity, p: document.querySelector('.walk').style.getPropertyValue('--p') }));
      if (s.cap < 0.95) fail(`gram walk@${w}`, `${Math.round(i / 8 * 100)}% settles with the caption at ${s.cap.toFixed(2)}`);
      if (s.p) fail(`gram walk@${w}`, 'a per-frame --p custom property is back on the section');
    }
  }
  await ctx.close();
  // Deli chapter stage: exactly one whole chapter, never two half ones.
  ({ ctx, page } = await open(browser, '/deli-chic/', w, h));
  await page.waitForTimeout(800);
  box = await page.evaluate(() => { const el = document.getElementById('boucherieExperience'); return el ? { top: el.getBoundingClientRect().top + scrollY, h: el.offsetHeight } : null; });
  if (box) {
    for (let i = 0; i <= 8; i++) {
      await wheelTo(page, Math.round(box.top + (box.h - h) * (i / 8))); await page.waitForTimeout(1000);
      const ops = await page.evaluate(() => ['deliCh1', 'deliCh2', 'deliCh3'].map((id) => +getComputedStyle(document.getElementById(id)).opacity));
      const whole = ops.filter((o) => o > 0.95).length, ghost = ops.filter((o) => o > 0.05 && o < 0.95).length;
      if (whole !== 1 || ghost) fail(`deli stage@${w}`, `${Math.round(i / 8 * 100)}% shows chapters at ${ops.map((o) => o.toFixed(2)).join('/')}`);
    }
  }
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  const idle = [];
  for (const path of Object.keys(IDLE_BUDGET)) for (const [w, h] of [[390, 844], [1440, 900]]) idle.push(`${path}@${w} ${await idleBudget(browser, path, w, h)}`);
  for (const [w, h] of [[390, 844], [1440, 900]]) {
    await shaderRestsAndWakes(browser, '/gram-street-coffee/', 'fx', w, h);
    await shaderRestsAndWakes(browser, '/deli-chic/', 'deliAtmosphereCanvas', w, h);
  }
  await reducedMotion(browser, '/gram-street-coffee/', 'fx');
  for (const [w, h] of [[390, 844], [820, 1180]]) {
    await noBlurOnPhones(browser, '/gram-street-coffee/', w, h);
    await noBlurOnPhones(browser, '/deli-chic/', w, h);
  }
  for (const [w, h] of [[390, 844], [1440, 900]]) await wholeScenes(browser, w, h);
  await browser.close();

  if (failures.length) {
    console.error(`storefront-motion: ${failures.length} failure(s)${MUT ? ` [MUT=${MUT}]` : ''}`);
    for (const f of failures.slice(0, 40)) console.error('  ' + f);
    process.exit(1);
  }
  console.log(`storefront-motion: idle ms/s ${idle.join(', ')}; shaders rest and wake; reduced motion holds still; no phone blurs; pinned scenes settle whole.`);
})().catch((e) => { console.error(e); process.exit(1); });
