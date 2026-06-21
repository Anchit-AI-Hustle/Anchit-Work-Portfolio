# Anchit Tandon — Portfolio

Personal portfolio for **Anchit Tandon**, AGM - Product Management, D2C Growth - US, UK and Global at Vahdam India.
Ships as **web (any device + TV)**, **installable PWA**, **native iOS + Android** via Capacitor, and an AI-powered portfolio assistant.

**Live:** [anchits-work.vercel.app](https://anchits-work.vercel.app)

---

## What's in this repo

```
.
├── index.html              # The whole site — single-file static shell
├── api/                    # Vercel functions for chat, streaming chat, and TTS proxy
├── tts-server/             # Self-hosted XTTS/FastAPI cloned-voice service
├── manifest.json           # PWA manifest (installable on iOS/Android/desktop)
├── sw.js                   # Service worker — offline cache for the shell
├── icons/                  # PWA + favicon + apple-touch + iOS splash
├── capacitor.config.json   # Native app config (bundle id, splash, status bar)
├── package.json            # Capacitor dependencies + helper scripts
├── vercel.json             # Vercel static-host config (security headers)
├── STREAMING_VOICE_ARCHITECTURE.md # Anchit LLM + cloned-voice streaming design
├── DEPLOY.md               # Web + native deploy walkthroughs
└── README.md
```

No frontend framework. The site is a static `index.html` with embedded CSS + JS, backed by Vercel functions for grounded chat and voice. Capacitor wraps the generated `www/index.html` into native iOS and Android apps.

## Design system

- **Palette:** Restrained dark neutral surfaces with amber and muted teal accents. Glare/glow is intentionally reduced for readability.
- **Type:** Fraunces (display, variable axes — uses `SOFT` + `WONK`), Inter (body), JetBrains Mono (labels).
- **Layout:** Strong minimal hero, dashboard-style cards, long-form readable sections, section-paneled content. IntersectionObserver-driven scroll reveals.
- **Responsive:** Phone → tablet → laptop → 4K TV. Container scales up to 1920px on TV-class screens; type fluids via `clamp()`.

## Anchit LLM + cloned voice

- `api/chat-stream.js` streams first-person LLM tokens and cloned-voice audio packet events.
- `api/chat.js` remains the non-streaming fallback.
- `tts-server/app.py` exposes `/api/tts`, `/api/tts-packet`, and `/ws/tts` for self-hosted XTTS.
- Deployment and GPU notes live in [`STREAMING_VOICE_ARCHITECTURE.md`](./STREAMING_VOICE_ARCHITECTURE.md).

## Running locally

```bash
# 1. Install deps (only needed for native builds)
npm install

# 2. Serve the site locally (any port)
npm run dev          # → http://localhost:5173
# or just open index.html in a browser
```

## Native apps — iOS + Android via Capacitor

> The `android/` and `ios/` folders are already scaffolded and committed.
> You only need to install deps + `pod install` on a Mac to build the iOS app.

### How it's wired

- `index.html`, `manifest.json`, `sw.js`, `icons/` live at the **repo root** (so Vercel can serve them as a static site).
- `npm run build` runs `scripts/build-www.mjs`, which mirrors those files into `www/`.
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
