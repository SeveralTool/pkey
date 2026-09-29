import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clearIconCache,
  DEFAULT_CARD_ICON,
  detectIcon,
  detectPresetFromLink,
  resolveCardIcon,
  resolveIoniconName,
  shouldKeepStoredIcon,
} from './icon-detection';

describe('detectIcon (privacy-first defaults, M5)', () => {
  afterEach(() => {
    clearIconCache();
    vi.unstubAllGlobals();
  });

  it('does NOT hit the network when allowRemoteFavicon is not set (default)', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('blocked'));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await detectIcon('GitHub', 'https://github.com');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result.source).toBe('host');
    expect(result.icon).toEqual({ type: 'icon', value: 'logo-github' });
  });

  it('uses the host brand instead of an unverified favicon when fetch fails', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('blocked'));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await detectIcon('GitHub', 'https://github.com', {
      allowRemoteFavicon: true,
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.source).toBe('host');
    expect(result.icon).toEqual({ type: 'icon', value: 'logo-github' });
  });

  it('does not persist a DuckDuckGo URL after a failed fetch on an unknown host', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')));

    const result = await detectIcon('Example', 'https://example.com', {
      allowRemoteFavicon: true,
    });

    expect(result.source).toBe('default');
    expect(result.icon).toEqual(DEFAULT_CARD_ICON);
  });

  it('prefers a verified favicon over the host brand when lookup is on', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);

    const result = await detectIcon('Instagram', 'https://www.instagram.com/user', {
      allowRemoteFavicon: true,
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.source).toBe('favicon');
    expect(result.icon.type).toBe('image');
    expect((result.icon as { uri: string }).uri).toContain('instagram.com');
  });

  it('falls back to the Facebook preset when lookup is on but fetch fails', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('blocked'));
    vi.stubGlobal('fetch', fetchSpy);

    const result = await detectIcon('Mercado Libre', 'https://www.facebook.com/mercadolibre', {
      allowRemoteFavicon: true,
    });

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.source).toBe('host');
    expect(result.icon).toEqual({ type: 'icon', value: 'logo-facebook' });
  });

  it('uses fuzzy preset only when no URL is provided', async () => {
    const result = await detectIcon('Instagram');

    expect(result.source).toBe('fuzzy');
    expect(result.icon).toEqual({ type: 'icon', value: 'logo-instagram' });
  });

  it('matches a brand name inside a longer title', async () => {
    const result = await detectIcon('Facebook login');
    expect(result.source).toBe('fuzzy');
    expect(result.icon).toEqual({ type: 'icon', value: 'logo-facebook' });
  });

  it('uses verified favicon URL when fetch succeeds and opted in', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await detectIcon('Example', 'https://example.com', {
      allowRemoteFavicon: true,
    });

    expect(result.source).toBe('favicon');
    expect(result.icon.type).toBe('image');
    expect((result.icon as { uri: string }).uri).toContain('example.com');
  });

  it('fetches a favicon from the URL even when the title is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await detectIcon('  ', 'https://notes.example.com', {
      allowRemoteFavicon: true,
    });

    expect(result.source).toBe('favicon');
    expect(result.icon.type).toBe('image');
  });

  it('uses fuzzy preset for android link when host unknown (opted in)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('blocked')));

    const androidLink = 'android://@com.localapp/';
    const result = await detectIcon('Instagram', androidLink, { allowRemoteFavicon: true });

    expect(result.source).toBe('fuzzy');
    expect(result.icon).toEqual({ type: 'icon', value: 'logo-instagram' });
  });

  it('uses Facebook preset from android package when favicon fetch fails', async () => {
    const fetchSpy = vi.fn().mockRejectedValue(new Error('blocked'));
    vi.stubGlobal('fetch', fetchSpy);

    const link = 'android://token@com.facebook.katana/';
    const result = await detectIcon('ML page', link, { allowRemoteFavicon: true });

    expect(fetchSpy).toHaveBeenCalled();
    expect(result.source).toBe('host');
    expect(result.icon).toEqual({ type: 'icon', value: 'logo-facebook' });
  });

  it('uses a verified favicon for an android Instagram package when lookup is on', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    const result = await detectIcon('Note', 'android://@com.instagram.android/', {
      allowRemoteFavicon: true,
    });

    expect(result.source).toBe('favicon');
    expect(result.icon.type).toBe('image');
    expect((result.icon as { uri: string }).uri).toContain('instagram.com');
  });
});

