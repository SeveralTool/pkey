import { buildDuplicateIndices } from './useCardAnalysis';
import type { PasswordCard } from '../types';

const card = (id: string, username: string, password: string): PasswordCard => ({
  id,
  type: 'PASSWORD',
  title: id,
  icon: { type: 'icon', value: 'key-outline' },
  username,
  passwordList: [password],
  link: '',
  notes: '',
  creation_date: '2026-01-01',
  last_update: '2026-01-01',
});

describe('buildDuplicateIndices', () => {
  it('indexes usernames and passwords for O(1) lookup', () => {
    const cards = [
      card('1', 'alice', 'pass-a'),
      card('2', 'Alice', 'pass-b'),
      card('3', 'bob', 'pass-a'),
    ];
    const { usernameIndex, passwordIndex } = buildDuplicateIndices(cards);

    expect(usernameIndex.get('alice')).toEqual(['1', '2']);
    expect(passwordIndex.get('pass-a')).toEqual(['1', '3']);
    expect(usernameIndex.get('bob')).toEqual(['3']);
  });
});
