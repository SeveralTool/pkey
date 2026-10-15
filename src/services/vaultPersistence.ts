/**
 * @fileoverview Single vault writer: display snapshot for React, secret snapshot for disk and sync.
 *
 * `storage.writeDatabaseToDisk` encrypts whatever object it is given. Callers
 * stage through here so React never keeps `passwordList` / `otpSecret`, and
 * sync never reads that sanitized snapshot back as the vault.
 */
import type { EncryptedDatabase } from '../types';
import { writeDatabaseToDisk } from './storage';
import { commitVault } from './vaultSecrets';

let liveDisk: EncryptedDatabase | null = null;
let lastPersistedDisk: EncryptedDatabase | null = null;
let persistEpoch = 0;
const listeners = new Set<() => void>();

function emitPersisted(): void {
  persistEpoch += 1;
  listeners.forEach((listener) => listener());
}

/** Subscribes to successful disk publishes (persist, note, or clear). */
export function subscribeVaultPersistence(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic counter bumped when the persisted snapshot changes. */
export function getVaultPersistEpoch(): number {
  return persistEpoch;
}

/**
 * Splits `next` into a display snapshot and a secret snapshot.
 * Records the secret snapshot as the live vault sync should read.
 * Does not touch disk.
 */
export function stageVault(next: EncryptedDatabase): {
  ui: EncryptedDatabase;
  disk: EncryptedDatabase;
} {
  const staged = commitVault(next);
  liveDisk = staged.disk;
  return staged;
}

/**
 * Secret snapshot sync and autofill should read.
 * Prefers the latest staged edit over the last successful disk write.
 */
export function vaultForSync(): EncryptedDatabase | null {
  return liveDisk ?? lastPersistedDisk;
}

/** Last snapshot that reached disk, if this session has published one. */
export function getLastPersistedDisk(): EncryptedDatabase | null {
  return lastPersistedDisk;
}

/**
 * Records `disk` as already on disk (unlock of an unchanged file).
 * Does not write.
 */
export function noteVaultPersisted(disk: EncryptedDatabase): void {
  liveDisk = disk;
  lastPersistedDisk = disk;
  emitPersisted();
}

/**
 * Encrypts `disk` and remembers it as the persisted snapshot.
 * The only production caller of `storage.writeDatabaseToDisk`.
 */
export async function persistVaultDisk(
  disk: EncryptedDatabase,
  masterPassword: string
): Promise<void> {
  await writeDatabaseToDisk(disk, masterPassword);
  lastPersistedDisk = disk;
  if (liveDisk === null || liveDisk === disk) liveDisk = disk;
  emitPersisted();
}

/** Drops staged and persisted snapshots (logout / session reset). */
export function clearVaultPersistence(): void {
  liveDisk = null;
  lastPersistedDisk = null;
  emitPersisted();
}
