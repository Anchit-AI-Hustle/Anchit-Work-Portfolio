// Client-side deterministic guide. Mirrors the server's offline fallback so the
// How-To Engine still produces a calm, ADHD-friendly walkthrough when the
// /api/cascade serverless function isn't reachable — e.g. when the SPA is served
// as a purely static build (no provider keys, no functions) at /how-to.

import type { CascadeResult, HowToStep, MasterGuide } from '../types';

export function offlineGuide(task: string): MasterGuide {
  const clean = (task || 'do this').trim();
  const steps: HowToStep[] = [
    { id: 's1', index: 1, badge: 'start', title: 'Get set up', detail: `Gather everything you need to ${clean}. Clear a calm space.`, videoPrompt: `A tidy desk prepared to ${clean}, warm cinematic light` },
    { id: 's2', index: 2, badge: 'action', title: 'Do the first move', detail: 'Start with the single easiest action. Momentum beats perfection.', videoPrompt: `Close-up hands beginning to ${clean}` },
    { id: 's3', index: 3, badge: 'watch-out', title: 'Avoid the common trap', detail: 'Go slow here — this is where most people slip.', videoPrompt: 'A gentle warning highlight over the tricky part' },
    { id: 's4', index: 4, badge: 'checkpoint', title: 'Check your progress', detail: 'Pause and confirm it looks right before continuing.', videoPrompt: 'A checkmark glowing as progress is verified' },
    { id: 's5', index: 5, badge: 'finish', title: 'Finish and celebrate', detail: `You did it — you now know how to ${clean}.`, videoPrompt: 'Confetti and a satisfied smile, cinematic' },
  ];
  return {
    task: clean,
    summary: `A calm, can't-fail path to ${clean}.`,
    difficulty: 'moderate',
    estMinutes: 5,
    steps,
    edges: steps.slice(0, -1).map((s, i) => ({ from: s.id, to: steps[i + 1].id })),
    provenance: { models: ['offline'], consensus: 0 },
  };
}

/** A full CascadeResult built entirely on the client (no server round-trip). */
export function offlineCascadeResult(task: string): CascadeResult {
  return { guide: offlineGuide(task), answers: [], top: [] };
}
