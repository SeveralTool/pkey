import { describe, it, expect } from 'vitest';
import type { PasswordCard } from '@pkey/core';
import {
  emptyOutbox,
  withUpsert,
  withTombstone,
  withSettings,
  outboxCount,
  isOutboxEmpty,
  normalizeOutbox,
} from './outbox';

const card = (id: string, title = 'T'): PasswordCard => ({
  id,
  type: 'PASSWORD',
  title,
  icon: { type: 'icon', value: 'key-outline' },
  username: 'u',
  passwordList: ['secret'],
  link: '',
  notes: '',
  creation_date: '2024-01-01T00:00:00.000Z',
  last_update: '2024-01-02T00:00:00.000Z',
});

describe('outbox', () => {
  it('starts empty', () => {
    const o = emptyOutbox();
    expect(isOutboxEmpty(o)).toBe(true);
    expect(outboxCount(o)).toBe(0);
  });

  it('coalesces repeated upserts for the same id', () => {
    let o = emptyOutbox();
    o = withUpsert(o, card('a', 'v1'));
    o = withUpsert(o, card('a', 'v2'));
    expect(outboxCount(o)).toBe(1);
    expect(o.upserts['a'].title).toBe('v2');
  });

  it('delete after create drops the upsert and keeps only the tombstone', () => {
    let o = emptyOutbox();
    o = withUpsert(o, card('a'));
    o = withTombstone(o, 'a', '2024-01-03T00:00:00.000Z');
    expect(o.upserts['a']).toBeUndefined();
    expect(o.tombstones['a']).toEqual({ id: 'a', deletedAt: '2024-01-03T00:00:00.000Z' });
    expect(outboxCount(o)).toBe(1);
  });

  it('re-create after delete drops the tombstone', () => {
    let o = emptyOutbox();
    o = withTombstone(o, 'a', '2024-01-03T00:00:00.000Z');
    o = withUpsert(o, card('a'));
    expect(o.tombstones['a']).toBeUndefined();
    expect(o.upserts['a']).toBeDefined();
  });

  it('settings snapshot counts as one pending op, last write wins', () => {
    let o = emptyOutbox();
    o = withSettings(o, { theme: 'DARK' } as never);
    o = withSettings(o, { theme: 'LIGHT' } as never);
    expect(outboxCount(o)).toBe(1);
    expect((o.settings as { theme: string }).theme).toBe('LIGHT');
  });

  it('does not mutate previous outbox instances', () => {
    const o1 = emptyOutbox();
    const o2 = withUpsert(o1, card('a'));
    expect(isOutboxEmpty(o1)).toBe(true);
    expect(isOutboxEmpty(o2)).toBe(false);
  });

  it('ignores empty ids', () => {
    let o = emptyOutbox();
    o = withUpsert(o, { ...card('a'), id: '' });
    o = withTombstone(o, '', 'x');
    expect(isOutboxEmpty(o)).toBe(true);
  });

  describe('normalizeOutbox', () => {
    it('restores a valid serialized outbox', () => {
      let o = emptyOutbox();
      o = withUpsert(o, card('a'));
      o = withTombstone(o, 'b', '2024-01-03T00:00:00.000Z');
      const restored = normalizeOutbox(JSON.parse(JSON.stringify(o)));
      expect(Object.keys(restored.upserts)).toEqual(['a']);
      expect(restored.tombstones['b'].deletedAt).toBe('2024-01-03T00:00:00.000Z');
    });

    it.each([null, undefined, 42, 'str', []])('degrades %p to empty', (raw) => {
      expect(isOutboxEmpty(normalizeOutbox(raw))).toBe(true);
    });

    it('drops corrupt entries with mismatched ids', () => {
      const restored = normalizeOutbox({
        upserts: { a: { id: 'zzz' }, b: card('b') },
        tombstones: { c: { id: 'c', deletedAt: 123 }, d: { id: 'd', deletedAt: 'ok' } },
      });
      expect(Object.keys(restored.upserts)).toEqual(['b']);
      expect(Object.keys(restored.tombstones)).toEqual(['d']);
    });
  });
});
