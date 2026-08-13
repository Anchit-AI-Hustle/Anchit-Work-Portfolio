# cinematic — Anchit Tandon

Next.js (App Router) · Tailwind · GSAP + ScrollTrigger · Lenis · Framer Motion · React Three Fiber.

## Run

    npm install
    npm run dev

## This is a reference build, not a second site

There is one URL — anchit-tandon.com, served by `index.html` in the repo root —
and everything here is meant to land there rather than beside it. So this
directory has no `vercel.json` and is deliberately not deployable: standing it
up on its own URL would split the portfolio in two, which is exactly what we
decided against.

Use it as the working model. Each component here is the clean, typed version of
an idea; the job is to port that idea into the single-file site with its own
palette and its own performance budget. Ported so far:

  · SmoothScroll  → Lenis, ticked by gsap.ticker, in assets/cinematic.js
  · Cursor        → cinCursor
  · MagneticButton→ initMagnetic
  · Marquee       → .ticker-track
  · PageTransition→ #view-wipe
  · Preloader     → the pre-paint cinematic hero gate
  · HoldReveal    → .hold-reveal on the homepage portrait (CSS clip-path with a
                    registered custom property, rather than a GLSL plane — the
                    shader version cost a WebGL context for one interaction)

Still to port: per-project routes with the circle-wipe between them, and the
Work grid's hover-video treatment.

anchit-tandon.com is untouched by this. Pointing the domain here is a separate,
deliberate step in the Vercel dashboard — and would take the chat, cloned voice,
resume, agent, JobHunt and every Lifecycle OS page offline until they are
rebuilt in this app.

## Architecture notes

- `lib/lenis.ts` — Lenis is ticked BY `gsap.ticker`, with `ScrollTrigger.update`
  bound to Lenis scroll. Two independent rAF loops disagree about "now" and land
  every scroll-triggered animation a frame late, which is the jerkiness Lenis is
  added to remove.
- No CSS transitions or `@keyframes` anywhere. One engine, one ticker — a CSS
  transition and a GSAP tween on the same property fight each other.
- `SmoothScroll` does not start Lenis under `prefers-reduced-motion`.
- `HoldReveal` is a generative GLSL shader, not a two-image displacement map, so
  it renders before any art direction exists. Swap in two textures and mix on
  `uProgress` when you have them.
