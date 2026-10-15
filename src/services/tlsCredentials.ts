/**
 * @fileoverview Per-device self-signed TLS credentials for local TCP servers (device migration).
 *
 * Certificate generation uses react-native-quick-crypto (native RSA) + node-forge (X.509 PEM).
 * The npm `selfsigned` package (v5) requires Node `crypto.webcrypto`, which crypto-browserify
 * does not provide on React Native — loading it crashes Hermes with `.slice` of undefined.
 */
import * as SecureStore from 'expo-secure-store';
import { SHA256, Hex, Base64 } from 'crypto-es';
import { getSecureRandomHex } from '../utils/secureRandom';
import {
  defaultSans,
  mergeSans,
  missingDns,
  normalizeDns,
  normalizeIp,
  type StoredSans,
  type TlsSanInput,
} from './tlsSans';

export type { TlsSanInput } from './tlsSans';

/** v2 store keys: certs include localhost + optional LAN SAN entries. */
export const TLS_CERT_STORE_KEY = 'pkey_tls_cert_pem_v2';
export const TLS_KEY_STORE_KEY = 'pkey_tls_key_pem_v2';
export const TLS_SANS_STORE_KEY = 'pkey_tls_sans_v2';

/** Device-bound: excluded from iOS backups and unreadable while locked. */
const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

let memoryCache: { cert: string; key: string; sans: StoredSans } | null = null;

function generateRsaKeyPairPem(): { privatePem: string; publicPem: string } {
  // Native OpenSSL via quick-crypto — much faster than pure-JS forge RSA on device.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const QuickCrypto = require('react-native-quick-crypto');
  const qc = QuickCrypto.default ?? QuickCrypto;
  if (typeof qc.generateKeyPairSync !== 'function') {
    throw new Error('QUICK_CRYPTO_KEYGEN_UNAVAILABLE');
  }
  const { privateKey, publicKey } = qc.generateKeyPairSync('rsa', {
    modulusLength: 3072,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { privatePem: String(privateKey), publicPem: String(publicKey) };
}

function buildSelfSignedCertPem(
  privatePem: string,
  publicPem: string,
  commonName: string,
  sans: StoredSans
): string {
  // Import only PKI + SHA-256 — avoid node-forge/lib/index.js which pulls log.js
  // (can throw `.slice` of undefined when `window.location` looks like a Metro URL).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forge = require('node-forge/lib/forge');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node-forge/lib/pki');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node-forge/lib/md.all');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node-forge/lib/util');
  const privateKey = forge.pki.privateKeyFromPem(privatePem);
  const publicKey = forge.pki.publicKeyFromPem(publicPem);
  const cert = forge.pki.createCertificate();
  cert.publicKey = publicKey;
  cert.serialNumber = getSecureRandomHex(8);
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date();
  cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 2);
  const attrs: { name: string; value: string }[] = [{ name: 'commonName', value: commonName }];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);

  const altNames: Array<{ type: number; value?: string; ip?: string }> = [];
  for (const dns of sans.dnsNames) {
    altNames.push({ type: 2, value: dns });
  }
  for (const ip of sans.ipAddresses) {
    altNames.push({ type: 7, ip });
  }
  if (altNames.length === 0) {
    altNames.push({ type: 2, value: commonName });
  }

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true },
    { name: 'extKeyUsage', serverAuth: true, clientAuth: true },
    { name: 'subjectAltName', altNames },
  ]);
  cert.sign(privateKey, forge.md.sha256.create());
  return forge.pki.certificateToPem(cert);
}

async function generateCredentials(sansInput?: TlsSanInput): Promise<{
  cert: string;
  key: string;
  sans: StoredSans;
}> {
  const cn = `pkey-${getSecureRandomHex(4)}`;
  const sans = mergeSans(defaultSans(cn), sansInput);
  const { privatePem, publicPem } = generateRsaKeyPairPem();
  const cert = buildSelfSignedCertPem(privatePem, publicPem, cn, sans);
  return { cert, key: privatePem, sans };
}

