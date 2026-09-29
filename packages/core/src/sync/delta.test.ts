import { describe, it, expect } from 'vitest';
import {
  fingerprintCard,
  buildSyncIndex,
  computeOutgoingDelta,
  computeDbVersionHash,
  vaultContentChanged,
} from './delta';
import type { PasswordCard, EncryptedDatabase } from '../types/index';

const card = (
  id: string,
  lastUpdate: string,
  title = id,
  extras: Partial<PasswordCard> = {}
): PasswordCard => ({
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
  ...extras,
});

const db = (
  cards: PasswordCard[],
  tombstones: { id: string; deletedAt: string }[] = []
): EncryptedDatabase => ({
  version: 1,
  passwordHash: 'hash',
  cards,
  settings: {} as EncryptedDatabase['settings'],
  creation_date: '2024-01-01T00:00:00.000Z',
  last_update: '2024-01-01T00:00:00.000Z',
  tombstones,
  syncProtocolVersion: 1,
});

describe('fingerprintCard', () => {
  it('changes when content changes', () => {
    const a = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', 'A'));
    const b = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', 'B'));
    expect(a.hash).not.toBe(b.hash);
  });

  it('is stable for identical content', () => {
    const a = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', 'A'));
    const b = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', 'A'));
    expect(a.hash).toBe(b.hash);
  });

  it('changes when otpSecret is added', () => {
    const base = card('1', '2024-01-01T00:00:00.000Z');
    const withOtp = card('1', '2024-01-01T00:00:00.000Z', '1', {
      otpSecret: 'JBSWY3DPEHPK3PXP',
    });
    expect(fingerprintCard(base).hash).not.toBe(fingerprintCard(withOtp).hash);
  });

  it('treats missing otpSecret same as empty string', () => {
    const a = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z'));
    const b = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', '1', { otpSecret: '' }));
    expect(a.hash).toBe(b.hash);
  });

  it('changes when tags differ', () => {
    const a = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', '1', { tags: ['work'] }));
    const b = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', '1', { tags: ['personal'] }));
    expect(a.hash).not.toBe(b.hash);
  });

  it('normalizes tag casing for fingerprint stability', () => {
    const a = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', '1', { tags: ['Work'] }));
    const b = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', '1', { tags: ['work'] }));
    expect(a.hash).toBe(b.hash);
  });

  it('changes when the HIBP result changes', () => {
    const base = card('1', '2024-01-01T00:00:00.000Z');
    const withClean = card('1', '2024-01-01T00:00:00.000Z', '1', {
      hibp: { status: 'clean', checkedAt: '2026-01-01T00:00:00.000Z', pwHash: 'a'.repeat(64) },
    });
    const withBreach = card('1', '2024-01-01T00:00:00.000Z', '1', {
      hibp: {
        status: 'breached',
        count: 4,
        checkedAt: '2026-01-01T00:00:00.000Z',
        pwHash: 'a'.repeat(64),
      },
    });
    expect(fingerprintCard(base).hash).not.toBe(fingerprintCard(withClean).hash);
    expect(fingerprintCard(withClean).hash).not.toBe(fingerprintCard(withBreach).hash);
  });

  it('changes when hibpAuthorized flips', () => {
    const a = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z'));
    const b = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z', '1', { hibpAuthorized: true }));
    expect(a.hash).not.toBe(b.hash);
  });

  it('treats a missing hibpAuthorized same as false', () => {
    const a = fingerprintCard(card('1', '2024-01-01T00:00:00.000Z'));
    const b = fingerprintCard(
      card('1', '2024-01-01T00:00:00.000Z', '1', { hibpAuthorized: false })
    );
    expect(a.hash).toBe(b.hash);
  });
});

describe('computeOutgoingDelta', () => {
  it('pushes cards the remote lacks', () => {
    const local = db([card('1', '2024-01-01T00:00:00.000Z')]);
    const remoteIndex = buildSyncIndex(db([]));
    const delta = computeOutgoingDelta(local, remoteIndex);
    expect(delta.upserts.map((c) => c.id)).toEqual(['1']);
  });

  it('pushes nothing when indexes match', () => {
    const local = db([card('1', '2024-01-01T00:00:00.000Z')]);
    const remoteIndex = buildSyncIndex(local);
    const delta = computeOutgoingDelta(local, remoteIndex);
    expect(delta.upserts).toHaveLength(0);
    expect(delta.deletions).toHaveLength(0);
  });

  it('pushes the newer version on divergence', () => {
    const local = db([card('1', '2024-05-01T00:00:00.000Z', 'newer')]);
    const remoteIndex = buildSyncIndex(db([card('1', '2024-01-01T00:00:00.000Z', 'older')]));
    const delta = computeOutgoingDelta(local, remoteIndex);
    expect(delta.upserts.map((c) => c.title)).toEqual(['newer']);
  });

  it('does not push an older local copy over a newer remote', () => {
    const local = db([card('1', '2024-01-01T00:00:00.000Z', 'older')]);
    const remoteIndex = buildSyncIndex(db([card('1', '2024-05-01T00:00:00.000Z', 'newer')]));
    const delta = computeOutgoingDelta(local, remoteIndex);
    expect(delta.upserts).toHaveLength(0);
  });

  it('propagates deletions for cards the remote still holds', () => {
    const local = db([], [{ id: '1', deletedAt: '2024-05-01T00:00:00.000Z' }]);
    const remoteIndex = buildSyncIndex(db([card('1', '2024-01-01T00:00:00.000Z')]));
    const delta = computeOutgoingDelta(local, remoteIndex);
    expect(delta.deletions).toEqual(['1']);
  });
});

describe('computeDbVersionHash', () => {
  it('is identical for same content regardless of card order', () => {
    const a = db([card('1', '2024-01-01T00:00:00.000Z'), card('2', '2024-02-01T00:00:00.000Z')]);
    const b = db([card('2', '2024-02-01T00:00:00.000Z'), card('1', '2024-01-01T00:00:00.000Z')]);
    expect(computeDbVersionHash(a)).toBe(computeDbVersionHash(b));
  });

  it('differs when content differs', () => {
    const a = db([card('1', '2024-01-01T00:00:00.000Z', 'A')]);
    const b = db([card('1', '2024-01-01T00:00:00.000Z', 'B')]);
    expect(computeDbVersionHash(a)).not.toBe(computeDbVersionHash(b));
  });
});

describe('vaultContentChanged', () => {
  it('ignores vault last_update', () => {
    const a = db([card('1', '2024-01-01T00:00:00.000Z')]);
    const b = { ...a, last_update: '2026-01-01T00:00:00.000Z' };
    expect(vaultContentChanged(a, b)).toBe(false);
  });

  it('detects card edits', () => {
    const a = db([card('1', '2024-01-01T00:00:00.000Z', 'A')]);
    const b = db([card('1', '2024-01-01T00:00:00.000Z', 'B')]);
    expect(vaultContentChanged(a, b)).toBe(true);
  });

  it('detects settings-only edits', () => {
    const a = db([card('1', '2024-01-01T00:00:00.000Z')]);
    const b = {
      ...a,
      settings: { ...a.settings, webTheme: 'LIGHT' as const },
    };
    expect(vaultContentChanged(a, b)).toBe(true);
  });
});
