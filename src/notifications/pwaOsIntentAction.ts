/**
 * @fileoverview Pure routing for PWA unlock / action-confirm OS notification taps.
 */

export type PwaOsIntentKind = 'open' | 'deny';

/** Next step after a notification tap for a one-shot PWA prompt. */
export type PwaOsIntentAction = 'begin-auth' | 'deny' | 'ignore' | 'expired';

/**
 * Maps a notification tap to an action against the in-memory prompt.
 *
 * `expired` means the vault locked, the JS process restarted, or the 30s
 * window elapsed — the ECDH grant session cannot be recovered.
 */
export function resolvePwaOsIntentAction(
  kind: PwaOsIntentKind,
  liveRequestId: string | null,
  intentRequestId: string | null
): PwaOsIntentAction {
  if (!liveRequestId) return kind === 'open' ? 'expired' : 'ignore';
  if (intentRequestId && intentRequestId !== liveRequestId) return 'ignore';
  return kind === 'deny' ? 'deny' : 'begin-auth';
}
