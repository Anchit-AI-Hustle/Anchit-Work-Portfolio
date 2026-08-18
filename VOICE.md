# The cloned voice

The site speaks in the first person. A stock voice reading those words is not a
lesser version of the feature — it is a stranger claiming to be Anchit. So
`api/tts.js` refuses to answer in one: it skips every non-cloning provider
unless somebody deliberately sets `VOICE_ALLOW_STOCK=true`.

## What production is doing right now

```
GET https://anchit-tandon.com/api/tts?debug=1
```

At the time of writing it answers:

```json
{
  "order": ["elevenlabs","cartesia","fish","huggingface","xtts","sarvam"],
  "configured": { "elevenlabs": false, "cartesia": false, "fish": false,
                  "huggingface": false, "xtts": false, "sarvam": true },
  "clonedVoiceReady": false,
  "clonedOnly": true,
  "sarvam": { "speaker": "shubh", "clonedVoice": false }
}
```

Read that as: **no cloning provider has credentials.** The one provider that is
wired, Sarvam, only exposes preset speakers through its REST API — cloning is
Studio-only — so it would answer in "shubh", which is not Anchit. The server
correctly refuses, returns 503, and the browser falls back to its own device
voice. That fallback is why the site currently speaks in a voice that is not his.

## Fixing it

Set **one** cloning provider. ElevenLabs is first in the cascade and supports
instant cloning from a few minutes of audio:

| variable | value |
| --- | --- |
| `ELEVENLABS_API_KEY` | the API key from elevenlabs.io → Profile |
| `ELEVENLABS_VOICE_ID` | the voice id of the cloned voice, from VoiceLab |
| `ELEVENLABS_MODEL` | optional; defaults to `eleven_multilingual_v2` |

Set them in **Vercel → the project → Settings → Environment Variables**, for
Production (and Preview if you want previews to speak), then redeploy so the
functions pick them up.

Never put these in the repo, in a commit, or in a chat message — they are
secrets, and `api/tts.js` only ever reads them from the environment.

Cartesia, Fish and a self-hosted XTTS are wired as alternatives in the same
cascade; any one of them being configured is enough, and the cascade falls
through to the next when one is out of credits.

## Checking it worked

```
GET /api/tts?debug=1     → "clonedVoiceReady": true
POST /api/tts            → responds with audio, and the headers say who spoke:
                           X-Voice-Provider: elevenlabs
                           X-Voice-Clone: true
```

Until `clonedVoiceReady` is true, the page sets `data-voice="stock"` on `<html>`
and the audio controls carry a small "device voice" badge — the substitution
stays visible instead of quietly passing itself off as him.
