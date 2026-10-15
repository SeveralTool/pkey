/**
 * @fileoverview OS-scheduled automatic `.pkey` copy (WorkManager / BGTaskScheduler).
 *
 * `TaskManager.defineTask` runs at import time so a headless launch can execute
 * the task without mounting React. The in-app timer still covers the exact
 * interval while this process is alive. Android `1M` also holds a foreground
 * service so leaving PKEY does not freeze that timer. The OS will not wake a
 * killed app more often than every {@link OS_BACKGROUND_TASK_MIN_MINUTES}
 * minutes, and iOS may wait for its own window. A powered-off phone does not run it.
 */
import { Platform } from 'react-native';
import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { flushPendingDatabaseWrite } from '../hooks/useDebouncedVaultWrite';
import { syncAutoBackupKeepAlive } from './autoBackupKeepAlive';
import { nativeBackgroundIntervalMinutes } from './autoBackupPolicy';
import { loadAutoBackupPrefs } from './autoBackupPrefs';
import { runAutoBackup } from './autoBackupRun';

export const AUTO_BACKUP_TASK_NAME = 'pkey-auto-backup';

try {
  TaskManager.defineTask(AUTO_BACKUP_TASK_NAME, async () => {
    try {
      // The OS may run this while the app process is alive with a debounced
      // vault write pending (or mid-write). Flushing first copies the latest
      // state and never overlaps the non-atomic file write. Headless (no
      // provider mounted) this resolves immediately.
      await flushPendingDatabaseWrite().catch(() => undefined);
      const result = await runAutoBackup('interval');
      return result === 'failed'
        ? BackgroundTask.BackgroundTaskResult.Failed
        : BackgroundTask.BackgroundTaskResult.Success;
    } catch (error) {
      console.warn('[PKEY] automatic backup task failed', error);
      return BackgroundTask.BackgroundTaskResult.Failed;
    }
  });
} catch (error) {
  console.warn('[PKEY] automatic backup task was not defined', error);
}

/**
 * Registers or clears the native periodic task to match device prefs.
 * Never throws: a dev client built before this module still runs the in-app timer.
 */
export async function syncAutoBackupNativeSchedule(): Promise<void> {
  try {
    if (Platform.OS === 'web') return;
    if (!(await TaskManager.isAvailableAsync())) return;
    if (!TaskManager.isTaskDefined(AUTO_BACKUP_TASK_NAME)) return;
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;

    const prefs = await loadAutoBackupPrefs();
    const registered = await TaskManager.isTaskRegisteredAsync(AUTO_BACKUP_TASK_NAME);
    if (!prefs.enabled) {
      if (registered) await BackgroundTask.unregisterTaskAsync(AUTO_BACKUP_TASK_NAME);
      return;
    }

    const minimumInterval = nativeBackgroundIntervalMinutes(prefs.interval);
    if (registered) {
      const options = await TaskManager.getTaskOptionsAsync<{ minimumInterval?: number }>(
        AUTO_BACKUP_TASK_NAME
      );
      if (options?.minimumInterval === minimumInterval) return;
      await BackgroundTask.unregisterTaskAsync(AUTO_BACKUP_TASK_NAME);
    }
    await BackgroundTask.registerTaskAsync(AUTO_BACKUP_TASK_NAME, { minimumInterval });
  } catch (error) {
    console.warn('[PKEY] automatic backup native schedule skipped', error);
  } finally {
    await syncAutoBackupKeepAlive();
  }
}
