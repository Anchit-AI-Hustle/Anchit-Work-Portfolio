#!/usr/bin/env node
/**
 * Build step for Capacitor: mirror the static web assets into ./www
 * so that Capacitor (webDir: "www") can package them into the native apps.
 * Vercel continues to deploy from the repo root — this is only for native builds.
 */
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WWW = join(ROOT, 'www');

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

// Build the How-To Engine (a standalone Vite + React app under
// side-husle/how-to-engine, base '/how-to/') and mirror its dist into
// www/how-to so the module ships at /how-to on the main static deploy.
// Wrapped so a failure here NEVER breaks the portfolio build — the app degrades
// to a "coming soon"-style 404 rather than taking the whole site down, and the
// SPA itself carries a client-side offline guide so it works without functions.
async function buildHowTo() {
  const engine = join(ROOT, 'side-husle', 'how-to-engine');
  if (!existsSync(join(engine, 'package.json'))) {
    console.warn('[build-www] skip how-to: engine not found');
    return;
  }
  try {
    if (!existsSync(join(engine, 'node_modules'))) {
      console.log('[build-www] how-to: installing deps…');
      execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: engine, stdio: 'inherit' });
    }
    console.log('[build-www] how-to: building…');
    execSync('npm run build', { cwd: engine, stdio: 'inherit' });
    const dist = join(engine, 'dist');
    if (!existsSync(dist)) throw new Error('dist not produced');
    await copyEntry(dist, join(WWW, 'how-to'));
    console.log('[build-www] how-to: mirrored dist → www/how-to');
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

  await buildHowTo();

  console.log(`[build-www] done → ${WWW}`);
}

main().catch(err => { console.error(err); process.exit(1); });
