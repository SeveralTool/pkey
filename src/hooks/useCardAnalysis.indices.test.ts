/**
 * @fileoverview Duplicate indices keep their identity when membership does not change.
 */
import type { PasswordCard } from '../types';
import { retainDuplicateIndices } from './useCardAnalysis';

function card(id: string, username: string, password: string): PasswordCard {
  return {
    id,
    type: 'PASSWORD',
    title: id,
    icon: { type: 'icon', value: 'key' },
    username,
    passwordList: [password],
    link: '',
    notes: '',
    creation_date: '2020-01-01T00:00:00.000Z',
    last_update: '2020-01-01T00:00:00.000Z',
    tags: [],
  };
}

describe('retainDuplicateIndices', () => {
  it('returns the same maps when a title change does not alter duplicates', () => {
    const first = retainDuplicateIndices(null, [
      card('a', 'ana', 'secret'),
      card('b', 'bob', 'other'),
    ]);
    const renamed = [
      { ...card('a', 'ana', 'secret'), title: 'Renamed' },
      card('b', 'bob', 'other'),
    ];
    const second = retainDuplicateIndices(first, renamed);
    expect(second).toBe(first);
  });

  it('replaces only the password map when a password changes', () => {
    const first = retainDuplicateIndices(null, [
      card('a', 'ana', 'secret'),
      card('b', 'bob', 'other'),
    ]);
    const next = retainDuplicateIndices(first, [
      card('a', 'ana', 'rotated'),
      card('b', 'bob', 'other'),
    ]);
    expect(next.usernameIndex).toBe(first.usernameIndex);
    expect(next.passwordIndex).not.toBe(first.passwordIndex);
  });
});
