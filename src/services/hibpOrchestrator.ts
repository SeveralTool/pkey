/**
 * @fileoverview Serialized, opt-in HIBP check orchestration for vault cards.
 *
 * Wires `checkPasswordAgainstHibp` (k-anonymity range API) to card saves,
 * the per-card action, and the bulk "check all" action, WITHOUT storing or
 * transmitting the password: only its SHA-1 5-char prefix leaves the device.
 *
 * KEY RULES (see `PasswordCard.hibpAuthorized` doc in @pkey/core):
 * - A card password is auto-checked on save ONLY when it was authored while
 *   `settings.enableHibpCheck` was on AND there is no current result for the
 *   exact password (`pwHash` match). Re-saving an unchanged password never
 *   re-emits.
 * - Passwords saved while the setting was off are NEVER sent automatically,
 *   even after the user enables it. They are only sent via the explicit
 *   per-card action or the bulk "check all" action.
 * - All requests are serialized (one at a time) to be polite to the HIBP API.
 *
 * Results are applied by the caller-provided `onResult`; for the vault this
 * is DatabaseContext, which discards results whose card password changed
 * mid-flight via `isStillCurrent`.
 */

import { sha256 } from '@pkey/core';
import { checkPasswordAgainstHibp, type HibpResult } from './hibpCheck';
import type { EncryptedDatabase, HibpCheckResult, PasswordCard } from '../types';

/** Inter-request delay so the HIBP range API is not hammered. */
export const HIBP_REQUEST_INTERVAL_MS = 1_000;

/**
 * Minimum age before the same password hash may be queried against HIBP
 * again. A "fresh" non-error result (clean/breached) stored within this
 * window suppresses re-checks for that exact password across every card
 * that holds it — per-card manual action, bulk "check all", and save-time
 * auto-check. Error results never count: a failed lookup can be retried.
 */
export const HIBP_RECHECK_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1_000;

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface FreshHibpResult {
  checkedAt: string;
  status: 'clean' | 'breached';
}

export interface HibpCheckEntry {
  cardId: string;
  password: string;
  pwHash: string;
}

export interface HibpRunOptions {
  checkImpl?: typeof checkPasswordAgainstHibp;
  timeoutMs?: number;
  intervalMs?: number;
  /** When true, this enqueue opens a tracked "bulk run": every queued entry
   * counts toward an aggregated progress report (done/clean/breached/errors)
   * delivered through `subscribeHibpProgress`. Used by "check all". */
  trackProgress?: boolean;
  /** Must return true while the check is still relevant for the card id/pwHash. */
  isStillCurrent: (cardId: string, pwHash: string) => boolean;
  onResult: (cardId: string, result: HibpCheckResult) => void;
  onSkipped?: (cardId: string) => void;
}

type DefinedRunOptions = Omit<HibpRunOptions, 'checkImpl'> & {
  checkImpl: NonNullable<HibpRunOptions['checkImpl']>;
};

interface QueuedRun {
  cardId: string;
  password: string;
  pwHash: string;
  opts: DefinedRunOptions;
}

/** Aggregated state of the tracked bulk run, if any. `active` flips to false
 * only when the run completed naturally; a user-stopped run carries
 * `stopped: true` with the partial counts of what finished before the stop. */
export interface HibpRunProgress {
  active: boolean;
  total: number;
  done: number;
  clean: number;
  breached: number;
  errors: number;
  /** True on the final report emitted when the user stops the run. */
  stopped?: boolean;
}

/** The "skipped" outcome covers passwords that changed mid-flight: the entry
 * was processed but produced no status. */
type BatchEntryOutcome = 'clean' | 'breached' | 'error' | 'skipped';

interface ActiveBatch {
  keys: Set<string>;
  active: boolean;
  total: number;
  done: number;
  clean: number;
  breached: number;
  errors: number;
}

const batchIdle: HibpRunProgress = {
  active: false,
  total: 0,
  done: 0,
  clean: 0,
  breached: 0,
  errors: 0,
};

let queue: QueuedRun[] = [];
let inflight: QueuedRun | null = null;
let running = false;
let batch: ActiveBatch | null = null;
const busyListeners = new Set<(ids: string[]) => void>();
const progressListeners = new Set<(progress: HibpRunProgress) => void>();

const entryKey = (cardId: string, pwHash: string): string => `${cardId}:${pwHash}`;

const buildHibpResult = (raw: HibpResult, pwHash: string): HibpCheckResult => {
  const checkedAt = new Date().toISOString();
  switch (raw.status) {
    case 'breached':
      return { status: 'breached', count: raw.count, checkedAt, pwHash };
    case 'clean':
      return { status: 'clean', checkedAt, pwHash };
    default:
      return { status: 'error', reason: raw.reason ?? 'unknown', checkedAt, pwHash };
  }
};

