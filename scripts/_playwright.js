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
 *   2. WHICH BROWSER. Ten of the suites also hardcoded the binary:
 *
 *        chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/…' })
 *
 *      That is the same bug one layer down, and it is the one that actually
 *      turned CI red: resolving the library is no use while the suite still
 *      points at a chrome-linux directory only this image has. The suites now
 *      call launch() with no path and this module decides, in order:
 *
 *        a. Playwright's own build, if it is installed. Always the best match.
 *        b. whatever chromium the image has, if PLAYWRIGHT_BROWSERS_PATH
 *           points at one (that is this container).
 *        c. nothing, and Playwright reports its own missing-browser error.
 *
 *      An executablePath a caller passes still wins, unless the file is not
 *      there — then it is dropped rather than thrown, because a stale absolute
 *      path is exactly what this module exists to survive. In CI,
 *      `npx playwright install chromium` provides (a) and the rest is unused.
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

/** Playwright's own browser build, if it was ever installed. */
function ownChromium() {
  try {
    const p = playwright.chromium.executablePath();
    return p && fs.existsSync(p) ? p : null;
  } catch (_) {
    return null;
  }
}

const chromium = Object.create(playwright.chromium);
chromium.launch = function launch(options) {
  const opts = Object.assign({}, options);
  // A path that no longer exists is worse than no path: it is the failure this
  // module was written for. Drop it and choose again.
  if (opts.executablePath && !fs.existsSync(opts.executablePath)) {
    delete opts.executablePath;
  }
  if (!opts.executablePath && !ownChromium() && FALLBACK) {
    opts.executablePath = FALLBACK;
  }
  return playwright.chromium.launch(opts);
};

module.exports = { playwright, chromium, preinstalledChromium };
