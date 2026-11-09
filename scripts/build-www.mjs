#!/usr/bin/env node
/**
 * Build step for Capacitor/Vercel: mirror static web assets into ./www,
 * compile the standalone How-To Engine into /how-to, and attach the shared
 * App Skill Map plus Project SkillTree & Guide Library to every HTML app.
 */
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deferGoogleFontsIn } from './defer-fonts.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WWW = join(ROOT, 'www');
const HOW_TO_ROUTE = 'how-to';
const HOW_TO_PATH = `/${HOW_TO_ROUTE}`;
const APP_SKILL_MAP_MARKER = 'data-app-skill-map';
const PROJECT_PLAYBOOK_MARKER = 'data-project-playbooks';
const APP_SKILL_MAP_TAGS = [
  `  <link rel="stylesheet" href="/assets/app-skill-map.css" ${APP_SKILL_MAP_MARKER}="styles">`,
  `  <script defer src="/assets/app-skill-map.js" ${APP_SKILL_MAP_MARKER}="runtime"></script>`,
].join('\n');
const PROJECT_PLAYBOOK_TAGS = [
  `  <link rel="stylesheet" href="/assets/project-playbooks.css" ${PROJECT_PLAYBOOK_MARKER}="styles">`,
  `  <script defer src="/assets/project-playbooks.js" ${PROJECT_PLAYBOOK_MARKER}="runtime"></script>`,
].join('\n');

const assets = [
  'index.html',
  'freelancer.html',
  'jobhunt.html',
  'task-tracker.html',
  'marketing-101.html',
  // Ayushi❤️'s Growth Studio. This page was live for months WITHOUT ever being
  // committed: it was deployed straight from a working tree with `vercel --prod`
  // (two production deploys carry gitDirty:1 and a claude@local author, on
  // commits fef8c6c and 0aae37d that exist nowhere in this repository). Every
  // git-based deploy rebuilds www/ from the repo alone, so each one silently
  // deleted it, once before, hence a commit literally titled "restore
  // /marketing-101-for-ayushi", and again when #147 merged. Committing it is
  // what actually ends that cycle.
  'marketing-101-for-ayushi.html',
  // Growth School, the public course and Ayushi❤️'s version. Both are thin
  // shells over assets/growth-school.{css,js} and the shared content file, so
  // the pair cannot drift; see the note at the top of growth-school-content.js.
  'growth-school.html',
  'lifecycle-os.html',
  'lifecycle-os-studio.html',
  'lifecycle-os-analysis.html',
  'lifecycle-os-calendar.html',
  'lifecycle-os-intel.html',
  'lifecycle-os-brain.html',
  'lifecycle-os-playbook.html',
  'lifecycle-os-landing.html',
  'lifecycle-os-connectors.html',
  'lifecycle-os-social.html',
  'lifecycle-os-ads.html',
  'lifecycle-os-creative.html',
  'lifecycle-os-cohorts.html',
  'lifecycle-os-ask.html',
  'lifecycle-os-music.html',
  'lifecycle-os-audit.html',
  'lifecycle-os-frameworks.html',
  'lifecycle-os-kit.css',
  'lifecycle-os-kit.js',
  'agent.html',
  // The shared sign-in demo. Also the page that documents how every other
  // project wires assets/anchit-auth.js, so it ships with the asset it explains.
  'auth-demo.html',
  'hotel.html',
  'manifest.json',
  'privacy.html',
  'terms.html',
  '404.html',
  'sw.js',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'AnchitTandon-AppLogo.png',
  'icons',
  'assets',
  'audio',
  'cyber',
  'gram-street-coffee',
  'deli-chic',
  'pw-study',
  'amar-ujala',
  'ET_Study',
  'TimesHealth_Study',
  // Films page: /movies lists every playable film. Media (HLS segments,
  // MP4s, posters, VTT) ships as plain static files next to the page.
  'movies',
  // Games: /games is the hub, /games/<slug> each game. Plain HTML, CSS and
  // JavaScript on one shared shell (games/shared/arcade.js), no bundler; the
  // build only versions their URLs and adds modulepreload (optimizeGames).
  'games',
];

