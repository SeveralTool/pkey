import { describe, it, expect } from 'vitest';
import { parseBitwardenJson } from './bitwarden';
import { parseCsv } from './csv-generic';
import { applyImportMapping, applyHeaderlessImport, dedupeImportCards } from './pipeline';
import { CARD_LINK_MAX, CARD_TITLE_MAX } from '../constants/fieldLimits';

describe('importers', () => {
  it('parses bitwarden JSON', () => {
    const json = JSON.stringify({
      items: [
        {
          name: 'Test',
          login: { username: 'u', password: 'p', uris: [{ uri: 'https://x.com' }] },
        },
      ],
    });
    const parsed = parseBitwardenJson(json);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.title).toBe('Test');
  });

  it('maps CSV rows to cards', () => {
    const { headers, rows } = parseCsv('title,username,password\nSite,user,secret');
    const { cards } = applyImportMapping(rows, [
      { sourceHeader: 'title', targetField: 'title' },
      { sourceHeader: 'username', targetField: 'username' },
      { sourceHeader: 'password', targetField: 'passwordList' },
    ]);
    expect(cards[0]?.username).toBe('user');
    expect(cards[0]?.passwordList[0]).toBe('secret');
  });

  it('preserves long titles up to 512 chars', () => {
    const longTitle = 'Mercado Libre: Compras online '.repeat(20).trim();
    const { cards, warnings } = applyImportMapping(
      [{ title: longTitle, username: '', password: 'p', link: '', notes: '' }],
      [{ sourceHeader: 'title', targetField: 'title' }]
    );
    expect(cards[0]?.title.length).toBeLessThanOrEqual(CARD_TITLE_MAX);
    if (longTitle.length > CARD_TITLE_MAX) {
      expect(warnings.some((w) => w.kind === 'truncated_title')).toBe(true);
    }
  });

  it('warns on empty password', () => {
    const { warnings } = applyImportMapping(
      [{ title: 'Site', username: 'u', password: '  ', link: '', notes: '' }],
      [
        { sourceHeader: 'title', targetField: 'title' },
        { sourceHeader: 'username', targetField: 'username' },
        { sourceHeader: 'password', targetField: 'passwordList' },
      ]
    );
    expect(warnings.some((w) => w.kind === 'empty_password')).toBe(true);
  });

  it('warns when link exceeds limit', () => {
    const longLink = 'https://example.com/' + 'x'.repeat(CARD_LINK_MAX);
    const { warnings } = applyImportMapping(
      [{ title: 'Site', username: '', password: 'p', link: longLink, notes: '' }],
      [
        { sourceHeader: 'title', targetField: 'title' },
        { sourceHeader: 'password', targetField: 'passwordList' },
        { sourceHeader: 'link', targetField: 'link' },
      ]
    );
    expect(warnings.some((w) => w.kind === 'truncated_link')).toBe(true);
  });

  it('dedupes cards already in vault', () => {
    const { cards: incoming } = applyImportMapping(
      [{ title: 'A', username: 'u', password: 'p', link: '', notes: '' }],
      [
        { sourceHeader: 'title', targetField: 'title' },
        { sourceHeader: 'username', targetField: 'username' },
        { sourceHeader: 'password', targetField: 'passwordList' },
      ]
    );
    const { toImport, skipped, skippedCards } = dedupeImportCards(incoming, incoming);
    expect(skipped).toBe(1);
    expect(toImport).toHaveLength(0);
    expect(skippedCards[0]?.reason).toBe('duplicate_in_vault');
  });

  it('dedupes duplicate rows within the same import file', () => {
    const rows = [
      { title: 'Site', username: 'u', password: 'p', link: 'https://x.com', notes: '' },
      { title: 'Site', username: 'u', password: 'p2', link: 'https://x.com', notes: '' },
    ];
    const { cards: incoming } = applyImportMapping(rows, [
      { sourceHeader: 'title', targetField: 'title' },
      { sourceHeader: 'username', targetField: 'username' },
      { sourceHeader: 'password', targetField: 'passwordList' },
      { sourceHeader: 'link', targetField: 'link' },
    ]);
    const { toImport, skipped, skippedCards } = dedupeImportCards(incoming, []);
    expect(toImport).toHaveLength(1);
    expect(skipped).toBe(1);
    expect(skippedCards[0]?.reason).toBe('duplicate_in_file');
  });

  it('headerless mode recovers first data row', () => {
    const parsed = parseCsv(
      'Instagram\tandroid://x@com.instagram.android/\tuser1\nSpotify\thttps://spotify.com\tuser2'
    );
    const adjusted = applyHeaderlessImport(parsed);
    expect(adjusted.rows).toHaveLength(2);
    expect(adjusted.headers).toEqual(['column_1', 'column_2', 'column_3']);
    expect(adjusted.suggestedMapping?.[0]?.targetField).toBe('title');
    expect(adjusted.suggestedMapping?.[1]?.targetField).toBe('link');
    expect(adjusted.rows[0]?.column_1).toBe('Instagram');
  });

  it('canonicalizes android:// on import and keeps the original in uris', () => {
    const androidLink = 'android://x@com.instagram.android/';
    const marketLink = 'market://details?id=com.spotify.music';
    const intentLink =
      'intent://open#Intent;package=com.netflix.mediaclient;S.browser_fallback_url=https%3A%2F%2Fnetflix.com;end';

    const { cards } = applyImportMapping(
      [
        { title: 'IG', username: 'u1', password: 'p1', link: androidLink, notes: '' },
        { title: 'Spotify', username: 'u2', password: 'p2', link: marketLink, notes: '' },
        { title: 'Netflix', username: 'u3', password: 'p3', link: intentLink, notes: '' },
      ],
      [
        { sourceHeader: 'title', targetField: 'title' },
        { sourceHeader: 'username', targetField: 'username' },
        { sourceHeader: 'password', targetField: 'passwordList' },
        { sourceHeader: 'link', targetField: 'link' },
      ]
    );

    expect(cards[0]?.link).toBe('https://instagram.com');
    expect(cards[0]?.uris).toContain(androidLink);
    expect(cards[1]?.link).toBe('https://spotify.com');
    expect(cards[2]?.link).toBe('https://netflix.com');
  });

  it('keeps all Bitwarden uris and prefers https as link', () => {
    const json = JSON.stringify({
      items: [
        {
          name: 'IG',
          login: {
            username: 'u',
            password: 'p',
            uris: [
              { uri: 'androidapp://com.instagram.android' },
              { uri: 'https://instagram.com' },
            ],
          },
        },
      ],
    });
    const parsed = parseBitwardenJson(json);
    const { cards } = applyImportMapping(parsed.rows, parsed.suggestedMapping ?? []);
    expect(cards[0]?.link).toBe('https://instagram.com');
    expect(cards[0]?.uris?.some((u) => u.includes('instagram'))).toBe(true);
  });
});
