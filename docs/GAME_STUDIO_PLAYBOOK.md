# Game Studio: operating playbook for /games

**Scope:** the existing 24 playable browser games at `/games`. This is an operating procedure for improving their real player experience, not a new game engine or a replacement for the existing build. Run with the existing `CLAUDE.md`, `games/shared/arcade.js`, `scripts/games-check.js`, and CI.

**Reference and adaptation:** [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios), featured in the user-supplied 23 November 2026 screen recording. The reference describes 49 specialized agent *definitions*, 75 workflow skills and 15 hooks, a three-tier studio hierarchy, play-first development, real-browser checks, and web/Godot/Unity/Unreal targets. Its free MIT-licensed *templates* do not make model inference, engine use, or hosting automatically cost-free. We adopt the decision-making and verification patterns, not the full framework or its assumptions. [Godot MCP](https://github.com/Coding-Solo/godot-mcp) is optional only for actual Godot projects; it is not required or appropriate for these Three.js/canvas browser games.

## Non-negotiable outcome

A game is **fixed** only when a human can start, understand, control, progress, finish/restart and exit it, with appropriate feedback, on supported devices. A green build, an error-free console, or a moving frame counter is insufficient. Do not invent playtest results, screenshots, performance numbers, deployment success, or user satisfaction.

## Three-tier structure (roles, not 49 running processes)

| Tier | Role | Owns / signs off |
| --- | --- | --- |
| Director | Game/creative director | Who it is for; 30-second hook; whether controls and reward loop feel fun, coherent and original |
| Director | Technical director | Current architecture, reliable 3D/2D fallback, budgets, repeatable repro, maintainable patches |
| Director | Producer/release owner | Priority, scope, sequencing, evidence, truthful ship/no-ship status |
| Lead | Gameplay/design lead | Rules, progress, difficulty curve, input-action response, failure/win states |
| Lead | UI/UX/accessibility lead | Menus, legibility, focus, touch reach, pause/restart, orientation, reduced motion |
| Lead | Visual/3D lead | Readable silhouettes, camera, lighting, animation and frame-time discipline |
| Lead | Audio/feedback lead | Action feedback, sound unlock, mute, haptics, feedback consistency |
| Lead | QA/performance lead | Test matrix, reproducibility, screenshots, CI, regression owners |
| Specialist (invoke on demand) | Engine, physics, AI opponent, animation, shader, input, rendering, accessibility, test automation, sound, or release specialist | One scoped task, reproducible evidence and smallest safe patch |

**Cost rule:** use one coordinator and only the specialists actually needed by the defect. Never start dozens of sessions just because the reference offers 49 agent definitions. Reuse code/QA tools that are already in the repository. No paid API, subscription, or remote engine is required by this playbook.

## The work loop: observe → specify → fix → prove → ship

1. **Observe the player's actual problem.** Record game slug, device/viewport, browser, renderer (3D or 2D), mode, sequence of inputs, expected vs actual outcome, visual/audio evidence, and whether it happens repeatedly. A screen recording is evidence, not proof of root cause. A video showing an agent tool is a reference for workflow, **not** a video of a broken game.
2. **Write a one-page game brief** for anything being redesigned: target player, genre fantasy, first 30 seconds, primary interaction, success/failure loop, desired feel, references for form only, explicit non-goals, and measurable acceptance criteria. Preserve the original game's identity instead of replacing it with a generic demo.
3. **Choose the smallest specialist group** needed. Game director confirms experience; technical director identifies shared-engine vs game-specific files; one lead/specialist implements. QA reviews independently. Do not duplicate work across 24 games if the root cause is in `games/shared/`.
4. **Reproduce before patching.** In the built `www/` tree, capture a failing test, screenshot, video or debugger trace. Check console errors, missing first-party assets, input state, game state, and frame update. Inspect the 3D and forced-2D paths.
5. **Fix and compare.** Prefer a minimal patch with a rollback path. Add a focused regression assertion that fails without the fix (unit for logic; Playwright for input/UX). Avoid rewriting game physics or camera solely because a screenshot looks unimpressive.
6. **Observe actual gameplay again.** Launch, press Play, make meaningful inputs, verify score/progression, pause/resume, restart, back-to-hub, visible render and HUD, touch/keyboard, audio unlock and mute, one full win or failure loop when feasible. Save representative evidence in a QA artifact for the change; no test should assert a fabricated user score.
7. **Run release gates.** `npm run build` then `npm run test:games:catalog`, `npm run test:games`, `RENDERER=2d VP=phone npm run test:games`, `npm run test:kartcam` for camera changes, and `npm run test:perf` for performance changes. Follow `.github/workflows/ci.yml`. Report each actual pass/fail/untested result separately.
8. **Release with proof.** Record commit, CI workflow outcome, deployed revision, live URL, screenshot/video, remaining risks, and whether a *person* has played it. Never describe a pending deployment as live or a passing smoke test as a human playtest.

## Player experience scorecard (each game, each major release)

Assess independently, marking **Not tested** where evidence is missing:

| Dimension | Player-facing question | Evidence |
| --- | --- | --- |
| First 30 seconds | Is there an immediate, comprehensible action and visible objective? | Launch + first-play recording |
| Core mechanics | Does each advertised mechanic work under real input? | Replayable input sequence and state change |
| Agency and difficulty | Do actions change outcomes fairly? Are difficulty, goals and progression clear? | Several runs, win/failure/restart |
| Visual clarity | Can the player distinguish hazards, characters, goals and HUD without clipping? | Phone/tablet/desktop and 2D/3D screenshots |
| Feedback and audio | Do actions, hits, rewards, failures and muted state feel consistent? | Audio/haptic checks with user interaction |
| Controls and accessibility | Are touch, keyboard and controller labels accurate; controls usable one-handed where appropriate? | Device controls, focus and reduced-motion checks |
| Technical stability | Does it start, respond, preserve valid scores, handle lost focus, and avoid missing assets? | Automated QA + browser console |
| Responsiveness | Does it load and run within existing budgets on a throttled phone? | `test:perf`, measured frame pacing |
| Retention and finish | Is the round satisfying enough to retry? Does the game explain the next goal? | Human playtest notes, not an invented metric |

A game cannot pass on visual appeal alone. A "perfect-looking" game whose core mechanic is broken is a blocker.

## Priority rules

- **P0:** blank canvas, start impossible, game permanently stuck, infinite crash loop, security/data loss. Block release.
- **P1:** main action cannot be used, input continuously stuck, game cannot progress, wrong results, critical mobile overlap. Block release for affected game.
- **P2:** confusing onboarding, weak feedback, difficulty imbalance, visible clipping, intermittent stutter, broken secondary feature. Fix by severity and impact.
- **P3:** cosmetic polish after the player loop and stability pass.

Rank within a severity by (users affected × frequency × disruption) / bounded fix effort. Label estimates as estimates; measure actual player evidence where available.

## Evidence card template

```text
GAME: <slug> | BUILD/COMMIT: <sha> | QA OWNER: <role>
DEVICE/BROWSER: <model + viewport> | RENDERER: 3D / forced 2D
MODE + REPRO: <precise sequence>
EXPECTED / OBSERVED: <comparison>
ROOT CAUSE: <verified or hypothesis>
PATCH + FOCUSED TEST: <changed files and command>
SCREENSHOT/VIDEO: <actual evidence path, or none>
FULL GATES: catalog __ / game __ / fallback __ / perf __ / CI __
HUMAN PLAYTEST: played and confirmed / not yet played
RELEASE: deployed and checked / pending / not deployed
NEXT ACTION: <single owner + acceptance criterion>
```

## Engine integration decision

Continue **browser-first** for the 24 live titles. Three.js/WebGL2 plus existing 2D canvas fallbacks already match the product and test infrastructure. The reference's Unreal Blueprint and Godot MCP examples demonstrate tooling, **not** proof that switching engines would improve our existing games. Consider Godot/Unreal only for a separately scoped engine migration after profiling shows a specific unfixable browser constraint; assess native packaging, memory, web export, hosting, runtime performance and maintenance first.

## Prompt to invoke in Claude Code

```text
Use .claude/skills/game-studio/SKILL.md and docs/GAME_STUDIO_PLAYBOOK.md.
Audit <game slug or all 24>, starting from the actual user problem.
Keep original mechanics and branding unless a game-specific redesign is required.
Route work through creative/technical/QA responsibilities with specialists on demand.
Reproduce, implement the smallest patch, add a failing-then-passing regression check,
validate 3D + forced-2D, phone/tablet/desktop, sound/input and complete gameplay loop.
Build www/ before browser testing; do not claim CI or deployment passes without evidence.
Deliver per-game scorecards and real evidence, distinguishing automated from human play.
Use no paid services or credits.
```

**What is learned vs delivered:** This file integrates an *operating method*. It neither instantiates 49 live agents nor fixes unobserved gameplay defects. Actual repair work requires per-game evidence and passing runtime tests.
