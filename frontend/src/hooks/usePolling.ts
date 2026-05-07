import { useEffect, useRef } from 'react';

/**
 * Generic polling hook. Calls `callback` every `interval` ms while `enabled` is true.
 * Cleans up on unmount or when enabled becomes false.
 */
export function usePolling(
  callback: () => void | Promise<void>,
  interval: number,
  enabled: boolean,
): void {
  const savedCallback = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  useEffect(() => {
    if (!enabled) return;

    let running = true;

    const tick = async () => {
      if (!running) return;
      await savedCallback.current();
      if (running) {
        timeoutId = setTimeout(tick, interval);
      }
    };

    let timeoutId: ReturnType<typeof setTimeout> = setTimeout(tick, 0);

    return () => {
      running = false;
      clearTimeout(timeoutId);
    };
  }, [interval, enabled]);
}
