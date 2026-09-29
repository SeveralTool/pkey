import { describe, it, expect } from 'vitest';
import { exportCardsToCsv } from './csv';
import { exportCardsToJson } from './json';
import { exportCardsToBitwarden } from './bitwarden';
import { parseBitwardenJson } from '../importers/parsers/bitwarden';
import { applyImportMapping } from '../importers/pipeline';
import type { PasswordCard } from '../types';

const card = (partial: Partial<PasswordCard> & { id: string }): PasswordCard => ({
  type: 'PASSWORD',
  title: 'T',
  icon: { type: 'icon', value: 'key' },
  username: 'u',
  passwordList: ['p'],
  link: 'https://ex.com',
  notes: 'n',
  creation_date: '2020-01-01T00:00:00.000Z',
  last_update: '2020-01-01T00:00:00.000Z',
  ...partial,
});

describe('exportCardsToCsv', () => {
  it('includes header and escapes commas', () => {
    const csv = exportCardsToCsv([
      card({ id: '1', title: 'Acme, Inc', notes: 'line1\nline2' }),
    ]);
    expect(csv.startsWith('title,type,username')).toBe(true);
    expect(csv).toContain('"Acme, Inc"');
  });
});

describe('exportCardsToJson', () => {
  it('wraps cards in a generic pkey-json payload', () => {
    const payload = exportCardsToJson([card({ id: '1', title: 'Acme' })]);
    expect(payload.format).toBe('pkey-json');
    expect(payload.version).toBe(1);
    expect(payload.cards).toHaveLength(1);
    expect(payload.cards[0].title).toBe('Acme');
    expect(payload.exportedAt).toBeTruthy();
  });
});

describe('exportCardsToBitwarden', () => {
  it('maps login and seed phrase cards', () => {
    const payload = exportCardsToBitwarden([
      card({ id: '1', otpSecret: 'ABCD' }),
      card({
        id: '2',
        type: 'SECRET_PHRASE',
        passwordList: ['alpha', 'beta'],
        title: 'Seed',
      }),
    ]);
    expect(payload.encrypted).toBe(false);
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0].type).toBe(1);
    expect(payload.items[0].login?.totp).toBe('ABCD');
    expect(payload.items[1].type).toBe(2);
    expect(payload.items[1].notes).toContain('alpha beta');
  });

  it('emits https then androidapp:// from link + uris', () => {
    const payload = exportCardsToBitwarden([
      card({
        id: 'ig',
        link: 'https://instagram.com',
        uris: ['android://x@com.instagram.android/'],
      }),
    ]);
    const uris = payload.items[0]?.login?.uris.map((u) => u.uri) ?? [];
    expect(uris[0]).toBe('https://instagram.com');
    expect(uris).toContain('androidapp://com.instagram.android');
  });

  it('round-trips Bitwarden export through import', () => {
    const original = card({
      id: 'ig',
      title: 'IG',
      link: 'https://instagram.com',
      uris: ['android://x@com.instagram.android/'],
    });
    const json = JSON.stringify(exportCardsToBitwarden([original]));
    const parsed = parseBitwardenJson(json);
    const { cards } = applyImportMapping(parsed.rows, parsed.suggestedMapping ?? []);
    expect(cards[0]?.link).toBe('https://instagram.com');
    expect(cards[0]?.uris?.some((u) => /instagram|android/i.test(u))).toBe(true);
  });
});
