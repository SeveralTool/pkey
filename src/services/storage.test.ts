/**
 * @fileoverview Encrypted vault file I/O (session key vs master-password wrap).
 */

const mockFileStore = new Map<string, string>();
const mockAsyncStore = new Map<string, string>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  EncodingType: { UTF8: 'utf8' },
  getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFileStore.has(uri) })),
  writeAsStringAsync: jest.fn(async (uri: string, contents: string) => {
    mockFileStore.set(uri, contents);
  }),
  readAsStringAsync: jest.fn(async (uri: string) => {
    const value = mockFileStore.get(uri);
    if (value == null) throw new Error('ENOENT');
    return value;
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFileStore.delete(uri);
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncStore.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockAsyncStore.delete(key);
  }),
}));

const mockDiscardPendingMigration = jest.fn(async () => undefined);
jest.mock('./migrationPendingVault', () => ({
  discardPendingMigration: (...args: unknown[]) => mockDiscardPendingMigration(...args),
}));

jest.mock('./crypto', () => ({
  LocalCipher: {
    encrypt: jest.fn(() => 'wrapped-with-password'),
    encryptWithCachedRoot: jest.fn(() => 'wrapped-with-session'),
  },
}));

import * as FileSystem from 'expo-file-system/legacy';
import { LocalCipher } from './crypto';
import { clearSessionRootKey, setSessionRootKey } from './sessionKey';
import {
  checkDatabaseExists,
  destroyDatabase,
  readEncryptedPayload,
  resetLegacyStorageMigrationForTests,
  writeDatabaseToDisk,
} from './storage';
import type { EncryptedDatabase } from '../types';

const VAULT_URI = 'file:///docs/pkey_encrypted_db.json';

const db = {
  version: 1,
  creation_date: '2026-01-01',
  last_update: '2026-01-01',
  passwordHash: 'hash',
  salt: 'aabbccdd',
  settings: {},
  cards: [],
} as EncryptedDatabase;

beforeEach(() => {
  mockFileStore.clear();
  mockAsyncStore.clear();
  mockDiscardPendingMigration.mockClear();
  clearSessionRootKey();
  resetLegacyStorageMigrationForTests();
  mockAsyncStore.set('@pkey/storage_migrated_v1', 'true');
  jest.mocked(LocalCipher.encrypt).mockClear();
  jest.mocked(LocalCipher.encryptWithCachedRoot).mockClear();
});

describe('storage', () => {
  it('refuses to write without a session key or master password', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(writeDatabaseToDisk(db, '')).rejects.toThrow(
      'Could not commit database write operation natively.'
    );
    expect(mockFileStore.has(VAULT_URI)).toBe(false);
    errorSpy.mockRestore();
  });

  it('wraps with the in-memory session root key when unlocked', async () => {
    setSessionRootKey('root-hex', 'salt-hex');
    await writeDatabaseToDisk(db, 'should-not-be-used');
    expect(LocalCipher.encryptWithCachedRoot).toHaveBeenCalled();
    expect(LocalCipher.encrypt).not.toHaveBeenCalled();
    expect(mockFileStore.get(VAULT_URI)).toBe('wrapped-with-session');
  });

  it('falls back to the master password when no session key is set', async () => {
    await writeDatabaseToDisk(db, 'master-pass');
    expect(LocalCipher.encrypt).toHaveBeenCalledWith(expect.any(String), 'master-pass', db.salt);
    expect(mockFileStore.get(VAULT_URI)).toBe('wrapped-with-password');
  });

  it('reads the encrypted payload from disk', async () => {
    mockFileStore.set(VAULT_URI, 'cipher-blob');
    await expect(readEncryptedPayload()).resolves.toBe('cipher-blob');
  });

  it('reports existence from the document file', async () => {
    expect(await checkDatabaseExists()).toBe(false);
    mockFileStore.set(VAULT_URI, 'cipher-blob');
    expect(await checkDatabaseExists()).toBe(true);
  });

  it('throws when the filesystem existence check fails', async () => {
    jest.mocked(FileSystem.getInfoAsync).mockRejectedValueOnce(new Error('io-fail'));
    await expect(checkDatabaseExists()).rejects.toThrow('io-fail');
  });

  it('destroyDatabase deletes the vault and staged migration leftovers', async () => {
    mockFileStore.set(VAULT_URI, 'cipher-blob');
    await destroyDatabase();
    expect(mockFileStore.has(VAULT_URI)).toBe(false);
    expect(mockDiscardPendingMigration).toHaveBeenCalledTimes(1);
  });
});
