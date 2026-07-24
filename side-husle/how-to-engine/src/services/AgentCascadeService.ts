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

import { PROVIDERS, evaluatorProvider, type ModelProvider } from './providers';
import type { CascadeResult, HowToStep, MasterGuide, ModelAnswer } from '../types';

const MAX_PARALLEL = Number(
  (typeof process !== 'undefined' && process.env?.CASCADE_MAX_PARALLEL) || 4,
);

// ── prompt scaffolding ─────────────────────────────────────────────────────

const GUIDE_SHAPE = `{
  "task": string,
  "summary": string (<= 240 chars),
  "difficulty": "trivial" | "easy" | "moderate" | "skilled" | "expert",
  "estMinutes": number,
  "steps": [{
    "id": string, "index": number,
    "title": string (3-7 words, imperative),
    "detail": string (1-2 short sentences, NO walls of text),
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
    'Rules: each step is one atomic action; titles 3-7 words; details 1-2 short sentences;',
    'no walls of text; add "watch-out" badges for common mistakes; add branches where',
    'the path forks; give every step a vivid one-line videoPrompt.',
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

function normalizeGuide(g: Partial<MasterGuide> | null, task: string): MasterGuide | undefined {
  if (!g || !Array.isArray(g.steps) || g.steps.length === 0) return undefined;
  const steps: HowToStep[] = g.steps.map((s, i) => ({
    id: s.id || `s${i + 1}`,
    index: i + 1,
    title: (s.title || 'Step').trim(),
    detail: (s.detail || '').trim(),
    badge: s.badge || (i === 0 ? 'start' : i === g.steps!.length - 1 ? 'finish' : 'action'),
    branches: s.branches,
    estSeconds: s.estSeconds,
    videoPrompt: s.videoPrompt,
  }));
  const edges = Array.isArray(g.edges) && g.edges.length
    ? g.edges
    : steps.slice(0, -1).map((s, i) => ({ from: s.id, to: steps[i + 1].id }));
  return {
    task: g.task || task,
    summary: g.summary || '',
    difficulty: g.difficulty || 'moderate',
    estMinutes: g.estMinutes || Math.max(1, Math.round(steps.length * 0.6)),
    steps,
    edges,
    provenance: { models: [], consensus: 0 },
  };
}

// ── structural quality score used to pick the top 3 ────────────────────────

function scoreGuide(g?: MasterGuide): number {
  if (!g) return 0;
  const n = g.steps.length;
  const granularity = Math.min(1, n / 8);                                  // ~8 steps is ideal
  const conciseness = avg(g.steps.map((s) => (s.detail.length <= 160 ? 1 : 0)));
  const badges = avg(g.steps.map((s) => (s.badge ? 1 : 0)));
  const guardrails = Math.min(1, g.steps.filter((s) => s.badge === 'watch-out').length / 2);
  const branches = Math.min(1, g.steps.filter((s) => s.branches?.length).length / 2);
  const media = avg(g.steps.map((s) => (s.videoPrompt ? 1 : 0)));
  return 0.30 * granularity + 0.20 * conciseness + 0.15 * badges + 0.15 * guardrails + 0.1 * branches + 0.1 * media;
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
  constructor(private providers: ModelProvider[] = PROVIDERS.filter((p) => p.enabled())) {}

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
      const guide = { ...top[0].guide! };
      guide.provenance = { models: [top[0].model], consensus: 0.6 };
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

function consensusScore(top: ModelAnswer[]): number {
  // Overlap of step titles across candidates → a rough agreement signal.
  const titleSets = top.map((t) => new Set((t.guide?.steps || []).map((s) => norm(s.title))));
  const all = new Set<string>();
  titleSets.forEach((s) => s.forEach((x) => all.add(x)));
  if (all.size === 0) return 0;
  let shared = 0;
  all.forEach((title) => {
    const hits = titleSets.filter((s) => s.has(title)).length;
    if (hits >= 2) shared++;
  });
  return Math.min(1, 0.5 + shared / all.size);
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
