import { useCallback, useState } from 'react';
import type { CascadeResult } from '../types';
import { offlineCascadeResult } from '../services/offlineGuide';

interface State { loading: boolean; result: CascadeResult | null; error: string | null; offline: boolean; }

/** Drives the /api/cascade endpoint and exposes {run, ...state}. */
export function useCascade() {
  const [state, setState] = useState<State>({ loading: false, result: null, error: null, offline: false });

  // `task` is the full (optimized) prompt sent to the models; `label` is the
  // clean, short title shown in the UI so the header never renders a wall of
  // text or the raw entry.
  const run = useCallback(async (task: string, label?: string) => {
    setState({ loading: true, result: null, error: null, offline: false });
    const title = (label || task).trim();
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/cascade`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      if (!r.ok) throw new Error(`Cascade failed (${r.status})`);
      const result = (await r.json()) as CascadeResult;
      // If the server had no provider keys (or all providers failed) it returns
      // its OWN deterministic offlineGuide built from the raw `task` — which,
      // for an optimized ask, is the long "Act as a world-class instructional
      // designer…" paragraph, so its summary/steps read wrong ("Gather
      // everything you need to Act as…"). Detect that and rebuild the whole
      // guide from the clean `title`, not just the header.
      const models = result?.guide?.provenance?.models || [];
      const serverOffline = models.length === 1 && models[0] === 'offline';
      if (serverOffline) {
        const rebuilt = offlineCascadeResult(title);
        setState({ loading: false, result: rebuilt, error: 'No model produced a guide — showing a generic outline.', offline: true });
        return rebuilt;
      }
      if (result.guide) result.guide.task = title;   // real guide → keep the displayed title clean
      setState({ loading: false, result, error: null, offline: false });
      return result;
    } catch (e) {
      // Still answer rather than showing a dead screen — but SAY SO. The old
      // version swallowed the reason and set error:null, so a completely
      // unreachable endpoint looked identical to a real guide. That is how
      // "Get set up / Do the first move / Avoid the common trap" reached
      // production and stayed there: the placeholder was indistinguishable
      // from an answer, to the user and to anyone testing it.
      const result = offlineCascadeResult(title);
      const why = e instanceof Error ? e.message : 'the guide service is unreachable';
      setState({ loading: false, result, error: why, offline: true });
      return result;
    }
  }, []);

  return { ...state, run };
}
