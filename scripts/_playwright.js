/**
 * One place that knows how to find Playwright, and the browser it drives.
 *
 * Every browser suite used to open with an absolute path into one particular
 * container's global node_modules. That is why none of them run in CI, and why
 * they would throw on a contributor's laptop: fourteen suites that can only
 * execute in one sandbox are fourteen suites nothing is actually gated on.
 *
 * Two problems had to be solved together, because fixing only the first breaks
 * the second:
 *
 *   1. WHICH PLAYWRIGHT. Resolve it as a normal dependency (it is a
 *      devDependency now), falling back to that global path so the suites keep
 *      working in a container where node_modules has not been installed.
 *
 *   2. WHICH BROWSER. A Playwright from npm expects the exact browser build it
 *      shipped with. An image that pre-installs a different build — this one
 *      pins PLAYWRIGHT_BROWSERS_PATH at an older chromium — satisfies the
 *      suites that pass an explicit executablePath and breaks every suite that
 *      just calls launch(). So launch() is wrapped: when the caller gives no
 *      executablePath and Playwright's own build is absent, fall back to
 *      whatever chromium the image does have. In CI there is no pre-installed
 *      browser, `npx playwright install chromium` provides the matching one,
 *      and this wrapper stays out of the way.
 */
const fs = require('node:fs');
const path = require('node:path');

let playwright;
try {
  playwright = require('playwright');
} catch (err) {
  try {
    playwright = require('/opt/node22/lib/node_modules/playwright');
  } catch (_) {
    throw new Error(
      'Playwright is not available. Run `npm install` (it is a devDependency), ' +
      'then `npx playwright install chromium`.\nOriginal error: ' + err.message
    );
  }
}

/** A chromium the host already has, if PLAYWRIGHT_BROWSERS_PATH points at one. */
function preinstalledChromium() {
  if (process.env.PW_CHROMIUM_PATH) return process.env.PW_CHROMIUM_PATH;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !fs.existsSync(root)) return null;
  let dirs;
  try { dirs = fs.readdirSync(root); } catch (_) { return null; }
  const candidates = dirs
    .filter((d) => /^chromium-\d+$/.test(d))
    .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]))
    .map((d) => path.join(root, d, 'chrome-linux', 'chrome'));
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const FALLBACK = preinstalledChromium();

const chromium = Object.create(playwright.chromium);
chromium.launch = function launch(options) {
  const opts = Object.assign({}, options);
  if (!opts.executablePath && FALLBACK) {
    // Only step in when Playwright's own build is missing; otherwise let it
    // use the browser it shipped with, which is always the better match.
    try {
      const own = playwright.chromium.executablePath();
      if (!own || !fs.existsSync(own)) opts.executablePath = FALLBACK;
    } catch (_) {
      opts.executablePath = FALLBACK;
    }
  }
  return playwright.chromium.launch(opts);
};

module.exports = { playwright, chromium, preinstalledChromium };
