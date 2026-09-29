import { describe, expect, it } from 'vitest';
import {
  replaceVaultCards,
  shouldPauseForVaultFork,
  parseVaultForkInner,
  parseVaultForkDecisionInner,
  parseVaultForkDeferRecord,
  shouldKeepDeferredVaultFork,
  shouldBlockIncrementalSync,
} from './vaultFork';
import type { PasswordCard } from '../types';

const card = (id: string, title: string): PasswordCard =>
  ({
    id,
    type: 'PASSWORD',
    title,
    icon: { type: 'icon', value: 'globe' },
    username: '',
    passwordList: ['x'],
    link: '',
    notes: '',
    creation_date: '2020-01-01T00:00:00.000Z',
    last_update: '2020-01-01T00:00:00.000Z',
    tags: [],
  }) as PasswordCard;

describe('shouldPauseForVaultFork', () => {
  it('does not pause on first pin (empty previous salt)', () => {
    expect(
      shouldPauseForVaultFork({
        previousPinnedSalt: '',
        challengeSalt: 'new-salt',
        localCardCount: 300,
      })
    ).toBe(false);
  });

  it('does not pause when salts match (reinstall + same vault)', () => {
    expect(
      shouldPauseForVaultFork({
        previousPinnedSalt: 'same',
        challengeSalt: 'same',
        localCardCount: 300,
      })
    ).toBe(false);
  });

  it('does not pause when the PWA has no cards and no offline vault', () => {
    expect(
      shouldPauseForVaultFork({
        previousPinnedSalt: 'old',
        challengeSalt: 'new',
        localCardCount: 0,
      })
    ).toBe(false);
  });

  it('pauses when salt rotated even if cards are still encrypted in IndexedDB', () => {
    expect(
      shouldPauseForVaultFork({
        previousPinnedSalt: 'old',
        challengeSalt: 'new',
        localCardCount: 0,
        hasOfflineVault: true,
      })
    ).toBe(true);
  });

  it('pauses when salt rotated and the PWA still has cards', () => {
    expect(
      shouldPauseForVaultFork({
        previousPinnedSalt: 'old',
        challengeSalt: 'new',
        localCardCount: 1,
      })
    ).toBe(true);
  });
});

describe('replaceVaultCards', () => {
  it('keeps only incoming cards and tombstones local-only ids', () => {
    const { cards, extraTombstones } = replaceVaultCards(
      [card('phone-1', 'Test'), card('shared', 'Keep')],
      [card('pwa-a', 'A'), card('pwa-b', 'B')],
      '2026-08-24T00:00:00.000Z'
    );
    expect(cards.map((c) => c.id)).toEqual(['pwa-a', 'pwa-b']);
    expect(extraTombstones).toEqual([
      { id: 'phone-1', deletedAt: '2026-08-24T00:00:00.000Z' },
      { id: 'shared', deletedAt: '2026-08-24T00:00:00.000Z' },
    ]);
  });
});

describe('parseVaultForkInner', () => {
  it('reads card count and encryptedOnly from a decrypted inner', () => {
    expect(parseVaultForkInner({ pwaCardCount: 300.9, encryptedOnly: true })).toEqual({
      pwaCardCount: 300,
      encryptedOnly: true,
    });
    expect(parseVaultForkInner({ pwaCardCount: -1 })).toEqual({
      pwaCardCount: 0,
      encryptedOnly: false,
    });
    expect(parseVaultForkInner(null)).toBeNull();
  });
});

describe('parseVaultForkDeferRecord', () => {
  it('accepts two distinct salts', () => {
    expect(parseVaultForkDeferRecord({ previousSalt: ' old ', phoneSalt: 'new' })).toEqual({
      previousSalt: 'old',
      phoneSalt: 'new',
    });
  });

  it('rejects missing, equal, or non-string salts', () => {
    expect(parseVaultForkDeferRecord(null)).toBeNull();
    expect(parseVaultForkDeferRecord({ previousSalt: 'same', phoneSalt: 'same' })).toBeNull();
    expect(parseVaultForkDeferRecord({ previousSalt: 'old', phoneSalt: '' })).toBeNull();
    expect(parseVaultForkDeferRecord({ previousSalt: 1, phoneSalt: 'new' })).toBeNull();
  });
});

describe('shouldKeepDeferredVaultFork', () => {
  const deferred = { previousSalt: 'old', phoneSalt: 'new' };

  it('keeps the pause while the challenge is still the deferred phone salt', () => {
    expect(shouldKeepDeferredVaultFork({ deferred, challengeSalt: 'new' })).toBe(true);
  });

  it('lifts when the phone is back on the browser salt', () => {
    expect(shouldKeepDeferredVaultFork({ deferred, challengeSalt: 'old' })).toBe(false);
  });

  it('does not apply to a third generation (live salt mismatch handles that)', () => {
    expect(shouldKeepDeferredVaultFork({ deferred, challengeSalt: 'third' })).toBe(false);
  });
});

describe('shouldBlockIncrementalSync', () => {
  it('blocks a deferred phone salt even when pinned salt was overwritten to match', () => {
    expect(
      shouldBlockIncrementalSync({
        previousPinnedSalt: 'new',
        challengeSalt: 'new',
        localCardCount: 1,
        deferred: { previousSalt: 'old', phoneSalt: 'new' },
      })
    ).toBe(true);
  });

  it('does not block when there is no mismatch and no defer record', () => {
    expect(
      shouldBlockIncrementalSync({
        previousPinnedSalt: 'same',
        challengeSalt: 'same',
        localCardCount: 1,
        deferred: null,
      })
    ).toBe(false);
  });
});

describe('parseVaultForkDecisionInner', () => {
  it('accepts the three chooser actions', () => {
    expect(parseVaultForkDecisionInner({ action: 'use_pwa' })).toBe('use_pwa');
    expect(parseVaultForkDecisionInner({ action: 'use_phone' })).toBe('use_phone');
    expect(parseVaultForkDecisionInner({ action: 'defer' })).toBe('defer');
    expect(parseVaultForkDecisionInner({ action: 'merge' })).toBeNull();
  });
});
