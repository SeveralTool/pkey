// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  buildCandidates,
  shouldReconnectDirect,
  probeWs,
  MDNS_TIMEOUT_MS,
  IP_TIMEOUT_MS,
} from './discovery';
import type { ServerIdentity } from './serverIdentity';
import { installMockWebSocket } from '../test/mockWebSocket';

const identity = (overrides: Partial<ServerIdentity> = {}): ServerIdentity => ({
  deviceId: 'dev-1',
  mdnsHost: 'pkey-android-abcd.local',
  ip: '192.168.1.5',
  salt: 'saltabcdefghijkl',
  generatedAt: 1,
  updatedAt: 1,
  lastSuccessAt: 0,
  ...overrides,
});

const MASTER = '192.168.1.9:7392';
const challengeReply = { type: 'challenge', challenge: 'abc', salt: 'saltabcdefghijkl', serverProof: 'proof' };

let mock: { restore: () => void } | null = null;

afterEach(() => {
  mock?.restore();
  mock = null;
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('buildCandidates', () => {
  it('orders mdns first, then the last IP, then the sweep marker', () => {
    const cands = buildCandidates(identity(), '192.168.1.9:7392', '7392');
    expect(cands).toEqual([
      { host: 'pkey-android-abcd.local:7392', kind: 'mdns', timeoutMs: MDNS_TIMEOUT_MS },
      { host: '192.168.1.5:7392', kind: 'ip', timeoutMs: IP_TIMEOUT_MS },
      { host: '', kind: 'sweep', timeoutMs: 0 },
    ]);
  });

  it('dedups candidates equal to the current host', () => {
    const cands = buildCandidates(identity(), 'pkey-android-abcd.local:7392', '7392');
    expect(cands.map((c) => c.kind)).toEqual(['ip', 'sweep']);
  });

  it('dedups when the last IP equals the current host', () => {
    const cands = buildCandidates(identity({ ip: '192.168.1.9' }), '192.168.1.9:7392', '7392');
    expect(cands.map((c) => c.kind)).toEqual(['mdns', 'sweep']);
  });

  it('skips empty mdns/ip and returns the sweep marker alone', () => {
    const cands = buildCandidates(identity({ mdnsHost: '', ip: '' }), '192.168.1.9:7392', '7392');
    expect(cands).toEqual([{ host: '', kind: 'sweep', timeoutMs: 0 }]);
  });

  it('returns no candidates without an identity', () => {
    expect(buildCandidates(null, '192.168.1.9:7392', '7392')).toEqual([]);
  });

  it('keeps an explicit port on mdnsHost (two-port reconnect / e2e)', () => {
    const cands = buildCandidates(
      identity({ mdnsHost: '127.0.0.1:7393' }),
      '127.0.0.1:7392',
      '7392'
    );
    expect(cands[0]).toEqual({
      host: '127.0.0.1:7393',
      kind: 'mdns',
      timeoutMs: MDNS_TIMEOUT_MS,
    });
  });
});

describe('shouldReconnectDirect', () => {
  const now = 5_000_000_000;

  it('reconnects directly on a microcut (recent success)', () => {
    expect(
      shouldReconnectDirect(identity({ lastSuccessAt: now - 5_000 }), '192.168.1.9:7392', now)
    ).toBe(true);
  });

  it('probes alternatives when the last success is old and the host is an IP', () => {
    expect(
      shouldReconnectDirect(identity({ lastSuccessAt: now - 120_000 }), '192.168.1.9:7392', now)
    ).toBe(false);
  });

  it('reconnects directly for stable hostnames even after a long gap', () => {
    expect(
      shouldReconnectDirect(
        identity({ lastSuccessAt: now - 120_000 }),
        'pkey-android-abcd.local:7392',
        now
      )
    ).toBe(true);
  });

  it('returns false without an identity', () => {
    expect(shouldReconnectDirect(null, '192.168.1.9:7392', now)).toBe(false);
  });
});

describe('probeWs', () => {
  it('accepts a host whose challenge passes the verifier', async () => {
    const handle = installMockWebSocket({
      reachable: (host) => host === MASTER,
      reply: () => challengeReply,
    });
    mock = handle;
    expect(await probeWs(MASTER, 1500, () => true)).toBe(true);
    expect(handle.instances[0].url).toBe(`ws://${MASTER}/pkey/ws`);
  });

  it('asks only for a challenge, with a throwaway source id and a fresh nonce', async () => {
    const handle = installMockWebSocket({
      reachable: () => true,
      reply: () => challengeReply,
    });
    mock = handle;
    const nonces: string[] = [];
    await probeWs(MASTER, 1500, (_c, nonce) => {
      nonces.push(nonce);
      return true;
    });
    await probeWs(MASTER, 1500, (_c, nonce) => {
      nonces.push(nonce);
      return true;
    });

    const first = handle.instances[0].sent;
    expect(first).toHaveLength(1);
    expect(first[0].type).toBe('challenge_request');
    expect(String(first[0].sourceId)).toMatch(/^probe-/);
    expect(first[0].clientNonce).toBe(nonces[0]);
    expect(nonces[0]).not.toBe(nonces[1]);
    // Nothing derived from the password is ever sent by a probe.
    expect(handle.instances.some((i) => i.sent.some((m) => m.type === 'auth'))).toBe(false);
  });

  it('passes the challenge salt and proof to the verifier', async () => {
    mock = installMockWebSocket({ reachable: () => true, reply: () => challengeReply });
    let seen: unknown = null;
    await probeWs(MASTER, 1500, (c) => {
      seen = c;
      return true;
    });
    expect(seen).toEqual({ salt: 'saltabcdefghijkl', serverProof: 'proof' });
  });

  it('rejects a host that fails the verifier (impostor on the LAN)', async () => {
    mock = installMockWebSocket({ reachable: () => true, reply: () => challengeReply });
    expect(await probeWs(MASTER, 1500, () => false)).toBe(false);
  });

  it('rejects an unreachable host', async () => {
    mock = installMockWebSocket({ reachable: () => false });
    expect(await probeWs('192.168.1.44:7392', 1500, () => true)).toBe(false);
  });

  it('rejects a peer that answers something other than a challenge', async () => {
    mock = installMockWebSocket({
      reachable: () => true,
      reply: () => ({ type: 'error', code: 'RATE_LIMITED' }),
    });
    expect(await probeWs(MASTER, 1500, () => true)).toBe(false);
  });

  it('rejects a peer that answers garbage', async () => {
    mock = installMockWebSocket({ reachable: () => true, reply: () => 'not-json' });
    expect(await probeWs(MASTER, 1500, () => true)).toBe(false);
  });

  it('gives up when the peer stays silent past the timeout', async () => {
    vi.useFakeTimers();
    mock = installMockWebSocket({ reachable: () => true });
    const pending = probeWs(MASTER, 1000, () => true);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await pending).toBe(false);
  });

  it('rejects an empty host without opening a socket', async () => {
    const handle = installMockWebSocket({ reachable: () => true });
    mock = handle;
    expect(await probeWs('', 1500, () => true)).toBe(false);
    expect(handle.instances).toHaveLength(0);
  });
});
