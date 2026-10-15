/**
 * @fileoverview Copies the encrypted vault into Exports on an opt-in schedule.
 *
 * Does not decrypt. The share sheet is never opened here — that happens from
 * the notification action once the app is in the foreground.
 */
import * as FileSystem from 'expo-file-system/legacy';
import { Base64, Utf8 } from 'crypto-es';
import { isEnvelopeV4, sha256 } from '@pkey/core';
import { DATABASE_FILENAME } from '../constants/config';
import { getLocale } from '../constants/localization';
import { sendOsNotification } from '../notifications/osNotificationService';
import { getCachedPublicUiPrefs } from '../utils/publicUiPrefs';
import {
  AUTO_BACKUP_MIN_INTERVAL_MS,
  autoBackupIntervalMs,
  decideAutoBackup,
  type AutoBackupFingerprint,
} from './autoBackupPolicy';
import {
  loadAutoBackupPrefs,
  recordAutoBackupFailure,
  recordAutoBackupSuccess,
  type AutoBackupFailureCode,
} from './autoBackupPrefs';
import { deleteExportFile, ExportError, writeAutoBackupFile } from './exportsStorage';

export const AUTO_BACKUP_READY_NOTIFICATION_ID = 'pkey-auto-backup';
export const AUTO_BACKUP_FAILED_NOTIFICATION_ID = 'pkey-auto-backup-failed';

export type AutoBackupReason = 'enable' | 'background' | 'foreground' | 'interval';
export type AutoBackupRunResult = 'written' | 'skipped' | 'failed';

let inflight: Promise<AutoBackupRunResult> | null = null;
let runGeneration = 0;
let suspended = false;
const writeListeners = new Set<() => void>();

/**
 * Drops the current automatic-backup run and ignores new ones until
 * {@link resumeAutoBackup}. A copy already in `writeAutoBackupFile` is deleted
 * and is not announced. Resolves when the in-flight run has stopped.
 */
export function suspendAutoBackup(): Promise<void> {
  suspended = true;
  runGeneration += 1;
  const pending = inflight;
  return pending
    ? pending.then(
        () => undefined,
        () => undefined
      )
    : Promise.resolve();
}

/** Allows {@link runAutoBackup} again after a vault wipe finishes. */
export function resumeAutoBackup(): void {
  suspended = false;
}

/** Fires after a new automatic `.pkey` is stored. */
export function subscribeAutoBackupWrites(listener: () => void): () => void {
  writeListeners.add(listener);
  return () => {
    writeListeners.delete(listener);
  };
}

function emitAutoBackupWrite(): void {
  writeListeners.forEach((listener) => listener());
}

function locale() {
  return getLocale(getCachedPublicUiPrefs().language);
}

function vaultUri(): string {
  return `${FileSystem.documentDirectory ?? ''}${DATABASE_FILENAME}`;
}

/**
 * True when `text` is a complete vault file: a v4 envelope or a legacy JSON
 * envelope with a non-empty `ciphertext`. A read that overlapped a vault write
 * (the on-disk write is not atomic) yields truncated JSON and fails here.
 * Text that does not start with `{` is rejected: every on-disk envelope is JSON,
 * and a non-JSON blob must not count as a good snapshot (it would rotate the
 * previous automatic copies).
 */
export function isCompleteVaultFileText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (!trimmed.startsWith('{')) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (isEnvelopeV4(parsed)) return true;
    if (!parsed || typeof parsed !== 'object') return false;
    const ciphertext = (parsed as { ciphertext?: unknown }).ciphertext;
    return typeof ciphertext === 'string' && ciphertext.length > 0;
  } catch {
    return false;
  }
}

/**
 * Validates the exact base64 that will be stored as the `.pkey` copy.
 * Decoding here (instead of re-reading the file) checks the bytes being
 * written, not whatever the vault looks like a moment later.
 */
export function isCompleteVaultFileBase64(encoded: string): boolean {
  if (!encoded) return false;
  try {
    return isCompleteVaultFileText(Utf8.stringify(Base64.parse(encoded)));
  } catch {
    return false;
  }
}

function fingerprintFromInfo(info: {
  size?: number;
  modificationTime?: number;
}): AutoBackupFingerprint {
  return {
    size: typeof info.size === 'number' && Number.isFinite(info.size) ? info.size : 0,
    mtime:
      typeof info.modificationTime === 'number' && Number.isFinite(info.modificationTime)
        ? info.modificationTime
        : 0,
  };
}

async function notifyReady(filename: string): Promise<void> {
  const t = locale();
  await sendOsNotification({
    id: AUTO_BACKUP_READY_NOTIFICATION_ID,
    title: t.auto_backup_ready_title,
    body: t.auto_backup_ready_body.replace('{name}', filename),
    channel: 'pkey-backups',
    data: { type: 'auto-backup-ready', filename },
  });
}

