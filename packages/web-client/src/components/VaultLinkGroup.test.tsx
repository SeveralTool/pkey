import { describe, it, expect } from 'vitest';
import { groupCardsByLinkKey, sortCardLinkListRows, sortCardsForList, type DisplayCard } from '@pkey/core';

const card = (id: string, link: string, title = id): DisplayCard => ({
  id,
  type: 'PASSWORD',
  title,
  icon: { type: 'icon', value: 'key' },
  username: 'u',
  passwordList: [],
  link,
  notes: '',
  creation_date: '',
  last_update: '',
});

describe('Vault list group-by-link wiring', () => {
  it('groups filtered display cards by normalized host when enabled', () => {
    const cards = [
      card('a', 'https://www.example.com/login', 'A'),
      card('b', 'example.com', 'B'),
      card('c', 'https://other.test', 'C'),
    ];
    const rows = groupCardsByLinkKey(cards);
    expect(rows).toHaveLength(2);
    expect(rows[0].kind).toBe('group');
    if (rows[0].kind === 'group') {
      expect(rows[0].key).toBe('host:example.com');
      expect(rows[0].cards).toHaveLength(2);
    }
    expect(rows[1]).toMatchObject({ kind: 'single', card: { id: 'c' } });
  });

  it('presents members A–Z by title after grouping', () => {
    const cards = [
      card('z', 'https://example.com', 'Zebra'),
      card('a', 'https://example.com', 'Alpha'),
    ];
    const rows = sortCardLinkListRows(groupCardsByLinkKey(cards), 'title');
    expect(rows[0]?.kind).toBe('group');
    if (rows[0]?.kind === 'group') {
      expect(rows[0].cards.map((c) => c.id)).toEqual(['a', 'z']);
    }
  });

  it('sorts a flat vault list A–Z by title', () => {
    const cards = [card('z', '', 'Zebra'), card('a', '', 'Alpha')];
    expect(sortCardsForList(cards, 'title').map((c) => c.id)).toEqual(['a', 'z']);
  });
});
