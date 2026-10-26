# Ayushi Rawat — "Ivory & Raspberry" design system

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
