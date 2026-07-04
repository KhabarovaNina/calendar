import { useCallback, useEffect, useState } from "react";

export interface Resource<T> {
  data: T | undefined;
  loading: boolean;
  error: string | undefined;
  reload: () => void;
}

/**
 * Простейшая загрузка данных из Prism: вызывает `fn` при монтировании
 * и при изменении `deps`, плюс по `reload()`. Без кэша (чистый Prism).
 */
export function useResource<T>(fn: () => Promise<T>, deps: unknown[] = []): Resource<T> {
  const [data, setData] = useState<T>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [tick, setTick] = useState(0);

  // fn пересоздаётся каждый рендер — фиксируем зависимость через deps + tick
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(fn, deps);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);
    run()
      .then((res) => !cancelled && setData(res))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [run, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  return { data, loading, error, reload };
}
