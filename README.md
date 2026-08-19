# Anchit Tandon — Portfolio

Personal portfolio for **Anchit Tandon**, AGM - Product Management, D2C Growth - US, UK and Global at Vahdam India.
Ships as **web (any device + TV)**, **installable PWA**, **native iOS + Android** via Capacitor, and an AI-powered portfolio assistant.

**Live:** [anchit-tandon.com](https://anchit-tandon.com)

---

## What's in this repo

```text
.
├── index.html                         # Main single-file portfolio shell
├── api/                               # Vercel functions for chat, voice, lifecycle tools, and agents
├── assets/app-skill-map.js            # Shared cross-app capability registry + runtime
├── assets/app-skill-map.css           # Shared visual app skill-tree UI
├── assets/project-playbooks.js        # Project paths, guide library and prompt generator
├── assets/project-playbooks.css       # Shared project-tree and guide-library UI
├── marketing-101.html                 # The Signal Desk — marketing course, served at /marketing-101, linked from Side Hustle
├── assets/cinematic.js                # Shared motion runtime: arrival queue, entrances, surface treatments
├── side-husle/how-to-1/               # React/R3F How-To Engine, served at /how-to
├── lifecycle-os-*.html                # First-party lifecycle intelligence and execution apps
├── scripts/build-www.mjs              # Production build, route assembly and universal UI injection
├── scripts/motionfix.js               # Motion regression suite, each check paired with a mutation
├── scripts/turn-by-turn.js            # Asserts blocks arrive one at a time with distinct entrances
├── docs/APP_SKILL_MAP.md              # App-level architecture and extension guide
├── docs/PROJECT_SKILLTREE_GUIDES.md   # Project-level architecture and guide contracts
├── tts-server/                        # Self-hosted XTTS/FastAPI cloned-voice service
├── manifest.json                      # PWA manifest (installable on iOS/Android/desktop)
├── sw.js                              # Service worker and offline shell cache
├── icons/                             # PWA + favicon + Apple touch + native splash assets
├── capacitor.config.json              # Native app config
├── package.json                       # Capacitor dependencies + helper scripts
├── vercel.json                        # Vercel static-host config and app routes
├── STREAMING_VOICE_ARCHITECTURE.md    # Anchit LLM + cloned-voice streaming design
├── VOICE.md                           # Which provider speaks, and how to wire the clone
├── DESIGN.md                          # Palette, type, motion rules — the styling source of truth
├── DEPLOY.md                          # Web + native deploy walkthroughs
└── README.md
```

The main portfolio remains a static `index.html` with embedded CSS + JS, backed by Vercel functions for grounded chat and voice. The repository also contains a set of first-party HTML applications plus the standalone React How-To Engine. `scripts/build-www.mjs` assembles them into one production tree under `www/` and injects the shared navigation and guide systems into every HTML entry point.

## Design system

- **Palette:** Black, orange and gold on restrained dark neutral surfaces (`#0F0D0A` ground, `#FF6940` primary, `#c9a96e` / `#FFB736` accents). Glare/glow is intentionally reduced for readability. Teal is legacy — see the migration note in [`DESIGN.md`](./DESIGN.md), and do not add more of it.
- **Type:** Fraunces (display, variable axes — uses `SOFT` + `WONK`), Inter (body), JetBrains Mono (labels).
- **Layout:** Strong minimal hero, dashboard-style cards, long-form readable sections, section-paneled content. IntersectionObserver-driven scroll reveals.
- **Responsive:** Phone → tablet → laptop → 4K TV. Container scales up to 1920px on TV-class screens; type fluids via `clamp()`.
- **Full rules:** [`DESIGN.md`](./DESIGN.md) is the source of truth. Read it before writing styles; add a token there before inventing a value.

## The two reveal runtimes

`assets/cinematic.js` runs on every page and `index.html` has its own inline
reveal system. CLAUDE.md already warns that a change to arrival behaviour
usually has to be made twice. The sharper rule, learned the hard way:

**A section with a bespoke reveal must opt out of both**, with `data-no-motion`
on the section — the shared opt-out honoured by `cinematic.js`'s `skip()` and by
the inline system's `AUTO_SKIP`. `#currentWork` had its own pinned timeline and
was *also* claimed by `cinematic.js`, which gave `.cw-body` a `cin-v3` entrance
that never completed. Parked at `rotateY(26deg)` under the stage's
`perspective: 1400px`, every child projected to a different height — the four
skill items rendered at 24.9 / 20.9 / 28.9 / 23.9px and the panel read as
skewed.

The root cause was in `cinematic.js` itself. The variant rules apply to any
element carrying `.cin-vN`, but the rule that clears them was scoped to
`.cin`:

```css
.cin.cin-in.cin-v1, … {transform:none}     /* before — misses .cin-stagger */
.cin-in.cin-v1, …     {transform:none}     /* after  — whichever class carries it */
```

So every `.cin-stagger` element that had been given a variant stayed at its
entrance transform permanently. That is why the sidebar sat at a visible tilt on
all 23 pages. `npm run test:entrance` sweeps four pages for it.

Second rule from the same section: **never gate legibility on scroll progress.**
The panel's reveal was driven by a scrubbed timeline whose start is the pin
start, so at the moment the section locked to the middle of the screen its
progress was 0 and the whole panel was invisible. Content now reveals on entry,
plays once, and the pinned scrub carries only depth.

## Motion system

`assets/cinematic.js` is one runtime, loaded by every page, so the site moves
the same way everywhere instead of each page inventing its own choreography.

- **One thing at a time.** Blocks queue and each waits for the one before it;
  their children do the same inside them. The gap tightens as the queue grows,
  because "one at a time" must never become "text you cannot read yet".
- **Six dimensional entrances**, assigned so no block matches its neighbour.
- **Surface treatments** sized to the block: a holographic sheen on panels, a
  hairline wipe on smaller blocks, a pointer-tracked specular on both.
- **Fail-visible.** Everything starts hidden, so a stall would mean a blank
  page. A sweep re-checks on scroll and resize, and a hard deadline reveals
  everything regardless.
- **`window.__cinRescan()`** re-scans on demand, for pages that reveal regions
  by dropping a `display:none` class rather than by inserting nodes.

Everything animates `transform` and `opacity` only. The budget is real and
measured: every page holds ~17ms a frame with no page over budget.

## Universal App Skill Map

Every generated HTML app receives the same visual capability map. It organizes the suite into seven functional branches around one shared **Anchit Intelligence** node, highlights the current route, exposes app-level capabilities and suggested dependencies, and stores Available → In progress → Completed states locally in the browser.

The map is implemented once in `assets/app-skill-map.js` and `assets/app-skill-map.css`. The build injects those assets into every `www/**/*.html` entry point after static copying and after the `/how-to` Vite build, so the portfolio, JobHunt, avatar, Lifecycle OS modules, and the Omni How-To Engine stay consistent without duplicating source markup.

Keyboard access: **Cmd/Ctrl + K** toggles the map and **Escape** closes it. Full architecture and external-app adoption instructions live in [`docs/APP_SKILL_MAP.md`](./docs/APP_SKILL_MAP.md).

## Project SkillTree & Guide Library

Every app capability now becomes a project node. The project layer automatically creates an ordered path inside each app, tracks project progress, rolls project completion up to the App Skill Map, and generates four original playbooks for every project:

- Quickstart Guide
- Operator Mega-Prompt
- Evidence Audit Prompt
- 9.5/10 Improvement Loop

The Guide Library is searchable by app, project, department, outcome, model and guide type. Visitors can save guides, customize goal/context/inputs/constraints/output fields, copy the generated result, and build a structured prompt from any project. Prompts follow a portable five-part contract: **Role · Context · Task · Constraints · Output Format**.

The implementation lives in `assets/project-playbooks.js` and `assets/project-playbooks.css`. It reads the App Skill Map at runtime, so every current capability—and every future app capability added to the registry—automatically receives a project path and guide pack.

Keyboard access: **Cmd/Ctrl + Shift + K** toggles Project Playbooks. Full architecture, APIs and separately deployed app adoption instructions live in [`docs/PROJECT_SKILLTREE_GUIDES.md`](./docs/PROJECT_SKILLTREE_GUIDES.md).

## Anchit LLM + cloned voice

- `api/chat-stream.js` streams first-person LLM tokens and cloned-voice audio packet events.
- `api/chat.js` remains the non-streaming fallback.
- `tts-server/app.py` exposes `/api/tts`, `/api/tts-packet`, and `/ws/tts` for self-hosted XTTS.
- Deployment and GPU notes live in [`STREAMING_VOICE_ARCHITECTURE.md`](./STREAMING_VOICE_ARCHITECTURE.md).

## LLM provider cascade

`api/apply.js`, `api/lifecycle.js` and `api/mailer.js` fall back through the
free providers — Groq → Cerebras → Gemini → OpenRouter — before giving up to a
deterministic template. Each one used to pin a single model id, and by August
2026 every one of those ids was dead:

| Provider | Pinned id | Retired | Now leads with |
|---|---|---|---|
| Groq | `llama-3.3-70b-versatile` | 2026-06-17 | `openai/gpt-oss-120b` |
| Cerebras | `llama-3.3-70b` | 2026-02-16 | `gpt-oss-120b` |
| Gemini | `gemini-2.0-flash` | 2026-06-01 (shut down) | `gemini-3.6-flash` |

So the entire free cascade 404'd, and because each caller swallowed the error
(`catch (e) { /* next provider */ }`) it fell silently into the template — the
response looked the same whether a key was missing or every provider was dead.
That is the "the AI provider is unavailable" class of failure.

Model ids now live in one place, **`api/_models.js`**, as a *chain* per provider
rather than a single id (the rule `api/cascade.js` already used for Anthropic):

- Newest id first, previous generation next, the retired id last — kept, not
  deleted, because it is still correct on a committed-spend contract where the
  deprecation does not apply.
- A **404** (or a 400 naming the model) advances the chain, so the next
  retirement self-heals at the cost of one round-trip.
- A **401/403/429/5xx** does *not* advance it — a bad key or an outage fails
  identically for every id, so burning the chain only adds latency.
- `*_MODEL` env vars still work and are tried first, so a model can be forced
  from the dashboard without a deploy.
- Failures are collected and logged with the id and reason, and a successful
  response now names the model that answered. A silent cascade is what made the
  original fault invisible.

## Running locally

```bash
# Install dependencies
npm install

# Fast source preview (does not run the production injection step)
npm run dev

# Production-equivalent preview: builds every app, injects both shared systems,
# and serves the assembled www/ directory
npm run dev:built
```

The built preview is the correct path for testing cross-app navigation, project playbooks, the guide library and `/how-to` asset routing.

## Testing

There is no unit-test runner. What exists are browser suites that drive the real
built site and assert on what a visitor would actually see. Serve `www/` first
(`npm run dev:built`, or any static server on port 8099), then:

```bash
node scripts/motionfix.js        # motion regressions — 8 checks
node scripts/turn-by-turn.js     # blocks arrive one at a time, entrances differ
npm run test:providers           # LLM cascade survives a retired model id — 6 checks
npm run test:cards               # Side Hustle cards are equal and explained — 10 checks
npm run test:entrance            # nothing parked at an unfinished 3D entrance — 8 checks
```

`provider-chain.js` needs no server; it stubs the network. It is also fully
mutation-covered — `MUT=1 npm run test:providers` must report every check
failing.

`motionfix.js` pairs **every** check with a mutation that reintroduces the bug it
guards, so the suite can be shown to fail rather than assumed to work:

```bash
MUT=scan_top      node scripts/motionfix.js   # expect a FAIL
MUT=no_governor   node scripts/motionfix.js   # expect a FAIL
MUT=no_park       node scripts/motionfix.js   # expect a FAIL
MUT=smooth_scroll node scripts/motionfix.js   # expect a FAIL
```

One check is honest about its limits: `early scroll is never thrown back` has
**not** been shown to fail on demand — the fault is timing-dependent enough that
a fixed set of start times cannot be relied on to provoke it. Its header says so.
Treat it as a guard against a regression that reproduces, not as proof of one
that does not.

## Native apps — iOS + Android via Capacitor

> The `android/` and `ios/` folders are already scaffolded and committed.
> You only need to install deps + `pod install` on a Mac to build the iOS app.

### How it's wired

- Root HTML, `manifest.json`, `sw.js`, `icons/`, and other static assets are copied into `www/`.
- `npm run build` runs `scripts/build-www.mjs`, compiles the How-To Engine, injects the App Skill Map and Project Playbooks into all HTML entry points, and emits the complete web bundle.
- Capacitor's `webDir` is set to `www`, so `npx cap sync` copies from there into the native projects (`android/app/src/main/assets/public/` and `ios/App/App/public/`).

### Every time you change web code

```bash
npm run cap:sync     # = build-www + cap sync (refreshes both platforms)
```

### Regenerating icons & splash screens

Source assets live in `assets/` (1024×1024 icon + 2732×2732 splash, light + dark). After editing those:

```bash
npx capacitor-assets generate --android --ios \
  --iconBackgroundColor "#FF4D1F" \
  --iconBackgroundColorDark "#0F0D0A" \
  --splashBackgroundColor "#FBF5EC" \
  --splashBackgroundColorDark "#0F0D0A"
```

This regenerates all 56 Android + 7 iOS icon/splash assets.

### iOS build & submit (App Store)

```bash
# One-time, on macOS:
cd ios/App
pod install
cd ../..
npx cap open ios         # opens Xcode
```

In Xcode:
1. Select the **App** target → Signing & Capabilities → set your **Team** (needs Apple Developer account, $99/yr)
2. Bundle ID is preset to `com.anchittandon.portfolio` — change in `capacitor.config.json` if needed
3. Bump version + build number under General → Identity
4. **Product → Archive** → upload to App Store Connect
5. Submit for review at [appstoreconnect.apple.com](https://appstoreconnect.apple.com)

**⚠️ Apple Review caveat:** Apple often rejects portfolio sites wrapped as apps under Guideline **4.2 — Minimum Functionality**. To strengthen the case:
- The PWA layer adds offline mode + share target + app shortcuts ✓
- Consider adding native features before submitting: push notifications, Siri shortcuts, share extensions, or a "contact me" haptic
- Write a clear App Review note explaining how it differs from the website (e.g. offline access, native share, home-screen presence)

### Android build & submit (Play Store)

```bash
npx cap open android     # opens Android Studio
```

In Android Studio:
1. Wait for Gradle sync
2. **Build → Generate Signed Bundle / APK** → create a keystore (save it safely — you need it for every future update)
3. Sign with your keystore → produces a `.aab` file
4. Upload to [play.google.com/console](https://play.google.com/console) (needs Google Play account, $25 one-time)
5. Fill out store listing → submit for review

Google's review is faster and more lenient than Apple's. PWA-style wrappers are generally fine.

### What you'll need

| Platform | Required | Cost |
|----------|----------|------|
| iOS | macOS + Xcode + Apple Developer | $99/yr |
| Android | Android Studio (any OS) + Google Play Console | $25 one-time |
| App icons | Already generated in `icons/` | — |
| Splash screen | `icons/splash-2048x2732.png` (regenerate at higher resolution if needed) | — |

## Web deploy (Vercel)

See [`DEPLOY.md`](./DEPLOY.md). TL;DR:

```bash
vercel
```

## Project links

- **MusicGenAI** — [github](https://github.com/anchittandon-create/MusicGenAI) · [live](https://music-gen-ai-blue.vercel.app/)
- **Hey Yaara** — [github](https://github.com/anchittandon-create/hey-yaara) · [live](https://hey-yaara.vercel.app/)
- **AI TeleSuite** — [github](https://github.com/anchittandon-create/AI-TeleSuite) · [live](https://ai-tele-suite.vercel.app/)
- **TH+ LifeEngine** — [github](https://github.com/anchittandon-create/TH-LifeEngine) · [live](https://th-life-engine.vercel.app/)

## Contact

- [anchit.tandon@gmail.com](mailto:anchit.tandon@gmail.com)
- [LinkedIn](https://linkedin.com/in/anchit-tandon)
- [GitHub](https://github.com/anchittandon-create)
