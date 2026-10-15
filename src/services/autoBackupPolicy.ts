/**
 * @fileoverview Pure policy for encrypted auto-backups (no I/O).
 */

/** How often an automatic snapshot may run after the vault ciphertext changes. */
export type AutoBackupInterval = '1M' | '24H' | '7D';

export const AUTO_BACKUP_INTERVAL_VALUES = ['1M', '24H', '7D'] as const;

export const AUTO_BACKUP_DEFAULT_INTERVAL: AutoBackupInterval = '24H';

export const AUTO_BACKUP_INTERVAL_MS: Record<AutoBackupInterval, number> = {
  '1M': 60 * 1000,
  '24H': 24 * 60 * 60 * 1000,
  '7D': 7 * 24 * 60 * 60 * 1000,
};

/** Default gap (24 h) and throttle for failure notifications. */
export const AUTO_BACKUP_MIN_INTERVAL_MS = AUTO_BACKUP_INTERVAL_MS['24H'];

export function isAutoBackupInterval(value: unknown): value is AutoBackupInterval {
  return value === '1M' || value === '24H' || value === '7D';
}

export function autoBackupIntervalMs(interval: AutoBackupInterval): number {
  return AUTO_BACKUP_INTERVAL_MS[interval];
}

/**
 * True when Android must hold a foreground service so the 1-minute timer
 * is not frozen after PKEY leaves the screen. 24 h and 7 d use the OS scheduler.
 */
export function wantsOneMinuteProcessKeepAlive(
  enabled: boolean,
  interval: AutoBackupInterval
): boolean {
  return enabled && interval === '1M';
}

/**
 * Android WorkManager and iOS BGTaskScheduler refuse periodic wakes shorter than this.
 * `expo-background-task` documents the same floor.
 */
export const OS_BACKGROUND_TASK_MIN_MINUTES = 15;

/** Minutes passed to `BackgroundTask.registerTaskAsync` for a user-chosen cadence. */
export function nativeBackgroundIntervalMinutes(interval: AutoBackupInterval): number {
  const minutes = autoBackupIntervalMs(interval) / 60_000;
  const rounded = Number.isFinite(minutes) ? Math.ceil(minutes) : OS_BACKGROUND_TASK_MIN_MINUTES;
  return Math.max(OS_BACKGROUND_TASK_MIN_MINUTES, rounded);
}

/** Vault file fingerprint used to skip a read when nothing changed. */
export interface AutoBackupFingerprint {
  readonly size: number;
  readonly mtime: number;
}

export type AutoBackupSkipReason = 'disabled' | 'unchanged' | 'interval' | 'no-vault';

export type AutoBackupDecision =
  { action: 'skip'; reason: AutoBackupSkipReason } | { action: 'snapshot' };

export interface DecideAutoBackupInput {
  readonly enabled: boolean;
  readonly hasVault: boolean;
  readonly now: number;
  /** Null when no automatic snapshot has been recorded on this device. */
  readonly lastSnapshotAt: number | null;
  readonly storedFingerprint: AutoBackupFingerprint | null;
  /** Null when the caller has not statted the vault yet. */
  readonly currentFingerprint: AutoBackupFingerprint | null;
  readonly minIntervalMs: number;
  /** True only when the user just turned the switch on. */
  readonly force: boolean;
}

function fingerprintsEqual(
  a: AutoBackupFingerprint | null,
  b: AutoBackupFingerprint | null
): boolean {
  if (!a || !b) return false;
  return a.size === b.size && a.mtime === b.mtime;
}

function isUsableTimestamp(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

/**
 * Decides whether to copy the encrypted vault into Exports.
 * Once the chosen interval has elapsed, a new copy is due even if the vault file is unchanged.
 */
export function decideAutoBackup(input: Readonly<DecideAutoBackupInput>): AutoBackupDecision {
  if (!input.enabled) return { action: 'skip', reason: 'disabled' };
  if (!input.hasVault) return { action: 'skip', reason: 'no-vault' };
  if (input.force || input.lastSnapshotAt === null) return { action: 'snapshot' };
  const intervalMs =
    Number.isFinite(input.minIntervalMs) && input.minIntervalMs >= 0
      ? input.minIntervalMs
      : AUTO_BACKUP_MIN_INTERVAL_MS;
  if (!isUsableTimestamp(input.now) || !isUsableTimestamp(input.lastSnapshotAt)) {
    return { action: 'skip', reason: 'interval' };
  }
  if (input.now - input.lastSnapshotAt < intervalMs) {
    if (fingerprintsEqual(input.storedFingerprint, input.currentFingerprint)) {
      return { action: 'skip', reason: 'unchanged' };
    }
    return { action: 'skip', reason: 'interval' };
  }
  return { action: 'snapshot' };
}
