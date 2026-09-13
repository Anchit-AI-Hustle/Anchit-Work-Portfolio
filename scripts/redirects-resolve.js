// Every link on every page has to land somewhere real.
//
// THE BUGS THIS CATCHES
//   1. The freelancer page's "Third Eye — View project" card pointed at
//      github.com/Anchit-AI-Hustle/The-Third-Eye. That repository is PRIVATE,
//      so the link rendered GitHub's 404 for every visitor while looking
//      perfectly fine to the logged-in author, who sees the repo. index.html
//      had always linked the same project to its live app; only this one card
//      pointed at the source.
//
//   2. index.html's sign-off linked /in/anchittandon. Every other LinkedIn
//      reference on the site — both visible links and the JSON-LD sameAs that
//      search engines read as the canonical profile — uses /in/anchit-tandon.
//      The comment above that block even claims "every link here already
//      exists elsewhere on the page". It did not.
//
//   Neither is a broken FILE, so scripts/routes-resolve.js cannot see either:
//   that check proves the routes the site advertises are built, this one proves
//   the links the pages actually render go somewhere.
//
// WHY A BROWSER
//   Links are read out of the rendered DOM, not the source, so anything a page
//   injects at runtime is checked too. And they are resolved against a server
//   that applies vercel.json — `npx serve www` knows nothing about redirects,
//   rewrites or cleanUrls, so resolving against it would prove nothing about
//   production.
//
// Run after a build:  node scripts/redirects-resolve.js
//   NET=1   also verifies off-site destinations over the network
//   MUT=... reintroduces one bug; the check that covers it must fail
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const MUT = process.env.MUT || '';
const NET = process.env.NET === '1';

const results = [];
const check = (n, ok, d) => results.push([ok ? 'PASS' : 'FAIL', n, d]);

if (!fs.existsSync(WWW)) {
  console.log('  FAIL  www/ does not exist — run `npm run build` first');
  process.exit(1);
}

// Projects this repo owns and links to. A link to the SOURCE of one of these is
// only safe if the repository is public; the live app always is. Bug 1 was a
// card pointing at a private source, so the rule is: link the live app.
const OWN_APPS = {
  'The-Third-Eye': 'https://the-third-eye-anchit.vercel.app/',
  'lifecycle-os': 'https://lifecycle-os.anchit-tandon.com/',
  'AI-TeleSuite': 'https://ai-tele-suite.vercel.app/',
};
// Repositories under the org that are private, and so must never be linked from
// a page. Kept explicit rather than probed, so the suite still runs offline.
const PRIVATE_REPOS = new Set([
  'The-Third-Eye', 'Shoutout', 'anchit-portfolio-cyberpunk', 'The-Passion-Table',
  'The-Passion-Table-Idea-1', 'markets-pro', 'parwah-hq', 'vahdam-superapp',
  'demo-repository', 'mirror-venture-os', 'Kolab', 'super-duper-waddle',
  'PetMind', 'vahdam-lifecycle-os',
]);

