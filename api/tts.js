// /api/tts — cloned-voice narration with a free-tier CASCADE.
//
// Tries hosted free-tier voice providers in order, burning each one's free
// allowance before moving on. If every provider is unconfigured or spent, it
// returns 503 and the browser falls back to the device's Indian-English voice
// — so narration always works.
//
//   POST /api/tts            { text }            → audio bytes (audio/*)
//   GET  /api/tts?debug=1                        → which providers are configured
//
// ORDERING RULE: this endpoint narrates first-person copy ("I'm building…"),
// so every provider that can actually reproduce Anchit's voice runs BEFORE any
// provider that can only offer a stock voice. A stock voice reading "I" is a
// worse answer than a slow clone, and a far worse one than the device voice.
//
// Order (edit PROVIDERS below to reorder) — clone-capable first:
//   1) ElevenLabs   ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID   [ELEVENLABS_MODEL]
//   2) Cartesia     CARTESIA_API_KEY   + CARTESIA_VOICE_ID     [CARTESIA_MODEL]
//   3) Fish Audio   FISH_API_KEY       + FISH_VOICE_ID         [FISH_MODEL]
//   4) Hugging Face HF_TOKEN + (HF_TTS_URL | HF_TTS_MODEL)     (your fine-tune)
//   5) XTTS self-host  XTTS_API_URL                            (your sample, free forever)
//   ── everything below this line is NOT Anchit's voice ──
//   6) Sarvam AI    SARVAM_API_KEY     [SARVAM_LANG|SARVAM_VOICE|SARVAM_MODEL]
//
// Sarvam is last on purpose. Its `speaker` parameter is a closed enum of stock
// voices — the API has no cloned-voice id to pass (see viaSarvam below) — so it
// is the always-works safety net for Indic/code-mixed copy, never the clone.
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

// 4) Hugging Face — your own voice model (Inference Endpoint or public model).
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
// The last provider that is actually YOU. See tts-server/.
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

// 6) Sarvam AI — native Indian-language voices (English-IN, Hindi, Tamil, Telugu,
// Kannada, Malayalam, +more). The right engine for Indic and code-mixed copy.
//
// NOT A CLONE. Sarvam's voice cloning is a Sarvam Studio (browser) feature; the
// public REST API's `speaker` is a closed enum of stock voices, with no field
// for a cloned-voice id. Verified against Sarvam's own OpenAPI-generated SDKs
// (sarvamai@1.1.7 / sarvamai 0.1.28) — neither exposes any cloning endpoint.
// So this provider speaks Anchit's words in someone else's voice, which is why
// it runs only after every clone-capable provider has been tried. The default
// speaker is male to at least match the first-person copy — the previous
// default, `anushka`, is a female voice.
//
// If Sarvam ever ships cloned-voice ids, set SARVAM_VOICE=<that id>: an unknown
// speaker is sent as-is and retried once with the model default, so a wrong
// guess degrades to a working voice instead of a silent 400.

// Speakers are model-specific and NOT interchangeable: a v3 name on v2 is a 400.
const SARVAM_SPEAKERS = {
  'bulbul:v3': new Set(['shubh', 'aditya', 'ritu', 'priya', 'neha', 'rahul', 'pooja', 'rohan',
    'simran', 'kavya', 'amit', 'dev', 'ishita', 'shreya', 'ratan', 'varun', 'manan', 'sumit',
    'roopa', 'kabir', 'aayan', 'ashutosh', 'advait', 'anand', 'tanya', 'tarun', 'sunny', 'mani',
    'gokul', 'vijay', 'shruti', 'suhani', 'mohit', 'kavitha', 'rehan', 'soham', 'rupali']),
  'bulbul:v2': new Set(['anushka', 'manisha', 'vidya', 'arya', 'abhilash', 'karun', 'hitesh']),
};
// Male defaults — the copy is written in Anchit's first person.
const SARVAM_DEFAULT_SPEAKER = { 'bulbul:v3': 'shubh', 'bulbul:v2': 'abhilash' };
// The non-streaming endpoint returns base64 in `audios[]`, encoded per this codec.
const SARVAM_MIME = {
  wav: 'audio/wav', mp3: 'audio/mpeg', opus: 'audio/ogg', flac: 'audio/flac',
  aac: 'audio/aac', linear16: 'audio/wav', mulaw: 'audio/basic', alaw: 'audio/basic',
};
// The 11 languages TTS accepts. Odia is `od-IN`, not the more usual `or-IN`.
const SARVAM_LANGS = new Set(['bn-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN',
  'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN']);
// 32k/44.1k/48k are bulbul:v3 REST only; v2 tops out at 24k.
const SARVAM_RATES = new Set(['8000', '16000', '22050', '24000']);
const SARVAM_RATES_V3 = new Set([...SARVAM_RATES, '32000', '44100', '48000']);

// Every SARVAM_* value is typed by hand into a Vercel dashboard, and an
// out-of-range one comes back as a 400 — which this cascade reads as "provider
// down" and silently skips. So each is range-checked and falls back to a
// working default instead of costing us the provider.
function envNum(name, min, max, fallback) {
  const n = parseFloat(process.env[name]);
  return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
}
function envIn(name, allowed, fallback) {
  const v = (process.env[name] || '').trim();
  return allowed.has(v) ? v : fallback;
}

