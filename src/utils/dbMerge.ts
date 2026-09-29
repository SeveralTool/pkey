/**
 * @fileoverview Conflict-free merge logic — core algorithms from @pkey/core.
 */
import { EncryptedDatabase } from '../types';
export {
  mergeTombstones,
  mergeCards,
  mergeCardFields,
  type CardMergeResult,
  type CardFieldOverwrite,
} from '@pkey/core';

import { mergeTombstones, mergeCards } from '@pkey/core';

const toMillis = (iso?: string): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/** Merges two vault snapshots with last-write-wins card/tombstone rules. */
export const mergeDatabases = (
  local: EncryptedDatabase,
  remote: EncryptedDatabase
): EncryptedDatabase => {
  const { cards, tombstones } = mergeCards(
    local.cards || [],
    remote.cards || [],
    local.tombstones || [],
    remote.tombstones || []
  );

  const lastUpdate =
    toMillis(remote.last_update) > toMillis(local.last_update)
      ? remote.last_update
      : local.last_update;

  return {
    ...local,
    cards,
    tombstones,
    last_update: lastUpdate,
  };
};

/** Removes one card and records a tombstone for sync propagation. */
export const applyDeletion = (
  db: EncryptedDatabase,
  cardId: string,
  deletedAt: string = new Date().toISOString()
): EncryptedDatabase => {
  const cards = (db.cards || []).filter((c) => c.id !== cardId);
  const tombstones = mergeTombstones(db.tombstones || [], [{ id: cardId, deletedAt }]);
  return { ...db, cards, tombstones, last_update: deletedAt };
};

/** Removes every card and records tombstones so deletions propagate on sync. */
export const applyDeleteAllCards = (
  db: EncryptedDatabase,
  deletedAt: string = new Date().toISOString()
): EncryptedDatabase => {
  const cards = db.cards || [];
  if (cards.length === 0) return db;
  const newTombstones = cards.map((c) => ({ id: c.id, deletedAt }));
  const tombstones = mergeTombstones(db.tombstones || [], newTombstones);
  return { ...db, cards: [], tombstones, last_update: deletedAt };
};
