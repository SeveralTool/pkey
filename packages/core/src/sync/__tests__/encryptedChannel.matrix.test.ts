/**
 * @fileoverview Wire envelope integrity (lives outside encryptedChannel.test.ts
 * which is excluded from the default Vitest run).
 */
import { describe, it, expect } from 'vitest';
import {
  encryptSyncPushWire,
  decryptSyncPushWire,
  encryptAuthOk,
  decryptAuthOk,
  encryptControlWire,
  decryptControlWire,
  wrapControlInner,
  controlWireExpiry,
} from '../encryptedChannel';
import { deriveAuthHash } from '../../crypto/index';
import { SYNC_PROTOCOL_VERSION } from '../../types/index';
import { ACTION_CONFIRM_RESULT_TYPE, CONTROL_WIRE_TTL_MS } from '../protocol';

const emptyPush = {
  index: { cards: {}, tombstones: [], protocolVersion: SYNC_PROTOCOL_VERSION },
  upserts: [] as never[],
  deletions: [] as string[],
  tombstones: [] as never[],
};

describe('encryptedChannel.matrix', () => {
  const salt = 'abcd1234salt5678';
  const passwordHash = deriveAuthHash('test-password', salt);

  it.each(['nonce', 'ciphertext'] as const)('rejects a tampered AEAD %s', (field) => {
    const wire = encryptSyncPushWire('tok', emptyPush, passwordHash);
    if (field === 'nonce' && 'nonce' in wire) wire.nonce = '11'.repeat(24);
    if (field === 'ciphertext') wire.ciphertext = `${wire.ciphertext.slice(0, -2)}ff`;
    expect(decryptSyncPushWire(wire, passwordHash)).toBeNull();
  });

  it('rejects the wrong password hash', () => {
    const wire = encryptSyncPushWire('tok', emptyPush, passwordHash);
    expect(decryptSyncPushWire(wire, deriveAuthHash('other-password', salt))).toBeNull();
  });

  it('round-trips auth_ok with a host pairing secret', () => {
    const secret = 'ab'.repeat(32);
    const enc = encryptAuthOk('session-token', SYNC_PROTOCOL_VERSION, passwordHash, secret);
    expect(decryptAuthOk(enc, passwordHash)).toEqual({
      token: 'session-token',
      protocolVersion: SYNC_PROTOCOL_VERSION,
      hostProofSecret: secret,
    });
  });

  it('omits hostProofSecret from auth_ok when it is not a 32-byte hex string', () => {
    const enc = encryptAuthOk('session-token', SYNC_PROTOCOL_VERSION, passwordHash, 'nope');
    expect(decryptAuthOk(enc, passwordHash)).toEqual({
      token: 'session-token',
      protocolVersion: SYNC_PROTOCOL_VERSION,
    });
  });

  it('round-trips tags inside an upsert', () => {
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
    const wire = encryptSyncPushWire('tok', { ...emptyPush, upserts: [card] }, passwordHash);
    expect(decryptSyncPushWire(wire, passwordHash)?.upserts[0]?.tags).toEqual(['work']);
  });
});

describe('control wire', () => {
  const salt = 'abcd1234salt5678';
  const passwordHash = deriveAuthHash('test-password', salt);
  const token = 'session-token-abcdef';
  const now = 1_700_000_000_000;

  it('round-trips a control inner', () => {
    const wire = encryptControlWire(
      ACTION_CONFIRM_RESULT_TYPE,
      wrapControlInner(token, { requestId: 'abcd1234efgh5678', action: 'copy', ok: true }, now),
      passwordHash
    );
    expect(wire).not.toHaveProperty('ok');
    expect(wire).not.toHaveProperty('requestId');
    const inner = decryptControlWire(wire, passwordHash, now);
    expect(inner?.token).toBe(token);
    expect(inner?.action).toBe('copy');
    expect(inner?.ok).toBe(true);
    expect(inner?.exp).toBe(controlWireExpiry(now));
  });

  it('returns null for a tampered AEAD nonce', () => {
    const wire = encryptControlWire(
      ACTION_CONFIRM_RESULT_TYPE,
      wrapControlInner(token, { requestId: 'abcd1234efgh5678', action: 'copy', ok: true }, now),
      passwordHash
    );
    if ('nonce' in wire.encryptedPayload) {
      wire.encryptedPayload.nonce = '00'.repeat(24);
    }
    expect(decryptControlWire(wire, passwordHash, now)).toBeNull();
  });

  it('returns null when the inner is expired', () => {
    const wire = encryptControlWire(
      ACTION_CONFIRM_RESULT_TYPE,
      wrapControlInner(token, { requestId: 'abcd1234efgh5678', action: 'copy', ok: true }, now),
      passwordHash
    );
    expect(decryptControlWire(wire, passwordHash, now + CONTROL_WIRE_TTL_MS + 6_000)).toBeNull();
  });

  it('returns null without an envelope', () => {
    expect(
      decryptControlWire(
        { type: ACTION_CONFIRM_RESULT_TYPE, requestId: 'abcd1234efgh5678', ok: true },
        passwordHash,
        now
      )
    ).toBeNull();
  });
});
