/**
 * @fileoverview AppState scheduling for automatic encrypted backups.
 */
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';

const mockFlush = jest.fn();
jest.mock('./useDebouncedVaultWrite', () => ({
  flushPendingDatabaseWrite: (...args: unknown[]) => mockFlush(...args),
}));

const mockRun = jest.fn();
jest.mock('../services/autoBackupRun', () => ({
  runAutoBackup: (...args: unknown[]) => mockRun(...args),
}));

jest.mock('../services/autoBackupTask', () => ({
  syncAutoBackupNativeSchedule: jest.fn(async () => undefined),
}));

import { syncAutoBackupNativeSchedule } from '../services/autoBackupTask';
import { AUTO_BACKUP_TICK_MS, useAutoBackup } from './useAutoBackup';

describe('useAutoBackup', () => {
  const listeners = new Set<(state: AppStateStatus) => void>();

  const emit = (next: AppStateStatus): void => {
    act(() => {
      listeners.forEach((cb) => cb(next));
    });
  };

  beforeEach(() => {
    listeners.clear();
    mockFlush.mockReset();
    mockRun.mockReset();
    mockFlush.mockResolvedValue(undefined);
    mockRun.mockResolvedValue('skipped');
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listeners.add(handler);
      const sub: NativeEventSubscription = {
        remove: () => {
          listeners.delete(handler);
        },
      };
      return sub;
    });
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('runs a foreground catch-up on mount', () => {
    renderHook(() => useAutoBackup());
    expect(mockRun).toHaveBeenCalledWith('foreground');
  });

  it('waits for the vault flush then runs on background', async () => {
    let releaseFlush: () => void = () => undefined;
    mockFlush.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releaseFlush = () => resolve();
        })
    );
    renderHook(() => useAutoBackup());
    mockRun.mockClear();
    (syncAutoBackupNativeSchedule as jest.Mock).mockClear();
    emit('background');
    expect(syncAutoBackupNativeSchedule).toHaveBeenCalled();
    expect(mockFlush).toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
    await act(async () => {
      releaseFlush();
    });
    expect(mockRun).toHaveBeenCalledWith('background');
  });

  it('does not run on inactive', () => {
    renderHook(() => useAutoBackup());
    mockRun.mockClear();
    (syncAutoBackupNativeSchedule as jest.Mock).mockClear();
    emit('inactive');
    expect(syncAutoBackupNativeSchedule).toHaveBeenCalled();
    expect(mockFlush).not.toHaveBeenCalled();
    expect(mockRun).not.toHaveBeenCalled();
  });

  it('runs in foreground mode when returning to active', () => {
    renderHook(() => useAutoBackup());
    mockRun.mockClear();
    emit('active');
    expect(mockRun).toHaveBeenCalledWith('foreground');
    expect(mockFlush).not.toHaveBeenCalled();
  });

  it('runs on a timer while the app stays open', async () => {
    jest.useFakeTimers();
    renderHook(() => useAutoBackup());
    mockRun.mockClear();
    mockFlush.mockClear();
    await act(async () => {
      jest.advanceTimersByTime(AUTO_BACKUP_TICK_MS);
    });
    expect(mockFlush).toHaveBeenCalled();
    expect(mockRun).toHaveBeenCalledWith('interval');
  });

  it('removes the AppState listener on unmount', () => {
    const { unmount } = renderHook(() => useAutoBackup());
    expect(listeners.size).toBe(1);
    unmount();
    expect(listeners.size).toBe(0);
  });
});
