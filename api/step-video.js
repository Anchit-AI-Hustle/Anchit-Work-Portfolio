// /api/step-video — find a REAL YouTube tutorial for a How-To step using Claude
// + web search, so the How-To Engine can embed actual footage inline (no YouTube
// Data API key needed — it reuses ANTHROPIC_API_KEY).
//
//   GET  /api/step-video?q=...   ->  { videoId?, embedUrl?, watchUrl }
//   POST /api/step-video { q }   ->  same
//
// Never throws: if Claude / web search is unavailable it returns just `watchUrl`
// (a YouTube search) so the UI falls back to a link. Results are cacheable.

// A chain, not one id. This endpoint has been returning its link-only fallback
// in production: the live response carried the "request failed" cache header
// (3600s) rather than the "no key" one (86400s), so the key IS present and the
// call itself was failing — almost certainly this pinned model id. Trying
// several turns a wrong id into a slower success instead of a silent downgrade.
const MODELS = [
  process.env.STEP_VIDEO_MODEL,
  'claude-sonnet-5',
  'claude-opus-5',
  'claude-sonnet-4-6',
].filter(Boolean);

// One attempt against one model. Returns the parsed reply text, or throws.
async function askClaude(model, apiKey, q, signal) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    signal,
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model,
      max_tokens: 400,
      // Web search grounds the answer in real, current results so the returned
      // video id actually exists (Claude alone would hallucinate ids).
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
      system:
        'You find the single best real, currently-available YouTube tutorial video for a "how to" step. ' +
        'Use web search to locate it. Reply with ONLY the full https://www.youtube.com/watch?v=... URL of the ' +
        'best video and nothing else. If you cannot find a good specific video, reply with exactly: NONE.',
      messages: [{ role: 'user', content: `Find the best YouTube tutorial video for: ${q}` }],
    }),
  });
  if (!r.ok) throw new Error(String(r.status));
  const data = await r.json();
  return (data.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(' ');
}

const ytSearch = (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);

// Pull the first valid 11-char YouTube video id out of any text/URL form.
function extractVideoId(text) {
  const m = String(text || '').match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|[?&]v=)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : '';
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  let q = '';
  if (req.method === 'GET') q = (req.query && req.query.q) || '';
  else { let b = {}; try { b = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {} q = b.q || ''; }
  q = (q || '').toString().slice(0, 200).replace(/\s+/g, ' ').trim();
  if (!q) return res.status(400).json({ error: 'q required' });

  const watchUrl = ytSearch(q);
  const apiKey = process.env.ANTHROPIC_API_KEY;
  // No key → link fallback (cache a day so the client isn't hammered).
  if (!apiKey) { res.setHeader('Cache-Control', 'public, max-age=86400'); return res.status(200).json({ watchUrl }); }

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25000);
  try {
    let text = '';
    for (const model of MODELS) {
      try { text = await askClaude(model, apiKey, q, controller.signal); break; }
      catch { /* try the next id */ }
    }
    const videoId = extractVideoId(text);
    // 86400 on a real answer, 3600 when every model failed — the difference is
    // how this endpoint's silent failure was diagnosed from the outside.
    res.setHeader('Cache-Control', videoId ? 'public, max-age=86400' : 'public, max-age=3600');
    return res.status(200).json(
      videoId
        ? { videoId, embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`, watchUrl: `https://www.youtube.com/watch?v=${videoId}` }
        : { watchUrl },
    );
  } catch (e) {
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).json({ watchUrl });
  } finally {
    clearTimeout(t);
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 30 };
