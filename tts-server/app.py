'''FastAPI server for generating speech using the XTTS‑v2 model.

The server prepares a reference WAV file for the speaker, loads the XTTS model
once at startup, and exposes a single `/api/tts` endpoint that takes a piece of
text and returns a generated WAV file.
'''

import os
import subprocess
import tempfile
import uuid
import asyncio
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
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
    format: str | None = "wav"


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


def synthesize_to_file(text: str) -> Path:
    """Blocking XTTS synthesis wrapped by async endpoints.

    XTTS-v2 is not truly sample-streaming in this setup, so the practical
    low-latency strategy is packetization: synthesize 2-3 second text chunks in
    sequence, return each chunk immediately, and let the browser buffer/play
    while later chunks are still generating.
    """
    output_path = Path(tempfile.gettempdir()) / f"anchit-xtts-{uuid.uuid4()}.wav"
    tts.tts_to_file(
        text=text,
        speaker_wav=str(REFERENCE_WAV),
        language="en",
        file_path=str(output_path),
    )
    return output_path


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

    try:
        output_path = await asyncio.to_thread(synthesize_to_file, text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return FileResponse(
        str(output_path),
        media_type="audio/wav",
        filename="anchit-narration.wav",
    )


@app.post("/api/tts-packet")
async def generate_audio_packet(req: TTSRequest):
    """Generate one small XTTS packet for live chat playback.

    Keep upstream text chunks short (roughly one sentence / 120-220 chars). The
    client receives many packets and plays them sequentially, which gives a
    YouTube-style buffering feel without waiting for a full answer.
    """
    text = preprocess_text(req.text or "")[:320]
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    try:
        output_path = await asyncio.to_thread(synthesize_to_file, text)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return FileResponse(
        str(output_path),
        media_type="audio/wav",
        filename=f"anchit-packet-{uuid.uuid4()}.wav",
    )


@app.websocket("/ws/tts")
async def tts_socket(websocket: WebSocket):
    """Streaming socket contract for GPU deployments.

    Client sends JSON messages: {"seq": 0, "text": "..."}.
    Server responds with a status JSON, then the generated audio bytes, then a
    done JSON. This mirrors the HTTP packet endpoint while avoiding request
    setup overhead on long-lived GPU hosts.
    """
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            seq = payload.get("seq")
            text = preprocess_text((payload.get("text") or ""))[:320]
            if not text:
                await websocket.send_json({"type": "error", "seq": seq, "error": "empty_text"})
                continue
            await websocket.send_json({"type": "buffering", "seq": seq})
            try:
                output_path = await asyncio.to_thread(synthesize_to_file, text)
                await websocket.send_json({"type": "audio", "seq": seq, "mime": "audio/wav", "text": text})
                await websocket.send_bytes(output_path.read_bytes())
                await websocket.send_json({"type": "done", "seq": seq})
            except Exception as exc:
                await websocket.send_json({"type": "error", "seq": seq, "error": str(exc)})
    except WebSocketDisconnect:
        return


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8000)
