/**
 * @fileoverview Unit tests for the `/pkey/meta` identity helpers.
 */
import { buildMetaPayload, isValidIpv4, sanitizeMdnsHost, WEB_META_VERSION } from './webMeta';

describe('buildMetaPayload', () => {
  it('fills every field with the given values', () => {
    const meta = buildMetaPayload({
      deviceId: 'abc123',
      mdnsHost: 'pkey-android-abcd.local',
      ip: '192.168.1.5',
      now: 1234,
    });
    expect(meta).toEqual({
      metaVersion: WEB_META_VERSION,
      deviceId: 'abc123',
      mdnsHost: 'pkey-android-abcd.local',
      ip: '192.168.1.5',
      generatedAt: 1234,
    });
  });

  it('defaults now to Date.now()', () => {
    const before = Date.now();
    const meta = buildMetaPayload({ deviceId: 'd', mdnsHost: '', ip: '' });
    expect(meta.generatedAt).toBeGreaterThanOrEqual(before);
    expect(meta.generatedAt).toBeLessThanOrEqual(Date.now());
  });

  it('sanitizes an invalid ip to empty string', () => {
    expect(buildMetaPayload({ deviceId: 'd', mdnsHost: '', ip: 'not-an-ip' }).ip).toBe('');
  });

  it('sanitizes an out-of-range octet ip to empty string', () => {
    expect(buildMetaPayload({ deviceId: 'd', mdnsHost: '', ip: '192.168.1.999' }).ip).toBe('');
  });

  it('normalizes mdnsHost: adds .local, strips scheme and port', () => {
    expect(
      buildMetaPayload({ deviceId: 'd', mdnsHost: 'http://PKEY-X.local:7392', ip: '' }).mdnsHost
    ).toBe('pkey-x.local');
    expect(buildMetaPayload({ deviceId: 'd', mdnsHost: 'pkey-y', ip: '' }).mdnsHost).toBe(
      'pkey-y.local'
    );
    expect(buildMetaPayload({ deviceId: 'd', mdnsHost: '', ip: '' }).mdnsHost).toBe('');
  });

  it('includes optional language and theme UI hints', () => {
    const meta = buildMetaPayload({
      deviceId: 'd',
      mdnsHost: '',
      ip: '',
      language: 'ESP',
      theme: 'AUTO',
    });
    expect(meta.language).toBe('ESP');
    expect(meta.theme).toBe('AUTO');
  });

  it('includes a sanitized vault session id and creation date', () => {
    const meta = buildMetaPayload({
      deviceId: 'd',
      mdnsHost: '',
      ip: '',
      sessionId: '550e8400-e29b-41d4-a716-446655440000',
      sessionCreatedAt: '2020-01-01T00:00:00.000Z',
    });
    expect(meta.sessionId).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(meta.sessionCreatedAt).toBe('2020-01-01T00:00:00.000Z');
  });

  it('omits invalid session id / created-at instead of advertising them', () => {
    const meta = buildMetaPayload({
      deviceId: 'd',
      mdnsHost: '',
      ip: '',
      sessionId: 'sess',
      sessionCreatedAt: 'nope',
    });
    expect(meta.sessionId).toBeUndefined();
    expect(meta.sessionCreatedAt).toBeUndefined();
  });

  it('includes AUTO language as a valid UI hint', () => {
    const meta = buildMetaPayload({
      deviceId: 'd',
      mdnsHost: '',
      ip: '',
      language: 'AUTO',
      theme: 'DARK',
    });
    expect(meta.language).toBe('AUTO');
  });

  it('omits invalid language/theme instead of advertising them', () => {
    const meta = buildMetaPayload({
      deviceId: 'd',
      mdnsHost: '',
      ip: '',
      language: 'fr' as never,
      theme: 'pink' as never,
    });
    expect(meta.language).toBeUndefined();
    expect(meta.theme).toBeUndefined();
  });

  it('advertises webLoginOnPhone only when true', () => {
    expect(buildMetaPayload({ deviceId: 'd', mdnsHost: '', ip: '' }).webLoginOnPhone).toBeUndefined();
    expect(
      buildMetaPayload({ deviceId: 'd', mdnsHost: '', ip: '', webLoginOnPhone: true }).webLoginOnPhone
    ).toBe(true);
  });
});

describe('isValidIpv4', () => {
  it('accepts valid IPv4 addresses', () => {
    expect(isValidIpv4('192.168.1.5')).toBe(true);
    expect(isValidIpv4('127.0.0.2')).toBe(true);
    expect(isValidIpv4('0.0.0.0')).toBe(true);
    expect(isValidIpv4('255.255.255.255')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isValidIpv4('')).toBe(false);
    expect(isValidIpv4('192.168.1')).toBe(false);
    expect(isValidIpv4('192.168.1.999')).toBe(false);
    expect(isValidIpv4('a.b.c.d')).toBe(false);
    expect(isValidIpv4('192.168.1.5.6')).toBe(false);
  });
});

describe('sanitizeMdnsHost', () => {
  it('lowercases and trims', () => {
    expect(sanitizeMdnsHost('  PKEY-ANDROID-ABCD.LOCAL ')).toBe('pkey-android-abcd.local');
  });
  it('appends .local when missing', () => {
    expect(sanitizeMdnsHost('pkey-x')).toBe('pkey-x.local');
  });
  it('strips scheme and path', () => {
    expect(sanitizeMdnsHost('http://pkey-x.local/foo')).toBe('pkey-x.local');
  });
  it('rejects an IPv4 literal (not a stable name)', () => {
    expect(sanitizeMdnsHost('192.168.1.5')).toBe('');
    expect(sanitizeMdnsHost('http://192.168.1.5:7392')).toBe('');
  });
  it('returns empty for empty input', () => {
    expect(sanitizeMdnsHost('')).toBe('');
  });
});
