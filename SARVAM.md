# Sarvam AI — how this site uses it

Sarvam is the **Indian-language voice** in the TTS cascade (`api/tts.js`, provider #4).
Docs: <https://docs.sarvam.ai> · Dashboard: <https://dashboard.sarvam.ai>

## Start here

```bash
SARVAM_API_KEY=…  node scripts/sarvam-quickstart.mjs
```

That runs three real calls — Text to Speech, Speech to Text on `audio/anchit.m4a`,
and Translate — and prints the resolved settings first, so you can see exactly what
the deployed site would send. Useful flags:

```bash
node scripts/sarvam-quickstart.mjs --speaker ritu --lang hi-IN   # audition a voice
node scripts/sarvam-quickstart.mjs --text "Custom line" --out /tmp/x.wav
node scripts/sarvam-quickstart.mjs --stt audio/anchit-xtts-sample.wav
```

Get the key at the dashboard → API Keys. **Its value is shown once, at creation** —
if it scrolls away, delete the key and make a new one.

## Voice cloning: not available over the API

Sarvam markets voice cloning with Bulbul v3, and it is real — but it is not reachable
from the REST API:

| | |
|---|---|
| TTS `speaker` field | closed enum of preset voices; no custom-voice id field exists |
| Where cloning lives | Sarvam Creative Studio, in the browser |
| How a clone is made | read a passage aloud for ~10s, live, with a consent checkbox — **no file upload**, so `audio/anchit-xtts-sample.wav` can't seed it |
| Where a clone is usable | Studio's "Cloned voices" tab → Studio TTS and Dubbing only |
| Dubbing API cloning | clones the speaker *in your source media* to re-voice **that same content** in another language — it won't speak arbitrary new text |
| Beta programme | *"Currently, there are no beta APIs or features available"* |

**So:** Anchit's cloned voice runs on **ElevenLabs** (cascade provider #1,
`scripts/elevenlabs-clone.mjs` clones it from the sample in `audio/`). Sarvam handles
Indic languages with a preset voice. That split is deliberate, not a workaround.

If you want a cloned voice in Sarvam anyway, the only route is manual: record the 10s
passage in Creative Studio and use it *there*. It will never appear in `/api/tts`.

## Configuration

All optional except the key. Invalid values fall back to a working default rather than
failing the call — check what actually resolved with `curl -s https://anchit-tandon.com/api/tts | jq .sarvam`.

| Variable | Default | Notes |
|---|---|---|
| `SARVAM_API_KEY` | — | required; sent as the `api-subscription-key` header |
| `SARVAM_MODEL` | `bulbul:v3` | or `bulbul:v2` (legacy) |
| `SARVAM_VOICE` | `shubh` (v3) / `anushka` (v2) | **must match the model** — see rosters below |
| `SARVAM_LANG` | `en-IN` | `bn-IN gu-IN hi-IN kn-IN ml-IN mr-IN od-IN pa-IN ta-IN te-IN` (Odia is `od-IN`, not `or-IN`) |
| `SARVAM_CODEC` | `wav` | `mp3 wav linear16 flac aac opus mulaw alaw` — `mp3` is far smaller over the wire |
| `SARVAM_PACE` | `1.0` | v3: 0.5–2.0 · v2: 0.3–3.0 |
| `SARVAM_TEMPERATURE` | `0.6` | v3 only, 0.01–2.0. Higher = more expressive, more artefacts |
| `SARVAM_SAMPLE_RATE` | `24000` | 8000 · 16000 · 22050 · 24000 · 32000 · 44100 · 48000 |

Speaker names are **case-sensitive lowercase**, and a speaker from the wrong roster is
rejected by the API — `api/tts.js` validates both and silently corrects rather than
letting the cascade lose Sarvam to a 422.

**bulbul:v3** — shubh (default), aditya, ritu, priya, neha, rahul, pooja, rohan, simran,
kavya, amit, dev, ishita, shreya, ratan, varun, manan, sumit, roopa, kabir, aayan,
ashutosh, advait, anand, tanya, tarun, sunny, mani, gokul, vijay, shruti, suhani, mohit,
kavitha, rehan, soham, rupali

**bulbul:v2** — anushka, manisha, vidya, arya (female) · abhilash, karun, hitesh (male)

## Gotchas that cost real debugging time

- The TTS body field is documented as **`language_code`**. `target_language_code` is the
  *translate* endpoint's field, and Sarvam quietly accepts it here too as a legacy alias
  (verified live) — so a request using it works, but on undocumented behaviour. Use
  `language_code`.
- The default model is the **legacy** one if you don't say otherwise. Send `model`
  explicitly or you inherit `bulbul:v2`, `anushka`, and 22050 Hz without any warning —
  which is exactly what this site was doing until it was checked.
- v3 **rejects** `pitch` and `loudness`; v2 ignores `temperature`. Only send what the
  chosen model supports.
- Character cap is per model: v3 2500, v2 1500.
- Numbers over 4 digits want commas — `"10,000"` reads as ten thousand, `"10000"` may not.
- STT is `multipart/form-data`, not JSON, and `language_code: unknown` auto-detects —
  the right default for code-mixed Indian English.

## Where it plugs in

`api/tts.js` tries providers in order and skips any that is unconfigured or out of
credit (429/402/403), so partial setup is fine:

```
elevenlabs → cartesia → fish → sarvam → huggingface → xtts
  (cloned)                      (Indic)              (self-hosted clone)
```

`GET /api/tts` reports which providers are wired and the resolved Sarvam settings.
No secrets are returned.

## Not wired yet

Sarvam **Speech to Text** (Saaras v3/v4) is exercised by the quickstart but isn't used by
the site. It's the natural next step for Indic *voice input* on `/agent` — the browser's
built-in recogniser is weak on Hindi and code-mixed speech. Saaras also has a `translate`
mode, so a Hindi question could arrive already in English.
