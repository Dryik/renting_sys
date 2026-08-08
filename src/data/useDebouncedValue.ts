import { useEffect, useState } from "react";

/**
 * Delays a value so a query key does not change on every keystroke.
 *
 * The pages that search kept their own timers before; this is the same wait,
 * in one place, applied to the value rather than to the request. A query keyed
 * on the debounced value simply does not exist until typing settles, so the
 * behaviour the user sees — one search after a short pause — is unchanged.
 *
 * Each caller passes its own delay so the existing 150 ms and 180 ms waits stay
 * exactly as they were.
 *
 * The value is compared by identity, so a caller passing several fields must
 * memoise the object it builds. An inline object literal gets a new identity on
 * every render, which restarts the timer, which sets state, which renders
 * again — a loop that never settles. A source guard rejects that shape, and
 * the callers here use `useMemo` over their primitive fields.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delayMs);

    return () => window.clearTimeout(timeout);
  }, [value, delayMs]);

  return debounced;
}
