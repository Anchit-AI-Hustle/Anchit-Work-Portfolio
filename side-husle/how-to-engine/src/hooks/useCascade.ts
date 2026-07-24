import { useCallback, useState } from 'react';
import type { CascadeResult } from '../types';

interface State { loading: boolean; result: CascadeResult | null; error: string | null; }

/** Drives the /api/cascade endpoint and exposes {run, ...state}. */
export function useCascade() {
  const [state, setState] = useState<State>({ loading: false, result: null, error: null });

  const run = useCallback(async (task: string) => {
    setState({ loading: true, result: null, error: null });
    try {
      const r = await fetch(`${import.meta.env.BASE_URL}api/cascade`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ task }),
      });
      if (!r.ok) throw new Error(`Cascade failed (${r.status})`);
      const result = (await r.json()) as CascadeResult;
      setState({ loading: false, result, error: null });
      return result;
    } catch (e) {
      setState({ loading: false, result: null, error: String((e as Error).message || e) });
      return null;
    }
  }, []);

  return { ...state, run };
}
