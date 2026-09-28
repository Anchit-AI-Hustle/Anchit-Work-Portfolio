// ============================================================================
// AgentCascadeService — the Agentic Cascade Engine (SERVER-SIDE)
// ----------------------------------------------------------------------------
// Pipeline:
//   1) DISPATCH   — fan out the task to the top-N ranked models IN PARALLEL,
//                   each asked to return a strict-JSON MasterGuide.
//   2) SCORE      — rank every successful answer by a structural quality score
//                   (step granularity, branch coverage, badges, non-emptiness)
//                   and keep the TOP 3.
//   3) SYNTHESIZE — an evaluator node (the strongest available model) merges the
//                   top 3 into one multi-branch, de-duplicated, ADHD-friendly
//                   master guide and reports a consensus score.
//
// The whole thing runs behind /api/cascade so provider keys stay server-side.
// ============================================================================

import { PROVIDERS, evaluatorProvider, type ModelProvider } from './providers.ts';
import type { CascadeResult, HowToStep, MasterGuide, ModelAnswer } from '../types.ts';

const MAX_PARALLEL = Number(
  (typeof process !== 'undefined' && process.env?.CASCADE_MAX_PARALLEL) || 4,
);

// ── prompt scaffolding ─────────────────────────────────────────────────────

const GUIDE_SHAPE = `{
  "task": string,
  "summary": string (<= 240 chars),
  "difficulty": "trivial" | "easy" | "moderate" | "skilled" | "expert",
  "estMinutes": number,
  "prerequisites": [{ "item": string, "note": string? }] (what to have ready BEFORE step 1),
  "successCriteria": string (the observable end state of the whole task),
  "steps": [{
    "id": string, "index": number,
    "title": string (3-7 words, imperative),
    "detail": string (1-2 short sentences of plain instruction),
    "why": string (ONE line on why this step exists),
    "specifics": [string] (1-4 lines carrying the EXACT information: the command,
                           the menu path, the value, the setting name, what the
                           screen says. THE MOST IMPORTANT FIELD.),
    "verify": string (how you know THIS step worked, observably),
    "pitfalls": [{ "problem": string, "fix": string }] (what actually goes wrong here),
    "badge": "start" | "action" | "watch-out" | "checkpoint" | "finish",
    "branches": [{ "label": string, "goToStepId": string }] (optional),
    "estSeconds": number (optional),
    "videoPrompt": string (a vivid one-line description to animate this step)
  }],
  "edges": [{ "from": stepId, "to": stepId, "label": string? }]
}`;

function solverSystem(): string {
  return [
    'You are a world-class instructional designer for people with ADHD.',
    'Given ANY humanly-doable task, produce a step-by-step guide as STRICT JSON.',
    'ADHD-FRIENDLY MEANS CHUNKED, NOT EMPTY. Short sentences are a property of',
    'PROSE - they are not a reason to withhold the command, the menu path, the',
    'value to type, or what to do when it fails. Keep the prose short and put',
    'the substance in specifics, verify and pitfalls.',
    'Rules: each step is one atomic action; titles 3-7 words; detail 1-2 short',
    'sentences; never filler like "get set up" or "do the first move" - name the',
    'actual button, command, setting or measurement; give every step specifics',
    'and a verify; add pitfalls where something really does go wrong; add',
    '"watch-out" badges for common mistakes; add branches where the path forks;',
    'list prerequisites the reader needs before step 1; give every step a vivid',
    'one-line videoPrompt.',
    `Return ONLY JSON matching this shape (no markdown, no prose):\n${GUIDE_SHAPE}`,
  ].join(' ');
}

function synthSystem(): string {
  return [
    'You are the CONSENSUS EVALUATOR in a multi-model cascade.',
    'You receive several candidate step-by-step guides for the same task from',
    'different frontier models. Merge them into ONE definitive guide that is:',
    'exhaustively correct, de-duplicated, ordered, and ADHD-friendly.',
    'Prefer steps that multiple models agree on; keep unique "watch-out" insights;',
    'preserve branches; renumber steps from 1; ensure edges form a valid flow from',
    'the "start" step to the "finish" step.',
    'UNION THE SUBSTANCE, DO NOT INTERSECT IT. specifics, verify, pitfalls and',
    'prerequisites are why the guide is useful: keep every distinct one any',
    'candidate supplied, deduplicated. A merged guide thinner than the best',
    'candidate is a failed merge.',
    `Return ONLY JSON matching this shape (no markdown):\n${GUIDE_SHAPE}`,
  ].join(' ');
}

