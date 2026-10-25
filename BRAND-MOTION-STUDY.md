# Brand study & motion decisions — Gram Street Coffee and Deli Chic

Companion to `DESIGN.md`. `DESIGN.md` is the portfolio's own design system (black / orange /
gold) and governs `index.html` and the portfolio pages. The two brand microsites are
**separate brands with their own palettes**, and this file is the reference for them: what each
brand actually is, and therefore what should and should not move on its page.

## How this was derived

Every claim below was read out of the repo, not assumed:

- `gram-street-coffee/index.html` (3,112 lines) and `deli-chic/index.html` (2,357 lines) —
  `:root` tokens, font links, nav labels, section ids, headlines, body copy, the
  `PRODUCTS` / `DELI_PRODUCTS` arrays, every `@keyframes` block and every
  `animation: … infinite` declaration.
- `assets/brand-motion.js` (8.2 KB) — the shared motion layer both pages load.
- `assets/vendor/gsap.min.js` (72 KB), `assets/vendor/ScrollTrigger.min.js` (43 KB).
- `assets/tw-gram-street.css`, `assets/tw-deli-chic.css`.

No external reference site was used. Per `CLAUDE.md`, reference sites are a source of **form
only** — and nothing here needed one, because both brands already carry enough material
language of their own to derive motion from.

---

# Part 1 — Gram Street Coffee

## 1.1 What the brand is

A compact, beverage-first specialty counter. The site's own words: *"The global coffee, matcha
and gelato movement, now in India."* Three pillars, stated in that order on the page —
**Coffee** (roasted in-house, micro-lots from Nagaland and Karnataka), **Matcha** (ceremonial
first-harvest Tencha, stone-ground in Kyoto), **Gelato** (small-batch, Italian-style, churned
in-house).

The spatial claim is the brand's most distinctive asset, and it is deliberately small:
*"A compact 10-seater lilac room with polished chrome counters."* · *"Lilac glass. Chrome
accents. A tiny room by design."* The site does not sell scale, it sells a **threshold** — you
walk in. *"Walk into Gram Street"*, *"Keep scrolling and come inside"*, *"Find the Counter."*

Second claim: **precision**. The copy is unusually numeric for a café — 9-bar bottomless
espresso extraction, 18.5 grams dosed, milk aerated to exactly 65°C, poured at 12ml/second,
grown at 1,450 metres in Kiphire. This is a brand that wants to show you its instruments.

Third claim: **movement, city by city.** *"Gram Street began in Gurugram across DLF Phase 1,
Golf Course Road and Sector 56. Mumbai, Bengaluru, Hyderabad and Jaipur are the planned next
destinations, with Dubai, Singapore and London thereafter."*

## 1.2 Material language

| Token | Value | What it is materially |
|---|---|---|
| `--lilac` | `#CDB8F7` | the glass front |
| `--lilac-soft` | `#F1E9FF` | interior light |
| `--grape` | `#2B1650` | deep ground, near-black violet |
| `--berry` | `#5E32CC` | saturated accent |
| `--accent` | `#7C3AED` | action |
| `--chrome` | 5-stop gradient `#FBFAFF → #C4BFD6 → #FFFFFF → #9A94B3 → #E9E6F3` | the counter |

The `--chrome` gradient is the single most motion-relevant token on the page. It is already
used as a fill (including on `.track li::before` dots). A multi-stop metallic gradient is
**only convincing when its highlight moves** — a static chrome gradient reads as grey plastic.
That is a brand reason for motion, not a decorative one.

## 1.3 Typography & voice

Fonts loaded: **Bricolage Grotesque** (`--font`, the brand face), Playfair Display, Plus
Jakarta Sans, Syne. Bricolage is a variable grotesque with wide optical range — it takes weight
and width animation natively, which matters below.

Voice: declarative, short, numeric. Headlines are statements with full stops
(*"Roasted to Order."* · *"The Roastery & Craft."*). Product names are place-and-process names
— Concrete House Blend, Commute Single Origin (Nagaland Lot), Midnight Berry Micro-Lot (Coorg
Anaerobic), Kyoto Ceremonial Uji Matcha. Tasting notes are three-part and sensory: *"Dark Cocoa,
Roasted Hazelnut & Molasses"*, *"Jasmine Florals, Bergamot Orange & Stone Fruit"*, *"Wild
Blueberry, Lavender & Dark Cacao"*.

