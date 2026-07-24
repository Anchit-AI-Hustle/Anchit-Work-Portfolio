// Per-step animated scene. Fully self-contained: it renders an on-theme
// (black / orange / gold) animated visual built from CSS + the step's own
// videoPrompt — no network, no serverless dependency, so it can never show a
// broken box or "preview unavailable". (A real text-to-video provider can be
// swapped in later behind /api/text-to-video; until then this always works.)

import { useState } from 'react';
import type { HowToStep } from '../types';

// Warm, on-theme tint per badge — matches the flow diagram + step cards.
const TINT: Record<HowToStep['badge'], string> = {
  start: '#FFB736', action: '#FF6940', 'watch-out': '#FF4D1F', checkpoint: '#c9a96e', finish: '#FF8A3D',
};

// A few deterministic particle positions/timings so the scene feels alive
// without pulling in randomness (which would also break SSR/build determinism).
const PARTICLES = [
  { left: '18%', delay: '0s', dur: '3.4s' },
  { left: '34%', delay: '1.1s', dur: '4.2s' },
  { left: '52%', delay: '0.5s', dur: '3.8s' },
  { left: '68%', delay: '1.8s', dur: '4.6s' },
  { left: '82%', delay: '0.9s', dur: '3.2s' },
];

export default function StepVideo({ step }: { step: HowToStep }) {
  const [open, setOpen] = useState(false);
  const tint = TINT[step.badge] || '#FF6940';
  const caption = step.videoPrompt || step.title;

  return (
    <div className="step-video">
      {!open ? (
        <button className="btn tiny" onClick={() => setOpen(true)}>▶ Watch this step</button>
      ) : (
        <div className="video-frame glass">
          <div className="anim-preview" style={{ ['--v-tint' as string]: tint }} role="img" aria-label={caption}>
            <div className="anim-orb" />
            <div className="anim-particles" aria-hidden>
              {PARTICLES.map((p, i) => (
                <i key={i} style={{ left: p.left, animationDelay: p.delay, animationDuration: p.dur }} />
              ))}
            </div>
            <div className="anim-cap">
              <span className="anim-kicker">Step {step.index} · animated scene</span>
              {caption}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
