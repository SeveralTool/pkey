/**
 * @fileoverview Concurrent vault flushes share one in-flight disk write.
 */
import { act, renderHook } from '@testing-library/react-native';
import { createEmptySessionDatabase } from '../utils/emptySessionDatabase';

const mockWriteDb = jest.fn();
jest.mock('../services/storage', () => ({
  writeDatabaseToDisk: (...args: unknown[]) => mockWriteDb(...args),
}));

jest.mock('../services/vaultSecrets', () => ({
  commitVault: (db: unknown) => ({ ui: db, disk: db }),
}));

jest.mock('../services/webSyncNotify', () => ({
  notifyWebClients: jest.fn(),
}));

jest.mock('../services/autofill', () => ({
  syncAutofillCache: jest.fn(),
}));

jest.mock('../utils/publicUiPrefs', () => ({
  rememberPublicUiFromSettings: jest.fn(),
  getCachedPublicUiPrefs: () => ({ language: 'AUTO', theme: 'AUTO' }),
}));

jest.mock('../notifications/notificationRef', () => ({
  notifications: { alert: jest.fn(), toast: jest.fn() },
}));

import { notifications } from '../notifications/notificationRef';
import { notifyWebClients } from '../services/webSyncNotify';
import { clearVaultPersistence, stageVault, vaultForSync } from '../services/vaultPersistence';
import { flushPendingDatabaseWrite, useDebouncedVaultWrite } from './useDebouncedVaultWrite';

