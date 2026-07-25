// Per-step animated scene. Fully self-contained: it renders an on-theme
// (black / orange / gold) animated visual built from CSS + the step's own
// videoPrompt — no network, no serverless dependency, so it can never show a
// broken box or "preview unavailable". (A real text-to-video provider can be
// swapped in later behind /api/text-to-video; until then this always works.)

import { useEffect, useState } from 'react';
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

interface Resolved { videoId?: string; embedUrl?: string; watchUrl: string; }

export default function StepVideo({ step, task }: { step: HowToStep; task?: string }) {
  const [open, setOpen] = useState(false);
  const [vid, setVid] = useState<Resolved | null>(null);
  const [loading, setLoading] = useState(false);
  const tint = TINT[step.badge] || '#FF6940';
  const caption = step.videoPrompt || step.title;

  const query = `how to ${[task, step.title].filter(Boolean).join(' ')}`.replace(/\s+/g, ' ').trim();
  const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;

  // On open, ask Claude (via the root /api/step-video function, which uses web
  // search) for the single best REAL tutorial video and embed it inline. If the
  // function isn't reachable (static/offline) or finds nothing, fall back to a
  // YouTube search link. Absolute path: the How-To SPA lives under /how-to-2/
  // but the serverless function is served from the site root.
  useEffect(() => {
    if (!open || vid) return;
    let alive = true;
    setLoading(true);
    fetch(`/api/step-video?q=${encodeURIComponent(query)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j: Resolved | null) => { if (alive) setVid(j && (j.videoId || j.watchUrl) ? j : { watchUrl: searchUrl }); })
      .catch(() => { if (alive) setVid({ watchUrl: searchUrl }); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, vid, query, searchUrl]);

  return (
    <div className="step-video">
      {!open ? (
        <button className="btn tiny" onClick={() => setOpen(true)}>▶ Watch this step</button>
      ) : vid?.videoId ? (
        <div className="video-frame glass">
          <iframe
            className="video-embed"
            src={`https://www.youtube-nocookie.com/embed/${vid.videoId}`}
            title={`Tutorial — ${caption}`}
            loading="lazy"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          />
          <a className="video-yt" href={vid.watchUrl} target="_blank" rel="noopener noreferrer">Open on YouTube ↗</a>
        </div>
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
              <span className="anim-kicker">Step {step.index} · {loading ? 'finding a tutorial…' : 'animated scene'}</span>
              {caption}
            </div>
          </div>
          <a className="video-yt" href={vid?.watchUrl || searchUrl} target="_blank" rel="noopener noreferrer">
            ▶ Watch real tutorials for this step on YouTube ↗
          </a>
        </div>
      )}
    </div>
  );
}
