/**
 * @fileoverview Presentation-only vault list ordering (does not mutate persisted arrays).
 */

import type { CardLinkListRow } from '../links/groupKey';

/** Session / UI sort modes for the vault card list. */
export type CardsListSortMode = 'title' | 'updated';

/** Minimal card fields required to sort a vault list. */
export type CardListSortable = {
  id: string;
  title?: string;
  link?: string;
  username?: string;
  last_update?: string;
};

const LOCALE_OPTS: Intl.CollatorOptions = { sensitivity: 'base', numeric: true };

/**
 * First non-empty of title → link → username. Empty string means “sort last”.
 */
export function cardListTitleKey(card: CardListSortable): string {
  const title = (card.title || '').trim();
  if (title) return title;
  const link = (card.link || '').trim();
  if (link) return link;
  return (card.username || '').trim();
}

/** True when title, link, and username are all blank (newly created mobile card). */
export function isBlankSortCard(card: CardListSortable): boolean {
  return cardListTitleKey(card).length === 0;
}

function compareIds(a: CardListSortable, b: CardListSortable): number {
  return a.id.localeCompare(b.id);
}

/**
 * Compares two cards for list display.
 *
 * @param a - Left card.
 * @param b - Right card.
 * @param mode - `title` (A–Z with fallbacks) or `updated` (newest `last_update` first).
 */
export function compareCardsForList(
  a: CardListSortable,
  b: CardListSortable,
  mode: CardsListSortMode
): number {
  if (mode === 'updated') {
    const ta = Date.parse(a.last_update || '');
    const tb = Date.parse(b.last_update || '');
    const aInvalid = Number.isNaN(ta);
    const bInvalid = Number.isNaN(tb);
    if (aInvalid && bInvalid) return compareCardsForList(a, b, 'title');
    if (aInvalid) return 1;
    if (bInvalid) return -1;
    if (tb !== ta) return tb - ta;
    return compareCardsForList(a, b, 'title');
  }

  const ka = cardListTitleKey(a);
  const kb = cardListTitleKey(b);
  const aEmpty = ka.length === 0;
  const bEmpty = kb.length === 0;
  if (aEmpty && bEmpty) return compareIds(a, b);
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  const cmp = ka.localeCompare(kb, undefined, LOCALE_OPTS);
  if (cmp !== 0) return cmp;
  return compareIds(a, b);
}

/**
 * Returns a new array sorted for display. Does not mutate `cards`.
 *
 * @param cards - Cards to order.
 * @param mode - Sort mode.
 */
export function sortCardsForList<T extends CardListSortable>(
  cards: readonly T[],
  mode: CardsListSortMode
): T[] {
  if (mode === 'updated') {
    return cards
      .map((card, index) => ({ card, index, ts: Date.parse(card.last_update || '') }))
      .sort((left, right) => {
        const aInvalid = Number.isNaN(left.ts);
        const bInvalid = Number.isNaN(right.ts);
        if (aInvalid && bInvalid) {
          const cmp = compareCardsForList(left.card, right.card, 'title');
          return cmp !== 0 ? cmp : left.index - right.index;
        }
        if (aInvalid) return 1;
        if (bInvalid) return -1;
        if (right.ts !== left.ts) return right.ts - left.ts;
        const cmp = compareCardsForList(left.card, right.card, 'title');
        return cmp !== 0 ? cmp : left.index - right.index;
      })
      .map((row) => row.card);
  }

  return [...cards].sort((a, b) => compareCardsForList(a, b, 'title'));
}

/**
 * Moves a blank expanded card to index 0 so create-card stays visible under A–Z.
 *
 * @param cards - Already filtered (and optionally sorted) list.
 * @param expandedId - Currently expanded card id, or null.
 */
export function pinBlankExpandedCard<T extends CardListSortable>(
  cards: readonly T[],
  expandedId: string | null | undefined
): T[] {
  if (!expandedId) return [...cards];
  const idx = cards.findIndex((card) => card.id === expandedId);
  if (idx < 0) return [...cards];
  const card = cards[idx];
  if (!card || !isBlankSortCard(card)) return [...cards];
  if (idx === 0) return [...cards];
  return [card, ...cards.slice(0, idx), ...cards.slice(idx + 1)];
}

/**
 * Presentation pipeline: optional sort, then pin a blank expanded card.
 *
 * @param cards - Filtered cards (URL-ranked lists should pass `skipSort: true`).
 * @param options - Sort mode, expanded id, and whether to skip sorting.
 */
export function applyCardsListOrder<T extends CardListSortable>(
  cards: readonly T[],
  options: {
    mode: CardsListSortMode;
    expandedId?: string | null;
    skipSort?: boolean;
  }
): T[] {
  const ordered = options.skipSort ? [...cards] : sortCardsForList(cards, options.mode);
  return pinBlankExpandedCard(ordered, options.expandedId);
}

/**
 * Re-sorts members of host groups with the same comparator. Singles are unchanged.
 *
 * @param rows - Rows from `groupCardsByLinkKey`.
 * @param mode - Sort mode.
 */
export function sortCardLinkListRows<T extends CardListSortable>(
  rows: readonly CardLinkListRow<T>[],
  mode: CardsListSortMode
): CardLinkListRow<T>[] {
  return rows.map((row) => {
    if (row.kind !== 'group') return row;
    return { ...row, cards: sortCardsForList(row.cards, mode) };
  });
}

/** Cycles the two vault list sort modes. */
export function toggleCardsListSortMode(mode: CardsListSortMode): CardsListSortMode {
  return mode === 'title' ? 'updated' : 'title';
}
