// /api/chat-stream — token streaming + small cloned-voice audio packets.
//
// The browser reads this as Server-Sent Events:
//   event: token  { text }
//   event: audio  { seq, mime, audioBase64, text }
//   event: done   { text }
//
// This keeps the Vercel edge of the portfolio simple while letting a separate
// self-hosted XTTS GPU service do packet synthesis. The GPU service can expose
// /api/tts-packet and/or /ws/tts; this route uses HTTP packets because Vercel
// serverless functions do not keep WebSocket servers open.

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const XTTS_PACKET_URL = (process.env.XTTS_PACKET_URL || process.env.XTTS_API_URL || '').replace(/\/$/, '');

const PERSONA = `You are Anchit Tandon, speaking in first person on your portfolio site.

Answer only from these facts. If a visitor asks for something not covered, say what you can answer accurately and suggest WhatsApp, call, email, or a 30-minute Google Meet.

Facts:
- Current role: AGM - Product Management, D2C Growth - US, UK and Global at Vahdam India. Started 20 April 2026.
- Vahdam highlight so far: VAHDAM Lifecycle OS, a retention workflow connecting analytics, planning, segmentation, and mailer generation. UK marketing revenue has also increased. Do not make rating improvement the headline.
- Previously Times Internet: APM to Senior PM. ET Prime Assisted Sales scaled 5x to about Rs 80L MRR in 8-10 months. ET Markets and ET revamp added Rs 3Cr+ incremental ARR, +27% engagement, +25% DAU, +15% session duration. Assisted Buying grew qualified leads from about 30 to 150+ per day. Subscriber retention improved about 10%.
- Led the inaugural Times Internet Delhi Half Marathon 2026 end-to-end as a 0 to 1 consumer IP with 15,000+ participants.
- Engineering background: B.Tech CSE at VIT Vellore, backend roles at Tuple Technologies and Citymall before product.
- Strengths: curiosity, depth, innovation, experimentation, creative ideas, hunger to succeed.
- Open to roles and collaborations.
- Projects: VAHDAM Lifecycle OS is the most important work project; this portfolio is a hobby product; MusicGenAI is the passion project for music. Other builds: Task Tracker, The Third Eye, Hey Yaara, Mailer Architect, AI TeleSuite, TH+ LifeEngine.
- Contact order: WhatsApp, Call, Set up a 30-Mins Google Meet, WhatsApp, SMS, Email, Resume. Phone +91 98739 45238. Email anchit.tandon@gmail.com. Based in Delhi, IST.

Style: concise, specific, first person, conversational. Do not say you are an AI model.`;

function writeEvent(res, event, data) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function shouldFlushPacket(text) {
  const clean = text.trim();
  return clean.length >= 140 || /[.!?]\s*$/.test(clean);
}

function takePacket(buffer) {
  const match = buffer.match(/^([\s\S]{90,260}?[.!?])(\s+|$)/);
  if (match) return [match[1].trim(), buffer.slice(match[0].length)];
  if (buffer.length >= 220) return [buffer.slice(0, 220).trim(), buffer.slice(220)];
  return [null, buffer];
}

async function synthPacket(text) {
  if (!XTTS_PACKET_URL || !text) return null;
  const url = XTTS_PACKET_URL.endsWith('/api/tts-packet') ? XTTS_PACKET_URL : `${XTTS_PACKET_URL}/api/tts-packet`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
    body: JSON.stringify({ text, format: 'wav' }),
  });
  if (!r.ok) return null;
  const mime = r.headers.get('content-type') || 'audio/wav';
  const audioBase64 = Buffer.from(await r.arrayBuffer()).toString('base64');
  return { mime, audioBase64 };
}

function parseAnthropicSse(raw) {
  const out = [];
  for (const block of raw.split('\n\n')) {
    const dataLine = block.split('\n').find(line => line.startsWith('data: '));
    if (!dataLine) continue;
    const data = dataLine.slice(6).trim();
    if (!data || data === '[DONE]') continue;
    try { out.push(JSON.parse(data)); } catch {}
  }
  return out;
}

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
  const history = Array.isArray(body.history) ? body.history.slice(-6).filter(
    m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
  ) : [];
  if (!message) return res.status(400).json({ error: 'message required' });

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  writeEvent(res, 'state', { status: 'thinking' });

  const messages = [...history.map(m => ({ role: m.role, content: m.content.slice(0, 2000) })),
    { role: 'user', content: message }];

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model: MODEL, max_tokens: 650, system: PERSONA, messages, stream: true }),
    });
    if (!upstream.ok || !upstream.body) {
      writeEvent(res, 'error', { error: 'upstream', status: upstream.status });
      return res.end();
    }

    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let pending = '';
    let packetBuffer = '';
    let fullText = '';
    let seq = 0;

    async function maybeEmitAudio(force = false) {
      while (force ? packetBuffer.trim() : shouldFlushPacket(packetBuffer)) {
        const result = force ? [packetBuffer.trim(), ''] : takePacket(packetBuffer);
        const packetText = result[0];
        packetBuffer = result[1] || '';
        if (!packetText) break;
        writeEvent(res, 'state', { status: 'buffering-audio', seq, text: packetText });
        try {
          const audio = await synthPacket(packetText);
          if (audio) writeEvent(res, 'audio', { seq, text: packetText, ...audio });
          else writeEvent(res, 'audio-skipped', { seq, text: packetText });
        } catch {
          writeEvent(res, 'audio-skipped', { seq, text: packetText });
        }
        seq += 1;
      }
    }

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      pending += decoder.decode(value, { stream: true });
      const lastBoundary = pending.lastIndexOf('\n\n');
      if (lastBoundary < 0) continue;
      const parseable = pending.slice(0, lastBoundary + 2);
      pending = pending.slice(lastBoundary + 2);
      for (const evt of parseAnthropicSse(parseable)) {
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          const text = evt.delta.text || '';
          fullText += text;
          packetBuffer += text;
          writeEvent(res, 'token', { text });
          await maybeEmitAudio(false);
        }
      }
    }
    await maybeEmitAudio(true);
    writeEvent(res, 'done', { text: fullText.trim() });
    return res.end();
  } catch (e) {
    writeEvent(res, 'error', { error: 'stream_failed', message: String(e).slice(0, 160) });
    return res.end();
  }
}

module.exports = handler;
module.exports.config = { runtime: 'nodejs', maxDuration: 60 };
