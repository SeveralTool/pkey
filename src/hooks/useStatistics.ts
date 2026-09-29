/**
 * @fileoverview Vault statistics (strength, duplicates, coverage) from `@pkey/core`.
 *
 * Display cards from React state have empty `passwordList` (SecretStore / M1).
 * Hydration happens *inside* the deferred effect so callers can pass `db.cards`
 * by identity. Mapping secrets in render (`cardsWithVaultSecrets(...)` as a
 * hook argument) allocates a new array every time and retriggers zxcvbn.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager } from 'react-native';
import { getZxcvbn } from '../utils/lazyZxcvbn';
import { computeStatistics, type Tombstone, type VaultStatistics } from '@pkey/core';
import type { PasswordCard } from '../types';
import { cardsWithVaultSecrets } from '../services/vaultSecrets';

const EMPTY_STATS: VaultStatistics = computeStatistics([]);

function isWeakWithZxcvbn(password: string, cache: Map<string, boolean>): boolean {
  if (!password) return true;
  if (password.length < 6) return true;
  const hit = cache.get(password);
  if (hit !== undefined) return hit;
  const weak = getZxcvbn()(password).score <= 1;
  cache.set(password, weak);
  return weak;
}

export type UseStatisticsResult = VaultStatistics & {
  /** False until the first deferred compute finishes for this mount. */
  statsReady: boolean;
};

/**
 * Computes aggregate password-card statistics for the given vault snapshot.
 * Weak passwords use zxcvbn (aligned with card analysis UI), with a per-password cache.
 * Heavy work runs after interactions so tab switches stay responsive.
 *
 * @param cards - Display cards from React state (secrets are rehydrated internally)
 * @param tombstones - Optional sync tombstones from the vault DB
 */
export const useStatistics = (
  cards: readonly PasswordCard[] | undefined,
  tombstones?: readonly Tombstone[]
): UseStatisticsResult => {
  const weakCacheRef = useRef(new Map<string, boolean>());
  const tombstonesRef = useRef(tombstones);
  tombstonesRef.current = tombstones;
  const [readyStats, setReadyStats] = useState<VaultStatistics | null>(null);
  const requestIdRef = useRef(0);
  const tombstoneCount = tombstones?.length ?? 0;

  useEffect(() => {
    const requestId = ++requestIdRef.current;

    const task = InteractionManager.runAfterInteractions(() => {
      const hydrated = cardsWithVaultSecrets(cards ?? []);
      const next = computeStatistics(hydrated, {
        tombstones: tombstoneCount ? tombstonesRef.current : undefined,
        isWeakPassword: (pw) => isWeakWithZxcvbn(pw, weakCacheRef.current),
      });
      if (requestId !== requestIdRef.current) return;
      setReadyStats(next);
    });

    return () => {
      task.cancel?.();
    };
  }, [cards, tombstoneCount]);

  const stats = readyStats ?? EMPTY_STATS;
  const statsReady = readyStats !== null;
  return useMemo(() => ({ ...stats, statsReady }), [stats, statsReady]);
};
