/**
 * @fileoverview Vault envelope v4: Argon2id (RFC 9106) + XChaCha20-Poly1305.
 *
 * AAD covers the public header (`v`, `kdf`, params, salt) so those fields
 * cannot be swapped without failing authentication (audit H4).
 */
import { argon2id } from '@noble/hashes/argon2.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { utf8ToBytes, bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils.js';

export const ENVELOPE_V4 = 4 as const;
export const KDF_ARGON2ID = 'argon2id' as const;

/** OWASP / RFC 9106 mobile baseline. */
export const ARGON2_MEMORY_KIB =
  typeof process !== 'undefined' && process.env.NODE_ENV === 'test' ? 32 : 65_536;
export const ARGON2_TIME_COST = 3;
export const ARGON2_PARALLELISM = 1;
export const ARGON2_DK_LEN = 32;

export type Argon2Provider = (
  password: Uint8Array,
  salt: Uint8Array,
  params: { t: number; m: number; p: number; dkLen: number }
) => Uint8Array;

export type AeadProvider = {
  seal(key: Uint8Array, nonce: Uint8Array, plaintext: Uint8Array, aad: Uint8Array): Uint8Array;
  open(key: Uint8Array, nonce: Uint8Array, ciphertext: Uint8Array, aad: Uint8Array): Uint8Array;
};

let argon2Provider: Argon2Provider | null = null;
let aeadProvider: AeadProvider | null = null;

export function setArgon2Provider(provider: Argon2Provider | null): void {
  argon2Provider = provider;
}

export function setAeadProvider(provider: AeadProvider | null): void {
  aeadProvider = provider;
}

export interface EnvelopeV4 {
  v: 4;
  kdf: typeof KDF_ARGON2ID;
  kdfMem: number;
  kdfTime: number;
  kdfPar: number;
  kdfSalt: string;
  nonce: string;
  ciphertext: string;
  /** Optional device-secret binding (hex of HKDF salt id, not the secret). */
  deviceBound?: boolean;
}

export function isEnvelopeV4(value: unknown): value is EnvelopeV4 {
  if (!value || typeof value !== 'object') return false;
  const rec = value as EnvelopeV4;
  return (
    rec.v === 4 &&
    rec.kdf === KDF_ARGON2ID &&
    typeof rec.kdfSalt === 'string' &&
    typeof rec.nonce === 'string' &&
    typeof rec.ciphertext === 'string'
  );
}

export function argon2idHex(
  password: string,
  saltHex: string,
  params: { t?: number; m?: number; p?: number; dkLen?: number } = {}
): string {
  const t = params.t ?? ARGON2_TIME_COST;
  const m = params.m ?? ARGON2_MEMORY_KIB;
  const p = params.p ?? ARGON2_PARALLELISM;
  const dkLen = params.dkLen ?? ARGON2_DK_LEN;
  const passwordBytes = utf8ToBytes(password);
  const salt = hexToBytes(saltHex);
  const out = argon2Provider
    ? argon2Provider(passwordBytes, salt, { t, m, p, dkLen })
    : argon2id(passwordBytes, salt, { t, m, p, dkLen });
  return bytesToHex(out);
}

function defaultAead(): AeadProvider {
  return {
    seal(key, nonce, plaintext, aad) {
      return xchacha20poly1305(key, nonce, aad).encrypt(plaintext);
    },
    open(key, nonce, ciphertext, aad) {
      return xchacha20poly1305(key, nonce, aad).decrypt(ciphertext);
    },
  };
}

function aead(): AeadProvider {
  return aeadProvider ?? defaultAead();
}

/** Canonical AAD string for envelope v4 (must stay byte-identical on JS and native). */
export function envelopeV4AadUtf8(env: Omit<EnvelopeV4, 'nonce' | 'ciphertext'>): string {
  return JSON.stringify({
    v: env.v,
    kdf: env.kdf,
    kdfMem: env.kdfMem,
    kdfTime: env.kdfTime,
    kdfPar: env.kdfPar,
    kdfSalt: env.kdfSalt,
    deviceBound: env.deviceBound === true,
  });
}

function headerAad(env: Omit<EnvelopeV4, 'nonce' | 'ciphertext'>): Uint8Array {
  return utf8ToBytes(envelopeV4AadUtf8(env));
}

export function encryptVaultV4(
  plaintext: string,
  rootKeyHex: string,
  kdfSaltHex: string,
  params: { t?: number; m?: number; p?: number; deviceBound?: boolean } = {}
): string {
  const header: Omit<EnvelopeV4, 'nonce' | 'ciphertext'> = {
    v: 4,
    kdf: KDF_ARGON2ID,
    kdfMem: params.m ?? ARGON2_MEMORY_KIB,
    kdfTime: params.t ?? ARGON2_TIME_COST,
    kdfPar: params.p ?? ARGON2_PARALLELISM,
    kdfSalt: kdfSaltHex,
    deviceBound: params.deviceBound === true,
  };
  const nonce = randomBytes(24);
  const ct = aead().seal(hexToBytes(rootKeyHex), nonce, utf8ToBytes(plaintext), headerAad(header));
  const env: EnvelopeV4 = {
    ...header,
    nonce: bytesToHex(nonce),
    ciphertext: bytesToHex(ct),
  };
  return JSON.stringify(env);
}

export function decryptVaultV4(envelopeJson: string, rootKeyHex: string): string | null {
  try {
    const env = JSON.parse(envelopeJson) as unknown;
    if (!isEnvelopeV4(env)) return null;
    const header: Omit<EnvelopeV4, 'nonce' | 'ciphertext'> = {
      v: 4,
      kdf: env.kdf,
      kdfMem: env.kdfMem,
      kdfTime: env.kdfTime,
      kdfPar: env.kdfPar,
      kdfSalt: env.kdfSalt,
      deviceBound: env.deviceBound === true,
    };
    const pt = aead().open(
      hexToBytes(rootKeyHex),
      hexToBytes(env.nonce),
      hexToBytes(env.ciphertext),
      headerAad(header)
    );
    return new TextDecoder().decode(pt);
  } catch {
    return null;
  }
}

export const HKDF_INFO_DEVICE_BIND = 'pkey-device-bind-v1';
