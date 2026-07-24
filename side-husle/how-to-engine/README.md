# How-To Engine

An ADHD-friendly, 3D interactive learning engine that explains **any** humanly-doable task — from *switching on a phone* to *swimming breaststroke* or *solving a quadratic* — as a visual, step-by-step guide. Multiple frontier AIs answer in parallel; the best three are fused by a consensus evaluator into one branchable master guide, and every step gets an animated clip from a text-to-video pipeline.

> Lives at `anchit-work-portfolio/side-husle/how-to-engine`. It is a **standalone Vite app** (the portfolio site itself is intentionally single-file static), deployed separately.

## Experience flow
1. **Intro / explainer** — a cinematic 3D hero card explains what the engine does.
2. **Click "Enter the engine"** → a **spinning tornado** WebGL loader.
3. **Ask anything** — the dual-state prompt bar + auto-suggestion chips.
4. The **agentic cascade** runs → progress track, live model strip, a dynamic
   flow diagram, and step cards each with an animated video.

## Architecture
```
Browser ──POST /api/cascade { task }──▶ AgentCascadeService (server)
                                          1. DISPATCH  → top-N models in parallel
                                          2. SCORE     → keep top 3 by quality
                                          3. SYNTHESIZE→ evaluator merges → MasterGuide
Browser ──POST /api/text-to-video──────▶ Runway / Luma / Sora wrapper (server)
```
Provider API keys live **only** in the serverless functions — never in the browser.

## Key files
| File | Role |
| --- | --- |
| `src/services/AgentCascadeService.ts` | Parallel dispatch + top-3 selection + consensus synthesis |
| `src/services/providers.ts` | Ranked model adapters (Claude via official SDK; others pluggable) |
| `src/components/PromptOptimizer.tsx` | Dual-state prompt: "Surprise me" + "Optimize prompt" |
| `src/components/HowToVisualCanvas.tsx` | Main 3D animated UI (steps + flow + video) |
| `src/components/TornadoLoader.tsx` | R3F spinning-tornado transition |
| `api/cascade.ts`, `api/text-to-video.ts` | Serverless endpoints (keys stay here) |

## Setup
```bash
cd side-husle/how-to-engine
npm install
cp .env.example .env          # add whichever provider keys you have
# local dev with serverless functions (keys server-side):
npx vercel dev                # serves /api/* on :3000
npm run dev                   # Vite SPA → http://localhost:5178/how-to/
```

### Route: `/how-to`
The app is built with Vite `base: '/how-to/'` and ships at the **`/how-to`** route.
`vercel.json` rewrites `/how-to/:path*` → the SPA shell (client-side routing) and
`/how-to/api/:fn*` → the serverless functions. The client calls the API via
`import.meta.env.BASE_URL` so it stays correct under that base. To mount it on the
apex portfolio domain, add a rewrite on the main site: `/how-to/:path*` → this
Vercel project. Deploy: point a Vercel project at this folder (framework: Vite),
set the env vars from `.env.example`. With **zero** keys the app still runs
end-to-end using a deterministic offline guide + animated placeholders.

## Notes
- Claude (`claude-opus-4-8`, adaptive thinking) is the top-ranked node and the
  consensus evaluator, via `@anthropic-ai/sdk`. Other providers are simple
  `fetch` adapters — swap in each vendor's official SDK if preferred.
- The text-to-video endpoint ships as a working mock (animated gradient posters);
  uncomment the Runway/Luma block and set a key to produce real clips.
- Ranking in `providers.ts` is benchmark-driven and fully config-swappable.
