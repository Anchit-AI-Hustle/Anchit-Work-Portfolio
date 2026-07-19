// /api/jobhunt — a gated live job-search agent, powered by Gemini (free tier).
//
//   GET  /api/jobhunt  → { supabaseUrl, supabaseAnonKey, gated, engineReady }
//   POST /api/jobhunt  → runs a live search and returns real openings
//
// Access is gated behind Google sign-in (via Supabase): every POST must carry a
// valid Supabase session token (Authorization: Bearer <access_token>). The search
// itself runs on Google Gemini's free tier with Google Search grounding, using a
// single server-side key — so no visitor needs their own API key.
//
// Env:
//   SUPABASE_URL        public project URL (e.g. https://abcd.supabase.co)
//   SUPABASE_ANON_KEY   public anon key (safe in browser)
//   GEMINI_API_KEY      free Gemini key from aistudio.google.com — SERVER-SIDE only
//   GEMINI_MODEL        optional; default gemini-2.0-flash

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const ALL_BOARDS = ['LinkedIn', 'Indeed', 'Glassdoor', 'Upwork'];

function buildPrompt(role, location, boards) {
  return `You are JobHunt, a job-search agent with live web search. Find CURRENT, real job openings for "${role}"${location ? ` in ${location}` : ''} on these boards: ${boards.join(', ')}.

Rules:
- Use web search to find live postings. Prefer links that point at the actual boards (linkedin.com/jobs, indeed.com, glassdoor.com, upwork.com).
- Only include real openings you actually found in search results — never invent a company, title, or link. Every link must be a real URL from your search.
- De-duplicate: never list the same role at the same company twice.
- Aim for up to 20 of the most relevant, recent results.

OUTPUT FORMAT — return ONLY a JSON array, no prose and no markdown fences, before or after. Each element:
{"title": string, "company": string, "location": string, "link": string, "source": string}
"source" should name which board the link is from (e.g. "LinkedIn"). If you genuinely find nothing, return []. Output the JSON array as your entire response.`;
}

async function callGemini(apiKey, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + MODEL + ':generateContent?key=' + encodeURIComponent(apiKey);
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    }),
  });
  return r;
}

function extractText(data) {
  try {
    const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
    return parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('').trim();
  } catch (e) {
    return '';
  }
}

function parseListings(text) {
  if (!text) return [];
  let t = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const start = t.indexOf('[');
  const end = t.lastIndexOf(']');
  if (start === -1 || end === -1 || end < start) return [];
  try {
    const arr = JSON.parse(t.slice(start, end + 1));
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((j) => j && typeof j.link === 'string' && /^https?:\/\//i.test(j.link) && j.title)
      .map((j) => ({
        title: String(j.title).slice(0, 200),
        company: String(j.company || '').slice(0, 160),
        location: String(j.location || '').slice(0, 160),
        link: String(j.link).slice(0, 600),
        source: String(j.source || '').slice(0, 40),
      }))
      .slice(0, 30);
  } catch (e) {
    return [];
  }
}

// Verify a Supabase session token against the project's own auth server. Requires
// a confirmed email (Google sign-in is always confirmed). Gating is off if
// Supabase isn't configured.
async function verifySupabase(token, url, anonKey) {
  if (!url || !anonKey) return { ok: true, email: null };
  if (!token) return { ok: false };
  try {
    const base = url.replace(/\/+$/, '');
    const r = await fetch(base + '/auth/v1/user', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + token },
    });
    if (!r.ok) return { ok: false };
    const u = await r.json();
    if (!u || !u.email) return { ok: false };
    if (!u.email_confirmed_at && !u.confirmed_at) return { ok: false };
    return { ok: true, email: u.email };
  } catch (e) {
    return { ok: false };
  }
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL || 'https://rhvmpzjeyjminlvuhozx.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJodm1wempleWptaW5sdnVob3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODE2MTgsImV4cCI6MjA5NTQ1NzYxOH0.qmwLy5GYg5ymby-TY1Jc2k9s49XmqoAX_9NMq2ILjdg';
  // Accept common name/casing variants so a mis-cased env var still works.
  const env = process.env;
  const geminiKey = (env.GEMINI_API_KEY || env.Gemini_API_Key || env.GEMINI_KEY
    || env.GOOGLE_API_KEY || env.GOOGLE_GENAI_API_KEY || env.GOOGLE_GEMINI_API_KEY || '').trim();
  const gated = !!(supabaseUrl && supabaseAnonKey);

  // Public config the page reads on load.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      supabaseUrl: supabaseUrl || null,
      supabaseAnonKey: supabaseAnonKey || null,
      gated,
      engineReady: !!geminiKey,
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // --- Gate: require a valid Google sign-in when configured ---
  const auth = (req.headers['authorization'] || '').toString();
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const gate = await verifySupabase(token, supabaseUrl, supabaseAnonKey);
  if (!gate.ok) return res.status(401).json({ error: 'signin_required' });

  // --- Engine: server-side free Gemini key ---
  if (!geminiKey) return res.status(503).json({ error: 'engine_not_configured' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const role = (body.role || '').toString().slice(0, 160).trim();
  const location = (body.location || '').toString().slice(0, 120).trim();
  let boards = Array.isArray(body.boards) ? body.boards.filter((b) => ALL_BOARDS.includes(b)) : [];
  if (!boards.length) boards = ALL_BOARDS.slice();
  if (!role) return res.status(400).json({ error: 'role required' });

  try {
    const r = await callGemini(geminiKey, buildPrompt(role, location, boards));
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      if (r.status === 429) return res.status(429).json({ error: 'rate_limited' });
      if (r.status === 400 || r.status === 403) return res.status(502).json({ error: 'engine_error', detail: detail.slice(0, 200) });
      return res.status(502).json({ error: 'upstream', status: r.status, detail: detail.slice(0, 200) });
    }
    const data = await r.json();
    const results = parseListings(extractText(data));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ results, count: results.length, role, location, boards });
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed', message: String(e).slice(0, 200) });
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 60 };
