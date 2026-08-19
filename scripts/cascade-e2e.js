// Drives the REAL request handlers end-to-end, not the chain helper in isolation.
//
// scripts/provider-chain.js tests tryModels() directly, with its own stub in
// place of the network call. That proves the helper is correct and proves
// nothing about whether api/mailer.js, api/lifecycle.js and api/apply.js
// actually USE it correctly — which is where the original bug lived. This file
// calls each exported handler with a fake req/res and a stubbed global.fetch,
// then asserts on the requests that were really made and the JSON that really
// came back.
//
// Run: node scripts/cascade-e2e.js        (exit 0 = pass)
//      MUT=1 node scripts/cascade-e2e.js  (every check must fail)

const assert = require('assert');
const fs = require('fs');
const path = require('path');
// Two mutation modes, because two different faults are being guarded and one
// blanket mutation cannot break both: shortening a chain to a single id makes
// "a 404 advances within the provider" fail, but simultaneously makes "a 401
// does not burn the chain" trivially true. Each check names the mode that
// should break it; under that mode those checks must fail AND the rest must
// still pass, which is a stronger claim than "everything failed".
//
//   MUT=ids       one pinned, retired id per provider  (the shipped bug)
//   MUT=classify  isModelMiss always true              (chain burnt on any error)
const MUT = process.env.MUT || '';

const results = [];
// covered=false marks a check this mutation cannot break — it guards a
// behaviour that does not depend on the model chain. Saying so beats pretending.
function check(name, fn, breaks = 'ids') {
  try { fn(); results.push(['PASS', name, '', breaks]); }
  catch (e) { results.push(['FAIL', name, (e && e.message) || String(e), breaks]); }
}

// THE MUTATION: put the pre-fix state back into the module the handlers really
// require — one pinned, retired id per provider, and an httpError that loses
// the status so a dead id can no longer be told from a dead provider. This is
// the actual bug, not a flipped assertion.
const MODELS = require(path.join(__dirname, '..', 'api/_models.js'));
if (MUT === 'ids') {
  MODELS.CHAINS.groq = ['llama-3.3-70b-versatile'];
  MODELS.CHAINS.cerebras = ['llama-3.3-70b'];
  MODELS.CHAINS.gemini = ['gemini-2.0-flash'];
  MODELS.CHAINS.openrouter = ['meta-llama/llama-3.3-70b-instruct:free'];
}
if (MUT === 'classify') {
  // Reassigning MODELS.isModelMiss does nothing: tryModels calls it as a
  // module-local reference, not through the exports object. So mutate the
  // SOURCE and inject the result into require.cache under the same resolved
  // path, which is what the routes will then receive.
  const Module = require('module');
  const p = require.resolve(path.join(__dirname, '..', 'api/_models.js'));
  const src = fs.readFileSync(p, 'utf8').replace('if (!isModelMiss(e)) break;', '/* mutated: never stop */');
  if (src === fs.readFileSync(p, 'utf8')) throw new Error('classify mutation did not apply — the guard line moved');
  const m = new Module(p, null);
  m.filename = p; m.paths = Module._nodeModulePaths(path.dirname(p));
  m._compile(src, p);
  require.cache[p] = m;
  Object.assign(MODELS, m.exports);
}

// ── Harness ───────────────────────────────────────────────────────────────
const calls = [];
function stubFetch(script) {
  global.fetch = async (url, opts) => {
    const body = opts && opts.body ? JSON.parse(opts.body) : {};
    // Gemini carries the model in the path, the OpenAI-shaped ones in the body.
    const model = body.model || (String(url).match(/models\/([^:]+):/) || [, ''])[1];
    const provider = /groq/.test(url) ? 'groq' : /cerebras/.test(url) ? 'cerebras'
      : /generativelanguage/.test(url) ? 'gemini' : /openrouter/.test(url) ? 'openrouter' : 'other';
    calls.push({ provider, model });
    const step = script(provider, model, calls.length);
    if (step.status && step.status >= 400) {
      return { ok: false, status: step.status, async text() { return step.body || ''; }, async json() { return {}; } };
    }
    return { ok: true, status: 200, async json() { return step.json; }, async text() { return JSON.stringify(step.json); } };
  };
}
const okMailer = (text) => ({ json: { choices: [{ message: { content: text } }] } });
const okGemini = (text) => ({ json: { candidates: [{ content: { parts: [{ text }] } }] } });

