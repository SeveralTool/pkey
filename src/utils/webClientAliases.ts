/**
 * @fileoverview Persist local display aliases for LAN web clients (by sourceId).
 */
import {
  isPersistableSourceId,
  sanitizeWebClientAlias,
  WEB_CLIENT_SOURCE_ID_KEY_MAX,
} from '@pkey/core';

/** AsyncStorage key for `{ [sourceId]: alias }`. */
export const SK_WEB_CLIENT_ALIASES = '@pkey/sync_web_aliases';

/**
 * Parse persisted alias map; drops invalid keys and empty labels.
 *
 * @param raw - JSON from AsyncStorage.
 * @returns Sanitized alias map.
 */
export function parseWebClientAliases(raw: string | null): Record<string, string> {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (key.length > WEB_CLIENT_SOURCE_ID_KEY_MAX) continue;
      if (!isPersistableSourceId(key)) continue;
      const alias = sanitizeWebClientAlias(value);
      if (alias) out[key] = alias;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Apply an alias update immutably.
 *
 * @param prev - Current map.
 * @param sourceId - Client source id.
 * @param aliasRaw - New alias (empty clears).
 * @returns Next map, or `prev` when the id cannot be persisted.
 */
export function applyWebClientAlias(
  prev: Record<string, string>,
  sourceId: string,
  aliasRaw: unknown
): Record<string, string> {
  if (!isPersistableSourceId(sourceId)) return prev;
  const alias = sanitizeWebClientAlias(aliasRaw);
  if (!alias) {
    if (!(sourceId in prev)) return prev;
    const next = { ...prev };
    delete next[sourceId];
    return next;
  }
  if (prev[sourceId] === alias) return prev;
  return { ...prev, [sourceId]: alias };
}
