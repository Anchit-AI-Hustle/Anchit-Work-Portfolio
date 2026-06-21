// /api/chat-stream — REAL-TIME cloned-voice chat. One request, two pipelined streams:
//
//   Claude tokens ──► SSE `token` events (text renders live)
//        │  sentence boundary
//        ▼
//   XTTS (Anchit's cloned voice) ──► SSE `audio` events: base64 WAV packets that
//   the frontend packet player starts playing while later sentences are still
//   being generated — YouTube-style buffering.
//
// Key design point: TTS runs on a serial promise chain *concurrently* with the
// token read loop. Token streaming is never blocked by synthesis.
//
// SSE contract (consumed by llmVoiceStream in index.html):
//   event: token          data: { text }
//   event: state          data: { status, seq }
//   event: audio          data: { seq, mime, audioBase64, text }
//   event: audio-skipped  data: { seq }
//   event: done           data: { text }
//   event: error          data: { error }
//
// Env:
//   ANTHROPIC_API_KEY      required
//   CLAUDE_MODEL           optional (default claude-haiku-4-5-20251001)
//   XTTS_API_URL           self-hosted clone endpoint, accepts POST {text} → WAV.
//                          e.g. https://anchit--xtts.modal.run/api/tts
//   ELEVENLABS_API_KEY + ELEVENLABS_VOICE_ID   optional fallback clone
//
// With no TTS configured, text still streams; packets report 'audio-skipped'.

const MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const XTTS_URL = (process.env.XTTS_PACKET_URL || process.env.XTTS_API_URL || '').replace(/\/$/, '');

const PERSONA = `You are Anchit Tandon, speaking in first person on your portfolio site.

Answer the exact question asked, from these facts. Always attribute each project to the right company. Never invent numbers. If something isn't covered, say what you can answer and suggest WhatsApp, a call, or a 30-minute Google Meet.

Who I am: an engineer who moved into product and growth. About five plus years across product and engineering. Computer Science at VIT, 2016 to 2020. Based in Delhi. I work at the intersection of product, growth and revenue, and I don't stop until I find the real constraint underneath a problem.

Now, at Vahdam India, since the twentieth of April twenty twenty six. I'm AGM, Product Management, D to C Growth, across the US, UK and global, still early in the role. My headline project is VAHDAM Lifecycle OS, a retention workflow that connects analytics, lifecycle planning, segmentation and mailer generation into one system. I also built the All in One LP Agent, a live Vahdam UK landing page with one embedded agent that narrates the page, talks back by voice, answers chat, and recommends products. And Mailer Architect, a multi LLM email generator for Vahdam marketing. UK marketing revenue also went up early on. If ratings come up, that's a supporting contribution, not the headline.

Before that, Times Internet, from twenty twenty two to April twenty twenty six, A P M to Senior P M. ET Prime is the Economic Times' premium business subscription. I led its Assisted Sales channel and scaled it five times, from fifteen lakh to eighty lakh rupees in monthly recurring revenue, in about six months, and I built an A I telesuite with live call transcription, pitch scoring and conversion assists that delivered over four hundred percent R O I and won the Times Internet Team Award. ET Markets is the Economic Times' markets arm. I led its end to end revamp across web, mobile, Android and i O S, adding three crore plus in incremental annual recurring revenue, twenty seven percent more engagement and twenty five percent more daily active users. I also owned TOI Plus, launched Times Health Plus subscriptions from scratch, and launched the inaugural Times Internet Delhi Half Marathon twenty twenty six from zero to one, a fifteen thousand plus participant event and a new revenue stream. If someone asks my biggest or proudest career win, I name both, equally: scaling ET Prime Assisted Sales five times to eighty lakh, and launching that Delhi Half Marathon from zero to one. One is a growth win, the other a zero to one product launch.

Earlier I was a backend engineer at Citymall and Tuple Technologies.

Side builds: The Third Eye, also called Jarvis, is a context aware A I operating system with four personas sharing tasks, notes, knowledge base, search and voice, and it's the one I'm most passionate about. MusicGenAI is my passion project because music matters to me, an app that writes full songs from a prompt and exposes every stage of the pipeline. Hey Yaara is a voice first companion for elderly people. AI TeleSuite packages the ET Prime sales playbook for solo sellers. TH Plus LifeEngine is a private A I wellness planner that extends my Times Health Plus work. Task Tracker turns emails, meetings and voice notes into tasks. And this portfolio is a hobby build.

I'm open to roles and collaborations. To reach me: WhatsApp first, then a call, then a thirty minute Google Meet. Phone plus nine one nine eight seven three nine four five two three eight. Email anchit dot tandon at gmail dot com.

Style: concise, specific, first person, conversational. Your words are spoken aloud in your cloned voice, so write the way you talk: short sentences, no markdown, no bullet lists, no emoji. Do not say you are an AI model.`;

