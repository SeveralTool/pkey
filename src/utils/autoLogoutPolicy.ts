/**
 * @fileoverview Wall-clock policy for mobile auto-logout.
 *
 * JS `setTimeout` is paused or delayed while the app is backgrounded, so a
 * 1-minute lock cannot rely on the timer firing. Resume must compare elapsed
 * real time (`Date.now()`) against the moment the app left the foreground.
 *
 * `INSTANT` also records a leave on `inactive` (iOS Home/switcher often never
 * emits `background`) and locks on resume after a short overlay grace so Face
 * ID / Control Center flickers do not lock, while a real leave still does.
 */

/** Duration for the `1M` auto-logout setting (also the INSTANT share-sheet cap). */
export const AUTO_LOGOUT_1M_MS = 60_000;

/**
 * Ignore sub-second `inactive` ↔ `active` blips (RN transitions, Control Center
 * flick). Real Home / app-switch is longer; Face ID and share sheets must use
 * an external-UI session or `suppressAutoLogout` instead of relying on this
 * grace alone.
 */
export const INSTANT_RESUME_GRACE_MS = 400;

/** Inputs for deciding whether returning to the foreground must lock the vault. */
export interface ForegroundResumeLockInput {
  readonly backgroundedAt: number | null;
  readonly now: number;
  readonly timeoutMs: number;
}

/**
 * Wall-clock threshold used when the app returns to `active`.
 *
 * @param autoLogout - `INSTANT` uses {@link INSTANT_RESUME_GRACE_MS}; `1M` uses
 *   {@link AUTO_LOGOUT_1M_MS}
 */
export function foregroundResumeTimeoutMs(autoLogout: 'INSTANT' | '1M'): number {
  return autoLogout === 'INSTANT' ? INSTANT_RESUME_GRACE_MS : AUTO_LOGOUT_1M_MS;
}

/**
 * Returns true when the vault must lock on foreground resume.
 *
 * @param backgroundedAt - `Date.now()` when leave tracking started
 * @param now - Current wall-clock time
 * @param timeoutMs - Lock threshold ({@link INSTANT_RESUME_GRACE_MS} or
 *   {@link AUTO_LOGOUT_1M_MS}). Non-positive values never lock.
 */
export function shouldLockOnForegroundResume({
  backgroundedAt,
  now,
  timeoutMs,
}: ForegroundResumeLockInput): boolean {
  if (backgroundedAt == null || timeoutMs <= 0) return false;
  return now - backgroundedAt >= timeoutMs;
}
