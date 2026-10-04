// Provider model chains — the single place a model id is written down.
//
// WHY THIS FILE EXISTS
//   api/apply.js, api/lifecycle.js and api/mailer.js each pinned ONE hardcoded
//   model id per provider. Every one of those ids is now dead:
//
//     groq      llama-3.3-70b-versatile   deprecated 2026-06-17  -> 404
//     cerebras  llama-3.3-70b             deprecated 2026-02-16  -> 404
//     gemini    gemini-2.0-flash          shut down  2026-06-01  -> 404
//
//   The whole free cascade was therefore returning nothing, and because each
//   caller swallowed the error (`catch (e) { /* next provider */ }`) it failed
//   silently into the deterministic template. Nothing in the response said a
//   provider had 404'd, so the symptom users saw was only ever the generic
//   "the AI provider is unavailable" — undiagnosable from the outside.
//
//   api/cascade.js already learned this lesson for Anthropic and left a note
//   saying so ("A chain, not a single id... a wrong id degrades to a slower
//   success instead of an invisible placeholder"). This applies that same rule
//   to the other four providers, in one shared module so the next retirement is
//   a one-line edit rather than three files drifting apart.
//
// ORDERING
//   Newest first, previous generation next, the retired id last. A chain that
//   leads with the current model costs nothing while that model lives, and
//   self-heals into the next one the day it is retired — at the price of a
//   single wasted round-trip, which is why the dead ids are kept rather than
//   deleted: they are still the right answer for anyone on a committed-spend
//   contract where the deprecation does not apply.
//
//   OpenRouter stays on `:free` variants only. The paid ids resolve there too,
//   but silently moving a free fallback onto a billed model is not a fix.

const CHAINS = {
  groq: ['openai/gpt-oss-120b', 'qwen/qwen3.6-27b', 'llama-3.3-70b-versatile'],
  cerebras: ['gpt-oss-120b', 'llama-3.3-70b'],
  gemini: ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-2.5-flash-lite'],
  openrouter: ['openai/gpt-oss-120b:free', 'meta-llama/llama-3.3-70b-instruct:free'],
};

// Env override wins and is tried first, so a model can be forced from the
// dashboard without a deploy — the reason the *_MODEL vars existed at all.
// Read per call, not at module load: a warm function would otherwise hold a
// stale value until the instance recycled.
function chainFor(provider) {
  const key = String(provider || '').toLowerCase();
  const base = CHAINS[key] || [];
  const override = (process.env[key.toUpperCase() + '_MODEL'] || '').trim();
  const out = override ? [override].concat(base) : base.slice();
  return out.filter((m, i) => m && out.indexOf(m) === i);
}

// Is this failure "wrong model id" rather than "provider is having a bad day"?
// Only a model miss should advance the chain. A bad key (401/403), a rate limit
// (429) or an outage (5xx) will fail identically for every id, so burning the
// rest of the chain on those just adds latency before the same answer.
function isModelMiss(err) {
  const status = err && err.status;
  if (status === 404) return true;
  if (status !== 400) return false;
  return /model|not found|does not exist|not supported|decommission|deprecat/i
    .test(String((err && err.reason) || (err && err.message) || ''));
}

// Run `attempt(model)` down the chain. Returns the first non-empty result and
// the id that produced it. Throws an Error carrying `.attempts` — the reason
// each id failed — so a caller can report why instead of going quiet.
async function tryModels(provider, attempt) {
  const models = chainFor(provider);
  if (!models.length) throw Object.assign(new Error(provider + ': no model configured'), { attempts: [] });

  const attempts = [];
  for (let i = 0; i < models.length; i++) {
    const model = models[i];
    try {
      const out = await attempt(model);
      if (out) return { out, model };
      attempts.push(model + ':empty');
    } catch (e) {
      attempts.push(model + ':' + String((e && (e.reason || e.message)) || e).slice(0, 60));
      if (!isModelMiss(e)) break;   // not a model problem — the rest will fail the same way
    }
  }
  throw Object.assign(new Error(provider + ' failed: ' + attempts.join(' | ')), { attempts, provider });
}

// Turn a non-ok Response into an Error that carries enough to decide the above.
// `http_404` alone — what these files threw before — cannot be told apart from
// any other failure once it reaches the cascade.
async function httpError(r) {
  let reason = '';
  try { reason = (await r.text() || '').slice(0, 200); } catch (e) { /* body already consumed or empty */ }
  return Object.assign(new Error('http_' + r.status), { status: r.status, reason });
}