// ── JSON extraction (models sometimes wrap JSON in prose/markdown) ──────────

function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : raw;
  const start = body.indexOf('{');
  const end = body.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

const VALID_BADGES: HowToStep['badge'][] = ['start', 'action', 'watch-out', 'checkpoint', 'finish'];

export function normalizeGuide(g: Partial<MasterGuide> | null, task: string): MasterGuide | undefined {
  if (!g || !Array.isArray(g.steps) || g.steps.length === 0) return undefined;
  const last = g.steps.length - 1;
  const steps: HowToStep[] = g.steps.map((s, i) => ({
    id: s.id || `s${i + 1}`,
    index: i + 1,
    title: (s.title || 'Step').trim(),
    detail: (s.detail || '').trim(),
    // Coerce to a supported badge — a model may return e.g. "warning"/"caution",
    // which would otherwise crash the UI's BADGE[...] lookup.
    badge: VALID_BADGES.includes(s.badge as HowToStep['badge'])
      ? (s.badge as HowToStep['badge'])
      : (i === 0 ? 'start' : i === last ? 'finish' : 'action'),
    // Carried explicitly. This function rebuilds each step field by field, so
    // anything not named here is dropped on the way to the UI - which is how a
    // model could return specifics and the reader would never see them.
    why: s.why,
    specifics: Array.isArray(s.specifics) ? s.specifics.filter(Boolean) : undefined,
    verify: s.verify,
    pitfalls: Array.isArray(s.pitfalls)
      ? s.pitfalls.filter((p) => p && p.problem && p.fix)
      : undefined,
    branches: s.branches,
    estSeconds: s.estSeconds,
    videoPrompt: s.videoPrompt,
  }));
  // Edges the model returned are filtered against the steps that actually
  // exist. They were passed through untouched, so a model referencing a step
  // it did not emit - or renumbering ids mid-answer - handed the flow diagram
  // an edge pointing at nothing. Anything left unconnected falls back to the
  // linear chain, which is always renderable.
  const ids = new Set(steps.map((s) => s.id));
  const linear = steps.slice(0, -1).map((s, i) => ({ from: s.id, to: steps[i + 1].id }));
  const claimed = Array.isArray(g.edges) ? g.edges.filter((e) => ids.has(e.from) && ids.has(e.to)) : [];
  const edges = claimed.length ? claimed : linear;
  return {
    task: g.task || task,
    summary: g.summary || '',
    difficulty: g.difficulty || 'moderate',
    estMinutes: g.estMinutes || Math.max(1, Math.round(steps.length * 0.6)),
    prerequisites: Array.isArray(g.prerequisites)
      ? g.prerequisites.filter((p) => p && p.item)
      : undefined,
    successCriteria: g.successCriteria,
    steps,
    edges,
    provenance: { models: [], consensus: 0 },
  };
}

// ── structural quality score used to pick the top 3 ────────────────────────

