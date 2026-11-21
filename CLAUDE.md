# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

Portfolio site for Anchit Tandon, built around a single-file `index.html`
(~12,250 lines: markup, CSS, JS, content and the chatbot knowledge base all in
one file, deliberately). That page is one of **24 HTML entry points** at the
repo root, plus a standalone React/Vite app under `side-husle/how-to-1/`.

There **is** a build: `scripts/build-www.mjs` assembles every page, compiles the
How-To Engine and injects the shared systems into `www/`, which is what Vercel
serves. There is a `package.json`. There are browser test suites. Earlier
revisions of this file said otherwise and it was wrong.

## Commands

- **Build**: `npm run build` → `scripts/build-www.mjs` + `scripts/copy-ayushi.mjs`, emitting `www/`. **Always rebuild before testing**, the suites drive `www/`, not the source, and a stale `www/` has more than once made a fix look like it did nothing.
- **Run locally**: `npm run dev` for a fast source preview, `npm run dev:built` to build and serve the real `www/` tree. Anything touching routing, the How-To Engine or the shared injected systems must be checked against the built tree.
- **Test**: serve `www/` on port 8099, then `node scripts/motionfix.js` and `node scripts/turn-by-turn.js`. See the Testing section of `README.md`, including which check is a guard rather than a proof.
- **Deploy**: pushes to `main` deploy automatically. `vercel --prod` from the repo root also works.

The chatbot is wired to a real Claude-backed `/api/chat.js` serverless function (`api/chat.js`), with the offline keyword bot as a graceful fallback. See `DEPLOY.md` for the GitHub + Vercel setup and custom domain steps.

## Architecture

Everything is in `index.html`, organized in three contiguous sections:

1. **`<style>`** (line numbers in this file go stale fast, grep instead), Design tokens live in `:root[data-theme="dark"]` and `:root[data-theme="light"]`. The whole palette (champagne accent `#c9a96e`, ink/bg/rule scales) and typography (Fraunces serif / JetBrains Mono / Inter) is driven by CSS variables on `:root`; the theme toggle just flips `data-theme`. Layout is a two-column CSS grid (`.app`) with a collapsible sidebar (`--sidebar-w` ↔ `--sidebar-w-collapsed`).

2. **`<body>` markup**, A left sidebar (`<aside class="sidebar">`, items carrying `data-view`) plus one `<section class="view" id="view-{name}">` per view. Only the view with `.active` is visible. The live list is `ALL_VIEWS` in the script, currently `home`, `about`, `now`, `chat`, `experience`, `projects`, `resume`, `contact` and ten `project-*` detail views (the Lifecycle OS one moved to its canonical page, `/lifecycle-os`; `#project-lifecycle` redirects there). **Read `ALL_VIEWS` rather than trusting this sentence**; anything not in that array is rejected by `switchView`.

   Navigation is wired by attribute, not by class: `navLinks` is
   `querySelectorAll('[data-view]')`, so any element anywhere that carries a
   `data-view` gets click routing and active-state sync for free.

3. **`<script>`**, Three concerns:
   - **View router** (`switchView`): toggles `.active` on nav items + panels, syncs `location.hash`, handles the nested "Side projects" parent-child highlighting, and is also reachable via `[data-go]` buttons inside panels and via inline `<a data-nav="...">` links rendered by the chatbot.
   - **Theme + sidebar persistence**: `localStorage` keys `anchit-theme` and `anchit-sidebar`.
   - **Chatbot**: The `KB` array is the entire knowledge base, each entry has `keywords[]`, an HTML `response` (often containing `data-nav` links into other views), and a `nextChips[]` array of context-aware follow-up suggestions. `findMatch(text)` does case-insensitive keyword overlap scoring against `KB`. `handleMessage` first calls `llmReply()` (POST `/api/chat`, with short `chatHistory` for context); if Claude returns a reply it renders that, otherwise it falls back to `findMatch`/`KB` and renders the matched response with that entry's `nextChips`. So the `KB` array is now the **offline fallback** layer, not the only brain, it still ships in the single HTML file and works with no network.

### Adding content

- **New view/panel**: add a `.nav-item` with a unique `data-view`, add the matching `<section class="panel" id="panel-{view}">`, and append the view name to the `ALL_VIEWS` array in the script (line ~828). Anything not in `ALL_VIEWS` is rejected by `switchView`.
- **New chatbot answer**: append to the `KB` array. Order matters when keywords overlap, earlier entries win on ties. Use `<a data-nav="viewName">` inside `response` to deep-link into a panel; the click handler on `[data-go]` / `data-nav` calls `switchView`.
- **New project detail page**: follow the `project-*` panel pattern and add a `.nav-sub-item` under the "Side projects" nav block. The router already knows to keep the parent "Side projects" nav highlighted while a `project-*` view is active.

### Upgrading the chatbot to Claude

The serverless function pattern is documented in `DEPLOY.md` (`api/chat.js` + swap `getBotResponse()`). When implementing, the Vercel knowledge-update note applies: prefer Fluid Compute Node functions (default), and consider routing via the Vercel AI Gateway rather than calling `api.anthropic.com` directly.

