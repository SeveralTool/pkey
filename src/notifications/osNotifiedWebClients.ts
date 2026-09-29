/**
 * @fileoverview Module-level set of web clients already alerted (survives provider remount).
 */

const notifiedAuthClientIds = new Set<string>();

/**
 * Records a client id. Returns true when this id has not been notified yet.
 */
export const rememberNotifiedWebClient = (id: string): boolean => {
  if (!id || notifiedAuthClientIds.has(id)) return false;
  notifiedAuthClientIds.add(id);
  return true;
};

/** Seeds the set from currently authenticated clients without firing new alerts. */
export const seedNotifiedWebClients = (ids: Iterable<string>): void => {
  notifiedAuthClientIds.clear();
  for (const id of ids) {
    if (id) notifiedAuthClientIds.add(id);
  }
};

/** Clears remembered ids (web access stopped). */
export const clearNotifiedWebClients = (): void => {
  notifiedAuthClientIds.clear();
};