const activeIds = (): string[] => {
  const ids: string[] = [];
  if (inflight) ids.push(inflight.cardId);
  for (const item of queue) ids.push(item.cardId);
  return ids;
};

const notifyBusy = (): void => {
  const ids = activeIds();
  for (const listener of busyListeners) listener(ids);
};

const notifyProgress = (): void => {
  emitProgress(
    batch
      ? {
          active: batch.active,
          total: batch.total,
          done: batch.done,
          clean: batch.clean,
          breached: batch.breached,
          errors: batch.errors,
        }
      : batchIdle
  );
};

const emitProgress = (state: HibpRunProgress): void => {
  for (const listener of progressListeners) listener(state);
};

/**
 * Removes a batch key whose entry will never complete (e.g. it was replaced
 * in the queue by a newer password) and shrinks `total` so the progress
 * denominator stays honest.
 */
const dropBatchKey = (key: string): void => {
  if (!batch || !batch.keys.delete(key)) return;
  batch.total = Math.max(0, batch.total - 1);
  notifyProgress();
};

/** Counts a completed queued entry against the active batch, if it belongs. */
const countBatchEntry = (key: string, outcome: BatchEntryOutcome): void => {
  if (!batch || !batch.keys.delete(key)) return;
  batch.done++;
  if (outcome === 'clean') batch.clean++;
  else if (outcome === 'breached') batch.breached++;
  else if (outcome === 'error') batch.errors++;
  if (batch.keys.size === 0) batch.active = false;
  notifyProgress();
};

const pump = (): void => {
  if (running) return;
  const next = queue.shift();
  if (!next) {
    running = false;
    inflight = null;
    notifyBusy();
    return;
  }
  running = true;
  inflight = next;
  notifyBusy();

  const { opts, password, cardId, pwHash } = next;
  const timeoutMs = opts.timeoutMs;
  const intervalMs = opts.intervalMs ?? HIBP_REQUEST_INTERVAL_MS;
  const key = entryKey(cardId, pwHash);

  setTimeout(async () => {
    let outcome: BatchEntryOutcome = 'skipped';
    try {
      if (!opts.isStillCurrent(cardId, pwHash)) {
        opts.onSkipped?.(cardId);
      } else {
        const raw = await opts.checkImpl(password, timeoutMs ? { timeoutMs } : undefined);
        if (opts.isStillCurrent(cardId, pwHash)) {
          outcome = raw.status;
          opts.onResult(cardId, buildHibpResult(raw, pwHash));
        } else {
          opts.onSkipped?.(cardId);
        }
      }
    } catch (err) {
      console.warn('[hibpOrchestrator] check failed:', err);
      opts.onSkipped?.(cardId);
    } finally {
      countBatchEntry(key, outcome);
      running = false;
      inflight = null;
      notifyBusy();
      pump();
    }
  }, intervalMs);
};

/**
 * Queues a set of HIBP checks to run serially. New entries for a card id
 * replace any not-yet-started queued entry (a password may have changed
 * again); an entry already in flight is left to be guarded by
 * `isStillCurrent`.
 */
export const enqueueHibpChecks = (entries: HibpCheckEntry[], opts: HibpRunOptions): void => {
  const checkImpl = opts.checkImpl ?? checkPasswordAgainstHibp;
  const runOpts: DefinedRunOptions = { ...opts, checkImpl };

  if (opts.trackProgress && entries.length > 0) {
    const keys = new Set(entries.map((entry) => entryKey(entry.cardId, entry.pwHash)));
    batch = {
      keys,
      active: true,
      total: keys.size,
      done: 0,
      clean: 0,
      breached: 0,
      errors: 0,
    };
    notifyProgress();
  }

  const queuedKeys = new Set(queue.map((item) => entryKey(item.cardId, item.pwHash)));

  for (const entry of entries) {
    const key = entryKey(entry.cardId, entry.pwHash);
    if (inflight && inflight.cardId === entry.cardId && inflight.pwHash === entry.pwHash) {
      continue;
    }
    if (queuedKeys.has(key)) {
      continue;
    }
    // The password changed again since the older entry was queued: replace it.
    const stale = queue.filter((item) => item.cardId === entry.cardId);
    if (stale.length > 0) {
      queue = queue.filter((item) => item.cardId !== entry.cardId);
      for (const old of stale) dropBatchKey(entryKey(old.cardId, old.pwHash));
    }
    queue.push({
      cardId: entry.cardId,
      password: entry.password,
      pwHash: entry.pwHash,
      opts: runOpts,
    });
    queuedKeys.add(key);
  }

  pump();
};

/** Subscribes to in-flight "busy" card id changes. Returns an unsubscribe fn. */
export const subscribeHibpBusy = (listener: (ids: string[]) => void): (() => void) => {
  busyListeners.add(listener);
  listener(activeIds());
  return () => {
    busyListeners.delete(listener);
  };
};

