/**
 * @fileoverview In-memory secret store for revealed passwords and OTP secrets.
 *
 * Keeps sensitive fields out of display-oriented card models and supports
 * timed auto-hide after reveal.
 */

import type { PasswordCard } from '../types';

/** Sensitive fields held per card id outside of display models. */
export interface SecretEntry {
  /** Primary password (first `passwordList` entry). */
  password: string;
  /** Space-joined seed / passphrase words. */
  seed: string;
  /** Base32 TOTP secret, if any. */
  otpSecret: string;

}

/**
 * Ephemeral store for card secrets used by UI reveal flows.
 * Does not persist; clear on logout.
 */
export class SecretStore {
  private store = new Map<string, SecretEntry>();
  private revealTimers = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Upserts secrets for a card from its password list and optional OTP secret.
   *
   * @param cardId - Card id key.
   * @param passwordList - Password or seed-phrase words (default empty).
   * @param otpSecret - Base32 OTP secret (default empty).
   */
  set(
    cardId: string,
    passwordList: string[] = [],
    otpSecret = ''
  ): void {
    this.store.set(cardId, {
      password: passwordList[0] ?? '',
      seed: passwordList.join(' '),
      otpSecret: otpSecret ?? '',
    });
  }

  /**
   * Removes secrets and any pending reveal timer for a card.
   *
   * @param cardId - Card id to remove.
   */
  remove(cardId: string): void {
    this.store.delete(cardId);
    this.clearRevealTimer(cardId);
  }

  /** Clears all secrets and cancels all reveal timers. */
  clear(): void {
    this.store.clear();
    this.revealTimers.forEach((t) => clearTimeout(t));
    this.revealTimers.clear();
  }

  /**
   * @param cardId - Card id.
   * @returns Stored password, or empty string if missing.
   */
  getPassword(cardId: string): string {
    return this.store.get(cardId)?.password ?? '';
  }

  /**
   * @param cardId - Card id.
   * @returns Stored seed phrase string, or empty string if missing.
   */
  getSeed(cardId: string): string {
    return this.store.get(cardId)?.seed ?? '';
  }

  /**
   * @param cardId - Card id.
   * @returns Stored OTP secret, or empty string if missing.
   */
  getOtpSecret(cardId: string): string {
    return this.store.get(cardId)?.otpSecret ?? '';
  }

  /**
   * Reconstructs a `passwordList` appropriate for the card type.
   *
   * @param cardId - Card id.
   * @param type - Card type (`PASSWORD` or `SECRET_PHRASE`).
   * @returns Password list suitable for writing back onto a {@link PasswordCard}.
   */
  getPasswordList(cardId: string, type: string): string[] {
    if (type === 'SECRET_PHRASE') {
      const seed = this.getSeed(cardId);
      return seed ? seed.split(/\s+/).filter(Boolean) : [];
    }
    const pass = this.getPassword(cardId);
    return pass ? [pass] : [''];
  }

  /**
   * Replaces the store contents from a full card list (e.g. after unlock/sync).
   *
   * @param cards - Vault cards including secrets.
   */
  syncFromCards(cards: PasswordCard[]): void {
    this.clear();
    for (const c of cards) {
      if (c?.id) this.set(c.id, c.passwordList ?? [], c.otpSecret ?? '');
    }
  }

  /**
   * Returns a copy of `card` with password list and OTP secret filled from the store.
   *
   * @param card - Display or partial card.
   * @returns Card with secrets attached when available.
   */
  cardWithSecrets(card: PasswordCard): PasswordCard {
    if (!card?.id) return card;
    const otpSecret = this.getOtpSecret(card.id);
    return {
      ...card,
      passwordList: this.getPasswordList(card.id, card.type),
      ...(otpSecret ? { otpSecret } : {}),
    };
  }

  /**
   * Cancels a scheduled reveal-hide timer for a card.
   *
   * @param cardId - Card id.
   */
  clearRevealTimer(cardId: string): void {
    const t = this.revealTimers.get(cardId);
    if (t) clearTimeout(t);
    this.revealTimers.delete(cardId);
  }

  /**
   * Schedules `hideFn` after `ms` (default 30s), replacing any prior timer.
   *
   * @param cardId - Card id owning the timer.
   * @param hideFn - Callback to hide the revealed secret.
   * @param ms - Delay in milliseconds (default `30_000`).
   */
  scheduleRevealHide(cardId: string, hideFn: () => void, ms = 30_000): void {
    this.clearRevealTimer(cardId);
    this.revealTimers.set(cardId, setTimeout(hideFn, ms));
  }
}

/**
 * Strips secrets from a card for safe UI display, tagging whether secrets exist.
 *
 * @param c - Full card including secrets.
 * @returns Display card with empty `passwordList`, no `otpSecret`, and `_hasSecret` / `_hasOtp` flags.
 */
export function sanitizeCardForDisplay(
  c: PasswordCard
): PasswordCard & { _hasSecret?: boolean; _hasOtp?: boolean } {
  return {
    ...c,
    passwordList: [],
    otpSecret: undefined,
    _hasSecret: !!(c.passwordList?.length && c.passwordList[0]),
    _hasOtp: !!c.otpSecret?.trim(),
  };
}
