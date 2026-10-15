/**
 * @fileoverview Optional 128-bit device secret + Crockford recovery kit (audit H4).
 */
import vaultKeys, { isPkeyVaultKeysAvailable } from 'pkey-vault-keys';
import {
  encodeCrockfordBase32,
  decodeCrockfordBase32,
  formatPairingCode,
} from './migrationChannelCrypto';
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

/** Why the local device secret could not be used to open a `deviceBound` vault. */
export type DeviceSecretRequiredReason = 'missing' | 'unavailable';

/**
 * The vault is `deviceBound` but this phone cannot supply the secret: it was
 * never enabled here (file copied from another device, fresh install after a
 * migration) or the hardware item is unreadable (biometric enrollment changed
 * on an older build). The caller must ask for the recovery kit and retry with
 * `deviceSecretHex`. Not a wrong-password signal: do not count it as a failure.
 */
export class DeviceSecretRequiredError extends Error {
  readonly code = 'E_DEVICE_SECRET_REQUIRED' as const;
  readonly reason: DeviceSecretRequiredReason;

  constructor(reason: DeviceSecretRequiredReason) {
    super(`device secret ${reason}`);
    this.name = 'DeviceSecretRequiredError';
    this.reason = reason;
  }
}

export function isDeviceSecretRequiredError(err: unknown): err is DeviceSecretRequiredError {
  if (err instanceof DeviceSecretRequiredError) return true;
  if (!err || typeof err !== 'object') return false;
  const rec = err as { code?: unknown; name?: unknown };
  return rec.code === 'E_DEVICE_SECRET_REQUIRED' || rec.name === 'DeviceSecretRequiredError';
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

/**
 * Mixes the Argon2 root for a `deviceBound` envelope.
 *
 * - With `deviceSecretHex` (typed recovery kit) the local hardware is not consulted.
 * - Otherwise reads the local secret; `null` → {@link DeviceSecretRequiredError}
 *   (`missing`), a non-cancel read failure → `unavailable`. A cancelled biometric
 *   prompt rethrows unchanged so the caller treats it like a dismissed unlock.
 */
export async function mixDeviceSecretOrRequire(
  argon2RootHex: string,
  prompt: string,
  deviceSecretHex?: string
): Promise<string> {
  if (deviceSecretHex) return mixRootWithSecret(argon2RootHex, deviceSecretHex);
  let mixed: string | null;
  try {
    mixed = await mixDeviceSecret(argon2RootHex, prompt);
  } catch (err) {
    if (isUserCanceledAuth(err)) throw err;
    console.warn('[deviceSecret] local secret unreadable', err);
    throw new DeviceSecretRequiredError('unavailable');
  }
  if (!mixed) throw new DeviceSecretRequiredError('missing');
  return mixed;
}

/**
 * Seals a recovery-kit secret back into local hardware after it opened the
 * vault, so the next unlock no longer needs the kit. Android shows one
 * biometric prompt; iOS is silent. Returns `false` when the module is missing,
 * the user cancelled, or the store failed (the vault stays open either way).
 */
export async function restoreDeviceSecret(secretHex: string, prompt: string): Promise<boolean> {
  if (!isPkeyVaultKeysAvailable() || !vaultKeys) return false;
  try {
    await vaultKeys.storeDeviceSecret(secretHex, prompt);
    return true;
  } catch (err) {
    if (!isUserCanceledAuth(err)) console.warn('[deviceSecret] restore failed', err);
    return false;
  }
}
