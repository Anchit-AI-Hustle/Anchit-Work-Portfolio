# DESIGN.md — anchit-tandon.com

Machine-readable brand + UI system for this repo. AI agents and contributors MUST
follow these tokens for all styling. Never hardcode a colour that isn't here, and
never introduce a framework utility colour (e.g. `hover:border-gray-500`) where a
token exists.

> Format inspired by the DESIGN.md convention (Google Labs): machine-readable
> tokens first, human rationale second, so generated UI stays on-brand.

## Brand vibe

Editorial, warm, high-contrast dark. Think a well-set magazine spread that
happens to be software: near-black paper, warm cream ink, a single confident
orange for action, gold for accent and craft. Serif display for voice, clean sans
for body, mono for labels and metadata. Restrained motion. Never neon, never
corporate-blue, never playful-pastel.

## Tokens

### Colour — dark (canonical theme)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0F0D0A` | Page background (near-black, warm) |
| `--bg-elev` | `#1A1814` | Cards, panels, elevated surfaces |
| `--bg-deep` | `#060503` | Insets, inputs, wells |
| `--ink` | `#FBF5EC` | Primary text (warm cream) |
| `--ink-dim` | `#A39E94` | Secondary text |
| `--ink-mute` | `#5A554E` | Tertiary text, placeholders |
| `--rule` | `#2A261F` | Hairline borders |
| `--rule-strong` | `#3D3830` | Emphasised borders, input outlines |
| `--primary` | `#FF6940` | THE action colour: buttons, links, focus |
| `--primary-deep` | `#FF4D1F` | Hover/active/gradient end of primary |
| `--primary-soft` | `rgba(255,105,64,.12)` | Primary tint fills |
| `--accent` | `#c9a96e` | Gold accent: highlights, `<em>`, craft details |
| `--accent-warm` | `#FFB736` | Brighter gold for badges/glow |

### Colour — semantic

| Token | Value | Use |
|---|---|---|
| `--good` | `#FFB736` | Success/positive state (kept warm, not green) |
| `--warn` | `#FF8A3D` | Caution |
| `--danger` | `#FF4D1F` | Error/destructive |

### Typography

| Token | Value |
|---|---|
| `--font-display` | `'Fraunces', 'Times New Roman', serif` |
| `--font-body` | `'Inter', -apple-system, BlinkMacSystemFont, sans-serif` |
| `--font-mono` | `'JetBrains Mono', ui-monospace, monospace` |

Rules:
- All headings (`h1`–`h3`, display type) use `--font-display`, weight 400–600.
- Body copy uses `--font-body`, weight 300–400, line-height ~1.6.
- Eyebrows, labels, metadata, badges, counters use `--font-mono`, uppercase,
  letter-spacing `.08em`–`.14em`, 10–12px.
- Emphasis (`<em>`) renders italic in `--accent` (gold), not orange.

### Spacing scale (px)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 88`

Section padding uses `--gutter: clamp(20px, 3vw, 48px)`.

### Radius

| Token | Value | Use |
|---|---|---|
| `--r-sm` | `8px` | Chips, small controls |
| `--r-md` | `12px` | Buttons, inputs |
| `--r-lg` | `16px` | Cards |
| `--r-xl` | `20px`–`24px` | Panels, media frames |
| `--r-pill` | `99px` | Pills, badges, icon buttons |

### Elevation

| Token | Value |
|---|---|
| `--shadow-sm` | `0 2px 8px rgba(0,0,0,.3)` |
| `--shadow-md` | `0 12px 32px rgba(0,0,0,.4)` |
| `--shadow-lg` | `0 32px 64px rgba(0,0,0,.5)` |

## Components

- **Button (primary):** `background: linear-gradient(100deg, var(--primary), var(--primary-deep))`, text `#1a0d06`, radius `--r-md`, padding `11px 18px`, `translateY(-1px)` + orange glow on hover.
- **Button (ghost):** transparent, `1px solid var(--rule-strong)`, text `--ink`; border becomes `--primary` on hover.
- **Card:** `--bg-elev`, `1px solid var(--rule)`, radius `--r-lg`, `--shadow-md`; border → `--primary` on hover (never a grey utility).
- **Input:** `--bg-deep`, `1px solid var(--rule-strong)`, radius `--r-md`; border → `--primary` on focus; placeholder `--ink-mute`.
- **Badge/pill:** `--font-mono`, uppercase, radius `--r-pill`, tinted background from the relevant token at 12–20% alpha.
- **Focus (required):** every interactive element must show `outline: 2px solid var(--primary); outline-offset: 2px` on `:focus-visible`.

## Motion

- Transitions 150–260ms, `ease` or `cubic-bezier(.4,0,.2,1)`.
- Hover lift is at most `translateY(-2px)`.
- Every animation must be disabled under `@media (prefers-reduced-motion: reduce)`.

## Accessibility

- Body text on `--bg` must meet WCAG AA (`--ink`/`--ink-dim` pass; `--ink-mute` is for non-essential text only).
- Never use colour alone to convey state — pair with a label or icon.
- All images need meaningful `alt`; decorative ones get `alt=""` or `aria-hidden`.

## Known inconsistency to migrate (do not copy)

`--accent` is currently declared with **conflicting values** across scopes in
`index.html`: teal `#2EE5AC` / `#00B584` in the global theme, and golds
`#f5b531` / `#E8B14E` / `#A87B22` in later section scopes. **Gold (`#c9a96e`,
bright `#FFB736`) is canonical per this file**; the teal values are legacy and
should be migrated, not extended. Until that migration lands, do not add new
teal accents.

## How agents should use this file

1. Read this file before writing any styles.
2. Use the CSS variables that already exist in the page; add a token here first
   if something is genuinely missing.
3. Never introduce raw hex values in component styles, and never use framework
   palette utilities (`gray-500`, `blue-600`, …) for brand surfaces.
4. Match the surrounding file's conventions — this repo is intentionally
   single-file per app, with styles in the existing `<style>` block.
