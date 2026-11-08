// E2E: node e2e.mjs [baseUrl]  -> screenshots in ./shots, exits non-zero on any failure
import { chromium } from 'playwright';
import fs from 'node:fs';
const BASE = process.argv[2] || 'http://localhost:8787';
const LIVE = !BASE.includes('localhost');
fs.mkdirSync('shots', { recursive: true });
let pass = 0, fail = 0; const lines = [];
const ok = (c, n, x) => { c ? pass++ : fail++; lines.push((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? '  -> ' + JSON.stringify(x).slice(0, 300) : '')); console.log((c ? 'PASS ' : 'FAIL ') + n + (!c && x !== undefined ? '  -> ' + JSON.stringify(x).slice(0, 300) : '')); };
const phone = '9' + String(Math.floor(Math.random() * 1e9)).padStart(9, '0');
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
const browser = await chromium.launch({ proxy, args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader'] });
const errors = [];
async function newPage(w, h, mobile) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, ignoreHTTPSErrors: true, permissions: ['camera', 'microphone'], isMobile: !!mobile, hasTouch: !!mobile, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  p.on('console', (m) => { if (m.type() === 'error') errors.push(`[${w}] ${m.text()}`); });
  p.on('pageerror', (e) => errors.push(`[${w}] pageerror ${e.message}`));
  return { ctx, p };
}
const noHScroll = (p) => p.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/* ---------------- desktop 1440 full flow ---------------- */
let { ctx, p } = await newPage(1440, 900);
await p.goto(BASE, { waitUntil: 'networkidle' });
ok(await p.isVisible('#authView'), 'auth view shown when signed out');
await p.screenshot({ path: 'shots/1440-auth.png' });
await p.click('#tabUp');
await p.fill('#upName', 'E2E Tester'); await p.fill('#upNum', phone); await p.fill('#upPin', '1234'); await p.fill('#upPin2', '1234');
await p.click('#upBtn'); await p.waitForTimeout(1500);
ok(/easy/.test(await p.textContent('#upErr')), 'weak PIN rejected in UI', await p.textContent('#upErr'));
await p.fill('#upPin', '4829'); await p.fill('#upPin2', '4820'); await p.click('#upBtn');
ok((await p.textContent('#upErr')).includes('do not match'), 'PIN mismatch caught client-side');
await p.fill('#upPin2', '4829'); await p.click('#upBtn');
await p.waitForSelector('.modal .code', { timeout: 20000 });
const code = (await p.textContent('.modal .code')).trim();
ok(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/.test(code), 'recovery code shown after signup', code);
ok(await p.isDisabled('#rcGo'), 'continue disabled until saved-checkbox ticked');
await p.screenshot({ path: 'shots/1440-recovery.png' });
await p.check('#rcOk'); await p.click('#rcGo');
await p.waitForSelector('#libGrid .sc:not(.new)', { timeout: 20000 });
ok((await p.textContent('#libGrid')).includes('Welcome to Prompter Cam'), 'library shows seeded welcome script');
ok((await p.textContent('#whoName')) === 'E2E Tester', 'name shown in header');
await p.screenshot({ path: 'shots/1440-library.png' });

// legacy import
await p.evaluate(() => { localStorage.setItem('prompter.script', '"exact"'); localStorage.setItem('prompter.custom', JSON.stringify({ s60: ['Custom edited line one.', 'Line two.'] })); localStorage.setItem('prompter.wpm', '140'); });
await p.reload({ waitUntil: 'networkidle' }); await p.waitForSelector('#libGrid .sc:not(.new)');
ok(await p.isVisible('#legacyBanner'), 'legacy import banner appears when old data exists');
await p.click('#btnLegacy'); await p.waitForFunction(() => document.querySelectorAll('#libGrid .sc:not(.new)').length === 5, null, { timeout: 30000 }).catch(() => {});
ok(await p.evaluate(() => document.querySelectorAll('#libGrid .sc:not(.new)').length) === 5, 'legacy import created 4 scripts');
ok((await p.textContent('#libGrid')).includes('Custom edited line one.'), 'legacy custom edits preserved');
ok(!(await p.isVisible('#legacyBanner')), 'banner hidden after import');

// search
await p.fill('#libSearch', 'avatar'); ok(await p.evaluate(() => document.querySelectorAll('#libGrid .sc').length) === 1, 'search filters scripts'); await p.fill('#libSearch', '');

// new script -> studio with editor
await p.click('#btnNew'); await p.waitForSelector('#drEdit.open', { timeout: 15000 });
ok(await p.isVisible('#studioView'), 'new script opens studio with editor');
await p.fill('#edTitle', 'E2E Reel');
const body = '# Hook\nThis is a **test** script for the end to end run.\n\nSecond paragraph [pause] with more words so that scrolling has room to move along nicely.\n\n' + Array.from({ length: 30 }, (_, i) => 'Filler sentence number ' + (i + 1) + ' keeps the text long enough to scroll.').join(' ');
await p.fill('#edBody', body); await p.waitForTimeout(1500);
await p.click('#drEdit [data-close]'); await p.waitForTimeout(800);
ok(await p.evaluate(() => !!document.querySelector('#txt .cue') && !!document.querySelector('#txt strong') && !!document.querySelector('#txt .pause')), 'cue, bold and pause markers rendered');
ok((await p.textContent('#saveState')) === 'Saved', 'autosave shows Saved', await p.textContent('#saveState'));
const words = Number(await p.textContent('#stWords')); ok(words > 300, 'word count stat', words);
await p.screenshot({ path: 'shots/1440-studio.png' });

// scrolling
await p.click('#scroll', { position: { x: 400, y: 300 } }); await p.waitForTimeout(1500);
const st1 = await p.evaluate(() => document.getElementById('scroll').scrollTop);
ok(st1 > 5, 'tap on text starts scrolling', st1);
await p.keyboard.press('Space'); const st2 = await p.evaluate(() => document.getElementById('scroll').scrollTop); await p.waitForTimeout(600);
ok(await p.evaluate(() => document.getElementById('scroll').scrollTop) === st2, 'Space pauses scrolling');
await p.keyboard.press('ArrowRight'); await p.waitForTimeout(300);
ok((await p.textContent('#spdVal')) === '135', 'arrow key raises speed 130 -> 135', await p.textContent('#spdVal'));
await p.keyboard.press('Home');

// settings persist per script
await p.click('#btnSettings'); await p.waitForSelector('#drSettings.open');
await p.$eval('#sSize', (el) => { el.value = 62; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.click('[data-seg="font"], #sFont').catch(() => {}); await p.selectOption('#sFont', 'atkinson');
await p.click('[data-seg="countdown"] [data-v="0"]');
await p.click('[data-seg="layout"] [data-v="overlay"]');
ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tp-size').trim()) === '62px', 'size slider applies live');
ok(await p.evaluate(() => document.getElementById('stage').classList.contains('overlay')), 'overlay layout applies');
await p.screenshot({ path: 'shots/1440-settings.png' });
await p.click('[data-seg="layout"] [data-v="split"]');
await p.waitForTimeout(1500);

// camera + backgrounds
await p.click('#btnCam'); await p.waitForFunction(() => document.getElementById('camOff').hidden, null, { timeout: 15000 }).catch(() => {});
ok(await p.evaluate(() => document.getElementById('camOff').hidden), 'camera starts (fake device)');
await p.waitForTimeout(1200);
const lit = await p.evaluate(() => { const c = document.getElementById('out'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4000) s += d[i] + d[i + 1] + d[i + 2]; return s; });
ok(lit > 1000, 'camera frames drawn to canvas', lit);
await p.click('#bgGrid .bgTile[aria-label="Background: Colour"]');
await p.$eval('[data-k="bgColor"]', (el) => { el.value = '#ff0000'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.waitForFunction(() => /bg on/.test(document.getElementById('camLabel').textContent), null, { timeout: 45000 }).catch(() => {});
ok(/bg on/.test(await p.textContent('#camLabel')), 'MediaPipe segmenter loaded', await p.textContent('#camLabel'));
await p.waitForTimeout(2500);
const red = await p.evaluate(() => { const c = document.getElementById('out'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let r = 0, n = 0; for (let i = 0; i < d.length; i += 400) { n++; if (d[i] > 200 && d[i + 1] < 60 && d[i + 2] < 60) r++; } return r / n; });
ok(red > 0.5, 'colour background composited (no person in fake feed -> mostly red)', red);
await p.screenshot({ path: 'shots/1440-colour-bg.png' });
await p.click('#bgGrid .bgTile[aria-label="Background: Blur"]'); await p.waitForTimeout(800);
await p.click('#bgGrid .bgTile[aria-label="Background: Neon night"]'); await p.waitForTimeout(800);
ok(await p.evaluate(() => document.querySelector('#bgGrid .bgTile[aria-label="Background: Neon night"]').getAttribute('aria-pressed') === 'true'), 'preset background selectable');
// upload a background
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR42mP8z8DAwMDAxMDAwMDAAAANHQEDK+mmyQAAAABJRU5ErkJggg==', 'base64');
await p.setInputFiles('#bgFile', { name: 'my-office.png', mimeType: 'image/png', buffer: png });
await p.waitForFunction(() => document.querySelectorAll('#bgGrid .bgTile .x').length === 1, null, { timeout: 20000 }).catch(() => {});
ok(await p.evaluate(() => document.querySelectorAll('#bgGrid .bgTile .x').length) === 1, 'custom background uploaded and selected');
// aspect 9:16
await p.click('[data-seg="aspect"] [data-v="9:16"]'); await p.waitForTimeout(500);
ok(await p.evaluate(() => { const c = document.getElementById('out'); return c.width + 'x' + c.height; }) === '1080x1920', 'reel 9:16 output = 1080x1920');
await p.click('#drSettings [data-close]');
await p.screenshot({ path: 'shots/1440-reel.png' });

// record a take
await p.click('#btnRec'); await p.waitForTimeout(3200);
ok(await p.evaluate(() => document.getElementById('stage').classList.contains('recording')), 'recording in progress');
ok(await p.evaluate(() => document.getElementById('scroll').scrollTop) > 0, 'auto-scroll started with recording');
await p.keyboard.press('r'); await p.waitForSelector('#drTakes.open', { timeout: 10000 });
const take = await p.evaluate(() => ({ n: document.querySelectorAll('#takes .take').length, meta: document.querySelector('#takes .take .meta')?.textContent, dl: document.querySelector('#takes a.dl')?.getAttribute('download') }));
ok(take.n === 1 && /e2e-reel_take1_\d{8}-\d{4}\.(mp4|webm)/.test(take.dl), 'take saved with contextual filename', take);
ok(/1080×1920/.test(take.meta || ''), 'take is 1080x1920', take.meta);
await p.screenshot({ path: 'shots/1440-takes.png' });
await p.click('#drTakes [data-close]');

// persistence after reload
const sid = await p.evaluate(() => location.hash);
await p.reload({ waitUntil: 'networkidle' }); await p.waitForFunction(() => document.getElementById('stTitle').textContent === 'E2E Reel', null, { timeout: 15000 }).catch(() => {});
const persisted = await p.evaluate(() => ({ size: getComputedStyle(document.documentElement).getPropertyValue('--tp-size').trim(), font: getComputedStyle(document.documentElement).getPropertyValue('--tp-font'), wpm: document.getElementById('spdVal').textContent, title: document.getElementById('stTitle').textContent }));
ok(persisted.size === '62px' && /Atkinson/.test(persisted.font) && persisted.wpm === '135' && persisted.title === 'E2E Reel', 'per-script settings + text persisted in Neon after reload', persisted);
// other scripts keep their own settings
await p.goto(BASE + '/#/', { waitUntil: 'networkidle' }); await p.waitForSelector('#libGrid .sc:not(.new)');
await p.click('#libGrid .sc:has-text("Welcome to Prompter Cam")'); await p.waitForFunction(() => document.getElementById('stTitle').textContent.startsWith('Welcome'));
ok(await p.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--tp-size').trim()) === '44px', 'other script keeps its own (default) settings');
await p.goto(BASE + '/' + sid, { waitUntil: 'networkidle' });

// autosave survives instant navigation (keepalive flush, per-script queue)
await p.waitForFunction(() => document.getElementById('stTitle').textContent === 'E2E Reel', null, { timeout: 15000 });
await p.click('#btnEdit'); await p.fill('#edTitle', 'E2E Reel'); await p.$eval('#edBody', (el) => { el.value += '\n\nRACE-MARKER-123'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await p.evaluate(() => { location.hash = '#/'; }); await p.waitForTimeout(150); await p.reload({ waitUntil: 'networkidle' });
await p.goto(BASE + '/' + sid, { waitUntil: 'networkidle' }); await p.waitForFunction(() => document.getElementById('stTitle').textContent === 'E2E Reel', null, { timeout: 15000 }).catch(() => {});
ok((await p.inputValue('#edBody')).includes('RACE-MARKER-123'), 'edit made just before navigating away is saved');
// logout + login
await p.goto(BASE + '/#/', { waitUntil: 'networkidle' }); await p.waitForSelector('#btnAccount');
await p.click('#btnAccount'); await p.click('#btnLogout'); await p.waitForSelector('#authView:not([hidden])');
await p.fill('#inNum', phone); await p.fill('#inPin', '1111'); await p.click('#inBtn'); await p.waitForTimeout(2500);
ok(/incorrect/.test(await p.textContent('#inErr')) && /4 attempts left/.test(await p.textContent('#inErr')), 'wrong PIN message with attempts left', await p.textContent('#inErr'));
await p.fill('#inPin', '4829'); await p.click('#inBtn'); await p.waitForSelector('#libView:not([hidden])', { timeout: 15000 }).catch(() => {});
ok(await p.isVisible('#libView'), 'login with mobile + PIN');
ok(await noHScroll(p), 'no horizontal scroll @1440');
await ctx.close();

/* ---------------- tablet 820 & phone 390 ---------------- */
for (const [w, h, mob] of [[820, 1180, true], [390, 844, true]]) {
  ({ ctx, p } = await newPage(w, h, mob));
  await p.goto(BASE, { waitUntil: 'networkidle' });
  ok(await noHScroll(p), `no horizontal scroll on auth @${w}`);
  await p.screenshot({ path: `shots/${w}-auth.png`, fullPage: true });
  await p.fill('#inNum', phone); await p.fill('#inPin', '4829'); await p.click('#inBtn');
  await p.waitForSelector('#libGrid .sc:not(.new)', { timeout: 20000 });
  ok(await noHScroll(p), `no horizontal scroll on library @${w}`);
  await p.screenshot({ path: `shots/${w}-library.png` });
  await p.click('#libGrid .sc:has-text("E2E Reel")'); await p.waitForFunction(() => document.getElementById('stTitle').textContent === 'E2E Reel');
  await p.click('#btnCam'); await p.waitForTimeout(2500);
  ok(await noHScroll(p), `no horizontal scroll on studio @${w}`);
  const dockOk = await p.evaluate(() => { const r = document.querySelector('.dock').getBoundingClientRect(); return r.bottom <= window.innerHeight + 1 && r.right <= window.innerWidth + 1; });
  ok(dockOk, `controls dock fully on screen @${w}`);
  const tap = await p.evaluate(() => [...document.querySelectorAll('.dock button')].filter((b) => b.offsetParent).every((b) => b.getBoundingClientRect().height >= 32));
  ok(tap, `dock buttons tappable size @${w}`);
  await p.screenshot({ path: `shots/${w}-studio.png` });
  await p.click('#btnSettings'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => { const r = document.getElementById('drSettings').getBoundingClientRect(); return r.left >= -1 && r.right <= window.innerWidth + 1; }), `settings drawer fits @${w}`);
  await p.screenshot({ path: `shots/${w}-settings.png` });
  await p.click('#drSettings [data-close]');
  await p.click('#btnEdit'); await p.waitForTimeout(400); await p.screenshot({ path: `shots/${w}-edit.png` }); await p.click('#drEdit [data-close]');
  await ctx.close();
}

/* ---------------- cleanup: delete account through the UI ---------------- */
({ ctx, p } = await newPage(1440, 900));
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.fill('#inNum', phone); await p.fill('#inPin', '4829'); await p.click('#inBtn'); await p.waitForSelector('#libView:not([hidden])');
await p.click('#btnAccount'); await p.click('#btnDeleteAcc'); await p.click('.modal [data-a="1"]');
await p.fill('.modal input', '4829'); await p.click('.modal [data-a="1"]'); await p.waitForSelector('#authView:not([hidden])', { timeout: 15000 }).catch(() => {});
ok(await p.isVisible('#authView'), 'account deleted via UI');
await p.fill('#inNum', phone); await p.fill('#inPin', '4829'); await p.click('#inBtn'); await p.waitForTimeout(2000);
ok(/incorrect/.test(await p.textContent('#inErr')), 'deleted account cannot sign in');
await ctx.close(); await browser.close();

const realErrors = errors.filter((e) => !/favicon|Failed to load resource: the server responded with a status of 40[0-9]/.test(e));
ok(realErrors.length === 0, 'zero unexpected console errors', realErrors);
console.log(`\n${pass} passed, ${fail} failed  (${BASE})`);
fs.writeFileSync('shots/e2e-log.txt', lines.join('\n') + `\n${pass} passed, ${fail} failed\nconsole errors: ${JSON.stringify(errors, null, 1)}\n`);
process.exit(fail ? 1 : 0);
