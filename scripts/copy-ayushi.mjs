#!/usr/bin/env node
import { cp, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(ROOT, 'ayushi');
const destination = join(ROOT, 'www', 'ayushi');

await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true, force: true });
console.log('[copy-ayushi] copied ayushi → www/ayushi');
