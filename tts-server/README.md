# Anchit XTTS Voice Service

This service generates narration with XTTS-v2 using `audio/anchit.m4a` as the reference voice sample. The app calls `/api/tts`, and the Vercel function proxies to this FastAPI server.

## Local Setup

Use Python 3.10 or 3.11. Python 3.14 is not currently a safe target for Coqui TTS.

```bash
brew install ffmpeg python@3.11
/opt/homebrew/bin/python3.11 -m venv .venv
source .venv/bin/activate
pip install -r tts-server/requirements.txt
npm run tts:serve
```

The first boot converts `audio/anchit.m4a` into `audio/anchit-xtts-sample.wav`, loads `tts_models/multilingual/multi-dataset/xtts_v2`, and serves generated WAV audio at:

```text
http://127.0.0.1:8000/api/tts
```

## Production

Run this FastAPI service on a Python-capable host and set:

```bash
XTTS_API_URL=https://your-xtts-host.example.com/api/tts
```

on Vercel. Without that environment variable, Vercel will try `http://127.0.0.1:8000/api/tts`, which is only valid for local development.
