import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mergePullLocally, mergeCards, type PasswordCard } from '@pkey/core';
import {
  __setStateForTests,
  wipeSession,
  saveCard,
  state,
  getSecretStore,
} from './appStore';
import { emptyOutbox, withUpsert, outboxCount } from './outbox';

const baseCard = (title: string, ts: string): PasswordCard => ({
  id: 'card-1',
  type: 'PASSWORD',
  title,
  icon: { type: 'icon', value: 'key-outline' },
  username: 'user',
  passwordList: ['secret'],
  link: '',
  notes: '',
  creation_date: ts,
  last_update: ts,
});

describe('PWA save → pull resilience', () => {
  beforeEach(() => {
    getSecretStore().set('card-1', ['secret'], '');
    __setStateForTests({
      connState: 'offline',
      passwordHash: 'test-hash',
      authenticated: false,
      cards: [
        {
          ...baseCard('old-title', '2020-01-01T00:00:00.000Z'),
          passwordList: [],
          _hasSecret: true,
        },
      ],
    });
  });

  afterEach(async () => {
    getSecretStore().clear();
    await wipeSession({ skipPersist: true });
  });

  it('keeps a newer local edit when pull echoes an older remote card', async () => {
    await saveCard({
      id: 'card-1',
      type: 'PASSWORD',
      title: 'pwa-title',
      username: 'user',
      link: '',
      notes: 'n',
      passwordList: ['secret'],
    });
    expect(state.cards.find((c) => c.id === 'card-1')?.title).toBe('pwa-title');

    const local = getSecretStore().cardWithSecrets(
      state.cards.find((c) => c.id === 'card-1') as PasswordCard
    );
    const { cards } = mergePullLocally([local], {
      upserts: [baseCard('old-title', '2020-01-01T00:00:00.000Z')],
    });
    expect(cards[0].title).toBe('pwa-title');
  });

  it('outbox last-write-wins replaces prior upsert title', () => {
    let o = emptyOutbox();
    o = withUpsert(o, baseCard('v1', '2020-01-01T00:00:00.000Z'));
    o = withUpsert(o, baseCard('v2', '2020-01-01T00:00:00.000Z'));
    expect(outboxCount(o)).toBe(1);
    expect(o.upserts['card-1'].title).toBe('v2');
  });

  it('tag-only save survives mergeCards + pull echo without overwrites', async () => {
    const android = 'android://x@com.instagram.android/';
    const icon = { type: 'icon' as const, value: 'logo-instagram' };
    getSecretStore().set('card-1', ['secret'], '');
    __setStateForTests({
      connState: 'offline',
      passwordHash: 'test-hash',
      authenticated: false,
      cards: [
        {
          ...baseCard('IG', '2020-01-01T00:00:00.000Z'),
          link: android,
          icon,
          tags: ['work'],
          passwordList: [],
          _hasSecret: true,
        },
      ],
    });
    await saveCard({
      id: 'card-1',
      type: 'PASSWORD',
      title: 'IG',
      username: 'user',
      link: android,
      notes: '',
      passwordList: ['secret'],
      icon,
      runIconDetection: false,
      tags: ['work', 'personal'],
    });
    const local = getSecretStore().cardWithSecrets(
      state.cards.find((c) => c.id === 'card-1') as PasswordCard
    );
    expect(local.tags).toEqual(['personal', 'work']);
    expect(local.link).toBe(android);
    expect(local.icon).toEqual(icon);

    const master = {
      ...baseCard('IG', '2020-01-01T00:00:00.000Z'),
      link: android,
      icon,
      tags: ['work'],
    };
    const { cards, overwrites } = mergeCards([master], [local]);
    expect(overwrites).toEqual([]);
    expect(cards[0].tags).toEqual(['personal', 'work']);

    const echoed = mergePullLocally([local], { upserts: cards });
    expect(echoed.cards[0].tags).toEqual(['personal', 'work']);
  });
});
