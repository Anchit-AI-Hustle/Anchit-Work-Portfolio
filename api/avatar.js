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
// Env:
//   DID_API_KEY        (required)  your D-ID API key
//   DID_SOURCE_URL     portrait image URL (defaults to the site hero image)
//   ELEVENLABS_VOICE_ID  use your cloned ElevenLabs voice (connect ElevenLabs
//                        inside the D-ID dashboard first); else a default voice
//   DID_VOICE_ID       Microsoft voice id fallback (default en-US-GuyNeural)

const DID_BASE = 'https://api.d-id.com';
const DEFAULT_SOURCE = process.env.DID_SOURCE_URL || 'https://anchit-tandon.com/AnchitTandon-AppLogo.png';

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

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const auth = authHeader();

  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ configured: !!auth, voice: process.env.ELEVENLABS_VOICE_ID ? 'cloned' : 'default', source: DEFAULT_SOURCE });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  if (!auth) return res.status(503).json({ error: 'avatar_not_configured' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const text = (body.text || '').toString().replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) return res.status(400).json({ error: 'text required' });

  res.setHeader('Cache-Control', 'no-store');
  try {
    const id = await createTalk(auth, text);
    const resultUrl = await pollTalk(auth, id, Date.now() + 55000);
    return res.status(200).json({ resultUrl });
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (msg === 'insufficient_credits') return res.status(402).json({ error: 'insufficient_credits' });
    if (msg === 'timeout') return res.status(504).json({ error: 'render_timeout' });
    return res.status(502).json({ error: 'avatar_failed', detail: msg.slice(0, 60) });
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 60 };
module.exports._test = { buildScript, authHeader };
