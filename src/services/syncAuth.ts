/**
 * @fileoverview Authentication & message integrity for multi-device sync.
 *
 * Threat model: LAN web access is plain HTTP/WS on a trusted local network,
 * with E2E vault crypto. We must avoid sending the master secret over the wire
 * and prevent replay/tampering even if transport is MITM'd on a hostile network.
 *
 * Approach:
 *  - Challenge-response: the master issues a single-use nonce; the satellite
 *    proves knowledge of `passwordHash` via HMAC without ever sending it.
 *  - HMAC request signing: each request body is signed with the session token
 *    so a tampered or replayed body is rejected.
 *  - Rate limiting: repeated auth failures from an IP get temporarily blocked.
 *
 * All HMAC inputs here are ASCII (hex / base64), so the string-based SHA-256
 * stays byte-clean. Both peers run this identical code, guaranteeing consistency.
 */
import { HmacSHA256, Hex } from 'crypto-es';
import { getSecureRandomInt } from '../utils/secureRandom';
import { spake2Start, spake2Finish, spake2Confirm, type Spake2Share } from '@pkey/core';

/**
 * HMAC-SHA256 over ASCII inputs, built on standard crypto-es.
 */
export const hmacSha256 = (key: string, message: string): string => {
  return HmacSHA256(message, key).toString(Hex);
};

/**
 * Generates a random hex nonce using the OS CSPRNG.
 */
export const generateNonce = (bytes = 32): string => {
  let hex = '';
  for (let i = 0; i < bytes; i++) {
    hex += getSecureRandomInt(256).toString(16).padStart(2, '0');
  }
  return hex;
};

/* ------------------------------------------------------------------ *
 * Challenge-response (master side)
 * ------------------------------------------------------------------ */

interface ChallengeEntry {
  challenge: string;
  expiresAt: number;
  spake?: Spake2Share;
}

const CHALLENGE_TTL_MS = 60_000;
/**
 * Max live entries kept in the store. When a hostile client rotates its
 * session fingerprint on every request, this cap forces LRU eviction so an
 * attacker cannot exhaust memory (audit finding M1). Chosen to comfortably
 * cover the realistic upper bound (dozens of concurrent PWA tabs across a
 * household network).
 */
const CHALLENGE_MAX_ENTRIES = 100;

export class ChallengeStore {
  /**
   * Map iteration order preserves insertion order in JS, so re-inserting a
   * key on access is enough to implement a small LRU without extra structures.
   */
  private store = new Map<string, ChallengeEntry>();

  constructor(private maxEntries: number = CHALLENGE_MAX_ENTRIES) {}

  private touchLru(key: string, entry: ChallengeEntry): void {
    // Re-insert to move to the "most recently used" end.
    this.store.delete(key);
    this.store.set(key, entry);
  }

  private evictIfFull(now: number = Date.now()): void {
    if (this.store.size < this.maxEntries) return;
    // Opportunistically drop expired entries first.
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
      if (this.store.size < this.maxEntries) return;
    }
    // Still full — drop the oldest (first in insertion order).
    const oldestKey = this.store.keys().next().value as string | undefined;
    if (oldestKey !== undefined) this.store.delete(oldestKey);
  }

  /**
   * Issues a single-use challenge bound to a session fingerprint.
   * When `passwordHash` is set, also stores the master's SPAKE2 share (protocol v3).
   */
  create(sessionFingerprint: string, now: number = Date.now(), passwordHash?: string): string {
    this.evictIfFull(now);
    const challenge = generateNonce(32);
    const entry: ChallengeEntry = { challenge, expiresAt: now + CHALLENGE_TTL_MS };
    if (passwordHash) {
      entry.spake = spake2Start(passwordHash, 'A');
    }
    this.store.set(sessionFingerprint, entry);
    return challenge;
  }

  /** Peeks at the pending SPAKE2 share without consuming the challenge. */
  spakeShareOf(sessionFingerprint: string): string | undefined {
    return this.store.get(sessionFingerprint)?.spake?.shareHex;
  }

  /**
   * Verifies a satellite's HMAC response and consumes the challenge (single-use).
   * `expectedSecret` is the master's own passwordHash.
   */
  verify(
    sessionFingerprint: string,
    response: string,
    expectedSecret: string,
    now: number = Date.now()
  ): boolean {
    const entry = this.store.get(sessionFingerprint);
    if (!entry) return false;
    // Consume immediately to enforce single-use regardless of outcome.
    this.store.delete(sessionFingerprint);
    if (now > entry.expiresAt) return false;

    const expected = hmacSha256(expectedSecret, entry.challenge);
    return constantTimeEquals(expected, response);
  }

  /**
   * Verifies a SPAKE2 confirmation and consumes the challenge.
   * Returns the shared secret hex, or `null` on failure.
   */
  verifySpake2(
    sessionFingerprint: string,
    peerShareHex: string,
    confirm: string,
    passwordHash: string,
    now: number = Date.now()
  ): string | null {
    const entry = this.store.get(sessionFingerprint);
    if (!entry?.spake) return null;
    this.store.delete(sessionFingerprint);
    if (now > entry.expiresAt) return null;
    try {
      const shared = spake2Finish(passwordHash, entry.spake, peerShareHex, 'A');
      if (!constantTimeEquals(spake2Confirm(shared, entry.challenge), confirm)) return null;
      return shared;
    } catch {
      return null;
    }
  }

  /** Removes expired challenges (call periodically). */
  prune(now: number = Date.now()): void {
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) this.store.delete(key);
    }
  }

  /** Discards a pending challenge without verifying (fresh-device migration path). */
  consume(sessionFingerprint: string): void {
    this.store.delete(sessionFingerprint);
  }

  /** Test / observability accessor. */
  size(): number {
    return this.store.size;
  }
}

