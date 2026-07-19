// /api/apply — auto-apply kit generator (tailored resume + cover letter).
//
//   POST /api/apply  → { resume, coverLetter, fit }
//
// Given the caller's profile (pasted resume text OR a portfolio URL) and a target
// job, Gemini writes a tailored one-page resume and a cover letter — grounded in
// the profile, never inventing experience. Gated behind Google sign-in (Supabase).
//
// Env:
//   SUPABASE_URL, SUPABASE_ANON_KEY   gate (same project as /api/jobhunt)
//   GEMINI_API_KEY (or Gemini_API_Key / GEMINI_KEY / GOOGLE_API_KEY …)  free Gemini key
//   GEMINI_MODEL   optional; default gemini-2.0-flash

function geminiKey() {
  const e = process.env;
  return (e.GEMINI_API_KEY || e.Gemini_API_Key || e.GEMINI_KEY || e.GOOGLE_API_KEY
    || e.GOOGLE_GENAI_API_KEY || e.GOOGLE_GEMINI_API_KEY || '').trim();
}
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const CEREBRAS_MODEL = process.env.CEREBRAS_MODEL || 'llama-3.3-70b';
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || 'meta-llama/llama-3.3-70b-instruct:free';

function haveAnyProvider() {
  return !!(process.env.GROQ_API_KEY || process.env.CEREBRAS_API_KEY || geminiKey() || process.env.OPENROUTER_API_KEY);
}

async function verifySupabase(token, url, anonKey) {
  if (!url || !anonKey) return { ok: true, email: null };
  if (!token) return { ok: false };
  try {
    const r = await fetch(url.replace(/\/+$/, '') + '/auth/v1/user', { headers: { apikey: anonKey, Authorization: 'Bearer ' + token } });
    if (!r.ok) return { ok: false };
    const u = await r.json();
    if (!u || !u.email) return { ok: false };
    if (!u.email_confirmed_at && !u.confirmed_at) return { ok: false };
    return { ok: true, email: u.email };
  } catch (e) { return { ok: false }; }
}

// Remove <tag>…</tag> blocks (script/style) via a plain scan — no regex, so it
// can't be fooled by odd closing tags the way a tag-filtering regexp can.
function stripTagBlocks(html, tag) {
  const lower = html.toLowerCase();
  const openStr = '<' + tag, closeStr = '</' + tag;
  let out = '', i = 0;
  for (;;) {
    const open = lower.indexOf(openStr, i);
    if (open === -1) return out + html.slice(i);
    out += html.slice(i, open);
    const close = lower.indexOf(closeStr, open);
    if (close === -1) return out;            // unterminated — drop the tail
    const gt = lower.indexOf('>', close);
    if (gt === -1) return out;
    i = gt + 1;
  }
}

// Fetch a portfolio/CV URL and reduce it to readable text.
async function fetchProfileFromUrl(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (JobHunt apply)' }, signal: ctrl.signal });
    clearTimeout(t);
    if (!r.ok) return '';
    let html = await r.text();
    // Strip script/style blocks with a plain scan, then remove remaining tags.
    html = stripTagBlocks(stripTagBlocks(html, 'script'), 'style');
    // Decode a minimal entity set; ampersand LAST to avoid double-unescaping.
    const text = html.replace(/<[^>]+>/g, ' ')
      .replace(/&(?:nbsp|#0*160);/gi, ' ')
      .replace(/&(?:lt|#0*60);/gi, '<')
      .replace(/&(?:gt|#0*62);/gi, '>')
      .replace(/&(?:amp|#0*38);/gi, '&')
      .replace(/\s+/g, ' ').trim();
    return text.slice(0, 6000);
  } catch (e) { return ''; }
}

function buildPrompt(profile, job) {
  return `You are an expert career assistant. Using ONLY the candidate's real background below, write a tailored application for the target job. Never invent employers, titles, degrees, dates or metrics that aren't supported by the profile — rephrase and prioritise what's already there.

=== CANDIDATE PROFILE ===
${profile.slice(0, 8000)}

=== TARGET JOB ===
Title: ${job.title || ''}
Company: ${job.company || ''}
Location: ${job.location || ''}
${job.description ? 'Description: ' + String(job.description).slice(0, 2500) : ''}
${job.link ? 'Link: ' + job.link : ''}

Produce:
1. "resume" — a concise, one-page resume in clean Markdown, reordered and reworded to match this role (summary, key skills, most relevant experience with impact bullets, education).
2. "coverLetter" — a specific, warm, 3–4 short paragraph cover letter addressed to the hiring team, connecting the candidate's real strengths to this exact role and company. No clichés, no invented facts.
3. "fit" — 2–3 sentences on why the candidate fits and any honest gap to address.

OUTPUT FORMAT — return ONLY a JSON object, no markdown fences, no commentary:
{"resume": string, "coverLetter": string, "fit": string}`;
}

async function fetchTO(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 18000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); }
  finally { clearTimeout(t); }
}

// One OpenAI-compatible chat call (Groq / Cerebras / OpenRouter). Returns the
// message text, or throws (with '429' when rate-limited) so the cascade moves on.
async function oaiChat(url, key, model, prompt, jsonMode, extraHeaders) {
  const body = { model, messages: [{ role: 'user', content: prompt }], temperature: 0.5, max_tokens: 4096 };
  if (jsonMode) body.response_format = { type: 'json_object' };
  const r = await fetchTO(url, { method: 'POST', headers: Object.assign({ 'content-type': 'application/json', Authorization: 'Bearer ' + key }, extraHeaders || {}), body: JSON.stringify(body) });
  if (r.status === 429) throw new Error('429');
  if (!r.ok) throw new Error('http_' + r.status);
  const d = await r.json();
  return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
}

async function geminiGen(key, prompt) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + GEMINI_MODEL + ':generateContent?key=' + encodeURIComponent(key);
  const opts = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 4096 } }) };
  let r = await fetchTO(url, opts);
  if (r.status === 429) { await new Promise((s) => setTimeout(s, 2500)); r = await fetchTO(url, opts); }
  if (r.status === 429) throw new Error('429');
  if (!r.ok) throw new Error('http_' + r.status);
  const d = await r.json();
  const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  return parts.filter((p) => typeof p.text === 'string').map((p) => p.text).join('').trim();
}

