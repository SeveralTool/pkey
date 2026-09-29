import {
  mergeCards,
  mergeTombstones,
  mergeDatabases,
  applyDeletion,
  applyDeleteAllCards,
} from './dbMerge';
import { PasswordCard, EncryptedDatabase } from '../types';

const card = (id: string, lastUpdate: string, title = id): PasswordCard => ({
  id,
  type: 'PASSWORD',
  title,
  icon: { type: 'icon', value: 'key-outline' },
  username: `${id}@x.com`,
  passwordList: ['pw'],
  link: '',
  notes: '',
  creation_date: '2024-01-01T00:00:00.000Z',
  last_update: lastUpdate,
});

describe('mergeTombstones', () => {
  it('keeps the most recent deletion per id', () => {
    const result = mergeTombstones(
      [{ id: 'a', deletedAt: '2024-01-01T00:00:00.000Z' }],
      [{ id: 'a', deletedAt: '2024-02-01T00:00:00.000Z' }]
    );
    expect(result).toHaveLength(1);
    expect(result[0].deletedAt).toBe('2024-02-01T00:00:00.000Z');
  });

  it('unions distinct ids', () => {
    const result = mergeTombstones(
      [{ id: 'a', deletedAt: '2024-01-01T00:00:00.000Z' }],
      [{ id: 'b', deletedAt: '2024-01-01T00:00:00.000Z' }]
    );
    expect(result.map((t) => t.id).sort()).toEqual(['a', 'b']);
  });
});

describe('mergeCards', () => {
  it('keeps the newer card when both sides have the same id', () => {
    const local = [card('1', '2024-01-01T00:00:00.000Z', 'old')];
    const remote = [card('1', '2024-02-01T00:00:00.000Z', 'new')];
    const { cards } = mergeCards(local, remote);
    expect(cards).toHaveLength(1);
    expect(cards[0].title).toBe('new');
  });

  it('unions cards that exist on only one side', () => {
    const { cards } = mergeCards(
      [card('1', '2024-01-01T00:00:00.000Z')],
      [card('2', '2024-01-01T00:00:00.000Z')]
    );
    expect(cards.map((c) => c.id).sort()).toEqual(['1', '2']);
  });

  it('drops a card deleted after its last edit (tombstone wins)', () => {
    const local = [card('1', '2024-01-01T00:00:00.000Z')];
    const { cards } = mergeCards(
      local,
      [],
      [],
      [{ id: '1', deletedAt: '2024-02-01T00:00:00.000Z' }]
    );
    expect(cards).toHaveLength(0);
  });

  it('resurrects a card edited after its deletion and prunes the tombstone', () => {
    const local = [card('1', '2024-03-01T00:00:00.000Z')];
    const { cards, tombstones } = mergeCards(
      local,
      [],
      [],
      [{ id: '1', deletedAt: '2024-02-01T00:00:00.000Z' }]
    );
    expect(cards).toHaveLength(1);
    expect(tombstones).toHaveLength(0);
  });

  it('orders results newest-first', () => {
    const { cards } = mergeCards(
      [card('old', '2024-01-01T00:00:00.000Z'), card('new', '2024-05-01T00:00:00.000Z')],
      []
    );
    expect(cards[0].id).toBe('new');
  });
});

describe('mergeDatabases', () => {
  const base: EncryptedDatabase = {
    version: 1,
    passwordHash: 'hash',
    cards: [],
    settings: {} as any,
    creation_date: '2024-01-01T00:00:00.000Z',
    last_update: '2024-01-01T00:00:00.000Z',
  };

  it('converges symmetrically (order independent)', () => {
    const a: EncryptedDatabase = { ...base, cards: [card('1', '2024-02-01T00:00:00.000Z', 'A')] };
    const b: EncryptedDatabase = { ...base, cards: [card('1', '2024-03-01T00:00:00.000Z', 'B')] };
    const ab = mergeDatabases(a, b).cards.map((c) => c.title);
    const ba = mergeDatabases(b, a).cards.map((c) => c.title);
    expect(ab).toEqual(['B']);
    expect(ba).toEqual(['B']);
  });
});

describe('applyDeletion', () => {
  it('removes the card and records a tombstone', () => {
    const db: EncryptedDatabase = {
      version: 1,
      passwordHash: 'hash',
      cards: [card('1', '2024-01-01T00:00:00.000Z')],
      settings: {} as any,
      creation_date: '2024-01-01T00:00:00.000Z',
      last_update: '2024-01-01T00:00:00.000Z',
    };
    const result = applyDeletion(db, '1', '2024-02-01T00:00:00.000Z');
    expect(result.cards).toHaveLength(0);
    expect(result.tombstones).toEqual([{ id: '1', deletedAt: '2024-02-01T00:00:00.000Z' }]);
  });
});

describe('applyDeleteAllCards', () => {
  it('removes every card and records tombstones for sync', () => {
    const db: EncryptedDatabase = {
      version: 1,
      passwordHash: 'hash',
      cards: [card('1', '2024-01-01T00:00:00.000Z'), card('2', '2024-01-02T00:00:00.000Z')],
      settings: {} as any,
      creation_date: '2024-01-01T00:00:00.000Z',
      last_update: '2024-01-01T00:00:00.000Z',
    };
    const result = applyDeleteAllCards(db, '2024-03-01T00:00:00.000Z');
    expect(result.cards).toHaveLength(0);
    expect(result.tombstones).toEqual([
      { id: '1', deletedAt: '2024-03-01T00:00:00.000Z' },
      { id: '2', deletedAt: '2024-03-01T00:00:00.000Z' },
    ]);
  });
});
