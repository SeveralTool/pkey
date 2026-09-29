/**
 * @fileoverview Local filesystem I/O for the encrypted vault database.
 */
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EncryptedDatabase } from '../types';
import { DATABASE_FILENAME } from '../constants/config';
import { LocalCipher } from './crypto';
import { hasSessionKeyMaterial, whenSessionNativeAttached } from './sessionKey';
import {
  encryptVaultPayloadForSession,
  ensureNativeVaultCryptoProbed,
  isNativeAeadReady,
  isNativeKdfReady,
} from './nativeVault';
import { discardPendingMigration } from './migrationPendingVault';

const LEGACY_FALLBACK_KEY = '@PKEY_FALLBACK_DATABASE';
const STORAGE_MIGRATED_FLAG = '@pkey/storage_migrated_v1';

let migrationPromise: Promise<void> | null = null;

/** @internal Resets the one-shot AsyncStorage→file migration latch (unit tests). */
export const resetLegacyStorageMigrationForTests = (): void => {
  migrationPromise = null;
};

/**
 * One-shot migration from legacy AsyncStorage fallback to document file only.
 */
export const migrateLegacyStorageIfNeeded = async (): Promise<void> => {
  if (migrationPromise) return migrationPromise;

  migrationPromise = (async () => {
    const migrated = await AsyncStorage.getItem(STORAGE_MIGRATED_FLAG);
    if (migrated === 'true') return;

    const fileUri = `${FileSystem.documentDirectory}${DATABASE_FILENAME}`;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    const fallback = await AsyncStorage.getItem(LEGACY_FALLBACK_KEY);

    if (fallback && !fileInfo.exists) {
      await FileSystem.writeAsStringAsync(fileUri, fallback, {
        encoding: FileSystem.EncodingType.UTF8,
      });
    }

    if (fallback) {
      await AsyncStorage.removeItem(LEGACY_FALLBACK_KEY);
    }

    await AsyncStorage.setItem(STORAGE_MIGRATED_FLAG, 'true');
  })();

  return migrationPromise;
};

/**
 * Returns whether an encrypted database file exists on disk.
 * I/O failures throw — callers must not treat errors as “no vault”.
 */
export const checkDatabaseExists = async (): Promise<boolean> => {
  await migrateLegacyStorageIfNeeded();
  const fileUri = `${FileSystem.documentDirectory}${DATABASE_FILENAME}`;
  const fileInfo = await FileSystem.getInfoAsync(fileUri);
  return fileInfo.exists;
};

/** Reads the raw encrypted vault payload from disk, or `''` if missing. */
export const readEncryptedPayload = async (): Promise<string> => {
  await migrateLegacyStorageIfNeeded();
  const fileUri = `${FileSystem.documentDirectory}${DATABASE_FILENAME}`;
  const fileInfo = await FileSystem.getInfoAsync(fileUri);

  if (fileInfo.exists) {
    return await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.UTF8 });
  }
  return '';
};

/**
 * Encrypts and persists the vault. Prefers the in-memory session root key when available.
 *
 * @param newDb - Database object to serialize
 * @param masterPassword - Fallback KDF password when no session root key is set
 */
export const writeDatabaseToDisk = async (
  newDb: EncryptedDatabase,
  masterPassword: string
): Promise<void> => {
  try {
    await ensureNativeVaultCryptoProbed();
    if (isNativeKdfReady() || isNativeAeadReady()) {
      await whenSessionNativeAttached();
    }
    const stringified = JSON.stringify(newDb);
    const deviceBound = newDb.settings?.bindDeviceSecret === true;
    let encryptedData: string;
    if (hasSessionKeyMaterial() && newDb.salt) {
      encryptedData = await encryptVaultPayloadForSession(stringified, newDb.salt, {
        deviceBound,
      });
    } else if (masterPassword) {
      encryptedData = LocalCipher.encrypt(stringified, masterPassword, newDb.salt);
    } else {
      console.error(
        '[storage] Refusing vault write without session key or master password (would wrap with empty key)'
      );
      throw new Error('Could not commit database write operation natively.');
    }

    const fileUri = `${FileSystem.documentDirectory}${DATABASE_FILENAME}`;
    await FileSystem.writeAsStringAsync(fileUri, encryptedData, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } catch (err) {
    console.error('Failed writing serialized cipher packet:', err);
    throw new Error('Could not commit database write operation natively.');
  }
};

/** Deletes the vault file and clears related legacy/biometric storage keys. */
export const destroyDatabase = async (): Promise<void> => {
  const destUri = `${FileSystem.documentDirectory}${DATABASE_FILENAME}`;
  const fileInfo = await FileSystem.getInfoAsync(destUri);
  if (fileInfo.exists) {
    await FileSystem.deleteAsync(destUri);
  }
  await discardPendingMigration();
  await AsyncStorage.removeItem('@PKEY_BIOMETRIC_ID');
  await migrateLegacyStorageIfNeeded();
  await AsyncStorage.removeItem(LEGACY_FALLBACK_KEY);
};
