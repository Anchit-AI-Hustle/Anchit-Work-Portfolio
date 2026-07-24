// ============================================================================
// PromptOptimizer — dual-state prompt component
//   • EMPTY STATE  : a "Surprise me" CTA that generates a random creative prompt
//                    + auto-suggestion chips spanning trivial → expert tasks.
//   • OPTIMIZE     : takes the user's rough input and crafts the BEST possible
//                    prompt from it, then HIDES the raw entry and shows only the
//                    optimized prompt (they can revert to edit the original).
//                    The guide is built from the optimized prompt; the on-screen
//                    title stays a clean, short label — never the raw text or the
//                    verbose optimized paragraph.
// ============================================================================

import { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { SUGGESTIONS, randomPrompt } from '../lib/suggestions';

interface Props {
  // task = what the cascade builds from; label = the clean title to display.
  onSubmit: (task: string, label?: string) => void;
  busy?: boolean;
}

// Strip conversational scaffolding down to the core "do this" phrase, so the
// title/label reads cleanly (e.g. "how do I swim breaststroke?" → "Swim
// breaststroke").
function deriveLabel(raw: string): string {
  let t = raw.trim().replace(/\s+/g, ' ').replace(/[?.!]+$/g, '');
  t = t.replace(/^(please\s+)?(could you\s+|can you\s+)?(explain|teach|show|tell|guide|walk)\s+(me\s+)?(through\s+)?(how\s+)?(to\s+)?/i, '');
  t = t.replace(/^how\s+(do i|to|can i|should i|would i)\s+/i, '');
  t = t.replace(/^i\s+(want|need|would like|wanna)\s+to\s+/i, '');
  t = t.trim();
  if (!t) t = raw.trim().replace(/[?.!]+$/g, '');
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Turn a rough ask into a gold-standard, self-contained prompt. It USES the
// user's input (via the derived core) but does not simply echo their raw words
// back — it reframes into a complete instruction. (For a fully agentic rewrite,
// POST to /api/cascade with an "optimize" mode; this deterministic version keeps
// the component instant and offline-safe.)
function optimize(raw: string): string {
  const core = deriveLabel(raw);
  const lc = core.charAt(0).toLowerCase() + core.slice(1);
  return (
    `Act as a world-class instructional designer. Produce a complete, do-it-right guide to ${lc}. ` +
    `Assume the reader has never done this and is easily overwhelmed: break it into the smallest possible, ` +
    `can't-fail steps — one concrete action per step. Call out the single place people most often slip, ` +
    `note any decision forks ("if X, do Y"), say what to prepare first, and finish with a quick way to ` +
    `confirm it worked. Keep every step short, plain, and jargon-free.`
  );
}

export default function PromptOptimizer({ onSubmit, busy }: Props) {
  const [value, setValue] = useState('');
  const [optimized, setOptimized] = useState<string | null>(null);
  const filled = value.trim().length > 0;
  const chips = useMemo(() => SUGGESTIONS, []);

  const build = () => {
    const raw = value.trim();
    if (busy) return;
    if (optimized) { onSubmit(optimized, deriveLabel(raw || optimized)); return; }
    if (raw) onSubmit(raw, deriveLabel(raw));
  };

  const runOptimize = () => {
    const raw = value.trim();
    if (!raw) return;
    setOptimized(optimize(raw));   // hide the raw entry; show the optimized prompt
  };

  const editOriginal = () => setOptimized(null);

  return (
    <div className="prompt">
      <div className="prompt-lead">Ask how to do anything</div>

      {/* Once optimized, the raw textarea is replaced by the optimized prompt. */}
      {optimized ? (
        <motion.div className="optimized glass" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <div className="opt-head">
            <span className="opt-tag">✨ Optimized prompt</span>
            <button type="button" className="btn tiny ghost" onClick={editOriginal}>↺ Edit original</button>
          </div>
          <p className="opt-text">{optimized}</p>
          <div className="opt-foot">
            <span className="opt-note">Crafted from your ask — this is what builds your guide.</span>
            <button type="button" className="btn primary" onClick={build} disabled={busy}>
              {busy ? 'Thinking…' : 'Build my guide →'}
            </button>
          </div>
        </motion.div>
      ) : (
        <div className="prompt-box glass">
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) build(); }}
            placeholder="What do you want to learn to do? Anything — from switching on a phone to swimming breaststroke."
            rows={3}
            aria-label="Describe the task you want to learn"
          />

          <div className="prompt-actions">
            {/* Single button that swaps label by state — no AnimatePresence
                wait-mode (its exit-complete can stall and drop the next button). */}
            {!filled ? (
              <button type="button" className="btn ghost" onClick={() => setValue(randomPrompt())}>
                🎲 Surprise me
              </button>
            ) : (
              <button type="button" className="btn ghost" onClick={runOptimize}>
                ✨ Optimize prompt
              </button>
            )}

            <button type="button" className="btn primary" onClick={build} disabled={!filled || busy}>
              {busy ? 'Thinking…' : 'Build my guide →'}
            </button>
          </div>
        </div>
      )}

      {/* Auto-suggestions — always visible so there is never a blank canvas. */}
      <div className="chips" role="list" aria-label="Suggestions">
        {chips.map((c) => (
          <button
            key={c.label} role="listitem" className="chip glass"
            onClick={() => { setValue(c.label); setOptimized(null); }}
          >
            <span aria-hidden>{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
