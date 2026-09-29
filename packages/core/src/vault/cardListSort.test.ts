import { describe, it, expect } from 'vitest';
import {
  applyCardsListOrder,
  cardListTitleKey,
  compareCardsForList,
  isBlankSortCard,
  pinBlankExpandedCard,
  sortCardLinkListRows,
  sortCardsForList,
  toggleCardsListSortMode,
  type CardListSortable,
} from './cardListSort';
import { groupCardsByLinkKey } from '../links/groupKey';

const card = (partial: Partial<CardListSortable> & { id: string }): CardListSortable => ({
  title: '',
  link: '',
  username: '',
  last_update: '',
  ...partial,
});

describe('cardListTitleKey', () => {
  it('falls back title → link → username', () => {
    expect(cardListTitleKey(card({ id: 'a', title: ' Gmail ' }))).toBe('Gmail');
    expect(cardListTitleKey(card({ id: 'b', link: 'https://x.test' }))).toBe('https://x.test');
    expect(cardListTitleKey(card({ id: 'c', username: 'neo' }))).toBe('neo');
    expect(cardListTitleKey(card({ id: 'd' }))).toBe('');
  });
});

describe('compareCardsForList title', () => {
  it('sorts A–Z by title and puts blanks last', () => {
    const input = [
      card({ id: 'z', title: 'Zebra' }),
      card({ id: 'blank' }),
      card({ id: 'a', title: 'alpha' }),
    ];
    expect(sortCardsForList(input, 'title').map((c) => c.id)).toEqual(['a', 'z', 'blank']);
  });

  it('uses link then username when title is empty', () => {
    const input = [
      card({ id: 'u', username: 'bob' }),
      card({ id: 'l', link: 'https://aaa.test' }),
      card({ id: 't', title: 'mmm' }),
    ];
    expect(sortCardsForList(input, 'title').map((c) => c.id)).toEqual(['u', 'l', 't']);
  });

  it('treats accents as base letters', () => {
    const input = [card({ id: '2', title: 'Ávila' }), card({ id: '1', title: 'alce' })];
    expect(sortCardsForList(input, 'title').map((c) => c.id)).toEqual(['1', '2']);
  });

  it('does not mutate the input array', () => {
    const input = [card({ id: 'b', title: 'b' }), card({ id: 'a', title: 'a' })];
    const copy = [...input];
    sortCardsForList(input, 'title');
    expect(input).toEqual(copy);
  });

  it('uses id as a stable tie-break', () => {
    const a = card({ id: 'b', title: 'Same' });
    const b = card({ id: 'a', title: 'Same' });
    expect(compareCardsForList(a, b, 'title')).toBeGreaterThan(0);
  });
});

describe('compareCardsForList updated', () => {
  it('orders newest last_update first', () => {
    const input = [
      card({ id: 'old', title: 'A', last_update: '2020-01-01T00:00:00.000Z' }),
      card({ id: 'new', title: 'B', last_update: '2024-06-01T00:00:00.000Z' }),
      card({ id: 'mid', title: 'C', last_update: '2022-01-01T00:00:00.000Z' }),
    ];
    expect(sortCardsForList(input, 'updated').map((c) => c.id)).toEqual(['new', 'mid', 'old']);
  });

  it('puts invalid last_update last', () => {
    const input = [
      card({ id: 'bad', title: 'A', last_update: 'not-a-date' }),
      card({ id: 'ok', title: 'B', last_update: '2024-01-01T00:00:00.000Z' }),
    ];
    expect(sortCardsForList(input, 'updated').map((c) => c.id)).toEqual(['ok', 'bad']);
  });

  it('breaks timestamp ties with title then id', () => {
    const ts = '2024-01-01T00:00:00.000Z';
    const input = [
      card({ id: 'z', title: 'Z', last_update: ts }),
      card({ id: 'a', title: 'A', last_update: ts }),
    ];
    expect(sortCardsForList(input, 'updated').map((c) => c.id)).toEqual(['a', 'z']);
  });
});

describe('pinBlankExpandedCard', () => {
  it('pins a blank expanded card first', () => {
    const input = [
      card({ id: 'a', title: 'Alpha' }),
      card({ id: 'new' }),
      card({ id: 'b', title: 'Beta' }),
    ];
    expect(pinBlankExpandedCard(input, 'new').map((c) => c.id)).toEqual(['new', 'a', 'b']);
  });

  it('does not pin an expanded card that has a title', () => {
    const input = [card({ id: 'a', title: 'Alpha' }), card({ id: 'b', title: 'Beta' })];
    expect(pinBlankExpandedCard(input, 'b').map((c) => c.id)).toEqual(['a', 'b']);
  });

  it('isBlankSortCard is true only when all three keys are empty', () => {
    expect(isBlankSortCard(card({ id: 'x' }))).toBe(true);
    expect(isBlankSortCard(card({ id: 'x', username: 'u' }))).toBe(false);
  });
});

describe('applyCardsListOrder', () => {
  it('sorts then pins a blank expanded card', () => {
    const input = [
      card({ id: 'z', title: 'Zebra' }),
      card({ id: 'new' }),
      card({ id: 'a', title: 'Alpha' }),
    ];
    expect(applyCardsListOrder(input, { mode: 'title', expandedId: 'new' }).map((c) => c.id)).toEqual(
      ['new', 'a', 'z']
    );
  });

  it('skips sort when skipSort is true', () => {
    const input = [card({ id: 'z', title: 'Zebra' }), card({ id: 'a', title: 'Alpha' })];
    expect(applyCardsListOrder(input, { mode: 'title', skipSort: true }).map((c) => c.id)).toEqual([
      'z',
      'a',
    ]);
  });
});

describe('sortCardLinkListRows', () => {
  it('re-sorts group members by last_update', () => {
    const cards = [
      {
        id: 'old',
        title: 'A',
        link: 'https://example.com',
        username: 'u',
        last_update: '2020-01-01T00:00:00.000Z',
      },
      {
        id: 'new',
        title: 'B',
        link: 'https://example.com/app',
        username: 'u',
        last_update: '2024-01-01T00:00:00.000Z',
      },
    ];
    const rows = groupCardsByLinkKey(cards);
    const sorted = sortCardLinkListRows(rows, 'updated');
    expect(sorted[0]?.kind).toBe('group');
    if (sorted[0]?.kind === 'group') {
      expect(sorted[0].cards.map((c) => c.id)).toEqual(['new', 'old']);
    }
  });
});

describe('toggleCardsListSortMode', () => {
  it('cycles title ↔ updated', () => {
    expect(toggleCardsListSortMode('title')).toBe('updated');
    expect(toggleCardsListSortMode('updated')).toBe('title');
  });
});
