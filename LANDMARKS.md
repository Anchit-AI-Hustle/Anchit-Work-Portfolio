# `index.html` Landmarks

This is a deliberately-single-file portfolio (**~12,250 lines**). Use the line
ranges below as a map: paste the relevant range as context instead of the whole
file.

> **These numbers go stale.** They were generated from the file, not typed by
> hand, and the previous version of this document claimed the file was ~4,500
> lines — off by around 8,000, which made it worse than having no map at all.
> If a range looks wrong, grep for the landmark string instead of trusting the
> number, and regenerate this table rather than patching it.

## Top-level map

| Lines | Section |
|---|---|
| 121–166 | first <style> — design tokens (:root) begin |
| 167–248 | sidebar layout tokens |
| 249–454 | futurist layer CSS (sheen / brackets / specular) |
| 455–1803 | morph-label (two-state nav labels) |
| 1804–2145 | builds grid / side-project cards |
| 2146–3446 | reveal system CSS + the six rv-v* entrances |
| 3447–3759 | sidebar markup |
| 3760–3769 | home view markup |
| 3770–3939 | cinematic hero stage |
| 3940–4132 | pinned current-work section |
| 4133–4360 | chat view |
| 4361–4655 | experience view |
| 4656–5542 | side-hustle view |
| 5543–5684 | contact view |
| 5685–5973 | ALL_VIEWS — the router allow-list |
| 5974–6063 | switchView router |
| 6064–8089 | chatbot KB array (offline fallback) |
| 8090–8251 | reveal queue: playBlock / rvDrain (turn-by-turn) |
| 8252–10383 | reveal IntersectionObserver |
| 10384–11467 | WebGL nebula backdrop |
| 11468–11530 | hold-to-reveal portrait script |
| 11531–11680 | ambient animation governor |
| 11681–12258 | scroll-quiet authority (window.__scrolling) |

## Conventions

- **Adding a view**: extend `ALL_VIEWS`, add a `.sidebar-item` carrying
  `data-view`, and add a matching `<section class="view" id="view-{name}">`.
  Anything not in `ALL_VIEWS` is rejected by `switchView`.
- **Navigation is wired by attribute.** `navLinks` is
  `querySelectorAll('[data-view]')`, so any element anywhere with a `data-view`
  gets routing and active-state sync without extra code.
- **Adding a chatbot answer**: append to the `KB` array. Earlier entries win on
  keyword-overlap ties. `KB` is the offline fallback now, not the only brain —
  `/api/chat` answers first when it can.
- **There is a build.** Run `npm run build` and test against `www/`; editing
  `index.html` and opening it directly will not exercise routing or the shared
  injected systems.

## Hidden landmines

- **CSS variables only** — never hardcode hex in component styles.
- **Two reveal systems.** `assets/cinematic.js` is shared across every page and
  `index.html` has its own older inline one. A change to arrival behaviour
  usually has to be made in both; they have had the same bug independently.
- **GSAP owns `transform`** on the hero elements it drives. Use the separate
  `translate` / `rotate` properties for anything CSS-side, or it will silently
  never appear.
- **`body` uses `overflow-x: clip`, not `hidden`** — `hidden` makes body a
  scroll container and silently breaks `position: sticky` and pinned
  ScrollTriggers.
- **`html { scroll-behavior: smooth }` fights Lenis.** The `html.lenis` guard
  needs `!important`, because ScrollTrigger restores the property inline around
  every refresh.
- **The chatbot is live AI with a keyword fallback** — the reverse of what an
  earlier version of this file said.
