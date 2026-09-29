import { describe, it, expect } from 'vitest';
import {
  hostFromLink,
  registrableDomain,
  matchLoginCandidates,
} from './matchLoginCandidates';
import type { PasswordCard } from '../types';

const card = (id: string, link: string, title = id): PasswordCard => ({
  id,
  type: 'PASSWORD',
  title,
  icon: { type: 'icon', value: 'key' },
  username: 'u',
  passwordList: ['p'],
  link,
  notes: '',
  creation_date: '',
  last_update: '',
});

describe('hostFromLink / registrableDomain', () => {
  it('normalizes hosts', () => {
    expect(hostFromLink('https://www.Example.com/login')).toBe('example.com');
    expect(registrableDomain('mail.google.com')).toBe('google.com');
  });
});

describe('matchLoginCandidates', () => {
  const cards = [
    card('1', 'https://mail.google.com', 'Gmail'),
    card('2', 'https://github.com', 'GitHub'),
    card('3', 'android-app://com.twitter.android', 'Twitter'),
  ];

  it('prefers exact host then registrable domain', () => {
    const m = matchLoginCandidates(cards, { urlOrHost: 'https://mail.google.com/u/0' });
    expect(m[0].card.id).toBe('1');
    expect(m[0].reason).toBe('exact-host');
  });

  it('matches android:// stored in uris while link is https', () => {
    const c = card('ig', 'https://instagram.com', 'IG');
    c.uris = [
      'android://token@com.instagram.android/',
    ];
    const m = matchLoginCandidates([c], { packageName: 'com.instagram.android' });
    expect(m[0]?.card.id).toBe('ig');
    expect(m[0]?.reason).toBe('package');
  });
});
