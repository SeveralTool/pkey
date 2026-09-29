// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  loadIdentity,
  saveIdentity,
  clearIdentity,
  fetchMeta,
  normalizeMeta,
  shouldApplyMeta,
  touchIdentitySuccess,
  isIpv4Host,
  type ServerIdentity,
} from './serverIdentity';

const identity = (overrides: Partial<ServerIdentity> = {}): ServerIdentity => ({
  deviceId: 'dev-1',
  mdnsHost: 'pkey-android-abcd.local',
  ip: '192.168.1.5',
  salt: 'saltabcdefghijkl',
  generatedAt: 1000,
  updatedAt: 1000,
  lastSuccessAt: 2000,
  ...overrides,
});

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('persistence', () => {
  it('roundtrips through localStorage (updatedAt re-stamped on save)', () => {
    saveIdentity(identity({ hostProofSecret: 'ab'.repeat(32) }));
    const loaded = loadIdentity();
    expect(loaded).toMatchObject({
      deviceId: 'dev-1',
      mdnsHost: 'pkey-android-abcd.local',
      ip: '192.168.1.5',
      salt: 'saltabcdefghijkl',
      generatedAt: 1000,
      lastSuccessAt: 2000,
      hostProofSecret: 'ab'.repeat(32),
    });
    expect(loaded!.updatedAt).toBeGreaterThanOrEqual(1000);
  });

  it('returns null when absent or corrupted', () => {
    expect(loadIdentity()).toBeNull();
    localStorage.setItem('@pkey/server-identity', '{not json');
    expect(loadIdentity()).toBeNull();
    localStorage.setItem('@pkey/server-identity', JSON.stringify({ ip: '1.2.3.4' }));
    expect(loadIdentity()).toBeNull();
  });

  it('drops a malformed pairing secret on load', () => {
    saveIdentity(identity({ hostProofSecret: 'not-hex' }));
    expect(loadIdentity()?.hostProofSecret).toBeUndefined();
  });

  it('clears the stored identity', () => {
    saveIdentity(identity());
    clearIdentity();
    expect(loadIdentity()).toBeNull();
  });
});

describe('normalizeMeta', () => {
  it('builds a full identity from a valid body', () => {
    const meta = normalizeMeta(
      {
        metaVersion: 1,
        deviceId: 'dev-1',
        mdnsHost: 'pkey-x.local',
        ip: '10.0.0.7',
        generatedAt: 42,
      },
      null
    );
    expect(meta).toMatchObject({
      deviceId: 'dev-1',
      mdnsHost: 'pkey-x.local',
      ip: '10.0.0.7',
      salt: '',
      generatedAt: 42,
    });
    expect(meta!.lastSuccessAt).toBe(0);
  });

  it('keeps language and theme UI hints from meta', () => {
    const meta = normalizeMeta(
      {
        metaVersion: 1,
        deviceId: 'dev-1',
        mdnsHost: '',
        ip: '10.0.0.7',
        language: 'ESP',
        theme: 'AUTO',
      },
      null
    );
    expect(meta!.language).toBe('ESP');
    expect(meta!.theme).toBe('AUTO');
  });

  it('keeps webLoginOnPhone from meta', () => {
    const on = normalizeMeta(
      {
        metaVersion: 1,
        deviceId: 'dev-1',
        mdnsHost: '',
        ip: '10.0.0.7',
        webLoginOnPhone: true,
      },
      null
    );
    expect(on!.webLoginOnPhone).toBe(true);
    const off = normalizeMeta(
      { metaVersion: 1, deviceId: 'dev-1', mdnsHost: '', ip: '10.0.0.7' },
      null
    );
    expect(off!.webLoginOnPhone).toBe(false);
  });

  it('keeps public session id and creation date from meta', () => {
    const meta = normalizeMeta(
      {
        metaVersion: 1,
        deviceId: 'dev-1',
        mdnsHost: '',
        ip: '10.0.0.7',
        sessionId: '550e8400-e29b-41d4-a716-446655440000',
        sessionCreatedAt: '2020-01-01T00:00:00.000Z',
      },
      null
    );
    expect(meta!.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(meta!.sessionCreatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('keeps AUTO language from meta', () => {
    const meta = normalizeMeta(
      {
        metaVersion: 1,
        deviceId: 'dev-1',
        mdnsHost: '',
        ip: '10.0.0.7',
        language: 'AUTO',
        theme: 'DARK',
      },
      null
    );
    expect(meta!.language).toBe('AUTO');
  });

  it('rejects wrong versions and bad shapes', () => {
    expect(normalizeMeta(null, null)).toBeNull();
    expect(normalizeMeta({ metaVersion: 2, deviceId: 'd' }, null)).toBeNull();
    expect(normalizeMeta({ metaVersion: 1, deviceId: '' }, null)).toBeNull();
  });

  it('preserves salt, pairing secret, and lastSuccessAt when the deviceId matches', () => {
    const meta = normalizeMeta(
      { metaVersion: 1, deviceId: 'dev-1', mdnsHost: '', ip: '10.0.0.7', generatedAt: 42 },
      identity({ lastSuccessAt: 9000, salt: 'pinned-salt', hostProofSecret: 'ab'.repeat(32) })
    );
    expect(meta!.lastSuccessAt).toBe(9000);
    expect(meta!.salt).toBe('pinned-salt');
    expect(meta!.hostProofSecret).toBe('ab'.repeat(32));
    expect(meta!.mdnsHost).toBe('pkey-android-abcd.local');
  });

  it('drops salt when the deviceId is a different master', () => {
    const meta = normalizeMeta(
      { metaVersion: 1, deviceId: 'other', mdnsHost: '', ip: '10.0.0.7' },
      identity({ salt: 'pinned-salt', hostProofSecret: 'ab'.repeat(32) })
    );
    expect(meta!.salt).toBe('');
    expect(meta!.lastSuccessAt).toBe(0);
    expect(meta!.hostProofSecret).toBeUndefined();
  });

  it('sanitizes mdnsHost and ip', () => {
    const meta = normalizeMeta(
      {
        metaVersion: 1,
        deviceId: 'd',
        mdnsHost: 'HTTP://PKEY-X.LOCAL:7392',
        ip: '999.1.1.1',
      },
      null
    );
    expect(meta!.mdnsHost).toBe('pkey-x.local:7392');
    expect(meta!.ip).toBe('');
  });

  it('keeps an IPv4 mdnsHost only when it carries an explicit port', () => {
    expect(
      normalizeMeta({ metaVersion: 1, deviceId: 'd', mdnsHost: '127.0.0.1', ip: '' }, null)!
        .mdnsHost
    ).toBe('');
    expect(
      normalizeMeta({ metaVersion: 1, deviceId: 'd', mdnsHost: '127.0.0.1:7393', ip: '' }, null)!
        .mdnsHost
    ).toBe('127.0.0.1:7393');
  });
});

describe('fetchMeta', () => {
  it('fetches the same-origin meta endpoint and normalizes the body', async () => {
    const fetchMock = vi.fn(
      async (url: string) =>
        ({
          ok: true,
          json: async () => ({
            metaVersion: 1,
            deviceId: 'dev-1',
            mdnsHost: 'pkey-x.local',
            ip: '10.0.0.7',
            generatedAt: 42,
          }),
        }) as Response
    );
    vi.stubGlobal('fetch', fetchMock);
    const meta = await fetchMeta(3000, null);
    expect(meta?.ip).toBe('10.0.0.7');
    expect(fetchMock.mock.calls[0][0]).toBe('/pkey/meta');
  });

  it('returns null on non-OK responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false }) as Response)
    );
    expect(await fetchMeta()).toBeNull();
  });

  it('returns null on network errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Promise.reject(new Error('down')))
    );
    expect(await fetchMeta()).toBeNull();
  });

  it('aborts and returns null on timeout', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: { signal: AbortSignal }) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );
    const pending = fetchMeta(2000);
    await vi.advanceTimersByTimeAsync(2500);
    expect(await pending).toBeNull();
  });
});