async function persistCredentials(creds: {
  cert: string;
  key: string;
  sans: StoredSans;
}): Promise<void> {
  await SecureStore.setItemAsync(TLS_CERT_STORE_KEY, creds.cert, STORE_OPTIONS);
  await SecureStore.setItemAsync(TLS_KEY_STORE_KEY, creds.key, STORE_OPTIONS);
  await SecureStore.setItemAsync(TLS_SANS_STORE_KEY, JSON.stringify(creds.sans), STORE_OPTIONS);
  memoryCache = creds;
}

/**
 * Loads or creates persisted PEM cert/key pair for local TLS listeners.
 * When `sans` expands coverage (new mDNS host / LAN IP), regenerates so browsers
 * can match the hostname they open.
 */
export async function ensureTlsCredentials(
  sans?: TlsSanInput
): Promise<{ cert: string; key: string }> {
  if (memoryCache) {
    if (!sans) return { cert: memoryCache.cert, key: memoryCache.key };
    const merged = mergeSans(memoryCache.sans, sans);
    if (!missingDns(memoryCache.sans, merged)) {
      return { cert: memoryCache.cert, key: memoryCache.key };
    }
    const regenerated = await generateCredentials(merged);
    await persistCredentials(regenerated);
    return { cert: regenerated.cert, key: regenerated.key };
  }

  const storedCert = await SecureStore.getItemAsync(TLS_CERT_STORE_KEY, STORE_OPTIONS);
  const storedKey = await SecureStore.getItemAsync(TLS_KEY_STORE_KEY, STORE_OPTIONS);
  const storedSansRaw = await SecureStore.getItemAsync(TLS_SANS_STORE_KEY, STORE_OPTIONS);
  let storedSans: StoredSans | null = null;
  if (storedSansRaw) {
    try {
      const parsed = JSON.parse(storedSansRaw) as StoredSans;
      if (parsed && Array.isArray(parsed.dnsNames) && Array.isArray(parsed.ipAddresses)) {
        storedSans = {
          dnsNames: parsed.dnsNames.map(normalizeDns),
          ipAddresses: parsed.ipAddresses.map(normalizeIp),
        };
      }
    } catch {
      storedSans = null;
    }
  }

  if (storedCert && storedKey && storedSans) {
    memoryCache = { cert: storedCert, key: storedKey, sans: storedSans };
    if (!sans) return { cert: storedCert, key: storedKey };
    const merged = mergeSans(storedSans, sans);
    if (!missingDns(storedSans, merged)) {
      return { cert: storedCert, key: storedKey };
    }
    const regenerated = await generateCredentials(merged);
    await persistCredentials(regenerated);
    return { cert: regenerated.cert, key: regenerated.key };
  }

  const generated = await generateCredentials(sans);
  await persistCredentials(generated);
  return { cert: generated.cert, key: generated.key };
}

/**
 * Options for `Tcp.connectTLS()` to a local self-signed migration server.
 * Must be used with `connectTLS` (not `createConnection` + `tls: true` — native
 * expects a ReadableMap for TLS context, not a boolean).
 *
 * `rejectUnauthorized: false` makes the whole TLS authorization result non-fatal:
 * the CA chain and the hostname check. The cert is self-signed, and migration
 * dials a LAN IP that is not in the default SANs (CN, `localhost`, `127.0.0.1`).
 * There is no separate hostname verifier. Callers must pin with
 * {@link tlsFingerprintsMatch} against the certificate the socket actually presented.
 */
export function getTlsClientOptions(host: string, port: number) {
  return {
    port,
    host,
    rejectUnauthorized: false,
  };
}

/**
 * Credentials + listen options for `Tcp.createTLSServer({ keystore })`.
 * react-native-tcp-socket ignores PEM on listen(); it needs a PKCS#12 keystore URI.
 */
