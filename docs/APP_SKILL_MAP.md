# Universal App Skill Map

The portfolio ships a single cross-app capability map inspired by visual skill-tree products: one shared intelligence node, seven functional branches, dependency cues, progress states, and direct navigation into every first-party app.

This is an interaction pattern, not a visual clone. The implementation is original, dependency-free, accessibility-aware, and uses the portfolio's existing design tokens.

## Product contract

Every generated HTML application receives the same launcher and full-screen skill map. The map answers four questions immediately:

1. **What apps exist?** — every first-party route and major standalone project is visible in one map.
2. **How do they connect?** — apps are grouped into seven functional departments and show suggested prerequisites.
3. **Where am I now?** — the current route is highlighted automatically.
4. **What should I do next?** — the map recommends the next available app and persists started/completed states locally.

The seven branches are:

- Portfolio & Identity
- Opportunity & Productivity
- Intelligence & Research
- Strategy & Planning
- Creative & Content
- Agents & Automation
- Learning & Enablement

## Architecture

```text
assets/app-skill-map.js
  ├─ shared app/capability registry (the "brain")
  ├─ route detection and current-node highlighting
  ├─ searchable tree rendering
  ├─ dependency and recommendation logic
  ├─ local progress state
  └─ public window.AnchitSkillMap API

assets/app-skill-map.css
  ├─ isolated asm-* component styles
  ├─ host design-token inheritance
  ├─ desktop horizontal tree + mobile pan view
  ├─ keyboard/focus states
  └─ reduced-motion and print behavior

scripts/build-www.mjs
  ├─ builds/copies every app into www/
  ├─ builds the How-To SPA into www/how-to-2/
  └─ injects the shared CSS and JS into every www/**/*.html entry point
```

Because injection happens after the How-To Vite build, the React application and all static applications receive the same map without duplicating source markup.

## Interaction model

- **Launcher:** persistent “App Skill Map” control; mobile collapses to an icon.
- **Keyboard:** `Cmd/Ctrl + K` toggles the map; `Escape` closes it.
- **Progress states:** Available → In progress → Completed.
- **Current route:** always highlighted as “You are here.”
- **Recommendations:** only apps with completed prerequisites are preferred.
- **Search:** app names, descriptions, departments, and individual capabilities.
- **Persistence:** browser-only `localStorage`; no analytics or remote user tracking.
- **Accessibility:** semantic dialog, focus trap, visible focus states, reduced-motion support, no hover-only actions.

## Adding a new first-party HTML app

1. Add the HTML file or directory to the `assets` list in `scripts/build-www.mjs` if it is not already copied.
2. Add its node to the appropriate department in `assets/app-skill-map.js`.
3. Include a canonical `path`, optional `.html` aliases, capabilities, and `dependsOn` IDs.
4. Run `npm run build`.
5. Confirm the generated HTML contains `data-app-skill-map="styles"` and `data-app-skill-map="runtime"`.

## Runtime extension API

A standalone app can register a route-specific node without forking the shared runtime:

```js
window.AnchitSkillMap.registerApp('learning', {
  id: 'new-learning-tool',
  title: 'New Learning Tool',
  description: 'What the tool enables.',
  path: '/new-learning-tool',
  capabilities: ['Capability one', 'Capability two'],
  dependsOn: ['how-to-engine']
});
```

The public API also exposes `open()`, `close()`, `getMap()`, `getState()`, `getCurrentApp()`, and `setStatus(id, status)`.

## Adopting the system in separately deployed apps

Standalone apps outside this repository can load the same shared runtime from the portfolio domain:

```html
<link rel="stylesheet" href="https://anchit-tandon.com/assets/app-skill-map.css">
<script defer src="https://anchit-tandon.com/assets/app-skill-map.js"></script>
```

For a stricter deployment boundary, copy the two assets into the external repository and serve them locally instead.

## Security and privacy

- The reference preview URL and its access token are not stored in source, build output, documentation, or analytics.
- The map sends no telemetry.
- Progress is stored only in the current browser.
- External project links use `noopener,noreferrer`.