/**
 * Satellite side: computes the response to a challenge using the local
 * passwordHash (the shared secret). The secret never leaves the device.
 */
export const computeChallengeResponse = (challenge: string, passwordHash: string): string => {
  return hmacSha256(passwordHash, challenge);
};

/* ------------------------------------------------------------------ *
 * Session tokens (stateless, short-bucket rotation)
 * ------------------------------------------------------------------ */

/**
 * Bucket size for stateless token derivation. Trimmed from 1 hour → 15 min
 * after audit finding A2. A stolen token now expires within ~15 min in the
 * worst case (bucket start + grace) instead of ~2 hours.
 *
 * Trade-off: with a 15 min bucket the satellite must silently re-derive its
 * token roughly every 15 min. The web-client already handles token refresh
 * transparently on `UNAUTHORIZED` responses (see appStore `sync_error_auth`
 * path), so this is invisible to users.
 */
export const TOKEN_BUCKET_MS = 15 * 60_000;

/**
 * Issues a stateless bearer token derived from the session + a server secret +
 * the current bucket. Expires automatically; no server-side storage required.
 */
export const issueToken = (
  sessionId: string,
  serverSecret: string,
  now: number = Date.now()
): string => {
  const bucket = Math.floor(now / TOKEN_BUCKET_MS);
  return hmacSha256(serverSecret, `${sessionId}:${bucket}`);
};

/**
 * Validates a token against the current and previous bucket (grace period
 * covering the bucket boundary; the previous bucket gives 15 min of overlap
 * so an in-flight request doesn't fail exactly on the rotation instant).
 */
export const verifyToken = (
  token: string,
  sessionId: string,
  serverSecret: string,
  now: number = Date.now()
): boolean => {
  const bucket = Math.floor(now / TOKEN_BUCKET_MS);
  for (const b of [bucket, bucket - 1]) {
    const expected = hmacSha256(serverSecret, `${sessionId}:${b}`);
    if (constantTimeEquals(expected, token)) return true;
  }
  return false;
};

/**
 * Returns the number of milliseconds until the current token bucket rotates
 * to the next value. Satellites can subscribe to this to preemptively
 * re-derive their token *before* the current one becomes invalid.
 */
export const millisUntilTokenRotation = (now: number = Date.now()): number => {
  const nextBoundary = (Math.floor(now / TOKEN_BUCKET_MS) + 1) * TOKEN_BUCKET_MS;
  return Math.max(0, nextBoundary - now);
};

/* ------------------------------------------------------------------ *
 * Request body signing
 * ------------------------------------------------------------------ */

export const signBody = (body: string, token: string): string => hmacSha256(token, body);

export const verifyBodySignature = (body: string, signature: string, token: string): boolean => {
  return constantTimeEquals(hmacSha256(token, body), signature);
};

/* ------------------------------------------------------------------ *
 * Rate limiting (master side, in-memory)
 * ------------------------------------------------------------------ */

interface RateEntry {
  failures: number;
  blockedUntil: number;
}

/**
 * Tightened after audit finding M7. 5 failures × 10 min was too lenient for a
 * password-manager auth surface — an on-LAN attacker (e.g. compromised IoT
 * device on the same Wi-Fi) had 30 attempts per hour before the block.
 *
 * New defaults: 3 failures triggers a 15-minute lockout. Legitimate typos on
 * the master password still recover quickly, but a brute-force pattern is
 * throttled aggressively.
 *
 * The value is still overridable via the constructor for tests and for callers
 * that need a permissive tier (e.g. `ipRateLimiter` in `syncServerCore` uses
 * looser bounds because IP is easy to spoof on LAN — the sourceId-scoped
 * limiter is the primary defense).
 */
const MAX_FAILURES = 3;
const BLOCK_MS = 15 * 60_000;

export class RateLimiter {
  private entries = new Map<string, RateEntry>();

  constructor(
    private maxFailures: number = MAX_FAILURES,
    private blockMs: number = BLOCK_MS
  ) {}

  isBlocked(ip: string, now: number = Date.now()): boolean {
    const entry = this.entries.get(ip);
    if (!entry) return false;
    if (entry.blockedUntil > now) return true;
    // Block expired: reset.
    if (entry.blockedUntil !== 0 && entry.blockedUntil <= now) {
      this.entries.delete(ip);
    }
    return false;
  }

  recordFailure(ip: string, now: number = Date.now()): void {
    const entry = this.entries.get(ip) || { failures: 0, blockedUntil: 0 };
    entry.failures += 1;
    if (entry.failures >= this.maxFailures) {
      entry.blockedUntil = now + this.blockMs;
    }
    this.entries.set(ip, entry);
  }

  recordSuccess(ip: string): void {
    this.entries.delete(ip);
  }
}

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/**
 * Length-constant string comparison to avoid timing side-channels on token /
 * signature verification.
 */
export const constantTimeEquals = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
};
