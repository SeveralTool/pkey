/**
 * @fileoverview HTTP route tests for SyncWebServer: the `/pkey/meta` identity
 * document and the CSP served with the PWA shell.
 */
import { SyncWebServer, shouldPublishWebClient, webClientsUiEqual } from './syncWebServer';
import type { SyncServerCore } from './syncServerCore';

interface FakeSocket {
  written: string;
  write: (buf: Buffer, enc: string, cb?: () => void) => boolean;
  setTimeout: (ms: number) => void;
  end: () => void;
  destroy: () => void;
}

const makeSocket = (): FakeSocket => {
  const sock: FakeSocket = {
    written: '',
    write(buf, _enc, cb) {
      sock.written += buf.toString('latin1');
      cb?.();
      return true;
    },
    setTimeout: () => {},
    end: () => {},
    destroy: () => {},
  };
  return sock;
};

/** Feeds a raw request through the private handshake handler. */
const request = (
  server: SyncWebServer,
  raw: string,
  core: Partial<SyncServerCore> | SyncServerCore = {}
): { status: number; headers: Record<string, string>; body: string } => {
  const socket = makeSocket();
  const conn = {
    socket,
    buffer: Buffer.alloc(0),
    httpBuffer: raw,
    handshakeDone: false,
    session: null,
    pingTimer: null,
    socketId: 'test-conn',
    connectedAt: Date.now(),
    fragOpcode: null,
    fragParts: [],
    fragBytes: 0,
  };
  (server as unknown as { handleHttpHandshake: (c: unknown, core: unknown) => void })
    .handleHttpHandshake(conn, core);

  const [head, ...bodyParts] = socket.written.split('\r\n\r\n');
  const lines = (head ?? '').split('\r\n');
  const status = Number((lines[0] ?? '').split(' ')[1] ?? 0);
  const headers: Record<string, string> = {};
  for (const line of lines.slice(1)) {
    const idx = line.indexOf(':');
    if (idx > 0) headers[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return { status, headers, body: bodyParts.join('\r\n\r\n') };
};

const GET_META = 'GET /pkey/meta HTTP/1.1\r\nHost: 192.168.1.5:7392\r\n\r\n';

describe('GET /pkey/meta', () => {
  it('serves the identity document as JSON', () => {
    const server = new SyncWebServer();
    Object.assign(server as unknown as Record<string, unknown>, {
      _deviceId: 'device-abc',
      _mdnsHost: () => 'pkey-android-abcd.local',
      _ipProvider: () => '192.168.1.5',
    });

    const res = request(server, GET_META);
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toContain('application/json');
    expect(JSON.parse(res.body)).toEqual({
      metaVersion: 1,
      deviceId: 'device-abc',
      mdnsHost: 'pkey-android-abcd.local',
      ip: '192.168.1.5',
      generatedAt: expect.any(Number),
    });
  });

  it('includes vault language and theme when the core exposes them', () => {
    const server = new SyncWebServer();
    Object.assign(server as unknown as Record<string, unknown>, {
      _deviceId: 'device-abc',
      _mdnsHost: () => 'pkey-android-abcd.local',
      _ipProvider: () => '192.168.1.5',
    });
    const res = request(server, GET_META, {
      getPublicUiPrefs: () => ({ language: 'ESP', theme: 'AUTO' }),
    } as Partial<SyncServerCore>);
    expect(JSON.parse(res.body)).toMatchObject({
      language: 'ESP',
      theme: 'AUTO',
    });
  });

  it('does not expose CORS headers (same-origin consumption only)', () => {
    const server = new SyncWebServer();
    const res = request(server, GET_META);
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
  });

  it('re-reads the getters on every request (mDNS may publish after the bind)', () => {
    const server = new SyncWebServer();
    let host = '';
    Object.assign(server as unknown as Record<string, unknown>, {
      _deviceId: 'd',
      _mdnsHost: () => host,
      _ipProvider: () => '10.0.0.7',
    });

    expect(JSON.parse(request(server, GET_META).body).mdnsHost).toBe('');
    host = 'pkey-ios-1234.local';
    expect(JSON.parse(request(server, GET_META).body).mdnsHost).toBe('pkey-ios-1234.local');
  });

  it('degrades to empty fields when a getter throws', () => {
    const server = new SyncWebServer();
    Object.assign(server as unknown as Record<string, unknown>, {
      _deviceId: 'd',
      _mdnsHost: () => {
        throw new Error('mDNS module missing');
      },
      _ipProvider: () => {
        throw new Error('no netinfo');
      },
    });

    const meta = JSON.parse(request(server, GET_META).body);
    expect(meta.mdnsHost).toBe('');
    expect(meta.ip).toBe('');
  });

  it('still 404s unknown paths', () => {
    const server = new SyncWebServer();
    const res = request(server, 'GET /pkey/nope HTTP/1.1\r\nHost: 192.168.1.5:7392\r\n\r\n');
    expect(res.status).toBe(404);
  });
});

describe('PWA static assets', () => {
  it('serves the brand logo as PNG', () => {
    const server = new SyncWebServer();
    const res = request(server, 'GET /brand-logo.png HTTP/1.1\r\nHost: 192.168.1.5:7392\r\n\r\n');
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toBe('image/png');
    expect(res.body.slice(0, 8)).toBe('\x89PNG\r\n\x1a\n');
  });

  it('serves the web manifest', () => {
    const server = new SyncWebServer();
    const res = request(server, 'GET /manifest.webmanifest HTTP/1.1\r\nHost: 192.168.1.5:7392\r\n\r\n');
    expect(res.status).toBe(200);
    expect(res.headers['Content-Type']).toBe('application/manifest+json');
    const manifest = JSON.parse(res.body);
    expect(manifest.short_name).toBe('PKEY');
    expect(manifest.icons).toEqual(expect.arrayContaining([expect.objectContaining({ src: '/pwa-192.png' })]));
  });

  it('does not serve path traversal or unknown files', () => {
    const server = new SyncWebServer();
    expect(
      request(server, 'GET /../package.json HTTP/1.1\r\nHost: 192.168.1.5:7392\r\n\r\n').status
    ).toBe(404);
    expect(
      request(server, 'GET /not-an-asset.png HTTP/1.1\r\nHost: 192.168.1.5:7392\r\n\r\n').status
    ).toBe(404);
  });
});

describe('CSP of the PWA shell', () => {
  const csp = (): string => {
    const server = new SyncWebServer();
    const res = request(server, 'GET / HTTP/1.1\r\nHost: 192.168.1.5:7392\r\n\r\n');
    expect(res.status).toBe(200);
    return res.headers['Content-Security-Policy'] ?? '';
  };

  it('allows any ws: host so the socket can follow a DHCP IP change', () => {
    expect(csp()).toContain("connect-src 'self' ws:");
  });

  it('keeps plain fetch same-origin and scripts nonce-only', () => {
    const policy = csp();
    const connectSrc = policy.split('; ').find((d) => d.startsWith('connect-src')) ?? '';
    expect(connectSrc).not.toContain('http:');
    expect(connectSrc).not.toContain('https:');
    expect(policy).toMatch(/script-src 'self' 'nonce-[a-f0-9]+'/);
  });
});

describe('shouldPublishWebClient', () => {
  const noneBlocked = () => false;
  const blockEdge = (id: string) => id === 'web-edge';

  it('hides unidentified upgrades, probes, and blocked source ids', () => {
    expect(shouldPublishWebClient(true, null, noneBlocked)).toBe(false);
    expect(shouldPublishWebClient(true, '', noneBlocked)).toBe(false);
    expect(shouldPublishWebClient(false, 'web-ok', noneBlocked)).toBe(false);
    expect(shouldPublishWebClient(true, 'probe-deadbeef', noneBlocked)).toBe(false);
    expect(shouldPublishWebClient(true, 'web-unknown', noneBlocked)).toBe(false);
    expect(shouldPublishWebClient(true, 'web-edge', blockEdge)).toBe(false);
    expect(shouldPublishWebClient(true, 'web-ok', blockEdge)).toBe(true);
  });
});

describe('webClientsUiEqual', () => {
  it('compares socket id, source id, and auth flag', () => {
    const a = [{ socketId: 'ws-1', sourceId: 'web-a', authenticated: true }];
    expect(webClientsUiEqual(a, [{ ...a[0] }])).toBe(true);
    expect(webClientsUiEqual(a, [{ ...a[0], authenticated: false }])).toBe(false);
    expect(webClientsUiEqual(a, [])).toBe(false);
  });
});
