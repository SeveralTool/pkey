/**
 * @fileoverview Outbox flush mapped through mergeCards (PWA reconnect path).
 */
import { describe, it, expect } from 'vitest';
import {
  mergeCards,
  mergePullLocally,
  type PasswordCard,
  DEFAULT_VAULT_SETTINGS,
} from '@pkey/core';
import { emptyOutbox, withUpsert, withTombstone, withSettings, outboxCount } from './outbox';

const card = (id: string, title: string, ts: string, extra: Partial<PasswordCard> = {}): PasswordCard => ({
  id,
  type: 'PASSWORD',
  title,
  icon: { type: 'icon', value: 'key-outline' },
  username: 'u',
  passwordList: ['pw'],
  link: 'https://a.test',
  notes: '',
  creation_date: ts,
  last_update: ts,
  ...extra,
});

describe('outbox.flush', () => {
  it('flushes coalesced upserts, a tombstone, and settings in one merge', () => {
    const local = [
      card('keep', 'Keep', '2020-01-01T00:00:00.000Z'),
      card('gone', 'Gone', '2020-01-01T00:00:00.000Z'),
    ];
    let o = emptyOutbox();
    o = withUpsert(o, card('keep', 'Keep-edit', '2021-01-01T00:00:00.000Z', { tags: ['x'] }));
    o = withUpsert(o, card('new', 'New', '2021-01-01T00:00:00.000Z'));
    o = withTombstone(o, 'gone', '2021-01-01T00:00:00.000Z');
    o = withSettings(o, { ...DEFAULT_VAULT_SETTINGS, groupCardsByLink: true });
    expect(outboxCount(o)).toBe(4);

    const { cards, tombstones, overwrites } = mergeCards(
      local,
      Object.values(o.upserts),
      [],
      Object.values(o.tombstones)
    );
    expect(overwrites).toEqual([]);
    expect(cards.map((c) => c.id).sort()).toEqual(['keep', 'new']);
    expect(cards.find((c) => c.id === 'keep')?.tags).toEqual(['x']);
    expect(tombstones.some((t) => t.id === 'gone')).toBe(true);

    const echo = mergePullLocally(Object.values(o.upserts).filter((c) => c.id !== 'gone'), {
      upserts: cards,
      tombstones,
    });
    expect(echo.cards.map((c) => c.id).sort()).toEqual(['keep', 'new']);
    expect(echo.cards.find((c) => c.id === 'keep')?.tags).toEqual(['x']);
  });
});
