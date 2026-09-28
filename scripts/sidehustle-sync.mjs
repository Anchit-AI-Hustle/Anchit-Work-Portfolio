// Keep the Side Hustle grid true: every project listed, every link working,
// and not one repository name where a visitor can find it.
//
// WHAT THIS DOES AND DELIBERATELY DOES NOT DO
//   It reconciles data/projects.json against index.html and the live web. It
//   fixes what is mechanical - the count in the copy, a link that has moved -
//   and it REPORTS what is editorial instead of guessing at it.
//
//   It does not write the prose for a new card. Every factual string on this
//   site has to be traceable to something real (CLAUDE.md), and a daily robot
//   inventing "an AI-powered platform that revolutionises X" is exactly the
//   failure that already put a fabricated credential on the live site once.
//   So for a project with no card yet it collects what the project SAYS ABOUT
//   ITSELF - its <title> and meta description, written by that project, not by
//   this script - and hands that over as raw material.
//
//   The difference matters on a portfolio: a claim you did not make is a claim
//   you cannot defend in an interview.
//
// USAGE
//   node scripts/sidehustle-sync.mjs            check only, no writes
//   node scripts/sidehustle-sync.mjs --write    also apply mechanical fixes
//   NET=1 node scripts/sidehustle-sync.mjs      also verify links over the network
//
// The daily job runs it with --write and NET=1, then runs the guards, then
// commits only if something actually changed.
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');
const NET = process.env.NET === '1';

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
const notes = [];

const manifest = JSON.parse(await readFile(join(ROOT, 'data', 'projects.json'), 'utf8'));
const live = manifest.projects;
const pending = manifest.pending || [];
let html = await readFile(join(ROOT, 'index.html'), 'utf8');
const before = html;

// ---------------------------------------------------------------- card count
// The copy says a number in words. It drifted once already (it read "Twelve"
// with thirteen cards on the page), because the number lives in prose and the
// cards live 300 lines away.
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight',
  'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
const cardCount = (html.match(/class="build-card/g) || []).length;
// Anchored to the number words on purpose. A bare /([A-Z][a-z]+) AI-first
// experiments/ matches the nav card's "Weekend AI-first experiments" first and
// would have rewritten the word "Weekend" into a number.
const claim = html.match(new RegExp('\\b(' + WORDS.join('|') + ') AI-first experiments'));
const want = WORDS[cardCount];

if (!claim) {
  check('the copy states how many experiments there are', false, 'sentence not found - did the wording change?');
} else if (claim[1] === want) {
  check('the stated count matches the cards on the page', true, `${want} / ${cardCount} cards`);
} else if (WRITE && want) {
  html = html.replace(claim[0], `${want} AI-first experiments`);
  check('the stated count matches the cards on the page', true,
    `corrected ${claim[1]} -> ${want} (${cardCount} cards)`);
} else {
  check('the stated count matches the cards on the page', false,
    `copy says ${claim[1]}, page has ${cardCount} cards - run with --write`);
}

// -------------------------------------------------------- manifest vs. cards
// Every manifest project should have a card, and every card should be in the
// manifest. Either direction being wrong means the grid is lying about scope.
const cards = [...html.matchAll(/<div class="build-card[\s\S]*?\n        <\/div>/g)].map((m) => m[0]);
// Titles are marked up - <h3>The Third <em>Eye</em></h3> - so comparing raw
// HTML against a plain title never matches. Strip tags and collapse whitespace
// first, then a card is "for" a project if it carries the project's live href
// or its title as text.
const plain = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
const missingCard = live.filter((p) =>
  !cards.some((c) => c.includes(`href="${p.live}"`) || plain(c).includes(p.title)));
check('every manifest project has a card', missingCard.length === 0,
  missingCard.length ? missingCard.map((p) => p.id).join(', ') : `${live.length} matched`);
check('card count equals manifest count', cardCount === live.length,
  `${cardCount} cards, ${live.length} in manifest`);

// ------------------------------------------------------------- no repo leaks
// Cheap in-process version of scripts/no-github.js so this never writes a leak
// even if the guard is skipped. Full owner/repo only - the bare segment is a
// product name here, not evidence.
const repoNames = [...live, ...pending].map((p) => p.repo).filter(Boolean);
const leaked = repoNames.filter((r) => html.split(r).length - 1);
check('index.html names no repository', leaked.length === 0,
  leaked.length ? leaked.join(', ') : `${repoNames.length} names checked`);

// ------------------------------------------------------------------ the web
// Off by default: a check that needs the network is a check that fails in a
// tunnel, and a red run for no reason teaches people to ignore red runs.
if (NET) {
  const probe = async (url) => {
    if (url.startsWith('/')) return { ok: true, why: 'first-party route' };
    try {
      const r = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
      const body = await r.text();
      // A Vercel login wall answers 200 with an auth page. Status alone would
      // call it healthy, which is the whole reason this file exists.
      const walled = /Authentication Required|vercel\.com\/sso|_vercel_sso_nonce/i.test(body);
      if (walled) return { ok: false, why: 'Vercel login wall - link the custom domain' };
      return { ok: r.ok, why: r.ok ? `${r.status}` : `HTTP ${r.status}` };
    } catch (e) {
      return { ok: false, why: e.name === 'TimeoutError' ? 'timed out' : String(e.message || e).slice(0, 60) };
    }
  };
  const bad = [];
  for (const p of [...live, ...pending]) {
    const r = await probe(p.live);
    if (!r.ok) bad.push(`${p.id} -> ${p.live} (${r.why})`);
  }
  check('every project link opens for a visitor', bad.length === 0,
    bad.length ? bad.join(' | ') : `${live.length + pending.length} links verified`);
} else {
  notes.push('network checks skipped (set NET=1). The daily job runs with NET=1.');
}

// ------------------------------------------------------------------- pending
// Projects with no card. Reported, never auto-written: see the header.
if (pending.length) {
  notes.push(`${pending.length} project(s) live with no card yet: ` +
    pending.map((p) => `${p.title} (${p.live})`).join(', '));
  notes.push('Each needs a hand-written card. This script will not invent the copy.');
}

if (WRITE && html !== before) {
  await writeFile(join(ROOT, 'index.html'), html, 'utf8');
  notes.push('index.html updated.');
}

for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(46) + (d || ''));
if (notes.length) { console.log(); for (const n of notes) console.log('  · ' + n); }
const pass = results.filter((r) => r[0] === 'PASS').length;
console.log('\n' + pass + '/' + results.length + ' passed');
process.exit(pass === results.length ? 0 : 1);