## 1.4 Brand → motion principles

Derived, in priority order:

1. **Arrival, not scenery.** The brand's core verb is *walk in*. Motion should move the viewer
   through a threshold, not decorate a surface. The existing 5-stage `.walk` pinned rail is
   exactly right and should be the page's motion centre of gravity.
2. **Chrome must live.** Any chrome surface needs a travelling highlight, or the token is
   wasted.
3. **Instruments, not sparkle.** Precision claims earn gauges, needles, fills, counts and
   readouts — things that measure. They do not earn glitter, confetti or bounce.
4. **Warmth is in the liquid, not the easing.** Coffee/matcha/gelato are fluids; motion should
   favour pour, settle, bloom and steam over snap and pop.
5. **Three pillars means three rhythms.** Coffee, matcha and gelato should not animate
   identically — they are different materials at different temperatures.

---

# Part 2 — Deli Chic

## 2.1 What the brand is

A **haute boucherie** — the site's own framing: *"HAUTE BOUCHERIE • EST. NEW DELHI • 100%
ANTIBIOTIC RESIDUE-FREE"*. The thesis is stated outright: *"Deli Chic was born in New Delhi with
a simple thesis: the meat and charcuterie that reaches your dining table should possess the same
uncompromising artisanal integrity as fine European boucheries."*

The headline claim is a **temperature** claim: *"Pure Artisanal Cuts, Chilled, Never Frozen."*
Supported by hard numbers — strict **0°C–4°C** temperature-controlled cold chain, vacuum-sealed
at peak freshness, 12 hours farm to door, dispatched across **4 Delhi NCR hubs** (Gurugram DLF
1–5 / Cyber City / Golf Course / Sohna Road; Punjabi Bagh / Rajouri Garden / Civil Lines / Model
Town; Noida Sector 15–137 / Expressway / Greater Noida West).

Second claim: **inspection**. *"Every portion weighed, trimmed, and inspected prior to vacuum
packaging."* The page already invites the viewer to inspect: *"Move cursor or drag finger across
cut to inspect curing grain & cellular density."* The process rail is literally
**Cut → Cured → Inspected → Sealed**.

