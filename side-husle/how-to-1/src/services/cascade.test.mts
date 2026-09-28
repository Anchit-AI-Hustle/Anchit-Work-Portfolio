// The numbers this engine shows a reader have to be earned.
//
// Run:  node --experimental-strip-types src/services/cascade.test.mts
//
// WHY THESE FOUR
//   The How-To Engine's pitch is that a cascade of models CORROBORATES an
//   answer, and the UI prints "consensus NN%" to say so. That makes the
//   consensus number the load-bearing claim of the whole project, and it was
//   the number least connected to reality:
//
//     return Math.min(1, 0.5 + shared / all.size);
//
//   Models that agreed on nothing scored 0.5. The badge was most reassuring
//   exactly when corroboration had failed. A single model was hardcoded to
//   0.6. Both are fixed; these pin them.
import assert from 'node:assert/strict';
import { scoreGuide, consensusScore, normalizeGuide } from './AgentCascadeService.ts';

const step = (id: string, title: string, badge = 'action') => ({ id, title, detail: 'd', badge, index: 0 });
const guide = (titles: string[]) => ({ steps: titles.map((t, i) => step('s' + i, t)) }) as never;
const answer = (titles: string[]) => ({ model: 'm', rank: 1, ok: true, latencyMs: 1, guide: guide(titles) }) as never;

let pass = 0, fail = 0;
const check = (name: string, fn: () => void) => {
  try { fn(); console.log('  PASS  ' + name); pass++; }
  catch (e) { console.log('  FAIL  ' + name + '  ' + (e as Error).message.split('\n')[0]); fail++; }
};

check('total disagreement scores 0, not 0.5', () => {
  const score = consensusScore([answer(['alpha', 'beta']), answer(['gamma', 'delta'])]);
  assert.equal(score, 0, `got ${score} for models that shared no step`);
});

check('total agreement scores 1', () => {
  assert.equal(consensusScore([answer(['alpha', 'beta']), answer(['alpha', 'beta'])]), 1);
});

check('partial agreement lands between, proportionally', () => {
  // 3 distinct titles, 1 shared by both → 1/3
  const score = consensusScore([answer(['alpha', 'beta']), answer(['alpha', 'gamma'])]);
  assert.ok(Math.abs(score - 1 / 3) < 1e-9, `got ${score}`);
});

check('one model is not a consensus', () => {
  assert.equal(consensusScore([answer(['alpha', 'beta'])]), 0);
});

check('a 40-step wall scores below an 8-step guide', () => {
  const short = scoreGuide(normalizeGuide(guide(Array.from({ length: 8 }, (_, i) => 'step ' + i)), 't'));
  const wall = scoreGuide(normalizeGuide(guide(Array.from({ length: 40 }, (_, i) => 'step ' + i)), 't'));
  assert.ok(wall < short, `wall ${wall.toFixed(3)} should score below short ${short.toFixed(3)}`);
});

check('edges pointing at steps that do not exist are dropped', () => {
  const g = normalizeGuide(
    { steps: [step('a', 'one'), step('b', 'two')], edges: [{ from: 'a', to: 'ghost' }] } as never,
    'task',
  )!;
  assert.ok(g.edges.every((e) => ['a', 'b'].includes(e.from) && ['a', 'b'].includes(e.to)),
    'kept an edge to a step that was never emitted: ' + JSON.stringify(g.edges));
  assert.ok(g.edges.length > 0, 'fell back to nothing instead of the linear chain');
});

check('valid model edges are kept', () => {
  const g = normalizeGuide(
    { steps: [step('a', 'one'), step('b', 'two')], edges: [{ from: 'b', to: 'a' }] } as never,
    'task',
  )!;
  assert.deepEqual(g.edges, [{ from: 'b', to: 'a' }]);
});

// ── substance, not brevity ─────────────────────────────────────────────────
//
// The scorer picks which answers reach the evaluator. 20% of it used to be
//     conciseness = avg(detail.length <= 160 ? 1 : 0)
// so the guide that actually told you the command ranked BELOW the one that
// did not, and was likelier to be discarded before synthesis. The engine
// selected for thinness, which is what "no information, no details, no
// tutorials" looks like from the outside.

const thinStep = (id: string) => ({ id, index: 0, title: 't ' + id, detail: 'Do the thing.', badge: 'action' });
const richStep = (id: string) => ({
  ...thinStep(id),
  why: 'Because the bootloader latches on reset.',
  specifics: ['Run: esptool --port /dev/ttyUSB0 flash_id'],
  verify: 'The terminal prints "Hash of data verified".',
  pitfalls: [{ problem: 'Permission denied', fix: 'Add yourself to dialout.' }],
});
const g = (steps: unknown[], extra: Record<string, unknown> = {}) => ({ steps, ...extra }) as never;
const ids = ['s1', 's2', 's3', 's4', 's5', 's6'];

check('a guide carrying real instruction outscores an identical thin one', () => {
  const rich = scoreGuide(g(ids.map(richStep), { prerequisites: [{ item: 'A USB-C data cable' }] }));
  const thin = scoreGuide(g(ids.map(thinStep)));
  assert.ok(rich > thin, `rich ${rich.toFixed(3)} did not beat thin ${thin.toFixed(3)}`);
});

check('a long detail is no longer punished harder than a missing specific', () => {
  // The old term flipped to 0 at 161 characters, so padding prose cost more
  // than omitting the command. Same steps, one with a longer detail.
  const wordy = ids.map((id) => ({ ...richStep(id), detail: 'D'.repeat(200) }));
  const terseButEmpty = ids.map(thinStep);
  assert.ok(scoreGuide(g(wordy)) > scoreGuide(g(terseButEmpty)),
    'a wordy guide with real instruction still lost to a terse empty one');
});

check('specifics carry through normalizeGuide to the UI', () => {
  // normalizeGuide rebuilds each step field by field, so an unnamed field is
  // dropped silently - the model returns it and the reader never sees it.
  const out = normalizeGuide(g([richStep('s1'), richStep('s2')], {
    prerequisites: [{ item: 'A USB-C data cable', note: 'Charge-only will not enumerate.' }],
    successCriteria: 'The status LED is solid green.',
  }), 'flash firmware');
  assert.ok(out, 'guide did not normalize');
  assert.deepEqual(out!.steps[0].specifics, ['Run: esptool --port /dev/ttyUSB0 flash_id']);
  assert.match(out!.steps[0].verify!, /Hash of data verified/);
  assert.equal(out!.steps[0].pitfalls!.length, 1);
  assert.match(out!.steps[0].why!, /bootloader/);
  assert.equal(out!.prerequisites!.length, 1);
  assert.match(out!.successCriteria!, /solid green/);
});

check('a pitfall missing its fix never reaches the UI half-formed', () => {
  const out = normalizeGuide(g([
    { ...thinStep('s1'), pitfalls: [{ problem: 'it breaks' }, { problem: 'x', fix: 'y' }] },
    thinStep('s2'),
  ]), 't');
  assert.equal(out!.steps[0].pitfalls!.length, 1);
  assert.equal(out!.steps[0].pitfalls![0].problem, 'x');
});

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
