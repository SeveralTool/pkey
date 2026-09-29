/**
 * @fileoverview Origin-scoped "decide later" pause for a PWA/phone vault fork.
 *
 * Distinct from `serverIdentity.salt`: that pin can be overwritten if a mixed
 * snapshot is saved under the phone salt. This record survives reload until
 * the user picks a session (`use_phone` / `use_pwa`) or the phone returns to
 * the browser generation.
 */
import { parseVaultForkDeferRecord, type VaultForkDeferRecord } from '@pkey/core';

const KEY = '@pkey/vault-fork-defer';

/** Loads a previously deferred fork, or null when absent/corrupt. */
export function loadVaultForkDefer(): VaultForkDeferRecord | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return parseVaultForkDeferRecord(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

/** Persists an unresolved fork pause under the page origin. */
export function saveVaultForkDefer(record: VaultForkDeferRecord): void {
  if (typeof localStorage === 'undefined') return;
  const parsed = parseVaultForkDeferRecord(record);
  if (!parsed) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(parsed));
  } catch {
    /* quota / private mode — in-memory pause still applies for this tab */
  }
}

/** Clears the durable pause after the chooser is resolved. */
export function clearVaultForkDefer(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
