// ── Shared domain types for the How-To Engine ──────────────────────────────

export type Difficulty = 'trivial' | 'easy' | 'moderate' | 'skilled' | 'expert';

/** One atomic, ADHD-friendly micro-chunk of a task. */
export interface HowToStep {
  id: string;
  index: number;
  /** 3–7 word imperative title, e.g. "Press the side button". */
  title: string;
  /** One or two short sentences. Never a wall of text. */
  detail: string;
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
