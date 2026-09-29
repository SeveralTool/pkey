import type { MigrationMetaPayload } from '../migrationProtocol';

export interface MigrationChunkState {
  meta: MigrationMetaPayload | null;
  chunks: Map<number, string>;
}

export function createChunkState(): MigrationChunkState {
  return { meta: null, chunks: new Map() };
}

export function validateMigrationMeta(meta: MigrationMetaPayload | null): boolean {
  if (!meta) return false;
  if (!meta.migrationId) return false;
  if (typeof meta.totalChunks !== 'number' || meta.totalChunks < 1) return false;
  if (typeof meta.payloadSize !== 'number' || meta.payloadSize < 1) return false;
  if (!meta.payloadHash) return false;
  return true;
}

export function storeChunk(
  state: MigrationChunkState,
  index: number,
  data: string,
  meta?: MigrationMetaPayload
): MigrationChunkState {
  const chunks = new Map(state.chunks);
  chunks.set(index, data);
  return {
    meta: meta ?? state.meta,
    chunks,
  };
}

export function computeMigrationProgress(state: MigrationChunkState): number {
  const total = state.meta?.totalChunks ?? 0;
  if (total <= 0) return 0;
  return Math.min(100, Math.round((state.chunks.size / total) * 100));
}

export function assembleChunks(state: MigrationChunkState): string | null {
  const total = state.meta?.totalChunks;
  if (!total || state.chunks.size !== total) return null;
  let assembled = '';
  for (let i = 0; i < total; i++) {
    const chunk = state.chunks.get(i);
    if (chunk === undefined) return null;
    assembled += chunk;
  }
  return assembled;
}

export function isMigrationComplete(state: MigrationChunkState): boolean {
  const total = state.meta?.totalChunks;
  if (!total) return false;
  return state.chunks.size === total && assembleChunks(state) !== null;
}
