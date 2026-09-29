import { describe, it, expect } from 'vitest';
import { mergePullLocally, mergeCardFields, mergeCards } from './merge';
import { SecretStore, sanitizeCardForDisplay } from '../vault/secret-store';
import type { PasswordCard } from '../types';

const base = (id: string, ts: string, title: string): PasswordCard => ({
  id,
  type: 'PASSWORD',
  title,
  icon: { type: 'icon', value: 'key' },
  username: 'u',
  passwordList: ['secret'],
  link: '',
  notes: '',
  creation_date: ts,
  last_update: ts,
});

describe('mergeCardFields', () => {
  it('fills empty fields from the older side', () => {
    const newer = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'new'),
      username: '',
      passwordList: ['newpw'],
    };
    const older = {
      ...base('a', '2020-01-01T00:00:00.000Z', 'old'),
      username: 'kept-user',
      passwordList: ['oldpw'],
    };
    const { card, overwrittenFields } = mergeCardFields(newer, older);
    expect(card.username).toBe('kept-user');
    expect(card.passwordList).toEqual(['newpw']);
    expect(card.title).toBe('new');
    expect(overwrittenFields).not.toContain('password');
    expect(overwrittenFields).not.toContain('username');
  });

  it('unions uris and keeps android package when link becomes https', () => {
    const newer = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'IG'),
      link: 'https://instagram.com',
    };
    const older = {
      ...base('a', '2020-01-01T00:00:00.000Z', 'IG'),
      link: 'android://x@com.instagram.android/',
      uris: ['android://x@com.instagram.android/'],
    };
    const { card } = mergeCardFields(newer, older);
    expect(card.link).toBe('https://instagram.com');
    expect(card.uris?.some((u) => u.includes('com.instagram.android'))).toBe(true);
  });

  it('on equal timestamps prefers the second argument (incoming upsert)', () => {
    const mobile = base('a', '2021-01-01T00:00:00.000Z', 'mobile');
    const pwa = base('a', '2021-01-01T00:00:00.000Z', 'pwa-edit');
    const { card } = mergeCardFields(mobile, pwa);
    expect(card.title).toBe('pwa-edit');
  });

  it('unions tags without reporting an overwrite', () => {
    const older = { ...base('a', '2020-01-01T00:00:00.000Z', 't'), tags: ['work'] };
    const newer = { ...base('a', '2021-01-01T00:00:00.000Z', 't'), tags: ['personal'] };
    const { card, overwrittenFields } = mergeCardFields(older, newer);
    expect(card.tags).toEqual(['personal', 'work']);
    expect(overwrittenFields).not.toContain('tags');
  });

  it('treats tag casing as the same set (no overwrite)', () => {
    const older = { ...base('a', '2020-01-01T00:00:00.000Z', 't'), tags: ['Work'] };
    const newer = { ...base('a', '2021-01-01T00:00:00.000Z', 't'), tags: ['work'] };
    const { card, overwrittenFields } = mergeCardFields(older, newer);
    expect(card.tags).toEqual(['work']);
    expect(overwrittenFields).not.toContain('tags');
  });

  it('keeps older tags when the newer side has none', () => {
    const older = { ...base('a', '2020-01-01T00:00:00.000Z', 't'), tags: ['keep'] };
    const newer = { ...base('a', '2021-01-01T00:00:00.000Z', 't'), tags: [] };
    const { card, overwrittenFields } = mergeCardFields(older, newer);
    expect(card.tags).toEqual(['keep']);
    expect(overwrittenFields).not.toContain('tags');
  });
});

describe('mergeCards equal timestamps', () => {
  it('accepts remote upsert when last_update ties (PWA→master)', () => {
    const local = base('a', '2021-01-01T00:00:00.000Z', 'mobile');
    const remote = base('a', '2021-01-01T00:00:00.000Z', 'pwa-edit');
    const { cards } = mergeCards([local], [remote]);
    expect(cards[0].title).toBe('pwa-edit');
  });
});

describe('mergePullLocally', () => {
  it('prefers newer remote card', () => {
    const { cards: merged } = mergePullLocally([base('a', '2020-01-01T00:00:00.000Z', 'old')], {
      upserts: [base('a', '2021-01-01T00:00:00.000Z', 'new')],
    });
    expect(merged[0].title).toBe('new');
  });

  it('keeps local username when remote is newer but username empty', () => {
    const local = {
      ...base('a', '2020-01-01T00:00:00.000Z', 't'),
      username: 'alice',
      passwordList: ['old'],
    };
    const remote = {
      ...base('a', '2021-01-01T00:00:00.000Z', 't'),
      username: '',
      passwordList: ['new'],
    };
    const { cards } = mergePullLocally([local], { upserts: [remote] });
    expect(cards[0].username).toBe('alice');
    expect(cards[0].passwordList).toEqual(['new']);
  });
});

