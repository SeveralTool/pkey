/**
 * @fileoverview Automatic backup runner: interval, hash skip, mutex, notifications.
 */
import { sha256 } from '@pkey/core';
import { AUTO_BACKUP_MIN_INTERVAL_MS } from './autoBackupPolicy';
import { DEFAULT_AUTO_BACKUP_PREFS, type AutoBackupPrefs } from './autoBackupPrefs';
import { ExportError } from './exportsStorage';

const mockGetInfoAsync = jest.fn();
const mockReadAsStringAsync = jest.fn();
const mockDeleteAsync = jest.fn();
jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockReadAsStringAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

const mockLoadPrefs = jest.fn();
const mockRecordSuccess = jest.fn();
const mockRecordFailure = jest.fn();
jest.mock('./autoBackupPrefs', () => {
  const actual = jest.requireActual('./autoBackupPrefs') as typeof import('./autoBackupPrefs');
  return {
    ...actual,
    loadAutoBackupPrefs: (...args: unknown[]) => mockLoadPrefs(...args),
    recordAutoBackupSuccess: (...args: unknown[]) => mockRecordSuccess(...args),
    recordAutoBackupFailure: (...args: unknown[]) => mockRecordFailure(...args),
  };
});

const mockWriteAutoBackupFile = jest.fn();
jest.mock('./exportsStorage', () => {
  const actual = jest.requireActual('./exportsStorage') as typeof import('./exportsStorage');
  return {
    ...actual,
    writeAutoBackupFile: (...args: unknown[]) => mockWriteAutoBackupFile(...args),
  };
});

const mockSendOsNotification = jest.fn();
jest.mock('../notifications/osNotificationService', () => ({
  sendOsNotification: (...args: unknown[]) => mockSendOsNotification(...args),
}));

jest.mock('../utils/publicUiPrefs', () => ({
  getCachedPublicUiPrefs: () => ({ language: 'ING', theme: 'AUTO' }),
}));

import { Base64, Utf8 } from 'crypto-es';
import { KDF_ARGON2ID } from '@pkey/core';
import {
  isCompleteVaultFileBase64,
  isCompleteVaultFileText,
  resumeAutoBackup,
  runAutoBackup,
  resetAutoBackupRunForTests,
  suspendAutoBackup,
} from './autoBackupRun';

const VAULT = 'file:///docs/pkey_encrypted_db.json';
const VAULT_TEXT = JSON.stringify({
  v: 4,
  kdf: KDF_ARGON2ID,
  kdfMem: 65536,
  kdfTime: 3,
  kdfPar: 1,
  kdfSalt: '00112233445566778899aabbccddeeff',
  deviceBound: false,
  nonce: 'aa'.repeat(24),
  ciphertext: 'bb'.repeat(40),
});
const toBase64 = (text: string): string => Base64.stringify(Utf8.parse(text));
const PAYLOAD = toBase64(VAULT_TEXT);
const HASH = sha256(PAYLOAD);

function prefs(patch: Partial<AutoBackupPrefs> = {}): AutoBackupPrefs {
  return { ...DEFAULT_AUTO_BACKUP_PREFS, enabled: true, ...patch };
}