/** Subscribes to tracked bulk-run progress changes. Returns an unsubscribe fn. */
export const subscribeHibpProgress = (
  listener: (progress: HibpRunProgress) => void
): (() => void) => {
  progressListeners.add(listener);
  listener(
    batch
      ? {
          active: batch.active,
          total: batch.total,
          done: batch.done,
          clean: batch.clean,
          breached: batch.breached,
          errors: batch.errors,
        }
      : batchIdle
  );
  return () => {
    progressListeners.delete(listener);
  };
};

/**
 * Immediately stops a tracked/pending bulk run: the queued entries are
 * discarded and the progress report resets to idle. A final report with
 * `stopped: true` is emitted first carrying the partial counts of the
 * entries that already finished, so callers can inform the user. The single
 * in-flight request finishes naturally; its result is still applied because
 * it is valid for its card.
 */
export const clearHibpQueue = (): void => {
  const stoppedReport: HibpRunProgress | null =
    batch && batch.active
      ? {
          active: false,
          stopped: true,
          total: batch.total,
          done: batch.done,
          clean: batch.clean,
          breached: batch.breached,
          errors: batch.errors,
        }
      : null;
  queue = [];
  batch = null;
  notifyBusy();
  if (stoppedReport) emitProgress(stoppedReport);
  notifyProgress();
};

/** SHA-256 (hex) of the exact password a check result refers to. */
export const pwHashFor = (password: string): string => sha256(password);

/** First password value of a card, trimmed; empty for blank/notes. */
export const primaryPassword = (card: PasswordCard): string =>
  (card.passwordList?.[0] ?? '').trim();

export const isHibpEnabled = (db: EncryptedDatabase): boolean =>
  db?.settings?.enableHibpCheck === true && db?.settings?.strictOffline !== true;

/** A stored result is "current" only if it refers to the exact same password. */
export const currentResultIsCurrent = (card: PasswordCard, pwHash: string): boolean =>
  !!card.hibp && card.hibp.pwHash === pwHash;

/**
 * Most recent non-error HIBP result stored for a password hash across ALL
 * cards, but only when it falls inside `HIBP_RECHECK_COOLDOWN_MS`. Returns
 * `null` when the hash may be queried again. Error results never block a
 * retry: a failed lookup is re-checkable immediately.
 */
export const lastFreshCheckForHash = (
  cards: EncryptedDatabase['cards'],
  pwHash: string,
  now: number = Date.now()
): FreshHibpResult | null => {
  let latest: FreshHibpResult | null = null;
  let latestTs = -1;
  for (const card of cards) {
    const hibp = card.hibp;
    if (!hibp || hibp.pwHash !== pwHash) continue;
    if (hibp.status === 'error') continue;
    if (!hibp.checkedAt) continue;
    const ts = Date.parse(hibp.checkedAt);
    if (Number.isNaN(ts)) continue;
    if (now - ts > HIBP_RECHECK_COOLDOWN_MS) continue;
    if (ts > latestTs) {
      latestTs = ts;
      latest = { checkedAt: hibp.checkedAt, status: hibp.status };
    }
  }
  return latest;
};

/** True when a fresh non-error result forbids re-checking this hash now. */
export const isHibpCheckThrottled = (
  cards: EncryptedDatabase['cards'],
  pwHash: string,
  now: number = Date.now()
): boolean => lastFreshCheckForHash(cards, pwHash, now) !== null;

/** Whole days left until the hash may be checked again; never below 1. */
export const hibpCooldownDaysRemaining = (
  cards: EncryptedDatabase['cards'],
  pwHash: string,
  now: number = Date.now()
): number => {
  const latest = lastFreshCheckForHash(cards, pwHash, now);
  if (!latest) return 0;
  const checkedAt = Date.parse(latest.checkedAt);
  const remainingMs = Math.max(0, HIBP_RECHECK_COOLDOWN_MS - (now - checkedAt));
  return Math.max(1, Math.ceil(remainingMs / DAY_MS));
};

/**
 * Whether a card password should be auto-checked when saved. Enforces the
 * opt-in rule: `hibpAuthorized` is only true for passwords authored while the
 * setting was enabled, and a current result suppresses re-emission. The
 * per-hash cooldown also suppresses a save-time retry of the same password,
 * so repeated create/edit/revert cycles cannot re-query HIBP.
 */
export const shouldAutoCheckHibp = (card: PasswordCard, db: EncryptedDatabase): boolean => {
  if (!isHibpEnabled(db)) return false;
  if (!card || card.type !== 'PASSWORD') return false;
  const password = primaryPassword(card);
  if (!password) return false;
  if (!card.hibpAuthorized) return false;
  const pwHash = pwHashFor(password);
  if (currentResultIsCurrent(card, pwHash)) return false;
  if (isHibpCheckThrottled(db.cards, pwHash)) return false;
  return true;
};
