/**
 * @fileoverview Keeps the 1-minute auto-backup timer alive after PKEY is left.
 *
 * Android freezes a background process, so `setInterval` stops until the next
 * foreground. A `dataSync` foreground service (silent ongoing notification,
 * required by the OS) holds the process while the interval is 1 minute.
 * 24 h and 7 d stay on WorkManager / BGTaskScheduler. iOS has no equivalent:
 * the minute catches up when PKEY is opened again.
 */
import { Platform } from 'react-native';
import PkeyWebAccess from 'pkey-web-access';
import { getLocale } from '../constants/localization';
import { getCachedPublicUiPrefs } from '../utils/publicUiPrefs';
import { wantsOneMinuteProcessKeepAlive } from './autoBackupPolicy';
import { loadAutoBackupPrefs } from './autoBackupPrefs';

const nativeModule = PkeyWebAccess as {
  startBackupKeepAlive?: (title: string, body: string) => Promise<void>;
  stopBackupKeepAlive?: () => Promise<void>;
} | null;

let warnedMissingNative = false;

function warnMissingNative(): void {
  if (warnedMissingNative) return;
  warnedMissingNative = true;
  console.warn(
    '[PKEY] 1-minute backup keep-alive needs an Android build that includes BackupKeepAliveService'
  );
}

/** Starts or stops the Android keep-alive to match the current device prefs. */
export async function syncAutoBackupKeepAlive(): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    const prefs = await loadAutoBackupPrefs();
    const want = wantsOneMinuteProcessKeepAlive(prefs.enabled, prefs.interval);
    if (want) {
      if (!nativeModule?.startBackupKeepAlive) {
        warnMissingNative();
        return;
      }
      const t = getLocale(getCachedPublicUiPrefs().language);
      await nativeModule.startBackupKeepAlive(t.auto_backup_fg_title, t.auto_backup_fg_body);
      return;
    }
    if (!nativeModule?.stopBackupKeepAlive) return;
    await nativeModule.stopBackupKeepAlive();
  } catch (error) {
    console.warn('[PKEY] automatic backup keep-alive skipped', error);
  }
}

/** Test-only: allow the missing-native warning to fire again. */
export function resetAutoBackupKeepAliveForTests(): void {
  warnedMissingNative = false;
}
