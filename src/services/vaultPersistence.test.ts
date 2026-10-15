/**
 * @fileoverview The vault writer keeps secrets on the sync snapshot and off React.
 */
import { DEFAULT_VAULT_SETTINGS, type PasswordCard } from '@pkey/core';
import type { EncryptedDatabase } from '../types';
import {
  clearVaultPersistence,
  noteVaultPersisted,
  persistVaultDisk,
  stageVault,
  vaultForSync,
} from './vaultPersistence';
import { clearVaultSecrets } from './vaultSecrets';

const mockWriteDb = jest.fn();
jest.mock('./storage', () => ({
  writeDatabaseToDisk: (...args: unknown[]) => mockWriteDb(...args),
}));

const SECRET = 'persist-secret';

function card(over: Partial<PasswordCard> & Pick<PasswordCard, 'id'>): PasswordCard {
  return {
    type: 'PASSWORD',
    title: 'Mail',
    icon: { type: 'icon', value: 'mail' },
    username: 'a',
    passwordList: [''],
    link: '',
    notes: '',
    creation_date: '2020-01-01T00:00:00.000Z',
    last_update: '2020-06-01T00:00:00.000Z',
    tags: [],
    ...over,
  };
}

function vault(cards: PasswordCard[]): EncryptedDatabase {
  return {
    version: '1.0.0',
    creation_date: '2020-01-01T00:00:00.000Z',
    last_update: '2020-06-01T00:00:00.000Z',
    passwordHash: 'a'.repeat(64),
    salt: 'b'.repeat(32),
    sessionId: 'sess',
    cards,
    settings: { ...DEFAULT_VAULT_SETTINGS },
  };
}

describe('vaultPersistence', () => {
  beforeEach(() => {
    clearVaultSecrets();
    clearVaultPersistence();
    mockWriteDb.mockReset();
    mockWriteDb.mockResolvedValue(undefined);
  });

  it('stages a display snapshot and keeps the secret snapshot for sync', () => {
    const staged = stageVault(vault([card({ id: 'c1', passwordList: [SECRET] })]));
    expect(JSON.stringify(staged.ui)).not.toContain(SECRET);
    expect(staged.disk.cards[0].passwordList[0]).toBe(SECRET);
    expect(vaultForSync()).toBe(staged.disk);
  });

  it('does not let a later keystroke replace the disk snapshot an in-flight persist already owns', async () => {
    const staged = stageVault(vault([card({ id: 'c1', passwordList: [SECRET] })]));
    let release: () => void = () => undefined;
    mockWriteDb.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        })
    );
    const pending = persistVaultDisk(staged.disk, 'master');
    const edited = stageVault({
      ...staged.ui,
      cards: [{ ...staged.ui.cards[0], title: 'Renamed' }],
    });
    release();
    await pending;
    expect(vaultForSync()?.cards[0].title).toBe('Renamed');
    expect(vaultForSync()?.cards[0].passwordList[0]).toBe(SECRET);
    expect(edited.ui.cards[0].passwordList).toEqual([]);
  });

  it('noteVaultPersisted publishes an already-written vault without another write', () => {
    const staged = stageVault(vault([card({ id: 'c1', passwordList: [SECRET] })]));
    noteVaultPersisted(staged.disk);
    expect(mockWriteDb).not.toHaveBeenCalled();
    expect(vaultForSync()).toBe(staged.disk);
  });
});
