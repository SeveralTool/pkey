/**
 * @fileoverview Header alias tables and helpers for inferring column mappings.
 */

import type { ColumnMapping, PkeyField } from '../types';

/**
 * Known header aliases per PKEY field (lowercase, punctuation-insensitive matching).
 * Keys are {@link PkeyField} names excluding `skip`.
 */
export const FIELD_ALIASES: Record<string, string[]> = {
  title: ['title', 'name', 'site', 'service', 'label'],
  username: ['username', 'user', 'email', 'login', 'account', 'id'],
  passwordList: ['password', 'pass', 'secret', 'key', 'pwd', 'passwordlist'],
  link: ['url', 'link', 'uri', 'website', 'host', 'domain', 'hostname'],
  notes: ['notes', 'note', 'comment', 'description', 'remarks', 'extra'],
  otpSecret: ['otp', 'totp', 'otpauth', 'twofactor', '2fa', 'otpsecret'],
  tags: ['tags', 'tag', 'labels', 'category', 'folder', 'group', 'grouping'],
};

/**
 * Maps a single source header to a {@link PkeyField} using {@link FIELD_ALIASES}.
 *
 * @param header - Raw column header from the import file.
 * @returns Matching field, or `'skip'` when unrecognized.
 */
export function mapFieldToPkey(header: string): PkeyField {
  const normalized = header
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  for (const [field, aliases] of Object.entries(FIELD_ALIASES)) {
    if (aliases.some((alias) => alias.replace(/[^a-z0-9]/g, '') === normalized)) {
      return field as PkeyField;
    }
  }
  return 'skip';
}

/**
 * Infers a full column mapping from a list of headers.
 *
 * @param headers - Source header row.
 * @returns One {@link ColumnMapping} per header.
 */
export function inferMappingFromHeaders(headers: string[]): ColumnMapping[] {
  return headers.map((h) => ({
    sourceHeader: h,
    targetField: mapFieldToPkey(h),
  }));
}