// Stamp the service worker's cache name from the content it will serve.
//
// sw.js is cache-first for same-origin assets, so a stale cache name freezes
// every script and stylesheet on the site for anyone who has visited before.
// The constant carried a hand-written date and the instruction "bump this
// string on every deploy", it was last bumped on 2026-08-17 and drifted a
// month behind, which shipped new HTML against August's JavaScript to every
// returning visitor.
//
// A hash rather than a timestamp: it changes when the bytes change and not
// otherwise, so a rebuild that alters nothing does not throw away a warm cache
// for every visitor. Nothing to remember, and it cannot drift again.
// Fingerprint the study stylesheets and scripts in the pages that load them.
//
// sw.js answers same-origin assets from cache first and refreshes behind the
// scenes, while pages always come from the network. On the first visit after
// a deploy that pairs new markup with the previous stylesheet: the study
// problem cards gained 96px source thumbnails whose rules lived only in the
// new study.css, so returning visitors saw full-size screenshots burst out of
// their cards until a second reload. A content hash in the URL makes the new
// page ask for the new file, which no old cache can answer.
const FINGERPRINT_DIRS = ['ET_Study', 'TimesHealth_Study'];
async function fingerprintStudyAssets() {
  const digest = new Map();
  const hashOf = async (urlPath) => {
    if (!digest.has(urlPath)) {
      const file = join(WWW, urlPath);
      digest.set(urlPath, existsSync(file) ? createHash('sha256').update(await readFile(file)).digest('hex').slice(0, 10) : null);
    }
    return digest.get(urlPath);
  };
  let pages = 0, refs = 0;
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { await walk(full); continue; }
      if (!e.name.endsWith('.html')) continue;
      const src = await readFile(full, 'utf8');
      const re = /(href|src)="(\/(?:ET_Study|TimesHealth_Study)\/[^"?#]+\.(?:css|js))"/g;
      let out = '', last = 0, m;
      while ((m = re.exec(src))) {
        const h = await hashOf(m[2].slice(1));
        if (!h) continue;
        out += src.slice(last, m.index) + `${m[1]}="${m[2]}?v=${h}"`;
        last = m.index + m[0].length;
        refs++;
      }
      if (last) { await writeFile(full, out + src.slice(last)); pages++; }
    }
  };
  for (const d of FINGERPRINT_DIRS) if (existsSync(join(WWW, d))) await walk(join(WWW, d));
  console.log(`[build-www] fingerprinted ${refs} study asset links in ${pages} pages`);
}

