/**
 * @fileoverview SecretStore holder for the mobile session (audit M1 / H1).
 */
import { sanitizeCardForDisplay } from '@pkey/core';
import {
  attachVaultSecrets,
  clearVaultSecrets,
  commitVault,
  hydrateVaultSecrets,
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
    settings: { autoLogout: '1M', theme: 'DARK', language: 'ESP' },
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
    const { ui, disk } = commitVault(sampleDb([card({ title: 'Mail renamed', passwordList: [''] })]));
    expect(disk.cards[0].passwordList[0]).toBe(FIXTURE_PASSWORD);
    expect(ui.cards[0].title).toBe('Mail renamed');
    expect(JSON.stringify(ui)).not.toContain(FIXTURE_PASSWORD);
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
