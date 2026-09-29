import { describe, it, expect, afterEach } from 'vitest';
import {
  getSecretStore,
  getVaultStatistics,
  __setStateForTests,
  __setOutboxForTests,
} from '../state/appStore';
import { emptyOutbox, withTombstone } from '../state/outbox';
import type { DisplayCard } from '@pkey/core';
import { t } from '@pkey/core';

const baseCard = (id: string, overrides: Partial<DisplayCard> = {}): DisplayCard => ({
  id,
  type: 'PASSWORD',
  title: id,
  icon: { type: 'icon', value: 'key-outline' },
  username: 'user',
  passwordList: [],
  link: 'https://example.com',
  notes: '',
  creation_date: '2024-01-01T00:00:00.000Z',
  last_update: '2024-06-01T00:00:00.000Z',
  _hasSecret: true,
  ...overrides,
});

describe('getVaultStatistics', () => {
  afterEach(() => {
    getSecretStore().clear();
    __setOutboxForTests(emptyOutbox());
    __setStateForTests({ cards: [], pendingOps: 0 });
  });

  it('hydrates secrets from SecretStore for weak/duplicate metrics', () => {
    __setStateForTests({
      cards: [baseCard('a'), baseCard('b'), baseCard('c', { username: 'other' })],
    });
    getSecretStore().set('a', ['same-password'], '');
    getSecretStore().set('b', ['same-password'], 'JBSWY3DPEHPK3PXP');
    getSecretStore().set('c', ['unique-strong-password-XYZ'], '');

    const stats = getVaultStatistics();
    expect(stats.totalCards).toBe(3);
    expect(stats.duplicatedCount).toBe(2);
    expect(stats.withOtpCount).toBe(1);
    expect(stats.withoutOtpCount).toBe(2);
    expect(stats.uniqueUsers).toBe(2);
    expect(stats.healthScore).toBeGreaterThanOrEqual(0);
    expect(stats.healthScore).toBeLessThanOrEqual(100);
  });

  it('includes offline outbox tombstones', () => {
    __setStateForTests({ cards: [baseCard('live')] });
    getSecretStore().set('live', ['password-here'], '');
    __setOutboxForTests(withTombstone(emptyOutbox(), 'gone', '2024-11-01T00:00:00.000Z'));

    const stats = getVaultStatistics();
    expect(stats.tombstoneCount).toBe(1);
    expect(stats.totalCards).toBe(1);
  });

  it('works while session is offline (local cards only)', () => {
    __setStateForTests({
      cards: [baseCard('offline-1')],
      connState: 'offline',
      authenticated: false,
      passwordHash: 'hash',
    });
    getSecretStore().set('offline-1', ['offline-pw'], '');

    const stats = getVaultStatistics();
    expect(stats.totalCards).toBe(1);
    expect(stats.passwordCount).toBe(1);
  });
});

describe('web i18n tags', () => {
  it('translates PASS/SEED badges in Spanish', () => {
    expect(t('tag_pass', 'ESP')).toBe('clave');
    expect(t('tag_seed', 'ESP')).toBe('frase');
    expect(t('tag_pass', 'ING')).toBe('pass');
    expect(t('tag_seed', 'ING')).toBe('seed');
  });

  it('translates HIBP badges in both languages', () => {
    expect(t('hibp_verified', 'ESP')).toBe('verificada por HIBP');
    expect(t('hibp_breached', 'ESP', { n: 3 })).toBe('expuesta por HIBP · 3');
    expect(t('hibp_unavailable', 'ESP')).toBe('HIBP no disponible');
    expect(t('hibp_verified', 'ING')).toBe('verified by HIBP');
    expect(t('hibp_breached', 'ING', { n: 1 })).toBe('exposed by HIBP · 1');
    expect(t('hibp_not_verified', 'ING')).toBe('not verified');
  });
});
