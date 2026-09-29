import { Linking, Platform } from 'react-native';
import { getDisplayUrl, normalizeUrl, openExternalLink } from './openExternalLink';

jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'dismiss' })),
}));

describe('normalizeUrl', () => {
  it('returns null for empty values', () => {
    expect(normalizeUrl('')).toBeNull();
    expect(normalizeUrl('   ')).toBeNull();
  });

  it('adds https when scheme is missing', () => {
    expect(normalizeUrl('instagram.com')).toBe('https://instagram.com');
    expect(normalizeUrl('app.example.com/login')).toBe('https://app.example.com/login');
  });

  it('preserves explicit http and https URLs', () => {
    expect(normalizeUrl('https://example.com')).toBe('https://example.com');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('allows mailto and tel schemes', () => {
    expect(normalizeUrl('mailto:user@example.com')).toBe('mailto:user@example.com');
    expect(normalizeUrl('tel:+34123456789')).toBe('tel:+34123456789');
  });

  it('allows valid android, market, and intent app links', () => {
    expect(normalizeUrl('android://token@com.instagram.android/')).toBe(
      'android://token@com.instagram.android/'
    );
    expect(normalizeUrl('market://details?id=com.spotify.music')).toBe(
      'market://details?id=com.spotify.music'
    );
    expect(
      normalizeUrl('intent://open#Intent;package=com.netflix.mediaclient;end')
    ).toBe('intent://open#Intent;package=com.netflix.mediaclient;end');
  });

  it('rejects invalid android packages', () => {
    expect(normalizeUrl('android://@bad')).toBeNull();
  });

  it('blocks dangerous schemes', () => {
    expect(normalizeUrl('javascript:alert(1)')).toBeNull();
    expect(normalizeUrl('data:text/html,hello')).toBeNull();
    expect(normalizeUrl('file:///etc/passwd')).toBeNull();
  });

  it('rejects unsupported custom schemes', () => {
    expect(normalizeUrl('custom-scheme://open')).toBeNull();
  });
});

describe('getDisplayUrl', () => {
  it('falls back to trimmed raw input when normalization fails', () => {
    expect(getDisplayUrl('  javascript:alert(1)  ')).toBe('javascript:alert(1)');
  });

  it('returns app display label for known packages', () => {
    expect(getDisplayUrl('android://token@com.instagram.android/')).toBe('Instagram');
  });

  it('returns package name when label is unknown', () => {
    expect(getDisplayUrl('android://@com.unknown.app/')).toBe('com.unknown.app');
  });
});

describe('openExternalLink', () => {
  const openURL = Linking.openURL as jest.Mock;
  const canOpenURL = Linking.canOpenURL as jest.Mock;

  beforeEach(() => {
    openURL.mockReset();
    canOpenURL.mockReset();
    openURL.mockResolvedValue(undefined);
    canOpenURL.mockResolvedValue(true);
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  });

  it('opens https via Linking', async () => {
    const result = await openExternalLink('https://example.com');
    expect(result).toEqual({ ok: true });
    expect(openURL).toHaveBeenCalledWith('https://example.com');
  });

  it('cascades Android app open: launcher then market then play store', async () => {
    openURL
      .mockRejectedValueOnce(new Error('no launcher'))
      .mockRejectedValueOnce(new Error('no market'))
      .mockResolvedValueOnce(undefined);

    const result = await openExternalLink('android://@com.instagram.android/');
    expect(result).toEqual({ ok: true });
    expect(openURL.mock.calls.map((c) => c[0])).toEqual([
      'intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.instagram.android;end',
      'market://details?id=com.instagram.android',
      'https://play.google.com/store/apps/details?id=com.instagram.android',
    ]);
  });

  it('opens https fallback for app links on iOS when a web host is known', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    const result = await openExternalLink('android://@com.instagram.android/');
    expect(result).toEqual({ ok: true });
    expect(openURL).toHaveBeenCalledWith('https://instagram.com');
  });

  it('returns unavailable for unknown app packages on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    const result = await openExternalLink('android://@com.localapp/');
    expect(result).toEqual({ ok: false, reason: 'unavailable' });
  });

  it('returns invalid for blocked schemes', async () => {
    const result = await openExternalLink('javascript:alert(1)');
    expect(result).toEqual({ ok: false, reason: 'blocked' });
  });
});
