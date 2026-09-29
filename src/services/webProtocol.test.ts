/**
 * @fileoverview Unit tests for web mDNS protocol helpers.
 */
import {
  buildWebInstanceName,
  buildWebInstanceSuffix,
  normalizeMdnsHost,
  hostToMdnsUrlHostname,
  buildWebAccessUrl,
  buildWebAccessUrlFromInstance,
  pickCanonicalWebAccessUrl,
  WEB_SYNC_PORT,
} from './webProtocol';

describe('webProtocol', () => {
  it('builds lowercase instance name with 4-char suffix', () => {
    expect(buildWebInstanceName('Casa', 'A1B2C3D4')).toBe('casa-a1b2');
  });

  it('builds instance name from platform default style base', () => {
    expect(buildWebInstanceName('PKEY-Android', 'A1B2C3D4E5F6')).toBe('pkey-android-a1b2');
  });

  it('truncates base name to 20 chars before suffix', () => {
    const longBase = 'A'.repeat(25);
    const result = buildWebInstanceName(longBase, 'ABCD1234');
    expect(result.startsWith('a'.repeat(20))).toBe(true);
    expect(result.endsWith('-abcd')).toBe(true);
  });

  it('buildWebInstanceSuffix lowercases prefix', () => {
    expect(buildWebInstanceSuffix('A1B2C3D4')).toBe('a1b2');
  });

  it('normalizeMdnsHost strips trailing dot', () => {
    expect(normalizeMdnsHost('casa-a1b2.local.')).toBe('casa-a1b2.local');
  });

  it('hostToMdnsUrlHostname ensures .local suffix', () => {
    expect(hostToMdnsUrlHostname('pkey-android-f0e3')).toBe('pkey-android-f0e3.local');
    expect(hostToMdnsUrlHostname('PKEY-Android-f0e3.local.')).toBe('pkey-android-f0e3.local');
  });

  it('buildWebAccessUrl includes .local in user-facing URL', () => {
    expect(buildWebAccessUrl('pkey-android-f0e3.local', WEB_SYNC_PORT)).toBe(
      `http://pkey-android-f0e3.local:${WEB_SYNC_PORT}`
    );
  });

  it('buildWebAccessUrlFromInstance builds optimistic mDNS URL', () => {
    expect(buildWebAccessUrlFromInstance('casa-a1b2', WEB_SYNC_PORT)).toBe(
      `http://casa-a1b2.local:${WEB_SYNC_PORT}`
    );
  });

  it('throws when deviceId suffix is empty', () => {
    expect(() => buildWebInstanceName('Casa', '')).toThrow('deviceId required');
  });

  it('pickCanonicalWebAccessUrl prefers .local over the numeric URL', () => {
    expect(
      pickCanonicalWebAccessUrl(
        'http://pkey-android-a1b2.local:7392',
        'http://192.168.1.9:7392'
      )
    ).toBe('http://pkey-android-a1b2.local:7392');
    expect(pickCanonicalWebAccessUrl('', 'http://192.168.1.9:7392')).toBe(
      'http://192.168.1.9:7392'
    );
    expect(pickCanonicalWebAccessUrl(null, null)).toBeNull();
  });
});
