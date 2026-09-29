/**
 * @fileoverview Shared card-type rules used by the master app, PWA, and sync merge.
 */

import type { PasswordCard } from '../types/index';

/** Minimal card shape needed to evaluate type-change eligibility. */
export type CardTypeLockInput = Pick<PasswordCard, 'type' | 'passwordList'> &
  Partial<Pick<PasswordCard, 'otpSecret' | 'notes' | 'creation_date' | 'last_update'>> & {
    _hasSecret?: boolean;
    _hasOtp?: boolean;
  };

function hasTypeLockPayload(card: CardTypeLockInput): boolean {
  if (card._hasSecret === true || card._hasOtp === true) return true;
  if ((card.otpSecret ?? '').trim().length > 0) return true;
  if ((card.passwordList ?? []).some((word) => (word ?? '').trim().length > 0)) return true;
  if (card.type === 'NOTE' && (card.notes ?? '').trim().length > 0) return true;
  return false;
}

/**
 * True when the card's type may still be changed from this snapshot's *contents*.
 * Any saved secret (password, seed words, OTP) or note body freezes the type.
 * Create-drafts with empty payload remain changeable (mobile persists an empty
 * PASSWORD row before the user picks seed/note).
 *
 * @param card - Card (or partial) to evaluate.
 */
export function canChangeCardType(card: CardTypeLockInput): boolean {
  return !hasTypeLockPayload(card);
}

/**
 * True when a **persisted** snapshot must keep its type.
 * Combines {@link canChangeCardType} with “already saved from the editor”:
 * `handleCreateNewCard` writes `creation_date === last_update`; the first
 * editor save (or any later write) splits those timestamps and freezes type.
 *
 * Evaluate this on the last disk snapshot, not the dirty in-memory card.
 *
 * @param persisted - Last written card, or the current card when no snapshot exists.
 */
export function isPersistedCardTypeFrozen(persisted: CardTypeLockInput): boolean {
  if (!canChangeCardType(persisted)) return true;
  const created = persisted.creation_date ?? '';
  const updated = persisted.last_update ?? '';
  return Boolean(created) && Boolean(updated) && created !== updated;
}

/** Fields rewritten when converting a card from one type to another. */
export interface CardTypeChangeResult {
  type: PasswordCard['type'];
  passwordList: string[];
  otpSecret: string;
}

/**
 * Applies type-change side effects, or returns `null` when the payload forbids it.
 *
 * - PASSWORD: keep the first value, drop extra seed words.
 * - SECRET_PHRASE: reset the list to `['']` if it already had content.
 * - NOTE: clear `passwordList` and `otpSecret`.
 *
 * Callers that have a disk snapshot must also refuse when
 * {@link isPersistedCardTypeFrozen} is true for that snapshot.
 *
 * @param card - Current type and secret fields.
 * @param nextType - Requested type.
 */
export function applyCardTypeChange(
  card: Pick<PasswordCard, 'type' | 'passwordList' | 'otpSecret'>,
  nextType: PasswordCard['type']
): CardTypeChangeResult | null {
  if (nextType === card.type) {
    return {
      type: card.type,
      passwordList: Array.isArray(card.passwordList) ? [...card.passwordList] : [''],
      otpSecret: card.otpSecret ?? '',
    };
  }
  if (!canChangeCardType(card)) return null;

  if (nextType === 'PASSWORD') {
    return {
      type: 'PASSWORD',
      passwordList: [card.passwordList[0] || ''],
      otpSecret: card.otpSecret ?? '',
    };
  }
  if (nextType === 'SECRET_PHRASE') {
    const reset = card.passwordList.length === 0 || (card.passwordList[0]?.length ?? 0) > 0;
    return {
      type: 'SECRET_PHRASE',
      passwordList: reset ? [''] : [...card.passwordList],
      otpSecret: card.otpSecret ?? '',
    };
  }
  return { type: 'NOTE', passwordList: [''], otpSecret: '' };
}
