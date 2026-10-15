/**
 * @fileoverview Device-local automatic backup switch and last-snapshot metadata.
 *
 * Lives in AsyncStorage, not vault `settings`: enabling it does not rewrite the
 * ciphertext, does not sync over LAN, and restoring a `.pkey` on another phone
 * does not turn auto-backup on there.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AUTO_BACKUP_DEFAULT_INTERVAL,
  isAutoBackupInterval,
  type AutoBackupInterval,
} from './autoBackupPolicy';

const KEY = 'pkey_auto_backup_v1';

/** Accepted automatic export filename (no path separators). */
const AUTO_FILENAME_RE = /^pkey-auto-\d{8}-\d{6}(?:-\d+)?\.pkey$/i;

const FAILURE_CODES = new Set(['no_space', 'write_failed', 'no_database']);

export type AutoBackupFailureCode = 'no_space' | 'write_failed' | 'no_database';

export interface AutoBackupPrefs {
  enabled: boolean;
  interval: AutoBackupInterval;
  lastSnapshotAt: number | null;
  lastSnapshotHash: string | null;
  fingerprintSize: number | null;
  fingerprintMtime: number | null;
  lastFilename: string | null;
  lastFailureCode: AutoBackupFailureCode | null;
  lastFailureNotifiedAt: number | null;
}

export const DEFAULT_AUTO_BACKUP_PREFS: AutoBackupPrefs = {
  enabled: false,
  interval: AUTO_BACKUP_DEFAULT_INTERVAL,
  lastSnapshotAt: null,
  lastSnapshotHash: null,
  fingerprintSize: null,
  fingerprintMtime: null,
  lastFilename: null,
  lastFailureCode: null,
  lastFailureNotifiedAt: null,
};

let cache: AutoBackupPrefs | null = null;

function parseStoredInterval(value: unknown): AutoBackupInterval | undefined {
  if (value == null) return AUTO_BACKUP_DEFAULT_INTERVAL;
  if (isAutoBackupInterval(value)) return value;
  return undefined;
}

function isSafeAutoFilename(value: string): boolean {
  return AUTO_FILENAME_RE.test(value) && !value.includes('/') && !value.includes('\\');
}

function optionalFinite(value: unknown): number | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

function optionalString(value: unknown): string | null | undefined {
  if (value == null) return null;
  if (typeof value !== 'string') return undefined;
  return value;
}

function parsePrefs(raw: unknown): AutoBackupPrefs | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  if (rec.enabled !== true && rec.enabled !== false) return null;
  const interval = parseStoredInterval(rec.interval);
  if (interval === undefined) return null;

  const lastSnapshotAt = optionalFinite(rec.lastSnapshotAt);
  const fingerprintSize = optionalFinite(rec.fingerprintSize);
  const fingerprintMtime = optionalFinite(rec.fingerprintMtime);
  const lastFailureNotifiedAt = optionalFinite(rec.lastFailureNotifiedAt);
  const lastSnapshotHash = optionalString(rec.lastSnapshotHash);
  const lastFilename = optionalString(rec.lastFilename);
  if (
    lastSnapshotAt === undefined ||
    fingerprintSize === undefined ||
    fingerprintMtime === undefined ||
    lastFailureNotifiedAt === undefined ||
    lastSnapshotHash === undefined ||
    lastFilename === undefined
  ) {
    return null;
  }
  if (lastFilename !== null && !isSafeAutoFilename(lastFilename)) return null;
  if (
    lastSnapshotHash !== null &&
    (lastSnapshotHash.length === 0 || lastSnapshotHash.includes('..'))
  ) {
    return null;
  }

  let lastFailureCode: AutoBackupFailureCode | null = null;
  if (rec.lastFailureCode != null) {
    if (typeof rec.lastFailureCode !== 'string' || !FAILURE_CODES.has(rec.lastFailureCode)) {
      return null;
    }
    lastFailureCode = rec.lastFailureCode as AutoBackupFailureCode;
  }

  return {
    enabled: rec.enabled,
    interval,
    lastSnapshotAt,
    lastSnapshotHash,
    fingerprintSize,
    fingerprintMtime,
    lastFilename,
    lastFailureCode,
    lastFailureNotifiedAt,
  };
}

/** Last remembered prefs, or the opt-in-off default when nothing is cached. */
export function getCachedAutoBackupPrefs(): AutoBackupPrefs {
  return cache ?? DEFAULT_AUTO_BACKUP_PREFS;
}

async function persist(next: AutoBackupPrefs): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.warn('[autoBackupPrefs] persist failed', e);
  }
}

/** Reads persisted prefs into the sync cache (cold start). Does not clobber a later in-memory set. */
export async function loadAutoBackupPrefs(): Promise<AutoBackupPrefs> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const parsed = parsePrefs(JSON.parse(raw) as unknown);
      if (parsed) {
        cache = parsed;
        return parsed;
      }
    }
  } catch {
    // ignore corrupt / missing storage
  }
  cache = { ...DEFAULT_AUTO_BACKUP_PREFS };
  return cache;
}

/** Turns the device-local switch without clearing snapshot metadata or files. */
export async function setAutoBackupEnabled(enabled: boolean): Promise<AutoBackupPrefs> {
  const current = await loadAutoBackupPrefs();
  const next = { ...current, enabled };
  await persist(next);
  return next;
}

/** Sets the snapshot cadence without clearing files or forcing an immediate copy. */
export async function setAutoBackupInterval(
  interval: AutoBackupInterval
): Promise<AutoBackupPrefs> {
  const current = await loadAutoBackupPrefs();
  const next = { ...current, interval };
  await persist(next);
  return next;
}

export async function recordAutoBackupSuccess(input: {
  readonly now: number;
  readonly hash: string;
  readonly size: number;
  readonly mtime: number;
  readonly filename: string;
}): Promise<void> {
  const current = await loadAutoBackupPrefs();
  await persist({
    ...current,
    lastSnapshotAt: input.now,
    lastSnapshotHash: input.hash,
    fingerprintSize: input.size,
    fingerprintMtime: input.mtime,
    lastFilename: isSafeAutoFilename(input.filename) ? input.filename : current.lastFilename,
    lastFailureCode: null,
    lastFailureNotifiedAt: null,
  });
}

/** Records a fingerprint-only touch (mtime changed, ciphertext hash did not). */
export async function recordAutoBackupFingerprint(input: {
  readonly size: number;
  readonly mtime: number;
}): Promise<void> {
  const current = await loadAutoBackupPrefs();
  await persist({
    ...current,
    fingerprintSize: input.size,
    fingerprintMtime: input.mtime,
  });
}

export async function recordAutoBackupFailure(input: {
  readonly code: AutoBackupFailureCode;
  readonly notified: boolean;
  readonly now: number;
}): Promise<void> {
  const current = await loadAutoBackupPrefs();
  await persist({
    ...current,
    lastFailureCode: input.code,
    lastFailureNotifiedAt: input.notified ? input.now : current.lastFailureNotifiedAt,
  });
}

/** Drops the in-memory cache without touching storage (tests). */
export function resetAutoBackupPrefsCache(): void {
  cache = null;
}

/**
 * Clears the switch and snapshot metadata after a local vault wipe.
 * Does not delete files in Exports.
 */
export async function clearAutoBackupRuntime(): Promise<void> {
  cache = { ...DEFAULT_AUTO_BACKUP_PREFS };
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
