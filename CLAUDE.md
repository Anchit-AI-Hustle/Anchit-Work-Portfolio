# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository overview

Single-file static portfolio site for Anchit Tandon. The entire app — markup, CSS, JS, content, and chatbot knowledge base — lives in `index.html` (~1,085 lines). There is no build step, no package.json, no framework, and no bundler.

## Commands

- **Run locally**: open `index.html` directly in a browser, or serve the folder (e.g. `python -m http.server` / `npx serve`). No install step.
- **Deploy preview**: `vercel` (from repo root). **Production**: `vercel --prod`. Vercel framework preset is "Other" — pure static.
- **No tests, no lint, no build** — edits to `index.html` are the entire dev loop.

The chatbot is wired to a real Claude-backed `/api/chat.js` serverless function (`api/chat.js`), with the offline keyword bot as a graceful fallback. See `DEPLOY.md` for the GitHub + Vercel setup and custom domain steps.

## Architecture

Everything is in `index.html`, organized in three contiguous sections:

1. **`<style>` (lines ~15–300)** — Design tokens live in `:root[data-theme="dark"]` and `:root[data-theme="light"]`. The whole palette (champagne accent `#c9a96e`, ink/bg/rule scales) and typography (Fraunces serif / JetBrains Mono / Inter) is driven by CSS variables on `:root`; the theme toggle just flips `data-theme`. Layout is a two-column CSS grid (`.app`) with a collapsible sidebar (`--sidebar-w` ↔ `--sidebar-w-collapsed`).

2. **`<body>` markup (lines ~300–800)** — Sidebar nav (`.nav-item[data-view=...]`) + a single `<main class="view">` containing one `<section class="panel" id="panel-{view}">` per view. Views: `chat`, `work`, `projects`, `about`, `experience`, `contact`, plus per-project detail panels `project-yaara`, `project-music`, `project-telesuite`, `project-lifeengine`. Only the panel with `.active` is visible.

3. **`<script>` (lines ~800–end)** — Three concerns:
   - **View router** (`switchView`, line ~830): toggles `.active` on nav items + panels, syncs `location.hash`, handles the nested "Side projects" parent-child highlighting, and is also reachable via `[data-go]` buttons inside panels and via inline `<a data-nav="...">` links rendered by the chatbot.
   - **Theme + sidebar persistence**: `localStorage` keys `anchit-theme` and `anchit-sidebar`.
   - **Chatbot** (line ~860+): The `KB` array is the entire knowledge base — each entry has `keywords[]`, an HTML `response` (often containing `data-nav` links into other views), and a `nextChips[]` array of context-aware follow-up suggestions. `findMatch(text)` does case-insensitive keyword overlap scoring against `KB`. `handleMessage` first calls `llmReply()` (POST `/api/chat`, with short `chatHistory` for context); if Claude returns a reply it renders that, otherwise it falls back to `findMatch`/`KB` and renders the matched response with that entry's `nextChips`. So the `KB` array is now the **offline fallback** layer, not the only brain — it still ships in the single HTML file and works with no network.

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
