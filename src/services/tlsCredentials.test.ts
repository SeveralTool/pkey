/**
 * @fileoverview TLS credential cache: IP SAN changes must not rotate the cert.
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

jest.mock('react-native-quick-crypto', () => ({
  generateKeyPairSync: () => {
    throw new Error('QUICK_CRYPTO_KEYGEN_UNAVAILABLE');
  },
}));

import * as SecureStore from 'expo-secure-store';
import {
  TLS_CERT_STORE_KEY,
  TLS_KEY_STORE_KEY,
  TLS_SANS_STORE_KEY,
  clearTlsCredentialsCache,
  ensureTlsCredentials,
  fingerprintTlsCertificatePem,
} from './tlsCredentials';
import { defaultSans } from './tlsSans';

const CERT_PEM = `-----BEGIN CERTIFICATE-----
MIIBozCCAQmgAwIBAgIBATANBgkqhkiG9w0BAQsFADAPMQ0wCwYDVQQDDARwa2V5
MA0GCSqGSIb3DQEBCwUAA4GBAA==
-----END CERTIFICATE-----`;

const KEY_PEM = '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----';

function seedStore(): void {
  const sans = defaultSans('pkey-abcd');
  mockSecureStore.set(TLS_CERT_STORE_KEY, CERT_PEM);
  mockSecureStore.set(TLS_KEY_STORE_KEY, KEY_PEM);
  mockSecureStore.set(TLS_SANS_STORE_KEY, JSON.stringify(sans));
}

beforeEach(() => {
  mockSecureStore.clear();
  clearTlsCredentialsCache();
  seedStore();
  jest.mocked(SecureStore.setItemAsync).mockClear();
});

describe('ensureTlsCredentials', () => {
  it('returns the persisted PEM pair without regenerating', async () => {
    const creds = await ensureTlsCredentials();
    expect(creds).toEqual({ cert: CERT_PEM, key: KEY_PEM });
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('does not rotate credentials when only the LAN IP changes', async () => {
    const first = await ensureTlsCredentials({ ipAddresses: ['192.168.1.50'] });
    expect(first.cert).toBe(CERT_PEM);
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
  });

  it('attempts regeneration when a DNS SAN is missing (native keygen unavailable in Jest)', async () => {
    await expect(ensureTlsCredentials({ dnsNames: ['pkey-iphone.local'] })).rejects.toThrow(
      'QUICK_CRYPTO_KEYGEN_UNAVAILABLE'
    );
  });
});

describe('fingerprintTlsCertificatePem', () => {
  it('returns empty for missing PEM bodies', () => {
    expect(fingerprintTlsCertificatePem('')).toBe('');
    expect(
      fingerprintTlsCertificatePem('-----BEGIN CERTIFICATE-----\n-----END CERTIFICATE-----')
    ).toBe('');
  });

  it('is stable for a given PEM', () => {
    const a = fingerprintTlsCertificatePem(CERT_PEM);
    const b = fingerprintTlsCertificatePem(CERT_PEM);
    expect(a).toHaveLength(16);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9A-F]+$/);
  });
});
