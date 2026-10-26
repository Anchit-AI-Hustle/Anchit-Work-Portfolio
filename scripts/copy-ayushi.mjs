#!/usr/bin/env node
import { cp, mkdir, rename } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