Third claim: **two culinary lineages held at once** — German/European charcuterie (*"smoked
naturally over German beechwood shavings"*, Bavarian frankfurters, streaky bacon, cracked
Tellicherry black pepper salami) and *"Royal Awadhi Alchemy"* (*"saffron, roasted gram flour,
hung curd and Awadhi mace"*, plus tiger-prawn dim sum).

## 2.2 Material language

| Token | Value | What it is materially |
|---|---|---|
| `--chic-crimson` | `#CD2653` | fresh cut |
| `--chic-crimson-dark` | `#8C1434` | cured depth |
| `--chic-burgundy` | `#4A0E17` | aged, the brand's ink |
| `--chic-noir` | `#180609` | the cold room |
| `--chic-linen` / `--chic-linen-warm` | `#FDFBF7` / `#F7EFE6` | butcher paper, the counter cloth |
| `--chic-gold` / `--chic-gold-bright` | `#C59A45` / `#FFA517` | the luxury register |
| `--gold-foil` | 5-stop `#FFE6A3 → #C59A45 → #FFF2CC → #9E742A → #E4C882` | stamped foil |

Same structural note as Gram Street's chrome: `--gold-foil` is a metallic multi-stop gradient
and reads as flat mustard unless its highlight travels. It *had* a `goldShimmer` animation whose
owning class was never applied to anything, so the foil has in fact never moved — see F2. The
token is kept for DC-1, which is the effect it was presumably meant for.

## 2.3 Typography & voice

**Playfair Display** (`--font-serif`), **Cinzel** (`--font-luxury`, the all-caps luxury face),
**Plus Jakarta Sans** (`--font-sans`). Cinzel is a Roman inscriptional capital — it reads as
*engraved*, which points motion toward stamping, pressing and etching rather than sliding.

Voice: precise, cold, credentialed. Product entries carry a `tag` field that is always a
certification or a method — *"Antibiotic Residue-Free"*, *"German Beechwood Smoked"*, *"Cracked
Peppercorn"*. Weights and prices are explicit (500 gm / ₹199, 200 gm / ₹230, 250 gm / ₹200).

## 2.4 Brand → motion principles

1. **Cold is slow.** The brand's single biggest claim is 0°C–4°C. Motion that is quick, bouncy
   or springy actively contradicts it. Deli Chic should move more slowly and with heavier
   easing than Gram Street — this is the clearest point of differentiation between the two
   sites and should be enforced, not softened.
2. **Reveal by inspection.** The viewer is invited to *look closer*. Pointer-driven reveal (the
   existing loupe) is on-brand in a way that autoplay decoration is not.
3. **Stamp, don't slide.** Cinzel plus foil plus certification tags means motion should settle
   with the authority of a stamp pressing down — short travel, firm arrival, no overshoot.
4. **Sequence is the story.** Cut → Cured → Inspected → Sealed is a process the brand sells.
   The existing `.bench` rail animates it; that is the right instinct.
5. **Never animate the meat.** Appetite imagery of raw protein must stay still and cold.
   Wobble, jiggle, pulse or warm colour-cycling on a product image would read as spoilage. This
   is a hard line.

---

# Part 3 — What already moves

Both pages load `/assets/vendor/gsap.min.js`, `/assets/vendor/ScrollTrigger.min.js` and
`/assets/brand-motion.js`, and both have their own inline systems.

**`assets/brand-motion.js`** provides three attribute-opt-in features:
`[data-bm="head"]` word-by-word 3D headline entrance (IntersectionObserver-driven, with
`will-change` applied in `play()` and removed after), `[data-bm="magnet"]` magnetic/tilting CTAs
(`gsap.quickTo`, suppressed on `(hover: none)`), and `[data-bm-depth]` parallax drift (the only
ScrollTrigger-bound tween in the file).

**Gram Street inline:** WebGL shader hero on `#fx` (`IntersectionObserver`-gated start/stop,
`ResizeObserver`-driven), the `.walk` 5-stage pinned walk-in with five `data-z0/data-z1/data-in/
data-out` depth layers, `.counter-scene` (nine keyframes: `csGlow csCone csMote csNeedle csLock
csPour csFill csSteam csSheen`), `.timeline` medallion rail (`is-live` / `is-cycling` gated),
`.chef-chart`, a 2D steam canvas, a scratch canvas, tilt-cards, a `.track` marquee (46s), and
a custom cursor.

**Deli Chic inline:** WebGL atmosphere canvas on `#deliAtmosphereCanvas`
(`powerPreference: 'low-power'`), the `.bwalk` 5-stage walk, `.bench` process rail
(`benchFillX/Y`, `benchStep`, `benchRing` — `is-live`/`is-cycling` gated), the `.loupe`
pointer magnifier, `.knife-glint` hover, and a `deliMarquee` ticker (38s).

Both pages carry a `prefers-reduced-motion` block that neutralises animation and transition
duration, hides the WebGL canvas, and force-resets `.reveal` / `[data-reveal]` to visible —
i.e. reduced motion yields the page, not a blank screen. That is correct and should be
preserved by anything added.

**Assessment: both sites are already well-motioned.** The gap is not quantity. Five specific
problems were suppressing the quality of what is already there, and they gated anything new.
All five are now fixed; Part 4 records each one and how it was verified.

---

# Part 4 — Findings that gate new motion (all fixed)

### F1 — ScrollTrigger was loaded on both pages and drove nothing — FIXED

`ScrollTrigger.min.js` is 43 KB, was fetched by both microsites, and was registered via
`gsap.registerPlugin`. The only ScrollTrigger-bound tween in the codebase is `depth()` in
`brand-motion.js`, which selects `[data-bm-depth]` — and **zero elements on either page carried
that attribute**. Both pinned walk-throughs are hand-rolled with `IntersectionObserver` and
scroll math, not ScrollTrigger.

So: 43 KB of parser-blocking vendor JS per page, for nothing.

**Fixed by dropping the `<script>` tag from both brand pages.** The file itself stays in
`/assets/vendor` because the portfolio's own `index.html` uses ScrollTrigger heavily and
genuinely needs it; only the two microsites were fetching it for nothing. `depth()` now returns
early when no element carries the attribute *and* when the plugin is absent, rather than handing
GSAP a `scrollTrigger` config it cannot honour. Verified in the browser: no request for
`ScrollTrigger.min.js` on either page, `gsap.min.js` still fetched, no page errors.

Wiring the depth layers instead (GS-2 / DC-2) was the other option and remains open — it costs
one `<script>` tag back on whichever page gets marked layers.

### F2 — Four decorations ran off-screen, against the repo's own rule — FIXED

`CLAUDE.md` states: *"nothing decorative runs while off screen."* The `is-live` / `is-cycling`
gating on `.timeline` and `.bench` honoured it. These did not:

| Declaration | Where | Duration |
|---|---|---|
| nine `cs*` keyframes on `.counter-scene` (hero) | `gram-street-coffee/index.html` | 4.2s–14s, infinite |
| `slide` on `.track` (the marquee) | `gram-street-coffee/index.html` | 46s, infinite |
| `pulse` on `#orbit .pulse` ×3, staggered | `gram-street-coffee/index.html` | 3.6s, infinite |
| `deliMarquee` on `.deli-track` (the ticker) | `deli-chic/index.html` | 38s, infinite |

Each paused on `:hover` only. Fixed with the pattern the pages already own — `is-live` toggled
from an `IntersectionObserver`, with the animation gated on it. Pausing rather than removing,
so a loop resumes its phase instead of restarting: the counter scene's 14s cycle should not
snap back to the portafilter lock every time it re-enters view.

Why the existing helper did not already cover them: Gram Street's comment above `live()`
claimed *"the 'now' pulse and the steam are ambient loops, so they run only while their section
is on screen"* — but `live()` was called on the timeline and the chef chart only, and no CSS
rule read `.is-live` on the chart, so that second call did nothing. The pulse and the steam were
never gated at all. The comment now lists the real set.

**An earlier draft of this table also listed `spinBeam` (both pages) and `goldShimmer`
(`deli-chic`). That was wrong, and wrong in a way worth recording**: their owning selectors,
`.conic-beam` and `.gold-foil-text`, appear nowhere in either page's markup. Neither animation
had ever run. Grepping for an `animation: … infinite` declaration finds what *could* loop, not
what does; the selector has to be matched against the markup, with the `<style>` block excluded
so a definition is not mistaken for a use. Both dead blocks — plus the `@property --beam-angle`
that only `.conic-beam` used — have been deleted. The `--gold-foil` token stays in `:root`:
DC-1 wants it, and `DESIGN.md` asks for the token rather than an invented value.

### F3 — One metal effect is painted, not composited — BOUNDED

`DESIGN.md` and `CLAUDE.md` both restrict animation to `transform` and `opacity`.
Background-position is painted on the main thread every frame and cannot be composited. Two
places do it:

| Declaration | Where | Trigger |
|---|---|---|
| `goldShimmer` on `.gold-foil-text` | `deli-chic/index.html` | never — the class is not in the markup (deleted) |
| `.chrome-text { background-position: calc(var(--mx, 0.3) * 100%) 0 }` | `gram-street-coffee/index.html` | every `pointermove` |

Only `.chrome-text` was live: `goldShimmer`'s owner is not in the markup (see F2), so the one
real instance is a background-clipped gradient on a `clamp(2.6rem, 7.5vw, 6rem)` headline being
repainted on every pointer sample. (Its custom property is correctly set on the section rather
than on `:root` — the trap `CLAUDE.md` documents — so only the paint cost remains.)

**Partly fixed.** A travelling specular highlight clipped to glyphs cannot be composited while
the gradient is clipped to the text, so the cost is bounded instead of removed: one write per
frame via `requestAnimationFrame`, and only while the pointer is inside that section. Measured
on the equivalent handler: 120 `mousemove` events dispatched back-to-back produced **1** style
write instead of 120. GS-1 is still the change that removes the paint altogether.

Gram Street's `csSheen` is **not** an instance of this: it already animates
`transform: translateX()` plus `opacity` and is the correct pattern. It is the model the other
two should be rewritten to — a clipped highlight element travelling by transform, which is both
cheaper and reads as more convincing metal than a sliding gradient.

### F4 — Two pointer-driven effects wrote layout properties every sample — FIXED

Not in the first draft of this study, and the most expensive thing on either site.

| What | Where | Was |
|---|---|---|
| the custom cursor | `gram-street-coffee/index.html` | `style.left` / `style.top` on **every `mousemove`, page-wide** |
| the loupe glass | `deli-chic/index.html` | `style.left` / `style.top` per sample, plus `getBoundingClientRect()` and `offsetWidth` read back each time |

`left` / `top` are layout properties: writing them forces layout, and the cursor handler did it
for the whole page at pointer-polling rate. The loupe did it during the one interaction the
brand actually sells — *"move cursor or drag finger across cut to inspect curing grain"* — and
compounded it by reading layout back on every sample too.

Both now sit at the origin and move by `translate3d()` fed from custom properties **on the
element** (not `:root` — that trap invalidates every element's computed style), coalesced to one
write per frame. The loupe's `getBoundingClientRect()` and glass-size read moved inside the
frame, so it is one layout read per frame rather than per sample. The loupe's
`background-position` write stays: that offset *is* the magnification, and it is confined to a
170px circle.

Verified in the browser: both track the pointer, neither writes inline `left`/`top`, both keep
`left: 0 / top: 0` computed, position appears in the transform matrix, the loupe still magnifies
and is still visible on hover.

Still outstanding, and deliberately not changed: `.custom-cursor` transitions `width` and
`height` on hover (16px → 60px). That is a layout animation, but it is hover-scoped, brief, and
on a `position: fixed` element with no children, so it cannot reflow page content. Converting it
to `scale` would thicken the 2px ring and scale the shadow — a visible change to the brand's
look, which is a design call rather than a fix.

### F5 — Gram Street handed smooth scrolling *back* under reduced motion — FIXED

`gram-street-coffee/index.html` declared `html { scroll-behavior: smooth }` at the top of the
stylesheet, and then declared it **again inside `@media (prefers-reduced-motion: reduce)`** —
re-enabling for the one person who had asked for less of it exactly the behaviour the block
exists to switch off. Deli Chic has had `scroll-behavior: auto !important` all along.

Now `auto !important` on both, with the `!important` for the documented reason: ScrollTrigger
restores this property inline. Verified by loading the page under `reducedMotion: 'reduce'` and
reading the computed value.

---

# Part 5 — Motion decisions: Gram Street Coffee

Ranked by brand payoff per unit of risk. Each is `transform`/`opacity` only, releases
`will-change` at rest, and is gated to on-screen.

### GS-1 — Chrome sweep on the counter surfaces *(highest payoff)*
**Why:** `--chrome` is the brand's signature material and currently reads as static grey.
Brand principle 1.4-2.
**What:** a clipped highlight band — a single absolutely-positioned element inside each chrome
surface, `transform: translateX(-120% → 120%)` with a long `ease-in-out` and a dwell, clipped by
the parent. Attach to the `.counter-scene` counter, the `.track li::before` dots and the chrome
rules in the Roastery section.
**Cost:** one composited layer per surface, active only while `is-live`.
**Reduced motion:** highlight parked at its natural specular position, no travel.
**Precedent:** `csSheen` on the counter scene already does exactly this correctly — GS-1 is
extending a pattern the page owns, not inventing one. The same rewrite retires the
pointer-repainted `.chrome-text` gradient (F3).

### GS-2 — Depth on the walk-in layers
**Why:** the `.walk` rail already carries `data-z0`/`data-z1` per layer — the depth intent is in
the markup and simply isn't driven on the non-pinned sections. Brand principle 1.4-1.
**What:** add `data-bm-depth` to the Roastery, Space and Cities section art so the existing
`depth()` in `brand-motion.js` drives them. This also makes the ScrollTrigger payload earn its
place (F1).
**Cost:** none new — the code already exists and is currently dead.
**Reduced motion:** `depth()` already returns early on `reduced`.

### GS-3 — Pour-settle for the three pillars
**Why:** principles 1.4-4 and 1.4-5 — coffee, matcha and gelato are three different fluids and
should not share one entrance.
**What:** three timing variants on the pillar cards, same transform vocabulary:
- Coffee — a short fall with a heavy settle (`cubic-bezier(.2,.8,.2,1)`, ~520ms), like a shot
  landing.
- Matcha — a slower bloom from scale `0.97` + opacity, no vertical travel (~720ms,
  `ease-out`), like whisked foam rising.
- Gelato — the slowest, a small upward lift with a soft arrival (~820ms), like a scoop setting.

**Cost:** three transitions on three elements, fired once by the existing reveal observer.
**Reduced motion:** all three resolve instantly to final state.

### GS-4 — Instrument readouts count up
**Why:** principle 1.4-3. The precision numbers (9 bar, 18.5 g, 65°C, 12 ml/s, 1,450 m) are
already on the page as static text. A gauge that *settles onto* its reading is the single most
on-brand effect available to this site.
**What:** on first intersection, tick the numeral to its final value over ~900ms with an
easing that decelerates hard, and let the existing `csNeedle` needle land in sync.
`font-variant-numeric: tabular-nums` so the box does not reflow.
**Cost:** one `requestAnimationFrame` loop per readout, self-terminating.
**Reduced motion:** final value rendered immediately, no count.

### GS-5 — Bricolage weight shift on nav hover
**Why:** Bricolage Grotesque is a variable face; the brand already pays for the variable axes.
**What:** `font-variation-settings` weight/width shift on the seven nav labels (Flavours, Craft
& Roastery, D2C Roasts, Story, The Space, Network, Locations) on hover and on active view.
**Caveat:** variable-axis animation is not compositable. Keep it to the nav only — seven
elements, hover-triggered, never during scroll — and never apply it to body text.

### GS-6 — Gate and fix what already runs
Done. F2 gating on `.counter-scene`, `.track` and `#orbit .pulse`; F4 on the custom cursor; F5
on the reduced-motion block; dead `.conic-beam` / `spinBeam` removed. Not glamorous; it is what
makes GS-1 through GS-5 affordable.

---

# Part 6 — Motion decisions: Deli Chic

Everything here runs **slower and heavier than its Gram Street counterpart**, on purpose
(principle 2.4-1).

### DC-1 — Foil stamp entrance for Cinzel headings *(highest payoff)*
**Why:** principles 2.4-3 — Cinzel is an inscriptional capital and the brand's gold is a foil.
**What:** replace the generic reveal on the `--font-luxury` headings with a press: from
`scale(1.04)` + `opacity: 0` to `scale(1)` + `opacity: 1` over ~420ms with a firm
`cubic-bezier(.16,1,.3,1)` and **no overshoot**, followed by a single clipped
`translateX` foil highlight travelling once across the letterforms (never looping).
**Cost:** one transition plus one one-shot highlight per heading.
**Reduced motion:** final state, no press, no highlight.
**Note:** `goldShimmer` and its `.gold-foil-text` class have been deleted as dead code (F2), so
DC-1 builds the foil effect for the first time rather than replacing a working one.

### DC-2 — Cold-room depth
**Why:** 2.4-1. Slow parallax reads as cold and heavy; it is the cheapest way to make the
temperature claim felt rather than stated.
**What:** `data-bm-depth` on the hub-map art, the heritage section imagery and the boucherie
backdrop, with a **smaller amplitude and longer scrub than Gram Street's** (`depth()` already
takes the amount as the attribute value — use ~8 against Gram Street's ~12–16).
**Cost:** none new (same dead-code-becomes-live point as GS-2).

### DC-3 — Loupe gains a grain response
**Why:** the copy already promises it — *"inspect curing grain & cellular density"* — and
2.4-2 makes pointer-driven reveal the most on-brand interaction on the site.
**What:** inside the existing `.loupe-glass`, add a subtle scale-up of the underlying cut
(`transform: scale(1.18)` on the clipped layer, not a filter) so the magnifier actually
magnifies, and a slight `translate` lag on the glass itself via `gsap.quickTo` so it feels like
glass with mass rather than a cursor-locked sprite.
**Cost:** two quickTo tweens, already the pattern `magnetic()` uses.
**Reduced motion:** loupe stays, lag and scale drop to zero (the existing block already
neutralises `.loupe-container` transforms).

### DC-4 — Cold-chain thermometer on the hubs section
**Why:** 0°C–4°C is the brand's headline claim and currently appears only as text. This is
Deli Chic's equivalent of GS-4, and more central to its brand than GS-4 is to Gram Street's.
**What:** a thin vertical rail beside the NCR hub list; on intersection a `scaleY` fill rises
and settles between the 0° and 4° marks, slowly (~1.4s), and stops. One shot, not a loop —
a thermometer that oscillates says the cold chain is unstable.
**Cost:** one `scaleY` transition on one element.
**Reduced motion:** fill rendered at final height.

### DC-5 — Sequence lock on the process rail
**Why:** 2.4-4. `.bench` already cycles Cut → Cured → Inspected → Sealed on a 17.2s infinite
loop while in view.
**What:** change the loop to a **single pass that latches**. The four steps light in sequence
once, then all four stay lit. A process the brand sells as finished should not visibly restart
from "Cut" every 17 seconds; the current loop subtly implies the work is never done. Keep the
`is-live` gating, drop `infinite`.
**Cost:** negative — removes a permanently-running animation.

### DC-6 — Two-lineage divergence on the larder filters
**Why:** 2.4-3 and the German/Awadhi duality in 2.1. The `DELI_PRODUCTS` array already carries
`category` (`poultry`, `charcuterie`, …).
**What:** when the larder filters, let charcuterie cards settle with the firm European stamp
easing of DC-1, and Awadhi/marinade cards settle with a slightly longer, softer arrival. Same
transform vocabulary, two timings — the lineage difference is felt, never labelled.
**Cost:** one extra easing variable; FLIP-free, since filtering already re-renders.

### DC-7 — Gate and fix what already runs
Done. F2 gating on the `deliMarquee` ticker; F4 on the loupe; dead `.conic-beam` / `spinBeam`
and `.gold-foil-text` / `goldShimmer` removed.

---

# Part 7 — Explicitly not doing these

Listed because each is a plausible-looking idea that would damage one of the two brands.

- **No motion on raw-protein imagery** (Deli Chic, 2.4-5). No pulse, wobble, breathing scale or
  warm colour cycling on a product photo. Reads as spoilage and undermines "Chilled, Never
  Frozen."
- **No springy / bouncy / overshoot easing on Deli Chic anywhere.** Direct contradiction of the
  cold-chain claim.
- **No cursor trail, no confetti, no sparkle or particle burst on either site.** Gram Street's
  precision claim (1.4-3) and Deli Chic's inspection claim (2.4-2) are both claims to
  seriousness.
- **No Lenis / smooth-scroll library on either microsite.** `CLAUDE.md` documents both traps
  already paid for here: native `scroll-behavior: smooth` fights Lenis, and `overflow-x: hidden`
  on `body` silently breaks every pinned ScrollTrigger. Both walk-throughs work today on native
  scroll; introducing a scroll hijacker to add polish would risk the two most valuable scenes on
  the two sites.
- **No third pinned scroll-through on either page.** Each already has one 5-stage walk. A second
  pin competes with the first for the same attention and the same scroll budget.
- **No copy taken from any reference site.** Per `CLAUDE.md`: form only. Every string referenced
  in this document already exists in `gram-street-coffee/index.html` or
  `deli-chic/index.html`.

---

# Part 8 — Implementation and verification notes

Order of work: **Part 4 findings first** (F1, F2, F3), then the ranked items. The findings are
what make the additions cheap; done in the other order, each new effect lands on a page already
spending frames on off-screen decoration.

Mechanics, from `CLAUDE.md` and `DESIGN.md`:

- `transform` and `opacity` only. Not `background-position`, not `filter`, not `top/left`.
- `will-change` goes on at play time and comes off at rest — the pattern `headlines()` in
  `brand-motion.js` already implements, including the note on why it is not set at split time.
- A `transition:` shorthand silently resets `transition-delay`. Any stagger written to a custom
  property must also be set inline.
- GSAP owns `transform` on elements it drives; use the separate `translate` / `rotate`
  properties for CSS depth on those elements, since they compose.
- Pointer-driven custom properties go on the element, never on `:root`.
- `brand-motion.js` is shared by both pages — a change there lands on both brands. Per-brand
  differences (the whole point of the Deli Chic timing being slower) belong in the page's own
  styles or in the attribute value, not in the shared file.

Verification, per `CLAUDE.md`:

- `npm run build` first — the suites drive `www/`, and a stale `www/` has already made a fix
  look like a no-op here more than once.
- Serve `www/` on 8099, then `node scripts/motionfix.js` and `node scripts/turn-by-turn.js`.
- Measure the rendered page rather than reading the diff. Specifically: confirm with a scroll
  to the footer that no `cs*`, `pulse`, `deliMarquee` or marquee animation is still running once
  its section is out of view — that is the check F2 exists for, and it cannot be confirmed from
  source. It is now automated: `scripts/brand-motion-gating.js` drives both pages in a real
  browser, scrolls each loop's section clear of the viewport and asserts the animation is paused
  or gone, and asserts the pointer-driven effects write no inline `left`/`top`.
- Re-check both pages with `prefers-reduced-motion: reduce` forced on. The bar is the one the
  existing block sets: the page still works, nothing is left mid-transition, nothing is left
  invisible.

---

# Part 9 — Verification state

## The guard

`scripts/brand-motion-gating.js` (`npm run test:brandmotion`) covers all five findings on both
pages in a real browser. 22 checks: every ambient loop running in view and idle out of it, the
gate preserving phase rather than restarting, both pointer effects moving by transform with no
inline `left`/`top`, write coalescing, the loupe still magnifying, neither page fetching
ScrollTrigger, and reduced motion keeping `scroll-behavior: auto` with the headline visible.

Following the house convention from `scripts/motionfix.js`, each check is paired with a
mutation that undoes the fix, so the suite can be shown to fail when the bug returns:
`MUT=no_gate`, `gate_restarts`, `cursor_layout`, `loupe_layout`, `no_coalesce`, `rm_smooth`.

One note for whoever edits those mutations next. `addInitScript` runs **before the document
exists** — `document.head` is null and `getElementById` returns null — so a mutation applied
straight from there silently does not apply, and the suite reports a false PASS for the very bug
it is meant to catch. That happened on the first run of this suite: `MUT=cursor_layout` came
back 22/22. Every mutation is now deferred to `DOMContentLoaded` plus a tick, so it lands after
the page's own script.

## Suite results on this change

All 22 existing suites were run, plus the new one. Three suites fail, and all three failed
identically before this change:

| Suite | Result | Status |
|---|---|---|
| `test:brandmotion` | 22/22 | new |
| `motionfix` | 8/8 | passing |
| 19 others | passing | — |
| `test:cards` | 9/12 | **pre-existing**, portfolio only |
| `test:overlap` | 6/10 | **pre-existing**, portfolio only |
| `test:redirects` | 6/7 | **pre-existing** |

`test:cards` and `test:overlap` load `index.html`, `lifecycle-os-*` and `growth-school` — a page
set disjoint from anything this change can reach. In the built tree `brand-motion.js` is
referenced only by the two microsites, and `ScrollTrigger.min.js` now only by `index.html`,
which genuinely uses it. So those two suites cannot see these edits.

`test:redirects` fails on *"each identity link has one spelling site-wide"*, because three phone
numbers exist across the site: Anchit's own on the portfolio pages, and one each for Deli Chic
and Gram Street. Confirmed identical on `main` by stashing, rebuilding and re-running. Each
brand legitimately has its own number, so the guard's site-wide rule is what needs scoping —
left alone here, because narrowing a guard's definition of correct is a decision, not a fix.
