// Nothing a visitor can load may mention GitHub or name a repository.
//
// WHY A SECOND GUARD
//   scripts/redirects-resolve.js already enforces this, but only over the pages
//   it crawls in a browser, and only when a browser is available. This one is a
//   static sweep of every byte in www/ - html, js, css, json, txt - and it runs
//   in a second with no browser. The daily sync writes to this site
//   unattended, so the rule needs a check that cannot be skipped for being slow.
//
// WHAT COUNTS AS A LEAK
//   1. A github.com link. A private repo 404s for the visitor, a public one
//      shows source nobody asked to read, and either way they have left.
//   2. The WORD. "Explore the implementation on GitHub" was a link whose own
//      label gave it away, with no href to catch.
//   3. An owner/repo string. Copy saying "in the lifecycle-os repository" names
//      one without ever saying GitHub, so the repo names in data/projects.json
//      are checked against the built output directly.
//
// data/projects.json is the reason 3 exists: it holds repo names on purpose, so
// the sync can tell which repos already have a card. It is not in the `assets`
// array in scripts/build-www.mjs and so is never copied into www/. This proves
// that, rather than trusting it.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);

if (!fs.existsSync(WWW)) {
  console.error('www/ missing - run `npm run build` first.');
  process.exit(1);
}

const TEXT = /\.(html|js|mjs|css|json|txt|xml|webmanifest)$/;
const files = [];
(function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { walk(full); continue; }
    if (TEXT.test(e.name)) files.push(full);
  }
})(WWW);

const rel = (f) => path.relative(WWW, f);
const read = (f) => fs.readFileSync(f, 'utf8');

// MUT=host / MUT=word / MUT=repo plant the exact defect each check exists for,
// so a green run proves the check can still fail. A guard nobody has ever seen
// fail is a guard nobody has tested.
const MUT = process.env.MUT || '';
const mutate = (src, f) => {
  if (!rel(f).endsWith('index.html')) return src;
  if (MUT === 'host') return src.replace('</body>', '<a href="https://github.com/x/y">src</a></body>');
  if (MUT === 'word') return src.replace('</body>', '<p>Explore the implementation on GitHub</p></body>');
  if (MUT === 'repo') return src.replace('</body>', '<p>built at Anchit-AI-Hustle/lifecycle-os</p></body>');
  return src;
};

// Third-party bundles are exempt from 1 and 2, and only from those. Both
// supabase.min.js and the compiled three.js chunk carry github.com inside
// vendor source strings. Neither is copy and neither is a link a visitor can
// click: rewriting someone else's minified bundle to satisfy a copy rule would
// be vandalism with no reader-facing effect. They are NOT exempt from 3 - a
// repo name appearing inside a bundle would be this site leaking, not theirs.
const VENDOR = /(^|\/)(assets\/vendor|how-to\/assets)\//;
const firstParty = files.filter((f) => !VENDOR.test(rel(f).replace(/\\/g, '/')));

// 1. No github.com anywhere a visitor can click.
const hostHits = [];
for (const f of firstParty) {
  const src = mutate(read(f), f);
  const n = src.split('github.com').length - 1;
  if (n) hostHits.push(rel(f) + ' x' + n);
}
check('no built file links github.com', hostHits.length === 0,
  hostHits.length ? hostHits.join(', ') : firstParty.length + ' first-party files swept');

// 2. Not the word either, in any casing, in rendered text or a label.
// The chatbot's KB entries carry a `keywords: [...]` array used only to SCORE
// an incoming question. 'github' sits in one of them so that asking "is this on
// github?" matches the side-projects answer. Those strings are matched against,
// never rendered - only an entry's `response` reaches the page - so they are
// vocabulary, not copy. Stripped before the word check; a leak inside a
// `response` is still caught, which is the case that matters.
const stripKeywords = (src) => src.replace(/keywords:\s*\[[^\]]*\]/g, 'keywords:[]');
const wordHits = [];
for (const f of firstParty) {
  const src = stripKeywords(mutate(read(f), f));
  const m = src.match(/github|repositor(y|ies)/gi);
  if (m) wordHits.push(rel(f) + ' -> ' + [...new Set(m.map((x) => x.toLowerCase()))].join('/') + ' x' + m.length);
}
check('no built file says "github" or "repository"', wordHits.length === 0,
  wordHits.length ? wordHits.join(' | ') : 'swept for the word, not just the link');

// 3. No repo NAME from the manifest, which is how one leaks without saying
//    "github" at all. Matched as a plain substring - no RegExp built from the
//    name, because escaping user-supplied strings into a pattern is the exact
//    thing CodeQL flagged on scripts/project-links.js.
const manifest = JSON.parse(read(path.join(ROOT, 'data', 'projects.json')));
const repos = [...manifest.projects, ...manifest.pending]
  .map((p) => p.repo).filter(Boolean);
// Only the full owner/repo form. The bare segment is not evidence of anything:
// 'lifecycle-os' is a product name, a route (/lifecycle-os) and the title of
// eighteen pages on this site; 'hey-yaara' and 'parwah-hq' are live hostnames a
// visitor is MEANT to open. Flagging those made the guard fail on correct
// pages, which is worse than not running - a check that cries wolf gets
// switched off. 'owner/repo' has no innocent reading.
const names = [...new Set(repos)];
const nameHits = [];
for (const f of files) {
  const src = mutate(read(f), f);
  for (const n of names) {
    if (src.split(n).length - 1) nameHits.push(rel(f) + ' -> ' + n);
  }
}
check('no built file names a repository from the manifest', nameHits.length === 0,
  nameHits.length ? [...new Set(nameHits)].join(' | ') : names.length + ' names checked');

// 4. The manifest itself must stay out of www/. It is where the repo names
//    legitimately live, so shipping it would leak every one of them at once.
const shipped = files.filter((f) => rel(f).replace(/\\/g, '/').startsWith('data/'));
check('the manifest never ships to www/', shipped.length === 0,
  shipped.length ? 'LEAKED: ' + shipped.map(rel).join(', ') : 'data/ is not in the build assets');

for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(52) + (d || ''));
const pass = results.filter((r) => r[0] === 'PASS').length;
console.log('\n' + pass + '/' + results.length + ' passed' + (MUT ? '  [MUT=' + MUT + ']' : ''));
process.exit(pass === results.length ? 0 : 1);
