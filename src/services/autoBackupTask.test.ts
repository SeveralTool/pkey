/**
 * @fileoverview Native auto-backup registration follows the device switch and interval.
 */
const mockGetStatus = jest.fn();
const mockRegister = jest.fn();
const mockUnregister = jest.fn();
const mockAvailable = jest.fn();
const mockRegistered = jest.fn();
const mockOptions = jest.fn();
const mockDefined = jest.fn();
const mockRun = jest.fn();
const mockLoadPrefs = jest.fn();

jest.mock('expo-background-task', () => ({
  getStatusAsync: (...args: unknown[]) => mockGetStatus(...args),
  registerTaskAsync: (...args: unknown[]) => mockRegister(...args),
  unregisterTaskAsync: (...args: unknown[]) => mockUnregister(...args),
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isAvailableAsync: (...args: unknown[]) => mockAvailable(...args),
  isTaskDefined: (...args: unknown[]) => mockDefined(...args),
  isTaskRegisteredAsync: (...args: unknown[]) => mockRegistered(...args),
  getTaskOptionsAsync: (...args: unknown[]) => mockOptions(...args),
}));

jest.mock('./autoBackupPrefs', () => ({
  loadAutoBackupPrefs: (...args: unknown[]) => mockLoadPrefs(...args),
}));

jest.mock('./autoBackupRun', () => ({
  runAutoBackup: (...args: unknown[]) => mockRun(...args),
}));

const mockKeepAlive = jest.fn();
jest.mock('./autoBackupKeepAlive', () => ({
  syncAutoBackupKeepAlive: (...args: unknown[]) => mockKeepAlive(...args),
}));

const mockFlush = jest.fn();
jest.mock('../hooks/useDebouncedVaultWrite', () => ({
  flushPendingDatabaseWrite: (...args: unknown[]) => mockFlush(...args),
}));

import { BackgroundTaskResult } from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { AUTO_BACKUP_TASK_NAME, syncAutoBackupNativeSchedule } from './autoBackupTask';

describe('syncAutoBackupNativeSchedule', () => {
  beforeEach(() => {
    mockGetStatus.mockReset();
    mockRegister.mockReset();
    mockUnregister.mockReset();
    mockAvailable.mockReset();
    mockRegistered.mockReset();
    mockOptions.mockReset();
    mockDefined.mockReset();
    mockLoadPrefs.mockReset();
    mockAvailable.mockResolvedValue(true);
    mockDefined.mockReturnValue(true);
    mockGetStatus.mockResolvedValue(2);
    mockRegister.mockResolvedValue(undefined);
    mockUnregister.mockResolvedValue(undefined);
    mockKeepAlive.mockReset();
    mockKeepAlive.mockResolvedValue(undefined);
  });

  it('unregisters when the switch is off', async () => {
    mockLoadPrefs.mockResolvedValue({ enabled: false, interval: '24H' });
    mockRegistered.mockResolvedValue(true);
    await syncAutoBackupNativeSchedule();
    expect(mockUnregister).toHaveBeenCalledWith(AUTO_BACKUP_TASK_NAME);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('registers 15 minutes for the 1 minute choice', async () => {
    mockLoadPrefs.mockResolvedValue({ enabled: true, interval: '1M' });
    mockRegistered.mockResolvedValue(false);
    await syncAutoBackupNativeSchedule();
    expect(mockRegister).toHaveBeenCalledWith(AUTO_BACKUP_TASK_NAME, { minimumInterval: 15 });
    expect(mockKeepAlive).toHaveBeenCalled();
  });

  it('registers 24 hours and 7 days in minutes', async () => {
    mockLoadPrefs.mockResolvedValue({ enabled: true, interval: '24H' });
    mockRegistered.mockResolvedValue(false);
    await syncAutoBackupNativeSchedule();
    expect(mockRegister).toHaveBeenCalledWith(AUTO_BACKUP_TASK_NAME, { minimumInterval: 1440 });

    mockRegister.mockClear();
    mockLoadPrefs.mockResolvedValue({ enabled: true, interval: '7D' });
    await syncAutoBackupNativeSchedule();
    expect(mockRegister).toHaveBeenCalledWith(AUTO_BACKUP_TASK_NAME, { minimumInterval: 10080 });
  });

  it('does not re-register when the native interval is already current', async () => {
    mockLoadPrefs.mockResolvedValue({ enabled: true, interval: '24H' });
    mockRegistered.mockResolvedValue(true);
    mockOptions.mockResolvedValue({ minimumInterval: 1440 });
    await syncAutoBackupNativeSchedule();
    expect(mockUnregister).not.toHaveBeenCalled();
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('replaces the registration when the interval changed', async () => {
    mockLoadPrefs.mockResolvedValue({ enabled: true, interval: '7D' });
    mockRegistered.mockResolvedValue(true);
    mockOptions.mockResolvedValue({ minimumInterval: 1440 });
    await syncAutoBackupNativeSchedule();
    expect(mockUnregister).toHaveBeenCalledWith(AUTO_BACKUP_TASK_NAME);
    expect(mockRegister).toHaveBeenCalledWith(AUTO_BACKUP_TASK_NAME, { minimumInterval: 10080 });
  });

  it('skips registration when the OS reports background tasks restricted', async () => {
    mockGetStatus.mockResolvedValue(1);
    await syncAutoBackupNativeSchedule();
    expect(mockRegister).not.toHaveBeenCalled();
    expect(mockLoadPrefs).not.toHaveBeenCalled();
    expect(mockKeepAlive).toHaveBeenCalled();
  });

  it('defines a task that maps a failed copy to the OS failure result', async () => {
    const defineTask = TaskManager.defineTask as jest.Mock;
    const executor = defineTask.mock.calls[0]?.[1] as (() => Promise<number>) | undefined;
    expect(defineTask).toHaveBeenCalledWith(AUTO_BACKUP_TASK_NAME, expect.any(Function));
    mockFlush.mockResolvedValue(undefined);
    mockRun.mockResolvedValueOnce('failed');
    await expect(executor?.()).resolves.toBe(BackgroundTaskResult.Failed);
    mockRun.mockResolvedValueOnce('written');
    await expect(executor?.()).resolves.toBe(BackgroundTaskResult.Success);
  });

  it('flushes a pending vault write before the OS-triggered copy', async () => {
    const defineTask = TaskManager.defineTask as jest.Mock;
    const executor = defineTask.mock.calls[0]?.[1] as (() => Promise<number>) | undefined;
    const order: string[] = [];
    mockFlush.mockReset();
    mockRun.mockReset();
    mockFlush.mockImplementation(async () => {
      order.push('flush');
    });
    mockRun.mockImplementation(async () => {
      order.push('run');
      return 'skipped';
    });
    await expect(executor?.()).resolves.toBe(BackgroundTaskResult.Success);
    expect(order).toEqual(['flush', 'run']);
  });

  it('still copies when the flush rejects (headless process without a provider)', async () => {
    const defineTask = TaskManager.defineTask as jest.Mock;
    const executor = defineTask.mock.calls[0]?.[1] as (() => Promise<number>) | undefined;
    mockFlush.mockRejectedValueOnce(new Error('no provider'));
    mockRun.mockResolvedValueOnce('written');
    await expect(executor?.()).resolves.toBe(BackgroundTaskResult.Success);
  });
});
