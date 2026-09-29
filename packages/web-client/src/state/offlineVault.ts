/**
 * @fileoverview Encrypted offline vault persistence for the PKEY PWA.
 *
 * Stores an AES-CBC + HMAC envelope (same scheme as sync transport, derived
 * from the master password hash) in IndexedDB so the vault survives page
 * reloads while the master device is unreachable. The vault salt is stored in
 * plaintext next to the envelope — it is required to re-derive the password
 * hash at unlock time and is not secret.
 *
 * Failing storage (private browsing, quota, corruption) degrades gracefully:
 * every function resolves instead of throwing, and callers treat `null`/`false`
 * as "offline vault unavailable".
 */
import {
  encryptPayload,
  decryptPayload,
  type PasswordCard,
  type AppSettings,
} from '@pkey/core';
import { normalizeOutbox, type OutboxState } from './outbox';

/** Decrypted offline vault contents. */
export interface OfflineVaultData {
  cards: PasswordCard[];
  settings: AppSettings | null;
  outbox: OutboxState;
}

/** Encrypted envelope produced by {@link encodeOfflineVault}. */
export interface OfflineVaultEnvelope {
  salt: string;
  iv: string;
  ciphertext: string;
  hmac: string;
}

/** Persisted IndexedDB record. */
export interface OfflineVaultRecord {
  version: 1;
  /** Vault auth salt (plaintext, needed to derive the unlock hash). */
  vaultSalt: string | null;
  savedAt: number;
  envelope: OfflineVaultEnvelope;
}

const DB_NAME = 'pkey-web-offline';
const STORE_NAME = 'vault';
const RECORD_KEY = 'vault';
const DB_VERSION = 1;

/**
 * Encrypts vault data into a storable envelope.
 *
 * @param data - Cards (with secrets), settings, and pending outbox.
 * @param passwordHash - Hex master password hash (envelope key material).
 */
export function encodeOfflineVault(
  data: OfflineVaultData,
  passwordHash: string
): OfflineVaultEnvelope {
  return encryptPayload(
    { cards: data.cards, settings: data.settings, outbox: data.outbox },
    passwordHash
  );
}

/**
 * Decrypts and validates an offline vault envelope.
 *
 * @returns Parsed data, or `null` when the password is wrong or the blob is
 * corrupt (HMAC failure, malformed JSON, wrong shape).
 */
export function decodeOfflineVault(
  envelope: OfflineVaultEnvelope,
  passwordHash: string
): OfflineVaultData | null {
  const raw = decryptPayload<{
    cards?: unknown;
    settings?: unknown;
    outbox?: unknown;
  }>(envelope, passwordHash);
  if (!raw || typeof raw !== 'object') return null;
  if (!Array.isArray(raw.cards)) return null;
  const cards = (raw.cards as PasswordCard[]).filter(
    (c): c is PasswordCard => !!c && typeof c === 'object' && typeof c.id === 'string'
  );
  const settings =
    raw.settings && typeof raw.settings === 'object' ? (raw.settings as AppSettings) : null;
  return { cards, settings, outbox: normalizeOutbox(raw.outbox) };
}

function idb(): IDBFactory | null {
  try {
    return typeof indexedDB !== 'undefined' ? indexedDB : null;
  } catch {
    return null;
  }
}

function openDb(): Promise<IDBDatabase | null> {
  const factory = idb();
  if (!factory) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = factory.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Persists an encrypted vault snapshot.
 *
 * @returns `true` when the write was committed.
 */
export async function saveOfflineVault(
  data: OfflineVaultData,
  passwordHash: string,
  vaultSalt: string | null
): Promise<boolean> {
  const db = await openDb();
  if (!db) return false;
  let envelope: OfflineVaultEnvelope;
  try {
    envelope = encodeOfflineVault(data, passwordHash);
  } catch {
    db.close();
    return false;
  }
  const record: OfflineVaultRecord = {
    version: 1,
    vaultSalt: vaultSalt ?? null,
    savedAt: Date.now(),
    envelope,
  };
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
      tx.onabort = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

/** Loads the persisted record, or `null` when absent/unavailable/corrupt. */
export async function loadOfflineVault(): Promise<OfflineVaultRecord | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      req.onsuccess = () => {
        db.close();
        const rec = req.result as OfflineVaultRecord | undefined;
        if (
          rec &&
          rec.version === 1 &&
          rec.envelope &&
          typeof rec.envelope.ciphertext === 'string' &&
          typeof rec.envelope.hmac === 'string'
        ) {
          resolve(rec);
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

/** Removes any persisted offline vault (explicit logout / purge). */
export async function clearOfflineVault(): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
      tx.onabort = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
