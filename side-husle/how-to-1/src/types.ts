// ── Shared domain types for the How-To Engine ──────────────────────────────

export type Difficulty = 'trivial' | 'easy' | 'moderate' | 'skilled' | 'expert';

/** Something you need in hand before step 1. */
export interface Prerequisite {
  item: string;
  /** Why it is needed, or how to get it. One short line. */
  note?: string;
}

/** A real failure and what to do about it — not a badge. */
export interface Pitfall {
  /** What goes wrong, in the words someone would use to search for it. */
  problem: string;
  /** What to actually do. */
  fix: string;
}

/** One atomic, ADHD-friendly micro-chunk of a task.
 *
 *  ADHD-FRIENDLY MEANS CHUNKED, NOT EMPTY.
 *  Every field below used to be `title` + one or two sentences of `detail`, and
 *  the doc comment on `detail` read "Never a wall of text." The prompt, the
 *  score function and the renderer all said the same thing, so the engine was a
 *  thinness optimiser end to end and produced guides with no instruction in
 *  them. Brevity is a property of PROSE. It is not a reason to withhold the
 *  command, the menu path, the value to type, or what to do when it fails.
 *
 *  So `detail` stays short — and the substance lives in the structured fields
 *  below, which render as scannable lists rather than paragraphs. */
export interface HowToStep {
  id: string;
  index: number;
  /** 3–7 word imperative title, e.g. "Press the side button". */
  title: string;
  /** One or two short sentences: what to do, in plain words. */
  detail: string;
  /** One line on why this step exists. Following instructions blindly is how
   *  people get stuck the moment reality differs from the guide. */
  why?: string;
  /** The exact things: commands, menu paths, values, button labels, settings.
   *  Short lines, scannable — this is where a guide stops being a summary. */
  specifics?: string[];
  /** How you know this step worked, observably. Replaces a fabricated
   *  "…done, and you can tell that it worked" line the UI used to synthesise
   *  from the title, which said nothing at all. */
  verify?: string;
  /** What actually goes wrong here, and what to do about it. */
  pitfalls?: Pitfall[];
  /** Colour-coded badge category for high visual hierarchy. */
  badge: 'start' | 'action' | 'watch-out' | 'checkpoint' | 'finish';
  /** Optional branch: alternative paths ("if X, do Y"). */
  branches?: { label: string; goToStepId: string }[];
  /** Seconds the step typically takes — feeds progress + pacing. */
  estSeconds?: number;
  /** Prompt used to generate an animated clip for this step. */
  videoPrompt?: string;
}

/** The synthesized master guide returned by the cascade. */
export interface MasterGuide {
  task: string;
  summary: string;
  difficulty: Difficulty;
  estMinutes: number;
  /** What to have ready before step 1. A guide that starts mid-task and only
   *  mentions the missing tool at step 4 has wasted the reader's setup. */
  prerequisites?: Prerequisite[];
  /** How you know the whole task is done — the observable end state. */
  successCriteria?: string;
  steps: HowToStep[];
  /** Directed edges for the flow diagram (stepId -> stepId, with labels). */
  edges: { from: string; to: string; label?: string }[];
  /** Which models contributed, and the consensus score 0–1. */
  provenance: { models: string[]; consensus: number };
}

/** A single model's raw answer inside the cascade. */
export interface ModelAnswer {
  model: string;
  rank: number;
  ok: boolean;
  latencyMs: number;
  /** Raw guide the model proposed (may be partial / lower quality). */
  guide?: MasterGuide;
  error?: string;
}

export interface CascadeResult {
  guide: MasterGuide;
  answers: ModelAnswer[];          // every model's attempt (for transparency)
  top: ModelAnswer[];              // the top-3 selected for synthesis
}

export interface VideoClip {
  stepId: string;
  status: 'queued' | 'rendering' | 'ready' | 'error';
  url?: string;
  posterUrl?: string;
  error?: string;
}