// Games: version every script, stylesheet and poster under /games by content,
// and start the 3D engine downloading with the page instead of after it.
//
// 1. VERSIONED URLS. Every '/games/...' or './...' reference to a .js, .css,
//    .webp or .png that exists in the build gets ?v=<content hash>, in the game
//    modules (import specifiers and the 2D fallback loaders) and in the pages.
//    A module's hash is taken AFTER its own imports are rewritten, so changing
//    three.js changes every module that imports it, and an old page can never
//    pair with new code. vercel.json marks /games/* requests that carry ?v= as
//    immutable for a year, so a returning player downloads nothing and does not
//    even revalidate; a request without ?v= (a page that builds a path at run
//    time) keeps the default, always revalidated, so nothing can go stale.
//
// 2. MODULEPRELOAD. A game page used to fetch its module only after
//    DOMContentLoaded, which itself waited on the Google Fonts stylesheet, and
//    then three.module.min.js, then three.core.min.js, one after another. The
//    page now lists the whole static import graph of the module its loader
//    names as <link rel="modulepreload">, so the browser fetches and compiles
//    it in parallel with the page. The graph is read from the files, so it
//    cannot drift from what the game actually imports.
const GAME_REF = /(["'])((?:\/games\/|\.\.?\/)[^"'\s?#]+\.(?:js|mjs|css|webp|png))\1/g;
const STATIC_IMPORT = /(?:^|[;\s}])(?:import|export)\s*(?:[\w*{}\s,$]+?\s*from\s*)?["']([^"']+)["']/g;
async function optimizeGames() {
  const GAMES = join(WWW, 'games');
  if (!existsSync(GAMES)) return;
  const files = [];
  const walk = async (dir) => {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full); else files.push(full);
    }
  };
  await walk(GAMES);
  const urlOf = (file) => '/' + file.slice(WWW.length + 1).split('\\').join('/');
  const fileOf = (spec, fromUrl) => {
    const u = spec.startsWith('/') ? spec : new URL(spec, 'http://x' + fromUrl).pathname;
    if (!u.startsWith('/games/')) return null;
    const f = join(WWW, u.slice(1));
    return existsSync(f) ? f : null;
  };

  // Rewrite a text file's references, hashing each target first (depth first).
  const hashes = new Map();
  const rewritten = new Map();
  const visiting = new Set();
  const rewrite = async (file) => {
    if (rewritten.has(file)) return rewritten.get(file);
    visiting.add(file);
    const src = await readFile(file, 'utf8');
    const from = urlOf(file);
    let out = '', last = 0, m;
    GAME_REF.lastIndex = 0;
    const matches = [];
    while ((m = GAME_REF.exec(src))) matches.push({ index: m.index, len: m[0].length, q: m[1], spec: m[2] });
    for (const r of matches) {
      const target = fileOf(r.spec, from);
      if (!target || target === file || visiting.has(target)) continue;
      const h = await hashOf(target);
      out += src.slice(last, r.index) + r.q + r.spec + '?v=' + h + r.q;
      last = r.index + r.len;
    }
    out += src.slice(last);
    visiting.delete(file);
    rewritten.set(file, out);
    return out;
  };
  const hashOf = async (file) => {
    if (hashes.has(file)) return hashes.get(file);
    const text = /\.(js|mjs|css)$/.test(file);
    const bytes = text ? Buffer.from(await rewrite(file)) : await readFile(file);
    const h = createHash('sha256').update(bytes).digest('hex').slice(0, 10);
    hashes.set(file, h);
    return h;
  };

  // The static import graph of a module, itself first.
  const graph = (file, seen = new Set()) => {
    if (seen.has(file)) return seen;
    seen.add(file);
    const src = rewritten.get(file) || '';
    const deps = [...src.matchAll(STATIC_IMPORT)].map((m) => fileOf(m[1].split('?')[0], urlOf(file)));
    for (const dep of deps) if (dep) graph(dep, seen);
    return seen;
  };

  let pages = 0, preloads = 0;
  for (const f of files) if (/\.(js|mjs|css)$/.test(f)) await hashOf(f);
  for (const f of files) {
    if (/\.(js|mjs|css)$/.test(f)) { await writeFile(f, rewritten.get(f)); continue; }
    if (!f.endsWith('.html')) continue;
    let html = await rewrite(f);
    // The module the page's loader runs when WebGL2 is there.
    const entry = /\.type\s*=\s*["']module["'];?\s*\w+\.src\s*=\s*["']([^"'?]+)/.exec(html) ||
      /<script[^>]*type=["']module["'][^>]*src=["']([^"'?]+)/i.exec(html);
    const entryFile = entry && fileOf(entry[1], urlOf(f));
    if (entryFile && !html.includes('rel="modulepreload"')) {
      const tags = [...graph(entryFile)].map((dep) => `  <link rel="modulepreload" href="${urlOf(dep)}?v=${hashes.get(dep)}">`);
      html = html.replace(/(<meta[^>]+name=["']viewport["'][^>]*>\n?)/i, `$1${tags.join('\n')}\n`);
      preloads += tags.length;
    }
    html = await posterSrcset(html, hashOf);
    await writeFile(f, html);
    pages++;
  }
  console.log(`[build-www] games: versioned ${hashes.size} files, ${pages} pages, ${preloads} modulepreload links`);
}

// The hub's cards showed each game's full 1200px poster in a card 360 to 480
// CSS pixels wide. Where the smaller copies games-posters.js writes beside a
// poster exist, the <img> gets a srcset and sizes, so a phone downloads the
// 800px copy and a desktop the 480px one. A poster without them is untouched.
async function posterSrcset(html, hashOf) {
  const re = /<img\b([^>]*?)\bsrc="(\/games\/([\w-]+)\/poster\.webp)\?v=(\w+)"([^>]*)>/g;
  let out = '', last = 0, m;
  while ((m = re.exec(html))) {
    if (/srcset=/.test(m[0])) continue;
    const dir = join(WWW, 'games', m[3]);
    const small = [480, 800].map((w) => join(dir, `poster-${w}.webp`));
    if (!small.every((p) => existsSync(p))) continue;
    const feature = /class="[^"]*\bfeature\b/.test(html.slice(html.lastIndexOf('<article', m.index), m.index));
    const sizes = feature ? '(max-width: 860px) calc(100vw - 32px), min(712px, 56vw)' : '(max-width: 680px) calc(100vw - 32px), (max-width: 1080px) 46vw, 400px';
    const set = [`/games/${m[3]}/poster-480.webp?v=${await hashOf(small[0])} 480w`, `/games/${m[3]}/poster-800.webp?v=${await hashOf(small[1])} 800w`, `${m[2]}?v=${m[4]} 1200w`].join(', ');
    out += html.slice(last, m.index) + `<img${m[1]}src="${m[2]}?v=${m[4]}" srcset="${set}" sizes="${sizes}"${m[5]}>`;
    last = m.index + m[0].length;
  }
  return out + html.slice(last);
}

// Google Fonts no longer holds the first paint on any page (see
// scripts/defer-fonts.mjs for why and how).
async function deferGoogleFonts() {
  let pages = 0;
  for (const file of await collectHtmlFiles(WWW)) {
    const before = await readFile(file, 'utf8');
    const after = deferGoogleFontsIn(before, file.slice(WWW.length + 1));
    if (after !== before) { await writeFile(file, after); pages++; }
  }
  console.log(`[build-www] fonts: Google Fonts stylesheet no longer blocks first paint on ${pages} page(s)`);
}
async function stampServiceWorker() {
  const swPath = join(WWW, 'sw.js');
  if (!existsSync(swPath)) return;

  const hash = createHash('sha256');
  const walk = async (dir) => {
    const entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : 1);
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) { await walk(full); continue; }
      // Only what the worker can serve stale. Images and icons are content-
      // addressed by name here already and dominate the byte count.
      if (!/\.(js|mjs|css|html|json)$/i.test(e.name)) continue;
      hash.update(e.name);
      hash.update(await readFile(full));
    }
  };
  await walk(WWW);

  const stamp = hash.digest('hex').slice(0, 12);
  const src = await readFile(swPath, 'utf8');
  const next = src.replace(/^const CACHE = '[^']*';$/m, `const CACHE = 'anchit-portfolio-${stamp}';`);
  if (next === src) {
    console.warn('[build-www] sw.js: CACHE constant not found, cache version NOT stamped');
    return;
  }
  await writeFile(swPath, next);
  console.log(`[build-www] sw.js cache stamped → anchit-portfolio-${stamp}`);
}

async function copyEntry(src, dest) {
  const s = await stat(src);
  if (!s.isDirectory()) {
    await mkdir(dirname(dest), { recursive: true });
    await copyFile(src, dest);
    return;
  }

  await mkdir(dest, { recursive: true });
  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    await copyEntry(join(src, entry.name), join(dest, entry.name));
  }
}

// The source portfolio shell is intentionally a single large HTML document.
// Patch only the generated www copy so the live Side Hustle card points at the
// canonical route without making the root shell build fragile.
async function patchHowToCardRoute() {
  const target = join(WWW, 'index.html');
  if (!existsSync(target)) return;
  const before = await readFile(target, 'utf8');
  const after = before.replace(/href="\/how-to(?:-1)?"/g, `href="${HOW_TO_PATH}"`);
  await writeFile(target, after, 'utf8');
  console.log(`[build-www] how-to: Side Hustle card → ${HOW_TO_PATH}`);
}

// Build the How-To Engine (standalone Vite + React app under
// side-husle/how-to-1) and mirror its dist into www/how-to so it ships at
// /how-to on the main static deployment. The route is driven by HOW_TO_ROUTE
// above, /how-to-1 and /how-to-2 survive only as redirects in vercel.json for
// links that were shared before the route settled.
// Wrapped so a failure here never takes down the rest of the portfolio.
async function buildHowTo() {
  const engine = join(ROOT, 'side-husle', 'how-to-1');
  if (!existsSync(join(engine, 'package.json'))) {
    console.warn('[build-www] skip how-to: engine not found');
    return;
  }
  try {
    // Always install from the lockfile. This used to run only when
    // node_modules was missing, but Vercel restores node_modules from its
    // build cache, so a lockfile change (the vite 5 -> 6 security bump) never
    // reached the deploy: production kept building with the cached vite 5.
    console.log('[build-www] how-to: installing deps from lockfile…');
    execSync('npm ci --no-audit --no-fund --loglevel=error', { cwd: engine, stdio: 'inherit' });
    console.log(`[build-www] how-to: building for ${HOW_TO_PATH}…`);
    execSync('npm run build', { cwd: engine, stdio: 'inherit' });
    const dist = join(engine, 'dist');
    if (!existsSync(dist)) throw new Error('dist not produced');
    await copyEntry(dist, join(WWW, HOW_TO_ROUTE));
    console.log(`[build-www] how-to: mirrored dist → www/${HOW_TO_ROUTE}`);
  } catch (err) {
    console.warn(`[build-www] how-to build failed (skipping, main build unaffected): ${err?.message || err}`);
  }
}

async function collectHtmlFiles(dir) {
  const output = [];
  if (!existsSync(dir)) return output;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) output.push(...await collectHtmlFiles(path));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.html')) output.push(path);
  }
  return output;
}

