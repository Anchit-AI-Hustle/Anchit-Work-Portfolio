#!/usr/bin/env node
/**
 * build-tailwind, compile a real stylesheet for the brand pages.
 *
 * WHY THIS EXISTS
 *   gram-street-coffee and deli-chic loaded Tailwind from cdn.tailwindcss.com.
 *   That ships a ~300KB JIT compiler to every visitor, scans the DOM at runtime,
 *   and paints the page unstyled until it finishes, and if the CDN is slow or
 *   blocked, the page has no layout at all. Deli Chic in particular collapses to
 *   unstyled HTML without it, because its layout is entirely utility classes.
 *   Tailwind's own console warning says not to use it in production.
 *
 *   The CLI produces the same utilities from the same classes, including
 *   arbitrary values like bg-[#4A0E17], plus preflight, which is what makes a
 *   <button> inherit the page font instead of falling back to Arial.
 *
 * The scanner reads raw file text, so classes written inside JS template
 * strings in the page (the product grid builds its markup that way) are found
 * exactly like classes in markup.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir, readFile, unlink } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const PAGES = [
  { src: 'gram-street-coffee/index.html', out: 'assets/tw-gram-street.css' },
  { src: 'deli-chic/index.html',          out: 'assets/tw-deli-chic.css' },
  // The Lifecycle OS calendar ran the CDN compiler too: 1.9s to first paint and
  // a second of main-thread work on a throttled phone, behind a page-specific
  // CSP that allowed 'unsafe-eval' for it. This config is the one its inline
  // `tailwind.config` script gave the CDN, so the stylesheet is the same.
  { src: 'lifecycle-os-calendar.html',    out: 'assets/tw-lifecycle-calendar.css', config: {
    colors: {
      bg:   { DEFAULT: 'rgb(var(--bg-rgb)/<alpha-value>)', soft: 'rgb(var(--surface-rgb)/<alpha-value>)', card: 'rgb(var(--card-rgb)/<alpha-value>)' },
      ink:  { DEFAULT: 'rgb(var(--ink-rgb)/<alpha-value>)', dim: 'rgb(var(--ink-dim-rgb)/<alpha-value>)', mute: 'rgb(var(--ink-mute-rgb)/<alpha-value>)' },
      green: { DEFAULT: 'rgb(var(--primary-rgb)/<alpha-value>)', bright: 'rgb(var(--accent-rgb)/<alpha-value>)' },
      gold: { DEFAULT: 'rgb(var(--gold-rgb)/<alpha-value>)' }, cream: 'rgb(var(--cream-rgb)/<alpha-value>)',
    },
    fontFamily: { sans: ['Inter', 'sans-serif'], mono: ['"JetBrains Mono"', 'monospace'], serif: ['Fraunces', 'Georgia', 'serif'] },
  } },
];

const ENTRY = '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';

/*
 * PINNED TO TAILWIND 3 ON PURPOSE. Do not let a dependabot bump take this to 4
 * without migrating first. Two things break at the major boundary:
 *
 *   1. The CLI moved out of `tailwindcss` into `@tailwindcss/cli`, so
 *      `npx tailwindcss` has no binary and npm answers "could not determine
 *      executable to run", which says nothing about Tailwind at all.
 *   2. ENTRY above is v3 syntax. v4 wants `@import "tailwindcss"` and its
 *      config in CSS rather than a JS file.
 *
 * On 2026-10-20 PR #197 bumped 3.4.19 to 4.3.3 and every production deploy
 * after it failed, including two that carried unrelated work. The check below
 * turns that into a sentence someone can act on.
 */
async function assertCliPresent() {
  const bin = join(ROOT, 'node_modules', '.bin', 'tailwindcss');
  if (existsSync(bin)) return;
  const installed = (() => {
    try { return JSON.parse(readFileSync(join(ROOT, 'node_modules/tailwindcss/package.json'), 'utf8')).version; }
    catch { return 'not installed'; }
  })();
  throw new Error(
    'the Tailwind CLI is missing (tailwindcss ' + installed + ' is installed).\n' +
    '  Tailwind 4 moved the CLI to @tailwindcss/cli and changed the entry syntax,\n' +
    '  so this build needs tailwindcss 3.x until it is migrated. Pin it back in\n' +
    '  package.json, or do the v4 migration deliberately.'
  );
}

async function main() {
  await assertCliPresent();
  await mkdir(join(ROOT, 'assets'), { recursive: true });
  const entry = join(ROOT, '.tw-entry.css');
  await writeFile(entry, ENTRY, 'utf8');
  try {
    for (const page of PAGES) {
      const out = join(ROOT, page.out);
      // A page with its own theme gets its own config; the others keep using
      // the root tailwind.config.js, exactly as before.
      const cfgFile = page.config ? join(ROOT, '.tw-config.cjs') : null;
      if (cfgFile) await writeFile(cfgFile, 'module.exports = ' + JSON.stringify({ content: [join(ROOT, page.src)], theme: { extend: page.config } }) + ';\n', 'utf8');
      try {
        await run('npx', ['tailwindcss', '-i', entry, '-o', out, ...(cfgFile ? ['-c', cfgFile] : []),
                          '--content', join(ROOT, page.src), '--minify'], { cwd: ROOT });
      } finally {
        if (cfgFile) await unlink(cfgFile).catch(() => {});
      }
      const css = await readFile(out, 'utf8');
      console.log(`[tailwind] ${page.src} → ${page.out} (${(css.length / 1024).toFixed(1)}KB)`);
    }
  } finally {
    await unlink(entry).catch(() => {});
  }
}

main().catch((err) => { console.error('[tailwind] failed:', err.message); process.exit(1); });
