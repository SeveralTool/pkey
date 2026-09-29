/**
 * @fileoverview Public vault-session id helpers (not a credential).
 *
 * Each vault generation stores a UUID v4 in `EncryptedDatabase.sessionId`.
 * The phone and the PWA show the same string so the user can confirm they are
 * looking at the same vault. It is not derived from the master password.
 */

/** Canonical `8-4-4-4-12` lowercase UUID (32 hex digits). */
export function canonicalizePublicSessionId(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const hex = raw.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
  if (hex.length < 32) return '';
  const h = hex.slice(0, 32);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

/** Display form of a vault session id (full UUID). */
export function formatVaultSessionRef(sessionId: string): string {
  return canonicalizePublicSessionId(sessionId);
}

/**
 * Accepts a UUID or 32 hex digits from unauthenticated `/pkey/meta`.
 * Returns canonical lowercase UUID or `''`.
 */
export function sanitizePublicSessionId(raw: unknown): string {
  return canonicalizePublicSessionId(raw);
}

/** Normalizes a vault `creation_date` to ISO-8601, or `''` when invalid. */
export function sanitizeSessionCreatedAt(raw: unknown): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  const ms = Date.parse(raw);
  if (Number.isNaN(ms)) return '';
  return new Date(ms).toISOString();
}
