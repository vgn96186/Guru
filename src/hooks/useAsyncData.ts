import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';

/**
 * Mount-safe async data fetcher.
 *
 * Replaces the hand-rolled pattern:
 *
 *   useEffect(() => {
 *     let active = true;
 *     fetcher().then((res) => { if (active) setX(res); });
 *     return () => { active = false; };
 *   }, [deps]);
 *
 * With:
 *
 *   const { data, loading, error, reload } = useAsyncData(fetcher, [deps]);
 *
 * State setters are only applied while the component is mounted and the
 * latest effect is active; stale fetches resolving after a dep change are
 * discarded.
 */
export function useAsyncData<T>(
  fetcher: () => Promise<T>,
  deps: DependencyList,
  options: {
    initial?: T;
    onError?: (err: unknown) => void;
    /** When true, skip the fetch and mark loading as false. */
    skip?: boolean;
  } = {},
) {
  const { initial, onError, skip = false } = options;
  const [data, setData] = useState<T | undefined>(initial);
  const [loading, setLoading] = useState<boolean>(!skip);
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);

  // Stash onError in a ref so changing the handler identity doesn't re-run the fetch.
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (skip) {
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    fetcher()
      .then((res) => {
        if (!active) return;
        setData(res);
        setError(null);
      })
      .catch((err) => {
        if (!active) return;
        setError(err);
        onErrorRef.current?.(err);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, reloadToken, skip]);

  const reload = useCallback(() => setReloadToken((n) => n + 1), []);
  return { data, loading, error, reload };
}

/**
 * Fire-and-forget async effect with built-in mount tracking.
 *
 *   useAsyncEffect(async (isActive) => {
 *     const res = await fetchX();
 *     if (!isActive()) return;
 *     setX(res);
 *   }, [dep]);
 *
 * The `isActive` callback returns false once the effect has been torn down
 * (component unmount or dep change), letting consumers short-circuit before
 * calling any state setters.
 */
export function useAsyncEffect(
  fn: (isActive: () => boolean) => Promise<void> | void,
  deps: DependencyList,
): void {
  useEffect(() => {
    let active = true;
    const isActive = () => active;
    void Promise.resolve(fn(isActive));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