describe('detectPresetFromLink', () => {
  it('matches facebook hosts and subdomains', () => {
    expect(detectPresetFromLink('https://facebook.com/foo')).toEqual({
      type: 'icon',
      value: 'logo-facebook',
    });
    expect(detectPresetFromLink('m.facebook.com')).toEqual({
      type: 'icon',
      value: 'logo-facebook',
    });
  });

  it('does not match mercadolibre as Facebook', () => {
    expect(detectPresetFromLink('https://www.mercadolibre.com.ar')).toBeNull();
  });
});

describe('resolveCardIcon', () => {
  it('replaces a leftover favicon when the link is a known brand', () => {
    expect(
      resolveCardIcon(
        { type: 'image', uri: 'https://icons.duckduckgo.com/ip3/mercadolibre.com.ico' },
        'https://www.facebook.com/mercadolibre'
      )
    ).toEqual({ type: 'icon', value: 'logo-facebook' });
  });

  it('keeps a user-picked preset even when the host has a brand', () => {
    expect(
      resolveCardIcon({ type: 'icon', value: 'heart-outline' }, 'https://facebook.com')
    ).toEqual({ type: 'icon', value: 'heart-outline' });
  });

  it('keeps bank-outline as the stored preset key (PWA has a data URI for it)', () => {
    expect(resolveIoniconName('bank-outline')).toBe('cash-outline');
    expect(resolveCardIcon({ type: 'icon', value: 'bank-outline' })).toEqual({
      type: 'icon',
      value: 'bank-outline',
    });
  });

  it('falls back to the default key when icon data is missing', () => {
    expect(resolveCardIcon(undefined)).toEqual(DEFAULT_CARD_ICON);
    expect(resolveCardIcon({ type: 'icon', value: '' })).toEqual(DEFAULT_CARD_ICON);
    expect(resolveCardIcon({ type: 'image', uri: '   ' })).toEqual(DEFAULT_CARD_ICON);
  });

  it('keeps a remote favicon for unknown hosts', () => {
    expect(
      resolveCardIcon(
        { type: 'image', uri: 'https://icons.duckduckgo.com/ip3/mercadolibre.com.ico' },
        'https://www.mercadolibre.com'
      )
    ).toEqual({
      type: 'image',
      uri: 'https://icons.duckduckgo.com/ip3/mercadolibre.com.ico',
    });
  });

  it('keeps a matching Instagram favicon instead of the internal brand glyph', () => {
    expect(
      resolveCardIcon(
        { type: 'image', uri: 'https://icons.duckduckgo.com/ip3/instagram.com.ico' },
        'https://www.instagram.com/user'
      )
    ).toEqual({
      type: 'image',
      uri: 'https://icons.duckduckgo.com/ip3/instagram.com.ico',
    });
  });

  it('keeps a matching Google s2 favicon for a known brand host', () => {
    expect(
      resolveCardIcon(
        { type: 'image', uri: 'https://www.google.com/s2/favicons?domain=github.com&sz=64' },
        'https://github.com/pkey'
      )
    ).toEqual({
      type: 'image',
      uri: 'https://www.google.com/s2/favicons?domain=github.com&sz=64',
    });
  });

  it('keeps a non-CDN image even when the host has a brand', () => {
    expect(
      resolveCardIcon(
        { type: 'image', uri: 'https://cdn.example.com/custom.png' },
        'https://facebook.com'
      )
    ).toEqual({ type: 'image', uri: 'https://cdn.example.com/custom.png' });
  });
});

describe('shouldKeepStoredIcon', () => {
  it('keeps real presets and not the default key or favicons', () => {
    expect(shouldKeepStoredIcon({ type: 'icon', value: 'logo-facebook' })).toBe(true);
    expect(shouldKeepStoredIcon({ type: 'icon', value: 'bank-outline' })).toBe(true);
    expect(shouldKeepStoredIcon({ type: 'icon', value: 'key-outline' })).toBe(false);
    expect(shouldKeepStoredIcon({ type: 'image', uri: 'https://x/y.ico' })).toBe(false);
  });

  it('does not keep a host-brand preset that matches the current URL', () => {
    expect(
      shouldKeepStoredIcon({ type: 'icon', value: 'logo-instagram' }, 'https://instagram.com')
    ).toBe(false);
    expect(
      shouldKeepStoredIcon({ type: 'icon', value: 'heart-outline' }, 'https://facebook.com')
    ).toBe(true);
  });
});
