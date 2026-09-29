jest.mock('expo-crypto', () => ({
  __esModule: true,
  getRandomBytes: (n: number) => {
    const arr = new Uint8Array(n);
    for (let i = 0; i < n; i++) arr[i] = Math.floor(Math.random() * 256);
    return arr;
  },
}));

import {
  hmacSha256,
  ChallengeStore,
  computeChallengeResponse,
  issueToken,
  verifyToken,
  millisUntilTokenRotation,
  TOKEN_BUCKET_MS,
  signBody,
  verifyBodySignature,
  RateLimiter,
  constantTimeEquals,
} from './syncAuth';
import { spake2Start, spake2Finish, spake2Confirm } from '@pkey/core';

describe('hmacSha256', () => {
  it('is deterministic', () => {
    expect(hmacSha256('key', 'msg')).toBe(hmacSha256('key', 'msg'));
  });

  it('changes with key or message', () => {
    expect(hmacSha256('key1', 'msg')).not.toBe(hmacSha256('key2', 'msg'));
    expect(hmacSha256('key', 'msg1')).not.toBe(hmacSha256('key', 'msg2'));
  });
});

describe('challenge-response', () => {
  const secret = 'a'.repeat(64); // looks like a passwordHash

  it('accepts a valid response', () => {
    const store = new ChallengeStore();
    const challenge = store.create('fp');
    const response = computeChallengeResponse(challenge, secret);
    expect(store.verify('fp', response, secret)).toBe(true);
  });

  it('rejects a wrong secret', () => {
    const store = new ChallengeStore();
    const challenge = store.create('fp');
    const response = computeChallengeResponse(challenge, 'wrong');
    expect(store.verify('fp', response, secret)).toBe(false);
  });

  it('is single-use (replay rejected)', () => {
    const store = new ChallengeStore();
    const challenge = store.create('fp');
    const response = computeChallengeResponse(challenge, secret);
    expect(store.verify('fp', response, secret)).toBe(true);
    expect(store.verify('fp', response, secret)).toBe(false);
  });

  it('rejects expired challenges', () => {
    const store = new ChallengeStore();
    const t0 = 1_000_000;
    const challenge = store.create('fp', t0);
    const response = computeChallengeResponse(challenge, secret);
    expect(store.verify('fp', response, secret, t0 + 61_000)).toBe(false);
  });

  it('verifies a SPAKE2 confirmation', () => {
    const store = new ChallengeStore();
    const challenge = store.create('fp', Date.now(), secret);
    const share = store.spakeShareOf('fp');
    expect(share).toBeTruthy();
    const mine = spake2Start(secret, 'B');
    const shared = spake2Finish(secret, mine, share, 'B');
    expect(store.verifySpake2('fp', mine.shareHex, spake2Confirm(shared, challenge), secret)).toBe(
      shared
    );
  });
});

describe('session tokens', () => {
  it('verifies a freshly issued token', () => {
    const token = issueToken('session1', 'serverSecret');
    expect(verifyToken(token, 'session1', 'serverSecret')).toBe(true);
  });

  it('rejects a token for a different session', () => {
    const token = issueToken('session1', 'serverSecret');
    expect(verifyToken(token, 'session2', 'serverSecret')).toBe(false);
  });

  it('accepts a token from the previous 15-min bucket (grace period)', () => {
    // After A2: bucket = 15 min. `now` is 5 s into the current bucket.
    const now = 10 * TOKEN_BUCKET_MS + 5_000;
    const prev = now - TOKEN_BUCKET_MS;
    const token = issueToken('s', 'secret', prev);
    expect(verifyToken(token, 's', 'secret', now)).toBe(true);
  });

  it('rejects a token older than the grace period (older than 2 buckets)', () => {
    const now = 10 * TOKEN_BUCKET_MS;
    const old = now - 3 * TOKEN_BUCKET_MS;
    const token = issueToken('s', 'secret', old);
    expect(verifyToken(token, 's', 'secret', now)).toBe(false);
  });

  it('millisUntilTokenRotation counts down to the next bucket boundary', () => {
    const start = 42 * TOKEN_BUCKET_MS;
    expect(millisUntilTokenRotation(start)).toBe(TOKEN_BUCKET_MS);
    expect(millisUntilTokenRotation(start + 1_000)).toBe(TOKEN_BUCKET_MS - 1_000);
    // At exactly the boundary: full new bucket ahead.
    expect(millisUntilTokenRotation(43 * TOKEN_BUCKET_MS)).toBe(TOKEN_BUCKET_MS);
  });
});

describe('body signing', () => {
  it('verifies an untampered body', () => {
    const sig = signBody('{"a":1}', 'token');
    expect(verifyBodySignature('{"a":1}', sig, 'token')).toBe(true);
  });

  it('rejects a tampered body', () => {
    const sig = signBody('{"a":1}', 'token');
    expect(verifyBodySignature('{"a":2}', sig, 'token')).toBe(false);
  });
});

describe('RateLimiter', () => {
  it('blocks after max failures', () => {
    const rl = new RateLimiter(3, 1000);
    const t0 = 1000;
    expect(rl.isBlocked('ip', t0)).toBe(false);
    rl.recordFailure('ip', t0);
    rl.recordFailure('ip', t0);
    rl.recordFailure('ip', t0);
    expect(rl.isBlocked('ip', t0)).toBe(true);
  });

  it('unblocks after the window elapses', () => {
    const rl = new RateLimiter(1, 1000);
    const t0 = 1000;
    rl.recordFailure('ip', t0);
    expect(rl.isBlocked('ip', t0)).toBe(true);
    expect(rl.isBlocked('ip', t0 + 1001)).toBe(false);
  });

  it('clears state on success', () => {
    const rl = new RateLimiter(2, 1000);
    const t0 = 1000;
    rl.recordFailure('ip', t0);
    rl.recordSuccess('ip');
    rl.recordFailure('ip', t0);
    expect(rl.isBlocked('ip', t0)).toBe(false);
  });
});

describe('constantTimeEquals', () => {
  it('matches equal strings and rejects others', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'ab')).toBe(false);
  });
});
