/**
 * @fileoverview Detect a PWA/phone vault generation mismatch and exclusive replace.
 *
 * Incremental sync assumes the same vault (same salt). After a new mobile
 * session the PWA may still hold cards from the previous salt. The chooser
 * keeps one side and replaces the other — it does not merge 300+1.
 *
 * "Decide later" is not a merge: it persists a {@link VaultForkDeferRecord} so
 * a later reconnect cannot LWW-push the outbox just because IndexedDB was
 * rewritten under the phone's salt.
 */

import type { PasswordCard, Tombstone } from '../types';
import type { VaultForkAction } from './protocol';

/** Origin-scoped pause after the user deferred the vault-fork chooser. */
export interface VaultForkDeferRecord {
  /** Salt of the browser vault the user kept locally. */
  previousSalt: string;
  /** Salt of the phone session that triggered the chooser. */
  phoneSalt: string;
}

/**
 * True when the browser already pinned a vault salt, the live challenge uses a
 * different salt, and the PWA still has local cards. A new `deviceId` with the
 * same salt (reinstall + restore) must not trigger this.
 */
export function shouldPauseForVaultFork(input: {
  previousPinnedSalt: string;
  challengeSalt: string;
  localCardCount: number;
  /** Encrypted IndexedDB snapshot from another vault generation (may be locked). */
  hasOfflineVault?: boolean;
}): boolean {
  const previous = input.previousPinnedSalt.trim();
  const next = input.challengeSalt.trim();
  if (!previous || !next || previous === next) return false;
  return input.localCardCount > 0 || input.hasOfflineVault === true;
}

/** Drops malformed defer blobs (missing salts, or both sides the same generation). */
export function parseVaultForkDeferRecord(raw: unknown): VaultForkDeferRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as { previousSalt?: unknown; phoneSalt?: unknown };
  const previousSalt = typeof rec.previousSalt === 'string' ? rec.previousSalt.trim() : '';
  const phoneSalt = typeof rec.phoneSalt === 'string' ? rec.phoneSalt.trim() : '';
  if (!previousSalt || !phoneSalt || previousSalt === phoneSalt) return null;
  return { previousSalt, phoneSalt };
}

/**
 * True when this challenge is still the phone generation the user deferred.
 * If the phone returns to the browser's salt, the pause lifts.
 */
export function shouldKeepDeferredVaultFork(input: {
  deferred: VaultForkDeferRecord | null;
  challengeSalt: string;
}): boolean {
  const deferred = input.deferred;
  const challenge = input.challengeSalt.trim();
  if (!deferred || !challenge) return false;
  if (challenge === deferred.previousSalt) return false;
  return challenge === deferred.phoneSalt;
}

/**
 * Combined pause used at `auth_ok`: live salt mismatch, or a deferred chooser
 * for this phone salt (even if `pinnedSalt` was overwritten by a bad persist).
 */
export function shouldBlockIncrementalSync(input: {
  previousPinnedSalt: string;
  challengeSalt: string;
  localCardCount: number;
  hasOfflineVault?: boolean;
  deferred: VaultForkDeferRecord | null;
}): boolean {
  if (shouldPauseForVaultFork(input)) return true;
  return shouldKeepDeferredVaultFork({
    deferred: input.deferred,
    challengeSalt: input.challengeSalt,
  });
}

/**
 * Builds the exclusive-replace result: incoming cards become the vault, and
 * every local id missing from incoming is tombstoned.
 */
export function replaceVaultCards(
  localCards: readonly PasswordCard[],
  incomingCards: readonly PasswordCard[],
  nowIso: string
): { cards: PasswordCard[]; extraTombstones: Tombstone[] } {
  const incomingIds = new Set(incomingCards.map((card) => card.id).filter(Boolean));
  const extraTombstones: Tombstone[] = [];
  for (const card of localCards) {
    if (!card.id || incomingIds.has(card.id)) continue;
    extraTombstones.push({ id: card.id, deletedAt: nowIso });
  }
  return { cards: [...incomingCards], extraTombstones };
}

function asRecord(msg: unknown): Record<string, unknown> | null {
  if (!msg || typeof msg !== 'object') return null;
  return msg as Record<string, unknown>;
}

/** Parses a decrypted `vault_fork` inner. Invalid counts collapse to `0`. */
export function parseVaultForkInner(inner: unknown): {
  pwaCardCount: number;
  encryptedOnly: boolean;
} | null {
  const rec = asRecord(inner);
  if (!rec) return null;
  const raw = rec.pwaCardCount;
  const pwaCardCount =
    typeof raw === 'number' && Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 0;
  return { pwaCardCount, encryptedOnly: rec.encryptedOnly === true };
}

/** Parses a decrypted `vault_fork_decision` inner. */
export function parseVaultForkDecisionInner(inner: unknown): VaultForkAction | null {
  const rec = asRecord(inner);
  if (!rec) return null;
  const action = rec.action;
  if (action === 'use_pwa' || action === 'use_phone' || action === 'defer') return action;
  return null;
}
