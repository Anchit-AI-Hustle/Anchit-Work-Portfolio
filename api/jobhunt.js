// /api/jobhunt — a gated, bring-your-own-key live job-search agent.
//
//   GET  /api/jobhunt  → { supabaseUrl, supabaseAnonKey, gated }  (public config)
//   POST /api/jobhunt  → runs a live search using the CALLER'S own Anthropic key
//
// Gating: when SUPABASE_URL + SUPABASE_ANON_KEY are set, every POST must carry a
// valid Supabase auth token (Authorization: Bearer <access_token>) from a user
// who signed in via email magic-link. We verify it against Supabase's own auth
// server and require a confirmed email. The caller also supplies their OWN
// Anthropic key per request (x-anthropic-key header); that key is used
// transiently for that one search and is NEVER stored or logged on the server.
//
// Env:
//   SUPABASE_URL        e.g. https://abcd.supabase.co  (public project URL)
//   SUPABASE_ANON_KEY   the project's anon/publishable key (public, safe in browser)
//   ANTHROPIC_API_KEY   Optional owner fallback for private testing only. The
//                       public flow expects each visitor to bring their own key.
//   CLAUDE_MODEL        Optional; default claude-opus-4-8.

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';
const ALL_BOARDS = ['LinkedIn', 'Indeed', 'Glassdoor', 'Upwork'];

function buildSystem(boards) {
  return `You are JobHunt, an AI job-search agent. You search the web for CURRENT, real job openings and return them as structured data.

Rules:
- Use the web_search tool to find live postings on these boards: ${boards.join(', ')}. Prefer results whose links point at the actual job boards (linkedin.com/jobs, indeed.com, glassdoor.com, upwork.com).
- Return ONLY real openings you actually found in search results — never invent a company, title, or link. Every "link" must be a real URL that appeared in your search results.
- De-duplicate: never list the same role at the same company twice.
- Aim for up to 25 of the most relevant, recent results.

OUTPUT FORMAT — return ONLY a JSON array (no prose, no markdown fences, no commentary before or after). Each element:
{"title": string, "company": string, "location": string, "link": string, "source": one of ${JSON.stringify(boards)}}
If you genuinely find nothing, return []. Output the JSON array as your entire final message.`;
}

async function callAnthropic(apiKey, system, messages) {
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 8000,
      system,
      messages,
      tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 8 }],
    }),
  });
  return r;
}

function extractText(content) {
  return (content || []).filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
}

function parseListings(text) {
  if (!text) return [];
  // Strip accidental code fences, then grab the outermost JSON array.
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

// Verify a Supabase access token by asking the project's own auth server who it
// belongs to. Requires a confirmed email. When Supabase isn't configured, gating
// is off (the page shows a "not switched on" state instead).
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
    // Only trust a verified email.
    if (!u.email_confirmed_at && !u.confirmed_at) return { ok: false };
    return { ok: true, email: u.email };
  } catch (e) {
    return { ok: false };
  }
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-anthropic-key');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const supabaseUrl = process.env.SUPABASE_URL || 'https://rhvmpzjeyjminlvuhozx.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJodm1wempleWptaW5sdnVob3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODE2MTgsImV4cCI6MjA5NTQ1NzYxOH0.qmwLy5GYg5ymby-TY1Jc2k9s49XmqoAX_9NMq2ILjdg';
  const gated = !!(supabaseUrl && supabaseAnonKey);

  // Public config the page reads on load so it knows whether/how to gate.
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      supabaseUrl: supabaseUrl || null,
      supabaseAnonKey: supabaseAnonKey || null,
      gated,
    });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  // --- Gate: require a valid magic-link sign-in when configured ---
  const auth = (req.headers['authorization'] || '').toString();
  const token = auth.replace(/^Bearer\s+/i, '').trim();
  const gate = await verifySupabase(token, supabaseUrl, supabaseAnonKey);
  if (!gate.ok) return res.status(401).json({ error: 'signin_required' });

  // --- Bring-your-own key: use the caller's Anthropic key, transiently ---
  const headerKey = (req.headers['x-anthropic-key'] || '').toString().trim();
  const apiKey = headerKey || process.env.ANTHROPIC_API_KEY || '';
  if (!apiKey) return res.status(400).json({ error: 'byo_key_required' });
  if (!/^sk-ant-/.test(apiKey)) return res.status(400).json({ error: 'bad_key' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const role = (body.role || '').toString().slice(0, 160).trim();
  const location = (body.location || '').toString().slice(0, 120).trim();
  let boards = Array.isArray(body.boards) ? body.boards.filter((b) => ALL_BOARDS.includes(b)) : [];
  if (!boards.length) boards = ALL_BOARDS.slice();
  if (!role) return res.status(400).json({ error: 'role required' });

  const ask = `Find current job openings for "${role}"${location ? ` in ${location}` : ''}. Search ${boards.join(', ')} and return the JSON array of results.`;
  const messages = [{ role: 'user', content: ask }];

  try {
    let data = null;
    // Web search runs a server-side loop; if it pauses, resume until it finishes.
    for (let i = 0; i < 8; i++) {
      const r = await callAnthropic(apiKey, buildSystem(boards), messages);
      if (!r.ok) {
        const detail = await r.text().catch(() => '');
        // 401/403 from Anthropic almost always means the caller's own key is bad.
        if (r.status === 401 || r.status === 403) return res.status(401).json({ error: 'bad_key' });
        return res.status(502).json({ error: 'upstream', status: r.status, detail: detail.slice(0, 200) });
      }
      const d = await r.json();
      if (d.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: d.content });
        continue;
      }
      data = d;
      break;
    }
    if (!data) return res.status(504).json({ error: 'search_timeout' });

    const results = parseListings(extractText(data.content));
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ results, count: results.length, role, location, boards });
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed', message: String(e).slice(0, 200) });
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 60 };
