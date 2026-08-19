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

- **Build**: `npm run build` → `scripts/build-www.mjs` + `scripts/copy-ayushi.mjs`, emitting `www/`. **Always rebuild before testing** — the suites drive `www/`, not the source, and a stale `www/` has more than once made a fix look like it did nothing.
- **Run locally**: `npm run dev` for a fast source preview, `npm run dev:built` to build and serve the real `www/` tree. Anything touching routing, the How-To Engine or the shared injected systems must be checked against the built tree.
- **Test**: serve `www/` on port 8099, then `node scripts/motionfix.js` and `node scripts/turn-by-turn.js`. See the Testing section of `README.md`, including which check is a guard rather than a proof.
- **Deploy**: pushes to `main` deploy automatically. `vercel --prod` from the repo root also works.

The chatbot is wired to a real Claude-backed `/api/chat.js` serverless function (`api/chat.js`), with the offline keyword bot as a graceful fallback. See `DEPLOY.md` for the GitHub + Vercel setup and custom domain steps.

## Architecture

Everything is in `index.html`, organized in three contiguous sections:

1. **`<style>`** (line numbers in this file go stale fast — grep instead) — Design tokens live in `:root[data-theme="dark"]` and `:root[data-theme="light"]`. The whole palette (champagne accent `#c9a96e`, ink/bg/rule scales) and typography (Fraunces serif / JetBrains Mono / Inter) is driven by CSS variables on `:root`; the theme toggle just flips `data-theme`. Layout is a two-column CSS grid (`.app`) with a collapsible sidebar (`--sidebar-w` ↔ `--sidebar-w-collapsed`).

2. **`<body>` markup** — A left sidebar (`<aside class="sidebar">`, items carrying `data-view`) plus one `<section class="view" id="view-{name}">` per view. Only the view with `.active` is visible. The live list is `ALL_VIEWS` in the script — currently `home`, `about`, `now`, `chat`, `experience`, `projects`, `resume`, `contact` and eleven `project-*` detail views. **Read `ALL_VIEWS` rather than trusting this sentence**; anything not in that array is rejected by `switchView`.

   Navigation is wired by attribute, not by class: `navLinks` is
   `querySelectorAll('[data-view]')`, so any element anywhere that carries a
   `data-view` gets click routing and active-state sync for free.

3. **`<script>`** — Three concerns:
   - **View router** (`switchView`): toggles `.active` on nav items + panels, syncs `location.hash`, handles the nested "Side projects" parent-child highlighting, and is also reachable via `[data-go]` buttons inside panels and via inline `<a data-nav="...">` links rendered by the chatbot.
   - **Theme + sidebar persistence**: `localStorage` keys `anchit-theme` and `anchit-sidebar`.
   - **Chatbot**: The `KB` array is the entire knowledge base — each entry has `keywords[]`, an HTML `response` (often containing `data-nav` links into other views), and a `nextChips[]` array of context-aware follow-up suggestions. `findMatch(text)` does case-insensitive keyword overlap scoring against `KB`. `handleMessage` first calls `llmReply()` (POST `/api/chat`, with short `chatHistory` for context); if Claude returns a reply it renders that, otherwise it falls back to `findMatch`/`KB` and renders the matched response with that entry's `nextChips`. So the `KB` array is now the **offline fallback** layer, not the only brain — it still ships in the single HTML file and works with no network.

### Adding content

- **New view/panel**: add a `.nav-item` with a unique `data-view`, add the matching `<section class="panel" id="panel-{view}">`, and append the view name to the `ALL_VIEWS` array in the script (line ~828). Anything not in `ALL_VIEWS` is rejected by `switchView`.
- **New chatbot answer**: append to the `KB` array. Order matters when keywords overlap — earlier entries win on ties. Use `<a data-nav="viewName">` inside `response` to deep-link into a panel; the click handler on `[data-go]` / `data-nav` calls `switchView`.
- **New project detail page**: follow the `project-*` panel pattern and add a `.nav-sub-item` under the "Side projects" nav block. The router already knows to keep the parent "Side projects" nav highlighted while a `project-*` view is active.

### Upgrading the chatbot to Claude

The serverless function pattern is documented in `DEPLOY.md` (`api/chat.js` + swap `getBotResponse()`). When implementing, the Vercel knowledge-update note applies: prefer Fluid Compute Node functions (default), and consider routing via the Vercel AI Gateway rather than calling `api.anthropic.com` directly.

## Conventions

- Single-file constraint is intentional — keep it that way unless explicitly asked. New CSS goes in the existing `<style>` block, new JS in the existing `<script>` block.
- Editorial tone: copy is first-person ("I'm building…"), warm, specific with numbers. Match that voice when editing copy or chatbot responses.
- All theming flows through CSS variables — never hardcode colors in component styles.
- **Follow the design system in `DESIGN.md` for all styling.** It is the machine-readable source of truth for the palette (black / orange / gold), typography, spacing, radius, components, motion and focus states. Read it before writing styles; add a token there before inventing a value. Never use framework palette utilities (`gray-500`, `blue-600`, …) for brand surfaces.

## Motion

`assets/cinematic.js` is one runtime loaded by every page; `index.html` also has
its own older inline reveal system. **Both exist, and a change to arrival
behaviour usually has to be made twice** — they have had the same bug
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
- **Native smooth scrolling fights Lenis.** `html { scroll-behavior: smooth }`
  turns every one of Lenis's per-frame `scrollTo` calls into a new animated
  scroll; the page then barely moves. The guard is in the stylesheet and needs
  `!important`, because ScrollTrigger restores the property inline.

### Verify against the built tree

The suites drive `www/`. Run `npm run build` before testing, and prefer
measuring the rendered page over reading the diff — several bugs here looked
correct in source and wrong on screen.

## Borrowing from reference sites

chandan.dev (and any other site used as a reference) is a source of **form only**:
layout, interaction, motion, timing, easing, the anatomy of a component. Take
the structure of a card; never the words inside it.

This is not a style preference. It shipped a fabricated credential: AIESEC
appeared in the "Work done at" row on the live site because it was lifted from
chandan.dev's own project list while porting his layout. It is one of HIS
projects. Three more of his strings came across the same way — his badge copy
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
  own vocabulary — the file already contains it. "Product Management" appears
  28 times, "D2C Growth" 21, "US, UK & global markets" 16.
