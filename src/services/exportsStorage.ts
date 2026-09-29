/**
 * @fileoverview App-sandbox exports: persistent `.pkey` backups + ephemeral CSV/JSON.
 *
 * Encrypted `.pkey` files live under `{documentDirectory}/exports/` (listed in Security).
 * Unencrypted CSV/JSON are written to `{cacheDirectory}/export-tmp/`, shared, then deleted.
 * Naming: `pkey-{YYYYMMDD}-{HHmmss}.{ext}` (type implied by extension only).
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { beginExternalUiSession, endExternalUiSession } from '../utils/autoLogoutGuard';

export const EXPORTS_DIR_NAME = 'exports';

/** Cache-only folder for plaintext CSV/JSON while the share sheet is open. */
export const EPHEMERAL_EXPORTS_DIR_NAME = 'export-tmp';

/** Extra free space required beyond the payload (bytes). */
export const EXPORT_DISK_HEADROOM_BYTES = 2 * 1024 * 1024;

/** Delayed retry after share, in case the OS still has the ephemeral URI open. */
export const EPHEMERAL_EXPORT_TTL_MS = 45_000;

/** Hard cap on the total number of export files kept on this device (any type). */
export const EXPORT_MAX_FILES = 10;

/** Soft UI warning when free space is below this (bytes). */
export const EXPORT_LOW_SPACE_BYTES = 50 * 1024 * 1024;

export type ExportExt = 'pkey' | 'csv' | 'json';

export type ExportErrorCode =
  'no_space' | 'share_unavailable' | 'no_database' | 'write_failed' | 'limit' | 'unknown';

export class ExportError extends Error {
  readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'ExportError';
    this.code = code;
  }
}

export interface ExportFileInfo {
  filename: string;
  uri: string;
  ext: ExportExt;
  size: number;
  /** Milliseconds since epoch (modification time when available). */
  modifiedAt: number;
}

const EXPORT_NAME_RE = /^pkey-(\d{8})-(\d{6})(?:-(\d+))?\.([a-z]+)$/i;

const pendingEphemeralDeletes = new Map<string, ReturnType<typeof setTimeout>>();

export function getExportsDirUri(): string {
  const base = FileSystem.documentDirectory ?? '';
  return `${base}${EXPORTS_DIR_NAME}/`;
}

export function getEphemeralExportsDirUri(): string {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? '';
  return `${base}${EPHEMERAL_EXPORTS_DIR_NAME}/`;
}

export async function ensureExportsDir(): Promise<string> {
  return ensureDir(getExportsDirUri());
}

export async function ensureEphemeralExportsDir(): Promise<string> {
  return ensureDir(getEphemeralExportsDirUri());
}

async function ensureDir(dir: string): Promise<string> {
  const info = await FileSystem.getInfoAsync(dir);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }
  return dir;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Local device timestamp parts for filenames. */
export function formatExportTimestamp(at: Date = new Date()): { date: string; time: string } {
  const y = at.getFullYear();
  const m = pad2(at.getMonth() + 1);
  const d = pad2(at.getDate());
  const hh = pad2(at.getHours());
  const mm = pad2(at.getMinutes());
  const ss = pad2(at.getSeconds());
  return { date: `${y}${m}${d}`, time: `${hh}${mm}${ss}` };
}

/**
 * Builds `pkey-YYYYMMDD-HHmmss.ext` (collision suffix handled by caller via `uniqueExportFilenameInDir`).
 */
export function buildExportFilename(
  ext: ExportExt,
  at: Date = new Date(),
  suffix?: number
): string {
  const { date, time } = formatExportTimestamp(at);
  const mid = suffix && suffix > 1 ? `${date}-${time}-${suffix}` : `${date}-${time}`;
  return `pkey-${mid}.${ext}`;
}

export function parseExportFilename(filename: string): {
  date: string;
  time: string;
  suffix?: number;
  ext: ExportExt;
} | null {
  const m = EXPORT_NAME_RE.exec(filename);
  if (!m) return null;
  const ext = m[4].toLowerCase();
  if (ext !== 'pkey' && ext !== 'csv' && ext !== 'json') return null;
  return {
    date: m[1],
    time: m[2],
    suffix: m[3] ? Number(m[3]) : undefined,
    ext,
  };
}

async function uniqueExportFilenameInDir(
  dir: string,
  ext: ExportExt,
  at: Date = new Date()
): Promise<string> {
  let suffix = 1;
  for (;;) {
    const name = buildExportFilename(ext, at, suffix === 1 ? undefined : suffix);
    const info = await FileSystem.getInfoAsync(`${dir}${name}`);
    if (!info.exists) return name;
    suffix += 1;
    if (suffix > 99) return buildExportFilename(ext, at, Date.now() % 100000);
  }
}

