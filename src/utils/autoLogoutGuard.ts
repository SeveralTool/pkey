/**
 * @fileoverview Guards that delay auto-logout around system UI (share sheet, pickers, QR, OS auth).
 *
 * A wall-clock suppress (QR / document picker) ignores background entirely.
 * An external-UI session does not: INSTANT is deferred until the sheet/prompt
 * closes, and `1M` still counts via wall-clock elapsed time (JS timers freeze
 * in background). Face ID / fingerprint must use {@link withExternalUiSession}
 * so `inactive` from the OS dialog does not INSTANT-lock on resume.
 */
import { AppState, type AppStateStatus } from 'react-native';

let suppressUntil = 0;
let externalUiDepth = 0;
let backgroundLockHandler: (() => void) | null = null;

/**
 * Grace window granted to QR scanner overlays / OTP setup flows before the
 * app auto-logs-out for inactivity. Trimmed from 120 s → 60 s after the audit
 * (finding M3): 2 minutes with the vault unlocked while the user wandered off
 * to fetch their 2FA device was too generous.
 */
export const QR_SCANNER_GRACE_MS = 60_000;

/** Wait for AppState to settle after a share sheet / picker dismisses. */
export const EXTERNAL_UI_SETTLE_MS = 400;

/**
 * Ignores background AppState transitions until `ms` of wall-clock time elapse.
 *
 * @param ms - Suppress window; default 120s for document pickers / long system UI
 */
export function suppressAutoLogout(ms = 120_000): void {
  suppressUntil = Date.now() + ms;
}

/** True while a {@link suppressAutoLogout} window is still open. */
export function isAutoLogoutSuppressed(): boolean {
  return Date.now() < suppressUntil;
}

/** Registers the lock callback used when an external UI session ends in the background. */
export function setBackgroundLockHandler(handler: (() => void) | null): void {
  backgroundLockHandler = handler;
}

/**
 * Runs the registered background auto-lock if the app is not in the foreground.
 * Used when Android web-access keep-alive turns off while still backgrounded.
 */
export function requestBackgroundLockIfNeeded(getState?: () => AppStateStatus): void {
  if (readAppState(getState) === 'active') return;
  backgroundLockHandler?.();
}

/** Marks a share sheet / picker / OS auth prompt as open so INSTANT lock waits for dismiss. */
export function beginExternalUiSession(): void {
  externalUiDepth += 1;
}

/** True while at least one {@link beginExternalUiSession} has not been ended. */
export function isExternalUiSession(): boolean {
  return externalUiDepth > 0;
}

function readAppState(getState?: () => AppStateStatus): AppStateStatus {
  return getState ? getState() : AppState.currentState;
}

/**
 * Runs `fn` with {@link beginExternalUiSession} so INSTANT does not treat the OS
 * overlay as “left the app”. Home during the prompt still locks after settle.
 */
export async function withExternalUiSession<T>(fn: () => Promise<T>): Promise<T> {
  beginExternalUiSession();
  try {
    return await fn();
  } finally {
    await endExternalUiSession();
  }
}

/**
 * Ends a share/picker/OS-auth session. If the app is already `active`, returns
 * immediately (biometric dialog finished in-place). Otherwise waits
 * {@link EXTERNAL_UI_SETTLE_MS} for AppState to settle; if still not active the
 * user left (home / recents) and auto-logout should run.
 */
export async function endExternalUiSession(getState?: () => AppStateStatus): Promise<void> {
  if (externalUiDepth <= 0) return;
  if (readAppState(getState) !== 'active') {
    await new Promise<void>((resolve) => {
      setTimeout(resolve, EXTERNAL_UI_SETTLE_MS);
    });
  }
  externalUiDepth = Math.max(0, externalUiDepth - 1);
  if (externalUiDepth > 0) return;
  if (readAppState(getState) === 'active') return;
  backgroundLockHandler?.();
}
