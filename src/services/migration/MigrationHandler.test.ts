import {
  createChunkState,
  storeChunk,
  assembleChunks,
  computeMigrationProgress,
  validateMigrationMeta,
  isMigrationComplete,
} from './MigrationHandler';
import type { MigrationMetaPayload } from '../migrationProtocol';

describe('MigrationHandler', () => {
  const meta: MigrationMetaPayload = {
    migrationId: 'm1',
    cardCount: 5,
    payloadSize: 30,
    payloadHash: 'abc123',
    totalChunks: 3,
  };

  it('validateMigrationMeta rejects invalid meta', () => {
    expect(validateMigrationMeta(null)).toBe(false);
    expect(validateMigrationMeta({ ...meta, totalChunks: 0 })).toBe(false);
  });

  it('validateMigrationMeta accepts valid meta', () => {
    expect(validateMigrationMeta(meta)).toBe(true);
  });

  it('stores chunks and assembles in order', () => {
    let state = createChunkState();
    state = storeChunk(state, 0, 'aaa', meta);
    state = storeChunk(state, 1, 'bbb');
    state = storeChunk(state, 2, 'ccc');
    expect(computeMigrationProgress(state)).toBe(100);
    expect(isMigrationComplete(state)).toBe(true);
    expect(assembleChunks(state)).toBe('aaabbbccc');
  });

  it('returns null assemble until all chunks present', () => {
    let state = storeChunk(createChunkState(), 0, 'x', meta);
    expect(assembleChunks(state)).toBeNull();
    expect(computeMigrationProgress(state)).toBe(33);
  });
});
