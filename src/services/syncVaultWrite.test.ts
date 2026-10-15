/**
 * @fileoverview Settings-only sync must persist secrets that React does not hold.
 */
import { act, renderHook } from '@testing-library/react-native';
import type { Dispatch, SetStateAction } from 'react';
import {
  DEFAULT_VAULT_SETTINGS,
  computeDbVersionHash,
  decryptAuthOk,
  emptySyncIndex,
  encryptSyncPushWire,
  type PasswordCard,
} from '@pkey/core';
import type { EncryptedDatabase } from '../types';
import type { LocaleStrings } from '../constants/localization';
import { useDebouncedVaultWrite } from '../hooks/useDebouncedVaultWrite';
import { SyncServerCore } from './syncServerCore';
import { computeChallengeResponse } from './syncAuth';
import { commitSyncedVault, vaultServerPush } from './syncVaultWrite';
import {
  attachVaultSecrets,
  clearVaultSecrets,
  commitVault,
  hydrateVaultSecrets,
} from './vaultSecrets';
import { unregisterVaultPersist } from './vaultPersist';
import { clearVaultPersistence } from './vaultPersistence';

const mockWriteDb = jest.fn();
jest.mock('./storage', () => ({
  writeDatabaseToDisk: (...args: unknown[]) => mockWriteDb(...args),
}));

const SECRET = 's3cret';

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

function vault(cards: PasswordCard[], webTheme: 'LIGHT' | 'DARK' = 'DARK'): EncryptedDatabase {
  return {
    version: '1.0.0',
    creation_date: '2020-01-01T00:00:00.000Z',
    last_update: '2020-06-01T00:00:00.000Z',
    passwordHash: 'a'.repeat(64),
    salt: 'b'.repeat(32),
    sessionId: 'sess',
    cards,
    settings: { ...DEFAULT_VAULT_SETTINGS, webTheme },
  };
}

function mountWriter(setDb: Dispatch<SetStateAction<EncryptedDatabase>>): void {
  renderHook(() =>
    useDebouncedVaultWrite({
      isLogged: true,
      masterPassword: 'master-pass',
      setDb,
      getT: () =>
        ({
          filesystem_error_title: 'fs',
          filesystem_error_body: 'err',
        }) as LocaleStrings,
    })
  );
}

async function pushSync(
  core: SyncServerCore,
  db: EncryptedDatabase,
  sourceId: string,
  body: {
    upserts: PasswordCard[];
    settings?: { webTheme: 'LIGHT' | 'DARK' };
  }
): Promise<void> {
  const sent: Record<string, unknown>[] = [];
  const session = core.createWsSession((msg) => {
    sent.push(msg as Record<string, unknown>);
  }, '10.0.0.8');
  await session.onMessage({ type: 'challenge_request', sourceId });
  const challengeMsg = sent.find((m) => m.type === 'challenge') as { challenge: string };
  await session.onMessage({
    type: 'auth',
    response: computeChallengeResponse(challengeMsg.challenge, db.passwordHash),
    protocolVersion: 2,
  });
  const authOk = sent.find((m) => m.type === 'auth_ok') as {
    encryptedPayload: { salt: string; iv: string; ciphertext: string; hmac: string };
  };
  const decoded = decryptAuthOk(authOk.encryptedPayload, db.passwordHash);
  if (!decoded?.token) throw new Error('auth failed');
  sent.length = 0;
  await act(async () => {
    await session.onMessage({
      type: 'sync_push',
      protocolVersion: 2,
      encryptedPayload: encryptSyncPushWire(
        decoded.token,
        {
          index: emptySyncIndex(),
          upserts: body.upserts,
          deletions: [],
          tombstones: [],
          ...(body.settings ? { settings: body.settings } : {}),
        },
        db.passwordHash
      ),
    });
  });
  const err = sent.find((m) => m.type === 'error');
  expect(err).toBeUndefined();
}

function reactHasSecret(snapshots: readonly EncryptedDatabase[], secret: string): boolean {
  return snapshots.some((db) => JSON.stringify(db).includes(secret));
}

