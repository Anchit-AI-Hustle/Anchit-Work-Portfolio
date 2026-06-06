// /api/tts - XTTS-v2 proxy for Anchit's cloned narration.
// The model runs in the FastAPI service under tts-server/app.py. This Vercel
// function proxies to it so the browser receives generated speech, not the
// reference sample file.
export const config = { runtime: 'nodejs' };

const XTTS_URL = (process.env.XTTS_API_URL || process.env.LOCAL_XTTS_API_URL || 'http://127.0.0.1:8000/api/tts').replace(/\/$/, '');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch {}

  const text = (body.text || '').toString().replace(/\s+/g, ' ').trim().slice(0, 1200);
  if (!text) return res.status(400).json({ error: 'text required' });

  try {
    const upstream = await fetch(XTTS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'audio/wav,audio/mpeg,audio/*' },
      body: JSON.stringify({ text }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(503).json({
        error: 'xtts_unavailable',
        status: upstream.status,
        detail: detail.slice(0, 240),
      });
    }

    const contentType = upstream.headers.get('content-type') || 'audio/wav';
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).send(buf);
  } catch (error) {
    return res.status(503).json({
      error: 'xtts_unavailable',
      message: String(error).slice(0, 240),
    });
  }
};
