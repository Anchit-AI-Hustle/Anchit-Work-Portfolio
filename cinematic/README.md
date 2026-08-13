# cinematic — Anchit Tandon

Next.js (App Router) · Tailwind · GSAP + ScrollTrigger · Lenis · Framer Motion · React Three Fiber.

## Run

    npm install
    npm run dev

## Deploy to its own URL

From THIS directory (not the repo root — the parent is a separate static site):

    npx vercel            # preview URL
    npx vercel --prod     # production URL for this project

Vercel will prompt to create a new project on first run. Accept the defaults;
`vercel.json` already pins the framework, so detection cannot pick up the
static site in the parent directory.

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
