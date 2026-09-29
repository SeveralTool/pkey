import { describe, it, expect } from 'vitest';
import {
  parseLinkIdentity,
  isAppLink,
  buildCardLinkFields,
  pickCanonicalLink,
  collectIdentities,
  hostsOf,
  androidPackagesOf,
  normalizeStoredLink,
  displayLabel,
  displayUrl,
  preserveUrisOnLinkEdit,
} from './index';

const GOOGLE_IG =
  'android://qbMQCZh-CU_SBn04UFat_bLMSicoFKWYI0MzXmOdBklD5gJcvH42kD8GXA5lvZmtq1ON0Dd8FAT6SLUIlwNUqA==@com.instagram.android/';

describe('parseLinkIdentity corpus', () => {
  it('parses Google android:// hash@package', () => {
    const id = parseLinkIdentity(GOOGLE_IG);
    expect(id).toMatchObject({
      kind: 'android_package',
      androidPackage: 'com.instagram.android',
      host: 'instagram.com',
      derived: true,
      canonical: 'android-app://com.instagram.android',
    });
  });

  it('parses android:// with direct package', () => {
    expect(parseLinkIdentity('android://com.spotify.music')?.androidPackage).toBe(
      'com.spotify.music'
    );
  });

  it('parses Bitwarden androidapp:// and android-app://', () => {
    expect(parseLinkIdentity('androidapp://com.instagram.android')?.androidPackage).toBe(
      'com.instagram.android'
    );
    expect(parseLinkIdentity('android-app://com.bank.app/path')?.androidPackage).toBe('com.bank.app');
  });

  it('parses Chrome DAL android-app://pkg/https/host', () => {
    const id = parseLinkIdentity('android-app://com.instagram.android/https/instagram.com/p/x');
    expect(id?.androidPackage).toBe('com.instagram.android');
    expect(id?.host).toBe('instagram.com');
    expect(id?.derived).toBe(false);
  });

  it('parses market:// and intent://', () => {
    expect(parseLinkIdentity('market://details?id=com.netflix.mediaclient')?.androidPackage).toBe(
      'com.netflix.mediaclient'
    );
    const intent =
      'intent://open#Intent;package=com.instagram.android;S.browser_fallback_url=https%3A%2F%2Finstagram.com;end';
    const id = parseLinkIdentity(intent);
    expect(id?.androidPackage).toBe('com.instagram.android');
    expect(id?.browserFallbackUrl).toBe('https://instagram.com');
  });

  it('rejects javascript intent fallback but keeps package', () => {
    const link =
      'intent://open#Intent;package=com.instagram.android;S.browser_fallback_url=javascript%3Aalert(1);end';
    const id = parseLinkIdentity(link);
    expect(id?.androidPackage).toBe('com.instagram.android');
    expect(id?.browserFallbackUrl).toBeNull();
  });

  it('parses iOS iosapp:// and apple-app://', () => {
    expect(parseLinkIdentity('iosapp://com.burbn.instagram')?.iosAppId).toBe('com.burbn.instagram');
    expect(parseLinkIdentity('apple-app://ABCDE12345.com.burbn.instagram')?.iosAppId).toBe(
      'com.burbn.instagram'
    );
  });

  it('parses https, www strip, bare host, and non-default port', () => {
    expect(parseLinkIdentity('https://www.Example.com/login?x=1#f')).toMatchObject({
      kind: 'web',
      host: 'example.com',
      hostPort: 'example.com',
      canonical: 'https://example.com',
    });
    expect(parseLinkIdentity('google.com')?.host).toBe('google.com');
    expect(parseLinkIdentity('https://sub.example.com:8443/a')?.hostPort).toBe(
      'sub.example.com:8443'
    );
  });

  it('treats 3-segment bare tokens as packages, not hosts', () => {
    expect(parseLinkIdentity('com.bank.app')?.kind).toBe('android_package');
    expect(parseLinkIdentity('google.com')?.kind).toBe('web');
  });

  it('returns blocked / ignored / null for junk', () => {
    expect(parseLinkIdentity('javascript:alert(1)')?.kind).toBe('blocked');
    expect(parseLinkIdentity('chrome-extension://abc/popup.html')?.kind).toBe('ignored');
    expect(parseLinkIdentity('about:blank')?.kind).toBe('ignored');
    expect(parseLinkIdentity('android://@bad')).toBeNull();
    expect(parseLinkIdentity('')).toBeNull();
    expect(parseLinkIdentity('just-words')).toBeNull();
  });

  it('detects app links', () => {
    expect(isAppLink(GOOGLE_IG)).toBe(true);
    expect(isAppLink('https://example.com')).toBe(false);
  });
});

