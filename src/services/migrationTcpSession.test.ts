/**
 * @fileoverview The socket-observed TLS fingerprint must be a real digest of the
 * peer DER or `null` — never a hash of an unexpected JS value.
 */

const mockConnectTLS = jest.fn();
jest.mock('../utils/nativeTcpSocket', () => ({
  getNativeTcpSocket: () => ({
    connectTLS: (...args: unknown[]) => mockConnectTLS(...args),
  }),
}));

jest.mock('expo-secure-store', () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'WHEN_UNLOCKED_THIS_DEVICE_ONLY',
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => {}),
  deleteItemAsync: jest.fn(async () => {}),
}));

import { SHA256, Hex, Base64 } from 'crypto-es';
import { MigrationTcpSession, peerCertificateFingerprint } from './migrationTcpSession';
import { TLS_FINGERPRINT_HEX_LEN, fingerprintTlsCertificatePem } from './tlsCredentials';

const DER = Uint8Array.from([0x30, 0x82, 0x01, 0x0a, 0x02, 0x01, 0x01, 0xff, 0x00, 0x7f]);
const DER_HEX = Array.from(DER, (b) => b.toString(16).padStart(2, '0')).join('');
const DER_B64 = Base64.stringify(Hex.parse(DER_HEX));
const DER_SHA256 = SHA256(Hex.parse(DER_HEX)).toString(Hex);
const EXPECTED = DER_SHA256.slice(0, TLS_FINGERPRINT_HEX_LEN).toUpperCase();

describe('peerCertificateFingerprint', () => {
  it('matches fingerprintTlsCertificatePem for the same DER', () => {
    const pem = `-----BEGIN CERTIFICATE-----\n${DER_B64}\n-----END CERTIFICATE-----`;
    expect(fingerprintTlsCertificatePem(pem)).toBe(EXPECTED);
    expect(peerCertificateFingerprint(DER_B64)).toBe(EXPECTED);
  });

  it('accepts the Android fingerprint256 colon format', () => {
    const colon = DER_SHA256.toUpperCase().match(/.{2}/g)!.join(':');
    expect(peerCertificateFingerprint({ fingerprint256: colon })).toBe(EXPECTED);
  });

  it('accepts raw DER as Uint8Array, serialised Buffer, or base64', () => {
    expect(peerCertificateFingerprint({ raw: DER })).toBe(EXPECTED);
    expect(peerCertificateFingerprint(DER)).toBe(EXPECTED);
    expect(peerCertificateFingerprint({ type: 'Buffer', data: Array.from(DER) })).toBe(EXPECTED);
    expect(peerCertificateFingerprint({ raw: DER_B64 })).toBe(EXPECTED);
  });

  it('returns null for a Promise (async native method) instead of hashing it', () => {
    const pending = Promise.resolve({ fingerprint256: 'ignored' });
    expect(peerCertificateFingerprint(pending)).toBeNull();
    expect(peerCertificateFingerprint('[object Promise]')).toBeNull();
  });

  it('returns null for the iOS dictionary without DER or digest', () => {
    expect(
      peerCertificateFingerprint({ pubkey: DER_B64, subject: 'CN=pkey', issuer: 'CN=pkey' })
    ).toBeNull();
  });

  it('returns null for empty or malformed input', () => {
    expect(peerCertificateFingerprint(null)).toBeNull();
    expect(peerCertificateFingerprint(undefined)).toBeNull();
    expect(peerCertificateFingerprint('')).toBeNull();
    expect(peerCertificateFingerprint({ fingerprint256: 'AB:CD' })).toBeNull();
    expect(peerCertificateFingerprint({ raw: new Uint8Array(0) })).toBeNull();
    expect(peerCertificateFingerprint({ type: 'Buffer', data: [1, 'x'] })).toBeNull();
  });
});

function socketWithPeer(getPeer: () => unknown) {
  return {
    getPeerCertificate: () => getPeer(),
    on: jest.fn(),
    destroy: jest.fn(),
    write: jest.fn(),
  };
}

describe('MigrationTcpSession.connect', () => {
  beforeEach(() => {
    mockConnectTLS.mockReset();
  });

  it('resolves with a null peerFingerprint for the iOS certificate dictionary', async () => {
    mockConnectTLS.mockImplementation((_opts: unknown, onSecure: () => void) => {
      queueMicrotask(onSecure);
      return socketWithPeer(async () => ({ pubkey: 'abc', subject: 'CN=pkey', issuer: 'CN=pkey' }));
    });
    const session = new MigrationTcpSession();
    await expect(session.connect('192.168.1.8', 7393)).resolves.toBeUndefined();
    expect(session.peerFingerprint).toBeNull();
  });

  it('does not resolve until getPeerCertificate settles', async () => {
    let release: (value: unknown) => void = () => undefined;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    mockConnectTLS.mockImplementation((_opts: unknown, onSecure: () => void) => {
      queueMicrotask(onSecure);
      return socketWithPeer(() => gate);
    });
    const session = new MigrationTcpSession();
    let settled = false;
    const pending = session.connect('192.168.1.8', 7393).then(() => {
      settled = true;
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    const colon = DER_SHA256.toUpperCase().match(/.{2}/g)!.join(':');
    release({ fingerprint256: colon });
    await pending;
    expect(session.peerFingerprint).toBe(EXPECTED);
  });
});
