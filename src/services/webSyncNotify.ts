/**
 * @fileoverview Decoupled notifier so DatabaseContext can push server_push
 * without depending on SyncContext provider order.
 */

import type { EncryptedDatabase } from '../types';

let notifyFn: ((db: EncryptedDatabase) => void) | null = null;

/** Registers the SyncContext callback invoked after local vault writes. */
export function registerWebSyncNotifier(fn: (db: EncryptedDatabase) => void): void {
  notifyFn = fn;
}

/** Clears the registered web-sync notifier (provider unmount). */
export function unregisterWebSyncNotifier(): void {
  notifyFn = null;
}

/**
 * Notifies connected PWA clients that the vault changed.
 * `db` is the secret snapshot that was staged, not the React display copy.
 */
export function notifyWebClients(db: EncryptedDatabase): void {
  notifyFn?.(db);
}
