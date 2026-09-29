import { describe, it, expect } from 'vitest';
import { clampField, CARD_TITLE_MAX } from '../constants/fieldLimits';
import {
  PACKAGE_REGEX,
  extractIconHost,
  getAppDisplayLabel,
  getAppWebFallbackUrl,
  isAppLink,
  parseAppLink,
} from './importLink';

describe('clampField', () => {
  it('trims and preserves value within limit', () => {
    expect(clampField('  hello  ', 10)).toEqual({ value: 'hello', truncated: false });
  });

  it('reports truncation', () => {
    const long = 'a'.repeat(CARD_TITLE_MAX + 10);
    const result = clampField(long, CARD_TITLE_MAX);
    expect(result.value).toHaveLength(CARD_TITLE_MAX);
    expect(result.truncated).toBe(true);
  });
});

describe('PACKAGE_REGEX', () => {
  it('accepts valid multi-segment packages', () => {
    expect(PACKAGE_REGEX.test('com.instagram.android')).toBe(true);
    expect(PACKAGE_REGEX.test('com.spotify.music')).toBe(true);
    expect(PACKAGE_REGEX.test('_vendor.app')).toBe(true);
  });

  it('rejects invalid packages', () => {
    expect(PACKAGE_REGEX.test('instagram')).toBe(false);
    expect(PACKAGE_REGEX.test('com.')).toBe(false);
    expect(PACKAGE_REGEX.test('.com.app')).toBe(false);
    expect(PACKAGE_REGEX.test('com..app')).toBe(false);
    expect(PACKAGE_REGEX.test('com.evil-app')).toBe(false);
  });
});

describe('parseAppLink', () => {
  it('parses android:// with cert hash and package', () => {
    const info = parseAppLink('android://token@com.instagram.android/');
    expect(info).toMatchObject({
      scheme: 'android',
      packageName: 'com.instagram.android',
      displayLabel: 'Instagram',
      webHost: 'instagram.com',
      browserFallbackUrl: null,
    });
  });

  it('parses android:// with direct package', () => {
    const info = parseAppLink('android://com.spotify.music');
    expect(info?.packageName).toBe('com.spotify.music');
    expect(info?.displayLabel).toBe('Spotify');
  });

  it('parses market://details?id=', () => {
    const info = parseAppLink('market://details?id=com.netflix.mediaclient');
    expect(info).toMatchObject({
      scheme: 'market',
      packageName: 'com.netflix.mediaclient',
      displayLabel: 'Netflix',
    });
  });

  it('parses intent:// package and https browser fallback', () => {
    const link =
      'intent://open#Intent;package=com.instagram.android;S.browser_fallback_url=https%3A%2F%2Finstagram.com;end';
    const info = parseAppLink(link);
    expect(info).toMatchObject({
      scheme: 'intent',
      packageName: 'com.instagram.android',
      browserFallbackUrl: 'https://instagram.com',
      displayLabel: 'Instagram',
    });
  });

  it('ignores non-http S.browser_fallback_url', () => {
    const link =
      'intent://open#Intent;package=com.instagram.android;S.browser_fallback_url=javascript%3Aalert(1);end';
    const info = parseAppLink(link);
    expect(info?.packageName).toBe('com.instagram.android');
    expect(info?.browserFallbackUrl).toBeNull();
  });

  it('returns null for invalid or unsupported schemes', () => {
    expect(parseAppLink('android://@bad')).toBeNull();
    expect(parseAppLink('https://example.com')).toBeNull();
    expect(parseAppLink('intent://open#Intent;end')).toBeNull();
  });
});

describe('getAppDisplayLabel / getAppWebFallbackUrl / isAppLink', () => {
  it('returns label or package fallback', () => {
    expect(getAppDisplayLabel('android://@com.instagram.android/')).toBe('Instagram');
    expect(getAppDisplayLabel('android://@com.unknown.app/')).toBe('com.unknown.app');
    expect(getAppDisplayLabel('https://x.com')).toBeNull();
  });

  it('prefers browserFallbackUrl over webHost', () => {
    const link =
      'intent://x#Intent;package=com.instagram.android;S.browser_fallback_url=https%3A%2F%2Fcustom.example;end';
    expect(getAppWebFallbackUrl(link)).toBe('https://custom.example');
  });

  it('falls back to https webHost', () => {
    expect(getAppWebFallbackUrl('android://@com.instagram.android/')).toBe('https://instagram.com');
  });

  it('returns null web fallback when unknown package has no host', () => {
    expect(getAppWebFallbackUrl('android://@com.localapp/')).toBeNull();
  });

  it('detects app links', () => {
    expect(isAppLink('android://@com.instagram.android/')).toBe(true);
    expect(isAppLink('market://details?id=com.spotify.music')).toBe(true);
    expect(isAppLink('https://example.com')).toBe(false);
  });
});

describe('extractIconHost', () => {
  it('extracts host from https URL', () => {
    expect(extractIconHost('https://github.com/user')).toBe('github.com');
  });

  it('maps known android package to web host', () => {
    const link = 'android://token@com.instagram.android/';
    expect(extractIconHost(link)).toBe('instagram.com');
  });

  it('maps market package to web host', () => {
    expect(extractIconHost('market://details?id=com.spotify.music')).toBe('spotify.com');
  });

  it('returns null for chrome-extension', () => {
    expect(extractIconHost('chrome-extension://abc123/popup.html')).toBeNull();
  });

  it('returns null for unknown android package without heuristic match', () => {
    expect(extractIconHost('android://@com.localapp/')).toBeNull();
  });
});