const COPY = JSON.stringify({ variants: [{ label: 'A', type: 'promo', subject: 'S', preview: 'P', html: '<p>hi</p>', score: 80 }] });

function fakeRes() {
  const r = { statusCode: 0, payload: null, headers: {} };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.status = (c) => { r.statusCode = c; return r; };
  r.json = (o) => { r.payload = o; return r; };
  r.end = () => r;
  return r;
}
function freshHandler(file) {
  // Only the route's own cache — _models.js must stay the instance mutated
  // above, since that is what the route requires.
  delete require.cache[require.resolve(path.join(__dirname, '..', file))];
  return require(path.join(__dirname, '..', file));
}
async function callMailer(script, env) {
  calls.length = 0;
  Object.assign(process.env, env);
  stubFetch(script);
  const res = fakeRes();
  await freshHandler('api/mailer.js')({ method: 'POST', body: { brand: 'Acme', brief: 'launch' } }, res);
  return res;
}

const BASE_ENV = { GROQ_API_KEY: 'g', CEREBRAS_API_KEY: 'c', GEMINI_API_KEY: 'm', OPENROUTER_API_KEY: 'o' };
function clearEnv() {
  for (const k of ['GROQ_API_KEY','CEREBRAS_API_KEY','GEMINI_API_KEY','OPENROUTER_API_KEY',
                   'GROQ_MODEL','CEREBRAS_MODEL','GEMINI_MODEL','OPENROUTER_MODEL',
                   'Gemini_API_Key','GEMINI_KEY','GOOGLE_API_KEY','GOOGLE_GENAI_API_KEY']) delete process.env[k];
}

