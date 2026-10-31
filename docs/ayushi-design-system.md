# Ayushi Rawat, "Ivory & Raspberry" design system

Applies to everything under `/ayushi-rawat`, plus the job agent at
`/ayushi-rawat-auto-job-applier`. It is deliberately **not** the
black/orange/gold system in `DESIGN.md`, which is Anchit's personal brand.
Ayushi's pages carry her own identity, and they are light.

Source: `ayushi-rawat/ayushi.css` (tokens + components) and
`ayushi-rawat/ayushi.js` (reveal, impact bars, deep-link landing). The resume
keeps `ayushi-rawat/styles.css` for its printable sheet; the block at the end
of that file moves its screen chrome onto these tokens.

This replaced a dark "Power Editorial" system on 26 Oct 2026, after the
feedback that it read as too dark.

## Personality → design decisions

| She is… | So the system… |
|---|---|
| Decisive, gets the job done | One action colour, raspberry, used for primary actions, emphasis and section markers. Nothing competes with it. |
| Senior presence, editorial | DM Serif Display headlines at magazine-cover scale, with italic raspberry for the word that matters. |
| Numbers-driven (Salesforce, Tableau, 50+ dashboards) | Data components are first-class: KPI tiles with figures set large, an impact bar chart on one shared scale, labelled directly with the source stated. |
| Warm, people-facing (200+ trained) | Warm white paper, soft shadows, rounded cards, and a blush band that breaks up the page like a feature spread. |

## Tokens

| Token | Value | Use |
|---|---|---|
| `--a-bg` | `#fffcf8` | Page background (warm white) |
| `--a-surface` | `#ffffff` | Cards, tiles, inputs |
| `--a-surface-2` | `#f6f0e8` | Sand sections, bar tracks |
| `--a-band` | `#f8eaf0` | Blush feature band (About, closing CTA) |
| `--a-ink` / `--a-dim` / `--a-mute` | `#1a1720` / `#5b5462` / `#766e79` | Text tiers; all pass WCAG AA on white and sand |
| `--a-rule` / `--a-rule-2` | `#ece4da` / `#ddd2c5` | Hairlines, outlines |
| `--a-accent` | `#c2185b` | Raspberry: primary buttons (white text 5.9:1), eyebrows, emphasis |
| `--a-accent-ink` | `#9c1149` | Raspberry text on the blush band |
| `--a-accent-soft` | `#fce7ef` | Tints, highlight marker, warnings |
| `--a-gold` | `#8a5a00` | Labels and metadata (6:1 on white) |

Type: `--a-display` DM Serif Display · `--a-body` and `--a-caps` Plus Jakarta Sans.

## Rules

- Raspberry is for action and emphasis, never decoration. One power button per view.
- Every number shown must come from her resume; data visuals state their source.
- Strategy content is labelled as a plan wherever it appears.
- Motion: `transform` and `opacity` only; everything is visible with reduced motion or no JS.
- Links use absolute `/ayushi-rawat/…` paths.
- Hero portrait: drop her photo at `ayushi-rawat/assets/ayushi-portrait.webp`
  and follow the note in `ayushi-rawat/index.html`. Until then the raspberry
  AR cover stands in.

## Brand case studies (`/ayushi-rawat/studies/*`)

Each study is one page in `ayushi-rawat/studies/`, styled by `ayushi-rawat/study.css`
on top of the tokens above. The hub at `/ayushi-rawat/case-studies` lists them
first and keeps her delivered work below as the track record.

Every study follows the same order, so a recruiter can compare them:
hero with the independence note → the short version → what the brand runs today
(sourced facts) → where the value leaks → "How might we" → three plays (trigger,
channels, offer, stop rule, sample copy) → measurement with a holdout → 90-day
rollout → riskiest assumptions → why she can run this → sources → next study.

Rules:

- **Independent and labelled.** Each page carries the note that it is not
  affiliated with, commissioned by or reviewed by the brand.
- **Every brand figure has a numbered, dated source** that was opened and read.
  Arithmetic on published figures is labelled as hers. What could not be found
  is listed under "Not public, so not used".
- **No results are claimed.** Plays are proposals; metrics are decision rules,
  not forecasts. Sample copy sits in `.s-phone` mocks marked as written for
  the study, and its numbers are illustrative.
- **"Why she can run this" uses only her resume.** Grep `resume.html` before
  adding a claim.
- Message mocks use the `--s-device*` and `--s-bubble*` properties on `.s-phone`;
  on phones, `.s-table` rows stack into labelled cards from each cell's
  `data-label`.

## Motion: "couture" (3D, 4D, 5D)

`ayushi-rawat/couture.css` + `couture.js` on her recruiter pages, and
`ayushi-rawat/runway.css` on every page in her set (including the Growth
Studio and the course). Read "3D / 4D / 5D" as depth, depth + time, and depth +
time + the visitor:

| Layer | Effect | Where |
|---|---|---|
| 3D | **Drape**: blocks hang from their top edge and fall into place (`rotateX`), size-guarded so no tall wrapper is ever held off screen | every `.a-reveal` shorter than 85% of the viewport |
| 3D | **Swatches**: KPI tiles turn in on their left edge, staggered inline | `.a-tiles` |
| 4D | **Runway**: cross-document view transitions; the old page walks off into depth, the new one walks on. The nav keeps its own `view-transition-name` | all pages in the set |
| 4D | **Stitching**: the rule before each eyebrow sews itself in | `.a-eyebrow` |
| 4D | **Cover drift**: the hero cover eases back and shrinks a touch as it scrolls away, only while visible | `.hero .cover` |
| 5D | **Satin**: cards lean away from the pointer with a sheen that follows it (individual `rotate`, so it composes with the hover lift) | fine pointers only |
| 5D | **Cover parallax**: the cover tilts with the pointer and the A and R drift at two depths | `.hero` |

Rules: transform/opacity (and the individual `rotate`/`translate`/`scale`)
only; per-element custom properties, never on `:root`; no `will-change` at rest;
nothing runs off screen; under `prefers-reduced-motion` none of it exists. The
two heavy pages (Growth Studio, course) also opt in to view transitions with an
inline `<style>` at the top of `<head>`: from the stylesheet alone, about one
arrival in four painted before it applied and the transition was skipped.

## Navigation between her pages

`ayushi-rawat/tabs.css` is a tab bar on her private pages (Growth Studio,
course, job agent) linking all six: Portfolio, Case studies, Resume, Growth
Studio (`/marketing-101-for-ayushi#growth`), Brand course, Job agent. The current
tab is centred on narrow screens. Her recruiter pages keep their own nav and
carry one footer link to the Growth Studio, so every page has a way there and
back. The Growth Studio may be linked only from her pages, never from Anchit's;
`npm run test:routes` enforces that.
