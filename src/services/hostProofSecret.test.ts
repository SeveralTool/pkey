/**
 * @fileoverview Host pairing secret persists in SecureStore and rotates on salt change.
 */

const mockSecureStore = new Map<string, string>();

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

import { getOrCreateHostProofSecret, SK_HOST_PROOF_SECRET } from './hostProofSecret';

beforeEach(() => {
  mockSecureStore.clear();
});

describe('getOrCreateHostProofSecret', () => {
  it('creates and reuses a secret for the same vault salt', async () => {
    const first = await getOrCreateHostProofSecret('salt-a');
    const second = await getOrCreateHostProofSecret('salt-a');
    expect(first).toHaveLength(64);
    expect(second).toBe(first);
    expect(mockSecureStore.get(SK_HOST_PROOF_SECRET)).toContain(first);
  });

  it('rotates when the vault salt changes', async () => {
    const first = await getOrCreateHostProofSecret('salt-a');
    const second = await getOrCreateHostProofSecret('salt-b');
    expect(second).not.toBe(first);
    expect(JSON.parse(mockSecureStore.get(SK_HOST_PROOF_SECRET)!).vaultSalt).toBe('salt-b');
  });
});
