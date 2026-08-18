#!/usr/bin/env node
// apply-cinematic.mjs — give every page the shared sequential-reveal motion.
//
// Injects assets/cinematic.css + assets/cinematic.js into each page between
// marker comments. Idempotent: re-running replaces the managed block rather
// than adding a second copy, so it is safe to run after adding a new page.
//
//   node scripts/apply-cinematic.mjs           # apply
//   node scripts/apply-cinematic.mjs --check   # report only, non-zero if stale
//
// index.html is skipped on purpose: it carries the full depth system inline,
// including its own reveal queue, and a second sequencer would fight it.

import { readFile, writeFile } from 'node:fs/promises';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CHECK = process.argv.includes('--check');

const START = '<!-- cinematic:start -->';
const END = '<!-- cinematic:end -->';

const BLOCK = `${START}
<link rel="stylesheet" href="/assets/cinematic.css">
<script defer src="/assets/cinematic.js"></script>
${END}`;

// Pages that own their motion end to end.
//
// hotel.html is excluded for a concrete reason, not a stylistic one: its
// sections are scroll tracks containing `position: sticky` stages. A transform
// on an ancestor makes that ancestor the containing block, which breaks sticky
// — and the reveal animates exactly that. Its scenes already arrive one at a
// time by construction, since each owns a full scroll track.
const SKIP = new Set(['index.html', 'hotel.html']);

// Byte ranges covered by <script> elements, so markup can be told apart from
// HTML that merely appears inside JavaScript.
function scriptRanges(html) {
  const ranges = [];
  const re = /<script\b[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const end = html.indexOf('</script>', m.index);
    ranges.push([m.index, end === -1 ? html.length : end + 9]);
  }
  return ranges;
}

function findHeadClose(html) {
  const ranges = scriptRanges(html);
  let from = 0;
  for (;;) {
    const at = html.indexOf('</head>', from);
    if (at === -1) return -1;
    const inScript = ranges.some(([a, b]) => at >= a && at < b);
    if (!inScript) return at;
    from = at + 7;
  }
}

const pages = readdirSync(ROOT)
  .filter((f) => f.endsWith('.html'))
  .filter((f) => !SKIP.has(f))
  .sort();

let changed = 0, already = 0, skipped = 0;

for (const file of pages) {
  const full = path.join(ROOT, file);
  let html = await readFile(full, 'utf8');

  // Strip any previous managed block first — that is what makes this idempotent.
  const managed = new RegExp(`${START}[\\s\\S]*?${END}\\n?`, 'g');
  const withoutBlock = html.replace(managed, '');

  // The real </head> is the first one that is NOT inside a <script>. Several
  // pages build an export document as a JS string containing a whole HTML
  // skeleton, so a naive lastIndexOf lands inside a quoted string literal and
  // injecting there produces an unterminated string — it broke jobhunt.html
  // exactly that way.
  const close = findHeadClose(withoutBlock);
  if (close === -1) {
    console.log(`  – ${file}: no markup </head>, skipped`);
    skipped++;
    continue;
  }

  const next = withoutBlock.slice(0, close) + BLOCK + '\n' + withoutBlock.slice(close);

  if (next === html) { already++; continue; }
  if (CHECK) {
    console.log(`  ! ${file}: would change`);
    changed++;
    continue;
  }
  await writeFile(full, next);
  console.log(`  ✓ ${file}`);
  changed++;
}

console.log(`\n${CHECK ? 'stale' : 'updated'}: ${changed} · already current: ${already} · skipped: ${skipped}`);
if (CHECK && changed) process.exit(1);
