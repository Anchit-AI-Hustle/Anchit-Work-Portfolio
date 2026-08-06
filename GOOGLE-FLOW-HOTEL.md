# Google Flow — luxury hotel film pack

Prompts for generating the six clips behind `/hotel` (see `hotel.html`).
Written for Google Flow / Veo. Each clip is ~10 seconds.

The page works **without** the clips — it ships a CSS fallback that performs the
same cloth-lift — so these can be generated and dropped in one at a time. File
names the page looks for are listed against each clip.

---

## Blocks to paste into every prompt

### Master hotel description

> A modern international 5-star luxury hotel with contemporary architecture: a
> sleek glass curtain-wall facade combined with warm sandstone and dark teak wood
> cladding, clean minimalist geometric lines, a flat or gently low-pitched
> roofline, an elegant modern porte-cochère entrance with a sculptural water
> feature, floor-to-ceiling glass windows, polished marble floors and brass accent
> fixtures throughout the interior, warm wood paneling, contemporary Indian art
> pieces on the walls, minimalist landscaped gardens with manicured hedges and
> palm trees

### Golden hour light block

> Golden hour lighting throughout, warm low-angle sunlight streaming in soft amber
> and rose tones, long soft shadows, gentle lens flare, no darkness or
> shadow-heavy moodiness, everything glowing warmly, cinematic color grade,
> photorealistic, shot on 35mm anamorphic lens

---

## 1A — Draped hotel, cloth lifting away → `assets/hotel/1a-drape.mp4`

**This is the hero mechanic.** Scroll is bound to the clip's `currentTime`, so
scrolling down physically lifts the cloth and scrolling back up drapes it again.

> [Golden Hour Light Block] Wide establishing shot of a modern 5-star luxury hotel
> building, its contemporary architectural form — clean flat roofline, glass
> curtain-wall facade, geometric massing — clearly visible underneath because it is
> entirely draped in a single continuous sheet of natural cotton cloth, like a
> dust-sheet over a monument, the fabric closely following and revealing the
> building's shape beneath it, gently rippling in the breeze. Around the building,
> the surrounding grounds are fully visible and NOT covered: minimalist landscaped
> gardens, a stone driveway, palm trees, a modern water feature, warm golden hour
> sunlight and long shadows across the lawns, clear warm sky. Slowly and smoothly,
> the cotton cloth lifts upward and away from the building from bottom to top, as if
> rising off it, gradually revealing the real glass-and-stone facade underneath —
> floor-to-ceiling windows, warm sandstone cladding, a sleek modern entrance canopy
> — while the grounds around it remain completely unchanged throughout. The cloth's
> motion is slow, continuous, and linear from start to finish, fully lifting clear
> of the building by the end of the clip. Camera locked off, wide static shot, no
> camera movement — the cloth lifting is the only motion. Cinematic, magical, warm.
> No text, no logos, no watermark, no people.

**Why the constraints matter for scrubbing:** "camera locked off" and "linear from
start to finish" are load-bearing. A scrubbed clip is played backwards as often as
forwards, so any camera move reads as the room lurching, and any easing in the
cloth makes the scroll feel like it sticks.

## 1B — Into the lobby → `assets/hotel/1b-lobby.mp4`

Use the **last frame of 1A** as this clip's first frame.

> [Golden Hour Light Block] [Master Hotel Description]. Continuing from a wide view
> of the fully revealed hotel facade at golden hour — glass and sandstone,
> floor-to-ceiling windows, a sleek modern entrance canopy, manicured grounds around
> it — the camera begins a slow, smooth forward glide toward the entrance, passing
> through automatic glass doors into a vast marble lobby with a soaring
> double-height ceiling, a sculptural brass chandelier, and warm golden light
> pouring through the glass walls. Continuous unbroken camera movement,
> steadicam-smooth, no cuts. Cinematic, awe-inspiring, warm. No text, no logos, no
> watermark, no people.

## 2 — Lobby → bar rack → bar lounge → `assets/hotel/2-bar.mp4`

Use the **last frame of 1B** as this clip's first frame.

