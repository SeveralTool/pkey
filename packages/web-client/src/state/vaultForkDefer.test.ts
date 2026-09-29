// @vitest-environment jsdom
/**
 * @fileoverview Durable "decide later" pause for PWA/phone vault forks.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadVaultForkDefer, saveVaultForkDefer, clearVaultForkDefer } from './vaultForkDefer';

describe('vaultForkDefer storage', () => {
  beforeEach(() => {
    clearVaultForkDefer();
  });

  afterEach(() => {
    clearVaultForkDefer();
  });

  it('round-trips a valid defer record', () => {
    saveVaultForkDefer({ previousSalt: 'old', phoneSalt: 'new' });
    expect(loadVaultForkDefer()).toEqual({ previousSalt: 'old', phoneSalt: 'new' });
  });

  it('ignores a record whose salts match', () => {
    saveVaultForkDefer({ previousSalt: 'same', phoneSalt: 'same' });
    expect(loadVaultForkDefer()).toBeNull();
  });
});
