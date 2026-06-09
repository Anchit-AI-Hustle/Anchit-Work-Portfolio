// /api/tts — cloned-voice narration with a free-first cascade.
//
// Tries providers in order and returns the first that yields audio. If all fail
// it returns 503 and the browser falls back to the device's Indian-English voice,
// so narration always works.
//
// Configure whichever you want (env vars, set in Vercel → Project → Settings):
//   1) Self-hosted XTTS (your literal voice, free if you host it):
//        XTTS_API_URL = https://your-xtts-host/api/tts
//   2) ElevenLabs (instant voice clone of your sample, free tier ~10k chars/mo):
//        ELEVENLABS_API_KEY, ELEVENLABS_VOICE_ID  [optional ELEVENLABS_MODEL]
//   3) Hugging Face Inference (completely free; generic voice unless the model clones):
//        HF_TOKEN, HF_TTS_MODEL  (e.g. a TTS model id)
//
// Priority prefers YOUR cloned voice (XTTS, then ElevenLabs) before the free
// generic HF voice. Reorder by editing PROVIDERS below.

const XTTS_URL = (process.env.XTTS_API_URL || process.env.LOCAL_XTTS_API_URL || '').replace(/\/$/, '');

async function viaXTTS(text) {
  if (!XTTS_URL) return null;
  const r = await fetch(XTTS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
    body: JSON.stringify({ text }),
  });
  if (!r.ok) return null;
  return { type: r.headers.get('content-type') || 'audio/wav', buf: Buffer.from(await r.arrayBuffer()) };
}

async function viaElevenLabs(text) {
  const key = process.env.ELEVENLABS_API_KEY, voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) return null;
  const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.4, similarity_boost: 0.85 } }),
  });
  if (!r.ok) return null;
  return { type: 'audio/mpeg', buf: Buffer.from(await r.arrayBuffer()) };
}

async function viaHuggingFace(text) {
  const token = process.env.HF_TOKEN, model = process.env.HF_TTS_MODEL;
  if (!token || !model) return null;
  const r = await fetch(`https://api-inference.huggingface.co/models/${model}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', Accept: 'audio/*' },
    body: JSON.stringify({ inputs: text }),
  });
  if (!r.ok) return null;
  const ct = r.headers.get('content-type') || '';
  if (!ct.includes('audio')) return null;
  return { type: ct, buf: Buffer.from(await r.arrayBuffer()) };
}

const PROVIDERS = [viaXTTS, viaElevenLabs, viaHuggingFace];

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const text = (body.text || '').toString().replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!text) return res.status(400).json({ error: 'text required' });

  for (const provider of PROVIDERS) {
    try {
      const out = await provider(text);
      if (out && out.buf && out.buf.length > 0) {
        res.setHeader('Content-Type', out.type);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(out.buf);
      }
    } catch { /* try next provider */ }
  }
  return res.status(503).json({ error: 'tts_unavailable' });
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs' };
