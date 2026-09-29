import { describe, it, expect } from 'vitest';
import { parseOnePasswordEntry } from '../onepassword-entry';

describe('parseOnePasswordEntry', () => {
  it('parses login entry from 1pif line', () => {
    const line = JSON.stringify({
      title: 'GitHub',
      location: { urls: [{ url: 'https://github.com' }] },
      secureContents: {
        fields: [
          { designation: 'username', value: 'dev' },
          { designation: 'password', value: 'secret' },
        ],
        notesPlain: 'work account',
      },
    });
    const row = parseOnePasswordEntry(line);
    expect(row).toEqual({
      title: 'GitHub',
      username: 'dev',
      password: 'secret',
      link: 'https://github.com',
      notes: 'work account',
    });
  });

  it('returns null for invalid content', () => {
    expect(parseOnePasswordEntry('not json')).toBeNull();
  });
});
