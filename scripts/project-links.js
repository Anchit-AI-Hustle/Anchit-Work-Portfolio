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

// Hosts that must never be LINKED, and the host to link instead.
//
// Two different defects, same fix:
//   walled     - Vercel login wall for anyone but the owner (see above).
//   redirects  - Reachable, but only via a 308 to somewhere else. It works
//                today and costs a hop; it stops working the moment that
//                .vercel.app alias is reassigned to another deployment, which
//                is exactly the kind of breakage nobody notices.
//
// Verified against Vercel on 2026-09-14. Every other project host linked from
// this repo - ai-tele-suite, th-life-engine, hey-yaara, music-gen-ai-blue,
// parwah-hq, the-passion-table, lifecycle-os - answered 200 anonymously with
// protection off or preview-only, so they are correct as linked.
const RELINK = {
  'the-third-eye-anchit.vercel.app': ['walled', 'the-third-eye.anchit-tandon.com'],
  'marketing-mailers-html-architect.vercel.app': ['walled', 'marketing-mailers-html-architect.anchit-tandon.com'],
  'personal-ai-assistant-anchit.vercel.app': ['redirects', 'personal-ai-os.anchit-tandon.com'],
};

const results = [];
const check = (name, ok, detail) => results.push([ok ? 'PASS' : 'FAIL', name, detail]);
// HTML ONLY WAS NOT ENOUGH. assets/app-skill-map.js carries its own registry of
// project URLs and opens them with window.open, and assets/project-playbooks.js
// keys off the same hosts. No page on this site injects them any more - but
// marketing-mailers-html-architect.anchit-tandon.com loads app-skill-map.js
// cross-origin from anchit-tandon.com, so its links reach real visitors. A
// grep limited to *.html reported 3/3 green while two walled hosts were still
// live in JavaScript.
const SCAN_DIRS = ['', 'assets', 'scripts'];
const pages = SCAN_DIRS.flatMap((d) => {
  const dir = path.join(ROOT, d);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => /\.(html|js|mjs)$/.test(f))
    .map((f) => path.join(d, f));
});

// 1. No visitor-facing page may link one of these hosts.
//
// Count the LINK form 'https://host', not the bare hostname. That is the whole
// difference between a link a visitor can click and a hostname used as a
// lookup key - project-playbooks.js keeps the old alias as a map key on
// purpose, so a link shared before the repoint still resolves to a playbook
// after the redirect, and that key is not a defect. It also means this file's
// own RELINK table does not match itself.
const offenders = [];
for (const f of pages) {
  const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const [host, [why]] of Object.entries(RELINK)) {
    // split, not a RegExp built from the host: escaping only dots left
    // backslashes and every other metacharacter unescaped, which CodeQL
    // flagged as incomplete string escaping. A plain substring count needs no
    // escaping at all and is what this actually wants.
    const n = src.split('https://' + host).length - 1;
    if (n) offenders.push(f + ' -> ' + host + ' (' + why + ') x' + n);
  }
}
check('no page links a walled or redirecting project host',
  offenders.length === 0,
  offenders.length ? offenders.join(' | ') : 'checked ' + pages.length + ' html/js files');

// 2. A card that says LIVE has to offer a way to open it.
//
//    The All-in-One LP Agent card carried the LIVE badge and a Case Study
//    button, and nothing else - so the one thing the badge promises, opening
//    the live thing, was the one thing the card could not do. Its case study
//    page had the same gap: a back link and no CTA. /hotel was built, served
//    and reachable the whole time; nobody had linked it.
//
//    Checking the MANIFEST would not have caught this - data/projects.json had
//    the right URL all along. The defect was in the rendered card, so the card
//    is what gets read.
const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cards = home.match(/<div class="build-card[\s\S]*?\n        <\/div>/g) || [];
const liveNoLink = [];
for (const c of cards) {
  const status = (c.match(/class="status">([^<]*)</) || [])[1] || '';
  if (!/live/i.test(status)) continue;                 // "Building" promises nothing yet
  const title = ((c.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || '?')
    .replace(/<[^>]+>/g, '').trim();
  const hrefs = [...c.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  // A '#view' link is in-site navigation to the write-up, not the product.
  if (!hrefs.some((h) => !h.startsWith('#'))) liveNoLink.push(title);
}
check('every card marked Live can actually be opened',
  liveNoLink.length === 0,
  liveNoLink.length ? liveNoLink.join(', ') + ' -> case study only'
                    : cards.length + ' cards, every Live one has a link');

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
