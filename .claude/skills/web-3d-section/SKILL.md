---
name: web-3d-section
description: Build or update a real-time 3D WebGL/Three.js section, standalone 3D landing page, or scroll-scrubbed video story. Use when the user asks for Three.js, WebGL2, real-time 3D objects, or scroll-driven product reveals.
---

# Real-Time 3D & Scroll-Story Workflow

Apply these standards whenever building a 3D scene or scroll-driven visual story:

1. **Start with the story, not the 3D**
   - Define what happens first, what happens next, and what the visitor should feel.
   - Apply **cinematic restraint**: a slow hero visual plus at most **one or two** other cinematic moves (scroll-linked motion, pinned section, parallax, or one 3D moment). Never stack all five on one page.

2. **Architecture for standalone 3D pages (Three.js r169 / WebGL2)**
   - Self-contained HTML/JS/CSS with Three.js r169 via jsDelivr import map (`three` + `three/addons`) or zero-dependency WebGL2 fragment shaders, generating geometry/textures procedurally when no external `.glb` is needed.
   - Put every tweakable value (colours, counts, speeds, in-3D copy) in a top-level `CONFIG` block and a `PRESETS` array.
   - Support standard URL parameters:
     - `?embed` — hide the preset dock / overlay UI
     - `?preset=N` — start on preset index `N`
     - `?tour` — automatically scroll down and back (for scrollable 3D pages)
   - Cap pixel ratio: `Math.min(window.devicePixelRatio, 2)` (or `1.5` for heavy full-screen fragment raymarchers). Handle `resize` cleanly and target 60 fps.
   - Drive scroll storytelling from scroll position rather than timers, so scrolling backwards reverses cleanly. How depends on the story:
     - **One continuous camera move** (an object turning, a camera dolly): a smoothed progress (`lerp`) each frame is fine, as long as every frame along the way is a composed frame.
     - **A pinned story of several scenes** (walk-ins, chapters): step, do not scrub. Scroll picks the scene; each scene is a fully composed pose and the browser glides to it in one transition. Interpolating every layer every frame leaves most scroll positions half-dissolved with the caption faded out, which reads as broken (Gram Street and Deli Chic, Nov 2026). Check the last pose shows what its caption names.

3. **Performance & safety guards for 3D inside marketing pages**
   - **Lazy-load 3D** only when the section approaches the viewport (`IntersectionObserver`), never blocking initial page paint.
   - **Small phones (`<= 480px` / `390px`)**: do not load heavy live 3D; render a crisp, lightweight still `.webp` image in the same slot instead.
   - **Reduced motion (`prefers-reduced-motion: reduce` or `html[data-motion="off"]`)**: do not run continuous rotation, pinning, or WebGL loops; show the still image or a plain stacked layout.
   - **WebGL failure fallback**: wrap renderer creation in `try/catch` and fall back gracefully to the still image so the page never breaks.
   - **Idle is idle**: a background shader or canvas draws on load and on scroll, pointer and touch, then holds its last frame 2.5s after the visitor stops. Never a loop for as long as it is on screen. A scene that plays on its own drops to 30fps on phones and 12fps when the visitor is still.
   - **Every wake-up listener honours reduced motion**: a scroll listener that restarts the loop returns early under `prefers-reduced-motion: reduce`.
   - **Per-frame work stays cheap**: gate scroll handlers with `IntersectionObserver`, measure layout on resize (never every frame), write per-frame values to the element that uses them (a custom property on a container restyles everything inside it), and never put a backdrop blur over the moving scene.
   - **Canvas aspect**: the backing store and its CSS box share an aspect ratio; soft effects render at 1x on phones.

4. **Scroll-scrubbed video alternative**
   - When photorealism matters more than live camera interaction, use a short (3–6s) locked-camera video made from a single Start -> End image pair.
   - Prepare for web scrubbing: `<= 1080p`, audio stripped (`-an`), `< 4 MB` (ideally `< 1 MB`), fast-seekable keyframes (`-g 1` or dense keyframes, `-movflags +faststart`), plus a `-poster.webp` first frame.
   - Respect `prefers-reduced-motion` by showing the static poster image instead of scrubbing.

5. **Verify before finishing**
   - Scroll slowly forwards and backwards; verify no jumping, no sideways scroll (`overflow-x: clip`, never `overflow-x: hidden` on `body`), and clean re-framing at `390px`, `768px`, and `1440px`.
   - Measure added bundle/asset weight and report it clearly.
   - Measure idle main-thread work (Chrome `Performance.getMetrics` TaskDuration over 4s, nobody touching the page): under ~40 ms per second unless the scene plays on its own on purpose. Count WebGL `drawArrays` calls to prove the scene rests and wakes; reading a WebGL canvas back returns blank, so pixels cannot show it.
   - Reload part-way through a pinned story and scroll back up into it from below: both must land on a whole scene.
   - For the concept storefronts, `npm run test:storefront-motion` runs these checks.
