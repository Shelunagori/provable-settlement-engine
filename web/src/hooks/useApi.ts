import { useCallback, useEffect, useRef, useState } from 'react';

export type ApiState<T> = {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * The smallest thing that does the job: one request, a loading and an error
 * state, and an explicit refresh actions can call after they change something.
 *
 * Responses from a request that started before the component unmounted, or
 * before a newer request for the same resource, are discarded rather than
 * written into state -- otherwise a slow first fetch can overwrite a fresher
 * one and the console would show a balance that is quietly out of date.
 */
export const useApi = <T>(fetcher: () => Promise<T>, deps: unknown[] = []): ApiState<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);

  const alive = useRef(true);
  const requestId = useRef(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    try {
      const value = await fetcherRef.current();
      if (!alive.current || id !== requestId.current) return;
      setData(value);
      setError(null);
    } catch (err) {
      if (!alive.current || id !== requestId.current) return;
      setError(err as Error);
    } finally {
      if (alive.current && id === requestId.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, refresh };
};