export function scoreGuide(g?: MasterGuide): number {
  if (!g) return 0;
  const n = g.steps.length;
  // The comment said "~8 steps is ideal"; the code said "8 or more is ideal",
  // so a 40-step wall scored full marks on the one axis meant to reward
  // breaking work into digestible pieces - on a guide whose whole promise is
  // "no walls of text". Peak at 8 and fall away on both sides.
  const granularity = n <= 8 ? n / 8 : Math.max(0, 1 - (n - 8) / 16);
  // SUBSTANCE, NOT BREVITY. This term used to be
  //     conciseness = avg(detail.length <= 160 ? 1 : 0)   // weighted 0.20
  // so a guide that actually told you the command scored BELOW one that did
  // not, and was less likely to survive into the top 3 the evaluator merges.
  // The engine selected for thinness and then complained of nothing else.
  //
  // `detail` staying short is still worth something - the substance belongs in
  // the structured fields, not in a paragraph - but it is a small tiebreak now,
  // and it cannot outweigh a step that carries real instruction.
  const substance = avg(g.steps.map((s) => {
    const hasSpecifics = (s.specifics?.length ?? 0) > 0;
    const hasVerify = !!s.verify;
    const hasPitfall = (s.pitfalls?.length ?? 0) > 0;
    const hasWhy = !!s.why;
    return (hasSpecifics ? 0.5 : 0) + (hasVerify ? 0.25 : 0) + (hasPitfall ? 0.15 : 0) + (hasWhy ? 0.1 : 0);
  }));
  const setup = g.prerequisites?.length ? 1 : 0;
  const proseTidy = avg(g.steps.map((s) => (s.detail.length <= 240 ? 1 : 0)));
  const badges = avg(g.steps.map((s) => (s.badge ? 1 : 0)));
  const guardrails = Math.min(1, g.steps.filter((s) => s.badge === 'watch-out').length / 2);
  const branches = Math.min(1, g.steps.filter((s) => s.branches?.length).length / 2);
  const media = avg(g.steps.map((s) => (s.videoPrompt ? 1 : 0)));
  return 0.20 * granularity + 0.34 * substance + 0.08 * setup + 0.06 * proseTidy
    + 0.10 * badges + 0.12 * guardrails + 0.05 * branches + 0.05 * media;
}
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

// ── bounded parallel map (respects CASCADE_MAX_PARALLEL) ────────────────────

async function pmap<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── the engine ──────────────────────────────────────────────────────────────

export class AgentCascadeService {
  // A plain field, not a `private` constructor parameter property. The latter
  // is TypeScript syntax that has to be COMPILED, not merely stripped, so
  // `node --experimental-strip-types` refused this file - which is the command
  // cascade.test.mts documents at the top of itself. The suite could only be
  // run by reaching for tsx, and so it was wired into nothing and ran nowhere.
  private providers: ModelProvider[];

  constructor(providers: ModelProvider[] = PROVIDERS.filter((p) => p.enabled())) {
    this.providers = providers;
  }

  /** Run the full cascade for a task and return the synthesized master guide. */
  async run(task: string): Promise<CascadeResult> {
    if (this.providers.length === 0) {
      // No keys configured → deterministic offline guide so the UI still works.
      const guide = offlineGuide(task);
      return { guide, answers: [], top: [] };
    }

    // 1) DISPATCH — parallel fan-out to the ranked models.
    const sys = solverSystem();
    const answers: ModelAnswer[] = await pmap(this.providers, MAX_PARALLEL, async (p) => {
      const t0 = Date.now();
      try {
        const raw = await p.call(sys, `Task: ${task}`);
        const guide = normalizeGuide(extractJson<MasterGuide>(raw), task);
        return { model: p.id, rank: p.rank, ok: !!guide, latencyMs: Date.now() - t0, guide };
      } catch (e) {
        return { model: p.id, rank: p.rank, ok: false, latencyMs: Date.now() - t0, error: String((e as Error).message || e) };
      }
    });

    // 2) SCORE — keep the top 3 successful answers by structural quality.
    const ranked = answers
      .filter((a) => a.ok && a.guide)
      .sort((a, b) => scoreGuide(b.guide) - scoreGuide(a.guide));
    const top = ranked.slice(0, 3);

    if (top.length === 0) {
      const guide = offlineGuide(task);
      return { guide, answers, top: [] };
    }
    if (top.length === 1) {
      // consensus 0, not 0.6. One model agreeing with itself is not agreement,
      // and 0.6 was a number chosen to look respectable on a badge. The UI can
      // say "1 model" honestly; it cannot say "60% consensus" truthfully.
      const guide = { ...top[0].guide! };
      guide.provenance = { models: [top[0].model], consensus: 0 };
      return { guide, answers, top };
    }

    // 3) SYNTHESIZE — evaluator merges the top 3 into the master guide.
    const evaluator = evaluatorProvider();
    const payload = top
      .map((a, i) => `### Candidate ${i + 1} — ${a.model}\n${JSON.stringify(a.guide)}`)
      .join('\n\n');
    let synth: MasterGuide | undefined;
    try {
      const raw = await evaluator.call(synthSystem(), `Task: ${task}\n\n${payload}`);
      synth = normalizeGuide(extractJson<MasterGuide>(raw), task);
    } catch {
      synth = undefined;
    }

    const guide = synth ?? mergeHeuristic(top, task);
    guide.provenance = { models: top.map((t) => t.model), consensus: consensusScore(top) };
    return { guide, answers, top };
  }
}

