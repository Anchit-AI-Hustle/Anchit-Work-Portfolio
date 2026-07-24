import { useCallback, useState } from 'react';
import type { CascadeResult } from '../types';
import { offlineCascadeResult } from '../services/offlineGuide';

interface State { loading: boolean; result: CascadeResult | null; error: string | null; offline: boolean; }

/** Drives the /api/cascade endpoint and exposes {run, ...state}. */
export function useCascade() {
  const [state, setState] = useState<State>({ loading: false, result: null, error: null, offline: false });

  const run = useCallback(async (task: string) => {
    setState({ loading: true, result: null, error: null, offline: false });
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/cascade`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      if (!r.ok) throw new Error(`Cascade failed (${r.status})`);
      const result = (await r.json()) as CascadeResult;
      setState({ loading: false, result, error: null, offline: false });
      return result;
    } catch {
      // No serverless cascade reachable (e.g. a static /how-to build with no
      // functions or keys) → produce a deterministic guide on the client so the
      // engine always answers instead of showing an error.
      const result = offlineCascadeResult(task);
      setState({ loading: false, result, error: null, offline: true });
      return result;
    }
  }, []);

  return { ...state, run };
}
