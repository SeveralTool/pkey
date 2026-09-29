import { describe, it, expect } from 'vitest';
import type { PasswordCard } from '@pkey/core';
import { encodeOfflineVault, decodeOfflineVault, type OfflineVaultData } from './offlineVault';
import { emptyOutbox, withUpsert } from './outbox';

const HASH = 'a'.repeat(64);

const card = (id: string): PasswordCard => ({
  id,
  type: 'PASSWORD',
  title: `Card ${id}`,
  icon: { type: 'icon', value: 'key-outline' },
  username: 'user',
  passwordList: ['s3cret'],
  link: 'https://example.com',
  notes: '',
  creation_date: '2024-01-01T00:00:00.000Z',
  last_update: '2024-01-02T00:00:00.000Z',
});

const sampleData = (): OfflineVaultData => ({
  cards: [card('a'), card('b')],
  settings: { theme: 'DARK', language: 'ESP' } as never,
  outbox: withUpsert(emptyOutbox(), card('c')),
});

describe('offlineVault blob', () => {
  it('roundtrips cards, settings, and outbox', () => {
    const envelope = encodeOfflineVault(sampleData(), HASH);
    const decoded = decodeOfflineVault(envelope, HASH);
    expect(decoded).not.toBeNull();
    expect(decoded!.cards.map((c) => c.id)).toEqual(['a', 'b']);
    expect(decoded!.cards[0].passwordList).toEqual(['s3cret']);
    expect((decoded!.settings as { theme: string }).theme).toBe('DARK');
    expect(Object.keys(decoded!.outbox.upserts)).toEqual(['c']);
  });

  it('rejects a wrong password hash', () => {
    const envelope = encodeOfflineVault(sampleData(), HASH);
    expect(decodeOfflineVault(envelope, 'b'.repeat(64))).toBeNull();
  });

  it('rejects a tampered ciphertext (HMAC failure)', () => {
    const envelope = encodeOfflineVault(sampleData(), HASH);
    const tampered = {
      ...envelope,
      ciphertext: envelope.ciphertext.slice(0, -2) + '00',
    };
    expect(decodeOfflineVault(tampered, HASH)).toBeNull();
  });

  it('rejects payloads without a cards array', () => {
    const envelope = encodeOfflineVault({ cards: 'nope', settings: null, outbox: {} } as never, HASH);
    expect(decodeOfflineVault(envelope, HASH)).toBeNull();
  });

  it('filters malformed card entries and normalizes the outbox', () => {
    const data = {
      cards: [card('a'), null, 42, { title: 'no id' }],
      settings: null,
      outbox: 'corrupt',
    };
    const envelope = encodeOfflineVault(data as never, HASH);
    const decoded = decodeOfflineVault(envelope, HASH);
    expect(decoded).not.toBeNull();
    expect(decoded!.cards.map((c) => c.id)).toEqual(['a']);
    expect(decoded!.settings).toBeNull();
    expect(Object.keys(decoded!.outbox.upserts)).toEqual([]);
  });
});