describe('flushPendingDatabaseWrite inflight', () => {
  beforeEach(() => {
    clearVaultPersistence();
    mockWriteDb.mockReset();
  });

  it('shares one disk write across overlapping flushes', async () => {
    let release: () => void = () => undefined;
    mockWriteDb.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        })
    );
    const db = createEmptySessionDatabase();
    const { result } = renderHook(() =>
      useDebouncedVaultWrite({
        isLogged: true,
        masterPassword: 'x',
        setDb: jest.fn(),
        getT: () =>
          ({
            filesystem_error_title: 'fs',
            filesystem_error_body: 'err',
          }) as ReturnType<typeof import('../constants/localization').getLocale>,
      })
    );

    await act(async () => {
      await result.current.writeDatabaseToDisk({ ...db, last_update: '1' }, false);
    });

    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    await act(async () => {
      first = flushPendingDatabaseWrite();
      second = flushPendingDatabaseWrite();
    });
    expect(mockWriteDb).toHaveBeenCalledTimes(1);
    await act(async () => {
      release();
      await Promise.all([first, second]);
    });
    expect(mockWriteDb).toHaveBeenCalledTimes(1);
  });

  it('writes a snapshot staged while a flush is still in flight', async () => {
    const releases: Array<() => void> = [];
    mockWriteDb.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          releases.push(resolve);
        })
    );
    const db = createEmptySessionDatabase();
    const { result } = renderHook(() =>
      useDebouncedVaultWrite({
        isLogged: true,
        masterPassword: 'x',
        setDb: jest.fn(),
        getT: () =>
          ({
            filesystem_error_title: 'fs',
            filesystem_error_body: 'err',
          }) as ReturnType<typeof import('../constants/localization').getLocale>,
      })
    );

    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    await act(async () => {
      first = result.current.writeDatabaseToDisk({ ...db, last_update: '1' }, true);
    });
    expect(mockWriteDb).toHaveBeenCalledTimes(1);

    await act(async () => {
      second = result.current.writeDatabaseToDisk({ ...db, last_update: '2' }, true);
    });
    expect(mockWriteDb).toHaveBeenCalledTimes(1);

    await act(async () => {
      releases[0]?.();
    });
    expect(mockWriteDb).toHaveBeenCalledTimes(2);
    expect(mockWriteDb.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ last_update: '2' }));

    let firstOk: boolean | undefined;
    let secondOk: boolean | undefined;
    await act(async () => {
      releases[1]?.();
      [firstOk, secondOk] = await Promise.all([first, second]);
    });
    expect(firstOk).toBe(true);
    expect(secondOk).toBe(true);
  });

  it('does not alert when a failed flush was superseded by a newer snapshot', async () => {
    let rejectFirst: (err: Error) => void = () => undefined;
    mockWriteDb.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectFirst = reject;
        })
    );
    mockWriteDb.mockImplementation(() => Promise.resolve());
    const db = createEmptySessionDatabase();
    const { result } = renderHook(() =>
      useDebouncedVaultWrite({
        isLogged: true,
        masterPassword: 'x',
        setDb: jest.fn(),
        getT: () =>
          ({
            filesystem_error_title: 'fs',
            filesystem_error_body: 'err',
          }) as ReturnType<typeof import('../constants/localization').getLocale>,
      })
    );

    let first: Promise<boolean> | undefined;
    let second: Promise<boolean> | undefined;
    await act(async () => {
      first = result.current.writeDatabaseToDisk({ ...db, last_update: '1' }, true);
    });
    await act(async () => {
      second = result.current.writeDatabaseToDisk({ ...db, last_update: '2' }, true);
    });

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let firstOk: boolean | undefined;
    let secondOk: boolean | undefined;
    await act(async () => {
      rejectFirst(new Error('disk'));
      [firstOk, secondOk] = await Promise.all([first, second]);
    });
    errorSpy.mockRestore();

    expect(firstOk).toBe(false);
    expect(secondOk).toBe(true);
    expect(notifications.alert).not.toHaveBeenCalled();
    expect(mockWriteDb).toHaveBeenCalledTimes(2);
    expect(mockWriteDb.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ last_update: '2' }));
  });

  it('notifies the staged disk once and does not push again when the flush lands', async () => {
    const notify = jest.mocked(notifyWebClients);
    notify.mockClear();
    mockWriteDb.mockResolvedValue(undefined);
    const db = createEmptySessionDatabase();
    const { result } = renderHook(() =>
      useDebouncedVaultWrite({
        isLogged: true,
        masterPassword: 'x',
        setDb: jest.fn(),
        getT: () =>
          ({
            filesystem_error_title: 'fs',
            filesystem_error_body: 'err',
          }) as ReturnType<typeof import('../constants/localization').getLocale>,
      })
    );

    await act(async () => {
      await result.current.writeDatabaseToDisk({ ...db, last_update: '1' }, false);
    });
    expect(notify).toHaveBeenCalledTimes(1);

    await act(async () => {
      await flushPendingDatabaseWrite();
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(mockWriteDb).toHaveBeenCalledTimes(1);
  });

  it('does not roll back a keystroke staged while the disk write was failing', async () => {
    let rejectWrite: (err: Error) => void = () => undefined;
    mockWriteDb.mockImplementation(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectWrite = reject;
        })
    );
    jest.mocked(notifications.alert).mockClear();
    const setDb = jest.fn();
    const db = createEmptySessionDatabase();
    const typed = { ...db, last_update: 'typed' };
    const { result } = renderHook(() =>
      useDebouncedVaultWrite({
        isLogged: true,
        masterPassword: 'x',
        setDb,
        getT: () =>
          ({
            filesystem_error_title: 'fs',
            filesystem_error_body: 'err',
          }) as ReturnType<typeof import('../constants/localization').getLocale>,
      })
    );

    let write: Promise<boolean> = Promise.resolve(true);
    await act(async () => {
      write = result.current.writeDatabaseToDisk({ ...db, last_update: 'save' }, true);
    });
    stageVault(typed);

    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    let ok = true;
    await act(async () => {
      rejectWrite(new Error('disk'));
      ok = await write;
    });
    errorSpy.mockRestore();

    expect(ok).toBe(false);
    expect(setDb).toHaveBeenCalledTimes(1);
    expect(vaultForSync()).toBe(typed);
    expect(notifications.alert).toHaveBeenCalledTimes(1);
  });
});
