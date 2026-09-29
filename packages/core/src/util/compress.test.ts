import { describe, it, expect } from 'vitest';
import { compressPayload, decompressPayload } from './compress';

describe('compressPayload', () => {
  it('round-trips JSON', () => {
    const json = JSON.stringify({ cards: [{ id: '1', title: 'Test' }] });
    const compressed = compressPayload(json);
    expect(decompressPayload(compressed)).toBe(json);
  });
});
