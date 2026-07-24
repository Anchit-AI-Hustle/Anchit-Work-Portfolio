// Per-step animated guide. Requests a clip from the Text-to-Video pipeline and
// shows the animated poster while it renders (never a broken box).

import { useEffect, useState } from 'react';
import type { HowToStep, VideoClip } from '../types';
import { requestClip } from '../services/textToVideo';

export default function StepVideo({ step }: { step: HowToStep }) {
  const [clip, setClip] = useState<VideoClip | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open || clip) return;
    let alive = true;
    setClip({ stepId: step.id, status: 'rendering' });
    requestClip({ stepId: step.id, prompt: step.videoPrompt || step.title, seconds: 5 })
      .then((c) => { if (alive) setClip(c); });
    return () => { alive = false; };
  }, [open, clip, step]);

  return (
    <div className="step-video">
      {!open ? (
        <button className="btn tiny" onClick={() => setOpen(true)}>▶ Watch this step</button>
      ) : (
        <div className="video-frame glass">
          {clip?.status === 'ready' && clip.url && !clip.url.startsWith('data:') ? (
            <video src={clip.url} poster={clip.posterUrl} controls autoPlay muted loop playsInline />
          ) : (
            <div className="video-poster" style={{ backgroundImage: clip?.posterUrl ? `url(${clip.posterUrl})` : undefined }}>
              <span className="pulse-dot" /> {clip?.status === 'error' ? 'Preview unavailable' : 'Rendering animation…'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
