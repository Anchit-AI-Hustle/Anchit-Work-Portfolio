import os
os.environ["COQUI_TOS_AGREED"] = "1"

import os
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from TTS.api import TTS
import tempfile
import uuid

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize TTS model globally so it stays in memory
print("Loading XTTS-v2 model...")
tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
print("Model loaded successfully.")

# Path to voice sample
SPEAKER_WAV = os.path.join("..", "audio", "anchit.m4a")

class TTSRequest(BaseModel):
    text: str

def preprocess_text(text: str) -> str:
    # Pronunciation rules
    # E.g., Resume -> resume-eh
    text = text.replace("Resume", "resum-eh")
    text = text.replace("resume", "resum-eh")
    return text

@app.post("/api/tts")
async def generate_audio(req: TTSRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    if not os.path.exists(SPEAKER_WAV):
        raise HTTPException(status_code=500, detail=f"Speaker wav not found at {SPEAKER_WAV}")

    processed_text = preprocess_text(req.text)
    
    # Create a temporary file to save the output
    output_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}.wav")
    
    try:
        tts.tts_to_file(
            text=processed_text,
            speaker_wav=SPEAKER_WAV,
            language="en",
            file_path=output_path
        )
        # Return the generated file
        return FileResponse(output_path, media_type="audio/wav")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
