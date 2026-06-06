import os
import subprocess
import tempfile
import uuid
from pathlib import Path

os.environ["COQUI_TOS_AGREED"] = "1"

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel
from TTS.api import TTS


ROOT = Path(__file__).resolve().parents[1]
SOURCE_SAMPLE = ROOT / "audio" / "anchit.m4a"
SPEAKER_WAV = ROOT / "audio" / "anchit-xtts-sample.wav"


def ensure_reference_wav() -> Path:
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
print("Loading XTTS-v2 model...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
print("XTTS-v2 model loaded.")


class TTSRequest(BaseModel):
    text: str


def preprocess_text(text: str) -> str:
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
async def health():
    return {"ok": True, "speaker_wav": str(REFERENCE_WAV)}


@app.post("/api/tts")
async def generate_audio(req: TTSRequest):
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

    return FileResponse(str(output_path), media_type="audio/wav", filename="anchit-narration.wav")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
