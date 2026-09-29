import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { DisplayCard } from '@pkey/core';
import { DEFAULT_VAULT_SETTINGS } from '@pkey/core';
import {
  __setStateForTests,
  wipeSession,
  saveCard,
  state,
  getSecretStore,
  filteredCards,
} from './appStore';

const ts = '2020-01-01T00:00:00.000Z';

const display = (patch: Partial<DisplayCard> & Pick<DisplayCard, 'id' | 'type'>): DisplayCard => ({
  title: 'Card',
  icon: { type: 'icon', value: 'key-outline' },
  username: 'user',
  passwordList: [],
  link: '',
  notes: '',
  creation_date: ts,
  last_update: ts,
  ...patch,
});

function writableOffline(cards: DisplayCard[]) {
  __setStateForTests({
    connState: 'offline',
    passwordHash: 'test-hash',
    authenticated: false,
    search: '',
    toast: null,
    settings: { ...DEFAULT_VAULT_SETTINGS },
    cards,
  });
}

describe('saveCard master-parity rules', () => {
  beforeEach(() => {
    getSecretStore().clear();
  });

  afterEach(async () => {
    getSecretStore().clear();
    await wipeSession({ skipPersist: true });
  });

  it('rejects changing a filled PASSWORD card to NOTE', async () => {
    getSecretStore().set('card-1', ['keep-secret'], 'JBSWY3DPEHPK3PXP');
    writableOffline([display({ id: 'card-1', type: 'PASSWORD', _hasSecret: true, _hasOtp: true })]);

    await saveCard({
      id: 'card-1',
      type: 'NOTE',
      title: 'Card',
      username: 'user',
      link: '',
      notes: 'x',
      passwordList: [''],
      otpSecret: '',
    });

    expect(state.cards[0].type).toBe('PASSWORD');
    expect(getSecretStore().getPassword('card-1')).toBe('keep-secret');
    expect(getSecretStore().getOtpSecret('card-1')).toBe('JBSWY3DPEHPK3PXP');
    expect(state.toast?.type).toBe('error');
  });

  it('rejects changing a SECRET_PHRASE card to NOTE or PASSWORD', async () => {
    getSecretStore().set('card-1', ['alpha', 'bravo'], '');
    writableOffline([
      display({ id: 'card-1', type: 'SECRET_PHRASE', _hasSecret: true }),
    ]);

    await saveCard({
      id: 'card-1',
      type: 'NOTE',
      title: 'Memo',
      username: 'user',
      link: 'https://example.com',
      notes: 'kept notes',
      passwordList: [''],
      otpSecret: '',
    });

    expect(state.cards[0].type).toBe('SECRET_PHRASE');
    expect(getSecretStore().getSeed('card-1')).toBe('alpha bravo');
    expect(state.toast?.type).toBe('error');

    await saveCard({
      id: 'card-1',
      type: 'PASSWORD',
      title: 'Memo',
      username: 'user',
      link: '',
      notes: '',
      passwordList: ['not-a-seed'],
      otpSecret: '',
    });

    expect(state.cards[0].type).toBe('SECRET_PHRASE');
    expect(getSecretStore().getSeed('card-1')).toBe('alpha bravo');
  });

  it('clears OTP when the modal sends an empty secret', async () => {
    getSecretStore().set('card-1', ['secret'], 'JBSWY3DPEHPK3PXP');
    writableOffline([
      display({
        id: 'card-1',
        type: 'PASSWORD',
        _hasSecret: true,
        _hasOtp: true,
        otpAlgorithm: 'SHA256',
        otpDigits: 8,
        otpPeriod: 60,
      }),
    ]);

    await saveCard({
      id: 'card-1',
      type: 'PASSWORD',
      title: 'Card',
      username: 'user',
      link: '',
      notes: '',
      passwordList: ['secret'],
      otpSecret: '',
    });

    expect(state.cards[0]._hasOtp).toBeFalsy();
    expect(getSecretStore().getOtpSecret('card-1')).toBe('');
    expect(state.cards[0].otpAlgorithm).toBeUndefined();
  });

  it('preserves OTP algorithm/digits/period when the secret is unchanged', async () => {
    getSecretStore().set('card-1', ['secret'], 'JBSWY3DPEHPK3PXP');
    writableOffline([
      display({
        id: 'card-1',
        type: 'PASSWORD',
        _hasSecret: true,
        _hasOtp: true,
        otpAlgorithm: 'SHA256',
        otpDigits: 8,
        otpPeriod: 60,
      }),
    ]);

    await saveCard({
      id: 'card-1',
      type: 'PASSWORD',
      title: 'Card',
      username: 'user',
      link: '',
      notes: '',
      passwordList: ['secret'],
      otpSecret: 'JBSWY3DPEHPK3PXP',
    });

    expect(state.cards[0].otpAlgorithm).toBe('SHA256');
    expect(state.cards[0].otpDigits).toBe(8);
    expect(state.cards[0].otpPeriod).toBe(60);
  });

  it('preserves HIBP when the password did not change', async () => {
    getSecretStore().set('card-1', ['secret'], '');
    const hibp = { status: 'clean' as const, checkedAt: ts, pwHash: 'abc' };
    writableOffline([
      display({
        id: 'card-1',
        type: 'PASSWORD',
        _hasSecret: true,
        hibp,
        hibpAuthorized: true,
      }),
    ]);

    await saveCard({
      id: 'card-1',
      type: 'PASSWORD',
      title: 'Card',
      username: 'user',
      link: '',
      notes: '',
      passwordList: ['secret'],
    });

    expect(state.cards[0].hibp).toEqual(hibp);
    expect(state.cards[0].hibpAuthorized).toBe(true);
  });

  it('clears HIBP when the password changes', async () => {
    getSecretStore().set('card-1', ['secret'], '');
    writableOffline([
      display({
        id: 'card-1',
        type: 'PASSWORD',
        _hasSecret: true,
        hibp: { status: 'clean', checkedAt: ts, pwHash: 'abc' },
        hibpAuthorized: true,
      }),
    ]);

    await saveCard({
      id: 'card-1',
      type: 'PASSWORD',
      title: 'Card',
      username: 'user',
      link: '',
      notes: '',
      passwordList: ['new-secret'],
    });

    expect(state.cards[0].hibp).toBeUndefined();
    expect(getSecretStore().getPassword('card-1')).toBe('new-secret');
  });

  it('uses the default title when the title is empty', async () => {
    writableOffline([]);
    await saveCard({
      id: 'new-1',
      type: 'NOTE',
      title: '   ',
      username: '',
      link: '',
      notes: 'hi',
      passwordList: [''],
    });
    expect(state.cards[0].title).toBe('New key');
  });
});

describe('filteredCards NOTE notes', () => {
  afterEach(async () => {
    await wipeSession({ skipPersist: true });
  });

  it('matches notes on NOTE cards only', () => {
    writableOffline([
      display({ id: 'n1', type: 'NOTE', title: 'Memo', notes: 'unique-needle-text' }),
      display({
        id: 'p1',
        type: 'PASSWORD',
        title: 'Login',
        notes: 'unique-needle-text',
        _hasSecret: true,
      }),
    ]);
    __setStateForTests({ search: 'unique-needle' });
    const ids = filteredCards().map((c) => c.id);
    expect(ids).toEqual(['n1']);
  });
});
