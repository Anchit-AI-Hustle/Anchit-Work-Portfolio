// Does every project link actually open for a visitor?
//
// THE BUG THIS CATCHES
//   Vercel's "Deployment Protection" can be set to all_except_custom_domains.
//   Every *.vercel.app URL for that project then shows a Vercel LOGIN WALL to
//   anyone who is not on the team — while it opens instantly for the owner,
//   who is signed in. So the link looks fine to the one person checking it.
//
//   Three projects were set that way and linked by their walled host:
//   the-third-eye (5 places, including a live-preview iframe),
//   marketing-mailers-html-architect (2), and music-gen-ai (5).
//
//   The first two had public custom domains already, so their links moved
//   there. music-gen-ai had NO custom domain, so no public URL existed at all;
//   its protection was changed to preview-only (2026-09-14, with the owner's
//   agreement), which is how parwah and the-passion-table are already set.
//
//   Re-check with: mcp Vercel get_project_deployment_protection, or
//   Vercel → project → Settings → Deployment Protection.
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// Hosts confirmed to sit behind all_except_custom_domains on 2026-09-14, with
// the public custom domain to use instead. null = no public URL exists yet.
const WALLED = {
  'the-third-eye-anchit.vercel.app': 'the-third-eye.anchit-tandon.com',
  'marketing-mailers-html-architect.vercel.app': 'marketing-mailers-html-architect.anchit-tandon.com',
};

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
const pages = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));

// 1. No visitor-facing page may link a host that shows a login wall.
const offenders = [];
for (const f of pages) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const host of Object.keys(WALLED)) {
    const n = (src.match(new RegExp(host.replace(/[.]/g, '\\.'), 'g')) || []).length;
    if (n) offenders.push(f + ' -> ' + host + ' x' + n);
  }
}
check('no page links a host behind a Vercel login wall',
  offenders.length === 0,
  offenders.length ? offenders.join(' | ') : 'checked ' + pages.length + ' pages');

// 2. Every build tile on the freelance page opens a real product.
const fl = fs.readFileSync(path.join(ROOT, 'freelancer.html'), 'utf8');
const tiles = [...fl.matchAll(/<article class="buildtile">([\s\S]*?)<\/article>/g)].map((m) => {
  const name = (m[1].match(/<h4>([^<]+)<\/h4>/) || [])[1] || '?';
  const href = (m[1].match(/<a[^>]*href="([^"]*)"/) || [])[1] || '';
  return { name, href };
});
check('every build tile has a link at all', tiles.length === 4 && tiles.every((t) => t.href),
  tiles.length + ' tiles');
const notLive = tiles.filter((t) => !/^https:\/\//.test(t.href));
check('every build tile opens the live product, not an email draft',
  notLive.length === 0,
  notLive.length ? notLive.map((t) => t.name + ' -> ' + t.href.slice(0, 34)).join(', ')
                 : tiles.map((t) => t.href.replace('https://', '').replace(/\/$/, '')).join(', '));

for (const [s, n, d] of results) console.log('  ' + s + '  ' + n.padEnd(56) + (d || ''));
const pass = results.filter((r) => r[0] === 'PASS').length;
console.log('\n' + pass + '/' + results.length + ' passed');
process.exit(pass === results.length ? 0 : 1);
