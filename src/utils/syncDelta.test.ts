import {
  fingerprintCard,
  buildSyncIndex,
  computeOutgoingDelta,
  computeDbVersionHash,
} from './syncDelta';
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

const db = (cards: PasswordCard[], tombstones: any[] = []): EncryptedDatabase => ({
  version: 1,
  passwordHash: 'hash',
  cards,
  settings: {} as any,
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
