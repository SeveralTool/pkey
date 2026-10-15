/**
 * @fileoverview Device-local auto-backup prefs: validation, cache, session wipe.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearAutoBackupRuntime,
  DEFAULT_AUTO_BACKUP_PREFS,
  getCachedAutoBackupPrefs,
  loadAutoBackupPrefs,
  recordAutoBackupSuccess,
  resetAutoBackupPrefsCache,
  setAutoBackupEnabled,
  setAutoBackupInterval,
} from './autoBackupPrefs';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const KEY = 'pkey_auto_backup_v1';

describe('autoBackupPrefs', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    resetAutoBackupPrefsCache();
  });

  it('defaults to disabled with empty metadata when storage is empty', async () => {
    await expect(loadAutoBackupPrefs()).resolves.toEqual(DEFAULT_AUTO_BACKUP_PREFS);
    expect(getCachedAutoBackupPrefs().enabled).toBe(false);
  });

  it('rejects corrupt JSON and returns the default', async () => {
    await AsyncStorage.setItem(KEY, '{not-json');
    await expect(loadAutoBackupPrefs()).resolves.toEqual(DEFAULT_AUTO_BACKUP_PREFS);
  });

  it('rejects wrong types and returns the default', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ enabled: 'yes' }));
    await expect(loadAutoBackupPrefs()).resolves.toEqual(DEFAULT_AUTO_BACKUP_PREFS);
  });

  it('rejects a path-like filename and returns the default', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        ...DEFAULT_AUTO_BACKUP_PREFS,
        enabled: true,
        lastFilename: '../pkey-auto-20261008-162400.pkey',
      })
    );
    await expect(loadAutoBackupPrefs()).resolves.toEqual(DEFAULT_AUTO_BACKUP_PREFS);
  });

  it('round-trips enabled, hash, size, mtime, and filename', async () => {
    await setAutoBackupEnabled(true);
    await recordAutoBackupSuccess({
      now: 1_700_000_000_000,
      hash: 'abc123',
      size: 4096,
      mtime: 1_700_000,
      filename: 'pkey-auto-20261008-162400.pkey',
    });
    expect(getCachedAutoBackupPrefs()).toMatchObject({
      enabled: true,
      lastSnapshotAt: 1_700_000_000_000,
      lastSnapshotHash: 'abc123',
      fingerprintSize: 4096,
      fingerprintMtime: 1_700_000,
      lastFilename: 'pkey-auto-20261008-162400.pkey',
    });

    resetAutoBackupPrefsCache();
    const loaded = await loadAutoBackupPrefs();
    expect(loaded.enabled).toBe(true);
    expect(loaded.lastFilename).toBe('pkey-auto-20261008-162400.pkey');
    expect(loaded.lastSnapshotHash).toBe('abc123');
  });

  it('setAutoBackupEnabled does not clear snapshot metadata', async () => {
    await recordAutoBackupSuccess({
      now: 1,
      hash: 'h',
      size: 1,
      mtime: 2,
      filename: 'pkey-auto-20261008-162400.pkey',
    });
    await setAutoBackupEnabled(false);
    expect(getCachedAutoBackupPrefs().lastSnapshotHash).toBe('h');
    expect(getCachedAutoBackupPrefs().enabled).toBe(false);
  });

  it('clearAutoBackupRuntime returns to the default without leaving cache stale', async () => {
    await setAutoBackupEnabled(true);
    await clearAutoBackupRuntime();
    expect(getCachedAutoBackupPrefs()).toEqual(DEFAULT_AUTO_BACKUP_PREFS);
    resetAutoBackupPrefsCache();
    await expect(loadAutoBackupPrefs()).resolves.toEqual(DEFAULT_AUTO_BACKUP_PREFS);
  });

  it('does not let a later load clobber an in-memory set', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...DEFAULT_AUTO_BACKUP_PREFS, enabled: false })
    );
    await loadAutoBackupPrefs();
    await setAutoBackupEnabled(true);
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...DEFAULT_AUTO_BACKUP_PREFS, enabled: false })
    );
    const loaded = await loadAutoBackupPrefs();
    expect(loaded.enabled).toBe(true);
    expect(getCachedAutoBackupPrefs().enabled).toBe(true);
  });

  it('defaults a missing interval to 24H so older storage keeps working', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({
        enabled: true,
        lastSnapshotAt: null,
        lastSnapshotHash: null,
        fingerprintSize: null,
        fingerprintMtime: null,
        lastFilename: null,
        lastFailureCode: null,
        lastFailureNotifiedAt: null,
      })
    );
    await expect(loadAutoBackupPrefs()).resolves.toMatchObject({
      enabled: true,
      interval: '24H',
    });
  });

  it('rejects an unknown interval and returns the default', async () => {
    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ ...DEFAULT_AUTO_BACKUP_PREFS, enabled: true, interval: '12H' })
    );
    await expect(loadAutoBackupPrefs()).resolves.toEqual(DEFAULT_AUTO_BACKUP_PREFS);
  });

  it('round-trips 1M and 7D without clearing snapshot metadata', async () => {
    await recordAutoBackupSuccess({
      now: 9,
      hash: 'h',
      size: 1,
      mtime: 2,
      filename: 'pkey-auto-20261008-162400.pkey',
    });
    await setAutoBackupInterval('1M');
    expect(getCachedAutoBackupPrefs()).toMatchObject({
      interval: '1M',
      lastSnapshotHash: 'h',
    });
    await setAutoBackupInterval('7D');
    expect(getCachedAutoBackupPrefs().interval).toBe('7D');
    expect(getCachedAutoBackupPrefs().lastSnapshotHash).toBe('h');
  });
});
