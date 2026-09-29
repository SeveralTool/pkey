/**
 * @fileoverview Optional 128-bit device secret + Crockford recovery kit (audit H4).
 */
import vaultKeys, { isPkeyVaultKeysAvailable } from 'pkey-vault-keys';
import { encodeCrockfordBase32, decodeCrockfordBase32, formatPairingCode } from './migrationChannelCrypto';
import { getSecureRandomHex } from '../utils/secureRandom';
import { hkdfExpand, HKDF_INFO_DEVICE_BIND } from '@pkey/core';

const SECRET_BYTES = 16;

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function formatRecoveryKit(secretHex: string): string {
  return formatPairingCode(encodeCrockfordBase32(hexToBytes(secretHex)));
}

export function parseRecoveryKit(code: string): string | null {
  const bytes = decodeCrockfordBase32(code);
  if (!bytes || bytes.length !== SECRET_BYTES) return null;
  return bytesToHex(bytes);
}

/** User dismissed the OS biometric dialog while enabling the device secret. */
export class DeviceSecretCanceledError extends Error {
  readonly code = 'E_USER_CANCELED' as const;

  constructor() {
    super('canceled');
    this.name = 'DeviceSecretCanceledError';
  }
}

const CANCELED_AUTH_CODES = new Set([
  'E_USER_CANCELED',
  'ERR_CANCELED',
  'user_cancel',
  'system_cancel',
  'app_cancel',
]);

/**
 * True when a native biometric / Keystore prompt was dismissed rather than failed.
 * Cancel is a valid user action and must not surface as an app error.
 */
export function isUserCanceledAuth(err: unknown): boolean {
  if (err instanceof DeviceSecretCanceledError) return true;
  if (typeof err === 'string') return /cancel/i.test(err);
  if (!err || typeof err !== 'object') return false;
  const rec = err as { code?: unknown; message?: unknown; name?: unknown };
  if (rec.name === 'DeviceSecretCanceledError') return true;
  if (typeof rec.code === 'string' && CANCELED_AUTH_CODES.has(rec.code)) return true;
  const message = typeof rec.message === 'string' ? rec.message : '';
  return /cancel/i.test(message);
}

export async function enableDeviceSecret(prompt: string): Promise<string | null> {
  if (!isPkeyVaultKeysAvailable() || !vaultKeys) return null;
  const hex = getSecureRandomHex(SECRET_BYTES);
  try {
    await vaultKeys.storeDeviceSecret(hex, prompt);
  } catch (err) {
    if (isUserCanceledAuth(err)) throw new DeviceSecretCanceledError();
    console.warn('[deviceSecret] store failed', err);
    return null;
  }
  return formatRecoveryKit(hex);
}

export function mixRootWithSecret(argon2RootHex: string, secretHex: string): string {
  return hkdfExpand(argon2RootHex, `${HKDF_INFO_DEVICE_BIND}|${secretHex}`);
}

export async function disableDeviceSecret(): Promise<void> {
  if (!isPkeyVaultKeysAvailable() || !vaultKeys) return;
  await vaultKeys.clearDeviceSecret();
}

export async function deviceSecretIsEnabled(): Promise<boolean> {
  if (!isPkeyVaultKeysAvailable() || !vaultKeys) return false;
  return vaultKeys.hasDeviceSecret();
}

export async function mixDeviceSecret(
  argon2RootHex: string,
  prompt: string
): Promise<string | null> {
  if (!isPkeyVaultKeysAvailable() || !vaultKeys) return null;
  if (!(await vaultKeys.hasDeviceSecret())) return null;
  const secret = await vaultKeys.loadDeviceSecret(prompt);
  if (!secret) return null;
  return mixRootWithSecret(argon2RootHex, secret);
}
