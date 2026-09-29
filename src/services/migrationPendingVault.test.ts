/**
 * @fileoverview Staged migration vault: pairing secret stays in SecureStore.
 */

const mockFileStore = new Map<string, string>();
const mockAsyncStore = new Map<string, string>();
const mockSecureStore = new Map<string, string>();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  EncodingType: { UTF8: 'utf8' },
    getInfoAsync: jest.fn(async (uri: string) => ({ exists: mockFileStore.has(uri) })),
  writeAsStringAsync: jest.fn(async (uri: string, contents: string) => {
    mockFileStore.set(uri, contents);
  }),
  readAsStringAsync: jest.fn(async (uri: string) => {
    const value = mockFileStore.get(uri);
    if (value == null) throw new Error('ENOENT');
    return value;
  }),
  deleteAsync: jest.fn(async (uri: string) => {
    mockFileStore.delete(uri);
  }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(async (key: string) => mockAsyncStore.get(key) ?? null),
  setItem: jest.fn(async (key: string, value: string) => {
    mockAsyncStore.set(key, value);
  }),
  removeItem: jest.fn(async (key: string) => {
    mockAsyncStore.delete(key);
  }),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async (key: string) => mockSecureStore.get(key) ?? null),
  setItemAsync: jest.fn(async (key: string, value: string) => {
    mockSecureStore.set(key, value);
  }),
  deleteItemAsync: jest.fn(async (key: string) => {
    mockSecureStore.delete(key);
  }),
}));

import {
  commitPendingMigration,
  discardPendingMigration,
  hasPendingMigration,
  PENDING_MIGRATION_FILENAME,
  PENDING_PAIRING_SECRET_KEY,
  readPendingMigrationMeta,
  stagePendingMigration,
  updatePendingFinalizeTarget,
  type MigrationFinalizeTarget,
} from './migrationPendingVault';

const PENDING_META_KEY = '@pkey/migration_pending_meta_v1';
const PENDING_URI = `file:///docs/${PENDING_MIGRATION_FILENAME}`;
const LIVE_URI = 'file:///docs/pkey_encrypted_db.json';

const TARGET: MigrationFinalizeTarget = {
  senderIp: '192.168.1.10',
  senderIpAlternates: ['192.168.1.11'],
  senderCallbackPort: 7394,
  migrationId: 'mig-1',
  pairingSecret: 'SECRETPAIRINGCODE',
  sessionId: 'sess-1',
  senderWipeProof: 'proof-1',
};

beforeEach(() => {
  mockFileStore.clear();
  mockAsyncStore.clear();
  mockSecureStore.clear();
});

describe('migrationPendingVault', () => {
  it('stores pairingSecret in SecureStore, not AsyncStorage', async () => {
    await stagePendingMigration('encrypted-payload', 3, TARGET);

    expect(mockFileStore.get(PENDING_URI)).toBe('encrypted-payload');
    expect(mockSecureStore.get(PENDING_PAIRING_SECRET_KEY)).toBe(TARGET.pairingSecret);

    const rawMeta = mockAsyncStore.get(PENDING_META_KEY);
    expect(rawMeta).toBeDefined();
    expect(rawMeta).not.toContain(TARGET.pairingSecret);
    expect(JSON.parse(rawMeta as string).target.pairingSecret).toBeUndefined();

    const meta = await readPendingMigrationMeta();
    expect(meta?.cardCount).toBe(3);
    expect(meta?.target?.pairingSecret).toBe(TARGET.pairingSecret);
    expect(meta?.target?.senderIp).toBe(TARGET.senderIp);
  });

  it('migrates a legacy AsyncStorage blob that still embeds pairingSecret', async () => {
    mockAsyncStore.set(
      PENDING_META_KEY,
      JSON.stringify({
        cardCount: 2,
        createdAt: 1_000,
        target: TARGET,
      })
    );

    const meta = await readPendingMigrationMeta();
    expect(meta?.target?.pairingSecret).toBe(TARGET.pairingSecret);
    expect(mockSecureStore.get(PENDING_PAIRING_SECRET_KEY)).toBe(TARGET.pairingSecret);

    const stripped = JSON.parse(mockAsyncStore.get(PENDING_META_KEY) as string);
    expect(stripped.target.pairingSecret).toBeUndefined();
  });

  it('clears file, meta, and pairing secret on discard', async () => {
    await stagePendingMigration('payload', 1, TARGET);
    await discardPendingMigration();

    expect(await hasPendingMigration()).toBe(false);
    expect(mockAsyncStore.get(PENDING_META_KEY)).toBeUndefined();
    expect(mockSecureStore.get(PENDING_PAIRING_SECRET_KEY)).toBeUndefined();
  });

  it('commit promotes the staged file then discards secrets', async () => {
    await stagePendingMigration('new-vault', 4, TARGET);
    mockFileStore.set(LIVE_URI, 'old-vault');

    await commitPendingMigration();

    expect(mockFileStore.get(LIVE_URI)).toBe('new-vault');
    expect(mockFileStore.has(PENDING_URI)).toBe(false);
    expect(mockSecureStore.get(PENDING_PAIRING_SECRET_KEY)).toBeUndefined();
  });

  it('updatePendingFinalizeTarget replaces the stored secret', async () => {
    await stagePendingMigration('payload', 1, TARGET);
    await updatePendingFinalizeTarget({ ...TARGET, pairingSecret: 'NEWSECRET' });

    expect(mockSecureStore.get(PENDING_PAIRING_SECRET_KEY)).toBe('NEWSECRET');
    const meta = await readPendingMigrationMeta();
    expect(meta?.target?.pairingSecret).toBe('NEWSECRET');
  });
});
