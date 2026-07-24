#!/usr/bin/env node
/**
 * Build step for Capacitor/Vercel: mirror static web assets into ./www and
 * compile the standalone How-To Engine into the canonical /how-to-2 route.
 */
import { copyFile, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WWW = join(ROOT, 'www');
const HOW_TO_ROUTE = 'how-to-2';
const HOW_TO_PATH = `/${HOW_TO_ROUTE}`;

const assets = [
  'index.html',
  'jobhunt.html',
  'd2c-lifecycle-os.html',
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
  'manifest.json',
  'sw.js',
  'robots.txt',
  'sitemap.xml',
  'llms.txt',
  'AnchitTandon-AppLogo.png',
  'icons',
  'assets',
  'audio',
  'cyber',
];

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
// side-husle/how-to-1, base '/how-to-2/') and mirror its dist into
// www/how-to-2 so it ships at /how-to-2 on the main static deployment.
// Wrapped so a failure here never takes down the rest of the portfolio.
async function buildHowTo() {
  const engine = join(ROOT, 'side-husle', 'how-to-1');
  if (!existsSync(join(engine, 'package.json'))) {
    console.warn('[build-www] skip how-to: engine not found');
    return;
  }
  try {
    if (!existsSync(join(engine, 'node_modules'))) {
      console.log('[build-www] how-to: installing deps…');
      execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: engine, stdio: 'inherit' });
    }
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

  console.log(`[build-www] done → ${WWW}`);
}

main().catch(err => { console.error(err); process.exit(1); });
