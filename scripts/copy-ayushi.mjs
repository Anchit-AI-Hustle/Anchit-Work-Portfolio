#!/usr/bin/env node
import { cp, mkdir, rename, readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deferGoogleFontsIn } from './defer-fonts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(ROOT, 'ayushi-rawat');
const destination = join(ROOT, 'www', 'ayushi-rawat');

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
console.log('[copy-ayushi] copied ayushi-rawat → www/ayushi-rawat');

// The job agent lives at /ayushi-rawat-auto-job-applier, a top-level URL. It is
// published as a file at that path so cleanUrls serves it directly: a rewrite
// to ayushi-rawat/auto-job-applier.html is a 404 on Vercel (see the cleanUrls
// check in scripts/routes-resolve.js). The old in-folder path redirects here.
await rename(join(destination, 'auto-job-applier.html'), join(ROOT, 'www', 'ayushi-rawat-auto-job-applier.html'));
console.log('[copy-ayushi] job agent → www/ayushi-rawat-auto-job-applier.html');

// These pages are copied after build-www.mjs has run, so they get the same
// non-blocking Google Fonts treatment here (see scripts/defer-fonts.mjs).
let deferred = 0;
const pages = [join(ROOT, 'www', 'ayushi-rawat-auto-job-applier.html')];
const walk = async (dir) => {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.isDirectory()) await walk(join(dir, e.name));
    else if (e.name.endsWith('.html')) pages.push(join(dir, e.name));
  }
};
await walk(destination);
for (const file of pages) {
  const before = await readFile(file, 'utf8');
  const after = deferGoogleFontsIn(before, file.slice(join(ROOT, 'www').length + 1));
  if (after !== before) { await writeFile(file, after); deferred++; }
}
console.log(`[copy-ayushi] fonts no longer block first paint on ${deferred} page(s)`);
