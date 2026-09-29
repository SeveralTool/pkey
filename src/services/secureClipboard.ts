/**
 * @fileoverview Secure clipboard wrapper with auto-clear and Android sensitive flag.
 *
 * Rationale:
 *  - The deprecated `Clipboard` API from `react-native` did not support the
 *    Android 13+ `EXTRA_IS_SENSITIVE` extra, which tells the platform to hide
 *    the clipboard preview in system UI and keyboards.
 *  - Password managers must auto-clear the clipboard after a short window
 *    (industry norm: 20-60 s) to prevent other apps or clipboard listeners
 *    from harvesting recently copied secrets.
 *
 * This module owns a single pending clear timer so consecutive copies do not
 * leave orphaned timers that would wipe a *newer* copy prematurely. When a
 * caller copies a fresh secret, the previous timer is cancelled and a new
 * 30 s clear is scheduled.
 *
 * The clipboard is only cleared when the currently-copied value still matches
 * what this module wrote: if the user manually copied something else (a URL,
 * a message), we do not clobber their content.
 */
import * as Clipboard from 'expo-clipboard';

/** Default auto-clear window. Chosen to match Bitwarden / 1Password defaults. */
export const CLIPBOARD_CLEAR_MS = 30_000;

/** Options accepted by {@link copySecret}. */
export interface CopySecretOptions {
  /** Override auto-clear delay (ms). Defaults to {@link CLIPBOARD_CLEAR_MS}. */
  clearAfterMs?: number;
  /** Notified when the clipboard is actually cleared (skipped when user copied something else). */
  onCleared?: () => void;
  /** Notified after a successful write, with the actual delay in ms. */
  onCopied?: (delayMs: number) => void;
}

let pendingClearTimer: ReturnType<typeof setTimeout> | null = null;
/** Snapshot of the last value we wrote — used to avoid clobbering user content. */
let lastWrittenValue: string | null = null;

function cancelPendingClear(): void {
  if (pendingClearTimer) {
    clearTimeout(pendingClearTimer);
    pendingClearTimer = null;
  }
}

/**
 * Copies a secret value to the clipboard with the Android sensitive flag and
 * schedules an auto-clear.
 *
 * @param value - Secret to place on the clipboard. Empty strings are ignored.
 * @param options - Optional override for delay + observer callbacks.
 */
export async function copySecret(value: string, options: CopySecretOptions = {}): Promise<void> {
  const trimmed = typeof value === 'string' ? value : '';
  if (!trimmed) return;

  const delayMs = Math.max(1_000, options.clearAfterMs ?? CLIPBOARD_CLEAR_MS);

  // Cancel any previous timer so a fresh copy resets the clear window.
  cancelPendingClear();

  // `sensitive: true` opts into Android 13+ system-UI hiding (Chip preview / IME).
  await Clipboard.setStringAsync(trimmed, { sensitive: true });
  lastWrittenValue = trimmed;

  options.onCopied?.(delayMs);

  pendingClearTimer = setTimeout(() => {
    void (async () => {
      pendingClearTimer = null;
      try {
        const current = await Clipboard.getStringAsync();
        if (current !== lastWrittenValue) {
          // User already replaced the clipboard — leave their content alone.
          return;
        }
        await Clipboard.setStringAsync('', { sensitive: true });
        lastWrittenValue = null;
        options.onCleared?.();
      } catch {
        // Ignore transient clipboard read/write failures.
      }
    })();
  }, delayMs);
}

/**
 * Copies a non-secret value (e.g. an app package name or a public URL) without
 * scheduling auto-clear. Uses `expo-clipboard` for API parity.
 */
export async function copyPublic(value: string): Promise<void> {
  const trimmed = typeof value === 'string' ? value : '';
  if (!trimmed) return;
  await Clipboard.setStringAsync(trimmed);
}

/**
 * Cancels any pending auto-clear and clears the clipboard immediately (only
 * when the current value still matches what we wrote). Safe to call on logout
 * so a locked vault does not leave secrets one Ctrl+V away.
 */
export async function flushSecureClipboard(): Promise<void> {
  cancelPendingClear();
  try {
    const current = await Clipboard.getStringAsync();
    if (current && current === lastWrittenValue) {
      await Clipboard.setStringAsync('', { sensitive: true });
    }
  } catch {
    /* ignore */
  }
  lastWrittenValue = null;
}

/** Test helper: reset in-memory state (timers, last value). */
export function resetSecureClipboardForTests(): void {
  cancelPendingClear();
  lastWrittenValue = null;
}