function writeEvent(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// ---------- TTS providers (sentence-sized request = one audio packet) ----------

async function ttsXtts(text) {
  if (!XTTS_URL) return null;
  // Accept either a bare host or a full endpoint path.
  const url = /\/api\/tts(-packet)?$/.test(XTTS_URL) ? XTTS_URL : `${XTTS_URL}/api/tts`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/*' },
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) return null;
  return { mime: r.headers.get('content-type') || 'audio/wav', buf: Buffer.from(await r.arrayBuffer()) };
}

async function ttsElevenLabs(text) {
  const key = process.env.ELEVENLABS_API_KEY, voice = process.env.ELEVENLABS_VOICE_ID;
  if (!key || !voice) return null;
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.4, similarity_boost: 0.85 },
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) return null;
  return { mime: 'audio/mpeg', buf: Buffer.from(await r.arrayBuffer()) };
}

// Pronounce acronyms as letters (US -> "U S", not "us") before synthesis.
function forSpeech(t) {
  let s = String(t || '');
  const rules = [
    [/\bU\.?S\.?A\.?\b/g, 'U S A'], [/\bU\.?S\.?D\b/g, 'U S D'],
    [/\bU\.?S\.?\b/g, 'U S'], [/\bU\.?K\.?\b/g, 'U K'],
    [/\bD2C\b/g, 'D to C'], [/\bB2B\b/g, 'B to B'], [/\bB2C\b/g, 'B to C'],
    [/\bDAUs?\b/g, 'daily active users'],
    [/\bAGM\b/g, 'A G M'], [/\bMRR\b/g, 'M R R'], [/\bARR\b/g, 'A R R'],
    [/\bROI\b/g, 'R O I'], [/\bAPI\b/g, 'A P I'], [/\bPWA\b/g, 'P W A'],
    [/\bLLM\b/g, 'L L M'], [/\bCRM\b/g, 'C R M'], [/\bCSE\b/g, 'C S E'],
    [/\bTOI\b/g, 'T O I'], [/\bIST\b/g, 'I S T'], [/\bINR\b/g, 'I N R'],
    [/\bSMS\b/g, 'S M S'], [/\bPDF\b/g, 'P D F'], [/\bUX\b/g, 'U X'], [/\bUI\b/g, 'U I'],
    [/\bIP\b/g, 'I P'], [/\bAI\b/g, 'A I'], [/\bOS\b/g, 'O S'], [/\bET\b/g, 'E T'],
    [/\bKSM-?66\b/gi, 'K S M sixty-six'],
  ];
  for (const [re, rep] of rules) s = s.replace(re, rep);
  return s;
}

async function synthesize(rawText) {
  const text = forSpeech(rawText);
  for (const provider of [ttsXtts, ttsElevenLabs]) {
    try {
      const out = await provider(text);
      if (out && out.buf && out.buf.length > 0) return out;
    } catch { /* try next */ }
  }
  return null;
}

// ---------- Sentence chunking: ~2-3s of speech per packet ----------

const MIN_CHUNK = 60;   // avoid micro-packets ("Hi.")
const MAX_CHUNK = 220;  // force a split on run-on sentences

function takeChunk(buf) {
  const re = /[.!?…]["')\]]?\s/g;
  let m;
  while ((m = re.exec(buf)) !== null) {
    const end = m.index + m[0].length;
    if (end >= MIN_CHUNK) return [buf.slice(0, end).trim(), buf.slice(end)];
  }
  if (buf.length >= MAX_CHUNK) {
    const cut = buf.lastIndexOf(' ', MAX_CHUNK);
    const at = cut > MIN_CHUNK ? cut : MAX_CHUNK;
    return [buf.slice(0, at).trim(), buf.slice(at)];
  }
  return [null, buf];
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

// ---------- Handler ----------

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

  const history = Array.isArray(body.history) ? body.history.slice(-6).filter(
    m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string'
  ) : [];
  const messages = [...history.map(m => ({ role: m.role, content: m.content.slice(0, 2000) })),
    { role: 'user', content: message }];

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  writeEvent(res, 'state', { status: 'thinking' });

  // Serial TTS chain that runs CONCURRENTLY with token streaming.
  // Packets stay in order; tokens never wait for synthesis.
  let seq = 0;
  let ttsChain = Promise.resolve();
  let ttsFailures = 0;
  const enqueueTts = (chunkText) => {
    const mySeq = seq++;
    ttsChain = ttsChain.then(async () => {
      if (ttsFailures >= 2) { writeEvent(res, 'audio-skipped', { seq: mySeq }); return; }
      writeEvent(res, 'state', { status: 'buffering-audio', seq: mySeq });
      const out = await synthesize(chunkText);
      if (out) {
        writeEvent(res, 'audio', {
          seq: mySeq, mime: out.mime, audioBase64: out.buf.toString('base64'), text: chunkText,
        });
      } else {
        ttsFailures += 1;
        writeEvent(res, 'audio-skipped', { seq: mySeq });
      }
    }).catch(() => { writeEvent(res, 'audio-skipped', { seq: mySeq }); });
  };

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
    let pending = '';   // raw SSE buffer from Anthropic
    let sentence = '';  // text awaiting a sentence boundary
    let fullText = '';

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
          sentence += text;
          writeEvent(res, 'token', { text });
          let chunk;
          [chunk, sentence] = takeChunk(sentence);
          while (chunk) {              // enqueue, never await — keeps tokens flowing
            enqueueTts(chunk);
            [chunk, sentence] = takeChunk(sentence);
          }
        }
      }
    }

    if (sentence.trim()) enqueueTts(sentence.trim());
    await ttsChain;  // let the voice catch up before closing
    writeEvent(res, 'done', { text: fullText.trim() });
    return res.end();
  } catch (e) {
    try { writeEvent(res, 'error', { error: 'stream_failed', message: String(e).slice(0, 160) }); } catch {}
    return res.end();
  }
}

module.exports = handler;
module.exports.config = {
  runtime: 'nodejs',
  supportsResponseStreaming: true,
  maxDuration: 90,
};
