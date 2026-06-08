# Session Handoff — Anchit-Work-Portfolio

> Drop-in context for resuming work in **any** Claude surface (Cowork app, Claude Code CLI,
> or a fresh session). Open this repo as a project and read this file + `CLAUDE.md` + `README.md`.
> Last updated: 2026-06-09.

## Why a CLI session may not show in the Cowork app
A **Claude Code CLI session** (started in a terminal) is stored locally and does **not** appear
in the **Cowork app's** session list — they are separate surfaces, and the chat transcript does
not transfer between them. **The work does, via this repo.** To continue in Cowork: open this
repo as a project and tell it *"Read SESSION-HANDOFF.md + CLAUDE.md, then continue."*

## Where things stand
- **Repo:** `Anchit-AI-Hustle/Anchit-Work-Portfolio` · branch `main` · HEAD `6f7aa27`
- **Live:** https://anchits-work.vercel.app  (Vercel project `anchit-work-portfolio`)
- **State:** working tree clean, in sync with origin.
- **Canonical local copy:** `~/Library/Mobile Documents/com~apple~CloudDocs/ANCHIT'S AI HUSTLE/Anchit-Work-Portfolio`
  (iCloud copy — this is the active one. Older stray copies exist under `~/ANCHIT'S AI HUSTLE/`,
  `~/Desktop/…`, and `~/dev/anchit-hustle/`; ignore those to avoid editing the wrong tree.)

## What the product is
Personal portfolio for **Anchit Tandon** (Senior PM, Times Internet). Ships three ways from one
codebase: **web (any device + TV)**, **installable PWA**, and **native iOS + Android via Capacitor**.

## Architecture (per CLAUDE.md)
- **Everything is in `index.html`** (~1,085 lines): `<style>` design tokens → `<body>` markup →
  `<script>`. **No build step, no framework, no bundler.** Editing `index.html` is the whole dev loop.
- **Theme:** CSS variables on `:root[data-theme="dark|light"]`; champagne accent `#c9a96e`;
  Fraunces / JetBrains Mono / Inter. Toggle flips `data-theme`.
- **Layout:** two-column CSS grid (`.app`) with collapsible sidebar.
- **Views** (`.nav-item[data-view=…]` → `#panel-{view}`, only `.active` visible): `chat`, `work`,
  `projects`, `about`, `experience`, `contact`, plus project detail panels `project-yaara`,
  `project-music`, `project-telesuite`, `project-lifeengine`.
- **Native:** Capacitor (`capacitor.config.json`, `ios/`, `android/`, `www/`); plugins for
  app/browser/haptics/share/splash/status-bar. Build/sync via `npm run cap:sync` etc.
- **Also present:** `api/` (serverless), `tts-server/` (text-to-speech), `cyber/` (alt theme),
  `sw.js` (PWA service worker), `manifest.json`.

## Commands
- **Run locally:** open `index.html`, or `python -m http.server` / `npx serve`. No install.
- **Deploy:** `vercel` (preview) · `vercel --prod` (production). Preset "Other" (pure static).
- **Native:** `npm run cap:sync:ios` / `cap:sync:android`, then `cap:open:*` / `cap:run:*`.
- **No tests / lint / build.**

## Existing docs (read these too)
`CLAUDE.md` (architecture + commands) · `README.md` (overview) · `DEPLOY.md` (GitHub + Vercel +
custom domain + how to wire a real Claude-backed `/api/chat.js`) · `SYNC-SETUP.md` (auto-sync) ·
`LANDMARKS.md` · `GIT-REPAIR.md`.

## Resuming a specific past CLI session (terminal only)
From a fresh terminal in this repo: `claude --resume` and pick from the list (or `claude --continue`
for the most recent). This is independent of the Cowork app.
