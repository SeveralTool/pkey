// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  runSweep,
  tryRunSweep,
  acquireSweepLock,
  releaseSweepLock,
  hasActiveSweepLock,
  readSweepFound,
  isRfc1918Ipv4,
  isSweepableIpv4,
  LK_SWEEP_LOCK,
  LK_SWEEP_LAST_RUN,
  LK_SWEEP_FOUND,
  SWEEP_LOCK_TTL_MS,
} from './sweep';
import type { ServerIdentity } from './serverIdentity';
import { installMockWebSocket, type MockWsHandle } from '../test/mockWebSocket';

const identity = (): ServerIdentity => ({
  deviceId: 'dev-1',
  mdnsHost: '',
  ip: '192.168.1.5',
  salt: 'saltabcdefghijkl',
  generatedAt: 1,
  updatedAt: 1,
  lastSuccessAt: 0,
});

/** The master lives at .9; every other host in the /24 is dead. */
const MASTER_IP = '192.168.1.9';
const challengeReply = {
  type: 'challenge',
  challenge: 'abc',
  salt: 'saltabcdefghijkl',
  serverProof: 'proof',
};
const acceptAll = () => true;

let mock: MockWsHandle;

const installLan = (opts: { delayMs?: number } = {}) => {
  mock = installMockWebSocket({
    reachable: (host) => host.startsWith(`${MASTER_IP}:`),
    reply: () => challengeReply,
    delayMs: opts.delayMs,
  });
  return mock;
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  mock?.restore();
  vi.unstubAllGlobals();
});

describe('isRfc1918Ipv4', () => {
  it('accepts private ranges and rejects public, CGNAT, loopback, and link-local', () => {
    expect(isRfc1918Ipv4('10.0.0.1')).toBe(true);
    expect(isRfc1918Ipv4('192.168.1.9')).toBe(true);
    expect(isRfc1918Ipv4('172.16.0.1')).toBe(true);
    expect(isRfc1918Ipv4('172.31.255.255')).toBe(true);
    expect(isRfc1918Ipv4('8.8.8.8')).toBe(false);
    expect(isRfc1918Ipv4('100.64.1.2')).toBe(false);
    expect(isRfc1918Ipv4('169.254.10.2')).toBe(false);
    expect(isRfc1918Ipv4('172.32.0.1')).toBe(false);
    expect(isRfc1918Ipv4('127.0.0.1')).toBe(false);
    expect(isRfc1918Ipv4('not-an-ip')).toBe(false);
  });
});

describe('isSweepableIpv4', () => {
  it('allows RFC1918 and loopback, not the public internet', () => {
    expect(isSweepableIpv4('192.168.1.5')).toBe(true);
    expect(isSweepableIpv4('127.0.0.1')).toBe(true);
    expect(isSweepableIpv4('127.0.0.2')).toBe(true);
    expect(isSweepableIpv4('8.8.8.8')).toBe(false);
    expect(isSweepableIpv4('100.64.1.2')).toBe(false);
    expect(isSweepableIpv4('169.254.10.2')).toBe(false);
  });
});

describe('runSweep', () => {
  it('finds the master in the /24 and reports the probed count', async () => {
    installLan();
    const result = await runSweep({ baseIp: '192.168.1.5', verify: acceptAll, port: '7392' });
    expect(result.foundHost).toBe('192.168.1.9:7392');
    expect(result.probed).toBeGreaterThan(0);
  });

  it('does not report a host that fails verification', async () => {
    installLan();
    const result = await runSweep({ baseIp: '192.168.1.5', verify: () => false, port: '7392' });
    expect(result.foundHost).toBeNull();
  });

  it('skips the self address and excluded hosts', async () => {
    const handle = installLan();
    await runSweep({
      baseIp: '192.168.1.5',
      verify: acceptAll,
      port: '7392',
      excludeHosts: ['192.168.1.9:7392', '192.168.1.7'],
    });
    const probed = handle.hosts();
    expect(probed).not.toContain('192.168.1.5:7392');
    expect(probed).not.toContain('192.168.1.7:7392');
    expect(probed).not.toContain('192.168.1.9:7392');
    expect(probed.length).toBeGreaterThan(0);
  });

  it('does not probe at all for an invalid baseIp', async () => {
    const handle = installLan();
    const result = await runSweep({ baseIp: 'not-an-ip', verify: acceptAll, port: '7392' });
    expect(result).toEqual({ foundHost: null, probed: 0 });
    expect(handle.instances).toHaveLength(0);
  });

  it('does not sweep a public IPv4 /24', async () => {
    const handle = installLan();
    const result = await runSweep({ baseIp: '8.8.8.8', verify: acceptAll, port: '7392' });
    expect(result).toEqual({ foundHost: null, probed: 0 });
    expect(handle.instances).toHaveLength(0);
  });

  it('stops when the wall-clock deadline elapses', async () => {
    installLan({ delayMs: 50 });
    const result = await runSweep({
      baseIp: '192.168.1.5',
      verify: acceptAll,
      port: '7392',
      concurrency: 2,
      timeoutMs: 200,
      deadlineMs: 80,
    });
    expect(result.foundHost).toBeNull();
    expect(result.probed).toBeGreaterThan(0);
    expect(result.probed).toBeLessThan(50);
  });

  it('never exceeds the configured concurrency', async () => {
    const handle = installLan({ delayMs: 5 });
    await runSweep({ baseIp: '192.168.1.5', verify: acceptAll, port: '7392', concurrency: 4 });
    expect(handle.maxConcurrent()).toBeLessThanOrEqual(4);
    expect(handle.maxConcurrent()).toBeGreaterThan(0);
  });
});