describe('buildCardLinkFields / pickCanonicalLink', () => {
  it('prefers explicit https then keeps Google original in uris', () => {
    const fields = buildCardLinkFields([GOOGLE_IG, 'https://instagram.com/user']);
    expect(fields.link).toBe('https://instagram.com');
    expect(fields.uris).toContain(GOOGLE_IG);
  });

  it('uses package map https when only android:// is present', () => {
    const fields = buildCardLinkFields([GOOGLE_IG]);
    expect(fields.link).toBe('https://instagram.com');
    expect(fields.uris).toEqual([GOOGLE_IG]);
  });

  it('uses android-app:// when package has no web host', () => {
    const fields = buildCardLinkFields(['android://x@com.localapp/']);
    expect(fields.link).toBe('android-app://com.localapp');
    expect(fields.uris).toEqual(['android://x@com.localapp/']);
  });

  it('Bitwarden https + androidapp://', () => {
    const fields = buildCardLinkFields([
      'androidapp://com.instagram.android',
      'https://www.instagram.com',
    ]);
    expect(fields.link).toBe('https://instagram.com');
    expect(fields.uris?.length).toBeGreaterThan(0);
  });

  it('canonical order: explicit https beats derived', () => {
    const ids = collectIdentities(GOOGLE_IG, ['https://custom.example']);
    expect(pickCanonicalLink(ids)).toBe('https://custom.example');
  });

  it('normalizeStoredLink', () => {
    expect(normalizeStoredLink('instagram.com')).toBe('https://instagram.com');
    expect(normalizeStoredLink(GOOGLE_IG)).toBe('https://instagram.com');
    expect(normalizeStoredLink('javascript:x')).toBeNull();
    expect(normalizeStoredLink('')).toBeNull();
  });

  it('never surfaces Google android:// hash as the visible URL', () => {
    expect(pickCanonicalLink(collectIdentities(GOOGLE_IG))).toBe('https://instagram.com');
    expect(displayUrl(collectIdentities('android://x@com.localapp/'))).toBe(
      'android-app://com.localapp'
    );
    expect(displayUrl(collectIdentities(GOOGLE_IG), GOOGLE_IG)).not.toMatch(/^android:\/\//);
  });

  it('displayLabel uses brand map', () => {
    expect(displayLabel(collectIdentities(GOOGLE_IG))).toBe('Instagram');
  });

  it('preserveUrisOnLinkEdit keeps the stored android link when unchanged', () => {
    const kept = preserveUrisOnLinkEdit({ link: GOOGLE_IG, uris: [GOOGLE_IG] }, GOOGLE_IG);
    expect(kept.link).toBe(GOOGLE_IG);
    expect(kept.uris).toEqual([GOOGLE_IG]);
  });
});

describe('collectIdentities helpers', () => {
  it('collects hosts and packages from link + uris', () => {
    const ids = collectIdentities('https://instagram.com', [GOOGLE_IG]);
    expect(hostsOf(ids)).toContain('instagram.com');
    expect(androidPackagesOf(ids)).toContain('com.instagram.android');
  });
});
