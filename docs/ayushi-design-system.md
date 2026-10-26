# Ayushi Rawat — "Power Editorial" design system

Applies to everything under `/ayushi-rawat`, plus the job agent at `/ayushi-rawat-auto-job-applier`. It is deliberately
**not** the black/orange/gold system in `DESIGN.md`, which is Anchit's personal
brand. Ayushi's pages carry her own identity.

Source: `ayushi-rawat/ayushi.css` (tokens + components) and `ayushi-rawat/ayushi.js`
(reveal, impact bars, deep-link landing). The resume keeps its own
`ayushi-rawat/styles.css` for the printable sheet but takes its tokens from `ayushi.css`.

## Personality → design decisions

| She is… | So the system… |
|---|---|
| Decisive, gets the job done | One action colour (rouge) used only for primary actions and section markers. No competing accents. |
| Senior-presence, editorial | Bodoni Moda display type: high-contrast, fashion-magazine authority. Italic blush for emphasis. |
| Numbers-driven (Salesforce, Tableau, 50+ dashboards) | Data components are first-class: KPI tiles in champagne numerals, an impact bar chart on one shared scale, labelled directly with the source stated. |
| Creative + operator | Ivory "paper" spread band breaks the dark pages like a magazine spread; mono labels read like a dashboard. |

## Tokens

| Token | Value | Use |
|---|---|---|
| `--a-bg` | `#0d0b0c` | Page background |
| `--a-surface` / `--a-surface-2` | `#161314` / `#1f1a1c` | Cards, tiles, bar tracks |
| `--a-paper` | `#f4ede3` | Ivory spread band |
| `--a-ink` / `--a-dim` / `--a-mute` | `#f7f1e8` / `#b9afa7` / `#81766f` | Text tiers |
| `--a-rouge` | `#f0435c` | Labels, eyebrows, focus ring on dark (5.3:1) |
| `--a-rouge-deep` | `#c8102e` | Primary buttons, white text on it (5.9:1) |
| `--a-rouge-ink` | `#9e1530` | Rouge on paper |
| `--a-champagne` | `#d9b779` | Numerals and metadata |
| `--a-blush` | `#f0b9b0` | Italic emphasis in headlines |

Type: `--a-display` Bodoni Moda · `--a-body` Manrope · `--a-mono` IBM Plex Mono.

## Rules

- Rouge is for action and structure, never decoration. One power button per view.
- Every number shown must come from her resume; data visuals state their source.
- Strategy content is labelled as a plan wherever it appears.
- Motion: `transform` and `opacity` only; everything is visible with reduced motion or no JS.
- Links use absolute `/ayushi-rawat/…` paths.
