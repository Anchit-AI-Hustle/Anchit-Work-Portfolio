# Anchit LLM + Streaming Cloned Voice

This portfolio now has two answer paths:

1. `/api/chat-stream` streams first-person answer tokens and cloned-voice audio packets.
2. `/api/chat` remains the non-streaming fallback, followed by the offline in-page knowledge base.

The knowledge source is currently the resume/profile facts embedded in the server prompt. The contract is intentionally narrow so more documents can later be added as a retrieval layer before the prompt is assembled.

## Runtime Flow

1. Browser sends the visitor question to `/api/chat-stream`.
2. `/api/chat-stream` opens Anthropic streaming mode and emits token events immediately.
3. As sentence-sized chunks become ready, `/api/chat-stream` calls the self-hosted XTTS packet service.
4. The browser receives:
   - `token` events for live text.
   - `audio` events containing 2-3 second audio packets.
   - status events for buffering and packet playback.
5. The frontend queues packets and plays them sequentially while later text and audio are still generating.

This is a packetized streaming architecture: XTTS-v2 still synthesizes each packet as a short file, but the visitor does not wait for the full answer.

## Endpoints

### Vercel Portfolio

- `POST /api/chat-stream`
  - Body: `{ "message": "...", "history": [{ "role": "user", "content": "..." }] }`
  - Response: `text/event-stream`
  - Events:
    - `state`: `{ "status": "thinking" | "buffering-audio", "seq": 0 }`
    - `token`: `{ "text": "..." }`
    - `audio`: `{ "seq": 0, "mime": "audio/wav", "audioBase64": "...", "text": "spoken packet" }`
    - `audio-skipped`: packet text when the GPU service is unavailable
    - `done`: `{ "text": "full answer" }`

- `POST /api/chat`
  - Non-streaming fallback.

- `POST /api/tts`
  - Whole-text fallback for page narration.

### Self-Hosted XTTS GPU Service

- `POST /api/tts-packet`
  - Body: `{ "text": "short sentence", "format": "wav" }`
  - Response: `audio/wav`

- `WebSocket /ws/tts`
  - Client sends: `{ "seq": 0, "text": "short sentence" }`
  - Server sends JSON status, then audio bytes, then completion JSON.

## Environment Variables

Set these in Vercel:

```bash
ANTHROPIC_API_KEY=...
CLAUDE_MODEL=claude-haiku-4-5-20251001
XTTS_PACKET_URL=https://your-gpu-host.example.com
XTTS_API_URL=https://your-gpu-host.example.com
```

`XTTS_PACKET_URL` may point either to the host root or directly to `/api/tts-packet`.

## Practical XTTS Serving Setup

Recommended MVP setup:

1. Host `tts-server/app.py` on a persistent GPU container, not Vercel.
2. Use an NVIDIA L4/A10G/T4 class GPU with the XTTS model loaded once at startup.
3. Keep the FastAPI process warm. Cold-starting XTTS for every request will feel broken.
4. Generate packet chunks of about 120-220 characters. The frontend and `/api/chat-stream` are tuned for this.
5. Run one worker per GPU initially. XTTS is memory-heavy; queue concurrent requests instead of letting them compete.
6. Add a short in-memory cache keyed by normalized packet text if repeated guided copy becomes common.

GPU options:

- Best steady-state: RunPod, Modal, Replicate deployment, or a small GCP/AWS GPU VM with FastAPI + Uvicorn.
- Best control: Dockerized FastAPI on a dedicated GPU VM, fronted by HTTPS.
- Avoid for now: pure serverless CPU. It will miss the latency target.

Optimization path:

- Start with FP16 on GPU.
- Keep speaker conditioning/reference loaded.
- Packetize by sentence and synthesize in parallel only after measuring GPU headroom.
- Consider DeepSpeed/ONNX/quantization only after the packetized baseline is stable; architecture already isolates the TTS server so the model backend can change later.

## Local Test

Terminal 1:

```bash
npm run dev
```

Terminal 2:

```bash
npm run tts:serve
```

Then ask a question in the chat. Without `ANTHROPIC_API_KEY`, the site falls back to the offline KB. Without `XTTS_PACKET_URL`, the streaming route emits text and skips audio packets.

## Future Document Grounding

Add a retrieval step before `PERSONA` is sent to the LLM:

1. Store resume/profile/project documents as markdown chunks.
2. Embed chunks into a vector store.
3. Retrieve the top grounded snippets per question.
4. Inject snippets below the fixed profile facts.
5. Keep the instruction: answer only from provided facts/snippets.

This lets the portfolio grow from resume-grounded chat into a broader Anchit knowledge base without changing the frontend streaming contract.