(async () => {
  // ── 1. Groq is asked first, and with a LIVE model id ────────────────────
  clearEnv();
  {
    const res = await callMailer(() => okMailer(COPY), BASE_ENV);
    check('the real handler asks Groq first, with a live model id', () => {
      assert.strictEqual(calls[0].provider, 'groq', 'first call went to ' + calls[0].provider);
      assert.ok(calls[0].model === 'openai/gpt-oss-120b', 'first model was ' + calls[0].model);
      assert.strictEqual(res.payload.source, 'ai');
    });
    check('a successful response names the model that answered', () => {
      assert.ok(res.payload.model === 'openai/gpt-oss-120b',
        'model field was ' + JSON.stringify(res.payload.model));
    });
  }

  // ── 2. A 404 advances WITHIN the provider before leaving it ─────────────
  clearEnv();
  {
    // Groq: 404 on the first id, then answer on the second.
    const res = await callMailer((prov, model, n) => {
      if (prov === 'groq' && n === 1) return { status: 404, body: 'model does not exist' };
      return okMailer(COPY);
    }, BASE_ENV);
    check('a 404 advances to the next id of the SAME provider', () => {
      const groq = calls.filter((c) => c.provider === 'groq');
      assert.ok(groq.length === 2, 'groq was called ' + groq.length + ' time(s)');
      assert.strictEqual(groq[1].model, 'qwen/qwen3.6-27b');
      assert.strictEqual(res.payload.source, 'ai');
      assert.strictEqual(res.payload.model, 'qwen/qwen3.6-27b');
    });
  }

  // ── 3. A 401 must NOT burn the chain ────────────────────────────────────
  clearEnv();
  {
    const res = await callMailer((prov) => {
      if (prov === 'groq') return { status: 401, body: 'invalid api key' };
      return okMailer(COPY);
    }, BASE_ENV);
    check('a 401 leaves the provider after ONE id, not the whole chain', () => {
      const groq = calls.filter((c) => c.provider === 'groq');
      assert.ok(groq.length === 1, 'groq was tried ' + groq.length + ' times on a bad key');
      assert.strictEqual(calls[1].provider, 'cerebras', 'did not move on to cerebras');
      assert.strictEqual(res.payload.source, 'ai');
    }, 'classify');
  }

  // ── 4. Every provider dead → deterministic output, never a throw ────────
  clearEnv();
  {
    const res = await callMailer(() => ({ status: 404, body: 'model does not exist' }), BASE_ENV);
    check('with every provider dead the handler still returns usable mail', () => {
      assert.strictEqual(res.statusCode, 200);
      assert.ok(res.payload.source === 'template', 'source was ' + res.payload.source);
      assert.ok(res.payload.variants && res.payload.variants.length > 0, 'no variants returned');
      assert.strictEqual(res.payload.model, undefined, 'a template answer must not claim a model');
    }, null);
    check('a dead cascade tries every id of every provider before giving up', () => {
      const expected = ['groq', 'cerebras', 'gemini', 'openrouter']
        .reduce((n, p) => n + MODELS.chainFor(p).length, 0);
      assert.ok(calls.length === expected, `made ${calls.length} calls, chains total ${expected}`);
    }, null);
  }

  // ── 5. The env override really is tried first ───────────────────────────
  clearEnv();
  {
    const res = await callMailer(() => okMailer(COPY), Object.assign({}, BASE_ENV, { GROQ_MODEL: 'my/forced-model' }));
    check('a *_MODEL env override is the first id actually requested', () => {
      assert.ok(calls[0].model === 'my/forced-model', 'first model was ' + calls[0].model);
      assert.strictEqual(res.payload.model, 'my/forced-model');
    }, null);
  }

  // ── 6. Gemini is reached by URL path, with a live id ────────────────────
  clearEnv();
  {
    const res = await callMailer((prov) => {
      if (prov === 'groq' || prov === 'cerebras') return { status: 404, body: 'model does not exist' };
      if (prov === 'gemini') return okGemini(COPY);
      return { status: 500 };
    }, { GEMINI_API_KEY: 'm', GROQ_API_KEY: 'g', CEREBRAS_API_KEY: 'c' });
    check('Gemini is called with a live model id in the URL path', () => {
      const gem = calls.filter((c) => c.provider === 'gemini');
      assert.ok(gem.length >= 1, 'gemini was never called');
      assert.ok(gem[0].model === 'gemini-3.6-flash', 'gemini model was ' + gem[0].model);
      assert.strictEqual(res.payload.source, 'ai');
    });
  }

  // ── 7. No provider keys at all → no network call is attempted ───────────
  clearEnv();
  {
    calls.length = 0;
    stubFetch(() => okMailer(COPY));
    const res = fakeRes();
    await freshHandler('api/mailer.js')({ method: 'POST', body: { brand: 'Acme' } }, res);
    check('with no keys configured it never touches the network', () => {
      assert.ok(calls.length === 0, 'made ' + calls.length + ' request(s) with no keys set');
      assert.strictEqual(res.payload.source, 'template');
    }, null);
  }

  for (const [ok, n, d, br] of results)
    console.log(`  ${ok}  ${n.padEnd(60)}${br ? ' [' + br + ']' : ' [guard]'} ${d}`);
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (MUT) {
    const target = results.filter((r) => r[3] === MUT);
    const others = results.filter((r) => r[3] !== MUT);
    const wrong = target.filter((r) => r[0] === 'PASS').map((r) => r[1])
      .concat(others.filter((r) => r[0] === 'FAIL').map((r) => r[1] + ' (broke unexpectedly)'));
    if (!target.length) { console.log('MUT: no checks are tagged "' + MUT + '"'); process.exit(1); }
    if (!wrong.length) {
      console.log(`MUT=${MUT}: all ${target.length} check(s) it targets failed, and the other ${others.length} still pass`);
      process.exit(0);
    }
    console.log('MUT: wrong outcome — ' + wrong.join('; '));
    process.exit(1);
  }
  process.exit(failed ? 1 : 0);
})();