describe('runAutoBackup', () => {
  beforeEach(() => {
    resetAutoBackupRunForTests();
    mockGetInfoAsync.mockReset();
    mockReadAsStringAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockDeleteAsync.mockResolvedValue(undefined);
    mockLoadPrefs.mockReset();
    mockRecordSuccess.mockReset();
    mockRecordFailure.mockReset();
    mockWriteAutoBackupFile.mockReset();
    mockSendOsNotification.mockReset();
    mockLoadPrefs.mockResolvedValue(prefs());
    mockRecordSuccess.mockResolvedValue(undefined);
    mockRecordFailure.mockResolvedValue(undefined);
    mockWriteAutoBackupFile.mockResolvedValue({
      uri: 'file:///docs/exports/pkey-auto-20261008-162400.pkey',
      filename: 'pkey-auto-20261008-162400.pkey',
    });
    mockSendOsNotification.mockResolvedValue(true);
    mockGetInfoAsync.mockResolvedValue({
      exists: true,
      isDirectory: false,
      size: 128,
      modificationTime: 50,
    });
    mockReadAsStringAsync.mockResolvedValue(PAYLOAD);
  });

  it('writes Base64, does not share, and notifies ready on enable', async () => {
    const result = await runAutoBackup('enable');
    expect(result).toBe('written');
    expect(mockReadAsStringAsync).toHaveBeenCalledWith(VAULT, { encoding: 'base64' });
    expect(mockWriteAutoBackupFile).toHaveBeenCalledWith(PAYLOAD);
    expect(mockSendOsNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          type: 'auto-backup-ready',
          filename: 'pkey-auto-20261008-162400.pkey',
        },
      })
    );
  });

  it('skips write and notify when size and mtime match the stored fingerprint', async () => {
    mockLoadPrefs.mockResolvedValue(
      prefs({
        lastSnapshotAt: Date.now(),
        lastSnapshotHash: 'old',
        fingerprintSize: 128,
        fingerprintMtime: 50,
      })
    );
    await expect(runAutoBackup('background')).resolves.toBe('skipped');
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
    expect(mockWriteAutoBackupFile).not.toHaveBeenCalled();
    expect(mockSendOsNotification).not.toHaveBeenCalled();
  });

  it('does not read vault bytes when the fingerprint changed inside 24 h', async () => {
    mockLoadPrefs.mockResolvedValue(
      prefs({
        lastSnapshotAt: Date.now() - 60_000,
        lastSnapshotHash: 'old',
        fingerprintSize: 10,
        fingerprintMtime: 1,
      })
    );
    await expect(runAutoBackup('background')).resolves.toBe('skipped');
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
    expect(mockWriteAutoBackupFile).not.toHaveBeenCalled();
  });

  it('writes and notifies when the fingerprint changed after 24 h and the hash is new', async () => {
    mockLoadPrefs.mockResolvedValue(
      prefs({
        lastSnapshotAt: Date.now() - AUTO_BACKUP_MIN_INTERVAL_MS - 1,
        lastSnapshotHash: 'old-hash',
        fingerprintSize: 10,
        fingerprintMtime: 1,
      })
    );
    await expect(runAutoBackup('background')).resolves.toBe('written');
    expect(mockWriteAutoBackupFile).toHaveBeenCalledTimes(1);
    expect(mockSendOsNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'auto-backup-ready' }),
      })
    );
  });

  it('writes again after the interval even when the vault hash is unchanged', async () => {
    mockLoadPrefs.mockResolvedValue(
      prefs({
        lastSnapshotAt: Date.now() - AUTO_BACKUP_MIN_INTERVAL_MS - 1,
        lastSnapshotHash: HASH,
        fingerprintSize: 128,
        fingerprintMtime: 50,
      })
    );
    await expect(runAutoBackup('interval')).resolves.toBe('written');
    expect(mockWriteAutoBackupFile).toHaveBeenCalledWith(PAYLOAD);
    expect(mockSendOsNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ type: 'auto-backup-ready' }),
      })
    );
  });

  it('does not stat the vault when disabled in background', async () => {
    mockLoadPrefs.mockResolvedValue(prefs({ enabled: false }));
    await expect(runAutoBackup('background')).resolves.toBe('skipped');
    expect(mockGetInfoAsync).not.toHaveBeenCalled();
  });

  it('skips without throwing when the vault file is missing', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    await expect(runAutoBackup('enable')).resolves.toBe('skipped');
    expect(mockWriteAutoBackupFile).not.toHaveBeenCalled();
  });

  it('notifies no_space once and does not repeat within 24 h', async () => {
    mockWriteAutoBackupFile.mockRejectedValue(new ExportError('no_space'));
    await expect(runAutoBackup('enable')).resolves.toBe('failed');
    expect(mockSendOsNotification).toHaveBeenCalledTimes(1);
    expect(mockSendOsNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { type: 'auto-backup-failed' },
      })
    );

    mockLoadPrefs.mockResolvedValue(
      prefs({
        lastFailureCode: 'no_space',
        lastFailureNotifiedAt: Date.now(),
      })
    );
    await expect(runAutoBackup('enable')).resolves.toBe('failed');
    expect(mockSendOsNotification).toHaveBeenCalledTimes(1);
  });

  it('shares one write across overlapping runAutoBackup calls', async () => {
    let resolveWrite: (value: { uri: string; filename: string }) => void = () => undefined;
    const gate = new Promise<{ uri: string; filename: string }>((resolve) => {
      resolveWrite = resolve;
    });
    mockWriteAutoBackupFile.mockReturnValue(gate);
    const first = runAutoBackup('enable');
    const second = runAutoBackup('background');
    expect(second).toBe(first);
    resolveWrite({
      uri: 'file:///docs/exports/pkey-auto-20261008-162400.pkey',
      filename: 'pkey-auto-20261008-162400.pkey',
    });
    await expect(Promise.all([first, second])).resolves.toEqual(['written', 'written']);
    expect(mockWriteAutoBackupFile).toHaveBeenCalledTimes(1);
  });

  it('writes after 1 minute when the chosen interval is 1M', async () => {
    mockLoadPrefs.mockResolvedValue(
      prefs({
        interval: '1M',
        lastSnapshotAt: Date.now() - 60_001,
        lastSnapshotHash: 'old-hash',
        fingerprintSize: 10,
        fingerprintMtime: 1,
      })
    );
    await expect(runAutoBackup('background')).resolves.toBe('written');
  });

  it('skips inside 1 minute when the chosen interval is 1M', async () => {
    mockLoadPrefs.mockResolvedValue(
      prefs({
        interval: '1M',
        lastSnapshotAt: Date.now() - 30_000,
        lastSnapshotHash: 'old-hash',
        fingerprintSize: 10,
        fingerprintMtime: 1,
      })
    );
    await expect(runAutoBackup('background')).resolves.toBe('skipped');
    expect(mockReadAsStringAsync).not.toHaveBeenCalled();
  });

  it('returns written even when the OS notification is not delivered', async () => {
    mockSendOsNotification.mockResolvedValue(false);
    await expect(runAutoBackup('enable')).resolves.toBe('written');
    expect(mockWriteAutoBackupFile).toHaveBeenCalledTimes(1);
  });

  it('does not write or notify a copy suspended before the file is stored', async () => {
    const running = runAutoBackup('enable');
    const stopping = suspendAutoBackup();
    await stopping;
    await expect(running).resolves.toBe('skipped');
    expect(mockWriteAutoBackupFile).not.toHaveBeenCalled();
    expect(mockRecordSuccess).not.toHaveBeenCalled();
    expect(mockSendOsNotification).not.toHaveBeenCalled();
    await expect(runAutoBackup('enable')).resolves.toBe('skipped');
    resumeAutoBackup();
  });

  it('deletes a copy that finished while the vault wipe suspended the run', async () => {
    let releaseWrite: (value: { uri: string; filename: string }) => void = () => undefined;
    mockWriteAutoBackupFile.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseWrite = resolve;
        })
    );
    const running = runAutoBackup('enable');
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockWriteAutoBackupFile).toHaveBeenCalled();
    const stopping = suspendAutoBackup();
    releaseWrite({
      uri: 'file:///docs/exports/pkey-auto-20261008-162400.pkey',
      filename: 'pkey-auto-20261008-162400.pkey',
    });
    await stopping;
    await expect(running).resolves.toBe('skipped');
    expect(mockRecordSuccess).not.toHaveBeenCalled();
    expect(mockSendOsNotification).not.toHaveBeenCalled();
    expect(mockDeleteAsync).toHaveBeenCalled();
    resumeAutoBackup();
  });

  it('does not store a truncated vault read (overlapped write) and does not notify', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    mockReadAsStringAsync.mockResolvedValue(toBase64(VAULT_TEXT.slice(0, 40)));
    await expect(runAutoBackup('enable')).resolves.toBe('skipped');
    expect(mockWriteAutoBackupFile).not.toHaveBeenCalled();
    expect(mockRecordSuccess).not.toHaveBeenCalled();
    expect(mockSendOsNotification).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('isCompleteVaultFileText', () => {
  it('accepts v4 and legacy JSON envelopes with ciphertext', () => {
    expect(isCompleteVaultFileText(VAULT_TEXT)).toBe(true);
    expect(
      isCompleteVaultFileText(
        JSON.stringify({ v: 3, kdfSalt: '00', salt: '11', iv: '22', ciphertext: '33', hmac: '44' })
      )
    ).toBe(true);
  });

  it('rejects empty, truncated, ciphertext-less JSON, and non-JSON bytes', () => {
    expect(isCompleteVaultFileText('')).toBe(false);
    expect(isCompleteVaultFileText('   ')).toBe(false);
    expect(isCompleteVaultFileText(VAULT_TEXT.slice(0, -5))).toBe(false);
    expect(isCompleteVaultFileText(JSON.stringify({ v: 4 }))).toBe(false);
    expect(isCompleteVaultFileText(JSON.stringify({ ciphertext: '' }))).toBe(false);
    expect(isCompleteVaultFileText('not-json')).toBe(false);
    expect(isCompleteVaultFileText('U2FsdGVkX1')).toBe(false);
  });

  it('validates the base64 that will be written', () => {
    expect(isCompleteVaultFileBase64(PAYLOAD)).toBe(true);
    expect(isCompleteVaultFileBase64('')).toBe(false);
    expect(isCompleteVaultFileBase64(toBase64(VAULT_TEXT.slice(0, 10)))).toBe(false);
    expect(isCompleteVaultFileBase64(toBase64('not-json'))).toBe(false);
  });
});
