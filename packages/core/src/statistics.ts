/**
 * @fileoverview Vault security statistics computed from card lists.
 */

import type { PasswordCard, Tombstone } from './types/index';
import { normalizeTags } from './util/normalizeTags';
import { sha256 as hash256 } from './crypto/index';

/** Card reference used for oldest/newest updated metrics. */
export interface StatsCardRef {
  id: string;
  title: string;
  last_update: string;
}

/** Aggregated vault health metrics for the stats UI. */
export interface VaultStatistics {
  totalCards: number;
  /** Count of password cards that share a password with at least one other. */
  duplicatedCount: number;
  /** Password cards scored as weak (via heuristic or custom `isWeakPassword`). */
  weakCount: number;
  /** Cards not updated in over 90 days. */
  staleCount: number;
  /** Distinct non-empty usernames (case-insensitive). */
  uniqueUsers: number;
  passwordCount: number;
  secretPhraseCount: number;
  /** NOTE-type cards. */
  noteCount: number;
  /** PASSWORD cards whose username is shared with another PASSWORD card. */
  reusedUsernameCount: number;
  /** PASSWORD cards with a non-empty OTP secret. */
  withOtpCount: number;
  /** PASSWORD cards without OTP. */
  withoutOtpCount: number;
  /** 0–100 OTP coverage among PASSWORD cards (100 when none). */
  otpCoveragePercent: number;
  /** PASSWORD cards with a stored HIBP result for their current password. */
  hibpCheckedCount: number;
  /** PASSWORD cards whose stored HIBP result is breached for their current password. */
  hibpBreachedCount: number;
  emptyUsernameCount: number;
  emptyPasswordCount: number;
  emptyLinkCount: number;
  uniqueTagCount: number;
  untaggedCount: number;
  oldestUpdated: StatsCardRef | null;
  newestUpdated: StatsCardRef | null;
  /** Count of sync tombstones (deleted cards pending prune). */
  tombstoneCount: number;
  /**
   * Composite vault health 0–100 (higher is better).
   * Penalizes duplicates, weak, stale, missing OTP, and empty passwords.
   */
  healthScore: number;
  /** Card ids that share a password with another PASSWORD card. */
  duplicatedCardIds: string[];
  /** Card ids considered weak by the active strength check. */
  weakCardIds: string[];
  /** Card ids not updated in over 90 days. */
  staleCardIds: string[];
  /** PASSWORD card ids without OTP. */
  withoutOtpCardIds: string[];
  /** PASSWORD card ids with a stored HIBP result for their current password. */
  hibpCheckedCardIds: string[];
  /** PASSWORD card ids whose stored HIBP result is breached for their current password. */
  hibpBreachedCardIds: string[];
  /** PASSWORD card ids that reuse a username. */
  reusedUsernameCardIds: string[];
  emptyUsernameCardIds: string[];
  emptyPasswordCardIds: string[];
  emptyLinkCardIds: string[];
  untaggedCardIds: string[];
}

const STALE_MS = 90 * 24 * 60 * 60 * 1000;

export interface ComputeStatisticsOptions {
  /** Override weak detection (e.g. zxcvbn). Default: simple heuristic score ≤ 1. */
  isWeakPassword?: (password: string) => boolean;
  /** Sync tombstones from the vault DB. */
  tombstones?: readonly Tombstone[];
  /** Clock override for tests. */
  now?: number;
}

/** Simple length/charset strength score (0–5), kept for web / offline purity. */
export function passwordStrengthScore(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^a-zA-Z0-9]/.test(pw)) score++;
  return score;
}

