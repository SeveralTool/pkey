import { describe, expect, it } from 'vitest';
import { generateUuidV4 } from './secureRandom';
import {
  formatVaultSessionRef,
  sanitizePublicSessionId,
  sanitizeSessionCreatedAt,
} from './sessionDisplay';

const UUID = '550e8400-e29b-41d4-a716-446655440000';

describe('formatVaultSessionRef', () => {
  it('renders a full canonical UUID', () => {
    expect(formatVaultSessionRef(UUID.toUpperCase())).toBe(UUID);
  });

  it('hyphenates a 32-hex legacy session id', () => {
    expect(formatVaultSessionRef('a1b2c3d4e5f6789012345678abcdef01')).toBe(
      'a1b2c3d4-e5f6-7890-1234-5678abcdef01'
    );
  });

  it('returns empty for too-short or non-hex input', () => {
    expect(formatVaultSessionRef('')).toBe('');
    expect(formatVaultSessionRef('sess')).toBe('');
    expect(formatVaultSessionRef('abc')).toBe('');
    expect(formatVaultSessionRef('a1b2c3d4e5f67890')).toBe('');
  });
});

describe('sanitizePublicSessionId', () => {
  it('canonicalizes UUID and 32-hex input', () => {
    expect(sanitizePublicSessionId(UUID.toUpperCase())).toBe(UUID);
    expect(sanitizePublicSessionId('ab'.repeat(16))).toBe('abababab-abab-abab-abab-abababababab');
  });

  it('rejects short or non-hex values', () => {
    expect(sanitizePublicSessionId('abc')).toBe('');
    expect(sanitizePublicSessionId('sess')).toBe('');
    expect(sanitizePublicSessionId(null)).toBe('');
  });
});

describe('sanitizeSessionCreatedAt', () => {
  it('normalizes a valid date to ISO', () => {
    expect(sanitizeSessionCreatedAt('2020-01-01T00:00:00.000Z')).toBe('2020-01-01T00:00:00.000Z');
  });

  it('rejects garbage', () => {
    expect(sanitizeSessionCreatedAt('')).toBe('');
    expect(sanitizeSessionCreatedAt('not-a-date')).toBe('');
    expect(sanitizeSessionCreatedAt(1)).toBe('');
  });
});

describe('generateUuidV4', () => {
  it('returns RFC 4122 version-4 layout', () => {
    const id = generateUuidV4();
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});
