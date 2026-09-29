/**
 * @fileoverview Last-write-wins merge helpers for cards and tombstones.
 *
 * Same-id cards are merged field-aware: non-empty values from the older side
 * fill empty fields on the newer side; when both sides have different non-empty
 * values for a field, the newer side wins and the field is listed in
 * `overwrites` so UIs can warn the user.
 */

import type { CardIcon, PasswordCard, Tombstone } from '../types';
import { canChangeCardType } from '../vault/card-rules';
import { clampUris } from '../links';
import { normalizeTags } from '../util/normalizeTags';

const toMillis = (iso?: string): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

const strEq = (a: string | undefined, b: string | undefined): boolean =>
  (a ?? '') === (b ?? '');

const isEmptyStr = (v: string | undefined): boolean => !v || !String(v).trim();

const passwordKey = (list: string[] | undefined): string =>
  Array.isArray(list) ? list.join('\u0000') : '';

const tagsKey = (tags: string[] | undefined): string => normalizeTags(tags).join('\u0000');

const iconKey = (icon: CardIcon | undefined): string => {
  if (!icon) return '';
  if (icon.type === 'image') return `image:${icon.uri ?? ''}`;
  return `icon:${icon.value ?? ''}`;
};

/** Per-card field overwrite notice after a conflicted merge. */
export interface CardFieldOverwrite {
  id: string;
  title: string;
  fields: string[];
}

/**
 * Merges two versions of the same card by field.
 *
 * @returns Merged card plus field names where both sides had different non-empty values.
 */
