/**
 * @fileoverview Foreground share / open targets for automatic backup notifications.
 */
import {
  listAutoBackupFiles,
  resolveListedExportFilename,
  shareExportFile,
} from './exportsStorage';

/** Dashboard tab opened when the user taps an auto-backup notification body. */
export const AUTO_BACKUP_OPEN_TAB = 'security' as const;

export type AutoBackupShareResult = 'shared' | 'missing' | 'failed';

/**
 * Opens the system share sheet for the named automatic backup, or the newest
 * automatic file if that name is gone. Never prompts for biometrics.
 */
export async function shareAutoBackupFromNotification(
  filename: string | null
): Promise<AutoBackupShareResult> {
  let uri: string | null = null;
  if (filename) {
    uri = await resolveListedExportFilename(filename);
  }
  if (!uri) {
    const autos = await listAutoBackupFiles();
    uri = autos[0]?.uri ?? null;
  }
  if (!uri) return 'missing';
  try {
    await shareExportFile(uri, 'pkey');
    return 'shared';
  } catch {
    return 'failed';
  }
}
