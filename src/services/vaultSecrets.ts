/**
 * @fileoverview Mobile SecretStore holder (audit M1).
 *
 * Display models in React state must not retain passwordList / otpSecret.
 * Disk writes, autofill, stats, and reveal UI rehydrate from this module.
 */
import {
  SecretStore,
  sanitizeCardForDisplay,
  type EncryptedDatabase,
  type PasswordCard,
} from '@pkey/core';

type DisplayFlags = { _hasSecret?: boolean; _hasOtp?: boolean };

function isDisplayCard(card: PasswordCard): boolean {
  const hasPassword = (card.passwordList ?? []).some((password) => (password ?? '').length > 0);
  return !hasPassword && !(card.otpSecret ?? '').trim();
}

function sameDisplayFlags(incoming: PasswordCard, sanitized: PasswordCard): boolean {
  const left = incoming as PasswordCard & DisplayFlags;
  const right = sanitized as PasswordCard & DisplayFlags;
  return (
    Boolean(left._hasSecret) === Boolean(right._hasSecret) &&
    Boolean(left._hasOtp) === Boolean(right._hasOtp)
  );
}

const store = new SecretStore();

/** Process-wide secret store for the unlocked mobile session. */
export function getVaultSecretStore(): SecretStore {
  return store;
}

/**
 * Copies secrets out of `db.cards` into the store and returns a display-safe
 * database (empty password lists, no otpSecret).
 */
export function hydrateVaultSecrets(db: EncryptedDatabase): EncryptedDatabase {
  store.syncFromCards(db.cards ?? []);
  return {
    ...db,
    cards: (db.cards ?? []).map((c) => sanitizeCardForDisplay(c)),
  };
}

/** Rebuilds cards with secrets for disk / sync / autofill. */
export function attachVaultSecrets(db: EncryptedDatabase): EncryptedDatabase {
  return {
    ...db,
    cards: (db.cards ?? []).map((c) => store.cardWithSecrets(c)),
  };
}

/** Cards with secrets attached (analysis, filters, HIBP). */
export function cardsWithVaultSecrets(cards: readonly PasswordCard[]): PasswordCard[] {
  return cards.map((c) => store.cardWithSecrets(c));
}

/**
 * Merges an incoming vault (cards may or may not include secrets) with the
 * in-memory store. Returns `{ ui, disk }` so React never holds plaintext
 * while disk/autofill still persist it.
 */
export function commitVault(newDb: EncryptedDatabase): {
  ui: EncryptedDatabase;
  disk: EncryptedDatabase;
} {
  const incomingCards = newDb.cards ?? [];
  const merged = incomingCards.map((c) => {
    const incomingHasSecret =
      (c.passwordList ?? []).some((p) => (p ?? '').length > 0) || !!(c.otpSecret ?? '').trim();
    if (incomingHasSecret || !c.id) {
      store.set(c.id, c.passwordList ?? [], c.otpSecret ?? '');
      return { ...c, passwordList: c.passwordList ?? [''], otpSecret: c.otpSecret ?? '' };
    }
    return store.cardWithSecrets(c);
  });
  const disk: EncryptedDatabase = { ...newDb, cards: merged };
  store.syncFromCards(merged);
  const uiCards = merged.map((full, index) => {
    const sanitized = sanitizeCardForDisplay(full);
    const incoming = incomingCards[index];
    if (incoming && isDisplayCard(incoming) && sameDisplayFlags(incoming, sanitized)) {
      return incoming;
    }
    return sanitized;
  });
  const ui: EncryptedDatabase = {
    ...disk,
    cards: uiCards,
  };
  return { ui, disk };
}

export type HydratedCardCache = Map<string, { display: PasswordCard; secret: PasswordCard }>;

/**
 * Rebuilds secret cards for the list, reusing the previous object when the
 * display card reference did not change.
 */
export function reuseHydratedCards(
  displayCards: readonly PasswordCard[],
  cache: HydratedCardCache
): { cards: PasswordCard[]; cache: HydratedCardCache } {
  const next: HydratedCardCache = new Map();
  const cards = displayCards.map((card) => {
    const hit = card.id ? cache.get(card.id) : undefined;
    if (hit && hit.display === card) {
      next.set(card.id, hit);
      return hit.secret;
    }
    const secret = store.cardWithSecrets(card);
    if (card.id) next.set(card.id, { display: card, secret });
    return secret;
  });
  return { cards, cache: next };
}

/** Drops all in-memory card secrets (logout / lock). */
export function clearVaultSecrets(): void {
  store.clear();
}