async function notifyFailure(code: AutoBackupFailureCode): Promise<void> {
  const t = locale();
  const body = code === 'no_space' ? t.auto_backup_failed_no_space : t.auto_backup_failed_write;
  await sendOsNotification({
    id: AUTO_BACKUP_FAILED_NOTIFICATION_ID,
    title: t.auto_backup_failed_title,
    body,
    channel: 'pkey-backups',
    data: { type: 'auto-backup-failed' },
  });
}

function failureCodeFrom(err: unknown): AutoBackupFailureCode {
  if (err instanceof ExportError && (err.code === 'no_space' || err.code === 'no_database')) {
    return err.code;
  }
  return 'write_failed';
}

async function maybeNotifyFailure(code: AutoBackupFailureCode, now: number): Promise<boolean> {
  const prefs = await loadAutoBackupPrefs();
  const sameCode = prefs.lastFailureCode === code;
  const lastAt = prefs.lastFailureNotifiedAt;
  if (
    sameCode &&
    lastAt !== null &&
    Number.isFinite(lastAt) &&
    now - lastAt < AUTO_BACKUP_MIN_INTERVAL_MS
  ) {
    await recordAutoBackupFailure({ code, notified: false, now });
    return false;
  }
  await notifyFailure(code);
  await recordAutoBackupFailure({ code, notified: true, now });
  return true;
}

async function runAutoBackupUnlocked(reason: AutoBackupReason): Promise<AutoBackupRunResult> {
  const generation = runGeneration;
  const aborted = (): boolean => suspended || generation !== runGeneration;
  if (aborted()) return 'skipped';

  const prefs = await loadAutoBackupPrefs();
  if (aborted()) return 'skipped';
  if (reason !== 'enable' && !prefs.enabled) return 'skipped';

  const now = Date.now();
  const intervalMs = autoBackupIntervalMs(prefs.interval);
  if (
    reason !== 'enable' &&
    prefs.lastSnapshotAt !== null &&
    Number.isFinite(prefs.lastSnapshotAt) &&
    now - prefs.lastSnapshotAt < intervalMs
  ) {
    return 'skipped';
  }

  const info = await FileSystem.getInfoAsync(vaultUri());
  const hasVault = Boolean(info.exists && !info.isDirectory);
  const currentFingerprint = info.exists && !info.isDirectory ? fingerprintFromInfo(info) : null;
  const storedFingerprint =
    prefs.fingerprintSize !== null && prefs.fingerprintMtime !== null
      ? { size: prefs.fingerprintSize, mtime: prefs.fingerprintMtime }
      : null;

  const decision = decideAutoBackup({
    enabled: reason === 'enable' ? true : prefs.enabled,
    hasVault,
    now,
    lastSnapshotAt: prefs.lastSnapshotAt,
    storedFingerprint,
    currentFingerprint,
    minIntervalMs: intervalMs,
    force: reason === 'enable',
  });

  if (decision.action === 'skip') return 'skipped';
  if (!hasVault || currentFingerprint === null) return 'skipped';
  if (aborted()) return 'skipped';

  let encoded: string;
  try {
    encoded = await FileSystem.readAsStringAsync(vaultUri(), {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    if (aborted()) return 'skipped';
    await maybeNotifyFailure('write_failed', Date.now());
    return 'failed';
  }

  if (aborted()) return 'skipped';

  if (!isCompleteVaultFileBase64(encoded)) {
    // Most likely a read that overlapped a vault write. Do not store a
    // truncated copy and do not alarm the user; the next tick retries.
    console.warn('[PKEY] automatic backup skipped: vault file read was incomplete');
    return 'skipped';
  }

  const hash = sha256(encoded);
  if (aborted()) return 'skipped';

  try {
    const written = await writeAutoBackupFile(encoded);
    if (aborted()) {
      await deleteExportFile(written.uri).catch(() => undefined);
      return 'skipped';
    }
    await recordAutoBackupSuccess({
      now: Date.now(),
      hash,
      size: currentFingerprint.size,
      mtime: currentFingerprint.mtime,
      filename: written.filename,
    });
    if (aborted()) {
      await deleteExportFile(written.uri).catch(() => undefined);
      return 'skipped';
    }
    emitAutoBackupWrite();
    await notifyReady(written.filename);
    return 'written';
  } catch (err) {
    if (aborted()) return 'skipped';
    await maybeNotifyFailure(failureCodeFrom(err), Date.now());
    return 'failed';
  }
}

/**
 * Creates an automatic `.pkey` when the chosen interval has elapsed.
 * Concurrent callers share one in-flight run.
 */
export function runAutoBackup(reason: AutoBackupReason): Promise<AutoBackupRunResult> {
  if (suspended) return Promise.resolve('skipped');
  if (inflight) return inflight;
  inflight = runAutoBackupUnlocked(reason).finally(() => {
    inflight = null;
  });
  return inflight;
}

/** Test-only: drop a stuck in-flight promise and clear a suspend. */
export function resetAutoBackupRunForTests(): void {
  inflight = null;
  runGeneration = 0;
  suspended = false;
}