export async function getTlsListenOptions(port: number, host = '0.0.0.0', sans?: TlsSanInput) {
  const { cert, key, keystoreUri } = await ensureTlsKeystoreFile(sans);
  return {
    port,
    host,
    reuseAddress: true as const,
    cert,
    key,
    keystore: keystoreUri,
  };
}

/**
 * Builds a PKCS#12 (empty password) for react-native-tcp-socket's TLSServer,
 * which only accepts `tls.keystore` (not PEM cert/key on listen()).
 */
function pemToPkcs12Base64(certPem: string, keyPem: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const forge = require('node-forge/lib/forge');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node-forge/lib/pki');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node-forge/lib/pkcs12');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node-forge/lib/asn1');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node-forge/lib/md.all');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('node-forge/lib/util');
  const privateKey = forge.pki.privateKeyFromPem(keyPem);
  const cert = forge.pki.certificateFromPem(certPem);
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(privateKey, [cert], '', {
    algorithm: '3des',
  });
  return forge.util.encode64(forge.asn1.toDer(p12Asn1).getBytes());
}

/**
 * Ensures a on-disk PKCS12 keystore for createTLSServer, derived from device PEMs.
 * @returns PEM pair + `file://` keystore URI
 */
export async function ensureTlsKeystoreFile(sans?: TlsSanInput): Promise<{
  cert: string;
  key: string;
  keystoreUri: string;
}> {
  const { cert, key } = await ensureTlsCredentials(sans);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const FileSystem = require('expo-file-system/legacy');
  const fp = fingerprintTlsCertificatePem(cert) || 'default';
  const keystoreUri = `${FileSystem.documentDirectory}pkey-tls-${fp}.p12`;
  const info = await FileSystem.getInfoAsync(keystoreUri);
  if (!info.exists) {
    const b64 = pemToPkcs12Base64(cert, key);
    await FileSystem.writeAsStringAsync(keystoreUri, b64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  return { cert, key, keystoreUri };
}

/** Clears the in-memory TLS credential cache (tests / credential rotation). */
export function clearTlsCredentialsCache(): void {
  memoryCache = null;
}

/**
 * Hex chars of SHA-256 shown to the user for the migration certificate compare
 * (128 bits). Both the receiver-declared value (`/info.tlsFingerprint`) and the
 * socket-observed value (`MigrationTcpSession.peerFingerprint`) use this length.
 */
export const TLS_FINGERPRINT_HEX_LEN = 32;

const TLS_FINGERPRINT_RE = /^[0-9A-F]{32}$/;

/**
 * Uppercase 32-hex migration certificate fingerprint, or null when `value`
 * is not that shape. Shorter or longer digests do not pin.
 */
export function normalizeTlsFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const norm = value.trim().toUpperCase();
  return TLS_FINGERPRINT_RE.test(norm) ? norm : null;
}

/**
 * True when both sides produced the same observed certificate fingerprint.
 * A missing observation or a missing declaration does not match.
 */
export function tlsFingerprintsMatch(observed: unknown, declared: unknown): boolean {
  const left = normalizeTlsFingerprint(observed);
  const right = normalizeTlsFingerprint(declared);
  return left !== null && left === right;
}

/** Formats a full SHA-256 hex digest as the user-visible fingerprint (uppercase prefix). */
export function formatTlsFingerprintHex(sha256Hex: string): string {
  return sha256Hex
    .replace(/[^0-9a-fA-F]/g, '')
    .slice(0, TLS_FINGERPRINT_HEX_LEN)
    .toUpperCase();
}

/** SHA-256 fingerprint of PEM certificate (first {@link TLS_FINGERPRINT_HEX_LEN} hex chars, uppercase). */
export function fingerprintTlsCertificatePem(pem: string): string {
  if (!pem || typeof pem !== 'string') return '';
  const body = pem
    .replace(/-----BEGIN CERTIFICATE-----/g, '')
    .replace(/-----END CERTIFICATE-----/g, '')
    .replace(/\s/g, '');
  if (!body) return '';
  const der = Base64.parse(body);
  return formatTlsFingerprintHex(SHA256(der).toString(Hex));
}