// ── consensus + heuristic merge fallback (if the evaluator call fails) ──────

export function consensusScore(top: ModelAnswer[]): number {
  // Overlap of step titles across candidates → an agreement signal.
  //
  // THE FLOOR IS GONE, AND THAT WAS THE BUG. This ended with
  //     return Math.min(1, 0.5 + shared / all.size);
  // so models that agreed on NOTHING scored 0.5, and the UI renders this
  // straight to the reader as "consensus 50%". A number invented to look
  // reassuring is worse than no number: it is the one thing on screen that
  // claims the answer was corroborated, and it said so most loudly exactly
  // when corroboration had failed.
  //
  // One model is not a consensus either - it is one opinion, and the caller
  // reports it as such rather than passing a lone answer through here.
  if (top.length < 2) return 0;
  const titleSets = top.map((t) => new Set((t.guide?.steps || []).map((s) => norm(s.title))));
  const all = new Set<string>();
  titleSets.forEach((s) => s.forEach((x) => all.add(x)));
  if (all.size === 0) return 0;
  let shared = 0;
  all.forEach((title) => {
    const hits = titleSets.filter((s) => s.has(title)).length;
    if (hits >= 2) shared++;
  });
  return shared / all.size;
}

function mergeHeuristic(top: ModelAnswer[], task: string): MasterGuide {
  const best = top[0].guide!;
  const seen = new Set(best.steps.map((s) => norm(s.title)));
  const extraGuardrails = top
    .slice(1)
    .flatMap((t) => t.guide?.steps || [])
    .filter((s) => s.badge === 'watch-out' && !seen.has(norm(s.title)));
  const steps = [...best.steps, ...extraGuardrails].map((s, i) => ({ ...s, index: i + 1 }));
  return { ...best, task, steps, edges: best.edges };
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// ── offline deterministic guide (no keys / all providers down) ─────────────

function offlineGuide(task: string): MasterGuide {
  const steps: HowToStep[] = [
    { id: 's1', index: 1, badge: 'start', title: 'Get set up', detail: `Gather everything you need to ${task}. Clear a calm space.`, videoPrompt: `A tidy desk prepared to ${task}, warm cinematic light` },
    { id: 's2', index: 2, badge: 'action', title: 'Do the first move', detail: 'Start with the single easiest action. Momentum beats perfection.', videoPrompt: `Close-up hands beginning to ${task}` },
    { id: 's3', index: 3, badge: 'watch-out', title: 'Avoid the common trap', detail: 'Go slow here — this is where most people slip.', videoPrompt: 'A gentle warning highlight over the tricky part' },
    { id: 's4', index: 4, badge: 'checkpoint', title: 'Check your progress', detail: 'Pause and confirm it looks right before continuing.', videoPrompt: 'A checkmark glowing as progress is verified' },
    { id: 's5', index: 5, badge: 'finish', title: 'Finish and celebrate', detail: `You did it — you now know how to ${task}.`, videoPrompt: 'Confetti and a satisfied smile, cinematic' },
  ];
  return {
    task, summary: `A calm, can't-fail path to ${task}.`, difficulty: 'moderate', estMinutes: 5,
    steps, edges: steps.slice(0, -1).map((s, i) => ({ from: s.id, to: steps[i + 1].id })),
    provenance: { models: ['offline'], consensus: 0 },
  };
}
