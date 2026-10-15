/**
 * @fileoverview Debounced vault writer shared by sync and `useDebouncedVaultWrite`.
 *
 * Sync must not construct a second writer. The hook registers its schedule and
 * flush here on mount; callers outside the provider use these functions.
 */
import type { EncryptedDatabase } from '../types';

/** Options for one staged vault write. */
export type VaultPersistOptions = Readonly<{
  /** When false, skip the PWA `server_push` (the caller announces itself). */
  notify?: boolean;
}>;

export type VaultPersistSchedule = (
  newDb: EncryptedDatabase,
  immediate?: boolean,
  opts?: VaultPersistOptions
) => Promise<boolean>;

let scheduleRef: VaultPersistSchedule | null = null;
let flushRef: (() => Promise<boolean>) | null = null;

/** Installs the writer owned by `useDebouncedVaultWrite`. */
export function registerVaultPersist(handlers: {
  schedule: VaultPersistSchedule;
  flush: () => Promise<boolean>;
}): void {
  scheduleRef = handlers.schedule;
  flushRef = handlers.flush;
}

/** Drops the writer when the hook unmounts. */
export function unregisterVaultPersist(): void {
  scheduleRef = null;
  flushRef = null;
}

/**
 * Stages `newDb` on the registered debounced writer.
 * Resolves `false` when the provider has not mounted. Callers must not fall
 * back to a raw storage write of a display snapshot.
 */
export function scheduleVaultPersist(
  newDb: EncryptedDatabase,
  immediate = false,
  opts?: VaultPersistOptions
): Promise<boolean> {
  if (!scheduleRef) {
    console.warn('[vaultPersist] no vault writer registered; disk write skipped');
    return Promise.resolve(false);
  }
  return scheduleRef(newDb, immediate, opts);
}

/** Flushes a pending debounced write. Resolves `true` when nothing is registered. */
export function flushVaultPersist(): Promise<boolean> {
  return flushRef?.() ?? Promise.resolve(true);
}