export const mergeCardFields = (
  a: PasswordCard,
  b: PasswordCard
): { card: PasswordCard; overwrittenFields: string[] } => {
  // Strict `>` so equal timestamps prefer `b` (incoming). mergeCards applies
  // locals then remotes — ties must accept the peer upsert (PWA→mobile).
  const aNewer = toMillis(a.last_update) > toMillis(b.last_update);
  const newer = aNewer ? a : b;
  const older = aNewer ? b : a;
  const overwrittenFields: string[] = [];
  const tied = toMillis(a.last_update) === toMillis(b.last_update);

  const pickStr = (
    field: string,
    nVal: string | undefined,
    oVal: string | undefined
  ): string => {
    const nEmpty = isEmptyStr(nVal);
    const oEmpty = isEmptyStr(oVal);
    if (strEq(nVal, oVal)) return nVal ?? '';
    if (nEmpty && !oEmpty) return oVal ?? '';
    if (!nEmpty && oEmpty) return nVal ?? '';
    // Distinct non-empty values: LWW is not a conflict unless timestamps tie.
    if (tied) overwrittenFields.push(field);
    return nVal ?? '';
  };

  const title = pickStr('title', newer.title, older.title);
  const username = pickStr('username', newer.username, older.username);
  const link = pickStr('link', newer.link, older.link);

  const uris = clampUris(
    [...(newer.uris ?? []), ...(older.uris ?? []), older.link, newer.link].filter(
      (u) => u && u !== link
    )
  );
  const notes = pickStr('notes', newer.notes, older.notes);

  let passwordList = newer.passwordList ?? [];
  const nPw = passwordKey(newer.passwordList);
  const oPw = passwordKey(older.passwordList);
  if (nPw !== oPw) {
    if (!nPw && oPw) passwordList = older.passwordList ?? [];
    else if (nPw && oPw) {
      if (tied) overwrittenFields.push('password');
      passwordList = newer.passwordList ?? [];
    }
  }

  let otpSecret = newer.otpSecret;
  const nOtp = newer.otpSecret ?? '';
  const oOtp = older.otpSecret ?? '';
  if (nOtp !== oOtp) {
    if (!nOtp && oOtp) otpSecret = older.otpSecret;
    else if (nOtp && oOtp) {
      if (tied) overwrittenFields.push('otpSecret');
      otpSecret = newer.otpSecret;
    }
  }

  let tags = normalizeTags(newer.tags);
  const nTags = tagsKey(newer.tags);
  const oTags = tagsKey(older.tags);
  if (nTags !== oTags) {
    if (!nTags && oTags) tags = normalizeTags(older.tags);
    else if (nTags && oTags) {
      // Union additive tag edits. Not an overwrite: nothing is discarded.
      tags = normalizeTags([...(newer.tags ?? []), ...(older.tags ?? [])]);
    }
  }

  let icon = newer.icon;
  if (iconKey(newer.icon) !== iconKey(older.icon)) {
    if (!iconKey(newer.icon) && iconKey(older.icon)) icon = older.icon;
    else if (iconKey(newer.icon) && iconKey(older.icon)) {
      if (tied) overwrittenFields.push('icon');
      icon = newer.icon;
    }
  }

  let type = newer.type || older.type;
  let otpAlgorithm = newer.otpAlgorithm ?? older.otpAlgorithm;
  let otpDigits = newer.otpDigits ?? older.otpDigits;
  let otpPeriod = newer.otpPeriod ?? older.otpPeriod;
  let hibp = newer.hibp;
  let hibpAuthorized = newer.hibpAuthorized;

  // A card with a type-lock payload (password, seed words, OTP, note body)
  // cannot change type. Keep that side's type and secrets even when the peer
  // upsert is newer.
  const locked = !canChangeCardType(older) ? older : !canChangeCardType(newer) ? newer : null;
  if (locked && type !== locked.type) {
    type = locked.type;
    passwordList = locked.passwordList ?? [];
    otpSecret = locked.otpSecret;
    otpAlgorithm = locked.otpAlgorithm;
    otpDigits = locked.otpDigits;
    otpPeriod = locked.otpPeriod;
    hibp = locked.hibp;
    hibpAuthorized = locked.hibpAuthorized;
  }

  const creation_date =
    toMillis(older.creation_date) > 0 &&
    (toMillis(newer.creation_date) === 0 ||
      toMillis(older.creation_date) < toMillis(newer.creation_date))
      ? older.creation_date
      : newer.creation_date;

  const last_update =
    toMillis(a.last_update) > toMillis(b.last_update) ? a.last_update : b.last_update;

  return {
    card: {
      ...newer,
      id: newer.id || older.id,
      type,
      title,
      icon,
      username,
      passwordList,
      link,
      uris,
      notes,
      creation_date,
      last_update,
      otpSecret,
      otpAlgorithm,
      otpDigits,
      otpPeriod,
      tags,
      hibp,
      hibpAuthorized,
    },
    overwrittenFields: [...new Set(overwrittenFields)],
  };
};

/**
 * Merges two tombstone lists, keeping the latest `deletedAt` per id.
 *
 * @param a - First tombstone list.
 * @param b - Second tombstone list.
 * @returns Deduplicated tombstones.
 */
export const mergeTombstones = (a: Tombstone[] = [], b: Tombstone[] = []): Tombstone[] => {
  const byId = new Map<string, Tombstone>();
  for (const ts of [...a, ...b]) {
    if (!ts?.id) continue;
    const existing = byId.get(ts.id);
    if (!existing || toMillis(ts.deletedAt) > toMillis(existing.deletedAt)) {
      byId.set(ts.id, ts);
    }
  }
  return Array.from(byId.values());
};

const isCardAlive = (card: PasswordCard, tombstone?: Tombstone): boolean => {
  if (!tombstone) return true;
  return toMillis(card.last_update) > toMillis(tombstone.deletedAt);
};

/** Result of a full local/remote card merge. */
export interface CardMergeResult {
  cards: PasswordCard[];
  tombstones: Tombstone[];
  /** Cards where both peers had conflicting non-empty field values. */
  overwrites: CardFieldOverwrite[];
}

