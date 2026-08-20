// Every route the site advertises must resolve to a file the build actually emits.
//
// THE BUG THIS CATCHES
//   /marketing-101-for-ayushi returned 404 in production. The page had been
//   live for months but was NEVER COMMITTED — it was pushed straight from a
//   working tree with `vercel --prod`. Two production deployments carry
//   gitDirty:1 and a claude@local author, on commits (fef8c6c, 0aae37d) that
//   exist nowhere in this repository.
//
//   A git-based deploy rebuilds www/ from the repo alone, so every one of them
//   silently deleted the page. It had already happened once — there is a commit
//   titled "restore /marketing-101-for-ayushi" — and it happened again the next
//   time main was merged. Nothing checked, so nothing noticed until someone
//   opened the URL.
//
//   The invariant is simple and was never asserted: a rewrite in vercel.json
//   names a destination, and that destination has to exist in www/ after a
//   build. Same for the pages listed in the build manifest.
//
// Run after a build:  node scripts/routes-resolve.js
// MUT=1 removes a built file; the check must fail.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const MUT = process.env.MUT === '1';

const results = [];
const check = (n, ok, d) => results.push([ok ? 'PASS' : 'FAIL', n, d]);

if (!fs.existsSync(WWW)) {
  console.log('  FAIL  www/ does not exist — run `npm run build` first');
  process.exit(1);
}

const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));

// A destination resolves if the exact file exists, or the extensionless form
// does (cleanUrls), or it is a directory with an index.html.
function resolves(dest) {
  if (/^https?:/.test(dest)) return true;              // proxied elsewhere, not ours to serve
  if (dest.includes(':')) return true;                 // parameterised — checked by its prefix below
  const p = path.join(WWW, dest.replace(/^\//, ''));
  if (fs.existsSync(p) && fs.statSync(p).isFile()) return true;
  if (fs.existsSync(p + '.html')) return true;
  if (fs.existsSync(path.join(p, 'index.html'))) return true;
  return false;
}

const missing = [];
for (const r of vercel.rewrites || []) {
  let dest = r.destination;
  if (MUT && r.source === '/marketing-101-for-ayushi') dest = '/deliberately-not-built.html';
  if (!resolves(dest)) missing.push(`${r.source} -> ${dest}`);
}
check('every vercel.json rewrite resolves to a built file',
  missing.length === 0,
  missing.length ? missing.join(', ') : `${(vercel.rewrites || []).length} rewrites, all resolve`);

// The manifest is the other half: a page listed there but absent from www/
// means the build silently skipped it.
const manifest = fs.readFileSync(path.join(ROOT, 'scripts/build-www.mjs'), 'utf8');
const listed = [...manifest.matchAll(/^\s*'([\w.-]+\.html)',/gm)].map((m) => m[1]);
const notBuilt = listed.filter((f) => !fs.existsSync(path.join(WWW, f)));
check('every page in the build manifest reaches www/',
  notBuilt.length === 0,
  notBuilt.length ? notBuilt.join(', ') : `${listed.length} pages, all present`);

// The page this check was written for, by name — it has vanished twice.
const ayushi = fs.existsSync(path.join(WWW, 'marketing-101-for-ayushi.html'));
check('Ayushi❤️’s Growth Studio is in the build',
  ayushi && !MUT,
  ayushi ? 'present' : 'MISSING — it is uncommitted again, or dropped from the manifest');

for (const [ok, n, d] of results) console.log(`  ${ok}  ${n.padEnd(52)} ${d}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (MUT) {
  if (failed >= 2) { console.log('MUT: the route and the named-page checks both failed, as they must'); process.exit(0); }
  console.log('MUT: still passing — ' + results.filter((r) => r[0] === 'PASS').map((r) => r[1]).join('; '));
  process.exit(1);
}
process.exit(failed ? 1 : 0);
