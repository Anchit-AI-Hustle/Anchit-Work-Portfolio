#!/usr/bin/env node
/**
 * build-tailwind — compile a real stylesheet for the brand pages.
 *
 * WHY THIS EXISTS
 *   gram-street-coffee and deli-chic loaded Tailwind from cdn.tailwindcss.com.
 *   That ships a ~300KB JIT compiler to every visitor, scans the DOM at runtime,
 *   and paints the page unstyled until it finishes — and if the CDN is slow or
 *   blocked, the page has no layout at all. Deli Chic in particular collapses to
 *   unstyled HTML without it, because its layout is entirely utility classes.
 *   Tailwind's own console warning says not to use it in production.
 *
 *   The CLI produces the same utilities from the same classes, including
 *   arbitrary values like bg-[#4A0E17], plus preflight — which is what makes a
 *   <button> inherit the page font instead of falling back to Arial.
 *
 * The scanner reads raw file text, so classes written inside JS template
 * strings in the page (the product grid builds its markup that way) are found
 * exactly like classes in markup.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PAGES = [
  { src: 'gram-street-coffee/index.html', out: 'assets/tw-gram-street.css' },
  { src: 'deli-chic/index.html',          out: 'assets/tw-deli-chic.css' },
];

const ENTRY = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';

async function main() {
  await mkdir(join(ROOT, 'assets'), { recursive: true });
  const entry = join(ROOT, '.tw-entry.css');
  await writeFile(entry, ENTRY, 'utf8');
  try {
    for (const page of PAGES) {
      const out = join(ROOT, page.out);
      await run('npx', ['tailwindcss', '-i', entry, '-o', out,
                        '--content', join(ROOT, page.src), '--minify'], { cwd: ROOT });
      const css = await readFile(out, 'utf8');
      console.log(`[tailwind] ${page.src} → ${page.out} (${(css.length / 1024).toFixed(1)}KB)`);
    }
  } finally {
    await unlink(entry).catch(() => {});
  }
}

main().catch((err) => { console.error('[tailwind] failed:', err.message); process.exit(1); });
