/**
 * @fileoverview SecretStore holder for the mobile session (audit M1 / H1).
 */
import { DEFAULT_VAULT_SETTINGS, sanitizeCardForDisplay } from '@pkey/core';
import {
  attachVaultSecrets,
  clearVaultSecrets,
  commitVault,
  hydrateVaultSecrets,
  reuseHydratedCards,
} from './vaultSecrets';
import type { EncryptedDatabase, PasswordCard } from '../types';

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
    settings: { ...DEFAULT_VAULT_SETTINGS, autoLogout: '1M', theme: 'DARK', language: 'ESP' },
  };
}

const FIXTURE_PASSWORD = 'CorrectHorseBatteryStaple-9!';

beforeEach(() => {
  clearVaultSecrets();
});

describe('vaultSecrets (M1 / H1)', () => {
  it('hydrates the store and strips secrets from React-facing cards', () => {
    const db = sampleDb([
      card({
        username: 'a@b.c',
        passwordList: [FIXTURE_PASSWORD],
        otpSecret: 'JBSWY3DPEHPK3PXP',
      }),
    ]);
    const ui = hydrateVaultSecrets(db);
    expect(JSON.stringify(ui)).not.toContain(FIXTURE_PASSWORD);
    expect(JSON.stringify(ui)).not.toContain('JBSWY3DPEHPK3PXP');
    expect(ui.cards[0].passwordList).toEqual([]);
    expect(attachVaultSecrets(ui).cards[0].passwordList[0]).toBe(FIXTURE_PASSWORD);
  });

  it('commitVault keeps disk secrets while returning a sanitized UI snapshot', () => {
    hydrateVaultSecrets(sampleDb([card({ passwordList: [FIXTURE_PASSWORD] })]));
    const { ui, disk } = commitVault(
      sampleDb([card({ title: 'Mail renamed', passwordList: [''] })])
    );
    expect(disk.cards[0].passwordList[0]).toBe(FIXTURE_PASSWORD);
    expect(ui.cards[0].title).toBe('Mail renamed');
    expect(JSON.stringify(ui)).not.toContain(FIXTURE_PASSWORD);
  });

  it('reuses display card references that the edit did not touch', () => {
    const ui = hydrateVaultSecrets(
      sampleDb([
        card({ id: 'keep', passwordList: [FIXTURE_PASSWORD] }),
        card({ id: 'other', title: 'Other', passwordList: ['other-secret'] }),
      ])
    );
    const keep = ui.cards[0];
    const edited = {
      ...ui.cards[1],
      title: 'Renamed',
      last_update: '2026-02-01T00:00:00.000Z',
    };
    const next = commitVault({ ...ui, cards: [keep, edited] });
    expect(next.ui.cards[0]).toBe(keep);
    expect(next.ui.cards[1]).toBe(edited);
    expect(next.disk.cards[0].passwordList[0]).toBe(FIXTURE_PASSWORD);
    expect(next.disk.cards[1].passwordList[0]).toBe('other-secret');
    expect(JSON.stringify(next.ui)).not.toContain(FIXTURE_PASSWORD);
    expect(JSON.stringify(next.ui)).not.toContain('other-secret');
  });

  it('does not return a password edit as the React card', () => {
    const ui = hydrateVaultSecrets(sampleDb([card({ passwordList: [FIXTURE_PASSWORD] })]));
    const withPassword = { ...ui.cards[0], passwordList: ['new-secret'] };
    const next = commitVault({ ...ui, cards: [withPassword] });
    expect(next.ui.cards[0]).not.toBe(withPassword);
    expect(next.ui.cards[0].passwordList).toEqual([]);
    expect(next.disk.cards[0].passwordList[0]).toBe('new-secret');
    expect(JSON.stringify(next.ui)).not.toContain('new-secret');
  });

  it('reuses a hydrated secret card while its display reference is unchanged', () => {
    const ui = hydrateVaultSecrets(sampleDb([card({ passwordList: [FIXTURE_PASSWORD] })]));
    const first = reuseHydratedCards(ui.cards, new Map());
    const second = reuseHydratedCards(ui.cards, first.cache);
    expect(second.cards[0]).toBe(first.cards[0]);
    expect(second.cards[0].passwordList[0]).toBe(FIXTURE_PASSWORD);

    const renamed = { ...ui.cards[0], title: 'Renamed' };
    const third = reuseHydratedCards([renamed], second.cache);
    expect(third.cards[0]).not.toBe(first.cards[0]);
    expect(third.cards[0].title).toBe('Renamed');
    expect(third.cards[0].passwordList[0]).toBe(FIXTURE_PASSWORD);
  });

  it('clearVaultSecrets drops plaintext so a post-lock snapshot cannot leak the fixture', () => {
    const db = sampleDb([card({ passwordList: [FIXTURE_PASSWORD] })]);
    const ui = hydrateVaultSecrets(db);
    clearVaultSecrets();
    const empty = sanitizeCardForDisplay(attachVaultSecrets(ui).cards[0]);
    expect(JSON.stringify(empty)).not.toContain(FIXTURE_PASSWORD);
    expect(attachVaultSecrets(ui).cards[0].passwordList[0]).toBe('');
  });
});
