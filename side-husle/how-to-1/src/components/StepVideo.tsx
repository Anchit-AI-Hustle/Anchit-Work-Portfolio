// Per-step animated guide. Requests a clip from the Text-to-Video pipeline and
// shows the animated poster while it renders (never a broken box).

import { useEffect, useRef, useState } from 'react';
import type { HowToStep, VideoClip } from '../types';
import { requestClip, pollClip } from '../services/textToVideo';

export default function StepVideo({ step }: { step: HowToStep }) {
  const [clip, setClip] = useState<VideoClip | null>(null);
  const [open, setOpen] = useState(false);
  // Track which step we've already kicked a request for, so the effect fires
  // exactly once per (open, step) — NOT on every setClip. Depending on `clip`
  // here would re-run the effect and its cleanup, flipping `alive` to false and
  // cancelling the in-flight request before it resolves.
  const startedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (startedFor.current === step.id) return;
    startedFor.current = step.id;
    let alive = true;
    setClip({ stepId: step.id, status: 'rendering' });
    requestClip({ stepId: step.id, prompt: step.videoPrompt || step.title, seconds: 5 })
      .then((c) => {
        if (!alive) return;
        // Queued/rendering jobs return a jobId in `url` — poll until it's ready.
        if ((c.status === 'queued' || c.status === 'rendering') && c.url) {
          setClip({ stepId: step.id, status: 'rendering' });
          pollClip(step.id, c.url).then((fin) => { if (alive) setClip(fin); });
        } else {
          setClip(c);
        }
      });
    return () => { alive = false; };
  }, [open, step.id, step.videoPrompt, step.title]);

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
