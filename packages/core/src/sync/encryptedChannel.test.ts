import {
  encryptAuthOk,
  decryptAuthOk,
  encryptSyncPushWire,
  decryptSyncPushWire,
} from './encryptedChannel';
import { deriveAuthHash } from '../crypto/index';
import { SYNC_PROTOCOL_VERSION } from '../types/index';

describe('encryptedChannel', () => {
  const password = 'test-password';
  const salt = 'abcd1234salt5678';
  const passwordHash = deriveAuthHash(password, salt);

  it('round-trips auth_ok envelope', () => {
    const enc = encryptAuthOk('session-token', SYNC_PROTOCOL_VERSION, passwordHash);
    const dec = decryptAuthOk(enc, passwordHash);
    expect(dec).toEqual({ token: 'session-token', protocolVersion: SYNC_PROTOCOL_VERSION });
  });

  it('round-trips auth_ok with a host pairing secret', () => {
    const secret = 'ab'.repeat(32);
    const enc = encryptAuthOk('session-token', SYNC_PROTOCOL_VERSION, passwordHash, secret);
    const dec = decryptAuthOk(enc, passwordHash);
    expect(dec).toEqual({
      token: 'session-token',
      protocolVersion: SYNC_PROTOCOL_VERSION,
      hostProofSecret: secret,
    });
  });

  it('drops a malformed host pairing secret from auth_ok', () => {
    const enc = encryptAuthOk('session-token', SYNC_PROTOCOL_VERSION, passwordHash, 'not-a-secret');
    const dec = decryptAuthOk(enc, passwordHash);
    expect(dec).toEqual({ token: 'session-token', protocolVersion: SYNC_PROTOCOL_VERSION });
  });

  it('round-trips sync_push wire envelope with token inside', () => {
    const wire = encryptSyncPushWire(
      'tok',
      {
        index: { cards: {}, tombstones: [], protocolVersion: SYNC_PROTOCOL_VERSION },
        upserts: [],
        deletions: [],
        tombstones: [],
      },
      passwordHash
    );
    const dec = decryptSyncPushWire(wire, passwordHash);
    expect(dec?.token).toBe('tok');
    expect(dec?.upserts).toEqual([]);
  });

  it('rejects a tampered nonce', () => {
    const wire = encryptSyncPushWire(
      'tok',
      {
        index: { cards: {}, tombstones: [], protocolVersion: SYNC_PROTOCOL_VERSION },
        upserts: [],
        deletions: [],
        tombstones: [],
      },
      passwordHash
    );
    if ('nonce' in wire) wire.nonce = '00'.repeat(24);
    expect(decryptSyncPushWire(wire, passwordHash)).toBeNull();
  });

  it('rejects a tampered AEAD ciphertext', () => {
    const wire = encryptSyncPushWire(
      'tok',
      {
        index: { cards: {}, tombstones: [], protocolVersion: SYNC_PROTOCOL_VERSION },
        upserts: [],
        deletions: [],
        tombstones: [],
      },
      passwordHash
    );
    wire.ciphertext = `${wire.ciphertext.slice(0, -2)}ff`;
    expect(decryptSyncPushWire(wire, passwordHash)).toBeNull();
  });

  it('rejects the wrong password hash', () => {
    const wire = encryptSyncPushWire(
      'tok',
      {
        index: { cards: {}, tombstones: [], protocolVersion: SYNC_PROTOCOL_VERSION },
        upserts: [],
        deletions: [],
        tombstones: [],
      },
      passwordHash
    );
    const other = deriveAuthHash('other-password', salt);
    expect(decryptSyncPushWire(wire, other)).toBeNull();
  });

  it('round-trips a card upsert including tags', () => {
    const card = {
      id: 'c1',
      type: 'PASSWORD' as const,
      title: 'T',
      icon: { type: 'icon' as const, value: 'key-outline' },
      username: 'u',
      passwordList: ['p'],
      link: '',
      notes: '',
      creation_date: '2026-01-01T00:00:00.000Z',
      last_update: '2026-01-01T00:00:00.000Z',
      tags: ['work'],
    };
    const wire = encryptSyncPushWire(
      'tok',
      {
        index: { cards: {}, tombstones: [], protocolVersion: SYNC_PROTOCOL_VERSION },
        upserts: [card],
        deletions: [],
        tombstones: [],
      },
      passwordHash
    );
    const dec = decryptSyncPushWire(wire, passwordHash);
    expect(dec?.upserts[0]?.tags).toEqual(['work']);
  });
});
