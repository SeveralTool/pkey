/**
 * @fileoverview Debounces rapidly changing values (e.g. search input).
 */
import { useEffect, useState } from 'react';

/**
 * Returns a debounced copy of `value` updated `delay` ms after the last change.
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}
