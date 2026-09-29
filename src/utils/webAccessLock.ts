/**
 * @fileoverview Bridge so vault lock (Auth) can stop LAN web access (Sync)
 * without a circular provider dependency. Auth sits above Sync in the tree.
 *
 * Android sticky foreground service is allowed to keep `:7392` alive while the
 * phone is locked or PKEY is minimized. That path must not INSTANT-lock the
 * vault (locking the vault would tear the server down).
 */

let lockStopHandler: (() => void) | null = null;
let androidKeepAlive = false;

/**
 * Registers the Sync-layer teardown used when the vault locks.
 * Pass `null` on unmount.
 */
export function setWebAccessLockStopHandler(handler: (() => void) | null): void {
  lockStopHandler = handler;
}

/**
 * Stops the LAN web server immediately on vault lock (explicit Lock PKEY,
 * foreground idle, or iOS background auto-lock). Safe when web access is off.
 */
export function stopWebAccessOnVaultLock(): void {
  lockStopHandler?.();
}

/**
 * True while Android web access keep-alive is running (FG service). Background
 * auto-lock must not fire — locking the phone should leave the LAN server up.
 */
export function isAndroidWebAccessKeepAlive(): boolean {
  return androidKeepAlive;
}

/**
 * Sync sets this when the Android LAN server is on or off.
 */
export function setAndroidWebAccessKeepAlive(active: boolean): void {
  androidKeepAlive = active;
}
