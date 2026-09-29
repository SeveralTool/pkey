/**
 * @fileoverview Foreground idle lock while the vault stays on screen (audit M5).
 */
import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import type { ForegroundIdleLock } from '@pkey/core';

const IDLE_MS: Record<Exclude<ForegroundIdleLock, 'NEVER'>, number> = {
  '1M': 60_000,
  '5M': 5 * 60_000,
  '15M': 15 * 60_000,
};

const activityListeners = new Set<() => void>();

/** Call from the logged-in UI tree on user interaction. */
export function noteForegroundActivity(): void {
  activityListeners.forEach((fn) => fn());
}

/** Milliseconds for a foreground idle setting, or 0 when disabled. */
export function foregroundIdleLockMs(setting: ForegroundIdleLock | undefined): number {
  if (!setting || setting === 'NEVER') return 0;
  return IDLE_MS[setting];
}

export interface UseForegroundIdleLockParams {
  readonly isLogged: boolean;
  readonly foregroundIdleLock: ForegroundIdleLock | undefined;
  readonly onLogout: () => void;
}

/**
 * Locks the vault after `foregroundIdleLock` of no user interaction while
 * the app is in the foreground. Background lock remains `useBackgroundAutoLogout`.
 */
export function useForegroundIdleLock({
  isLogged,
  foregroundIdleLock,
  onLogout,
}: UseForegroundIdleLockParams): void {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTouchRef = useRef<number>(Date.now());
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  useEffect(() => {
    const timeoutMs = foregroundIdleLockMs(foregroundIdleLock);
    if (!isLogged || timeoutMs <= 0) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    const arm = (): void => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (AppState.currentState === 'active') onLogoutRef.current();
      }, timeoutMs);
    };

    const onTouch = (): void => {
      lastTouchRef.current = Date.now();
      arm();
    };

    activityListeners.add(onTouch);
    arm();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        const elapsed = Date.now() - lastTouchRef.current;
        if (elapsed >= timeoutMs) onLogoutRef.current();
        else arm();
      }
    });

    return () => {
      activityListeners.delete(onTouch);
      sub.remove();
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isLogged, foregroundIdleLock]);
}