describe('shouldApplyMeta (race guard)', () => {
  const meta = identity();
  it('never applies when a live connection exists', () => {
    expect(shouldApplyMeta(identity(), meta, true)).toBe(false);
  });
  it('applies when there is no identity yet', () => {
    expect(shouldApplyMeta(null, meta, false)).toBe(true);
  });
  it('rejects meta from a different master', () => {
    expect(shouldApplyMeta(identity({ deviceId: 'other' }), meta, false)).toBe(false);
  });
  it('rejects a failed fetch (null meta)', () => {
    expect(shouldApplyMeta(identity(), null, false)).toBe(false);
  });
});

describe('touchIdentitySuccess', () => {
  it('stores the connected IPv4, pins salt, and bumps lastSuccessAt', () => {
    const before = Date.now();
    const next = touchIdentitySuccess(
      identity({ ip: '10.0.0.1' }),
      '192.168.1.9:7392',
      'new-salt'
    )!;
    expect(next.ip).toBe('192.168.1.9');
    expect(next.salt).toBe('new-salt');
    expect(next.mdnsHost).toBe('pkey-android-abcd.local');
    expect(next.lastSuccessAt).toBeGreaterThanOrEqual(before);
  });

  it('keeps the previous ip for non-IP hosts and records the .local name', () => {
    const next = touchIdentitySuccess(identity({ ip: '10.0.0.1', mdnsHost: '' }), 'pkey-x.local:7392')!;
    expect(next.ip).toBe('10.0.0.1');
    expect(next.mdnsHost).toBe('pkey-x.local');
  });

  it('returns null for a null identity', () => {
    expect(touchIdentitySuccess(null, '192.168.1.9:7392')).toBeNull();
  });
});

describe('isIpv4Host', () => {
  it('validates IPv4 syntax', () => {
    expect(isIpv4Host('192.168.1.5')).toBe(true);
    expect(isIpv4Host('127.0.0.2')).toBe(true);
    expect(isIpv4Host('192.168.1.999')).toBe(false);
    expect(isIpv4Host('pkey-x.local')).toBe(false);
    expect(isIpv4Host('')).toBe(false);
  });
});
