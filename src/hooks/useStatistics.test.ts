import { InteractionManager } from 'react-native';
import { renderHook, waitFor } from '@testing-library/react-native';
import { useStatistics } from './useStatistics';
import { hydrateVaultSecrets, clearVaultSecrets } from '../services/vaultSecrets';
import type { EncryptedDatabase, PasswordCard } from '../types';

jest.mock('../utils/lazyZxcvbn', () => ({
  getZxcvbn: () => (password: string) => ({ score: password.length < 8 ? 1 : 4 }),
}));

function card(over: Partial<PasswordCard>): PasswordCard {
  return {
    id: 'c1',
    type: 'PASSWORD',
    title: 'Mail',
    username: 'a',
    passwordList: [''],
    link: '',
    notes: '',
    creation_date: '2026-01-01T00:00:00.000Z',
    last_update: '2026-01-01T00:00:00.000Z',
    icon: { type: 'icon', value: 'mail' },
    ...over,
  };
}

function sampleDb(cards: PasswordCard[]): EncryptedDatabase {
  return {
    version: '1.0.0',
    creation_date: '2026-01-01T00:00:00.000Z',
    last_update: '2026-01-01T00:00:00.000Z',
    passwordHash: 'verifier',
    cards,
    settings: { autoLogout: '1M', theme: 'DARK', language: 'ESP' },
  };
}

beforeEach(() => {
  clearVaultSecrets();
  jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation((cb: () => void) => {
    cb();
    return { cancel: jest.fn() } as never;
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useStatistics', () => {
  it('starts not-ready so callers can avoid painting empty-vault health', () => {
    jest.spyOn(InteractionManager, 'runAfterInteractions').mockImplementation(() => {
      return { cancel: jest.fn() } as never;
    });
    const { result } = renderHook(() => useStatistics([], []));
    expect(result.current.statsReady).toBe(false);
  });

  it('hydrates secrets from the store so display cards still yield duplicate metrics', async () => {
    const ui = hydrateVaultSecrets(
      sampleDb([
        card({ id: 'a', passwordList: ['shared-secret'] }),
        card({ id: 'b', username: 'b', passwordList: ['shared-secret'] }),
        card({ id: 'c', username: 'c', passwordList: ['unique-strong-password-XYZ'] }),
      ])
    );

    const { result } = renderHook(() => useStatistics(ui.cards, []));
    await waitFor(() => expect(result.current.statsReady).toBe(true));
    expect(result.current.totalCards).toBe(3);
    expect(result.current.duplicatedCount).toBe(2);
    expect(result.current.duplicatedCardIds).toEqual(['a', 'b']);
  });

  it('does not reschedule work when the same display-cards reference is passed', async () => {
    const ui = hydrateVaultSecrets(
      sampleDb([card({ id: 'a', passwordList: ['unique-strong-password-XYZ'] })])
    );
    const { result, rerender } = renderHook(({ cards }) => useStatistics(cards, []), {
      initialProps: { cards: ui.cards },
    });
    await waitFor(() => expect(result.current.statsReady).toBe(true));

    const scheduled = InteractionManager.runAfterInteractions as jest.Mock;
    const afterFirst = scheduled.mock.calls.length;
    rerender({ cards: ui.cards });
    expect(scheduled.mock.calls.length).toBe(afterFirst);
  });
});
