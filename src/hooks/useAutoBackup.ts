/**
 * @fileoverview Schedules opt-in automatic `.pkey` copies on a timer and on AppState.
 *
 * The timer runs while this process is alive. Android freezes that process
 * shortly after PKEY leaves the screen, so the 1-minute choice also holds a
 * foreground service. WorkManager / BGTaskScheduler cover a force-closed app,
 * no more often than every 15 minutes. Does not open the share sheet.
 */
import { useEffect } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { flushPendingDatabaseWrite } from './useDebouncedVaultWrite';
import { runAutoBackup } from '../services/autoBackupRun';
import { syncAutoBackupNativeSchedule } from '../services/autoBackupTask';

/** How often the scheduler asks the policy whether a copy is due. */
export const AUTO_BACKUP_TICK_MS = 15_000;

async function runScheduled(reason: 'interval' | 'background' | 'foreground'): Promise<void> {
  if (reason !== 'foreground') {
    await flushPendingDatabaseWrite();
  }
  await runAutoBackup(reason);
}

async function onAppStateChange(state: AppStateStatus): Promise<void> {
  if (state === 'inactive' || state === 'background') {
    // Re-assert before the process can be frozen. Do not await: the background
    // flush below must start in this turn.
    void syncAutoBackupNativeSchedule();
  }
  if (state === 'background') {
    await runScheduled('background');
    return;
  }
  if (state === 'active') {
    await runScheduled('foreground');
  }
}

/** Copies the encrypted vault on the chosen interval while the app process is alive. */
export function useAutoBackup(): void {
  useEffect(() => {
    void syncAutoBackupNativeSchedule();
    void runScheduled('foreground');
    const timer = setInterval(() => {
      void runScheduled('interval');
    }, AUTO_BACKUP_TICK_MS);
    const sub = AppState.addEventListener('change', (state) => {
      void onAppStateChange(state);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, []);
}
