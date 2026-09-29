import { defaultSans, mergeSans, missingDns, normalizeDns } from './tlsSans';

describe('tlsSans policy', () => {
  it('normalizes DNS (lowercase, strip trailing dot)', () => {
    expect(normalizeDns('PKEY-Android.local.')).toBe('pkey-android.local');
  });

  it('defaultSans includes CN, localhost, and loopback', () => {
    expect(defaultSans('pkey-abcd')).toEqual({
      dnsNames: ['localhost', 'pkey-abcd'],
      ipAddresses: ['127.0.0.1'],
    });
  });

  it('mergeSans unions DNS/IPs and drops invalid IPv4', () => {
    const merged = mergeSans(
      { dnsNames: ['localhost'], ipAddresses: ['127.0.0.1'] },
      { dnsNames: ['pkey.local'], ipAddresses: ['192.168.1.10', 'not-an-ip', ''] }
    );
    expect(merged.dnsNames).toEqual(['localhost', 'pkey.local']);
    expect(merged.ipAddresses).toEqual(['127.0.0.1', '192.168.1.10']);
  });

  it('missingDns is false when only the LAN IP changes (must not rotate trust)', () => {
    const stored = defaultSans('pkey-abcd');
    const desired = mergeSans(stored, { ipAddresses: ['192.168.1.50'] });
    expect(missingDns(stored, desired)).toBe(false);
  });

  it('missingDns is true when a new mDNS host is required', () => {
    const stored = defaultSans('pkey-abcd');
    const desired = mergeSans(stored, { dnsNames: ['pkey-iphone.local'] });
    expect(missingDns(stored, desired)).toBe(true);
  });
});