// Resolved separately from the request so GET /api/tts can show exactly what
// would be sent — a typo'd SARVAM_LANG is then visible there rather than only
// as an unexplained absence of Sarvam audio.
function sarvamConfig() {
  const model = SARVAM_SPEAKERS[process.env.SARVAM_MODEL] ? process.env.SARVAM_MODEL : 'bulbul:v3';
  const v3 = model === 'bulbul:v3';
  const codec = envIn('SARVAM_CODEC', new Set(Object.keys(SARVAM_MIME)), 'wav');
  // Speaker is deliberately NOT corrected here — viaSarvam sends it and retries,
  // so a future cloned-voice id gets a real attempt instead of being discarded.
  const speaker = (process.env.SARVAM_VOICE || SARVAM_DEFAULT_SPEAKER[model]).trim().toLowerCase();
  return {
    model, v3, speaker, codec,
    mime: SARVAM_MIME[codec],
    lang: envIn('SARVAM_LANG', SARVAM_LANGS, 'en-IN'),
    rate: envIn('SARVAM_SAMPLE_RATE', v3 ? SARVAM_RATES_V3 : SARVAM_RATES, '24000'),
    limit: v3 ? 2500 : 1500,                                  // per-request character cap
    pace: envNum('SARVAM_PACE', v3 ? 0.5 : 0.3, v3 ? 2.0 : 3.0, 1.0),
    temperature: envNum('SARVAM_TEMPERATURE', 0.01, 2.0, 0.6),   // v3 only
    knownSpeaker: SARVAM_SPEAKERS[model].has(speaker),
  };
}

async function viaSarvam(text) {
  const key = process.env.SARVAM_API_KEY;
  if (!key) return null;
  const c = sarvamConfig();

  // v3 takes 2500 chars, v2 only 1500 — truncating to the wrong one either
  // clips good audio or 400s the request.
  const body = {
    text: text.slice(0, c.limit),
    target_language_code: c.lang,     // the field name the official SDKs declare
    model: c.model,
    pace: c.pace,
    output_audio_codec: c.codec,
    speech_sample_rate: Number(c.rate),
  };
  // v3 rejects pitch/loudness and preprocesses automatically; v2 has no temperature.
  if (c.v3) body.temperature = c.temperature;
  else body.enable_preprocessing = true;

  const send = (speaker) => fetchTO('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: { 'api-subscription-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({}, body, { speaker })),
  });

  let r = await send(c.speaker);
  // An unrecognised speaker is the one failure worth retrying: it means either a
  // v2/v3 mismatch or a forward-looking id Sarvam does not accept yet.
  if (r.status === 400 && !c.knownSpeaker) r = await send(SARVAM_DEFAULT_SPEAKER[c.model]);

  if (isQuota(r.status)) return null;          // spent → next provider
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  const b64 = j && Array.isArray(j.audios) && j.audios[0];
  if (!b64) return null;
  return { type: c.mime, buf: Buffer.from(b64, 'base64') };
}

// Ordered cascade: every provider that can be Anchit's voice (`clone: true`)
// is tried before the one that can only be a stock voice. Within the clone
// group, hosted free tiers are chained first and the self-host is last.
const PROVIDERS = [
  { name: 'elevenlabs',  clone: true,  run: viaElevenLabs },
  { name: 'cartesia',    clone: true,  run: viaCartesia },
  { name: 'fish',        clone: true,  run: viaFish },
  { name: 'huggingface', clone: true,  run: viaHuggingFace },
  { name: 'xtts',        clone: true,  run: viaXTTS },
  { name: 'sarvam',      clone: false, run: viaSarvam },   // stock voice — see viaSarvam
];

// Which providers have their credentials set (no secrets exposed).
function configured() {
  const e = process.env;
  return {
    elevenlabs: !!(e.ELEVENLABS_API_KEY && e.ELEVENLABS_VOICE_ID),
    cartesia: !!(e.CARTESIA_API_KEY && e.CARTESIA_VOICE_ID),
    fish: !!(e.FISH_API_KEY && e.FISH_VOICE_ID),
    sarvam: !!e.SARVAM_API_KEY,
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
      // The question that actually matters: will the site speak in Anchit's
      // voice, or fall through to a stock one? False means every clone-capable
      // provider is unconfigured.
      clonedVoiceReady: PROVIDERS.some((p) => p.clone && cfg[p.name]),
      // What Sarvam would actually be sent, after validation. No secrets.
      sarvam: (() => {
        const s = sarvamConfig();
        return {
          model: s.model, speaker: s.speaker, language: s.lang, codec: s.codec,
          pace: s.pace, sampleRate: s.rate,
          knownSpeaker: s.knownSpeaker,   // false → retried with the model default
          clonedVoice: false,             // preset speakers only — see viaSarvam
        };
      })(),
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
        res.setHeader('X-Voice-Clone', provider.clone ? 'true' : 'false');
        return res.status(200).send(out.buf);
      }
    } catch { /* try next provider */ }
  }
  return res.status(503).json({ error: 'tts_unavailable' });
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 60 };
module.exports._test = {
  PROVIDERS, configured, isQuota,
  sarvamConfig, SARVAM_SPEAKERS, SARVAM_DEFAULT_SPEAKER, SARVAM_MIME, SARVAM_LANGS,
};
