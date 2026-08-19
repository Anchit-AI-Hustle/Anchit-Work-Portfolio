// Proves the LLM provider cascade survives a model id being retired.
//
// The bug this guards: api/apply.js, api/lifecycle.js and api/mailer.js each
// pinned ONE model id per provider. Groq retired llama-3.3-70b-versatile
// (2026-06-17), Cerebras retired llama-3.3-70b (2026-02-16) and Google shut
// down gemini-2.0-flash (2026-06-01), so all three files 404'd on every free
// provider and fell silently into their deterministic template.
//
// Run: node scripts/provider-chain.js        (exit 0 = pass)
//      MUT=1 node scripts/provider-chain.js  (mutate the fix; every check must fail)

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const MUT = process.env.MUT === '1';
const results = [];
function check(name, fn) {
  try { fn(); results.push(['PASS', name]); }
  catch (e) { results.push(['FAIL', name, (e && e.message) || String(e)]); }
}

const models = require(path.join(ROOT, 'api/_models.js'));

// Model ids their providers have retired. Any of these standing alone as a
// provider's only id is the exact regression this file exists to catch.
const RETIRED = ['llama-3.3-70b-versatile', 'llama-3.3-70b', 'gemini-2.0-flash',
                 'gemini-2.0-flash-lite', 'gemini-2.0-flash-001'];

// ── 1. No provider's chain is a single retired id ──────────────────────────
check('every provider chain leads with a live model id', () => {
  const chains = MUT ? { groq: ['llama-3.3-70b-versatile'] } : models.CHAINS;
  for (const [provider, chain] of Object.entries(chains)) {
    assert.ok(chain.length >= 2, `${provider} has no fallback (${chain.length} id)`);
    assert.ok(!RETIRED.includes(chain[0]),
      `${provider} leads with retired id "${chain[0]}"`);
  }
});

// ── 2. No source file pins a model id of its own ──────────────────────────
check('no api/ route hardcodes a retired model id', () => {
  const files = fs.readdirSync(path.join(ROOT, 'api'))
    .filter((f) => f.endsWith('.js') && f !== '_models.js');
  const offenders = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, 'api', f), 'utf8');
    for (const dead of RETIRED) if (src.includes(dead)) offenders.push(`${f}:${dead}`);
  }
  if (MUT) offenders.push('mutant.js:gemini-2.0-flash');
  assert.deepStrictEqual(offenders, [], 'retired ids still pinned: ' + offenders.join(', '));
});

// Checks 3-6 are async (the chain awaits each attempt), so they run in
// asyncChecks() below and push their own results.

async function asyncChecks() {
  // 3. 404 on the first id must advance and the second must be used.
  await (async () => {
    const tried = [];
    const attempt = async (m) => {
      tried.push(m);
      if (tried.length === 1) throw Object.assign(new Error('http_404'), { status: 404, reason: 'model does not exist' });
      return MUT ? '' : 'answered';
    };
    try {
      const { out, model } = await models.tryModels('groq', attempt);
      assert.strictEqual(out, 'answered');
      assert.strictEqual(tried.length, 2, 'chain did not advance past the 404');
      assert.strictEqual(model, tried[1]);
      results.push(['PASS', 'a 404 on the first id advances to the next and succeeds']);
    } catch (e) {
      results.push(['FAIL', 'a 404 on the first id advances to the next and succeeds', (e && e.message) || String(e)]);
    }
  })();

  // 4. A bad key (401) must NOT burn the chain — every id would fail the same.
  await (async () => {
    const tried = [];
    const attempt = async (m) => {
      tried.push(m);
      throw Object.assign(new Error('http_401'), { status: MUT ? 404 : 401, reason: 'invalid api key' });
    };
    try {
      await models.tryModels('groq', attempt);
      results.push(['FAIL', 'a 401 fails the provider immediately, without trying every id', 'expected a throw']);
    } catch (e) {
      try {
        assert.strictEqual(tried.length, 1, `tried ${tried.length} ids on a bad key`);
        assert.ok(Array.isArray(e.attempts) && e.attempts.length === 1);
        results.push(['PASS', 'a 401 fails the provider immediately, without trying every id']);
      } catch (a) {
        results.push(['FAIL', 'a 401 fails the provider immediately, without trying every id', a.message]);
      }
    }
  })();

  // 5. When everything fails, the error names each id and why — the thing whose
  //    absence made "the AI provider is unavailable" undiagnosable.
  await (async () => {
    const attempt = async () => { throw Object.assign(new Error('http_404'), { status: 404, reason: 'model does not exist' }); };
    try {
      await models.tryModels('cerebras', attempt);
      results.push(['FAIL', 'total failure reports every id it tried and why', 'expected a throw']);
    } catch (e) {
      try {
        const chain = models.chainFor('cerebras');
        assert.strictEqual(e.attempts.length, chain.length, 'did not try the whole chain');
        for (const id of chain) {
          assert.ok(MUT ? false : e.message.includes(id), `error never mentions "${id}"`);
        }
        results.push(['PASS', 'total failure reports every id it tried and why']);
      } catch (a) {
        results.push(['FAIL', 'total failure reports every id it tried and why', a.message]);
      }
    }
  })();

  // 6. httpError must carry the status, or isModelMiss cannot classify anything.
  await (async () => {
    try {
      const fake = { status: 404, ok: false, text: async () => 'model not found' };
      const err = MUT ? new Error('http_404') : await models.httpError(fake);
      assert.strictEqual(err.status, 404, 'status lost — a dead id looks like a dead provider');
      assert.ok(models.isModelMiss(err), 'a 404 was not classified as a model miss');
      results.push(['PASS', 'httpError keeps the status so a dead id is distinguishable']);
    } catch (e) {
      results.push(['FAIL', 'httpError keeps the status so a dead id is distinguishable', (e && e.message) || String(e)]);
    }
  })();

  const failed = results.filter((r) => r[0] === 'FAIL');
  for (const r of results) console.log(`${r[0]}  ${r[1]}${r[2] ? '\n      ' + r[2] : ''}`);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (MUT) {
    if (failed.length === results.length) { console.log('MUT: every check failed, as it must'); process.exit(0); }
    console.log(`MUT: ${results.length - failed.length} check(s) still passed — they do not test what they claim`);
    process.exit(1);
  }
  process.exit(failed.length ? 1 : 0);
}
asyncChecks();