function mimeForExt(ext: ExportExt): string {
  if (ext === 'csv') return 'text/csv';
  if (ext === 'json') return 'application/json';
  return 'application/octet-stream';
}

function utiForExt(ext: ExportExt): string {
  if (ext === 'csv' || ext === 'json') return 'public.plain-text';
  return 'public.data';
}

/** Human-readable byte size for export UI. */
export function formatExportBytes(n: number): string {
  if (!n || n < 0) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** Free internal disk space in bytes, or null if unavailable. */
export async function getAvailableDiskSpaceBytes(): Promise<number | null> {
  try {
    const free = await FileSystem.getFreeDiskStorageAsync();
    return typeof free === 'number' && Number.isFinite(free) && free >= 0 ? free : null;
  } catch {
    return null;
  }
}

/** True when an OS / FS error looks like out-of-space. */
export function isNoSpaceError(err: unknown): boolean {
  const msg = String(err instanceof Error ? err.message : err).toLowerCase();
  return (
    msg.includes('enospc') ||
    msg.includes('no space') ||
    msg.includes('not enough space') ||
    msg.includes('disk full') ||
    msg.includes('quota') ||
    msg.includes('espacio') ||
    (msg.includes('disk') && msg.includes('full'))
  );
}

/**
 * Ensures free disk space covers payload + headroom.
 * Skips the check when free space cannot be read (write path still classifies ENOSPC).
 */
export async function assertEnoughDiskSpace(requiredBytes: number): Promise<void> {
  const free = await getAvailableDiskSpaceBytes();
  if (free === null) return;
  const need = Math.max(0, requiredBytes) + EXPORT_DISK_HEADROOM_BYTES;
  if (free < need) {
    throw new ExportError('no_space', 'Insufficient disk space for export');
  }
}

export function utf8ByteLength(contents: string): number {
  return new TextEncoder().encode(contents).byteLength;
}

/**
 * Writes contents into the exports folder and returns the file URI.
 * Enforces the hard {@link EXPORT_MAX_FILES} cap (any extension) before writing.
 */
export async function writeExportFile(
  ext: ExportExt,
  contents: string,
  encoding: 'utf8' | 'base64' = 'utf8'
): Promise<{ uri: string; filename: string }> {
  const dir = await ensureExportsDir();
  const existing = await listExportFiles();
  if (existing.length >= EXPORT_MAX_FILES) {
    throw new ExportError('limit', `Export limit of ${EXPORT_MAX_FILES} files reached`);
  }
  const filename = await uniqueExportFilenameInDir(dir, ext);
  const uri = `${dir}${filename}`;
  try {
    await FileSystem.writeAsStringAsync(uri, contents, {
      encoding:
        encoding === 'base64' ? FileSystem.EncodingType.Base64 : FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    if (isNoSpaceError(err)) {
      throw new ExportError('no_space', err instanceof Error ? err.message : undefined);
    }
    throw new ExportError('write_failed', err instanceof Error ? err.message : undefined);
  }
  return { uri, filename };
}

/**
 * Writes unencrypted CSV/JSON into the cache `export-tmp/` folder.
 * Does not count toward {@link EXPORT_MAX_FILES} and is never listed with `.pkey` backups.
 */
export async function writeEphemeralExportFile(
  ext: 'csv' | 'json',
  contents: string
): Promise<{ uri: string; filename: string }> {
  const dir = await ensureEphemeralExportsDir();
  const filename = await uniqueExportFilenameInDir(dir, ext);
  const uri = `${dir}${filename}`;
  try {
    await FileSystem.writeAsStringAsync(uri, contents, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    if (isNoSpaceError(err)) {
      throw new ExportError('no_space', err instanceof Error ? err.message : undefined);
    }
    throw new ExportError('write_failed', err instanceof Error ? err.message : undefined);
  }
  return { uri, filename };
}

function clearEphemeralDeleteTimer(uri: string): void {
  const prev = pendingEphemeralDeletes.get(uri);
  if (prev !== undefined) {
    clearTimeout(prev);
    pendingEphemeralDeletes.delete(uri);
  }
}

/** Deletes a cache-only plaintext export. Path must be under `export-tmp/`. */
export async function deleteEphemeralExportFile(uri: string): Promise<void> {
  const dir = getEphemeralExportsDirUri();
  if (!uri.startsWith(dir)) {
    throw new Error('Invalid ephemeral export path');
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

/**
 * Attempts an immediate delete, then retries after {@link EPHEMERAL_EXPORT_TTL_MS}
 * in case the share receiver still has the URI open.
 */
export function scheduleEphemeralExportDelete(uri: string): void {
  void deleteEphemeralExportFile(uri).catch(() => undefined);
  clearEphemeralDeleteTimer(uri);
  pendingEphemeralDeletes.set(
    uri,
    setTimeout(() => {
      pendingEphemeralDeletes.delete(uri);
      void deleteEphemeralExportFile(uri).catch(() => undefined);
    }, EPHEMERAL_EXPORT_TTL_MS)
  );
}

/** Removes leftover CSV/JSON from the cache `export-tmp/` folder. */
export async function purgeEphemeralExports(): Promise<void> {
  for (const uri of [...pendingEphemeralDeletes.keys()]) {
    clearEphemeralDeleteTimer(uri);
  }
  const dir = getEphemeralExportsDirUri();
  try {
    const info = await FileSystem.getInfoAsync(dir);
    if (info.exists) {
      await FileSystem.deleteAsync(dir, { idempotent: true });
    }
  } catch {
    // Best-effort: listing/share must still work if cache wipe fails.
  }
}

/** Removes leftover unencrypted CSV/JSON from the persistent exports folder. */
export async function purgePlaintextExports(): Promise<void> {
  const files = await listExportFiles();
  for (const file of files) {
    if (file.ext === 'csv' || file.ext === 'json') {
      try {
        await deleteExportFile(file.uri);
      } catch {
        // Best-effort migration of historical plaintext leftovers.
      }
    }
  }
}

/** Lists recognized export files, newest first. */
export async function listExportFiles(): Promise<ExportFileInfo[]> {
  const dir = await ensureExportsDir();
  let names: string[] = [];
  try {
    names = await FileSystem.readDirectoryAsync(dir);
  } catch {
    return [];
  }

  const out: ExportFileInfo[] = [];
  for (const filename of names) {
    const parsed = parseExportFilename(filename);
    if (!parsed) continue;
    const uri = `${dir}${filename}`;
    const info = await FileSystem.getInfoAsync(uri);
    if (!info.exists || info.isDirectory) continue;
    const modifiedAt =
      typeof (info as { modificationTime?: number }).modificationTime === 'number'
        ? (info as { modificationTime: number }).modificationTime * 1000
        : (parseTimestampMs(parsed.date, parsed.time) ?? 0);
    const size = typeof info.size === 'number' ? info.size : 0;
    out.push({ filename, uri, ext: parsed.ext, size, modifiedAt });
  }

  out.sort((a, b) => b.modifiedAt - a.modifiedAt || b.filename.localeCompare(a.filename));
  return out;
}

function parseTimestampMs(date: string, time: string): number | null {
  if (date.length !== 8 || time.length !== 6) return null;
  const y = Number(date.slice(0, 4));
  const mo = Number(date.slice(4, 6)) - 1;
  const d = Number(date.slice(6, 8));
  const hh = Number(time.slice(0, 2));
  const mm = Number(time.slice(2, 4));
  const ss = Number(time.slice(4, 6));
  const t = new Date(y, mo, d, hh, mm, ss).getTime();
  return Number.isNaN(t) ? null : t;
}

export async function shareExportFile(uri: string, ext?: ExportExt): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) {
    throw new ExportError('share_unavailable', 'Sharing is not available on this device');
  }
  const resolvedExt =
    ext ?? (uri.split('.').pop()?.toLowerCase() as ExportExt | undefined) ?? 'pkey';
  beginExternalUiSession();
  try {
    await Sharing.shareAsync(uri, {
      mimeType: mimeForExt(resolvedExt === 'csv' || resolvedExt === 'json' ? resolvedExt : 'pkey'),
      dialogTitle: 'PKEY export',
      UTI: utiForExt(resolvedExt === 'csv' || resolvedExt === 'json' ? resolvedExt : 'pkey'),
    });
  } catch (err) {
    if (err instanceof ExportError) throw err;
    throw new ExportError('share_unavailable', err instanceof Error ? err.message : undefined);
  } finally {
    await endExternalUiSession();
  }
}

export async function deleteExportFile(uri: string): Promise<void> {
  const dir = getExportsDirUri();
  if (!uri.startsWith(dir)) {
    throw new Error('Invalid export path');
  }
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

/**
 * Deletes the oldest export file on the device (fallback for when the
 * {@link EXPORT_MAX_FILES} cap is reached). Resolves to the deleted file,
 * or `null` if there was nothing to delete.
 */
export async function deleteOldestExportFile(): Promise<ExportFileInfo | null> {
  const files = await listExportFiles();
  const oldest = files[files.length - 1] ?? null;
  if (oldest) {
    await deleteExportFile(oldest.uri);
  }
  return oldest;
}

/** Normalize unknown throwables into {@link ExportError}. */
export function toExportError(err: unknown): ExportError {
  if (err instanceof ExportError) return err;
  if (isNoSpaceError(err)) {
    return new ExportError('no_space', err instanceof Error ? err.message : undefined);
  }
  return new ExportError('unknown', err instanceof Error ? err.message : undefined);
}