// Shared runtimes are injected after all static files are copied and after the
// nested React app is built. Every first-party HTML entry point therefore gets:
//   1) app-level navigation and dependencies; and
//   2) project-level paths, guide packs, copyable prompts and local progress.
const CONSENT_MARKER = 'data-consent-runtime';
const CONSENT_TAG =
  `  <script defer src="/assets/consent.js" ${CONSENT_MARKER}="runtime"></script>`;

// Consent is not a widget, it is a legal control, so it cannot be opt-in per
// page: a page that forgets the tag is a page that silently loads analytics
// without asking. Every HTML file in the output gets it, exactly once.
//
// This is a separate pass from injectSharedExperience() on purpose. That one is
// switched off deliberately (see the note where it would be called) because the
// Skill Map and Playbook widgets it injects were taken off the site.
async function injectConsent() {
  const htmlFiles = await collectHtmlFiles(WWW);
  let injected = 0;
  let skipped = 0;

  for (const file of htmlFiles) {
    const before = await readFile(file, 'utf8');
    if (before.includes(CONSENT_MARKER)) { skipped++; continue; }
    if (!/<\/head>/i.test(before)) {
      console.warn(`[build-www] consent: skip HTML without </head>: ${file}`);
      skipped++;
      continue;
    }
    await writeFile(file, before.replace(/<\/head>/i, `${CONSENT_TAG}\n</head>`), 'utf8');
    injected++;
  }
  console.log(`[build-www] consent: injected into ${injected} page(s)${skipped ? `; skipped ${skipped}` : ''}`);
}

