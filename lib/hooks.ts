/** Data-fetching hook with loading / error / pull-to-refresh state. */

import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './api';

export interface QueryState<T> {
  data: T | null;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  /** HTTP status code when the failure was an ApiError. Null otherwise. */
  errorStatus: number | null;
  refresh: () => void;
  reload: () => void;
  setData: React.Dispatch<React.SetStateAction<T | null>>;
}

/**
 * Runs `fetcher` on mount and whenever `deps` change.
 * The fetcher must only depend on values listed in `deps`.
 */
export function useQuery<T>(fetcher: () => Promise<T>, deps: unknown[] = []): QueryState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (mode === 'refresh') setRefreshing(true);
      else setLoading(true);
      setError(null);
      setErrorStatus(null);
      try {
        const result = await fetcher();
        if (mounted.current) setData(result);
      } catch (e) {
        const msg =
          e instanceof ApiError ? e.message : (e as Error)?.message ?? 'Failed to load.';
        const code = e instanceof ApiError ? e.status : null;
        if (mounted.current) {
          setError(msg);
          setErrorStatus(code);
        }
      } finally {
        if (mounted.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps,
  );

  useEffect(() => {
    run('initial');
  }, [run]);

  return {
    data,
    loading,
    refreshing,
    error,
    errorStatus,
    refresh: () => run('refresh'),
    reload: () => run('initial'),
    setData,
  };
}

/** Debounce any rapidly-changing value (e.g. a search box). */
export function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