/**
 * Merges local and remote cards with tombstones using field-aware last-write-wins
 * on `last_update` / `deletedAt`. Cards newer than their tombstone are resurrected.
 *
 * @param localCards - Cards on this device.
 * @param remoteCards - Cards from the peer.
 * @param localTombstones - Local deletion markers.
 * @param remoteTombstones - Remote deletion markers.
 * @returns Merged cards (newest first), pruned tombstones, and overwrite notices.
 */
export const mergeCards = (
  localCards: PasswordCard[],
  remoteCards: PasswordCard[],
  localTombstones: Tombstone[] = [],
  remoteTombstones: Tombstone[] = []
): CardMergeResult => {
  const tombstones = mergeTombstones(localTombstones, remoteTombstones);
  const tombstoneById = new Map(tombstones.map((t) => [t.id, t]));
  const winners = new Map<string, PasswordCard>();
  const overwrites: CardFieldOverwrite[] = [];

  for (const card of [...localCards, ...remoteCards]) {
    if (!card?.id) continue;
    const current = winners.get(card.id);
    if (!current) {
      winners.set(card.id, card);
      continue;
    }
    const { card: merged, overwrittenFields } = mergeCardFields(current, card);
    winners.set(card.id, merged);
    if (overwrittenFields.length) {
      overwrites.push({
        id: merged.id,
        title: merged.title || merged.id,
        fields: overwrittenFields,
      });
    }
  }

  const cards: PasswordCard[] = [];
  const resurrectedIds = new Set<string>();

  for (const card of winners.values()) {
    const tombstone = tombstoneById.get(card.id);
    if (isCardAlive(card, tombstone)) {
      cards.push(card);
      if (tombstone) resurrectedIds.add(card.id);
    }
  }

  const prunedTombstones = tombstones.filter((t) => !resurrectedIds.has(t.id));
  cards.sort((x, y) => toMillis(y.last_update) - toMillis(x.last_update));

  return { cards, tombstones: prunedTombstones, overwrites };
};

/**
 * Applies a sync pull to local cards without a full bidirectional merge.
 * Upserts are field-merged with local cards; deletions and tombstones remove cards.
 *
 * @param localCards - Current local cards.
 * @param pull - Incoming pull fields (`upserts`, `deletions`, `tombstones`).
 * @returns Updated local card list and any field overwrite notices.
 */
export const mergePullLocally = (
  localCards: PasswordCard[],
  pull: {
    upserts?: PasswordCard[];
    deletions?: string[];
    tombstones?: Tombstone[];
  }
): { cards: PasswordCard[]; overwrites: CardFieldOverwrite[] } => {
  const byId: Record<string, PasswordCard> = {};
  for (const card of localCards) {
    if (card?.id) byId[card.id] = card;
  }
  const overwrites: CardFieldOverwrite[] = [];

  for (const remote of pull.upserts ?? []) {
    if (!remote?.id) continue;
    const local = byId[remote.id];
    if (!local) {
      byId[remote.id] = remote;
    } else {
      // Prefer local on equal timestamps so a just-saved edit is not reverted
      // by a pull echo of a stale peer copy (mergeCardFields ties prefer `b`).
      const localWinsTie =
        toMillis(local.last_update) >= toMillis(remote.last_update);
      const { card: merged, overwrittenFields } = localWinsTie
        ? mergeCardFields(remote, local)
        : mergeCardFields(local, remote);
      byId[remote.id] = merged;
      if (overwrittenFields.length) {
        overwrites.push({
          id: merged.id,
          title: merged.title || merged.id,
          fields: overwrittenFields,
        });
      }
    }
  }

  for (const id of pull.deletions ?? []) {
    delete byId[id];
  }

  for (const ts of pull.tombstones ?? []) {
    if (!ts?.id) continue;
    const card = byId[ts.id];
    if (!card) continue;
    if (toMillis(ts.deletedAt) >= toMillis(card.last_update)) {
      delete byId[ts.id];
    }
  }

  return { cards: Object.values(byId), overwrites };
};
