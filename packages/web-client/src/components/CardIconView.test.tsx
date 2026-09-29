import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import { CardIconView } from './CardIconView';
import { presetIconDataUri } from './presetIconDataUris';

describe('CardIconView', () => {
  it('uses local data URI for preset icons (no Iconify CDN)', () => {
    const uri = presetIconDataUri('logo-github');
    expect(uri).toBeTruthy();
    expect(uri!.startsWith('data:image/svg+xml')).toBe(true);
    expect(uri).not.toContain('iconify');

    const { container } = render(() => (
      <CardIconView icon={{ type: 'icon', value: 'logo-github' }} title="GitHub" />
    ));
    const img = container.querySelector('img.card-icon-img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src.startsWith('data:image/svg+xml')).toBe(true);
    expect(img!.src).not.toContain('api.iconify.design');
  });

  it('falls back to emoji for unknown preset keys', () => {
    const { container } = render(() => (
      <CardIconView icon={{ type: 'icon', value: 'not-a-real-icon' }} title="X" />
    ));
    expect(container.querySelector('.card-icon-emoji')).toBeTruthy();
  });

  it('shows Facebook preset instead of a leftover Mercado Libre favicon', () => {
    const { container } = render(() => (
      <CardIconView
        icon={{ type: 'image', uri: 'https://icons.duckduckgo.com/ip3/mercadolibre.com.ico' }}
        title="Mercado Libre"
        link="https://www.facebook.com/mercadolibre"
      />
    ));
    const img = container.querySelector('img.card-icon-img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src).toBe(presetIconDataUri('logo-facebook'));
    expect(img!.src).not.toContain('mercadolibre');
  });

  it('shows a matching Instagram favicon instead of the internal brand glyph', () => {
    const favicon = 'https://icons.duckduckgo.com/ip3/instagram.com.ico';
    const { container } = render(() => (
      <CardIconView
        icon={{ type: 'image', uri: favicon }}
        title="Instagram"
        link="https://instagram.com"
      />
    ));
    const img = container.querySelector('img.card-icon-img') as HTMLImageElement | null;
    expect(img).toBeTruthy();
    expect(img!.src).toBe(favicon);
  });
});
