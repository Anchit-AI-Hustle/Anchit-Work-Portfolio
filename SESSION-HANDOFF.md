# Session Handoff — Anchit-Work-Portfolio

> Drop-in context for resuming work in **any** Claude surface (Cowork app, Claude Code CLI,
> or a fresh session). Open this repo as a project and read this file + `CLAUDE.md` + `README.md`.
> Last updated: 2026-08-19.

## Why a CLI session may not show in the Cowork app
A **Claude Code CLI session** (started in a terminal) is stored locally and does **not** appear
in the **Cowork app's** session list — they are separate surfaces, and the chat transcript does
not transfer between them. **The work does, via this repo.** To continue in Cowork: open this
repo as a project and tell it *"Read SESSION-HANDOFF.md + CLAUDE.md, then continue."*

## Where things stand
- **Repo:** `Anchit-AI-Hustle/Anchit-Work-Portfolio` · branch `main`
- **Live:** https://anchit-tandon.com  (Vercel project `anchit-work-portfolio`).
  The old `anchits-work.vercel.app` alias is dead (404) — do not use it.
  `/marketing-101` is served from **outside** this project: the production
  deployment 404s for that path, and the page is now version-controlled here as
  `marketing-101.html` with a route in `vercel.json`. If both answer, retire one.
- **Chatbot:** wired to a real Claude backend. Frontend `llmReply()` (index.html ~4274) POSTs to
  `/api/chat`; `api/chat.js` calls Claude (default `claude-haiku-4-5-20251001`) with Anchit's persona,
  and falls back to the offline `KB` keyword bot on any failure. `ANTHROPIC_API_KEY` is set in Vercel
  (Production). **It only produces live LLM replies once the Anthropic account has credits** — until
  then `/api/chat` returns 502 (billing) and the site silently uses the offline bot.
- **State:** working tree clean, in sync with origin.
- **Canonical local copy:** `~/Library/Mobile Documents/com~apple~CloudDocs/ANCHIT'S AI HUSTLE/Anchit-Work-Portfolio`
  (iCloud copy — this is the active one. Older stray copies exist under `~/ANCHIT'S AI HUSTLE/`,
  `~/Desktop/…`, and `~/dev/anchit-hustle/`; ignore those to avoid editing the wrong tree.)

## What the product is
Personal portfolio for **Anchit Tandon** (Senior PM, Times Internet). Ships three ways from one
codebase: **web (any device + TV)**, **installable PWA**, and **native iOS + Android via Capacitor**.

## Architecture (per CLAUDE.md)
- **`index.html` is one file** (~12,250 lines): `<style>` tokens → `<body>` markup → `<script>`.
  It is one of 24 HTML entry points, plus a React/Vite app in `side-husle/how-to-1/`.
- **There IS a build.** `npm run build` → `scripts/build-www.mjs`, emitting `www/`, which is what
  Vercel serves. Earlier versions of this file said there was no build step; that was wrong, and
  testing the source instead of `www/` has hidden more than one working fix.
- **Theme:** CSS variables on `:root[data-theme="dark|light"]`; black / orange / gold
  (`#0F0D0A`, `#FF6940`, `#c9a96e` / `#FFB736`); Fraunces / Inter / JetBrains Mono.
- **Layout:** left sidebar + one `<section class="view" id="view-{name}">` per view.
- **Views:** read `ALL_VIEWS` in the script — currently `home`, `about`, `now`, `chat`,
  `experience`, `projects`, `resume`, `contact` and eleven `project-*` views. Routing is by
  attribute: any element with a `data-view` is picked up automatically.
- **Motion:** `assets/cinematic.js` is a shared runtime on every page — an arrival queue (one
  block at a time, one child at a time), six dimensional entrances, and surface treatments.
  `index.html` also has its own older inline reveal system; changes to arrival behaviour
  usually have to be made in both.
- **Native:** Capacitor (`capacitor.config.json`, `ios/`, `android/`, `www/`); plugins for
  app/browser/haptics/share/splash/status-bar. Build/sync via `npm run cap:sync` etc.
- **Also present:** `api/` (serverless), `tts-server/` (text-to-speech), `cyber/` (alt theme),
  `sw.js` (PWA service worker), `manifest.json`.

## Commands
- **Build:** `npm run build` (always, before testing — the suites drive `www/`).
- **Run locally:** `npm run dev` (fast source preview) · `npm run dev:built` (build + serve `www/`).
- **Test:** serve `www/` on :8099, then `node scripts/motionfix.js` and
  `node scripts/turn-by-turn.js`. Every motionfix check has a `MUT=` mutation that should make it
  fail — except one, which says so in its own header.
- **Deploy:** pushes to `main` deploy automatically · `vercel --prod` also works.
- **Native:** `npm run cap:sync:ios` / `cap:sync:android`, then `cap:open:*` / `cap:run:*`.

## Existing docs (read these too)
`CLAUDE.md` (architecture, commands, and the motion traps this codebase has already fallen into) ·
`README.md` (overview, motion system, testing) · `DESIGN.md` (palette, type, motion rules — the
styling source of truth) · `VOICE.md` (which provider speaks, and how to wire the clone) ·
`DEPLOY.md` · `SYNC-SETUP.md` · `LANDMARKS.md` (regenerated line map) · `GIT-REPAIR.md`.

## Open items
- **The cloned voice is not configured.** `GET /api/tts?debug=1` reports
  `clonedVoiceReady: false`; only Sarvam is wired and it is a stock voice, so the server refuses it
  and the browser falls back to its own device voice. Setting `ELEVENLABS_API_KEY` +
  `ELEVENLABS_VOICE_ID` in Vercel fixes it — see `VOICE.md`. Until then the audio controls carry a
  visible "device voice" badge rather than passing as him.
- **Legacy teal** (`#2EE5AC` / `#00B584`) still appears across twelve source files. Gold is
  canonical — see the migration note in `DESIGN.md`. Do not add more.

## Resuming a specific past CLI session (terminal only)
From a fresh terminal in this repo: `claude --resume` and pick from the list (or `claude --continue`
for the most recent). This is independent of the Cowork app.