describe('mergeCards', () => {
  it('reports overwrites when both sides change the same field', () => {
    const local = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'L'),
      notes: 'local-notes',
    };
    const remote = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'R'),
      notes: 'remote-notes',
    };
    const { cards, overwrites } = mergeCards([local], [remote]);
    expect(cards[0].notes).toBe('remote-notes');
    expect(overwrites.some((o) => o.fields.includes('notes'))).toBe(true);
  });

  it('does not report an overwrite when the newer side simply last-write-wins', () => {
    const local = {
      ...base('a', '2020-01-01T00:00:00.000Z', 'L'),
      notes: 'local-notes',
    };
    const remote = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'R'),
      notes: 'remote-notes',
    };
    const { cards, overwrites } = mergeCards([local], [remote]);
    expect(cards[0].notes).toBe('remote-notes');
    expect(overwrites).toEqual([]);
  });

  it('keeps the newer HIBP result', () => {
    const local = {
      ...base('a', '2020-01-01T00:00:00.000Z', 'L'),
      hibp: {
        status: 'clean' as const,
        checkedAt: '2026-01-01T00:00:00.000Z',
        pwHash: 'a'.repeat(64),
      },
      hibpAuthorized: true,
    };
    const remote = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'R'),
      hibp: {
        status: 'breached' as const,
        count: 7,
        checkedAt: '2026-02-01T00:00:00.000Z',
        pwHash: 'b'.repeat(64),
      },
      hibpAuthorized: true,
    };
    const { cards } = mergeCards([local], [remote]);
    expect(cards[0].hibp).toMatchObject({
      status: 'breached',
      count: 7,
      checkedAt: '2026-02-01T00:00:00.000Z',
      pwHash: 'b'.repeat(64),
    });
    expect(cards[0].hibpAuthorized).toBe(true);
  });

  it('drops a stale HIBP result when the newer side cleared it', () => {
    const local = {
      ...base('a', '2020-01-01T00:00:00.000Z', 'L'),
      hibp: {
        status: 'clean' as const,
        checkedAt: '2026-01-01T00:00:00.000Z',
        pwHash: 'a'.repeat(64),
      },
      hibpAuthorized: true,
    };
    const remote = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'R'),
      passwordList: ['rotated'],
    };
    const { cards } = mergeCards([local], [remote]);
    expect(cards[0].hibp).toBeUndefined();
  });

  it('rejects a type change away from a filled PASSWORD card', () => {
    const local = {
      ...base('a', '2020-01-01T00:00:00.000Z', 'L'),
      type: 'PASSWORD' as const,
      passwordList: ['keep-me'],
      otpSecret: 'JBSWY3DPEHPK3PXP',
    };
    const remote = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'R'),
      type: 'NOTE' as const,
      passwordList: [''],
      otpSecret: '',
    };
    const { cards } = mergeCards([local], [remote]);
    expect(cards[0].type).toBe('PASSWORD');
    expect(cards[0].passwordList).toEqual(['keep-me']);
    expect(cards[0].otpSecret).toBe('JBSWY3DPEHPK3PXP');
    expect(cards[0].title).toBe('R');
  });

  it('allows an empty NOTE draft to become PASSWORD when the newer side has a password', () => {
    const local = {
      ...base('a', '2020-01-01T00:00:00.000Z', 'L'),
      type: 'NOTE' as const,
      passwordList: [''],
      notes: '',
    };
    const remote = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'R'),
      type: 'PASSWORD' as const,
      passwordList: ['new-pw'],
    };
    const { cards } = mergeCards([local], [remote]);
    expect(cards[0].type).toBe('PASSWORD');
    expect(cards[0].passwordList).toEqual(['new-pw']);
  });

  it('rejects a type change away from a filled SECRET_PHRASE card', () => {
    const local = {
      ...base('a', '2020-01-01T00:00:00.000Z', 'L'),
      type: 'SECRET_PHRASE' as const,
      passwordList: ['alpha', 'bravo'],
    };
    const remote = {
      ...base('a', '2021-01-01T00:00:00.000Z', 'R'),
      type: 'PASSWORD' as const,
      passwordList: ['not-a-seed'],
    };
    const { cards } = mergeCards([local], [remote]);
    expect(cards[0].type).toBe('SECRET_PHRASE');
    expect(cards[0].passwordList).toEqual(['alpha', 'bravo']);
    expect(cards[0].title).toBe('R');
  });
});

describe('SecretStore', () => {
  it('never exposes secrets via sanitizeCardForDisplay', () => {
    const store = new SecretStore();
    store.set('1', ['hunter2']);
    const display = sanitizeCardForDisplay({
      ...base('1', '', 't'),
      passwordList: ['hunter2'],
    });
    expect(display.passwordList).toEqual([]);
    expect(display._hasSecret).toBe(true);
    expect(store.getPassword('1')).toBe('hunter2');
  });
});
