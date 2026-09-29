/**
 * @fileoverview Fingerprint / outgoing-delta matrix for every hashed field.
 */
import { describe, it, expect } from 'vitest';
import {
  fingerprintCard,
  computeOutgoingDelta,
  computeDbVersionHash,
  buildSyncIndex,
} from '../delta';
import { makeCard, ts } from './peerVault';
import type { EncryptedDatabase, PasswordCard } from '../../types/index';
import { SYNC_PROTOCOL_VERSION } from '../../types/index';

const dbOf = (cards: PasswordCard[], tombstones: EncryptedDatabase['tombstones'] = []): EncryptedDatabase => ({
  version: 1,
  passwordHash: 'h',
  cards,
  settings: {} as EncryptedDatabase['settings'],
  creation_date: ts(0),
  last_update: ts(1),
  tombstones,
  syncProtocolVersion: SYNC_PROTOCOL_VERSION,
});

describe('delta.matrix fingerprint fields', () => {
  const base = makeCard({ last_update: ts(1) });
  const variants: [string, PasswordCard][] = [
    ['title', { ...base, title: 'Other' }],
    ['username', { ...base, username: 'other@x.test' }],
    ['passwordList', { ...base, passwordList: ['other-pw'] }],
    ['link', { ...base, link: 'https://other.test' }],
    ['uris', { ...base, uris: ['android://x@com.x/'] }],
    ['notes', { ...base, notes: 'n' }],
    ['otpSecret', { ...base, otpSecret: 'JBSWY3DPEHPK3PXP' }],
    ['otpAlgorithm', { ...base, otpAlgorithm: 'SHA256' }],
    ['otpDigits', { ...base, otpDigits: 8 }],
    ['otpPeriod', { ...base, otpPeriod: 60 }],
    ['tags', { ...base, tags: ['work'] }],
    ['icon', { ...base, icon: { type: 'icon', value: 'logo-github' } }],
    ['type', { ...base, type: 'NOTE', passwordList: [''] }],
    [
      'hibp',
      {
        ...base,
        hibp: { status: 'clean', checkedAt: ts(1), pwHash: 'c'.repeat(64) },
      },
    ],
    ['hibpAuthorized', { ...base, hibpAuthorized: true }],
  ];

  it.each(variants)('hash changes when %s changes', (_field, other) => {
    expect(fingerprintCard(base).hash).not.toBe(fingerprintCard(other).hash);
  });

  it('tag casing does not change the fingerprint', () => {
    const a = fingerprintCard({ ...base, tags: ['Work', 'PERSONAL'] });
    const b = fingerprintCard({ ...base, tags: ['personal', 'work'] });
    expect(a.hash).toBe(b.hash);
  });

  it('missing otpSecret fingerprints like empty string', () => {
    const a = fingerprintCard({ ...base, otpSecret: undefined });
    const b = fingerprintCard({ ...base, otpSecret: '' });
    expect(a.hash).toBe(b.hash);
  });
});

describe('delta.matrix computeOutgoingDelta', () => {
  it('pushes a card the peer lacks', () => {
    const local = makeCard({ id: 'x', last_update: ts(1) });
    const delta = computeOutgoingDelta(dbOf([local]), {
      cards: {},
      tombstones: [],
      protocolVersion: SYNC_PROTOCOL_VERSION,
    });
    expect(delta.upserts.map((c) => c.id)).toEqual(['x']);
  });

  it('does not push when hashes match', () => {
    const local = makeCard({ last_update: ts(1) });
    const delta = computeOutgoingDelta(dbOf([local]), buildSyncIndex(dbOf([local])));
    expect(delta.upserts).toHaveLength(0);
  });

  it('does not push an older local over a newer remote fingerprint', () => {
    const local = makeCard({ title: 'old', last_update: ts(1) });
    const remoteNewer = makeCard({ title: 'new', last_update: ts(2) });
    const delta = computeOutgoingDelta(dbOf([local]), buildSyncIndex(dbOf([remoteNewer])));
    expect(delta.upserts).toHaveLength(0);
  });

  it('pushes when local is newer and hash differs', () => {
    const local = makeCard({ title: 'new', last_update: ts(2) });
    const remote = makeCard({ title: 'old', last_update: ts(1) });
    const delta = computeOutgoingDelta(dbOf([local]), buildSyncIndex(dbOf([remote])));
    expect(delta.upserts[0].title).toBe('new');
  });

  it('emits a deletion when the local tombstone covers a remote live card', () => {
    const remote = makeCard({ last_update: ts(1) });
    const delta = computeOutgoingDelta(
      dbOf([], [{ id: 'card-1', deletedAt: ts(2) }]),
      buildSyncIndex(dbOf([remote]))
    );
    expect(delta.deletions).toEqual(['card-1']);
  });

  it('version hash is order-independent', () => {
    const a = makeCard({ id: 'a', last_update: ts(1) });
    const b = makeCard({ id: 'b', last_update: ts(1), title: 'B' });
    expect(computeDbVersionHash(dbOf([a, b]))).toBe(computeDbVersionHash(dbOf([b, a])));
  });
});
