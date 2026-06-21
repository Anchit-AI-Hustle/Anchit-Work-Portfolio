# `index.html` Landmarks

This is a deliberately-single-file portfolio (~4500 lines). Use the
line ranges below as a map. If you're using Claude / Cursor / Codex,
paste the relevant range as context instead of the whole file.

## Top-level layout

| Lines | Section |
|---|---|
| 1–80 | `<head>`, fonts, manifest, favicons, theme-color |
| 80–250 | CSS design tokens — `:root[data-theme="dark"]`, `:root[data-theme="light"]`, theme variables |
| 250–700 | Layout CSS — sidebar, top-bar, hamburger, main, footer, container, breakpoints |
| 700–1100 | Component CSS — chat bubble, build cards, project hero, work timeline, hero stats |
| 1100–1500 | Page-specific CSS — `#view-chat`, project detail pages, resume iframe, contact form |
| 1500–1620 | Sidebar markup (`<aside class="sidebar">`), hamburger, top-action bar |
| 1620–1750 | Home view (`#view-home`) — hero, career timeline, side-project teaser, hero stats |
| 1750–1820 | Chat view (`#view-chat`) — input + chips + message body |
| 1820–1900 | Experience view (`#view-experience`) — Vahdam / Times Internet / SWE / VIT sections |
| 1900–2200 | Side Projects index (`#view-projects`) — 7 build cards |
| 2200–2780 | Project detail pages — `view-project-yaara`, `-music`, `-telesuite`, `-lifeengine`, `-thirdeye`, `-mailer`, `-dtc` |
| 2780–2900 | Resume view (`#view-resume`) — Google Docs iframe |
| 2900–2960 | Contact view (`#view-contact`) |
| 2960–end | `<script>` — see breakdown below |

## `<script>` breakdown

| Lines | What it does |
|---|---|
| 2360–2410 | State + theme bootstrap |
| 2410–2440 | Sidebar collapse toggle (desktop) + cookie fallback |
| 2440–2480 | Sidebar drawer (mobile) — `openSidebar`/`closeSidebar` |
| 2480–2620 | View router — `switchView(view, anchor)`, hash parsing, click delegation |
| 2620–2700 | Reveal-on-scroll IntersectionObserver |
| 2700–2750 | Top-bar TTS "Hear this page" + voice loading |
| 2750–2820 | Cursor glow effect (desktop only) |
| 2820–3700 | Chat KB array — deterministic keyword matching, `findMatch`, `handleMessage`, response rendering |

## Conventions

- **Adding a new view**: extend `ALL_VIEWS` (line ~2360), add a sidebar nav item, add a matching `<section class="view" id="view-{name}">` block.
- **Adding a new project detail page**: follow the `view-project-*` pattern in lines 2200–2780, and add the matching tile in the Side Projects index (lines 1900–2200).
- **Adding a chatbot answer**: append to the `KB` array (line ~2820). Earlier entries win on keyword overlap ties.
- **No build step**: edit `index.html` directly, open in a browser. `vercel --prod` to deploy.

## Hidden landmines

- **CSS variables only** — never hardcode hex in component styles; the light-theme toggle relies on `:root[data-theme]` swaps.
- **Top bar height = 44px + safe-area-inset-top** — anything fixed at top needs to respect that.
- **The chatbot is NOT live AI** — it's a keyword-overlap router over the `KB` array. See `ISSUES.md#C1.8` for the upgrade path.
- **Project detail panels share a template** — keep all 7 in sync structurally (hero / pitch / origin / problem / roadmap / iframe).
