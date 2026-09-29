/**
 * @fileoverview Password generator settings helpers.
 */
import { describe, expect, it } from 'vitest';
import {
  canDisableGeneratorOption,
  generateRandomPassword,
  isPasswordGeneratorConfigured,
  normalizeGenLength,
  DEFAULT_VAULT_SETTINGS,
} from './password-generator';

describe('password-generator', () => {
  it('rejects incomplete settings and accepts defaults', () => {
    expect(isPasswordGeneratorConfigured({ ...DEFAULT_VAULT_SETTINGS, genLength: 3 })).toBe(false);
    expect(isPasswordGeneratorConfigured(DEFAULT_VAULT_SETTINGS)).toBe(true);
    expect(canDisableGeneratorOption(DEFAULT_VAULT_SETTINGS, 'genSymbols')).toBe(true);
  });

  it('normalizes legacy lengths below 12', () => {
    expect(normalizeGenLength(8)).toBe(12);
    expect(normalizeGenLength(16)).toBe(16);
  });

  it('returns a password of the configured length', () => {
    const pw = generateRandomPassword(DEFAULT_VAULT_SETTINGS);
    expect(pw).toHaveLength(DEFAULT_VAULT_SETTINGS.genLength);
  });
});
