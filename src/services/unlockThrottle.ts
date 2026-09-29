/**
 * @fileoverview Persistent lockout for the local vault unlock.
 *
 * Mirrors the semantics of `RateLimiter` in syncAuth.ts (N failures -> fixed
 * block window, reset on success) but persists state in SecureStore so
 * restarting the app does not clear the block.
 *
 * Only the manual password unlock is throttled; biometric unlock is already
 * rate limited by the OS.
 */
import * as SecureStore from 'expo-secure-store';

const THROTTLE_STORE_KEY = 'pkey_unlock_throttle_v1';

/** Device-bound: the lockout state must not migrate via backups. */
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

export const UNLOCK_MAX_FAILURES = 5;
export const UNLOCK_BLOCK_MS = 3 * 60_000;
/** Second throttle tier (audit M3). */
export const UNLOCK_BLOCK_TIER2_FAILURES = 8;
export const UNLOCK_BLOCK_TIER2_MS = 15 * 60_000;
/** Third throttle tier (audit M3). Offline attacks still ignore this; the KDF is the real defense. */
export const UNLOCK_BLOCK_TIER3_FAILURES = 10;
export const UNLOCK_BLOCK_TIER3_MS = 60 * 60_000;

function blockDurationMs(failures: number): number {
  if (failures >= UNLOCK_BLOCK_TIER3_FAILURES) return UNLOCK_BLOCK_TIER3_MS;
  if (failures >= UNLOCK_BLOCK_TIER2_FAILURES) return UNLOCK_BLOCK_TIER2_MS;
  if (failures >= UNLOCK_MAX_FAILURES) return UNLOCK_BLOCK_MS;
  return 0;
}

interface ThrottleState {
  failures: number;
  blockedUntil: number;
}

/** In-memory mirror of the persisted state; null until first load. */
let cachedState: ThrottleState | null = null;

function parseState(raw: string | null): ThrottleState {
  if (!raw) return { failures: 0, blockedUntil: 0 };
  try {
    const parsed = JSON.parse(raw) as Partial<ThrottleState>;
    if (typeof parsed.failures === 'number' && typeof parsed.blockedUntil === 'number') {
      return { failures: parsed.failures, blockedUntil: parsed.blockedUntil };
    }
  } catch {
    /* corrupted state: start clean */
  }
  return { failures: 0, blockedUntil: 0 };
}

async function loadState(): Promise<ThrottleState> {
  if (cachedState) return cachedState;
  let raw: string | null = null;
  try {
    raw = await SecureStore.getItemAsync(THROTTLE_STORE_KEY, STORE_OPTIONS);
  } catch (e) {
    console.warn('[unlockThrottle] state read failed', e);
  }
  cachedState = parseState(raw);
  return cachedState;
}

async function saveState(state: ThrottleState): Promise<void> {
  cachedState = state;
  try {
    if (state.failures === 0 && state.blockedUntil === 0) {
      await SecureStore.deleteItemAsync(THROTTLE_STORE_KEY);
    } else {
      await SecureStore.setItemAsync(THROTTLE_STORE_KEY, JSON.stringify(state), STORE_OPTIONS);
    }
  } catch (e) {
    console.warn('[unlockThrottle] state write failed', e);
  }
}

/**
 * Remaining block time in ms (0 when unlock attempts are allowed).
 * An expired block resets the failure counter, like RateLimiter does.
 */
export async function getUnlockBlockRemainingMs(now: number = Date.now()): Promise<number> {
  const state = await loadState();
  if (state.blockedUntil > now) return state.blockedUntil - now;
  if (state.blockedUntil !== 0) {
    await saveState({ failures: 0, blockedUntil: 0 });
  }
  return 0;
}

/**
 * Records a failed password unlock. Returns the remaining block time in ms
 * when the failure triggered (or extended into) a block, otherwise 0.
 */
export async function recordUnlockFailure(now: number = Date.now()): Promise<number> {
  const state = await loadState();
  const failures = state.failures + 1;
  const duration = blockDurationMs(failures);
  const blockedUntil = duration > 0 ? now + duration : state.blockedUntil;
  await saveState({ failures, blockedUntil });
  return blockedUntil > now ? blockedUntil - now : 0;
}

/** Clears the failure counter and any active block after a successful unlock. */
export async function recordUnlockSuccess(): Promise<void> {
  await saveState({ failures: 0, blockedUntil: 0 });
}

/** Test helper: drops the in-memory cache so the next call re-reads storage. */
export function resetUnlockThrottleCacheForTests(): void {
  cachedState = null;
}
