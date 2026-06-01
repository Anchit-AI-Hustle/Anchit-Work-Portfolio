// /api/tts — secure ElevenLabs proxy.
// The API key lives ONLY in Vercel env (ELEVENLABS_API_KEY); never shipped to the client.
// POST { text } → streams back audio/mpeg in Anchit's cloned voice.
// If the key/voice is not configured, returns 503 so the client falls back to the
// browser's built-in speech synthesis (the site still talks, just not in his voice).
export const config = { runtime: 'nodejs' };

const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '';
const API_KEY  = process.env.ELEVENLABS_API_KEY || '';
const MODEL    = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')   return res.status(405).json({ error: 'POST only' });

  if (!API_KEY || !VOICE_ID) {
    // Not configured yet → tell the client to use its local voice.
    return res.status(503).json({ error: 'tts_not_configured', fallback: 'browser' });
  }

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const text = (body.text || '').toString().slice(0, 1200).trim();
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}/stream`, {
      method: 'POST',
      headers: { 'xi-api-key': API_KEY, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg' },
      body: JSON.stringify({
        text,
        model_id: MODEL,
        // Tuned for expressive, human delivery that respects punctuation & emotion.
        voice_settings: { stability: 0.45, similarity_boost: 0.85, style: 0.55, use_speaker_boost: true },
      }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(r.status === 401 ? 503 : 502).json({ error: 'elevenlabs_error', status: r.status, detail: detail.slice(0, 200), fallback: 'browser' });
    }
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'tts_failed', message: String(e).slice(0, 200), fallback: 'browser' });
  }
};