// ── keys, read across the spellings that are actually in use ───────────────
//
// THE BUG THIS FIXES
//   Three keys are set in the Vercel project under names no code reads, so
//   feeding them in repeatedly changed nothing:
//
//     Vercel has              code read
//     Gemini_API_Key          GEMINI_API_KEY        process.env is case-
//                                                   sensitive on Linux
//     OpemRouter_API_KEY      OPENROUTER_API_KEY    "Opem", and the var's own
//                                                   comment says "open router"
//     ELEVEN_LABS_API_KEY     ELEVENLABS_API_KEY    extra underscore
//
//   api/lifecycle.js had already hit this for Gemini and grown a local
//   geminiKey() that reads the casings. That fix never reached the other
//   providers or the other endpoints. Reading a list of spellings here means a
//   key that is present is a key that is used, wherever it is read from, and a
//   future casing slip costs nothing.
const envAny = (...names) => {
  const e = process.env;
  for (const n of names) { const v = (e[n] || '').trim(); if (v) return v; }
  return '';
};
const KEYS = {
  gemini: () => envAny('GEMINI_API_KEY', 'Gemini_API_Key', 'GEMINI_KEY',
    'GOOGLE_API_KEY', 'GOOGLE_GENAI_API_KEY', 'GOOGLE_GEMINI_API_KEY'),
  groq: () => envAny('GROQ_API_KEY', 'Groq_API_Key', 'GROQ_KEY'),
  cerebras: () => envAny('CEREBRAS_API_KEY', 'Cerebras_API_Key'),
  openrouter: () => envAny('OPENROUTER_API_KEY', 'OpemRouter_API_KEY',
    'OpenRouter_API_KEY', 'OPEN_ROUTER_API_KEY', 'OPENROUTER_KEY'),
};

// ── the free cascade ───────────────────────────────────────────────────────

const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS || 25000);
async function fetchTO(url, opts) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), TIMEOUT_MS);
  try { return await fetch(url, Object.assign({}, opts, { signal: c.signal })); }
  finally { clearTimeout(t); }
}

// Groq, Cerebras and OpenRouter all speak the OpenAI chat shape.
async function oaiChat(url, key, model, system, prompt, maxTokens, extraHeaders) {
  const msgs = system ? [{ role: 'system', content: system }, { role: 'user', content: prompt }]
                      : [{ role: 'user', content: prompt }];
  const r = await fetchTO(url, {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json', Authorization: 'Bearer ' + key }, extraHeaders || {}),
    body: JSON.stringify({ model, messages: msgs, temperature: 0.6, max_tokens: maxTokens }),
  });
  if (!r.ok) throw await httpError(r);
  const d = await r.json();
  return (d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content) || '';
}

async function geminiGen(key, model, system, prompt, maxTokens) {
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model
    + ':generateContent?key=' + encodeURIComponent(key);
  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.6, maxOutputTokens: maxTokens },
  };
  if (system) body.systemInstruction = { parts: [{ text: system }] };
  const opts = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) };
  let r = await fetchTO(url, opts);
  // One retry on a rate limit: the free tier returns 429 under light bursts and
  // succeeds moments later. Any other status is reported, not retried.
  if (r.status === 429) { await new Promise((s) => setTimeout(s, 2500)); r = await fetchTO(url, opts); }
  if (!r.ok) throw await httpError(r);
  const d = await r.json();
  const parts = (d.candidates && d.candidates[0] && d.candidates[0].content && d.candidates[0].content.parts) || [];
  return parts.filter((x) => typeof x.text === 'string').map((x) => x.text).join('').trim();
}

/**
 * Try every configured free provider in order and return the first real answer.
 *
 * Resolves { text, provider, model } or throws an Error carrying `.attempts`,
 * one line per provider. Failures are COLLECTED, never swallowed: a cascade
 * that is entirely dead used to look identical to one with no keys set, and
 * both surfaced as the same unexplained placeholder.
 */
async function freeGenerate(prompt, opts) {
  const o = opts || {};
  const system = o.system || '';
  const maxTokens = o.maxTokens || 4096;
  const runs = [];
  const gq = KEYS.groq();
  if (gq) runs.push(['groq', (m) => oaiChat('https://api.groq.com/openai/v1/chat/completions', gq, m, system, prompt, maxTokens)]);
  const cb = KEYS.cerebras();
  if (cb) runs.push(['cerebras', (m) => oaiChat('https://api.cerebras.ai/v1/chat/completions', cb, m, system, prompt, maxTokens)]);
  const gk = KEYS.gemini();
  if (gk) runs.push(['gemini', (m) => geminiGen(gk, m, system, prompt, maxTokens)]);
  const or = KEYS.openrouter();
  if (or) runs.push(['openrouter', (m) => oaiChat('https://openrouter.ai/api/v1/chat/completions', or, m, system, prompt, maxTokens, {
    'HTTP-Referer': 'https://anchit-tandon.com', 'X-Title': 'anchit-tandon.com',
  })]);

  if (!runs.length) throw Object.assign(new Error('no free provider key configured'), { attempts: [] });

  const attempts = [];
  for (const [name, attempt] of runs) {
    try {
      const { out, model } = await tryModels(name, attempt);
      if (out && out.trim()) return { text: out, provider: name, model };
      attempts.push(name + ':empty');
    } catch (e) {
      attempts.push(name + ':' + String((e && e.message) || e).slice(0, 120));
    }
  }
  throw Object.assign(new Error('all free providers failed: ' + attempts.join(' | ')), { attempts });
}

module.exports = { CHAINS, chainFor, isModelMiss, tryModels, httpError, KEYS, freeGenerate };