async function injectSharedExperience() {
  const htmlFiles = await collectHtmlFiles(WWW);
  let skillMapInjected = 0;
  let playbooksInjected = 0;
  let skipped = 0;

  for (const file of htmlFiles) {
    const before = await readFile(file, 'utf8');
    if (!/<\/head>/i.test(before)) {
      console.warn(`[build-www] shared-ui: skip HTML without </head>: ${file}`);
      skipped++;
      continue;
    }

    const additions = [];
    if (!before.includes(APP_SKILL_MAP_MARKER)) {
      additions.push(APP_SKILL_MAP_TAGS);
      skillMapInjected++;
    }
    if (!before.includes(PROJECT_PLAYBOOK_MARKER)) {
      additions.push(PROJECT_PLAYBOOK_TAGS);
      playbooksInjected++;
    }
    if (!additions.length) {
      skipped++;
      continue;
    }

    const after = before.replace(/<\/head>/i, `${additions.join('\n')}\n</head>`);
    await writeFile(file, after, 'utf8');
  }

  console.log(`[build-www] shared-ui: skill map injected into ${skillMapInjected}; project playbooks into ${playbooksInjected}${skipped ? `; skipped ${skipped}` : ''}`);
}

async function main() {
  console.log(`[build-www] cleaning ${WWW}`);
  await rm(WWW, { recursive: true, force: true });
  await mkdir(WWW, { recursive: true });

  for (const a of assets) {
    const src = join(ROOT, a);
    if (!existsSync(src)) {
      console.warn(`[build-www] skip (missing): ${a}`);
      continue;
    }
    const dest = join(WWW, a);
    await copyEntry(src, dest);
    console.log(`[build-www] copied ${a}`);
  }

  await patchHowToCardRoute();
  await buildHowTo();
  await fingerprintStudyAssets();
  await optimizeGames();
  await deferGoogleFonts();
  await stampServiceWorker();
  await injectConsent();
  // Gamified App Skill Map / Project Playbooks widgets removed from the site,
  // they read as unfinished progress shells on a portfolio. The runtimes still
  // exist under assets/ but are no longer injected into any page.
  //
  // They are NOT dead code. marketing-mailers-html-architect.anchit-tandon.com
  // loads app-skill-map.js cross-origin from this domain, so whatever ships in
  // www/assets/ still opens links for real visitors of that app. That is why
  // the project hosts in those two files are held to the same link guard as
  // the pages (scripts/project-links.js).
  //
  // A patchSharedTaskTrackerRoute() lived here and rewrote the Task Tracker
  // entry to the first-party path '/task-tracker'. It was never called, and
  // calling it would have been a bug: '/task-tracker' resolves against
  // whichever origin loaded the script, so the one consumer left would have
  // sent visitors to a 404 on its own domain. The entry keeps its absolute
  // URL. Removed rather than left uncalled, so it cannot be "fixed" by
  // wiring it up.

  console.log(`[build-www] done → ${WWW}`);
}

main().catch(err => { console.error(err); process.exit(1); });
