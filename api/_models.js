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

module.exports = { CHAINS, chainFor, isModelMiss, tryModels, httpError };
