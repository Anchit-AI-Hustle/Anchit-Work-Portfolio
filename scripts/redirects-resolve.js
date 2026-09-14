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
//      That is now the narrow case of a blanket rule: no page sends a visitor
//      to GitHub at all, and no page names a repository. A private repo 404s,
//      a public one shows source nobody asked to read, and either way the
//      viewer has left the portfolio. The suite enforces both halves — the
//      links, and the word itself in rendered copy, since "Explore the
//      implementation on GitHub" was a link whose own LABEL gave it away.
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
// WHY TWO PASSES
//   A fragment can point at another page: /#projects, /ayushi#experience and
//   ./#skills are all used here, and ./#skills is a link from ayushi/resume to
//   an id that lives in ayushi/index. Checking a fragment only against the page
//   that CONTAINS the link silently passes every one of them — a typo in
//   /#projets would resolve as a 200 and never be looked at. So the crawl
//   records what each page can reach, and fragments are validated afterwards,
//   against the page they actually land on.
//
// Run after a build:  node scripts/redirects-resolve.js
//   NET=1   also verifies off-site destinations over the network
//   MUT=... injects one real defect into a served page; the check that covers
//           it must fail. The mutation goes into the DOM BEFORE links are
//           collected, so each mode drives the same discovery and validation
//           path a real regression would — a mutation appended to the results
//           afterwards would still pass with the detector deleted.
const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const WWW = path.join(ROOT, 'www');
const MUT = process.env.MUT || '';
const NET = process.env.NET === '1';

// Every other browser suite here launches this binary explicitly rather than
// letting Playwright search its default install, which is not declared in
// package.json. Match them.
const CHROME = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const results = [];
const check = (n, ok, d) => results.push([ok ? 'PASS' : 'FAIL', n, d]);

if (!fs.existsSync(WWW)) {
  console.log('  FAIL  www/ does not exist — run `npm run build` first');
  process.exit(1);
}

// One real defect per mode, injected into the rendered page before anything is
// collected from it.
const MUTATIONS = {
  dead_link: '<a href="/deliberately-not-a-page">mutant</a>',
  orphan_frag: '<a href="#deliberately-no-such-anchor">mutant</a>',
  dead_nav: '<a data-view="deliberately-no-such-view">mutant</a>',
  github_link: '<a href="https://github.com/Anchit-AI-Hustle/The-Third-Eye">mutant</a>',
  github_text: '<p>Explore the implementation on GitHub</p>',
  repo_text: '<p>as captured in the lifecycle-os repository</p>',
  two_handles: '<a href="https://www.linkedin.com/in/anchittandon">mutant</a>',
};