> [Golden Hour Light Block] [Master Hotel Description]. Continuing a smooth unbroken
> forward glide through the marble lobby, the camera moves past a sleek backlit
> glass-and-brass bar counter, a tall illuminated shelving rack lined with rows of
> amber and dark spirit bottles catching the warm golden light, the camera tracking
> slowly alongside the rack. It then continues gliding past the counter, revealing
> the full luxury bar lounge beyond — low modern leather and velvet seating, brass
> side tables, warm golden hour light pouring through tall floor-to-ceiling windows.
> Continuous camera movement throughout, no cuts. Warm, inviting, sophisticated. No
> text, no logos, no watermark, no people.

## 3 — Bar lounge → corridor → gym → `assets/hotel/3-gym.mp4`

Use the **last frame of 2** as this clip's first frame.

> [Golden Hour Light Block] [Master Hotel Description]. Continuing the same smooth
> unbroken glide, the camera moves from the bar lounge through an open modern
> corridor lined with floor-to-ceiling glass on one side, golden light streaming
> through as the camera passes. The corridor opens into a bright luxury hotel gym:
> sleek dark wood and brass-accented equipment, a wall of glass windows flooding the
> space with warm golden hour light, a neatly folded stack of white towels on a
> marble bench catching the light as the camera glides past them toward the center
> of the room. Continuous camera movement, no cuts. Bright, premium, energizing yet
> warm. No text, no logos, no watermark, no people.

## 4 — Dining table → full hall reveal → `assets/hotel/4-dining.mp4`

> [Golden Hour Light Block] [Master Hotel Description]. The shot opens in extreme
> close-up on an elegantly set dining table: fine gold-rimmed china, a folded ivory
> linen napkin, brass cutlery, and a small brass vase of marigold flowers, warm
> golden hour light raking low across the table setting. The camera slowly pulls
> back and rises in one continuous smooth movement, revealing first the full table,
> then the entire modern dining hall around it — a soaring glass-walled ceiling,
> warm wood-paneled walls, rows of beautifully set tables, golden hour light
> flooding in from floor-to-ceiling windows along one side. Continuous camera
> movement, no cuts. Elegant, warm, inviting. No text, no logos, no watermark, no
> people.

## 5 — Poolside → underwater → rise back up → `assets/hotel/5-pool.mp4`

Also scroll-scrubbed: scrolling down takes the visitor under, scrolling on brings
them back up.

> [Golden Hour Light Block] [Master Hotel Description, adapted for exterior: replace
> interior marble floor references with a sandstone infinity pool deck]. The shot
> begins with a wide golden hour view of a modern luxury infinity pool deck
> surrounded by minimalist stone loungers and a sleek glass railing, the pool's
> surface glowing amber and gold with the reflected sunset, steam or mist gently
> rising at the water's edge. The camera glides forward and smoothly descends
> beneath the water's surface, transitioning into a clear underwater shot: sunlight
> beams pierce down through the water in warm golden shafts, gently rippling caustic
> light patterns dance across the pool floor tiles. The camera then rises back up
> through the surface, breaking into the golden hour air again with water droplets
> catching the light, revealing the full sunset view across the infinity pool edge
> toward the horizon. Continuous camera movement throughout, no cuts. Breathtaking,
> warm, serene. No text, no logos, no watermark, no people.

---

## Dropping the clips in

1. Put the files in `assets/hotel/` using the names above.
2. Nothing else to change — `hotel.html` looks for them, and each section
   independently switches from its CSS fallback to video the moment its file
   exists. A missing clip never breaks the page.
3. Add `assets/hotel/` to the copy list in `scripts/build-www.mjs` if it is not
   already picked up.

### Encoding, for scrubbing specifically

Seeking is the whole mechanic, so encode for seeking, not for streaming:

```bash
ffmpeg -i 1a-raw.mp4 -an \
  -c:v libx264 -crf 22 -preset slow \
  -g 12 -keyint_min 12 -sc_threshold 0 \
  -movflags +faststart \
  1a-drape.mp4
```

- `-g 12` puts a keyframe roughly every half-second. Seeking can only land on a
  keyframe, so a default ~250-frame GOP makes a scrubbed clip visibly snap.
- `-an` drops audio: the clips are silent, and audio tracks make seeking heavier.
- `+faststart` moves the index to the front so the browser can seek before the
  whole file has arrived.
- Keep each clip under ~6 MB if you can. The hero clip is on the critical path.
