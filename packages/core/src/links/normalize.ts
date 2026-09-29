/**
 * @fileoverview Normalize a user-typed link field into a safe stored value.
 */

import { parseLinkIdentity } from './parse';
import { pickCanonicalLink } from './canonical';
import { classifyScheme } from './schemes';

/**
 * Normalizes a single form-field value: https for hosts, android-app:// for packages.
 * Returns null when empty or blocked.
 */
export function normalizeStoredLink(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (classifyScheme(trimmed) === 'blocked') return null;
  const id = parseLinkIdentity(trimmed);
  if (!id || id.kind === 'blocked' || id.kind === 'ignored') return null;
  return pickCanonicalLink([id]) || trimmed;
}