describe('sync vault persist keeps secrets off the React snapshot', () => {
  beforeEach(() => {
    clearVaultSecrets();
    clearVaultPersistence();
    unregisterVaultPersist();
    mockWriteDb.mockReset();
    mockWriteDb.mockResolvedValue(undefined);
  });

  it('settings-only processSync writes the secret and hands React the sanitized db', async () => {
    const full = vault([card({ id: 'keep', passwordList: [SECRET] })]);
    const ui = hydrateVaultSecrets(full);
    expect(JSON.stringify(ui)).not.toContain(SECRET);
    const versionBefore = vaultServerPush(ui).versionHash;

    const reactDbs: EncryptedDatabase[] = [];
    const holder = { current: ui };
    const setReactDb: Dispatch<SetStateAction<EncryptedDatabase>> = (action) => {
      const next = typeof action === 'function' ? action(holder.current) : action;
      holder.current = next;
      reactDbs.push(next);
    };
    mountWriter(setReactDb);

    let announcedVersion = '';
    const core = new SyncServerCore({
      getDb: () => attachVaultSecrets(holder.current),
      setDb: async (next) => {
        const disk = await commitSyncedVault(next, setReactDb);
        announcedVersion = vaultServerPush(disk).versionHash;
      },
    });

    await pushSync(core, ui, 'pwa-settings', {
      upserts: [],
      settings: { webTheme: 'LIGHT' },
    });

    expect(mockWriteDb).toHaveBeenCalledTimes(1);
    const written = mockWriteDb.mock.calls[0][0] as EncryptedDatabase;
    expect(written.cards.find((c) => c.id === 'keep')?.passwordList[0]).toBe(SECRET);
    expect(written.settings.webTheme).toBe('LIGHT');
    expect(reactDbs.length).toBeGreaterThan(0);
    expect(reactHasSecret(reactDbs, SECRET)).toBe(false);
    expect(reactDbs.every((db) => db.cards.every((c) => c.passwordList.length === 0))).toBe(true);
    expect(holder.current.settings.webTheme).toBe('LIGHT');
    expect(announcedVersion).toBe(versionBefore);
    expect(announcedVersion).toBe(vaultServerPush(holder.current).versionHash);
    expect(announcedVersion).not.toBe(computeDbVersionHash(holder.current));
  });

  it('a card missing from the upsert keeps its secret on disk', async () => {
    const full = vault([
      card({ id: 'keep', passwordList: [SECRET] }),
      card({ id: 'edited', title: 'Old', passwordList: ['local-other'] }),
    ]);
    const ui = hydrateVaultSecrets(full);
    const reactDbs: EncryptedDatabase[] = [];
    const holder = { current: ui };
    const setReactDb: Dispatch<SetStateAction<EncryptedDatabase>> = (action) => {
      const next = typeof action === 'function' ? action(holder.current) : action;
      holder.current = next;
      reactDbs.push(next);
    };
    mountWriter(setReactDb);

    const core = new SyncServerCore({
      getDb: () => attachVaultSecrets(holder.current),
      setDb: async (next) => {
        await commitSyncedVault(next, setReactDb);
      },
    });

    await pushSync(core, ui, 'pwa-upsert', {
      upserts: [
        card({
          id: 'edited',
          title: 'Renamed',
          passwordList: ['from-pwa'],
          last_update: '2021-01-01T00:00:00.000Z',
        }),
      ],
    });

    expect(mockWriteDb).toHaveBeenCalledTimes(1);
    const written = mockWriteDb.mock.calls[0][0] as EncryptedDatabase;
    expect(written.cards.find((c) => c.id === 'keep')?.passwordList[0]).toBe(SECRET);
    expect(written.cards.find((c) => c.id === 'edited')?.passwordList[0]).toBe('from-pwa');
    expect(reactHasSecret(reactDbs, SECRET)).toBe(false);
    expect(reactHasSecret(reactDbs, 'from-pwa')).toBe(false);
    expect(reactHasSecret(reactDbs, 'local-other')).toBe(false);
  });

  it('announced hash tracks the real password and ignores a sanitized UI copy', () => {
    const full = vault([card({ id: 'keep', passwordList: [SECRET] })]);
    const ui = hydrateVaultSecrets(full);
    const announced = vaultServerPush(ui);
    const revealed = attachVaultSecrets(ui);

    expect(vaultServerPush(revealed).versionHash).toBe(announced.versionHash);
    expect(computeDbVersionHash(ui)).not.toBe(announced.versionHash);

    const rotated = commitVault({
      ...revealed,
      cards: [{ ...revealed.cards[0], passwordList: ['rotated-secret'] }],
    });
    expect(vaultServerPush(rotated.ui).versionHash).not.toBe(announced.versionHash);
    expect(vaultServerPush(rotated.ui).versionHash).toBe(vaultServerPush(rotated.disk).versionHash);
    expect(vaultServerPush(rotated.ui).settingsHash).toBe(announced.settingsHash);
  });
});
