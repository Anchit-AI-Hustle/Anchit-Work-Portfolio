// Render the brand 3D models to still images for the brand pages.
//
// Gram Street has no brand-owned photography, so its drinks are modelled in
// assets/brand-3d.js and rendered here by the same code the live viewers run,
// and the page shows these frames where stock photos used to be. Re-run after
// changing a model:
//
//   npm run build && npx serve -l 8099 www     # in another shell
//   node scripts/render-brand-stills.js
//
// Writes assets/brand/3d/<name>-<w>.png (transparent background). Rebuild after.
const { chromium } = require('./_playwright.js');
const { writeFile, mkdir } = require('node:fs/promises');

const BASE = process.env.BASE || 'http://127.0.0.1:8099';
const SHOTS = [
  ['gram-cup', [1200, 640]], ['gram-matcha', [1200, 640]], ['gram-espresso', [1200, 640]], ['gram-gelato', [1200, 640]],
];

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage();
  await page.goto(BASE + '/404.html');
  await page.addScriptTag({ url: BASE + '/assets/brand-3d.js' });
  await page.waitForFunction(() => window.BrandStill);
  await mkdir('assets/brand/3d', { recursive: true });
  for (const [name, sizes] of SHOTS) {
    for (const w of sizes) {
      const h = Math.round(w * 0.75);
      const url = await page.evaluate(([n, w, h]) => window.BrandStill(n, w, h), [name, w, h]);
      const file = `assets/brand/3d/${name}-${w}.png`;
      await writeFile(file, Buffer.from(url.split(',')[1], 'base64'));
      console.log('wrote', file);
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
