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

### Type scale (px)

A major third (1.25) from a 16px base. Editorial ratio, and its top step lands
on the 60px the hero already used.

| Token | Value | Use |
|---|---|---|
| `--fs-micro` | `11px` | Mono micro-labels, stamps |
| `--fs-label` | `12px` | Mono eyebrows, metadata, badges |
| `--fs-sm` | `14px` | Captions, dense secondary copy |
| `--fs-body` | `16px` | Body |
| `--fs-lead` | `20px` | Ledes, large body |
| `--fs-h3` | `25px` | |
| `--fs-h2` | `31px` | |
| `--fs-h1` | `39px` | |
| `--fs-display` | `61px` | Hero |

**Pick a step; never invent one.** This scale exists because there wasn't one:
an audit of a single home-page viewport found **11 distinct sizes** — 9, 11, 12,
14, 15, 16, 18, 19, 20, 24, 60. 15-against-16 and 18/19/20 are not hierarchy,
they are near-identical steps that read as carelessness, and nothing sat between
24 and 60 at all. It is 7 now, every one a named step.

Two specific traps that produced that spread:

- **9px mono labels.** Six rules sat below this file's own 10–12px floor. They
  were the smallest type on the page and the hardest to read.
- **Framework size utilities.** The hero used Tailwind's `text-lg` /
  `text-2xl` / `text-6xl` — 18 / 24 / 60px, answering to Tailwind's ratio, not
  ours. The same rule that bans framework *palette* utilities applies to sizes:
  use the token.

### Spacing scale (px)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 88` — as tokens `--sp-1` … `--sp-11`.

The same audit found **170 off-scale paddings and gaps** on the main layout
blocks (22px, 18px, 7px …). It is 4 now.

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

The rule that governs everything else: **animate `transform` and `opacity`, and
nothing else.** Those two are composited. Anything else — `box-shadow`,
`filter`, `background-position`, `top`, `height`, `clip-path`, `width` — is
re-rasterised on every frame of the tween, and this page has paid for each of
them at least once. A homepage scroll went from 26ms a frame to 17ms almost
entirely by obeying this.

- Transitions 150–260ms, `ease` or `cubic-bezier(.16,1,.3,1)` for arrivals.
- Hover lift is at most `translateY(-2px)`.
- `will-change` is a claim on a compositor layer. Scope it to `:hover`/`:active`
  or add it for the duration of an animation and take it off again — never
  leave it on at rest.
- Nothing decorative runs forever while off screen. The ambient governor in
  `assets/cinematic.js` gives an element its looping animation only while it is
  near the viewport and takes the layer back afterwards.
- Every animation must be disabled under `@media (prefers-reduced-motion: reduce)`
  and under `html[data-motion="off"]`, which the Motion toggle sets.

### Arrival choreography

Blocks arrive **one at a time**, and their children arrive one at a time inside
them. Both are queues, not CSS delays on a burst: a delay staggers things that
have already all started, a queue makes each one wait its turn.

- Six entrance variants (`.cin-v1`–`.cin-v6` / `.reveal.rv-v1`–`rv-v6`), each
  dimensional — its own `perspective()` and a real `translateZ`.
- Assigned so no block matches the one before or after it. A plain 1..6 cycle is
  a pattern people see after two screens.
- Never assigned to anything taller than the viewport. These entrances hold an
  element off in 3D until it plays, which is an arrival for a card and a blank
  screen for a page wrapper.
- Below 560px the sideways entrances travel 16px, not 58px: a block is the width
  of a phone, and 58px puts its first characters off the edge.

### Surface treatments

- Panels (≥90px tall) get a holographic sheen as they arrive.
- Smaller blocks get a hairline wipe along the baseline instead. A light
  sweeping a 44px label is noise, not an effect.
- Anything taller than 72% of the viewport gets neither — a sweep that big is a
  screen wipe.
- Pointer specular tracks the cursor across a panel. `--mx`/`--my` are written
  on the **element**, never on `:root`: a custom property on the document root
  re-resolves the computed style of every element on the page, once per pointer
  frame.

## Accessibility

- Body text on `--bg` must meet WCAG AA (`--ink`/`--ink-dim` pass; `--ink-mute` is for non-essential text only).
- Never use colour alone to convey state — pair with a label or icon.
- All images need meaningful `alt`; decorative ones get `alt=""` or `aria-hidden`.

## Known inconsistency to migrate (do not copy)

`--accent` is still declared with **conflicting values** across scopes: teal
`#2EE5AC` / `#00B584` in some global themes, and golds `#f5b531` / `#E8B14E` /
`#A87B22` in later section scopes. **Gold (`#c9a96e`, bright `#FFB736`) is
canonical per this file**; the teal values are legacy and should be migrated,
not extended. Do not add new teal accents.

Counted at the time of writing, so the next person knows the size of the job
rather than guessing: `#2EE5AC` appears 4 times in `index.html` and across 11
source files; `#00B584` across 5. Twelve files carry one or the other —
`index.html`, `agent.html`, `jobhunt.html`, `d2c-lifecycle-os.html`, six
`lifecycle-os-*` pages, `lifecycle-os-kit.css`, `assets/app-skill-map.css` and
`assets/project-playbooks.css`. The legacy golds are down to 7 occurrences in
`index.html` (`#f5b531` ×1, `#E8B14E` ×5, `#A87B22` ×1).

## How agents should use this file

1. Read this file before writing any styles.
2. Use the CSS variables that already exist in the page; add a token here first
   if something is genuinely missing.
3. Never introduce raw hex values in component styles, and never use framework
   palette utilities (`gray-500`, `blue-600`, …) for brand surfaces.
4. Match the surrounding file's conventions — this repo is intentionally
   single-file per app, with styles in the existing `<style>` block.
