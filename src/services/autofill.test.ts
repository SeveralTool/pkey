import { buildAutofillCacheJson } from './autofill';
import type { PasswordCard } from '@pkey/core';

const card = (over: Partial<PasswordCard> = {}): PasswordCard => ({
  id: '1',
  type: 'PASSWORD',
  title: 'IG',
  icon: { type: 'icon', value: 'key' },
  username: 'u',
  passwordList: ['p'],
  link: '',
  notes: '',
  creation_date: '',
  last_update: '',
  ...over,
});

describe('buildAutofillCacheJson', () => {
  it('extracts package from Google android:// hash URI', () => {
    const json = buildAutofillCacheJson([
      card({
        link: 'android://token@com.instagram.android/',
      }),
    ]);
    const entries = JSON.parse(json) as { packages: string[]; domains: string[] }[];
    expect(entries[0]?.packages).toContain('com.instagram.android');
    expect(entries[0]?.domains).toContain('instagram.com');
  });

  it('uses uris when link is canonical https', () => {
    const json = buildAutofillCacheJson([
      card({
        link: 'https://instagram.com',
        uris: ['android://x@com.instagram.android/'],
      }),
    ]);
    const entries = JSON.parse(json) as { packages: string[]; domains: string[] }[];
    expect(entries[0]?.packages).toContain('com.instagram.android');
    expect(entries[0]?.domains).toContain('instagram.com');
  });
});
