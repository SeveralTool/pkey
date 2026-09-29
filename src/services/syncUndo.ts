/**
 * In-memory registry of "undo" tokens for recent sync merges that overwrote
 * user-edited fields (audit finding M2).
 *
 * When `SyncServerCore.mergeCards` detects a conflicted merge it emits the
 * pre-merge snapshot via `onFieldOverwrites`. We stash the snapshot here,
 * hand a short-lived token to the UI snackbar, and expire the entry after
 * {@link SYNC_UNDO_TTL_MS}. If the user taps "Undo" within the window we
 * restore the cards to their pre-merge shape and re-emit them so the merged
 * peers converge on the older values.
 *
 * Design notes:
 *  - Only one undo entry is kept at a time — the most recent merge always
 *    supersedes any pending one. This matches user intuition (only the last
 *    snackbar is visible) and keeps memory bounded.
 *  - Snapshots contain full card payloads (including secret fields) so we
 *    hold them ONLY in memory and clear on logout.
 *  - The registry never persists to disk.
 */
import type { PasswordCard } from '@pkey/core';
import type { SyncPreMergeSnapshot } from './syncServerCore';

export const SYNC_UNDO_TTL_MS = 5 * 60_000;

interface UndoEntry {
  token: string;
  createdAt: number;
  expiresAt: number;
  cardIds: string[];
  snapshot: SyncPreMergeSnapshot;
  overwrittenFieldCount: number;
}

let current: UndoEntry | null = null;
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

const clearTimer = () => {
  if (expiryTimer) {
    clearTimeout(expiryTimer);
    expiryTimer = null;
  }
};

const cryptoRandomToken = (): string => {
  // Non-security-critical identifier — 24 hex chars is more than enough to
  // avoid collisions across the 5-minute window while staying cheap.
  const arr =
    typeof globalThis.crypto?.getRandomValues === 'function'
      ? globalThis.crypto.getRandomValues(new Uint8Array(12))
      : new Uint8Array(12).map(() => Math.floor(Math.random() * 256));
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

/**
 * Records a new undo entry, superseding any previous one, and returns the
 * token the UI must pass back to {@link consumeSyncUndo}.
 */
export function registerSyncUndo(
  snapshot: SyncPreMergeSnapshot,
  overwrittenFieldCount: number,
  now: number = Date.now()
): string {
  clearTimer();
  const token = cryptoRandomToken();
  current = {
    token,
    createdAt: now,
    expiresAt: now + SYNC_UNDO_TTL_MS,
    cardIds: Object.keys(snapshot.cardsById),
    snapshot,
    overwrittenFieldCount,
  };
  expiryTimer = setTimeout(() => {
    current = null;
    expiryTimer = null;
  }, SYNC_UNDO_TTL_MS);
  return token;
}

/**
 * Retrieves and consumes the undo entry for `token`. Returns `null` when
 * the token is unknown, expired, or has already been consumed. Callers get
 * a shallow-cloned map of PasswordCards suitable for splicing back into the
 * live database.
 */
export function consumeSyncUndo(
  token: string,
  now: number = Date.now()
): { cardsById: Record<string, PasswordCard>; capturedAt: string } | null {
  if (!current || current.token !== token) return null;
  if (now > current.expiresAt) {
    current = null;
    clearTimer();
    return null;
  }
  const cardsById = current.snapshot.cardsById as Record<string, PasswordCard>;
  const capturedAt = current.snapshot.capturedAt;
  current = null;
  clearTimer();
  return { cardsById, capturedAt };
}

/** Returns the pending token (for tests) or `null` when nothing is pending. */
export function peekPendingUndoToken(): string | null {
  return current?.token ?? null;
}

/** Clears any pending undo. Call on logout / vault swap. */
export function clearSyncUndo(): void {
  current = null;
  clearTimer();
}

/**
 * Applies an undo snapshot on top of the given card array — replacing the
 * merged version of each snapshotted card with its pre-merge form. Cards
 * that were deleted after the merge (no longer present) are re-added.
 */
export function applySyncUndoToCards(
  liveCards: PasswordCard[],
  snapshotCardsById: Record<string, PasswordCard>
): PasswordCard[] {
  const idsToRestore = new Set(Object.keys(snapshotCardsById));
  const result: PasswordCard[] = [];
  for (const card of liveCards) {
    if (idsToRestore.has(card.id)) {
      result.push(snapshotCardsById[card.id]);
      idsToRestore.delete(card.id);
    } else {
      result.push(card);
    }
  }
  // Any snapshot cards that were deleted post-merge get resurrected.
  for (const id of idsToRestore) {
    result.push(snapshotCardsById[id]);
  }
  return result;
}
