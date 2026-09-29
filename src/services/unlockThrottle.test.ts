/**
 * @fileoverview Unit tests for the persistent unlock lockout (unlockThrottle).
 */

const mockStore = new Map<string, string>();

jest.mock('expo-secure-store', () => ({
  __esModule: true,
  getItemAsync: jest.fn(async (key: string) => mockStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockStore.delete(key);
  }),
}));

import {
  getUnlockBlockRemainingMs,
  recordUnlockFailure,
  recordUnlockSuccess,
  resetUnlockThrottleCacheForTests,
  UNLOCK_BLOCK_MS,
  UNLOCK_BLOCK_TIER2_FAILURES,
  UNLOCK_BLOCK_TIER2_MS,
  UNLOCK_BLOCK_TIER3_FAILURES,
  UNLOCK_BLOCK_TIER3_MS,
  UNLOCK_MAX_FAILURES,
} from './unlockThrottle';

const T0 = 1_000_000;

beforeEach(() => {
  mockStore.clear();
  resetUnlockThrottleCacheForTests();
});

describe('unlockThrottle', () => {
  it('allows attempts with no recorded failures', async () => {
    expect(await getUnlockBlockRemainingMs(T0)).toBe(0);
  });

  it('does not block before reaching the failure threshold', async () => {
    for (let i = 0; i < UNLOCK_MAX_FAILURES - 1; i++) {
      expect(await recordUnlockFailure(T0)).toBe(0);
    }
    expect(await getUnlockBlockRemainingMs(T0)).toBe(0);
  });

  it('blocks for UNLOCK_BLOCK_MS after reaching the threshold', async () => {
    for (let i = 0; i < UNLOCK_MAX_FAILURES - 1; i++) {
      await recordUnlockFailure(T0);
    }
    const remaining = await recordUnlockFailure(T0);
    expect(remaining).toBe(UNLOCK_BLOCK_MS);
    expect(await getUnlockBlockRemainingMs(T0 + 1_000)).toBe(UNLOCK_BLOCK_MS - 1_000);
  });

  it('resets the counter once the block expires', async () => {
    for (let i = 0; i < UNLOCK_MAX_FAILURES; i++) {
      await recordUnlockFailure(T0);
    }
    const afterExpiry = T0 + UNLOCK_BLOCK_MS + 1;
    expect(await getUnlockBlockRemainingMs(afterExpiry)).toBe(0);
    // One new failure right after expiry must not immediately re-block.
    expect(await recordUnlockFailure(afterExpiry)).toBe(0);
  });

  it('clears failures on success', async () => {
    for (let i = 0; i < UNLOCK_MAX_FAILURES - 1; i++) {
      await recordUnlockFailure(T0);
    }
    await recordUnlockSuccess();
    // Counter restarted: the next failure is #1, not #5.
    expect(await recordUnlockFailure(T0)).toBe(0);
    expect(await getUnlockBlockRemainingMs(T0)).toBe(0);
  });

  it('persists the block across an app restart (cache cleared)', async () => {
    for (let i = 0; i < UNLOCK_MAX_FAILURES; i++) {
      await recordUnlockFailure(T0);
    }
    resetUnlockThrottleCacheForTests();
    expect(await getUnlockBlockRemainingMs(T0 + 1)).toBe(UNLOCK_BLOCK_MS - 1);
  });

  it('starts clean when the persisted state is corrupted', async () => {
    mockStore.set('pkey_unlock_throttle_v1', 'not-json');
    expect(await getUnlockBlockRemainingMs(T0)).toBe(0);
    expect(await recordUnlockFailure(T0)).toBe(0);
  });

  it('escalates to 15 minutes at 8 failures (audit M3)', async () => {
    for (let i = 0; i < UNLOCK_BLOCK_TIER2_FAILURES - 1; i++) {
      await recordUnlockFailure(T0);
    }
    const remaining = await recordUnlockFailure(T0);
    expect(remaining).toBe(UNLOCK_BLOCK_TIER2_MS);
  });

  it('escalates to 60 minutes at 10 failures (audit M3)', async () => {
    for (let i = 0; i < UNLOCK_BLOCK_TIER3_FAILURES - 1; i++) {
      await recordUnlockFailure(T0);
    }
    const remaining = await recordUnlockFailure(T0);
    expect(remaining).toBe(UNLOCK_BLOCK_TIER3_MS);
  });
});