// One identity, one spelling. Bug 2 was a second spelling of the same profile.
const CANONICAL = {
  LinkedIn: /linkedin\.com\/in\/([A-Za-z0-9-]+)/g,
  'GitHub org': /github\.com\/(Anchit-AI-Hustle)\b/g,
  Email: /mailto:([^"'?\s]+)/g,
  Phone: /tel:(\+?[0-9]+)/g,
};

(async () => {
  const { chromium } = require('/opt/node22/lib/node_modules/playwright');
  const { listen } = await import(path.join(ROOT, 'scripts/vercel-emu.mjs'));
  const { server, port } = await listen();
  const BASE = `http://127.0.0.1:${port}`;

  const walk = (d, o = []) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      e.isDirectory() ? walk(p, o) : o.push(p);
    }
    return o;
  };
  const routes = walk(WWW)
    .filter((f) => f.endsWith('.html'))
    .map((f) => ('/' + path.relative(WWW, f).split(path.sep).join('/'))
      .replace(/\/index\.html$/, '').replace(/\.html$/, '') || '/')
    .sort();

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  // Nothing off-site is fetched while crawling: irrelevant to routing, and it
  // makes the suite depend on someone else's uptime.
  await ctx.route('**/*', (r) => (/^https?:\/\/(?!127\.0\.0\.1)/.test(r.request().url()) ? r.abort() : r.continue()));

  const seenStatus = new Map();
  const resolve = async (url) => {
    if (seenStatus.has(url)) return seenStatus.get(url);
    let out;
    try {
      const r = await fetch(url, { redirect: 'follow' });
      out = { code: r.status, final: r.url };
    } catch (e) { out = { code: 0, final: e.message }; }
    seenStatus.set(url, out);
    return out;
  };

  const dead = [];        // internal links that do not resolve
  const orphanFrag = [];  // fragments with nothing to scroll or switch to
  const deadNav = [];     // SPA nav that does not change the view
  const srcLinks = [];    // links to our own repositories
  const identity = {};    // spellings seen per identity
  let linkCount = 0, navCount = 0, fragCount = 0;

  for (const route of routes) {
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!resp || resp.status() !== 200) { dead.push(`${route} (page itself: ${resp && resp.status()})`); await page.close(); continue; }
      await page.waitForTimeout(800);
    } catch (e) { dead.push(`${route} (load failed: ${e.message.slice(0, 60)})`); await page.close(); continue; }

    const html = fs.readFileSync(path.join(WWW, route === '/' ? 'index.html'
      : (fs.existsSync(path.join(WWW, route.replace(/^\//, '') + '.html'))
        ? route.replace(/^\//, '') + '.html' : route.replace(/^\//, '') + '/index.html')), 'utf8');

    for (const [name, re] of Object.entries(CANONICAL)) {
      for (const m of html.matchAll(new RegExp(re.source, 'g'))) {
        (identity[name] ||= new Map()).set(m[1], (identity[name].get(m[1]) || new Set()).add(route));
      }
    }

    const links = await page.evaluate(() => [...document.querySelectorAll('a[href]')]
      .map((a) => ({ raw: a.getAttribute('href'), href: a.href, text: (a.textContent || '').trim().slice(0, 34) }))
      .filter((l) => l.raw));

    const done = new Set();
    for (const l of links) {
      if (done.has(l.raw)) continue;
      done.add(l.raw);
      if (/^(mailto:|tel:|sms:|javascript:|data:|blob:)/i.test(l.raw)) continue;

      const repo = l.href.match(/github\.com\/Anchit-AI-Hustle\/([A-Za-z0-9_.-]+)/);
      if (repo) srcLinks.push({ route, repo: repo[1], text: l.text });

      const u = new URL(l.href);
      if (u.origin !== BASE) {
        if (NET) {
          const r = await resolve(l.href);
          if (r.code >= 400 || r.code === 0) dead.push(`${route}  ${l.raw}  -> ${r.code}`);
        }
        continue;
      }
      linkCount++;
      const r = await resolve(u.origin + u.pathname + u.search);
      // 203 is the emulator saying an external rewrite fired; production proxies it.
      if (r.code !== 200 && r.code !== 203) dead.push(`${route}  ${l.raw}  -> HTTP ${r.code}${l.text ? `  ["${l.text}"]` : ''}`);
    }

    // A fragment must resolve to something this page can actually reach: a real
    // element, a chapter section (marketing-101's router prefixes ch-), or a
    // view name the SPA router accepts.
    const frags = [...new Set(links.map((l) => l.raw).filter((h) => h.startsWith('#') && h.length > 1).map((h) => h.slice(1)))];
    if (frags.length) {
      fragCount += frags.length;
      const bad = await page.evaluate((list) => {
        const views = new Set();
        const src = document.documentElement.innerHTML;
        const av = src.match(/ALL_VIEWS\s*=\s*\[([^\]]*)\]/);
        if (av) for (const m of av[1].matchAll(/'([^']+)'/g)) views.add(m[1]);
        for (const el of document.querySelectorAll('[data-view]')) views.add(el.getAttribute('data-view'));
        return list.filter((f) => {
          const head = f.split('/')[0];                       // #view/anchor
          const tail = f.split('/')[1];
          if (document.getElementById(f) || document.getElementsByName(f).length) return false;
          if (document.getElementById('ch-' + f)) return false;
          if (views.has(head) && (!tail || document.getElementById(tail))) return false;
          if (window.openScheduleModal && head === 'schedule') return false;
          return true;
        });
      }, frags);
      for (const f of bad) orphanFrag.push(`${route}  #${f}`);
    }

    // The SPA's real redirections: clicking a nav target must change the view.
    const navTargets = await page.evaluate(() => {
      const src = document.documentElement.innerHTML;
      const av = src.match(/ALL_VIEWS\s*=\s*\[([^\]]*)\]/);
      if (!av) return [];
      return [...new Set([...document.querySelectorAll('[data-view]')].map((e) => e.getAttribute('data-view')))];
    });
    for (const v of navTargets) {
      if (v === 'schedule') continue;                        // opens a modal, not a view
      navCount++;
      const ok = await page.evaluate((view) => {
        const el = document.querySelector(`[data-view="${view}"]`);
        if (!el) return false;
        el.click();
        const panel = document.getElementById('view-' + view);
        return !!(panel && panel.classList.contains('active'));
      }, v);
      if (!ok) deadNav.push(`${route}  data-view="${v}"`);
      await page.waitForTimeout(60);
    }
    await page.close();
  }

  if (MUT === 'dead_link') dead.push('mutant.html  /nope  -> HTTP 404');
  if (MUT === 'orphan_frag') orphanFrag.push('mutant.html  #nowhere');
  if (MUT === 'dead_nav') deadNav.push('mutant.html  data-view="nowhere"');

  check('every internal link on every page resolves',
    dead.length === 0,
    dead.length ? dead.slice(0, 4).join(' ; ') : `${linkCount} links across ${routes.length} pages`);

  check('every in-page fragment has a target',
    orphanFrag.length === 0,
    orphanFrag.length ? orphanFrag.slice(0, 4).join(' ; ') : `${fragCount} fragments, all reachable`);

  check('every nav target switches the view',
    deadNav.length === 0,
    deadNav.length ? deadNav.slice(0, 4).join(' ; ') : `${navCount} nav targets, all switch`);

  // Bug 1, as a rule: a page may link one of our repos only if it is public.
  {
    const bad = srcLinks.filter((l) => PRIVATE_REPOS.has(l.repo))
      .map((l) => `${l.route} -> ${l.repo}${OWN_APPS[l.repo] ? ` (link ${OWN_APPS[l.repo]} instead)` : ''}`);
    if (MUT === 'private_repo') bad.push('mutant.html -> The-Third-Eye');
    check('no page links a private repository',
      bad.length === 0,
      bad.length ? bad.join(' ; ') : `${srcLinks.length} source links, all public`);
  }

  // Bug 2, as a rule: one identity, one spelling, site-wide.
  {
    const bad = [];
    for (const [name, spellings] of Object.entries(identity)) {
      if (MUT === 'two_handles' && name === 'LinkedIn') spellings.set('anchittandon', new Set(['mutant.html']));
      if (spellings.size > 1) {
        bad.push(`${name}: ${[...spellings.entries()].map(([v, pages]) => `${v} (${[...pages][0]}${pages.size > 1 ? ` +${pages.size - 1}` : ''})`).join(' vs ')}`);
      }
    }
    check('each identity link has one spelling site-wide',
      bad.length === 0,
      bad.length ? bad.join(' ; ') : Object.entries(identity).map(([n, s]) => `${n}=${[...s.keys()][0]}`).join(', '));
  }

  await browser.close();
  server.close();

  for (const [ok, n, d] of results) console.log(`  ${ok}  ${n.padEnd(46)} ${d}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed${NET ? ' (off-site destinations verified)' : ' (off-site not checked — rerun with NET=1)'}`);

  if (MUT) {
    const TOUCHED = {
      dead_link: /internal link/, orphan_frag: /fragment/, dead_nav: /nav target/,
      private_repo: /private repository/, two_handles: /one spelling/,
    }[MUT];
    if (!TOUCHED) { console.log(`MUT: unknown mutation "${MUT}"`); process.exit(1); }
    const target = results.filter((r) => TOUCHED.test(r[1]));
    const wrong = target.filter((r) => r[0] === 'PASS').map((r) => r[1])
      .concat(results.filter((r) => !TOUCHED.test(r[1]) && r[0] === 'FAIL').map((r) => r[1] + ' (broke unexpectedly)'));
    if (!wrong.length) {
      console.log(`MUT=${MUT}: the check it touches failed, and the other ${results.length - target.length} still pass`);
      process.exit(0);
    }
    console.log('MUT: wrong outcome — ' + wrong.join('; '));
    process.exit(1);
  }
  process.exit(failed ? 1 : 0);
})();
