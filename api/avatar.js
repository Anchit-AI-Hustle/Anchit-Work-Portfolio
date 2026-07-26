// /api/avatar — photoreal talking-head agent via D-ID (streaming-avatar route).
//
//   POST /api/avatar  { text }  → { resultUrl }   (a rendered talking-head video)
//   GET  /api/avatar             → { configured }  (is the avatar wired up?)
//
// Turns a line of text into a video of Anchit's portrait speaking it, in his
// cloned voice. Uses D-ID: a talk is created from a source image + script, then
// polled until the result video is ready. Ungated but requires a D-ID key; if
// unconfigured it returns 503 so the page falls back to the existing
// voice-only agent (portrait + /api/tts).
//
// Engines, in order: a self-hosted open-source model (free) if configured, then
// D-ID. Set AVATAR_API_URL to use an open-source talking-head such as
// LongCat-Video-Avatar 1.5 (MIT) behind your own GPU endpoint.
//
// Env:
//   AVATAR_API_URL     optional; self-hosted avatar endpoint (tried first)
//   AVATAR_API_KEY     optional; bearer token for that endpoint
//   DID_API_KEY        your D-ID API key (fallback engine)
//   DID_SOURCE_URL     portrait image URL (defaults to the site hero image)
//   ELEVENLABS_VOICE_ID  use your cloned ElevenLabs voice (connect ElevenLabs
//                        inside the D-ID dashboard first); else a default voice
//   DID_VOICE_ID       Microsoft voice id fallback (default en-US-GuyNeural)

const DID_BASE = 'https://api.d-id.com';
// The source MUST be a clear, front-facing photo of a real face — talking-head
// engines reject logos/posters ("no face detected"). AnchitTandon-AppLogo.png is
// a branded poster (monogram + text + sunglasses), so it can never drive an
// avatar; the portrait photo is used instead. For best results set
// DID_SOURCE_URL to a close, front-facing, well-lit headshot with no sunglasses.
const DEFAULT_SOURCE = process.env.DID_SOURCE_URL || 'https://anchit-tandon.com/assets/anchit-profile.jpg';

function authHeader() {
  const key = (process.env.DID_API_KEY || '').trim();
  if (!key) return null;
  // D-ID uses HTTP Basic with the key as username and an empty password.
  return 'Basic ' + Buffer.from(key + ':').toString('base64');
}

function buildScript(text) {
  const eleven = (process.env.ELEVENLABS_VOICE_ID || '').trim();
  if (eleven) {
    return { type: 'text', input: text, provider: { type: 'elevenlabs', voice_id: eleven } };
  }
  return { type: 'text', input: text, provider: { type: 'microsoft', voice_id: process.env.DID_VOICE_ID || 'en-US-GuyNeural' } };
}

async function fetchTO(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 15000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); }
  finally { clearTimeout(t); }
}

async function createTalk(auth, text) {
  const body = {
    source_url: DEFAULT_SOURCE,
    script: buildScript(text),
    config: { stitch: true },
  };
  const r = await fetchTO(DID_BASE + '/talks', {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  if (r.status === 402) throw new Error('insufficient_credits');
  if (!r.ok) throw new Error('create_failed_' + r.status);
  const d = await r.json();
  if (!d || !d.id) throw new Error('no_talk_id');
  return d.id;
}

async function pollTalk(auth, id, deadline) {
  for (;;) {
    if (Date.now() > deadline) throw new Error('timeout');
    const r = await fetchTO(DID_BASE + '/talks/' + encodeURIComponent(id), {
      headers: { Authorization: auth, Accept: 'application/json' },
    });
    if (!r.ok) throw new Error('poll_failed_' + r.status);
    const d = await r.json();
    if (d.status === 'done' && d.result_url) return d.result_url;
    if (d.status === 'error' || d.status === 'rejected') throw new Error('render_' + (d.status || 'error'));
    await new Promise((s) => setTimeout(s, 1500));
  }
}

// ── Self-hosted / open-source avatar (tried FIRST when configured) ──────────
// Lets the avatar run on an open-source audio-driven talking-head model instead
// of a paid, credit-metered vendor — e.g. LongCat-Video-Avatar 1.5 (MIT, Meituan)
// deployed behind a GPU endpoint (Replicate / Modal / RunPod / HF Inference
// Endpoint). Those models are self-hosted only (no public inference API), so the
// endpoint URL is taken from the environment rather than hardcoded to any vendor.
//
//   AVATAR_API_URL    POST target; receives { text, sourceUrl, voiceId }
//   AVATAR_API_KEY    optional bearer token for that endpoint
//
// The endpoint should return JSON containing a playable video URL under any of
// resultUrl | url | video | output (a bare string or a 1-element array is fine).
function pickUrl(j) {
  if (!j) return '';
  const c = j.resultUrl || j.url || j.video || j.output || j.video_url;
  if (typeof c === 'string') return c;
  if (Array.isArray(c) && typeof c[0] === 'string') return c[0];
  return '';
}

async function viaSelfHosted(text) {
  const url = (process.env.AVATAR_API_URL || '').trim();
  if (!url) return '';
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' };
  const key = (process.env.AVATAR_API_KEY || '').trim();
  if (key) headers.authorization = 'Bearer ' + key;
  const r = await fetchTO(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ text, sourceUrl: DEFAULT_SOURCE, voiceId: process.env.ELEVENLABS_VOICE_ID || '' }),
  }, 55000);
  if (!r.ok) return '';
  const j = await r.json().catch(() => null);
  return pickUrl(j);
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = authHeader();
  const selfHosted = !!(process.env.AVATAR_API_URL || '').trim();

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      configured: !!(auth || selfHosted),
      engine: selfHosted ? 'self-hosted' : (auth ? 'did' : 'none'),
      voice: process.env.ELEVENLABS_VOICE_ID ? 'cloned' : 'default',
      source: DEFAULT_SOURCE,
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!auth && !selfHosted) return res.status(503).json({ error: 'avatar_not_configured' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const text = (body.text || '').toString().replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) return res.status(400).json({ error: 'text required' });

  res.setHeader('Cache-Control', 'no-store');

  // 1) Open-source / self-hosted engine first (free, no credits). Any failure
  //    falls through to D-ID so the avatar keeps working.
  if (selfHosted) {
    try {
      const resultUrl = await viaSelfHosted(text);
      if (resultUrl) return res.status(200).json({ resultUrl, engine: 'self-hosted' });
    } catch { /* fall through to D-ID */ }
    if (!auth) return res.status(502).json({ error: 'avatar_failed', detail: 'self_hosted_no_result' });
  }

  // 2) D-ID.
  try {
    const id = await createTalk(auth, text);
    const resultUrl = await pollTalk(auth, id, Date.now() + 55000);
    return res.status(200).json({ resultUrl, engine: 'did' });
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (msg === 'insufficient_credits') return res.status(402).json({ error: 'insufficient_credits' });
    if (msg === 'timeout') return res.status(504).json({ error: 'render_timeout' });
    return res.status(502).json({ error: 'avatar_failed', detail: msg.slice(0, 60) });
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 60 };
module.exports._test = { buildScript, authHeader, pickUrl, viaSelfHosted };