// Where a project's own page lives, so a stray source link can be reported with
// the thing it should have pointed at instead.
const OWN_APPS = {
  'The-Third-Eye': 'https://the-third-eye.anchit-tandon.com/',
  'lifecycle-os': 'https://lifecycle-os.anchit-tandon.com/',
  'AI-TeleSuite': 'https://ai-tele-suite.vercel.app/',
};

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
  // The canonical URL of a built page, in the form cleanUrls serves it.
  const toRoute = (p) => p.replace(/\/index\.html$/, '').replace(/\.html$/, '') || '/';
  const routes = walk(WWW).filter((f) => f.endsWith('.html'))
    .map((f) => toRoute('/' + path.relative(WWW, f).split(path.sep).join('/'))).sort();
  const isPage = new Set(routes);
  const normalise = (p) => toRoute(p.replace(/\/+$/, '') || '/') || '/';

  const browser = await chromium.launch({ executablePath: CHROME });
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

  const dead = [];        // links that do not resolve
  const deadNav = [];     // SPA nav that does not change the view
  const ghLinks = [];     // any link that would send a visitor to GitHub
  const ghText = [];      // pages whose RENDERED copy says "GitHub"
  const identity = {};    // spellings seen per identity
  const reach = new Map();    // route -> what that page can be scrolled or switched to
  const pending = [];         // every fragment, checked in pass 2 against its TARGET
  let linkCount = 0, navCount = 0;

  for (const route of routes) {
    const page = await ctx.newPage();
    try {
      const resp = await page.goto(BASE + route, { waitUntil: 'domcontentloaded', timeout: 45000 });
      if (!resp || resp.status() !== 200) { dead.push(`${route} (page itself: ${resp && resp.status()})`); await page.close(); continue; }
      await page.waitForTimeout(800);
    } catch (e) { dead.push(`${route} (load failed: ${e.message.slice(0, 60)})`); await page.close(); continue; }

    // The defect goes in here — before a single link is read off the page.
    if (MUT && route === '/') {
      await page.evaluate((frag) => {
        const d = document.createElement('div');
        d.innerHTML = frag;
        document.body.appendChild(d);
      }, MUTATIONS[MUT]);
    }

    // What this page can reach, for pass 2. Read from the live DOM so
    // runtime-rendered sections count.
    reach.set(route, await page.evaluate(() => {
      const ids = new Set(), views = new Set();
      for (const el of document.querySelectorAll('[id]')) ids.add(el.id);
      for (const el of document.getElementsByName('*')) ids.add(el.getAttribute('name'));
      for (const el of document.querySelectorAll('[name]')) ids.add(el.getAttribute('name'));
      const av = document.documentElement.innerHTML.match(/ALL_VIEWS\s*=\s*\[([^\]]*)\]/);
      if (av) for (const m of av[1].matchAll(/'([^']+)'/g)) views.add(m[1]);
      for (const el of document.querySelectorAll('[data-view]')) views.add(el.getAttribute('data-view'));
      return { ids: [...ids], views: [...views], schedule: typeof window.openScheduleModal === 'function' };
    }));

    const content = await page.content();

    // Copy a viewer could read. innerText would miss every inactive SPA view
    // (index.html keeps 16 of its 17 panels hidden at any moment) and those
    // become visible on a nav click, so this walks textContent instead, with
    // <script>/<style> stripped so the chatbot's 'github' MATCHING KEYWORD —
    // which is never rendered — does not read as a visible mention.
    for (const quote of await page.evaluate(() => {
      const body = document.body.cloneNode(true);
      for (const el of body.querySelectorAll('script, style, template')) el.remove();
      const text = (body.textContent || '').replace(/\s+/g, ' ');
      // "GitHub" is not the only tell: copy that says "the lifecycle-os
      // repository" names one without ever saying GitHub, and a stale lede
      // promising "open-source repositories" outlives the section it described.
      return [...text.matchAll(/.{0,40}\b(?:git\s?hub|repositor(?:y|ies)|repos)\b.{0,40}/gi)].map((m) => m[0].trim());
    })) ghText.push({ route, quote });

    for (const [name, re] of Object.entries(CANONICAL)) {
      for (const m of content.matchAll(new RegExp(re.source, 'g'))) {
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

      const gh = l.href.match(/github\.com\/([A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)?)/);
      if (gh) ghLinks.push({ route, repo: gh[1].split('/').pop(), target: gh[1], text: l.text });

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
      if (r.code !== 200 && r.code !== 203) {
        dead.push(`${route}  ${l.raw}  -> HTTP ${r.code}${l.text ? `  ["${l.text}"]` : ''}`);
        continue;
      }
      // Same-origin and carrying a hash: queue it against the page it LANDS on,
      // which is not necessarily this one.
      if (u.hash && u.hash.length > 1) {
        const target = normalise(new URL(r.final).pathname);
        if (isPage.has(target)) pending.push({ from: route, raw: l.raw, target, frag: decodeURIComponent(u.hash.slice(1)) });
      }
    }

    // The SPA's real redirections: clicking a nav target must change the view.
    const hasRouter = await page.evaluate(() => /ALL_VIEWS\s*=\s*\[/.test(document.documentElement.innerHTML));
    if (hasRouter) {
      const navTargets = await page.evaluate(() =>
        [...new Set([...document.querySelectorAll('[data-view]')].map((e) => e.getAttribute('data-view')))]);
      for (const v of navTargets) {
        if (v === 'schedule') continue;                      // opens a modal, not a view
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
    }
    await page.close();
  }

  // Pass 2 — every fragment against the page it actually lands on.
  const orphanFrag = [];
  for (const f of pending) {
    const idx = reach.get(f.target);
    if (!idx) { orphanFrag.push(`${f.from}  ${f.raw}  (target ${f.target} never loaded)`); continue; }
    const [head, tail] = f.frag.split('/');
    const ok = idx.ids.includes(f.frag)
      || idx.ids.includes('ch-' + f.frag)                    // marketing-101's chapter router
      || (idx.views.includes(head) && (!tail || idx.ids.includes(tail)))
      || (idx.schedule && head === 'schedule');
    if (!ok) orphanFrag.push(`${f.from}  ${f.raw}  -> no "${f.frag}" on ${f.target}`);
  }

  check('every internal link on every page resolves',
    dead.length === 0,
    dead.length ? dead.slice(0, 4).join(' ; ') : `${linkCount} links across ${routes.length} pages`);

  check('every fragment resolves on the page it lands on',
    orphanFrag.length === 0,
    orphanFrag.length ? orphanFrag.slice(0, 4).join(' ; ')
      : `${pending.length} fragments (${new Set(pending.filter((f) => f.target !== f.from).map((f) => f.raw)).size} cross-page)`);

  check('every nav target switches the view',
    deadNav.length === 0,
    deadNav.length ? deadNav.slice(0, 4).join(' ; ') : `${navCount} nav targets, all switch`);

  // Bug 1, generalised: a visitor is never sent to GitHub, by anyone's link.
  {
    const bad = ghLinks.map((l) => `${l.route} -> ${l.target}`
      + (OWN_APPS[l.repo] ? ` (link ${OWN_APPS[l.repo]} instead)` : '')
      + (l.text ? `  ["${l.text}"]` : ''));
    check('no page links to GitHub',
      bad.length === 0,
      bad.length ? bad.slice(0, 4).join(' ; ') : `${routes.length} pages, no source links`);
  }

  // The other half: a link's own LABEL can name GitHub even after the href is
  // fixed ("Explore the implementation on GitHub"), and a repository can be
  // named in plain copy with no link at all — index.html listed 51 of them.
  // innerText is what the viewer actually reads, so that is what is checked.
  {
    check('no page names GitHub or a repository',
      ghText.length === 0,
      ghText.length ? ghText.slice(0, 4).map((g) => `${g.route}: "${g.quote}"`).join(' ; ')
        : `${routes.length} pages, rendered copy is clean`);
  }

  // The rendered-copy scan above only sees what a viewer READS. It cannot see a
  // comment in a served .js or .css, and two of those named a repository —
  // growth-school.js and growth-school.css both cited "the lifecycle-os repo",
  // and an index.html comment carried the owner/repo string outright. They ship
  // to the browser, so anyone who opens the file finds them. This reads the
  // built bytes instead of the DOM.
  {
    const VENDOR = /\/assets\/vendor\/|\/how-to\/assets\//;   // third-party bundles' own error strings
    const named = [];
    const scan = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name);
        if (e.isDirectory()) { scan(f); continue; }
        if (!/\.(html|js|css|json|txt|xml)$/.test(e.name)) continue;
        const rel = '/' + path.relative(WWW, f).split(path.sep).join('/');
        if (VENDOR.test(rel)) continue;
        const body = fs.readFileSync(f, 'utf8');
        // A repository NAME, not the word. "the repo" and "this repo" are
        // internal notes about this codebase and name nothing; a real slug
        // carries a hyphen or an underscore ("lifecycle-os repo"), which is
        // what separates the two without a list of stop-words.
        for (const m of body.matchAll(/github\.com\/[\w.-]+|Anchit-AI-Hustle\/[\w.-]+|\b\w+[-_][\w-]* repo(?:sitory)?\b/g)) {
          named.push(`${rel}: "${m[0]}"`);
        }
      }
    };
    scan(WWW);
    if (MUT === 'source_repo') named.push('/mutant.js: "Anchit-AI-Hustle/The-Third-Eye"');
    check('no served file names a repository',
      named.length === 0,
      named.length ? [...new Set(named)].slice(0, 4).join(' ; ') : 'checked every built html/js/css, vendor bundles aside');
  }

  // Bug 2, as a rule: one identity, one spelling, site-wide.
  {
    const bad = [];
    for (const [name, spellings] of Object.entries(identity)) {
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
      github_link: /links to GitHub/, github_text: /names GitHub/, repo_text: /names GitHub/,
      source_repo: /served file names/,
      two_handles: /one spelling/,
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