## Conventions

- Single-file constraint is intentional, keep it that way unless explicitly asked. New CSS goes in the existing `<style>` block, new JS in the existing `<script>` block.
- Editorial tone: copy is first-person ("I'm building…"), warm, specific with numbers. Match that voice when editing copy or chatbot responses.
- All theming flows through CSS variables, never hardcode colors in component styles.
- **Never link a viewer to GitHub, and never name a repository in viewer-facing copy.** No `github.com` href on any page, ours or third-party, and no repo name, owner/repo string, or the words "GitHub", "repository" or "repos" in rendered text (copy saying "in the lifecycle-os repository" names one without ever saying GitHub). That holds in **comments too**, a header comment in a served `.js`/`.css` ships to the browser. Link the project's own live app instead; `OWN_APPS` in `scripts/redirects-resolve.js` maps the three that have one. `npm run test:redirects` enforces both halves (`MUT=github_link`, `MUT=github_text`). Note that `assets/growth-school-content.js` renders on **two** pages, `/growth-school` and `/ayushi-rawat/course`.
- **Follow the design system in `DESIGN.md` for all styling.** It is the machine-readable source of truth for the palette (black / orange / gold), typography, spacing, radius, components, motion and focus states. Read it before writing styles; add a token there before inventing a value. Never use framework palette utilities (`gray-500`, `blue-600`, …) for brand surfaces.

## Motion

`assets/cinematic.js` is one runtime loaded by every page; `index.html` also has
its own older inline reveal system. **Both exist, and a change to arrival
behaviour usually has to be made twice**, they have had the same bug
independently more than once.

The rules are in `DESIGN.md`. The short version: animate `transform` and
`opacity` and nothing else, never leave `will-change` on at rest, and nothing
decorative runs while off screen.

### Traps this codebase has already fallen into

Each of these cost real debugging time. They are listed so the next person
recognises the shape rather than rediscovering it.

- **A `transition:` shorthand silently resets `transition-delay`.** A stagger
  written to a custom property (`transition-delay: var(--cin-cd)`) landed
  perfectly while the computed delay stayed `0s`, because the children carried
  their own shorthand. Set the delay inline as well.
- **GSAP owns `transform` on the elements it drives.** An inline transform beats
  any stylesheet rule, so CSS depth on those elements simply never appears. Use
  the separate `translate` / `rotate` properties, which compose.
- **A custom property on `:root` invalidates the computed style of every element
  on the page.** Pointer-driven variables go on the element, never the root.
- **`elementFromPoint` returns the element you are asking on behalf of.** Take it
  out of hit-testing first or every position reads as free.
- **A queue that reveals from its own enqueue is not a queue.** If each drain
  empties the queue and clears its flag, the next enqueue finds it idle and
  reveals synchronously. Enforce the gap across bursts, not within one.
- **An entrance that holds an element off in 3D is a blank screen if it lands on
  a page wrapper.** Size-guard anything that hides before it plays.
- **`overflow-x: hidden` on `body` makes it a scroll container** and silently
  breaks `position: sticky` and every pinned ScrollTrigger. Use `clip`.
- **A custom property on ANY container is the `:root` trap, scoped.** The Xazina
  film wrote `--zoom` and `--lens-x` on `#film` every frame and restyled
  everything inside it: 228 ms of style work a second, idle. Write per-frame
  values to the elements that use them.
- **A scrubbed pinned story looks broken mid-scroll.** Interpolating every layer
  on every scroll frame leaves most positions showing two half-faded scenes and
  no caption. Step between whole scenes (see DESIGN.md, Runtime budget), and
  check the last pose shows what its caption names: the first stepped Gram walk
  ended on the layer in front of the bar it was meant to reveal.
- **A headless frame timer does not see GPU cost.** Backdrop blurs and canvas
  redraws looked fine at 17ms a frame headless and were what a laptop felt as
  lag. Measure idle main-thread work per second, and count WebGL `drawArrays`
  calls to tell whether a shader is drawing: reading a WebGL canvas back
  returns blank without `preserveDrawingBuffer`.
- **Rebuilding `www/` while a suite is crawling it fails that suite.** Four Xazina
  product pages "404'd" because the build was rewriting them. Let suites finish
  first.
- **A user's screenshot may be an old tab.** Compare its copy with the live HTML
  before debugging it: a Deli report still showed nav items removed a day
  earlier.
- **A longer label can push a header off-screen at one width only.** "Ambient
  audio" overflowed Gram's header by 15px at 1200-1279px and nowhere else.
  After changing header copy, measure every width from the nav breakpoint to
  1440.
- **`node scripts/seo-inject.mjs` rewrites every page in the manifest.** Run it,
  then revert pages you did not mean to change: the manifest lags hand edits.
- **Match hosts exactly.** CodeQL rates `/openrouter\.ai/.test(url)` high; parse
  the URL and compare `hostname`. Wrap `decodeURIComponent(location.hash)` in
  try/catch: `#%E0` throws and takes the module down with it.
