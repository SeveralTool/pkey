/**
 * @fileoverview Ephemeral in-memory holder for the master password input.
 *
 * Rationale (audit finding A8):
 *  - Previously the raw master password lived inside the shared
 *    `CoreStateContext` React tree, which meant every consumer of `useCoreState`
 *    (Sync, Database, UI, error boundaries) implicitly had access to it. A
 *    forgotten `error.message` interpolation or a devtools inspection could
 *    surface it.
 *  - This module keeps the value out of React state entirely. Only components
 *    that explicitly opt-in via {@link useMasterPasswordInput} (currently just
 *    the login form) can read/write it, and its lifetime is bounded to that
 *    input field.
 *
 * The value is intentionally NOT persisted anywhere and is cleared on:
 *   - Successful login (the derived rootKey is what the app actually uses).
 *   - Cancel / navigate away from the login form.
 *   - Logout / auto-logout.
 *
 * Consumers OUTSIDE the login form (Database write path, Sync) must rely on
 * the derived session root key (`sessionKey.ts`), not this holder.
 */
import { useCallback, useEffect, useSyncExternalStore } from 'react';

let value: string = '';
const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((sub) => {
    try {
      sub();
    } catch {
      /* ignore subscriber errors */
    }
  });
}

/** Reads the current master password held in memory. */
export function getMasterPassword(): string {
  return value;
}

/** Overwrites the master password value. Empty string clears it. */
export function setMasterPassword(next: string): void {
  const normalized = typeof next === 'string' ? next : '';
  if (normalized === value) return;
  value = normalized;
  notify();
}

/**
 * Wipes the master password from memory. Called on logout, cancel, and after
 * a successful derivation to the session root key.
 */
export function clearMasterPassword(): void {
  if (value === '') return;
  value = '';
  notify();
}

/** Subscribe to changes. Returns an unsubscribe function. */
export function subscribeMasterPassword(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

/**
 * React hook for the login form. Behaves like `useState<string>` but backed
 * by the module-level vault (so the value is not part of any global context).
 *
 * The hook auto-clears on unmount if the caller passes `{ clearOnUnmount: true }`.
 */
export function useMasterPasswordInput(options: { clearOnUnmount?: boolean } = {}): [
  string,
  (next: string) => void,
] {
  const snapshot = useSyncExternalStore(
    subscribeMasterPassword,
    getMasterPassword,
    getMasterPassword
  );
  const setter = useCallback((next: string) => setMasterPassword(next), []);

  useEffect(() => {
    return () => {
      if (options.clearOnUnmount) clearMasterPassword();
    };
  }, [options.clearOnUnmount]);

  return [snapshot, setter];
}
