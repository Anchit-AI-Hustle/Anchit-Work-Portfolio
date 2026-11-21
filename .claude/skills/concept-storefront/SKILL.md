---
name: concept-storefront
description: Build or update a concept storefront or redesign of a real brand's website (Xazina, Deli Chic, Gram Street Coffee and any new one). Use whenever a page reproduces or reimagines a real business's shop, menu, catalogue or site as portfolio work.
---

# Concept Storefront Workflow

A concept storefront is Anchit's redesign of a real business, shown as portfolio
work. It must read as his work and never as the brand's own site, it must be
honest about what is real and what is a demo, and it must stay fast. Every step
below was a real gap on Xazina, Deli Chic or Gram Street, found by a hiring
panel or reported by Anchit as "buggy and laggy".

1. **Credit and search**
   - Shared concept bar at y=0, first thing after the skip link: "Concept
     storefront by Anchit Tandon, not affiliated with <brand>", then Portfolio,
     Design notes (`#design-notes`), Resume (`/assets/resume.pdf`) and Email
     Anchit (`mailto:` with a subject naming the concept). Copy the markup and CSS
     from `deli-chic/index.html` (`class="concept-bar"`). It is neutral black and
     cream, never the brand's palette, and any fixed header below it is offset by
     the bar's height while the bar is on screen.
   - Footer repeats the credit with Email Anchit. Never a bare "(c) <brand>" line.
   - `seo.config.json`: `"robots": "noindex,follow"`, title and description
     saying "concept by Anchit Tandon" (description 60-160 characters), and the
     route left out of `sitemapExtraUrls`. Run `node scripts/seo-inject.mjs`,
     then revert any unrelated page it rewrote.
   - No LocalBusiness / Store / CafeOrCoffeeShop JSON-LD: it tells search
     engines the page is the business.
   - Add or update its card in the portfolio's projects (Demo badge), linking the
     storefront and its design notes.

2. **Design notes (`<section id="design-notes">`), before the footer**
   - Problem, What I kept, What I changed, Hypothesis, How I would measure it
     (labelled "Intended, not measured", the concept has no traffic), What is
     real and what is a demo, How checkout works here.
   - First person, specific, in the page's own type and palette (tokens such as
     `--dn-bg`, `--dn-ink`, `--dn-accent`).
   - Facts only from the repo: the build's own counts (fill them in at build time
     so they cannot go stale), the brand's public catalogue, or labelled design
     hypothesis. If the original site was captured, say what was kept from it and
     label those parts of the page "Kept from <brand>.com" against "New in this
     concept".

3. **Honest content**
   - A status that is static is labelled "Sample status". No pulsing "live" dot
     on static data.
   - A form or RSVP that stores nothing says so in its confirmation ("Demo only:
     this concept stores no emails"). A checkout that sends nothing says so, and
     any WhatsApp draft starts "DEMO from anchit-tandon.com, not a real order".
   - Claims about real people, plans or products that the repo cannot source are
     labelled "Illustrative copy, not confirmed by <brand>" or removed. Claims
     from the brand's own catalogue are attributed to it in the design notes.
   - Payment partners, promo codes and phone numbers the concept cannot verify
     are labelled sample or removed.
   - Shopper words only: no frame counters, hex codes, "telemetry", gain
     percentages, "cellular density", 3D/4D/5D labels or debugging terms on
     screen. Audio controls say what they play.

4. **Conversion basics**
   - One primary call to action per hero, the shop; the rest are quiet.
   - On a phone, the first priced product is reachable in a short scroll.
   - The consent banner is neutral and asks after the first scroll (already
     handled in `assets/consent.js` for the three storefront routes; add a new
     route to its `STOREFRONT` pattern).

5. **Runtime (DESIGN.md, Motion, Runtime budget)**
   - Idle is idle: shaders and canvases move on load, scroll, pointer and touch,
     then hold their last frame. A self-playing film drops to 30fps on phones
     and 12fps when the visitor is still.
   - Pinned scroll stories step between whole scenes; check the last pose shows
     what its caption names.
   - No backdrop blur on phones and tablets or over moving content; no infinite
     SVG loops on phones; per-frame values on the element that uses them.
   - Reduced motion: every wake-up listener returns early.

6. **Verify before shipping**
   - `npm run build`, then serve `www/` on 8099 and run `npm run test:storefronts`
     and `npm run test:storefront-motion` (add a new storefront to both), plus
     `test:seo`, `test:redirects`, `test:nogithub` and `test:nodash`.
   - Check 390, 820 and 1440, and every width from the nav breakpoint to 1440
     after any header copy change.
   - Reload part-way down a pinned section and scroll back up into it: both land
     on a whole scene.
   - Once live, hard-refresh before judging a screenshot; compare a reported
     screenshot's copy with the live HTML before debugging it.
   - Run `docs/LAUNCH-CHECKLIST.md`, including its concept-site section.