// Try free providers in order of free-tier generosity until one returns a kit.
async function generate(prompt) {
  const providers = [];
  if (process.env.GROQ_API_KEY) providers.push({ n: 'groq', run: () => oaiChat('https://api.groq.com/openai/v1/chat/completions', process.env.GROQ_API_KEY, GROQ_MODEL, prompt, true) });
  if (process.env.CEREBRAS_API_KEY) providers.push({ n: 'cerebras', run: () => oaiChat('https://api.cerebras.ai/v1/chat/completions', process.env.CEREBRAS_API_KEY, CEREBRAS_MODEL, prompt, true) });
  const gk = geminiKey();
  if (gk) providers.push({ n: 'gemini', run: () => geminiGen(gk, prompt) });
  if (process.env.OPENROUTER_API_KEY) providers.push({ n: 'openrouter', run: () => oaiChat('https://openrouter.ai/api/v1/chat/completions', process.env.OPENROUTER_API_KEY, OPENROUTER_MODEL, prompt, false, { 'HTTP-Referer': 'https://anchit-tandon.com/jobhunt', 'X-Title': 'JobHunt' }) });

  const errs = [];
  for (const p of providers) {
    try {
      const kit = parseKit(await p.run());
      if (kit && (kit.resume || kit.coverLetter)) return { kit };
      errs.push(p.n + ':bad_output');
    } catch (e) { errs.push(p.n + ':' + String((e && e.message) || e).slice(0, 30)); }
  }
  return { detail: errs.join(' | ') };
}

function parseKit(text) {
  if (!text) return null;
  let t = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a === -1 || b === -1 || b < a) return null;
  try {
    const o = JSON.parse(t.slice(a, b + 1));
    if (!o || typeof o !== 'object') return null;
    return {
      resume: String(o.resume || '').slice(0, 12000),
      coverLetter: String(o.coverLetter || '').slice(0, 8000),
      fit: String(o.fit || '').slice(0, 1200),
    };
  } catch (e) { return null; }
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const supabaseUrl = process.env.SUPABASE_URL || 'https://rhvmpzjeyjminlvuhozx.supabase.co';
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJodm1wempleWptaW5sdnVob3p4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4ODE2MTgsImV4cCI6MjA5NTQ1NzYxOH0.qmwLy5GYg5ymby-TY1Jc2k9s49XmqoAX_9NMq2ILjdg';
  const auth = (req.headers['authorization'] || '').toString();
  const gate = await verifySupabase(auth.replace(/^Bearer\s+/i, '').trim(), supabaseUrl, supabaseAnonKey);
  if (!gate.ok) return res.status(401).json({ error: 'signin_required' });

  if (!haveAnyProvider()) return res.status(503).json({ error: 'engine_not_configured' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const job = (body.job && typeof body.job === 'object') ? body.job : {};
  let profile = (body.resume || '').toString().trim();
  const portfolioUrl = (body.portfolioUrl || '').toString().trim();

  if (!profile && /^https?:\/\//i.test(portfolioUrl)) profile = await fetchProfileFromUrl(portfolioUrl);
  if (!profile) return res.status(400).json({ error: 'profile_required' });
  if (!job.title) return res.status(400).json({ error: 'job_required' });

  try {
    const out = await generate(buildPrompt(profile, job));
    if (out.kit) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).json(out.kit);
    }
    // Every configured provider failed. If it was rate limits, say so.
    const rateLimited = /429/.test(out.detail || '');
    return res.status(rateLimited ? 429 : 502).json({ error: rateLimited ? 'rate_limited' : 'engine_error', detail: (out.detail || '').slice(0, 300) });
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed', message: String(e).slice(0, 200) });
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 30 };
module.exports._test = { generate, parseKit, stripTagBlocks };
