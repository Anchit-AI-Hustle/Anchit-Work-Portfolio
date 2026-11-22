---
name: game-studio
description: Audit, repair, tune or extend browser games in /games. Use for gameplay bugs, weak first-minute experience, UI/UX, touch controls, 3D/2D rendering, AI opponents, difficulty, audio, performance, or requests to fix all games.
---

# Browser Game Studio

**Read first:** `docs/GAME_STUDIO_PLAYBOOK.md`, then the target game's entry point and `games/shared/arcade.js`. Read `CLAUDE.md` and preserve existing game identity and infrastructure.

## Delegate by responsibility, not by headcount

The Claude Code Game Studios inspiration supplies a three-tier director/lead/specialist pattern, **not a mandate to spawn 49 agents**. For every task, emulate four reviews at the minimum cost:
1. **Creative director:** state the player fantasy, intended first 30 seconds, main mechanic, and definition of fun.
2. **Technical director:** identify exact runtime, browser constraints, shared shell vs per-game root cause, and the smallest fix.
3. **Relevant lead/specialist:** implement gameplay, input, visual, audio, AI, level, physics or accessibility changes.
4. **Independent QA/release owner:** reproduce before/after, check full gameplay, capture evidence and verify deployment. Explicitly state if any step was not exercised.

## Steps for each request

1. Inventory the requested slugs from `games/index.html`. If "all games," cover **all 24**, not just the five most visible titles. Preserve every title.
2. Translate screenshots/recordings into **what was actually shown**. If the source is a tutorial or a tool demonstration, treat it as workflow inspiration, **not** evidence of a defect.
3. Prioritize player failures (P0/P1) ahead of graphics polish. Write an expected/actual repro that another person can repeat.
4. Build and serve the **current** `www/` output, never test a stale tree.
5. Patch with focused regression test and inspect 3D and fallback 2D. Check state, frame progression, observable mechanics and visual composition. A moving frame counter is not proof of fun or correct mechanics.
6. Verify at 390x844 phone, 820x1180 tablet, 1440x900 desktop; keyboard, touch and controller if supported; pause, resume, restart, menu, win/failure path, sound and mute.
7. Run `npm run test:games:catalog`; `npm run test:games` with live build served; `RENDERER=2d VP=phone npm run test:games`; `npm run test:perf` for load/performance changes; camera checks for camera changes. Observe and record **actual** GitHub CI and deployment states.
8. Report a per-game evidence card, blocker list and remaining unknowns. Never label a game "fixed" solely because code was committed.

## Safety, fidelity and cost

- Do not replace the current web-engine stack with Unreal/Godot just because a reference video demonstrates them.
- Do not add paid credits, new accounts, giant agent dependencies, or an extra orchestrator when existing scripts suffice.
- Do not copy another game studio's art, levels or mechanics verbatim.
- Do not expose repo addresses on the public games UI. Internal engineering docs may link references.
- Keep screenshots, recording frames, audio recordings, and public claims separate from source-code hypotheses.
- Finish with: observed problem; concrete fix; test outcome; human play status; deployment status; next unmet acceptance criterion.
