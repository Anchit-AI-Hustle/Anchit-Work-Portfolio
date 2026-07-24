// ============================================================================
// PromptOptimizer — dual-state prompt component
//   • EMPTY STATE  : a "Surprise me" CTA that generates a random creative prompt
//                    + auto-suggestion chips spanning trivial → expert tasks.
//   • FILLED STATE : an "Optimize prompt" agentic action that refines/expands
//                    the user's rough input into a gold-standard prompt before
//                    it is sent to the cascade.
// ============================================================================

import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SUGGESTIONS, randomPrompt } from '../lib/suggestions';

interface Props {
  onSubmit: (task: string) => void;
  busy?: boolean;
}

// Client-side gold-standard rewrite. (For a fully agentic rewrite, POST to
// /api/cascade with an "optimize" mode; this deterministic version keeps the
// component instant and offline-safe.)
function optimize(raw: string): string {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (!t) return t;
  const verb = /^(how|what|why|explain|teach|show|guide)/i.test(t) ? '' : 'Explain how to ';
  const clean = t.replace(/[?.!]+$/g, '');
  return (
    `${verb}${clean}. ` +
    'Break it into the smallest possible can\'t-fail steps for someone who is easily ' +
    'overwhelmed. Flag the one place people usually slip, note any decision forks, and ' +
    'keep every step to one short, concrete action.'
  );
}

export default function PromptOptimizer({ onSubmit, busy }: Props) {
  const [value, setValue] = useState('');
  const [optimized, setOptimized] = useState(false);
  const filled = value.trim().length > 0;
  const chips = useMemo(() => SUGGESTIONS, []);

  const submit = () => {
    const t = value.trim();
    if (t && !busy) onSubmit(t);
  };

  return (
    <div className="prompt">
      <div className="prompt-box glass">
        <textarea
          value={value}
          onChange={(e) => { setValue(e.target.value); setOptimized(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
          placeholder="What do you want to learn to do? Anything — from switching on a phone to swimming breaststroke."
          rows={3}
          aria-label="Describe the task you want to learn"
        />

        <div className="prompt-actions">
          <AnimatePresence mode="wait" initial={false}>
            {!filled ? (
              // ── EMPTY STATE ──────────────────────────────────────────────
              <motion.button
                key="surprise"
                type="button"
                className="btn ghost"
                onClick={() => { setValue(randomPrompt()); setOptimized(false); }}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              >
                🎲 Surprise me
              </motion.button>
            ) : (
              // ── FILLED STATE ─────────────────────────────────────────────
              <motion.button
                key="optimize"
                type="button"
                className={`btn ghost ${optimized ? 'done' : ''}`}
                onClick={() => { setValue(optimize(value)); setOptimized(true); }}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
              >
                {optimized ? '✓ Optimized' : '✨ Optimize prompt'}
              </motion.button>
            )}
          </AnimatePresence>

          <button type="button" className="btn primary" onClick={submit} disabled={!filled || busy}>
            {busy ? 'Thinking…' : 'Build my guide →'}
          </button>
        </div>
      </div>

      {/* Auto-suggestions — always visible so there is never a blank canvas. */}
      <div className="chips" role="list" aria-label="Suggestions">
        {chips.map((c) => (
          <button
            key={c.label}
            role="listitem"
            className="chip glass"
            onClick={() => { setValue(c.label); setOptimized(false); }}
          >
            <span aria-hidden>{c.emoji}</span> {c.label}
          </button>
        ))}
      </div>
    </div>
  );
}
