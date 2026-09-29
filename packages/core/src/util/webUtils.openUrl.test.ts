import { describe, it, expect } from 'vitest';
import { normalizeSafeOpenUrl, resolveOpenableUrl } from './webUtils';

describe('normalizeSafeOpenUrl', () => {
  it('prefixes https when no scheme is present', () => {
    expect(normalizeSafeOpenUrl('example.com/path')).toBe('https://example.com/path');
  });

  it('keeps http(s)/mailto/tel', () => {
    expect(normalizeSafeOpenUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeSafeOpenUrl('mailto:a@b.com')).toBe('mailto:a@b.com');
  });

  it('blocks dangerous and unknown schemes', () => {
    expect(normalizeSafeOpenUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeSafeOpenUrl('data:text/html,hi')).toBeNull();
    expect(normalizeSafeOpenUrl('file:///etc/passwd')).toBeNull();
    expect(normalizeSafeOpenUrl('vbscript:msgbox(1)')).toBeNull();
    expect(normalizeSafeOpenUrl('blob:https://example.com/x')).toBeNull();
    expect(normalizeSafeOpenUrl('ftp://example.com')).toBeNull();
  });

  it('returns null for empty input', () => {
    expect(normalizeSafeOpenUrl('   ')).toBeNull();
  });

  it('maps known android app links to https fallback', () => {
    expect(normalizeSafeOpenUrl('android://x@com.instagram.android/')).toBe('https://instagram.com');
  });
});

describe('resolveOpenableUrl', () => {
  it('prefers https in uris when link is an unknown android package', () => {
    expect(
      resolveOpenableUrl('android://hash@com.localapp/', ['https://example.com/login'])
    ).toBe('https://example.com/login');
  });

  it('returns null when nothing is browser-openable', () => {
    expect(resolveOpenableUrl('android://hash@com.localapp/')).toBeNull();
  });
});
