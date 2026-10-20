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
//
// A NOTE ON WHAT THIS FILE CANNOT CATCH
// It checks that a link OPENS. It cannot check that a link opens the RIGHT
// THING. The All-in-One LP Agent card pointed at /hotel for two weeks - a
// cinematic scroll piece for a hotel, carrying none of the narration, voice,
// chat or recommendations the card describes - and every check here passed,
// because /hotel served a 200 to anybody. The card-to-manifest agreement check
// in scripts/sidehustle-sync.mjs covers the drift half of this; the other half,
// "is this URL actually this product", is a human judgement and both files
// being wrong together will always look correct to a machine.
const RELINK = {
  'the-third-eye-anchit.vercel.app': ['walled', 'the-third-eye.anchit-tandon.com'],
  'marketing-mailers-html-architect.vercel.app': ['walled', 'marketing-mailers-html-architect.anchit-tandon.com'],
  'personal-ai-assistant-anchit.vercel.app': ['redirects', 'personal-ai-os.anchit-tandon.com'],
  // Added 2026-09-28, when the All-in-One LP Agent card was finally pointed at
  // the page it describes. get_project reports ssoProtection enabled with
  // deploymentType all_except_custom_domains, so every *.vercel.app alias for
  // this project shows the login wall and only the custom domain opens for a
  // visitor. The card uses the custom domain; this stops the walled form being
  // used by mistake later, which is the failure this whole table exists for.
  'vahdam-lifecycle-os.vercel.app': ['walled', 'vahdam-lifecycle-os.anchit-tandon.com'],
  // Added 2026-10-20. These three were the last projects linked by their
  // *.vercel.app address. Each custom subdomain was checked before the switch
  // and serves byte-identical HTML to the old host, so the links moved there;
  // a .vercel.app link is one alias reassignment away from pointing elsewhere.
  'ai-tele-suite.vercel.app': ['vercel-host', 'ai-tele-suite.anchit-tandon.com'],
  'th-life-engine.vercel.app': ['vercel-host', 'th-life-engine.anchit-tandon.com'],
  'music-gen-ai-blue.vercel.app': ['vercel-host', 'music-gen-ai.anchit-tandon.com'],
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
// Reads TEXT out of markup without a sanitising regex. CodeQL flags
// /<[^>]+>/ as incomplete sanitization and is right: an unterminated "<script"
// survives it. This is a tokenizer, not a sanitizer - it walks segments after
// each '>' - and its output is compared, never inserted into a page.
const textOf = (html) => String(html)
  .split('<')
  .map((seg, i) => (i === 0 ? seg : seg.slice(seg.indexOf('>') + 1)))
  .join('');

const home = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const cards = home.match(/<div class="build-card[\s\S]*?\n        <\/div>/g) || [];
const liveNoLink = [];
for (const c of cards) {
  const status = (c.match(/class="status"[^>]*>([^<]*)</) || [])[1] || '';
  // Live and Demo both promise something a visitor can open; Private tool
  // still links its sign-in, but does not promise to let a stranger in.
  if (!/^(live|demo)$/i.test(status)) continue;
  const title = textOf((c.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || '?').trim();
  const hrefs = [...c.matchAll(/<a[^>]*href="([^"]+)"/g)].map((m) => m[1]);
  // A '#view' link is in-site navigation to the write-up, not the product.
  if (!hrefs.some((h) => !h.startsWith('#'))) liveNoLink.push(title);
}
check('every card marked Live or Demo can actually be opened',
  liveNoLink.length === 0,
  liveNoLink.length ? liveNoLink.join(', ') + ' -> case study only'
                    : cards.length + ' cards, every Live one has a link');

// 3. Every card carries exactly one honest tag, and it agrees with the manifest.
//
//    A portfolio review found all fifteen cards marked LIVE, including ones that
//    open on a PIN screen and ones that only run on sample data. The tags are
//    now Live (a public product anyone can use now), Demo (sample data or a demo
//    route) and Private tool (sign-in or internal), decided from each project's
//    actual link. This holds the vocabulary and stops the card and
//    data/projects.json from drifting apart again.
{
  const TAGS = { live: 'Live', demo: 'Demo', private: 'Private tool' };
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/projects.json'), 'utf8')).projects;
  const bad = [];
  cards.forEach((c, i) => {
    const title = textOf((c.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || '?').trim();
    const tags = [...c.matchAll(/<span class="status" data-tag="(\w+)">([^<]*)<\/span>/g)];
    const all = (c.match(/class="status/g) || []).length;
    if (tags.length !== 1 || all !== 1) { bad.push(title + ': ' + all + ' status chips'); return; }
    const [, key, label] = tags[0];
    if (TAGS[key] !== label) { bad.push(title + ': data-tag="' + key + '" reads "' + label + '"'); return; }
    if (/^live$/i.test(label) && /Open the demo|sign-in\)/.test(c)) bad.push(title + ': Live card labels its link as a demo or sign-in');
    if (!/^live$/i.test(label) && />Open live/i.test(c)) bad.push(title + ': ' + label + ' card says "Open live"');
    const m = manifest[i];
    if (m && m.status !== label) bad.push(title + ': card "' + label + '" vs manifest ' + m.id + ' "' + m.status + '"');
  });
  check('every card has one honest tag matching the manifest',
    bad.length === 0 && cards.length === manifest.length,
    bad.length ? bad.join(' | ') : cards.length + ' cards: ' + Object.values(TAGS).map((t) =>
      cards.filter((c) => c.includes('>' + t + '</span>')).length + ' ' + t).join(', '));
  const legendLine = (home.match(/<p class="tag-legend">[\s\S]*?<\/p>/) || [''])[0];
  const legend = Object.entries(TAGS).every(([k, t]) => legendLine.includes('data-tag="' + k + '">' + t + '</span>'));
  check('the projects view explains the three tags', legend, legend ? 'legend present' : 'tag-legend line missing');
}

// 4. Every build tile on the freelance page opens a real product.
const fl = fs.readFileSync(path.join(ROOT, 'freelancer.html'), 'utf8');
const tiles = [...fl.matchAll(/<article class="buildtile">([\s\S]*?)<\/article>/g)].map((m) => {
  const name = (m[1].match(/<h4>([^<]+)<\/h4>/) || [])[1] || '?';
  const href = (m[1].match(/<a[^>]*href="([^"]*)"/) || [])[1] || '';
  return { name, href };
});
check('every build tile carries one honest tag',
  [...fl.matchAll(/<article class="buildtile">([\s\S]*?)<\/article>/g)].every((m) =>
    (m[1].match(/<span class="tiletag" data-tag="(live|demo|private)">(Live|Demo|Private tool)<\/span>/g) || []).length === 1),
  'freelancer.html');
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
