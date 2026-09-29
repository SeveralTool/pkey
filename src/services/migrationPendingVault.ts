/**
 * @fileoverview Staged migration vault — received payload stays off the live DB
 * until wipe ACK succeeds. Prevents unlocking migrated data without finalize.
 *
 * Public metadata lives in AsyncStorage. The out-of-band `pairingSecret` is
 * stored in SecureStore so a filesystem/AsyncStorage dump cannot finish pairing.
 */
import * as FileSystem from 'expo-file-system/legacy';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DATABASE_FILENAME } from '../constants/config';

export const PENDING_MIGRATION_FILENAME = 'pkey_migration_pending.json';
export const PENDING_PAIRING_SECRET_KEY = 'pkey_migration_pairing_secret_v1';

const PENDING_META_KEY = '@pkey/migration_pending_meta_v1';

const STORE_OPTIONS: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

/** Wipe-callback contact info for a staged inbound migration. */
export interface MigrationFinalizeTarget {
  readonly senderIp: string;
  readonly senderIpAlternates: readonly string[];
  readonly senderCallbackPort: number;
  readonly migrationId: string;
  readonly pairingSecret: string;
  readonly sessionId: string;
  readonly senderWipeProof: string;
}

/** Non-secret staging metadata plus reconstituted finalize target. */
export interface PendingMigrationMeta {
  readonly cardCount: number;
  readonly createdAt: number;
  readonly target: MigrationFinalizeTarget | null;
}

interface PublicFinalizeTarget {
  readonly senderIp: string;
  readonly senderIpAlternates: readonly string[];
  readonly senderCallbackPort: number;
  readonly migrationId: string;
  readonly sessionId: string;
  readonly senderWipeProof: string;
}

interface PublicPendingMeta {
  readonly cardCount: number;
  readonly createdAt: number;
  readonly target: PublicFinalizeTarget | null;
}

function pendingUri(): string {
  return `${FileSystem.documentDirectory}${PENDING_MIGRATION_FILENAME}`;
}

