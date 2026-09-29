/**
 * @fileoverview Local file export and import backup routines.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import { exportCardsToCsv, exportCardsToJsonString, type PasswordCard } from '@pkey/core';
import { DATABASE_FILENAME } from '../constants/config';
import { suppressAutoLogout } from '../utils/autoLogoutGuard';
import {
  assertEnoughDiskSpace,
  ExportError,
  scheduleEphemeralExportDelete,
  shareExportFile,
  toExportError,
  utf8ByteLength,
  writeEphemeralExportFile,
  writeExportFile,
} from './exportsStorage';

async function writeEphemeralAndShare(ext: 'csv' | 'json', contents: string): Promise<void> {
  await assertEnoughDiskSpace(utf8ByteLength(contents));
  const { uri } = await writeEphemeralExportFile(ext, contents);
  try {
    await shareExportFile(uri, ext);
  } finally {
    scheduleEphemeralExportDelete(uri);
  }
}

/**
 * Shares vault cards as unencrypted CSV. The file is cache-only and is not kept as a backup.
 */
export const exportCardsCsvShare = async (cards: PasswordCard[]): Promise<void> => {
  try {
    await writeEphemeralAndShare('csv', exportCardsToCsv(cards));
  } catch (err) {
    throw toExportError(err);
  }
};

/**
 * Shares vault cards as generic unencrypted JSON. The file is cache-only and is not kept as a backup.
 */
export const exportCardsJsonShare = async (cards: PasswordCard[]): Promise<void> => {
  try {
    await writeEphemeralAndShare('json', exportCardsToJsonString(cards));
  } catch (err) {
    throw toExportError(err);
  }
};

/**
 * Packages the encrypted vault into a `.pkey` file under exports/, then opens share.
 * `.pkey` stores the vault bytes as base64 text (same format as before).
 */
export const exportLocalBackup = async (): Promise<void> => {
  try {
    const fileUri = `${FileSystem.documentDirectory}${DATABASE_FILENAME}`;
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new ExportError('no_database', 'No active database to export');
    }

    // Fail early when free space is known and vault size implies a large base64 payload.
    const vaultSize = typeof fileInfo.size === 'number' ? fileInfo.size : 0;
    if (vaultSize > 0) {
      await assertEnoughDiskSpace(Math.ceil(vaultSize * (4 / 3)));
    }

    const encoded = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    await assertEnoughDiskSpace(utf8ByteLength(encoded));
    const { uri } = await writeExportFile('pkey', encoded, 'utf8');
    await shareExportFile(uri, 'pkey');
  } catch (err) {
    throw toExportError(err);
  }
};

/**
 * Launches the native document picker for the user to select a backup `.pkey` file,
 * then reads and returns its raw base64-decoded string contents.
 */
export const pickBackupFile = async (): Promise<string | null> => {
  try {
    suppressAutoLogout(120_000);
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const { uri } = result.assets[0];
    const fileString = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const binaryStr = atob(fileString);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const decodedString = new TextDecoder().decode(bytes);

    return decodedString;
  } catch (error) {
    console.warn(error);
    throw new Error('Hubo un problema seleccionando/leyendo el archivo de respaldo.');
  }
};
