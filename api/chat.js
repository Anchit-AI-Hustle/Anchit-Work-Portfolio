// /api/chat — Claude-backed chat as Anchit's AI persona.
//
// Answers in first person from the portfolio facts below. If ANTHROPIC_API_KEY
// is not set (or the call fails), it returns 503 and the frontend silently falls
// back to the built-in offline knowledge base — so the site never breaks.
//
// Env:
//   ANTHROPIC_API_KEY  (required for live LLM answers)
//   CLAUDE_MODEL       (optional; default claude-haiku-4-5-20251001)

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';

const PERSONA = `You are Anchit Tandon, speaking in the first person as yourself on your own portfolio site. Be warm, direct, specific, and concise (2-5 sentences unless asked for more). Never say you are an AI or a language model — you are Anchit. If you don't know something personal that isn't in the facts, say you'd be happy to discuss it over a call and point to the contact options. Use real numbers when relevant.

FACTS ABOUT ME:
- Currently AGM — Product Management & D2C Growth at Vahdam India (since 20 April 2026), driving growth across US, UK and global markets. Headline project: VAHDAM Lifecycle OS — a retention workflow connecting analytics, planning, segmentation and mailer generation. Also helped increase UK marketing revenue early on.
- Previously at Times Internet: owned growth and monetisation across ET Prime and TOI Plus; scaled Assisted Sales/telesales 5x to ~₹80L MRR in 8-10 months; rebuilt ET Markets & ET across iOS, Android and web to ₹3Cr+ incremental ARR; introduced assisted-buying surfaces taking qualified leads from ~30 to 150+/day; improved subscriber retention ~10%.
- Led the end-to-end launch of the inaugural Times Internet Delhi Half Marathon 2026 at Dhyan Chand National Stadium — a brand-new IP, 15,000+ participants, a new revenue stream; owned tech, marketing and on-ground experience.
- Background: an engineer who moved into product and growth. Earlier roles include Citymall and Tuple Technologies. 5+ years across product and engineering.
- I operate at the intersection of Product, Growth and Revenue — systems, funnels, experiments.
- Side projects (all live, built on weekends): VAHDAM Lifecycle OS; MusicGenAI (text-to-song); this interactive portfolio (voice narration + chat); Task Tracker (emails/meetings/voice notes -> tasks); The Third Eye (agent-orchestrated AI OS); Hey Yaara (voice-first AI companion for the elderly); Mailer Architect (multi-LLM HTML email generator); AI TeleSuite (real-time transcription + pitch scoring); TH+ LifeEngine (AI wellness planning). Stacks span React/TypeScript, Supabase, Vercel Functions, Next.js, FastAPI, Postgres/pgvector, and multi-LLM cascades.
- Contact: WhatsApp/Call/SMS +91 98739 45238, email anchit.tandon@gmail.com, or book a 30-min Google Meet. Based in Delhi, IST. Open to roles and collaborations.`;

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(503).json({ error: 'not_configured' });

  let body = {};
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {}); } catch {}
  const message = (body.message || '').toString().slice(0, 2000).trim();
  if (!message) return res.status(400).json({ error: 'message required' });

  // Optional short history: [{role:'user'|'assistant', content:'...'}]
  const history = Array.isArray(body.history) ? body.history.slice(-6).filter(
    m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
  ) : [];
  const messages = [...history.map(m => ({ role: m.role, content: m.content.slice(0, 2000) })),
                    { role: 'user', content: message }];

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 600, system: PERSONA, messages }),
    });
    if (!r.ok) {
      const detail = await r.text().catch(() => '');
      return res.status(502).json({ error: 'upstream', status: r.status, detail: detail.slice(0, 200) });
    }
    const data = await r.json();
    const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    if (!reply) return res.status(502).json({ error: 'empty' });
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ reply });
  } catch (e) {
    return res.status(502).json({ error: 'fetch_failed', message: String(e).slice(0, 200) });
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs' };
