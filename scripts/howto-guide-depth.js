// The How-To Engine has to produce a tutorial, not a summary.
//
// THE BUG THIS CATCHES
//   Reported as "atrocious how to guides - no information, no details, no
//   tutorials nothing", and the engine was built to do exactly that. Every
//   layer pushed the same way:
//
//     prompt      "detail is 1-2 short sentences"; 4-7 steps
//     schema      title + detail + badge + videoPrompt, and nothing else
//     types.ts    "One or two short sentences. Never a wall of text."
//     scorer      0.20 * (detail.length <= 160), so a substantive step scored
//                 DOWN and was less likely to reach synthesis
//     shape()     .slice(0, 8) steps, hard, whatever the task needed
//     max_tokens  2000, which cannot hold specifics + verification + fixes
//     StepCard    one <p>, so there was nowhere to put more
//
//   There was no field for the command to run, the menu path, the value to
//   type, what to check, or what to do when it fails. A guide could not have
//   contained instruction even if a model tried to provide it.
//
//   Brevity is a property of PROSE. It is not a reason to withhold the
//   information someone needs to finish the task.
//
// Run:  node scripts/howto-guide-depth.js
const assert = require('node:assert/strict');
const { shape, SYSTEM } = require('../api/cascade.js')._test;

let pass = 0, fail = 0;
const check = (n, fn) => {
  try { fn(); console.log('  PASS  ' + n); pass++; }
  catch (e) { console.log('  FAIL  ' + n + '  ' + String(e.message).split('\n')[0]); fail++; }
};

// A reply carrying everything a real guide should carry.
const RICH = {
  summary: 'Flash the firmware over USB.',
  difficulty: 'skilled',
  estMinutes: 20,
  successCriteria: 'The board boots and the status LED is solid green.',
  prerequisites: [
    { item: 'A USB-C data cable', note: 'Charge-only cables will not enumerate.' },
    { item: 'esptool 4.7 or newer' },
  ],
  steps: Array.from({ length: 11 }, (_, i) => ({
    id: `s${i + 1}`,
    title: `Do the thing ${i + 1}`,
    detail: 'Plain instruction here.',
    why: 'Because the bootloader latches on reset.',
    specifics: ['Run: esptool --port /dev/ttyUSB0 flash_id', 'Expect: Chip is ESP32-D0WDQ6'],
    verify: 'The terminal prints "Hash of data verified".',
    pitfalls: [{ problem: 'Permission denied on /dev/ttyUSB0', fix: 'Add yourself to the dialout group, then log out and back in.' }],
    badge: 'action',
    estSeconds: 60,
    videoPrompt: 'esp32 flashing over usb',
  })),
  edges: [],
};

check('the specifics survive the shaper', () => {
  const g = shape(RICH, 'flash firmware');
  assert.deepEqual(g.steps[0].specifics, [
    'Run: esptool --port /dev/ttyUSB0 flash_id',
    'Expect: Chip is ESP32-D0WDQ6',
  ]);
});

check('why, verify and pitfalls survive the shaper', () => {
  const g = shape(RICH, 'flash firmware');
  const s = g.steps[0];
  assert.match(s.why, /bootloader/);
  assert.match(s.verify, /Hash of data verified/);
  assert.equal(s.pitfalls.length, 1);
  assert.match(s.pitfalls[0].fix, /dialout/);
});

check('prerequisites and successCriteria survive the shaper', () => {
  const g = shape(RICH, 'flash firmware');
  assert.equal(g.prerequisites.length, 2);
  assert.match(g.prerequisites[0].item, /USB-C/);
  assert.match(g.prerequisites[0].note, /Charge-only/);
  assert.match(g.successCriteria, /solid green/);
});

check('a task needing more than 8 steps keeps them', () => {
  // .slice(0, 8) used to be a hard cap: an 11-step job lost its last three and
  // the guide simply ended mid-task.
  const g = shape(RICH, 'flash firmware');
  assert.equal(g.steps.length, 11, `kept ${g.steps.length} of 11 steps`);
});

check('empty optional fields become undefined, not empty sections', () => {
  // The renderer keys off presence. [] or '' would draw a "Specifics" heading
  // with nothing under it - a section shaped like content, containing none,
  // which is the exact failure being fixed.
  const bare = {
    summary: 's', steps: [
      { id: 's1', title: 'A', detail: 'B', specifics: [], verify: '   ', pitfalls: [], why: '' },
      { id: 's2', title: 'C', detail: 'D' },
    ], edges: [], prerequisites: [],
  };
  const g = shape(bare, 't');
  for (const k of ['specifics', 'verify', 'pitfalls', 'why']) {
    assert.equal(g.steps[0][k], undefined, `${k} should be undefined, got ${JSON.stringify(g.steps[0][k])}`);
  }
  assert.equal(g.prerequisites, undefined);
  assert.equal(g.successCriteria, undefined);
});

check('a pitfall missing its fix is dropped, not half-rendered', () => {
  const g = shape({
    summary: 's',
    steps: [
      { id: 's1', title: 'A', detail: 'B', pitfalls: [{ problem: 'it breaks' }, { problem: 'x', fix: 'y' }] },
      { id: 's2', title: 'C', detail: 'D' },
    ],
    edges: [],
  }, 't');
  assert.equal(g.steps[0].pitfalls.length, 1);
  assert.equal(g.steps[0].pitfalls[0].problem, 'x');
});

check('the prompt demands the fields that carry instruction', () => {
  for (const want of ['specifics', 'verify', 'pitfalls', 'prerequisites', 'successCriteria', 'why']) {
    assert.ok(SYSTEM.includes(want), `SYSTEM never mentions ${want}`);
  }
});

check('the prompt no longer caps the guide at 7 steps', () => {
  assert.ok(!/\b4-7 steps\b/.test(SYSTEM), 'SYSTEM still says "4-7 steps"');
  assert.match(SYSTEM, /between 5 and 12/);
});

check('the prompt says specifics are the point, not an extra', () => {
  assert.match(SYSTEM, /THIS IS THE MOST IMPORTANT FIELD/);
});

check('the token ceiling can hold a full guide', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'api', 'cascade.js'), 'utf8');
  const m = src.match(/max_tokens:\s*(\d+)/);
  assert.ok(m, 'no max_tokens found');
  assert.ok(Number(m[1]) >= 6000, `max_tokens is ${m[1]}; 2000 could not hold specifics + verify + pitfalls`);
});

console.log('\n' + pass + '/' + (pass + fail) + ' passed');
process.exit(fail ? 1 : 0);
