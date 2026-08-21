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

// The sitemap is the third place the site advertises a URL, and it is the one
// search engines act on. A listed URL that 404s is worse than an unlisted page.
//
// Redirects count as resolved: /how-to-2 is in the sitemap and is NOT built,
// because vercel.json redirects it to /how-to. Checking only `rewrites` reports
// that as broken — it returns 200 in production. Follow redirects first.
{
  const sm = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const paths = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/$/, '') || '/');
  const redirects = new Map((vercel.redirects || []).map((r) => [r.source, r.destination]));
  const rewrites = new Map((vercel.rewrites || []).map((r) => [r.source, r.destination]));

  const dead = paths.filter((p) => {
    let q = p;
    for (let i = 0; i < 3 && redirects.has(q); i++) q = redirects.get(q);   // follow, with a loop bound
    if (q === '/') return !fs.existsSync(path.join(WWW, 'index.html'));
    if (rewrites.has(q)) return !resolves(rewrites.get(q));
    return !resolves(q);
  });
  check('every sitemap URL resolves (following redirects)',
    dead.length === 0,
    dead.length ? dead.join(', ') : `${paths.length} URLs, all reachable`);
}

// The page this check was written for, by name — it has vanished twice.
// MUT looks for a name the build never produces, standing in for the file
// going missing from the manifest again.
const ayushiFile = MUT ? 'marketing-101-for-ayushi.GONE.html' : 'marketing-101-for-ayushi.html';
const ayushi = fs.existsSync(path.join(WWW, ayushiFile));
check('Ayushi❤️’s Growth Studio is in the build',
  ayushi,
  ayushi ? 'present' : 'MISSING — it is uncommitted again, or dropped from the manifest');

// ── Discoverability, both directions ──────────────────────────────────────
// The rule: marketing-101 is the course people are meant to find, and
// marketing-101-for-ayushi is reachable only by someone who already has the
// link. Right now that is true by accident — nothing stops a future card, nav
// item or sitemap entry from quietly exposing it. This makes it a rule.
{
  const HIDDEN = 'marketing-101-for-ayushi';
  const PUBLIC = 'marketing-101';

  const pages = fs.readdirSync(WWW).filter((f) => f.endsWith('.html'));
  const linkRe = new RegExp('(?:href|src)="[^"]*' + HIDDEN + '[^"]*"', 'g');
  const linkedFrom = pages.filter((p) => {
    if (p === HIDDEN + '.html') return false;              // its own og:url is not an entry point
    return linkRe.test(fs.readFileSync(path.join(WWW, p), 'utf8'));
  });
  if (MUT) linkedFrom.push('mutant.html');
  check('the private course is linked from no page',
    linkedFrom.length === 0,
    linkedFrom.length ? 'linked from: ' + linkedFrom.join(', ') : `checked ${pages.length} built pages`);

  const advertisers = ['sitemap.xml', 'llms.txt', 'robots.txt'].filter((f) => {
    const p = path.join(WWW, f);
    if (!fs.existsSync(p)) return false;
    // MUT publishes the path in the sitemap — the exact regression this forbids.
    const body = fs.readFileSync(p, 'utf8') + (MUT && f === 'sitemap.xml' ? `<loc>/${HIDDEN}</loc>` : '');
    return body.includes(HIDDEN);
  });
  check('the private course is named in no index file',
    advertisers.length === 0,
    advertisers.length ? 'named in: ' + advertisers.join(', ') : 'absent from sitemap, llms.txt and robots.txt');

  // robots.txt deserves a word: listing it under Disallow would PUBLISH the
  // path to anyone who reads robots.txt, which is the opposite of hidden.
  // Absence is the correct treatment, and the check above enforces it.

  // MUT strips the noindex meta before the check reads it.
  let html = fs.readFileSync(path.join(WWW, HIDDEN + '.html'), 'utf8');
  if (MUT) html = html.replace(/<meta name="robots"[^>]*>/i, '');
  const hasNoindex = /name="robots"[^>]*noindex/i.test(html);
  check('the private course still carries its noindex',
    hasNoindex,
    hasNoindex ? 'meta robots noindex present in the page' : 'NO noindex meta — it would be indexable');

  // The other half of the rule: the public one must stay findable.
  // MUT drops index.html from the search, standing in for the card being removed.
  const entryPoints = pages.filter((p) => (MUT && p === 'index.html') ? false :
    new RegExp('href="/' + PUBLIC + '"').test(fs.readFileSync(path.join(WWW, p), 'utf8')));
  check('the public course still has an entry point',
    entryPoints.length > 0,
    entryPoints.length ? 'linked from: ' + entryPoints.join(', ') : 'NOT linked from anywhere');
}

for (const [ok, n, d] of results) console.log(`  ${ok}  ${n.padEnd(52)} ${d}`);
const failed = results.filter((r) => r[0] === 'FAIL').length;
console.log(`\n${results.length - failed}/${results.length} passed`);
if (MUT) {
  // Named explicitly rather than counted, so adding a check cannot silently
  // change what the mutation is claimed to prove.
  const TOUCHED = /rewrite resolves|Growth Studio is in the build|linked from no page|named in no index file|carries its noindex|has an entry point/;
  const target = results.filter((r) => TOUCHED.test(r[1]));
  const wrong = target.filter((r) => r[0] === 'PASS').map((r) => r[1])
    .concat(results.filter((r) => !TOUCHED.test(r[1]) && r[0] === 'FAIL').map((r) => r[1] + ' (broke unexpectedly)'));
  if (!wrong.length) {
    console.log(`MUT: all ${target.length} checks it touches failed, and the other ${results.length - target.length} still pass`);
    process.exit(0);
  }
  console.log('MUT: wrong outcome — ' + wrong.join('; '));
  process.exit(1);
}
process.exit(failed ? 1 : 0);
