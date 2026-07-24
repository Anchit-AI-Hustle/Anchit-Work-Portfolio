// One ADHD-friendly step: colour-coded badge, big title, short detail, optional
// branches, and a lazy per-step animated video. Reveals with a soft motion.

import { motion } from 'framer-motion';
import type { HowToStep } from '../types';
import StepVideo from './StepVideo';

const BADGE: Record<HowToStep['badge'], { label: string; color: string }> = {
  start: { label: 'START', color: '#2ee5ac' },
  action: { label: 'DO', color: '#5b8cff' },
  'watch-out': { label: 'WATCH OUT', color: '#ff8a3d' },
  checkpoint: { label: 'CHECK', color: '#c9a96e' },
  finish: { label: 'DONE', color: '#ff5fd2' },
};

export default function StepCard({ step, active, onFocus }: {
  step: HowToStep; active: boolean; onFocus: () => void;
}) {
  const badge = BADGE[step.badge];
  return (
    <motion.article
      className={`step-card glass ${active ? 'active' : ''}`}
      onMouseEnter={onFocus}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15%' }}
      transition={{ type: 'spring', stiffness: 120, damping: 18 }}
      style={{ ['--accent' as string]: badge.color }}
    >
      <header>
        <span className="step-num">{step.index}</span>
        <span className="step-badge" style={{ background: badge.color }}>{badge.label}</span>
        {step.estSeconds ? <span className="step-time">~{step.estSeconds}s</span> : null}
      </header>
      <h3>{step.title}</h3>
      <p>{step.detail}</p>

      {step.branches?.length ? (
        <ul className="branches">
          {step.branches.map((b) => (
            <li key={b.label}><span className="fork">⑂</span> {b.label}</li>
          ))}
        </ul>
      ) : null}

      <StepVideo step={step} />
    </motion.article>
  );
}
