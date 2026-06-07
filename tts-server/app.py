'''FastAPI server for generating speech using the XTTS‑v2 model.

The server prepares a reference WAV file for the speaker, loads the XTTS model
once at startup, and exposes a single `/api/tts` endpoint that takes a piece of
text and returns a generated WAV file.
'''

import os
import subprocess
import tempfile
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from TTS.api import TTS

# Ensure the Coqui TOS is accepted – required by the TTS library.
os.environ["COQUI_TOS_AGREED"] = "1"

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
SOURCE_SAMPLE = ROOT / "audio" / "anchit.m4a"
SPEAKER_WAV = ROOT / "audio" / "anchit-xtts-sample.wav"


def ensure_reference_wav() -> Path:
    """Return a valid speaker WAV file for XTTS.

    If ``SPEAKER_WAV`` does not exist, convert ``SOURCE_SAMPLE`` to a mono
    24 kHz WAV using ``ffmpeg``.
    """
    if SPEAKER_WAV.exists() and SPEAKER_WAV.stat().st_size > 0:
        return SPEAKER_WAV

    if not SOURCE_SAMPLE.exists():
        raise RuntimeError(f"Voice sample not found: {SOURCE_SAMPLE}")

    try:
        subprocess.run(
            [
                "ffmpeg",
                "-y",
                "-i",
                str(SOURCE_SAMPLE),
                "-ar",
                "24000",
                "-ac",
                "1",
                str(SPEAKER_WAV),
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            text=True,
        )
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg is required to convert audio/anchit.m4a to WAV.") from exc
    except subprocess.CalledProcessError as exc:
        raise RuntimeError(f"Could not prepare XTTS speaker WAV: {exc.stderr[-500:]}") from exc

    return SPEAKER_WAV


# ---------------------------------------------------------------------------
# FastAPI app configuration
# ---------------------------------------------------------------------------
app = FastAPI(title="Anchit XTTS Voice")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print("Preparing Anchit voice reference...")
REFERENCE_WAV = ensure_reference_wav()
print(f"Using XTTS speaker reference: {REFERENCE_WAV}")
print("Loading XTTS‑v2 model...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
print("XTTS‑v2 model loaded.")


class TTSRequest(BaseModel):
    text: str


def preprocess_text(text: str) -> str:
    """Clean and truncate input text.

    Replacements are applied to improve pronunciation of specific tokens. The
    result is stripped of excess whitespace and limited to 1200 characters.
    """
    replacements = {
        "Resume": "resumay",
        "resume": "resumay",
        "Vahdam": "Vah-dam",
        "D2C": "D to C",
        "MRR": "M R R",
        "ARR": "A R R",
        "AI": "A I",
    }
    for src, dest in replacements.items():
        text = text.replace(src, dest)
    return " ".join(text.split())[:1200]


@app.get("/health")
async def health() -> dict[str, Any]:
    """Simple health check endpoint returning server status and speaker path."""
    return {"ok": True, "speaker_wav": str(REFERENCE_WAV)}


@app.post("/api/tts")
async def generate_audio(req: TTSRequest):
    """Generate a WAV file from the supplied text using XTTS.

    The request body must contain a non‑empty ``text`` field. The generated file
    is stored in the system temporary directory and streamed back to the client.
    """
    text = preprocess_text(req.text or "")
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")

    output_path = Path(tempfile.gettempdir()) / f"anchit-xtts-{uuid.uuid4()}.wav"
    try:
        tts.tts_to_file(
            text=text,
            speaker_wav=str(REFERENCE_WAV),
            language="en",
            file_path=str(output_path),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return FileResponse(
        str(output_path),
        media_type="audio/wav",
        filename="anchit-narration.wav",
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
