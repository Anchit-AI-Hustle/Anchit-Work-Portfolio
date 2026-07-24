// Auto-suggestions shown on the page, + the "surprise me" random generator
// used by the empty-state CTA in PromptOptimizer.

/** Curated chips spanning the full difficulty range (trivial → expert). */
export const SUGGESTIONS: { label: string; emoji: string }[] = [
  { emoji: '📱', label: 'Switch on a phone for the first time' },
  { emoji: '👔', label: 'Tie a full Windsor knot' },
  { emoji: '🥚', label: 'Poach an egg perfectly' },
  { emoji: '🚗', label: 'Parallel park in three moves' },
  { emoji: '🏊', label: 'Swim the breaststroke' },
  { emoji: '➗', label: 'Solve a quadratic equation' },
  { emoji: '🎸', label: 'Play your first guitar chord' },
  { emoji: '🧘', label: 'Do box breathing to calm down' },
  { emoji: '💾', label: 'Back up a laptop to the cloud' },
  { emoji: '🧵', label: 'Sew a button back on' },
  { emoji: '📈', label: 'Read a candlestick stock chart' },
  { emoji: '🍚', label: 'Cook fluffy rice without a cooker' },
];

const SUBJECTS = [
  'change a flat bike tyre', 'fold a fitted sheet', 'write a cover letter',
  'do a proper push-up', 'brew pour-over coffee', 'jump-start a car',
  'meditate for beginners', 'moonwalk', 'take a great portrait photo',
  'negotiate a salary', 'debug a null pointer', 'plant a tomato seedling',
  'read sheet music', 'do long division', 'iron a dress shirt',
  'juggle three balls', 'set SMART goals', 'whistle with two fingers',
];
const FRAMINGS = [
  'Explain how to {s} like I have never done it before.',
  'Teach me to {s} in tiny, can\'t-fail steps.',
  'I get overwhelmed easily — walk me through how to {s}.',
  'Break down how to {s} with a visual, step-by-step guide.',
  'Show me the foolproof way to {s}.',
];

/** Deterministic-ish random creative prompt for the empty-state CTA. */
export function randomPrompt(seed = Date.now()): string {
  const s = SUBJECTS[seed % SUBJECTS.length];
  const f = FRAMINGS[(seed >> 3) % FRAMINGS.length];
  return f.replace('{s}', s);
}
