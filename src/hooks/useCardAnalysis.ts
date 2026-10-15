/**
 * @fileoverview Custom hook for assessing password strength and duplicate tracking.
 */
import { useCallback } from 'react';
import { canChangeCardType as cardTypeChangeAllowed } from '@pkey/core';
import { getZxcvbn } from '../utils/lazyZxcvbn';
import { PasswordCard } from '../types';
import type { LocaleStrings } from '../constants/localization';
import type { ThemeColors } from '../styles/colors';

export type DuplicateIndex = Map<string, string[]>;

export interface CardAnalysisOptions {
  cards?: readonly PasswordCard[];
  usernameIndex?: DuplicateIndex;
  passwordIndex?: DuplicateIndex;
}

function isDuplicateInIndex(
  index: DuplicateIndex | undefined,
  key: string,
  currentCardId: string,
  cards: readonly PasswordCard[] | undefined,
  fallback: (value: string, id: string) => boolean,
  value: string
): boolean {
  if (index && key) {
    const ids = index.get(key) ?? [];
    return ids.some((id) => id !== currentCardId);
  }
  if (cards) return fallback(value, currentCardId);
  return false;
}

export type CardAnalysisCopy = Pick<
  LocaleStrings,
  'tag_very_weak' | 'tag_weak' | 'tag_secure' | 'tag_strong'
>;
export type CardAnalysisColors = Pick<ThemeColors, 'danger' | 'warning' | 'success'>;

/** `Array.isArray` does not narrow `readonly T[]` out of a union, so guard explicitly. */
function isCardsArray(
  value: readonly PasswordCard[] | CardAnalysisOptions
): value is readonly PasswordCard[] {
  return Array.isArray(value);
}

/**
 * Hook that provides utilities for checking repeated passwords, repeated usernames,
 * and evaluating password entropy strength.
 */
export const useCardAnalysis = (
  cardsOrOptions: readonly PasswordCard[] | CardAnalysisOptions,
  t: CardAnalysisCopy,
  c: CardAnalysisColors
) => {
  const options: CardAnalysisOptions = isCardsArray(cardsOrOptions)
    ? { cards: cardsOrOptions }
    : cardsOrOptions;
  const { cards, usernameIndex, passwordIndex } = options;

  const isUsernameRepeated = useCallback(
    (username: string, currentCardId: string): boolean => {
      if (!username.trim()) return false;
      const key = username.toLowerCase();
      return isDuplicateInIndex(
        usernameIndex,
        key,
        currentCardId,
        cards,
        (u, id) =>
          cards!.some((card) => card.id !== id && card.username.toLowerCase() === u.toLowerCase()),
        username
      );
    },
    [cards, usernameIndex]
  );

  const isPasswordRepeated = useCallback(
    (password: string, currentCardId: string): boolean => {
      if (!password.trim()) return false;
      return isDuplicateInIndex(
        passwordIndex,
        password,
        currentCardId,
        cards,
        (p, id) => cards!.some((card) => card.id !== id && card.passwordList[0] === p),
        password
      );
    },
    [cards, passwordIndex]
  );

  const canChangeCardType = useCallback(
    (card: PasswordCard): boolean => cardTypeChangeAllowed(card),
    []
  );

  const getPasswordStrength = useCallback(
    (password: string): { label: string; color: string } => {
      if (!password) return { label: t.tag_very_weak, color: c.danger };
      if (password.length < 6) return { label: t.tag_very_weak, color: c.danger };

      const { score } = getZxcvbn()(password);

      if (score <= 0) return { label: t.tag_very_weak, color: c.danger };
      if (score === 1) return { label: t.tag_weak, color: c.danger };
      if (score === 2) return { label: t.tag_secure, color: c.warning };
      return { label: t.tag_strong, color: c.success };
    },
    [t, c]
  );

  return {
    isUsernameRepeated,
    isPasswordRepeated,
    getPasswordStrength,
    canChangeCardType,
  };
};

/** Build O(1) lookup maps for duplicate username/password detection. */
export function buildDuplicateIndices(cards: readonly PasswordCard[]): {
  usernameIndex: DuplicateIndex;
  passwordIndex: DuplicateIndex;
} {
  const usernameIndex: DuplicateIndex = new Map();
  const passwordIndex: DuplicateIndex = new Map();

  cards.forEach((card) => {
    const userKey = card.username.toLowerCase().trim();
    if (userKey) {
      usernameIndex.set(userKey, [...(usernameIndex.get(userKey) ?? []), card.id]);
    }
    const passKey = card.passwordList[0] ?? '';
    if (passKey) {
      passwordIndex.set(passKey, [...(passwordIndex.get(passKey) ?? []), card.id]);
    }
  });

  return { usernameIndex, passwordIndex };
}

function sameIdList(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  if (left.every((id, index) => id === right[index])) return true;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((id, index) => id === sortedRight[index]);
}

function sameDuplicateIndex(left: DuplicateIndex, right: DuplicateIndex): boolean {
  if (left.size !== right.size) return false;
  for (const [key, ids] of left) {
    const other = right.get(key);
    if (!other || !sameIdList(ids, other)) return false;
  }
  return true;
}

/**
 * Keeps the previous index maps when membership did not change, so a title
 * edit does not hand every card a new Map.
 */
export function retainDuplicateIndices(
  prev: { usernameIndex: DuplicateIndex; passwordIndex: DuplicateIndex } | null,
  cards: readonly PasswordCard[]
): { usernameIndex: DuplicateIndex; passwordIndex: DuplicateIndex } {
  const next = buildDuplicateIndices(cards);
  if (!prev) return next;
  const usernameIndex = sameDuplicateIndex(prev.usernameIndex, next.usernameIndex)
    ? prev.usernameIndex
    : next.usernameIndex;
  const passwordIndex = sameDuplicateIndex(prev.passwordIndex, next.passwordIndex)
    ? prev.passwordIndex
    : next.passwordIndex;
  if (usernameIndex === prev.usernameIndex && passwordIndex === prev.passwordIndex) return prev;
  return { usernameIndex, passwordIndex };
}