function defaultIsWeak(password: string): boolean {
  return passwordStrengthScore(password) <= 1;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computeHealthScore(input: {
  passwordCount: number;
  totalCards: number;
  duplicatedCount: number;
  weakCount: number;
  staleCount: number;
  withoutOtpCount: number;
  emptyPasswordCount: number;
}): number {
  const {
    passwordCount,
    totalCards,
    duplicatedCount,
    weakCount,
    staleCount,
    withoutOtpCount,
    emptyPasswordCount,
  } = input;
  if (totalCards === 0) return 100;

  let score = 100;
  const pwDenom = Math.max(passwordCount, 1);
  const cardDenom = Math.max(totalCards, 1);

  score -= clamp((duplicatedCount / pwDenom) * 35, 0, 30);
  score -= clamp((weakCount / pwDenom) * 40, 0, 30);
  score -= clamp((staleCount / cardDenom) * 25, 0, 20);
  if (passwordCount > 0) {
    score -= clamp((withoutOtpCount / pwDenom) * 20, 0, 15);
    score -= clamp((emptyPasswordCount / pwDenom) * 25, 0, 10);
  }
  return Math.round(clamp(score, 0, 100));
}

/**
 * Computes vault security statistics from card list.
 *
 * @param cards - Full vault cards (password fields used for strength/dupe checks).
 * @param options - Optional weak predicate, tombstones, and clock.
 * @returns Aggregated {@link VaultStatistics}.
 */
export function computeStatistics(
  cards: readonly PasswordCard[],
  options: ComputeStatisticsOptions = {}
): VaultStatistics {
  const isWeak = options.isWeakPassword ?? defaultIsWeak;
  const now = options.now ?? Date.now();
  const tombstoneCount = options.tombstones?.length ?? 0;

  const passwordCards = cards.filter((c) => c.type === 'PASSWORD');
  const secretPhraseCount = cards.filter((c) => c.type === 'SECRET_PHRASE').length;
  const noteCount = cards.filter((c) => c.type === 'NOTE').length;
  const passwordCount = passwordCards.length;

  const passwordCounts = new Map<string, number>();
  for (const c of passwordCards) {
    const p = c.passwordList[0] ?? '';
    if (!p) continue;
    passwordCounts.set(p, (passwordCounts.get(p) ?? 0) + 1);
  }

  const duplicatedCardIds: string[] = [];
  for (const c of passwordCards) {
    const p = c.passwordList[0] ?? '';
    if (p && (passwordCounts.get(p) ?? 0) > 1) duplicatedCardIds.push(c.id);
  }
  const duplicatedCount = duplicatedCardIds.length;

  const weakCardIds: string[] = [];
  for (const c of passwordCards) {
    if (isWeak(c.passwordList[0] ?? '')) weakCardIds.push(c.id);
  }
  const weakCount = weakCardIds.length;

  const staleCardIds: string[] = [];
  for (const c of cards) {
    const t = Date.parse(c.last_update);
    if (!Number.isNaN(t) && now - t > STALE_MS) staleCardIds.push(c.id);
  }
  const staleCount = staleCardIds.length;

  const uniqueUsers = new Set(cards.map((c) => c.username.trim().toLowerCase()).filter(Boolean))
    .size;

  const usernameCounts = new Map<string, number>();
  for (const c of passwordCards) {
    const u = c.username.trim().toLowerCase();
    if (!u) continue;
    usernameCounts.set(u, (usernameCounts.get(u) ?? 0) + 1);
  }
  const reusedUsernameCardIds: string[] = [];
  for (const c of passwordCards) {
    const u = c.username.trim().toLowerCase();
    if (u && (usernameCounts.get(u) ?? 0) > 1) reusedUsernameCardIds.push(c.id);
  }
  const reusedUsernameCount = reusedUsernameCardIds.length;

  const withOtpCardIds: string[] = [];
  const withoutOtpCardIds: string[] = [];
  for (const c of passwordCards) {
    if (c.otpSecret?.trim()) withOtpCardIds.push(c.id);
    else withoutOtpCardIds.push(c.id);
  }
  const withOtpCount = withOtpCardIds.length;
  const withoutOtpCount = withoutOtpCardIds.length;
  const otpCoveragePercent =
    passwordCount === 0 ? 100 : Math.round((withOtpCount / passwordCount) * 100);

  const hibpCheckedCardIds: string[] = [];
  const hibpBreachedCardIds: string[] = [];
  for (const c of passwordCards) {
    const p = c.passwordList[0] ?? '';
    if (!p.trim()) continue;
    const h = c.hibp;
    // A result only counts while it refers to the exact current password (same
    // SHA-256), mirroring how the badge decides whether the result is shown.
    if (!h || h.pwHash !== hash256(p)) continue;
    hibpCheckedCardIds.push(c.id);
    if (h.status === 'breached') hibpBreachedCardIds.push(c.id);
  }
  const hibpCheckedCount = hibpCheckedCardIds.length;
  const hibpBreachedCount = hibpBreachedCardIds.length;

  const emptyUsernameCardIds: string[] = [];
  const emptyPasswordCardIds: string[] = [];
  const emptyLinkCardIds: string[] = [];
  const untaggedCardIds: string[] = [];
  const allTags = new Set<string>();

  for (const c of cards) {
    if (!c.username.trim()) emptyUsernameCardIds.push(c.id);
    if (c.type === 'PASSWORD' && !(c.passwordList[0] ?? '').trim()) {
      emptyPasswordCardIds.push(c.id);
    }
    if (!c.link.trim()) emptyLinkCardIds.push(c.id);
    const tags = normalizeTags(c.tags);
    if (tags.length === 0) untaggedCardIds.push(c.id);
    for (const tag of tags) allTags.add(tag);
  }

  let oldestUpdated: StatsCardRef | null = null;
  let newestUpdated: StatsCardRef | null = null;
  for (const c of cards) {
    const t = Date.parse(c.last_update);
    if (Number.isNaN(t)) continue;
    const ref: StatsCardRef = { id: c.id, title: c.title || c.id, last_update: c.last_update };
    if (!oldestUpdated || t < Date.parse(oldestUpdated.last_update)) oldestUpdated = ref;
    if (!newestUpdated || t > Date.parse(newestUpdated.last_update)) newestUpdated = ref;
  }

  const emptyUsernameCount = emptyUsernameCardIds.length;
  const emptyPasswordCount = emptyPasswordCardIds.length;
  const emptyLinkCount = emptyLinkCardIds.length;
  const untaggedCount = untaggedCardIds.length;

  const healthScore = computeHealthScore({
    passwordCount,
    totalCards: cards.length,
    duplicatedCount,
    weakCount,
    staleCount,
    withoutOtpCount,
    emptyPasswordCount,
  });

  return {
    totalCards: cards.length,
    duplicatedCount,
    weakCount,
    staleCount,
    uniqueUsers,
    passwordCount,
    secretPhraseCount,
    noteCount,
    reusedUsernameCount,
    withOtpCount,
    withoutOtpCount,
    otpCoveragePercent,
    hibpCheckedCount,
    hibpBreachedCount,
    emptyUsernameCount,
    emptyPasswordCount,
    emptyLinkCount,
    uniqueTagCount: allTags.size,
    untaggedCount,
    oldestUpdated,
    newestUpdated,
    tombstoneCount,
    healthScore,
    duplicatedCardIds,
    weakCardIds,
    staleCardIds,
    withoutOtpCardIds,
    reusedUsernameCardIds,
    hibpCheckedCardIds,
    hibpBreachedCardIds,
    emptyUsernameCardIds,
    emptyPasswordCardIds,
    emptyLinkCardIds,
    untaggedCardIds,
  };
}
