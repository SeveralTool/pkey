/**
 * @fileoverview Applies a sync merge to React as a display snapshot and to disk with secrets.
 */
import { SERVER_PUSH_TYPE, computeDbVersionHash, computeSettingsHash } from '@pkey/core';
import type { EncryptedDatabase } from '../types';
import { normalizeAppSettings } from '../utils/appSettings';
import { attachVaultSecrets } from './vaultSecrets';
import { stageVault } from './vaultPersistence';
import { scheduleVaultPersist } from './vaultPersist';

/**
 * `server_push` hashes for `db`. Secrets are reattached first so a sanitized
 * UI snapshot announces the same card hash as the vault that will hit disk.
 */
function syncSnapshotHashes(db: EncryptedDatabase): {
  versionHash: string;
  settingsHash: string;
} {
  const snap = attachVaultSecrets(db);
  return {
    versionHash: computeDbVersionHash(snap),
    settingsHash: computeSettingsHash(snap.settings),
  };
}

/** Payload pushed to PWA clients after a vault or settings change. */
export function vaultServerPush(db: EncryptedDatabase): {
  type: typeof SERVER_PUSH_TYPE;
  versionHash: string;
  settingsHash: string;
} {
  const { versionHash, settingsHash } = syncSnapshotHashes(db);
  return { type: SERVER_PUSH_TYPE, versionHash, settingsHash };
}

/**
 * Commits `next` into the secret store, hands React the display snapshot, and
 * writes the secret snapshot through the debounced vault writer.
 * Notification is suppressed: the sync caller announces `server_push` itself
 * so the source client can be excluded.
 *
 * @returns The snapshot that was scheduled for disk (secrets attached).
 */
export async function commitSyncedVault(
  next: EncryptedDatabase,
  reactSetDb: (db: EncryptedDatabase) => void
): Promise<EncryptedDatabase> {
  const normalized: EncryptedDatabase = {
    ...next,
    settings: normalizeAppSettings(next.settings, next.cards || []),
  };
  const { ui, disk } = stageVault(normalized);
  reactSetDb(ui);
  const persisted = await scheduleVaultPersist(disk, true, { notify: false });
  if (!persisted) {
    throw new Error('vault-persist-failed');
  }
  return disk;
}
