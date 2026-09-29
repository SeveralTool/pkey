/**
 * @fileoverview Background auto-lock: INSTANT on background + resume, 1M via wall-clock.
 */
import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { AppSettings } from '../types';
import {
  isAutoLogoutSuppressed,
  isExternalUiSession,
  setBackgroundLockHandler,
} from '../utils/autoLogoutGuard';
import { isAndroidWebAccessKeepAlive } from '../utils/webAccessLock';
import {
  AUTO_LOGOUT_1M_MS,
  foregroundResumeTimeoutMs,
  shouldLockOnForegroundResume,
} from '../utils/autoLogoutPolicy';

/** Parameters for {@link useBackgroundAutoLogout}. */
export interface UseBackgroundAutoLogoutParams {
  readonly isLogged: boolean;
  readonly autoLogout: AppSettings['autoLogout'] | undefined;
  readonly onLogout: () => void;
}

/**
 * Locks the vault when the app leaves the foreground according to `autoLogout`.
 *
 * `INSTANT` locks as soon as AppState is `background`. It also stamps `inactive`
 * (iOS Home / switcher often never emit `background`) and locks on resume after
 * a short grace. Share sheets, pickers, QR, and OS biometrics wrap an external
 * UI session or suppress window so those overlays do not lock. `1M` records a
 * wall-clock timestamp on `background` only; resume compares elapsed real time
 * because JS timers freeze in the background. Android web-access keep-alive
 * skips this background lock so locking the phone does not tear down `:7392`.
 *
 * @param params.isLogged - Whether the vault is currently unlocked
 * @param params.autoLogout - User setting; `NEVER` installs no listener
 * @param params.onLogout - Session teardown (flush + clear keys)
 */
export function useBackgroundAutoLogout({
  isLogged,
  autoLogout,
  onLogout,
}: UseBackgroundAutoLogoutParams): void {
  const logoutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundedAtRef = useRef<number | null>(null);
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  useEffect(() => {
    if (!isLogged || autoLogout == null || autoLogout === 'NEVER') return;
    const setting = autoLogout;

    const clearLogoutTimer = (): void => {
      if (logoutTimerRef.current) {
        clearTimeout(logoutTimerRef.current);
        logoutTimerRef.current = null;
      }
    };

    const clearLeaveTracking = (): void => {
      backgroundedAtRef.current = null;
      clearLogoutTimer();
    };

    const applyLockIfBackground = (): void => {
      if (AppState.currentState === 'active') return;
      // Android + web access: phone lock / Home must keep the FG LAN server.
      if (isAndroidWebAccessKeepAlive()) return;
      if (setting === 'INSTANT') {
        // Already locking now — do not also lock again on the queued `active`.
        backgroundedAtRef.current = null;
        onLogoutRef.current();
        return;
      }
      if (setting === '1M') {
        clearLogoutTimer();
        backgroundedAtRef.current = Date.now();
        logoutTimerRef.current = setTimeout(() => {
          if (isAndroidWebAccessKeepAlive()) return;
          if (AppState.currentState !== 'active') onLogoutRef.current();
        }, AUTO_LOGOUT_1M_MS);
      }
    };

    setBackgroundLockHandler(applyLockIfBackground);

    const handleAppStateChange = (next: AppStateStatus): void => {
      if (next === 'active') {
        const skipResumeLock =
          isAutoLogoutSuppressed() || isExternalUiSession() || isAndroidWebAccessKeepAlive();
        const shouldLock =
          !skipResumeLock &&
          shouldLockOnForegroundResume({
            backgroundedAt: backgroundedAtRef.current,
            now: Date.now(),
            timeoutMs: foregroundResumeTimeoutMs(setting),
          });
        clearLeaveTracking();
        if (shouldLock) onLogoutRef.current();
        return;
      }

      if (isAutoLogoutSuppressed()) return;
      if (isAndroidWebAccessKeepAlive()) return;

      // System sheets, Face ID, Control Center: do not lock here. INSTANT only
      // stamps the leave so a Home/switch that never hits `background` still
      // locks on resume after INSTANT_RESUME_GRACE_MS.
      if (next === 'inactive') {
        if (isExternalUiSession()) return;
        if (setting === 'INSTANT' && backgroundedAtRef.current == null) {
          backgroundedAtRef.current = Date.now();
        }
        return;
      }

      if (next !== 'background') return;

      if (isExternalUiSession()) {
        // Share sheet / OS prompt looks like background. Don't INSTANT-lock
        // under the sheet. 1M still tracks wall-clock; INSTANT gets a 1-minute
        // cap if the sheet never settles (user Homed away).
        if (setting === '1M') {
          applyLockIfBackground();
        } else if (setting === 'INSTANT' && !logoutTimerRef.current) {
          backgroundedAtRef.current = Date.now();
          logoutTimerRef.current = setTimeout(() => {
            if (isAndroidWebAccessKeepAlive()) return;
            if (AppState.currentState !== 'active') onLogoutRef.current();
          }, AUTO_LOGOUT_1M_MS);
        }
        return;
      }

      applyLockIfBackground();
    };

    const sub = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      setBackgroundLockHandler(null);
      sub.remove();
      clearLeaveTracking();
    };
  }, [isLogged, autoLogout]);
}
