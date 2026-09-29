import { describe, it, expect } from 'vitest';
import {
  composeBrowserUserAgent,
  formatClientIp,
  isPersistableSourceId,
  otherLiveClientsShareIp,
  sanitizeUserAgent,
  sanitizeWebClientAlias,
  summarizeUserAgent,
  webClientNotifyLabel,
  webClientOsNotifyLabel,
  webClientPrimaryLabel,
  webClientSecondaryLine,
  WEB_CLIENT_ALIAS_MAX,
  WEB_CLIENT_UA_MAX,
} from './webClientLabel';

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0';
const EDGE_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0';

describe('sanitizeUserAgent', () => {
  it('rejects non-strings and empty input', () => {
    expect(sanitizeUserAgent(undefined)).toBeNull();
    expect(sanitizeUserAgent(12)).toBeNull();
    expect(sanitizeUserAgent('   ')).toBeNull();
  });

  it('strips control chars and clamps length', () => {
    expect(sanitizeUserAgent('Chrome\n131')).toBe('Chrome 131');
    const long = 'A'.repeat(WEB_CLIENT_UA_MAX + 40);
    expect(sanitizeUserAgent(long)?.length).toBe(WEB_CLIENT_UA_MAX);
  });
});

describe('sanitizeWebClientAlias', () => {
  it('trims and clamps', () => {
    expect(sanitizeWebClientAlias('  Notebook  ')).toBe('Notebook');
    expect(sanitizeWebClientAlias('x'.repeat(WEB_CLIENT_ALIAS_MAX + 5)).length).toBe(
      WEB_CLIENT_ALIAS_MAX
    );
  });
});

describe('isPersistableSourceId', () => {
  it('accepts stable web ids and rejects probes / huge keys', () => {
    expect(isPersistableSourceId('web-mxyz-abcd1234')).toBe(true);
    expect(isPersistableSourceId('probe-deadbeef')).toBe(false);
    expect(isPersistableSourceId('web-unknown')).toBe(false);
    expect(isPersistableSourceId('')).toBe(false);
    expect(isPersistableSourceId('a'.repeat(200))).toBe(false);
  });
});

describe('formatClientIp', () => {
  it('unwraps IPv4-mapped IPv6 and zone ids', () => {
    expect(formatClientIp('::ffff:192.168.1.20')).toBe('192.168.1.20');
    expect(formatClientIp('fe80::1%wlan0')).toBe('fe80::1');
    expect(formatClientIp('  10.0.0.8  ')).toBe('10.0.0.8');
    expect(formatClientIp('')).toBeNull();
  });
});

describe('otherLiveClientsShareIp', () => {
  const clients = [
    { sourceId: 'web-a', ip: '192.168.1.10' },
    { sourceId: 'web-b', ip: '192.168.1.10' },
    { sourceId: 'web-c', ip: '10.0.0.2' },
  ];

  it('is true when another live client shares the IP', () => {
    expect(otherLiveClientsShareIp('192.168.1.10', 'web-a', clients)).toBe(true);
  });

  it('is false when the target is the only client on that IP', () => {
    expect(otherLiveClientsShareIp('10.0.0.2', 'web-c', clients)).toBe(false);
  });

  it('treats IPv4-mapped IPv6 as the same address', () => {
    expect(otherLiveClientsShareIp('::ffff:192.168.1.10', 'web-a', clients)).toBe(true);
  });

  it('counts peers without sourceId on the same IP', () => {
    expect(
      otherLiveClientsShareIp('192.168.1.10', 'web-a', [
        { sourceId: 'web-a', ip: '192.168.1.10' },
        { sourceId: null, ip: '192.168.1.10' },
      ])
    ).toBe(true);
  });
});

describe('summarizeUserAgent', () => {
  it('summarizes common desktop and mobile UAs', () => {
    expect(summarizeUserAgent(CHROME_WIN)).toBe('Chrome · Windows');
    expect(summarizeUserAgent(SAFARI_IOS)).toBe('Safari · iOS');
    expect(summarizeUserAgent(FIREFOX_LINUX)).toBe('Firefox · Linux');
    expect(summarizeUserAgent(EDGE_WIN)).toBe('Edge · Windows');
  });

  it('prefers Client Hint tokens when present', () => {
    expect(summarizeUserAgent(`${CHROME_WIN} CHPlatform/Windows CHBrand/Google Chrome`)).toBe(
      'Chrome · Windows'
    );
    expect(summarizeUserAgent('CHPlatform/Android CHBrand/Brave')).toBe('Brave · Android');
  });

  it('returns null when nothing can be inferred', () => {
    expect(summarizeUserAgent('curl/8.0')).toBeNull();
  });
});

describe('composeBrowserUserAgent', () => {
  it('appends Client Hints and skips Grease / Chromium brands', () => {
    const composed = composeBrowserUserAgent({
      userAgent: CHROME_WIN,
      userAgentData: {
        platform: 'Windows',
        brands: [{ brand: 'Not_A Brand' }, { brand: 'Chromium' }, { brand: 'Google Chrome' }],
      },
    });
    expect(composed).toContain('CHPlatform/Windows');
    expect(composed).toContain('CHBrand/Google Chrome');
    expect(summarizeUserAgent(composed)).toBe('Chrome · Windows');
  });
});

describe('webClient labels', () => {
  it('prefers alias, then UA, then source id', () => {
    expect(
      webClientPrimaryLabel({
        alias: 'Notebook',
        userAgent: CHROME_WIN,
        sourceId: 'web-1',
      })
    ).toBe('Notebook');
    expect(
      webClientPrimaryLabel({
        userAgent: CHROME_WIN,
        sourceId: 'web-1',
      })
    ).toBe('Chrome · Windows');
    expect(webClientPrimaryLabel({ sourceId: 'web-1' })).toBe('web-1');
  });

  it('puts IP on the secondary line and UA only when aliased', () => {
    expect(
      webClientSecondaryLine({
        userAgent: CHROME_WIN,
        ip: '::ffff:192.168.0.9',
      })
    ).toBe('192.168.0.9');
    expect(
      webClientSecondaryLine({
        alias: 'PC',
        userAgent: CHROME_WIN,
        ip: '192.168.0.9',
      })
    ).toBe('192.168.0.9 · Chrome · Windows');
  });

  it('notify label falls through alias → UA → IP', () => {
    expect(webClientNotifyLabel({ alias: 'PC', ip: '1.1.1.1' })).toBe('PC');
    expect(webClientNotifyLabel({ userAgent: SAFARI_IOS, ip: '1.1.1.1' })).toBe('Safari · iOS');
    expect(webClientNotifyLabel({ ip: '10.0.0.2', sourceId: 'web-zzzzzzzz' })).toBe('10.0.0.2');
  });

  it('OS notify label never uses IP or source ids', () => {
    expect(webClientOsNotifyLabel({ alias: 'PC', userAgent: SAFARI_IOS })).toBe('PC');
    expect(webClientOsNotifyLabel({ userAgent: SAFARI_IOS })).toBe('Safari · iOS');
    expect(webClientOsNotifyLabel({ fallback: 'Browser' })).toBe('Browser');
    expect(webClientOsNotifyLabel({})).toBe('web');
  });
});
