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

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
