#!/usr/bin/env node
/**
 * Build step for Capacitor: mirror the static web assets into ./www
 * so that Capacitor (webDir: "www") can package them into the native apps.
 * Vercel continues to deploy from the repo root — this is only for native builds.
 */
import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const WWW = join(ROOT, 'www');

const assets = [
  'index.html',
  'manifest.json',
  'sw.js',
  'icons',
];

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
    const s = await stat(src);
    if (s.isDirectory()) {
      await cp(src, dest, { recursive: true });
    } else {
      await cp(src, dest);
    }
    console.log(`[build-www] copied ${a}`);
  }

  console.log(`[build-www] done → ${WWW}`);
}

main().catch(err => { console.error(err); process.exit(1); });
