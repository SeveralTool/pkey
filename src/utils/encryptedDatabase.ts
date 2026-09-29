/**
 * @fileoverview Structural parse of decrypted vault JSON (no `JSON.parse as T`).
 */
import type { AppSettings, EncryptedDatabase, PasswordCard } from '../types';
import { isRecord } from './jsonUnknown';

function parseCards(value: unknown): PasswordCard[] | null {
  if (!Array.isArray(value)) return null;
  const cards: PasswordCard[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.id !== 'string') return null;
    cards.push(item as PasswordCard);
  }
  return cards;
}

/**
 * Validates decrypted vault JSON. Returns `null` when the payload is not a vault.
 *
 * `version` accepts both historic `'1.0.0'` strings and numeric `1` used by core/PWA.
 */
export function parseEncryptedDatabase(input: unknown): EncryptedDatabase | null {
  if (!isRecord(input)) return null;
  const version = input.version;
  if (typeof version !== 'string' && typeof version !== 'number') return null;
  if (typeof input.passwordHash !== 'string') return null;
  if (typeof input.creation_date !== 'string' || typeof input.last_update !== 'string') return null;
  if (!isRecord(input.settings)) return null;
  const cards = parseCards(input.cards);
  if (!cards) return null;

  const salt = typeof input.salt === 'string' ? input.salt : undefined;
  const sessionId = typeof input.sessionId === 'string' ? input.sessionId : undefined;
  const syncProtocolVersion =
    typeof input.syncProtocolVersion === 'number' ? input.syncProtocolVersion : undefined;
  const passwordHashScheme =
    input.passwordHashScheme === 'v4-argon2' ||
    input.passwordHashScheme === 'v3-hkdf' ||
    input.passwordHashScheme === 'v2-pbkdf2'
      ? input.passwordHashScheme
      : undefined;
  const tombstones = Array.isArray(input.tombstones) ? input.tombstones : undefined;

  return {
    version,
    passwordHash: input.passwordHash,
    passwordHashScheme,
    salt,
    cards,
    settings: input.settings as AppSettings,
    creation_date: input.creation_date,
    last_update: input.last_update,
    tombstones,
    sessionId,
    syncProtocolVersion,
  };
}

/**
 * Parses a decrypted vault string. Invalid JSON or a non-vault object yields `null`.
 */
export function parseEncryptedDatabaseJson(text: string): EncryptedDatabase | null {
  try {
    return parseEncryptedDatabase(JSON.parse(text) as unknown);
  } catch {
    return null;
  }
}
