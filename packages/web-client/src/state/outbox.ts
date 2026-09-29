/**
 * @fileoverview Offline outbox: pending vault operations queued while the
 * master device is unreachable, flushed as a single sync_push on reconnect.
 *
 * Pure and immutable so it can be unit-tested and serialized into the
 * encrypted offline vault blob.
 */
import type { PasswordCard, Tombstone, AppSettings } from '@pkey/core';

/** Pending offline operations, coalesced per card id. */
export interface OutboxState {
  /** Latest full card (with secrets) per created/edited id. */
  upserts: Record<string, PasswordCard>;
  /** Deletion markers per deleted id. */
  tombstones: Record<string, Tombstone>;
  /** Latest settings snapshot changed offline, or null when untouched. */
  settings: AppSettings | null;
}

/** Returns a fresh empty outbox. */
export function emptyOutbox(): OutboxState {
  return { upserts: {}, tombstones: {}, settings: null };
}

/**
 * Queues a card upsert. A pending tombstone for the same id is dropped —
 * the card exists again locally, so the newer edit must win on the server.
 *
 * Last write wins: the full `card` replaces any prior queued upsert (do not
 * field-merge — equal timestamps would otherwise keep the stale title).
 */
export function withUpsert(outbox: OutboxState, card: PasswordCard): OutboxState {
  if (!card?.id) return outbox;
  const tombstones = { ...outbox.tombstones };
  delete tombstones[card.id];
  return {
    ...outbox,
    upserts: { ...outbox.upserts, [card.id]: card },
    tombstones,
  };
}

/**
 * Queues a card deletion as a tombstone. A pending upsert for the same id is
 * dropped (creating + deleting offline should push nothing but the tombstone).
 */
export function withTombstone(outbox: OutboxState, id: string, deletedAt: string): OutboxState {
  if (!id) return outbox;
  const upserts = { ...outbox.upserts };
  delete upserts[id];
  return {
    ...outbox,
    upserts,
    tombstones: { ...outbox.tombstones, [id]: { id, deletedAt } },
  };
}

/** Records the latest offline settings snapshot (last write wins). */
export function withSettings(outbox: OutboxState, settings: AppSettings): OutboxState {
  return { ...outbox, settings: { ...settings } };
}

/** Number of pending card operations (settings changes count as one). */
export function outboxCount(outbox: OutboxState): number {
  return (
    Object.keys(outbox.upserts).length +
    Object.keys(outbox.tombstones).length +
    (outbox.settings ? 1 : 0)
  );
}

/** True when there is nothing to flush. */
export function isOutboxEmpty(outbox: OutboxState): boolean {
  return outboxCount(outbox) === 0;
}

/**
 * Restores an outbox from a persisted (possibly hostile/corrupt) value.
 * Unknown shapes degrade to an empty outbox rather than throwing.
 */
export function normalizeOutbox(raw: unknown): OutboxState {
  const out = emptyOutbox();
  if (!raw || typeof raw !== 'object') return out;
  const candidate = raw as Partial<OutboxState>;
  if (candidate.upserts && typeof candidate.upserts === 'object') {
    for (const [id, card] of Object.entries(candidate.upserts)) {
      if (card && typeof card === 'object' && (card as PasswordCard).id === id) {
        out.upserts[id] = card as PasswordCard;
      }
    }
  }
  if (candidate.tombstones && typeof candidate.tombstones === 'object') {
    for (const [id, ts] of Object.entries(candidate.tombstones)) {
      const tomb = ts as Tombstone;
      if (tomb && typeof tomb === 'object' && tomb.id === id && typeof tomb.deletedAt === 'string') {
        out.tombstones[id] = { id: tomb.id, deletedAt: tomb.deletedAt };
      }
    }
  }
  if (candidate.settings && typeof candidate.settings === 'object') {
    out.settings = candidate.settings as AppSettings;
  }
  return out;
}