describe('tryRunSweep guards', () => {
  it('aborts when the tab is hidden', async () => {
    const handle = installLan();
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'visibilityState')!;
    Object.defineProperty(Document.prototype, 'visibilityState', { value: 'hidden' });
    try {
      const result = await tryRunSweep(identity(), {
        baseIp: '192.168.1.5',
        verify: acceptAll,
        port: '7392',
      });
      expect(result).toBeNull();
      expect(handle.instances).toHaveLength(0);
    } finally {
      Object.defineProperty(Document.prototype, 'visibilityState', desc);
    }
  });

  it('aborts when the browser is offline', async () => {
    const handle = installLan();
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')!;
    Object.defineProperty(Navigator.prototype, 'onLine', { value: false });
    try {
      const result = await tryRunSweep(identity(), {
        baseIp: '192.168.1.5',
        verify: acceptAll,
        port: '7392',
      });
      expect(result).toBeNull();
      expect(handle.instances).toHaveLength(0);
    } finally {
      Object.defineProperty(Navigator.prototype, 'onLine', desc);
    }
  });

  it('respects the global cooldown between sweeps', async () => {
    installLan();
    localStorage.setItem(LK_SWEEP_LAST_RUN, String(Date.now() - 60_000));
    const result = await tryRunSweep(identity(), {
      baseIp: '192.168.1.5',
      verify: acceptAll,
      port: '7392',
    });
    expect(result).toBeNull();
  });

  it('skips sweeping while another tab holds the lock', async () => {
    installLan();
    localStorage.setItem(LK_SWEEP_LOCK, JSON.stringify({ at: Date.now() - 1000 }));
    const result = await tryRunSweep(identity(), {
      baseIp: '192.168.1.5',
      verify: acceptAll,
      port: '7392',
    });
    expect(result).toBeNull();
  });

  it('reuses a sibling sweep result instead of probing again', async () => {
    const handle = installLan();
    localStorage.setItem(LK_SWEEP_LOCK, JSON.stringify({ at: Date.now() - 1000 }));
    localStorage.setItem(
      LK_SWEEP_FOUND,
      JSON.stringify({ ip: '192.168.1.9', deviceId: 'dev-1', at: Date.now() - 1000 })
    );
    const result = await tryRunSweep(identity(), {
      baseIp: '192.168.1.5',
      verify: acceptAll,
      port: '7392',
    });
    expect(result).toEqual({ foundHost: '192.168.1.9:7392', probed: 0 });
    expect(handle.instances).toHaveLength(0);
  });

  it('publishes the found host and releases the lock', async () => {
    installLan();
    const result = await tryRunSweep(identity(), {
      baseIp: '192.168.1.5',
      verify: acceptAll,
      port: '7392',
    });
    expect(result?.foundHost).toBe('192.168.1.9:7392');
    const found = JSON.parse(localStorage.getItem(LK_SWEEP_FOUND) || '{}');
    expect(found.ip).toBe('192.168.1.9');
    expect(found.deviceId).toBe('dev-1');
    expect(localStorage.getItem(LK_SWEEP_LOCK)).toBeNull();
  });
});

describe('cross-tab lock primitives', () => {
  const now = Date.now();

  it('acquires a fresh lock and blocks a second tab', () => {
    expect(acquireSweepLock(now)).toBe(true);
    expect(acquireSweepLock(now + 1000)).toBe(false);
    expect(hasActiveSweepLock(now + 2000)).toBe(true);
  });

  it('lets a stale lock expire', () => {
    expect(acquireSweepLock(now)).toBe(true);
    expect(hasActiveSweepLock(now + SWEEP_LOCK_TTL_MS + 1)).toBe(false);
    expect(acquireSweepLock(now + SWEEP_LOCK_TTL_MS + 1)).toBe(true);
  });

  it('release only removes the lock this tab holds', () => {
    expect(acquireSweepLock(now)).toBe(true);
    releaseSweepLock(now);
    expect(hasActiveSweepLock(now + 2000)).toBe(false);
  });

  it('does not release another tab live lock', () => {
    localStorage.setItem(LK_SWEEP_LOCK, JSON.stringify({ at: now }));
    releaseSweepLock(now + 5000);
    expect(hasActiveSweepLock(now + 5000)).toBe(true);
  });
});

describe('readSweepFound', () => {
  it('ignores results from another device or stale entries', () => {
    localStorage.setItem(
      LK_SWEEP_FOUND,
      JSON.stringify({ ip: '192.168.1.9', deviceId: 'other-dev', at: Date.now() })
    );
    expect(readSweepFound('dev-1')).toBe('');
    localStorage.setItem(
      LK_SWEEP_FOUND,
      JSON.stringify({ ip: '192.168.1.9', deviceId: 'dev-1', at: Date.now() - 120_000 })
    );
    expect(readSweepFound('dev-1')).toBe('');
  });
});
