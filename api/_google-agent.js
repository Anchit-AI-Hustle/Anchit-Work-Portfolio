// Google Vertex AI Agent Builder — an optional, env-gated answer engine.
//
// When configured, /api/chat asks YOUR Agent Builder app first, so answers come
// from an agent you own and can ground on your own data store. Anything missing
// or failing falls through to Claude, and then to the offline knowledge base in
// index.html — the chat never breaks because this is unconfigured.
//
// Two ways to point it at an agent:
//
//   1) A Discovery Engine app (the usual "Agent Builder" app), assembled from:
//        GOOGLE_PROJECT_ID     e.g. my-project-1234
//        GOOGLE_AGENT_ENGINE   the app / engine id
//        GOOGLE_AGENT_LOCATION optional; default "global" (also eu, us)
//        GOOGLE_AGENT_SERVING  optional; default "default_serving_config"
//      → POSTs to …/engines/{engine}/servingConfigs/{serving}:answer
//
//   2) GOOGLE_AGENT_URL — a full endpoint URL, used verbatim. Use this for any
//      other shape: Dialogflow CX :detectIntent, a deployed Reasoning Engine, or
//      an ADK service. Set GOOGLE_AGENT_BODY_STYLE=raw to send {query, session}
//      instead of the Discovery Engine body.
//
// Auth, in order:
//   GOOGLE_ACCESS_TOKEN         a pre-minted OAuth token (simplest to test with;
//                               expires in ~1h, so not for production)
//   GOOGLE_SERVICE_ACCOUNT_JSON the service-account JSON, verbatim. A token is
//                               minted from it with the JWT-bearer flow and
//                               cached until shortly before it expires.
//
// NOTE: this has not been exercised against a live Google project from here — no
// credentials exist in this environment. The request/response shapes follow the
// documented Discovery Engine `:answer` contract. Configure it and the debug
// endpoint (GET /api/chat) will report whether it is reachable.

const crypto = require('crypto');

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function b64url(input) {
  return Buffer.from(input).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function fetchTO(url, opts, ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms || 20000);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); }
  finally { clearTimeout(t); }
}

// Minted tokens are good for an hour; re-minting on every message would add a
// second round trip to every single reply. Cached per warm instance.
let cachedToken = { value: '', expiresAt: 0 };

async function accessToken() {
  const direct = (process.env.GOOGLE_ACCESS_TOKEN || '').trim();
  if (direct) return direct;

  const raw = (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim();
  if (!raw) return '';

  const now = Math.floor(Date.now() / 1000);
  if (cachedToken.value && cachedToken.expiresAt - 60 > now) return cachedToken.value;

  let sa;
  try { sa = JSON.parse(raw); } catch { return ''; }
  if (!sa.client_email || !sa.private_key) return '';

  // Dashboard-pasted JSON usually carries literal \n inside the key.
  const key = String(sa.private_key).replace(/\\n/g, '\n');
  const claim = {
    iss: sa.client_email, scope: SCOPE, aud: TOKEN_URL,
    iat: now, exp: now + 3600,
  };
  const signingInput = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + b64url(JSON.stringify(claim));

  let assertion;
  try {
    const sig = crypto.createSign('RSA-SHA256').update(signingInput).sign(key);
    assertion = signingInput + '.' + b64url(sig);
  } catch { return ''; }   // malformed key — stay silent, the caller falls through

  const r = await fetchTO(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }).toString(),
  }, 12000);
  if (!r.ok) return '';
  const j = await r.json().catch(() => null);
  if (!j || !j.access_token) return '';
  cachedToken = { value: j.access_token, expiresAt: now + (Number(j.expires_in) || 3600) };
  return cachedToken.value;
}

function endpoint() {
  const explicit = (process.env.GOOGLE_AGENT_URL || '').trim();
  if (explicit) return explicit;

  const project = (process.env.GOOGLE_PROJECT_ID || '').trim();
  const engine = (process.env.GOOGLE_AGENT_ENGINE || '').trim();
  if (!project || !engine) return '';

  const location = (process.env.GOOGLE_AGENT_LOCATION || 'global').trim();
  const serving = (process.env.GOOGLE_AGENT_SERVING || 'default_serving_config').trim();
  // Non-global locations are served from a regional host.
  const host = location === 'global'
    ? 'https://discoveryengine.googleapis.com'
    : `https://${location}-discoveryengine.googleapis.com`;
  return `${host}/v1/projects/${encodeURIComponent(project)}/locations/${encodeURIComponent(location)}` +
         `/collections/default_collection/engines/${encodeURIComponent(engine)}` +
         `/servingConfigs/${encodeURIComponent(serving)}:answer`;
}

function configured() {
  return !!endpoint() && !!((process.env.GOOGLE_ACCESS_TOKEN || '').trim() || (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '').trim());
}

// Agent Builder returns the answer under different keys depending on the surface
// (Discovery Engine answer vs. Dialogflow CX vs. a custom deployment), so the
// reply is picked from the documented shape first, then common alternatives.
function pickReply(j) {
  if (!j) return '';
  if (j.answer && typeof j.answer.answerText === 'string') return j.answer.answerText.trim();
  if (typeof j.answerText === 'string') return j.answerText.trim();
  // Dialogflow CX :detectIntent
  const msgs = j.queryResult && j.queryResult.responseMessages;
  if (Array.isArray(msgs)) {
    const text = msgs.map((m) => (m && m.text && Array.isArray(m.text.text) ? m.text.text.join(' ') : '')).join(' ').trim();
    if (text) return text;
  }
  if (typeof j.output === 'string') return j.output.trim();
  if (typeof j.reply === 'string') return j.reply.trim();
  return '';
}

// `session` threads multi-turn context on Google's side. The caller passes back
// whatever it received last time, so the agent keeps the conversation.
async function ask(message, session) {
  if (!configured()) return null;
  const url = endpoint();
  const token = await accessToken();
  if (!token) return null;

  const raw = (process.env.GOOGLE_AGENT_BODY_STYLE || '').trim() === 'raw';
  const body = raw
    ? { query: message, session: session || undefined }
    : {
        query: { text: message },
        session: session || undefined,
        answerGenerationSpec: {
          includeCitations: false,
          ignoreLowRelevantContent: true,
        },
      };

  const r = await fetchTO(url, {
    method: 'POST',
    headers: {
      authorization: 'Bearer ' + token,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  }, 25000);

  if (!r.ok) {
    const detail = await r.text().catch(() => '');
    return { ok: false, status: r.status, detail: detail.slice(0, 200) };
  }
  const j = await r.json().catch(() => null);
  const reply = pickReply(j);
  if (!reply) return { ok: false, status: 200, detail: 'no_answer_text' };
  return { ok: true, reply, session: (j && j.session && (j.session.name || j.session)) || session || '' };
}

module.exports = { ask, configured, endpoint, accessToken, pickReply, _b64url: b64url };
