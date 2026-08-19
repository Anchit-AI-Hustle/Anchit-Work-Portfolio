// ============================================================================
// GuideDesk — the guide, rendered as a desk rather than as a feed.
//
// The output used to be a scrolling column of cards with a flow map pinned
// beside it: everything on screen at once, and the reader deciding where to
// look. This is the same data in the structure the marketing course uses — a
// rail of steps on the left, one step at a time in a measured column on the
// right, and a sticky bar that says where you are.
//
// The palette is the how-to engine's own, deliberately. The point of matching
// the course was its STRUCTURE; matching its colours as well would have put the
// input (which keeps its design) and the output in two different products.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import type { MasterGuide, HowToStep } from '../types';
import StepVideo from './StepVideo';

const BADGE: Record<HowToStep['badge'], string> = {
  start: 'Start here',
  action: 'Do this',
  'watch-out': 'Watch out',
  checkpoint: 'Check',
  finish: 'Finish',
};

function mmss(total: number) {
  const m = Math.floor(total / 60), s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function GuideDesk({
  guide, activeId, onSelect,
}: { guide: MasterGuide; activeId?: string; onSelect: (id: string) => void }) {
  const steps = guide.steps;
  const idx = Math.max(0, steps.findIndex((s) => s.id === activeId));
  const step = steps[idx] || steps[0];
  const pct = steps.length ? Math.round(((idx + 1) / steps.length) * 100) : 0;

  // Notes per step, kept across reloads. Keyed by the task so two different
  // guides do not overwrite each other's notes.
  const noteKey = `howto-notes:${guide.task}:${step?.id}`;
  const [note, setNote] = useState('');
  useEffect(() => {
    try { setNote(localStorage.getItem(noteKey) || ''); } catch { setNote(''); }
  }, [noteKey]);
  const saveNote = (v: string) => {
    setNote(v);
    try { localStorage.setItem(noteKey, v); } catch { /* private mode */ }
  };

  // A block timer, the course's idea: it makes a step feel like a thing you sit
  // down and do rather than a paragraph you skim.
  const [elapsed, setElapsed] = useState(0);
  const [running, setRunning] = useState(false);
  const tick = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!running) return;
    tick.current = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(tick.current);
  }, [running]);
  useEffect(() => { setElapsed(0); setRunning(false); }, [step?.id]);

  const outgoing = useMemo(
    () => guide.edges.filter((e) => e.from === step?.id && e.label),
    [guide.edges, step?.id],
  );

  if (!step) return null;

  return (
    <div className="gd">
      <aside className="gd-rail" aria-label="Steps">
        <div className="gd-rail-head">
          <p className="gd-rail-kicker">How to</p>
          <h2 className="gd-rail-title">{guide.task}</h2>
          <div className="gd-prog">
            <div className="gd-prog-bar"><motion.i animate={{ width: `${pct}%` }} /></div>
            <span className="gd-prog-pct">{pct}%</span>
          </div>
          <p className="gd-rail-meta">
            {steps.length} steps · ≈{guide.estMinutes} min · {guide.difficulty}
          </p>
        </div>

        <ol className="gd-steps">
          {steps.map((s, i) => (
            <li key={s.id}>
              <button
                type="button"
                className={`gd-step ${s.id === step.id ? 'is-on' : ''} ${i < idx ? 'is-done' : ''}`}
                onClick={() => onSelect(s.id)}
                aria-current={s.id === step.id ? 'step' : undefined}
              >
                <span className="gd-step-n">{String(i + 1).padStart(2, '0')}</span>
                <span className="gd-step-body">
                  <span className="gd-step-title">{s.title}</span>
                  <span className="gd-step-sub">
                    {BADGE[s.badge]}{s.estSeconds ? ` · ${s.estSeconds}s` : ''}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </aside>

      <div className="gd-main">
        <div className="gd-topbar">
          <span className="gd-crumb">
            Step {String(idx + 1).padStart(2, '0')} <i>/</i> {step.title}
          </span>
          <div className="gd-tools">
            <button type="button" className="gd-tool" onClick={() => setRunning((r) => !r)}>
              <b>{mmss(elapsed)}</b> {running ? 'Pause' : 'Start block'}
            </button>
            <button type="button" className="gd-tool" onClick={() => { setElapsed(0); setRunning(false); }}>
              Reset
            </button>
          </div>
        </div>

        <article className="gd-wrap">
          <p className="gd-eyebrow">
            Step {String(idx + 1).padStart(2, '0')} · {BADGE[step.badge]}
          </p>
          <h1 className="gd-h1">{step.title}</h1>
          <p className="gd-lede">{step.detail}</p>

          <section className="gd-card">
            <h3 className="gd-card-h">By the end of this step</h3>
            <ul className="gd-list">
              <li>{step.title.replace(/^\w/, (c) => c.toLowerCase())} — done, and you can tell that it worked</li>
              {step.estSeconds ? <li>about {step.estSeconds} seconds of actual doing</li> : null}
              {outgoing.length ? <li>you know which way to go next</li> : null}
            </ul>
          </section>

          {step.videoPrompt ? (
            <section className="gd-card gd-card--flush">
              <h3 className="gd-card-h">Watch it happen</h3>
              <StepVideo step={step} task={guide.task} />
            </section>
          ) : null}

          {outgoing.length ? (
            <section className="gd-card">
              <h3 className="gd-card-h">If it goes differently</h3>
              <ul className="gd-branches">
                {outgoing.map((e) => (
                  <li key={`${e.from}-${e.to}`}>
                    <button type="button" onClick={() => onSelect(e.to)}>
                      <span>{e.label}</span>
                      <i aria-hidden="true">→</i>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="gd-card">
            <h3 className="gd-card-h">Your notes</h3>
            <textarea
              className="gd-notes"
              value={note}
              onChange={(e) => saveNote(e.target.value)}
              placeholder="What actually happened when you did this?"
              rows={4}
            />
          </section>

          <nav className="gd-nav">
            <button type="button" className="gd-nav-btn" disabled={idx === 0}
              onClick={() => onSelect(steps[idx - 1].id)}>← Previous</button>
            <button type="button" className="gd-nav-btn gd-nav-btn--go" disabled={idx === steps.length - 1}
              onClick={() => onSelect(steps[idx + 1].id)}>Next step →</button>
          </nav>
        </article>
      </div>
    </div>
  );
}
