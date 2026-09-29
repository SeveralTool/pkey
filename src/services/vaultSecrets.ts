/**
 * @fileoverview Mobile SecretStore holder (audit M1).
 *
 * Display models in React state must not retain passwordList / otpSecret.
 * Disk writes, autofill, stats, and reveal UI rehydrate from this module.
 */
import { SecretStore, sanitizeCardForDisplay, type EncryptedDatabase, type PasswordCard } from '@pkey/core';

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
  const merged = (newDb.cards ?? []).map((c) => {
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
  const ui: EncryptedDatabase = {
    ...disk,
    cards: merged.map((c) => sanitizeCardForDisplay(c)),
  };
  return { ui, disk };
}

/** Drops all in-memory card secrets (logout / lock). */
export function clearVaultSecrets(): void {
  store.clear();
}
