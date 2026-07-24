// Client-side wrapper for the Text-to-Video pipeline. It POSTs a step's
// description to /api/text-to-video (which brokers Runway / Luma / Sora) and
// polls until the clip is ready. Provider-agnostic: the server decides which
// vendor to use based on which key is configured.

import type { VideoClip } from '../types';

const API = `${import.meta.env.BASE_URL}api/text-to-video`;

export interface T2VRequest { stepId: string; prompt: string; seconds?: number; aspect?: '16:9' | '9:16' | '1:1'; }

export async function requestClip(req: T2VRequest): Promise<VideoClip> {
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
    });
    if (!r.ok) throw new Error(`t2v ${r.status}`);
    const j = (await r.json()) as VideoClip;
    return j;
  } catch (e) {
    return { stepId: req.stepId, status: 'error', error: String((e as Error).message || e) };
  }
}

/** Poll a rendering job until ready/error (server returns a jobId in url when queued). */
export async function pollClip(stepId: string, jobId: string, tries = 20, gapMs = 3000): Promise<VideoClip> {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(`${API}?jobId=${encodeURIComponent(jobId)}`);
    if (r.ok) {
      const j = (await r.json()) as VideoClip;
      if (j.status === 'ready' || j.status === 'error') return j;
    }
    await new Promise((res) => setTimeout(res, gapMs));
  }
  return { stepId, status: 'error', error: 'timeout' };
}