function liveUri(): string {
  return `${FileSystem.documentDirectory}${DATABASE_FILENAME}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function parsePublicTarget(value: unknown): {
  publicTarget: PublicFinalizeTarget;
  legacyPairingSecret: string | null;
} | null {
  if (!isRecord(value)) return null;
  const senderIp = value.senderIp;
  const senderCallbackPort = value.senderCallbackPort;
  const migrationId = value.migrationId;
  const sessionId = value.sessionId;
  const senderWipeProof = value.senderWipeProof;
  if (
    typeof senderIp !== 'string' ||
    typeof senderCallbackPort !== 'number' ||
    typeof migrationId !== 'string' ||
    typeof sessionId !== 'string' ||
    typeof senderWipeProof !== 'string'
  ) {
    return null;
  }
  const legacy =
    typeof value.pairingSecret === 'string' && value.pairingSecret.length > 0
      ? value.pairingSecret
      : null;
  return {
    publicTarget: {
      senderIp,
      senderIpAlternates: asStringArray(value.senderIpAlternates),
      senderCallbackPort,
      migrationId,
      sessionId,
      senderWipeProof,
    },
    legacyPairingSecret: legacy,
  };
}

function parsePublicMeta(raw: string): {
  meta: PublicPendingMeta;
  legacyPairingSecret: string | null;
} | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const cardCount = parsed.cardCount;
    const createdAt = parsed.createdAt;
    if (typeof cardCount !== 'number' || typeof createdAt !== 'number') return null;
    if (parsed.target == null) {
      return { meta: { cardCount, createdAt, target: null }, legacyPairingSecret: null };
    }
    const target = parsePublicTarget(parsed.target);
    if (!target) return null;
    return {
      meta: { cardCount, createdAt, target: target.publicTarget },
      legacyPairingSecret: target.legacyPairingSecret,
    };
  } catch {
    return null;
  }
}

function toPublicTarget(target: MigrationFinalizeTarget): PublicFinalizeTarget {
  return {
    senderIp: target.senderIp,
    senderIpAlternates: [...target.senderIpAlternates],
    senderCallbackPort: target.senderCallbackPort,
    migrationId: target.migrationId,
    sessionId: target.sessionId,
    senderWipeProof: target.senderWipeProof,
  };
}

async function readPairingSecret(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(PENDING_PAIRING_SECRET_KEY, STORE_OPTIONS);
  } catch (e) {
    console.warn('[migrationPendingVault] pairing secret read failed', e);
    return null;
  }
}

async function writePairingSecret(secret: string | null): Promise<void> {
  try {
    if (!secret) {
      await SecureStore.deleteItemAsync(PENDING_PAIRING_SECRET_KEY);
      return;
    }
    await SecureStore.setItemAsync(PENDING_PAIRING_SECRET_KEY, secret, STORE_OPTIONS);
  } catch (e) {
    console.warn('[migrationPendingVault] pairing secret write failed', e);
  }
}

async function persistPublicMeta(meta: PublicPendingMeta): Promise<void> {
  await AsyncStorage.setItem(PENDING_META_KEY, JSON.stringify(meta));
}

async function persistStagedMeta(
  cardCount: number,
  createdAt: number,
  target: MigrationFinalizeTarget | null
): Promise<void> {
  await writePairingSecret(target?.pairingSecret ?? null);
  await persistPublicMeta({
    cardCount,
    createdAt,
    target: target ? toPublicTarget(target) : null,
  });
}

/** True when a staged (not yet committed) migration vault exists. */
export async function hasPendingMigration(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(pendingUri());
    return !!info.exists;
  } catch {
    return false;
  }
}

/**
 * Reads staging metadata. Rehydrates `pairingSecret` from SecureStore.
 * One-shot: if a legacy blob still embeds the secret in AsyncStorage, it is
 * moved to SecureStore and stripped from the public meta.
 */
export async function readPendingMigrationMeta(): Promise<PendingMigrationMeta | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_META_KEY);
    if (!raw) return null;
    const parsed = parsePublicMeta(raw);
    if (!parsed) return null;

    let secret = await readPairingSecret();
    if (parsed.legacyPairingSecret) {
      if (!secret) {
        await writePairingSecret(parsed.legacyPairingSecret);
        secret = parsed.legacyPairingSecret;
      }
      await persistPublicMeta(parsed.meta);
    }

    return {
      cardCount: parsed.meta.cardCount,
      createdAt: parsed.meta.createdAt,
      target: parsed.meta.target ? { ...parsed.meta.target, pairingSecret: secret ?? '' } : null,
    };
  } catch {
    return null;
  }
}

/**
 * Stages the encrypted vault without touching the live database file.
 * Previous vault (if any) remains unlockable until commit.
 */
export async function stagePendingMigration(
  encryptedPayload: string,
  cardCount: number,
  target: MigrationFinalizeTarget | null
): Promise<void> {
  await FileSystem.writeAsStringAsync(pendingUri(), encryptedPayload, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await persistStagedMeta(cardCount, Date.now(), target);
}

/** Updates wipe contact info (e.g. after restoring from disk). */
export async function updatePendingFinalizeTarget(
  target: MigrationFinalizeTarget | null
): Promise<void> {
  const meta = (await readPendingMigrationMeta()) || {
    cardCount: 0,
    createdAt: Date.now(),
    target: null,
  };
  await persistStagedMeta(meta.cardCount, meta.createdAt, target);
}

/**
 * Promotes staged vault to the live database. Irreversible for the previous file.
 */
export async function commitPendingMigration(): Promise<void> {
  const pending = pendingUri();
  const info = await FileSystem.getInfoAsync(pending);
  if (!info.exists) {
    throw new Error('PENDING_MIGRATION_MISSING');
  }
  const payload = await FileSystem.readAsStringAsync(pending, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await FileSystem.writeAsStringAsync(liveUri(), payload, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  await discardPendingMigration();
}

/** Drops staged vault; live database (previous state) is unchanged. */
export async function discardPendingMigration(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(pendingUri());
    if (info.exists) {
      await FileSystem.deleteAsync(pendingUri(), { idempotent: true });
    }
  } catch {
    /* ignore */
  }
  await AsyncStorage.removeItem(PENDING_META_KEY);
  await writePairingSecret(null);
}
