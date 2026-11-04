Ship the Amar Ujala study page to https://anchit-tandon.com/amar-ujala-study. Everything is built and tested; your job is to integrate, verify, push, deploy and confirm.

CONTEXT
- Repo: this one (Anchit-Work-Portfolio). Static site; `npm run build` assembles www/ via scripts/build-www.mjs; pushes to main auto-deploy on Vercel (project anchit-work-portfolio, team anchit-ai-hustle). cleanUrls is on, so amar-ujala-study.html serves at /amar-ujala-study.
- Handoff files in .amar-ujala-study-handoff/:
  - amar-ujala-study.html: the finished single-file page (sha256 starts fc585d7c7dcc9831). Analysis, six questions, upgrades, revamps, new areas, roadmap, measures, risks, sources, and a working Aage Kya prototype (EN/HI student flow, fake-university check, parent OTP consent with demo OTP 2468, college dashboard, editable revenue model, base case Rs 1.13 crore). Built on DESIGN.md tokens. noindex, not in the sitemap.
  - build-www.patch: adds 'amar-ujala-study.html' to the assets list in scripts/build-www.mjs.
  - commit-msg.txt: the commit message (keep its Co-Authored-By and Claude-Session lines).
  - amar-ujala-study.test.cjs: 38 acceptance tests (3 viewports + full prototype flow). Run with U=<url> node <file>.
- My working tree on main has uncommitted, unrelated changes (gram-street-coffee/index.html, assets/brand/dc-*). Do NOT commit, stash, reset or touch them. Work in a separate git worktree from origin/main.

STEPS
1. git fetch origin && git worktree add ../portfolio-aus -b feat/amar-ujala-study origin/main. Work only there.
2. Copy the html in, git apply the patch. In DESIGN.md add the four tokens the page introduces, with one line of use each: --accent-soft rgba(201,169,110,.14), --danger-soft rgba(255,77,31,.14), --on-primary #1a0d06 (primary button text, already in the Button spec), --bg-glass rgba(15,13,10,.92) (sticky header). Note Noto Sans Devanagari as the Hindi fallback in --font-body.
3. Small fixes still open from the independent review (do them in the html, keep everything else byte for byte):
   a. Consent-step and fake-check aria-live regions are rebuilt via innerHTML; keep the live container persistent and only swap its children so screen readers announce changes.
   b. The UP Board 2026 counts cite Organiser, whose headline says "over 43 lakh appeared" (its own table gives 24,86,072 + 26,01,381). Add a second source that states the same counts (UPMSP press note or a national outlet) and link it next to Organiser. Do not change the numbers unless a primary source disagrees.
   Keep: no em or en dashes anywhere; never the words GitHub or repository in rendered text or comments; type and spacing only from DESIGN.md scales; motion only transform/opacity.
4. npm ci && npm run build. Then run and capture logs: node scripts/seo-basics.js, routes-resolve.js, no-github.js, project-links.js, node scripts/sitemap-manifest-check.mjs; serve www/ on 8099 and run design-system.js, mobile-layout.js, redirects-resolve.js; then U=http://127.0.0.1:8099/amar-ujala-study.html node .amar-ujala-study-handoff/amar-ujala-study.test.cjs (expect 38/38). Known pre-existing failures on main, not caused by this change: redirects-resolve "each identity link has one spelling" (phone numbers on deli-chic and gram-street) and chrome-overlap on four lifecycle-os pages. Confirm they also fail on origin/main before ignoring them; anything else failing is ours to fix.
5. Commit only amar-ujala-study.html, scripts/build-www.mjs and DESIGN.md with git commit -F the handoff commit-msg.txt (append a line for the DESIGN.md tokens). Push the branch, open a PR, wait for the Vercel preview to be READY, run the 38 tests against the preview URL (use the Vercel share or bypass link if the preview is protected).
6. Merge to main. Confirm CI green and the production deployment READY. Then check https://anchit-tandon.com/amar-ujala-study live: HTTP 200, 38/38 tests, zero console errors, screenshots at 390, 820 and 1440px with no horizontal scroll, the Hindi toggle works, and the consent banner does not cover the hero buttons at 390px (if it does, that is a site-wide consent.js issue: report it, do not fix it in this PR).
7. Clean up: remove the worktree and the .amar-ujala-study-handoff folder.
8. Report: PR link, deployment id and state, live URL, test logs, the 4 scores (implementation, approach logic, output accuracy, output quality, each out of 10) and anything still worth fixing.
