// /api/tts — cloned-voice narration with a free-tier CASCADE.
//
// Tries hosted free-tier voice providers in order, burning each one's free
// allowance before moving on; a self-hosted XTTS server (your literal voice,
// free forever) is the final fallback. If every provider is unconfigured or
// spent, it returns 503 and the browser falls back to the device's
// Indian-English voice — so narration always works.
//
//   POST /api/tts            { text }            → audio bytes (audio/*)
//   GET  /api/tts?debug=1                        → which providers are configured
//
// Order (edit PROVIDERS below to reorder):
//   1) ElevenLabs   ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID   [ELEVENLABS_MODEL]
//   2) Cartesia     CARTESIA_API_KEY   + CARTESIA_VOICE_ID     [CARTESIA_MODEL]
//   3) Fish Audio   FISH_API_KEY       + FISH_VOICE_ID         [FISH_MODEL]
//   4) Hugging Face HF_TOKEN + (HF_TTS_URL | HF_TTS_MODEL)     (generic open voice)
//   5) XTTS self-host  XTTS_API_URL                            (your voice, fallback)
//
// Each provider is SKIPPED when unconfigured; a rate-limit / out-of-credits
// response (429 / 402 / 403) moves the cascade to the next provider instead of
// failing, so free tiers are chained for maximum free usage.

// Signals "this provider is spent — move to the next one".
function isQuota(status) { return status === 429 || status === 402 || status === 403; }

async function fetchTO(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 20000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); }
  finally { clearTimeout(t); }
}

// 1) ElevenLabs — instant voice clone of your sample. Free tier ~10k chars/mo.
async function viaElevenLabs(text) {
  const key = process.env.ELEVENLABS_API_KEY, voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) return null;
  const model = process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2';
  const r = await fetchTO('https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(voice), {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: model, voice_settings: { stability: 0.4, similarity_boost: 0.85 } }),
  });
  if (isQuota(r.status)) return null;   // spent → next provider
  if (!r.ok) return null;
  return { type: 'audio/mpeg', buf: Buffer.from(await r.arrayBuffer()) };
}

// 2) Cartesia — Sonic voice cloning. Free credits on signup.
async function viaCartesia(text) {
  const key = process.env.CARTESIA_API_KEY, voice = process.env.CARTESIA_VOICE_ID;
  if (!key || !voice) return null;
  const model = process.env.CARTESIA_MODEL || 'sonic-2';
  const r = await fetchTO('https://api.cartesia.ai/tts/bytes', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Cartesia-Version': process.env.CARTESIA_VERSION || '2026-03-01',
      'Content-Type': 'application/json',
      Accept: 'audio/*',
    },
    body: JSON.stringify({
      model_id: model,
      transcript: text,
      voice: { mode: 'id', id: voice },
      output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
    }),
  });
  if (isQuota(r.status)) return null;
  if (!r.ok) return null;
  return { type: r.headers.get('content-type') || 'audio/mpeg', buf: Buffer.from(await r.arrayBuffer()) };
}

// 3) Fish Audio — S2 voice cloning. Free developer tier (s2.1-pro-free).
async function viaFish(text) {
  const key = process.env.FISH_API_KEY, voice = process.env.FISH_VOICE_ID;
  if (!key || !voice) return null;
  const model = process.env.FISH_MODEL || 's2.1-pro-free';
  const r = await fetchTO('https://api.fish.audio/v1/tts', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      model: model,            // Fish selects the model via this header
      Accept: 'audio/*',
    },
    body: JSON.stringify({ text, reference_id: voice, format: 'mp3', latency: 'normal' }),
  });
  if (isQuota(r.status)) return null;
  if (!r.ok) return null;
  return { type: r.headers.get('content-type') || 'audio/mpeg', buf: Buffer.from(await r.arrayBuffer()) };
}

// 4) Hugging Face — a generic open TTS voice (Inference Endpoint or public model).
// Handles the "model is loading" 503 by waiting once for it to warm up.
async function viaHuggingFace(text) {
  const token = process.env.HF_TOKEN;
  const url = (process.env.HF_TTS_URL || '').replace(/\/$/, '')
    || (process.env.HF_TTS_MODEL ? 'https://api-inference.huggingface.co/models/' + process.env.HF_TTS_MODEL : '');
  if (!token || !url) return null;

  const body = JSON.stringify({ inputs: text, options: { wait_for_model: true } });
  const headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', Accept: 'audio/*', 'x-wait-for-model': 'true' };

  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await fetchTO(url, { method: 'POST', headers, body });
    const ct = r.headers.get('content-type') || '';
    if (r.ok && ct.includes('audio')) return { type: ct, buf: Buffer.from(await r.arrayBuffer()) };
    if (isQuota(r.status)) return null;               // rate-limited → next provider
    if (r.status === 503 && attempt === 0) {          // still warming up → wait once
      let wait = 3;
      try { const j = await r.clone().json(); if (j && j.estimated_time) wait = Math.min(8, Math.ceil(j.estimated_time)); } catch {}
      await new Promise((res) => setTimeout(res, wait * 1000));
      continue;
    }
    return null;
  }
  return null;
}

// 5) Self-hosted XTTS — your literal voice (audio/anchit.m4a), free forever.
// The final fallback once every free hosted tier is spent. See tts-server/.
async function viaXTTS(text) {
  const url = (process.env.XTTS_API_URL || process.env.LOCAL_XTTS_API_URL || '').replace(/\/$/, '');
  if (!url) return null;
  const r = await fetchTO(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
    body: JSON.stringify({ text }),
  }, 60000); // XTTS on free CPU can be slow — give it room
  if (!r.ok) return null;
  return { type: r.headers.get('content-type') || 'audio/wav', buf: Buffer.from(await r.arrayBuffer()) };
}

// Ordered cascade: hosted free tiers first (chained), self-host last.
const PROVIDERS = [
  { name: 'elevenlabs', run: viaElevenLabs },
  { name: 'cartesia',   run: viaCartesia },
  { name: 'fish',       run: viaFish },
  { name: 'huggingface', run: viaHuggingFace },
  { name: 'xtts',       run: viaXTTS },
];

// Which providers have their credentials set (no secrets exposed).
function configured() {
  const e = process.env;
  return {
    elevenlabs: !!(e.ELEVENLABS_API_KEY && e.ELEVENLABS_VOICE_ID),
    cartesia: !!(e.CARTESIA_API_KEY && e.CARTESIA_VOICE_ID),
    fish: !!(e.FISH_API_KEY && e.FISH_VOICE_ID),
    huggingface: !!(e.HF_TOKEN && (e.HF_TTS_URL || e.HF_TTS_MODEL)),
    xtts: !!(e.XTTS_API_URL || e.LOCAL_XTTS_API_URL),
  };
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Diagnostic: report which providers are wired, in cascade order.
  if (req.method === 'GET') {
    const cfg = configured();
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      order: PROVIDERS.map((p) => p.name),
      configured: cfg,
      anyConfigured: Object.values(cfg).some(Boolean),
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const text = (body.text || '').toString().replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!text) return res.status(400).json({ error: 'text required' });

  for (const provider of PROVIDERS) {
    try {
      const out = await provider.run(text);
      if (out && out.buf && out.buf.length > 0) {
        res.setHeader('Content-Type', out.type);
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('X-Voice-Provider', provider.name);
        return res.status(200).send(out.buf);
      }
    } catch { /* try next provider */ }
  }
  return res.status(503).json({ error: 'tts_unavailable' });
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 60 };
module.exports._test = { PROVIDERS, configured, isQuota };