- **Native smooth scrolling fights Lenis.** `html { scroll-behavior: smooth }`
  turns every one of Lenis's per-frame `scrollTo` calls into a new animated
  scroll; the page then barely moves. The guard is in the stylesheet and needs
  `!important`, because ScrollTrigger restores the property inline.

### Verify against the built tree

The suites drive `www/`. Run `npm run build` before testing, and prefer
measuring the rendered page over reading the diff, several bugs here looked
correct in source and wrong on screen.

## Borrowing from reference sites

chandan.dev (and any other site used as a reference) is a source of **form only**:
layout, interaction, motion, timing, easing, the anatomy of a component. Take
the structure of a card; never the words inside it.

This is not a style preference. It shipped a fabricated credential: AIESEC
appeared in the "Work done at" row on the live site because it was lifted from
chandan.dev's own project list while porting his layout. It is one of HIS
projects. Three more of his strings came across the same way, his badge copy
("At the moment // Y2026"), two of his four skill bullets ("0→1 products",
"Go to market") and his nav label ("Say hi").

The rule, concretely:

- **Take**: grid anatomy, corner brackets, pinned reveals, hover-morph labels,
  parallax depth, easing curves, the *idea* of a stamp or a status dot.
- **Never take**: company names, project names, role titles, skill labels,
  taglines, badge text, button copy, coordinates, or any factual claim.
- Every factual string on this site must be traceable to something already in
  this repo. Before adding a name to any credential list (the company row, the
  work cards, the experience timeline), grep for it in `index.html` first. Zero
  prior mentions means it is not Anchit's.
- When porting a component, replace its copy with wording drawn from Anchit's
  own vocabulary, the file already contains it. "Product Management" appears
  28 times, "D2C Growth" 21, "US, UK & global markets" 16.

## Website & 3D Development Workflow

- **Brief & plan first**: Start new pages/sections with a one-paragraph brief (who, goal, 3-word feel) and plan multi-file changes before editing. Make one change at a time and keep everything else the same.
- **Skills & prompt pack**: Use `.claude/skills/new-section/SKILL.md` when adding/rebuilding sections, `.claude/skills/web-3d-section/SKILL.md` for Three.js/WebGL2/scroll-video work, `.claude/skills/concept-storefront/SKILL.md` for a concept site built on a real brand, `prompts.md` for reusable templates, and `docs/LAUNCH-CHECKLIST.md` before shipping.
- **Runtime budget**: Follow DESIGN.md, Motion, Runtime budget (idle is idle, effects move while the visitor does, pinned stories step between whole scenes, no blur over moving content). `npm run test:storefront-motion` enforces it on the storefronts and runs in CI.
- **Mobile, copy & keys**: Mobile-first at `390px`, `768px`, and `1440px` (no horizontal overflow, thumb-sized controls). Never use `lorem ipsum` or placeholder copy. Secret keys stay in `.env.local` (never in code, commits, or screenshots); public forms use RLS (insert-only, no public read).
- **Media & cinematic restraint**: Images in WebP (`<= 300 KB` hero `<= 1920px`, `<= 150 KB` cards `<= 1000px`, descriptive `alt`, `loading="lazy"` below hero); hero video `< 4 MB`, `<= 1080p`, no audio, `muted loop playsinline` + WebP poster. Use at most a slow hero visual + 1–2 cinematic moves, keep UI transitions `< 500ms` once, lazy-load 3D near viewport (`DPR <= 2`), and fall back to still images/plain stacked layouts on small phones, `prefers-reduced-motion`, or WebGL failure.

## Concept work on real brands

Xazina, Deli Chic and Gram Street are redesigns of real businesses, not client
work. A hiring panel read the first versions as the brands' own sites: indexed
under the brand name, with the cafe's JSON-LD claiming to be the cafe, static
"live" statuses and unsourced founder copy. Every concept site on a real brand
ships with:

- **Credit at y=0.** The shared concept bar (`class="concept-bar"`): "Concept
  storefront by Anchit Tandon, not affiliated with <brand>", plus Portfolio,
  Design notes, Resume and Email Anchit links. It is neutral chrome, not the
  brand's palette. The footer repeats the credit.
- **Out of search.** `robots` `noindex,follow` through `seo.config.json`, out of
  `sitemapExtraUrls`, a title and `og:title` that say "concept by Anchit
  Tandon", and no LocalBusiness / CafeOrCoffeeShop / Store JSON-LD.
- **A `#design-notes` section.** Problem, what I kept, what I changed,
  hypothesis, intended metrics labelled "Intended, not measured", what is real
  and what is a demo, and how checkout works there. Facts come from the build or
  the brand's public catalogue; anything else is labelled design hypothesis.
- **Honest labels.** A static status says "Sample status". A form that stores
  nothing says "Demo only". Copy about real people or plans the repo cannot
  source says "Illustrative copy, not confirmed by <brand>", or goes.
- **Shopper words, not build words.** No frame counters, hex codes, "telemetry",
  gain percentages or 3D/4D/5D labels on screen. One primary call to action per
  hero. The consent banner is neutral and asks after the first scroll there.

