/**
 * Delta computation for efficient multi-device sync.
 *
 * Protocol version policy: bump {@link SYNC_PROTOCOL_VERSION} when
 * {@link fingerprintCard} fields change incompatibly. Optional new card fields
 * are safe within the same version; removals or semantic changes require a bump.
 */
import { sha256 } from '../crypto/index';
import { normalizeTags } from '../util/normalizeTags';
import type {
  PasswordCard,
  SyncIndex,
  SyncDelta,
  CardFingerprint,
  EncryptedDatabase,
} from '../types/index';
import { SYNC_PROTOCOL_VERSION } from '../types/index';
import { canonicalizeVaultSettings } from '../vault/settings';

/** Fields included in the fingerprint payload (stable JSON ordering). */
function cardFingerprintPayload(card: PasswordCard): Record<string, unknown> {
  return {
    id: card.id,
    type: card.type,
    title: card.title,
    icon: card.icon,
    username: card.username,
    passwordList: card.passwordList,
    link: card.link,
    uris: [...(card.uris ?? [])]
      .map((u) => u.trim())
      .filter(Boolean)
      .sort(),
    notes: card.notes,
    creationDate: card.creation_date,
    otpSecret: card.otpSecret ?? '',
    otpAlgorithm: card.otpAlgorithm ?? 'SHA1',
    otpDigits: card.otpDigits ?? 6,
    otpPeriod: card.otpPeriod ?? 30,
    tags: normalizeTags(card.tags),
    hibp: card.hibp ?? null,
    hibpAuthorized: card.hibpAuthorized ?? false,
  };
}

/**
 * Stable fingerprint of a single card. Any meaningful change produces a different hash.
 *
 * @param card - Card to fingerprint.
 * @returns Id, content hash, and `lastUpdate` timestamp.
 */
export function fingerprintCard(card: PasswordCard): CardFingerprint {
  const payload = JSON.stringify(cardFingerprintPayload(card));
  return {
    id: card.id,
    hash: sha256(payload),
    lastUpdate: card.last_update,
  };
}

/**
 * Builds the compact sync index for a database.
 *
 * @param db - Encrypted vault database snapshot.
 * @returns Index of card fingerprints and tombstones.
 */
export function buildSyncIndex(db: EncryptedDatabase): SyncIndex {
  const cards: Record<string, CardFingerprint> = {};
  for (const card of db.cards || []) {
    if (!card?.id) continue;
    cards[card.id] = fingerprintCard(card);
  }
  return {
    cards,
    tombstones: db.tombstones || [],
    protocolVersion: db.syncProtocolVersion ?? SYNC_PROTOCOL_VERSION,
  };
}

const toMillis = (iso?: string): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

/**
 * Computes which cards this device should push so the remote peer converges.
 *
 * @param localDb - Local vault snapshot.
 * @param remoteIndex - Peer's compact sync index.
 * @returns Upserts, deletions, and local tombstones to send.
 */
export function computeOutgoingDelta(
  localDb: EncryptedDatabase,
  remoteIndex: SyncIndex
): SyncDelta {
  const upserts: PasswordCard[] = [];
  const localCards = localDb.cards || [];
  const localTombstones = localDb.tombstones || [];

  const remoteTombstoneById = new Map((remoteIndex.tombstones || []).map((t) => [t.id, t]));

  for (const card of localCards) {
    if (!card?.id) continue;
    const remoteFp = remoteIndex.cards[card.id];
    const localFp = fingerprintCard(card);

    if (!remoteFp) {
      const remoteTs = remoteTombstoneById.get(card.id);
      if (!remoteTs || toMillis(card.last_update) > toMillis(remoteTs.deletedAt)) {
        upserts.push(card);
      }
      continue;
    }

    if (
      remoteFp.hash !== localFp.hash &&
      toMillis(card.last_update) >= toMillis(remoteFp.lastUpdate)
    ) {
      upserts.push(card);
    }
  }

  const deletions: string[] = [];
  for (const ts of localTombstones) {
    const remoteFp = remoteIndex.cards[ts.id];
    if (remoteFp && toMillis(ts.deletedAt) >= toMillis(remoteFp.lastUpdate)) {
      deletions.push(ts.id);
    }
  }

  return { upserts, deletions, tombstones: localTombstones };
}

/**
 * SHA-256 of serialized index — cheap "are we in sync?" check.
 *
 * @param db - Encrypted vault database snapshot.
 * @returns Hex hash of sorted card fingerprints and tombstones.
 */
export function computeDbVersionHash(db: EncryptedDatabase): string {
  const index = buildSyncIndex(db);
  const sortedCardHashes = Object.values(index.cards)
    .map((f) => `${f.id}:${f.hash}`)
    .sort()
    .join('|');
  const sortedTombstones = (index.tombstones || [])
    .map((t) => `${t.id}:${t.deletedAt}`)
    .sort()
    .join('|');
  return sha256(`${sortedCardHashes}#${sortedTombstones}`);
}

/**
 * True when cards, tombstones, or settings differ. Ignores vault `last_update`
 * so an empty pull cannot look like a write.
 *
 * Fail-closed: if canonicalization throws, treat the vault as changed.
 *
 * @param prev - Current master snapshot.
 * @param next - Merged snapshot (settings already stripped/merged).
 */
export function vaultContentChanged(prev: EncryptedDatabase, next: EncryptedDatabase): boolean {
  if (computeDbVersionHash(prev) !== computeDbVersionHash(next)) return true;
  try {
    return canonicalizeVaultSettings(prev.settings) !== canonicalizeVaultSettings(next.settings);
  } catch {
    return true;
  }
}
