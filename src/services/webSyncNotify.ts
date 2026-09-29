/**
 * @fileoverview Decoupled notifier so DatabaseContext can push server_push
 * without depending on SyncContext provider order.
 */

let notifyFn: (() => void) | null = null;

/** Registers the SyncContext callback invoked after local vault writes. */
export function registerWebSyncNotifier(fn: () => void): void {
  notifyFn = fn;
}

/** Clears the registered web-sync notifier (provider unmount). */
export function unregisterWebSyncNotifier(): void {
  notifyFn = null;
}

/** Notifies connected PWA clients that the vault changed (no-op if unregistered). */
export function notifyWebClients(): void {
  notifyFn?.();
}
