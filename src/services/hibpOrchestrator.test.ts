/** @jest-environment node */
/**
 * @fileoverview Unit tests for the serialized HIBP check orchestrator.
 */
import {
  enqueueHibpChecks,
  shouldAutoCheckHibp,
  currentResultIsCurrent,
  pwHashFor,
  subscribeHibpBusy,
  subscribeHibpProgress,
  clearHibpQueue,
  lastFreshCheckForHash,
  isHibpCheckThrottled,
  hibpCooldownDaysRemaining,
  HIBP_RECHECK_COOLDOWN_MS,
  type HibpRunOptions,
  type HibpRunProgress,
} from './hibpOrchestrator';
import type { HibpResult } from './hibpCheck';
import type { EncryptedDatabase, HibpCheckResult, PasswordCard } from '../types';

const makeDb = (overrides: Partial<EncryptedDatabase> = {}): EncryptedDatabase =>
  ({
    version: 1,
    passwordHash: 'x',
    salt: 's',
    cards: [],
    settings: {
      autoLogout: '1M',
      allowScreenshots: true,
      theme: 'LIGHT',
      language: 'ESP',
      autoCollapse: false,
      genSymbols: true,
      genNumbers: true,
      genUppercase: true,
      genLowercase: true,
      genLength: 16,
    },
    creation_date: '2026-01-01T00:00:00.000Z',
    last_update: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as EncryptedDatabase;

const makeCard = (overrides: Partial<PasswordCard> = {}): PasswordCard =>
  ({
    id: 'c1',
    type: 'PASSWORD',
    title: 't',
    icon: { type: 'icon', value: 'key-outline' },
    username: 'u',
    passwordList: ['secret'],
    link: '',
    notes: '',
    creation_date: '2026-01-01T00:00:00.000Z',
    last_update: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }) as PasswordCard;

const until = async (predicate: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const start = Date.now();
  while (!predicate()) {
    await new Promise((r) => setTimeout(r, 1));
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting for condition');
  }
};

describe('shouldAutoCheckHibp', () => {
  it('returns false when the opt-in setting is off', () => {
    const db = makeDb({ settings: { ...makeDb().settings, enableHibpCheck: false } });
    const card = makeCard({ hibpAuthorized: true });
    expect(shouldAutoCheckHibp(card, db)).toBe(false);
  });

  it('returns false for non-PASSWORD cards', () => {
    const db = makeDb({ settings: { ...makeDb().settings, enableHibpCheck: true } });
    expect(shouldAutoCheckHibp(makeCard({ type: 'NOTE', hibpAuthorized: true }), db)).toBe(false);
  });

  it('returns true for an authorized PASSWORD with a fresh value', () => {
    const db = makeDb({ settings: { ...makeDb().settings, enableHibpCheck: true } });
    const card = makeCard({ hibpAuthorized: true });
    expect(shouldAutoCheckHibp(card, db)).toBe(true);
  });

  it('returns false when the password was never authorized (saved while setting off)', () => {
    const db = makeDb({ settings: { ...makeDb().settings, enableHibpCheck: true } });
    const card = makeCard({ hibpAuthorized: false });
    expect(shouldAutoCheckHibp(card, db)).toBe(false);
  });

  it('returns false when the password is empty', () => {
    const db = makeDb({ settings: { ...makeDb().settings, enableHibpCheck: true } });
    const card = makeCard({ hibpAuthorized: true, passwordList: [''] });
    expect(shouldAutoCheckHibp(card, db)).toBe(false);
  });

  it('returns false when the stored result is current for the exact password', () => {
    const db = makeDb({ settings: { ...makeDb().settings, enableHibpCheck: true } });
    const card = makeCard({ hibpAuthorized: true });
    const pwHash = pwHashFor('secret');
    card.hibp = { status: 'clean', checkedAt: '2026-01-01T00:00:00.000Z', pwHash };
    expect(currentResultIsCurrent(card, pwHash)).toBe(true);
    expect(shouldAutoCheckHibp(card, db)).toBe(false);
  });
});

describe('enqueueHibpChecks', () => {
  it('runs an authorized card and applies the result with the correct pwHash', async () => {
    const calls: Array<{ password: string; opts?: { timeoutMs?: number } }> = [];
    const onResult = jest.fn();
    const checkImpl = async (password: string, opts?: { timeoutMs?: number }) => {
      calls.push({ password, opts });
      return { status: 'breached' as const, count: 3 };
    };

    const pwHash = pwHashFor('hunter2');
    enqueueHibpChecks([{ cardId: 'c1', password: 'hunter2', pwHash }], {
      checkImpl,
      intervalMs: 0,
      isStillCurrent: () => true,
      onResult,
    } as HibpRunOptions);

    await until(() => onResult.mock.calls.length === 1);
    expect(calls).toHaveLength(1);
    expect(calls[0].password).toBe('hunter2');
    const [cardId, result] = onResult.mock.calls[0] as [string, any];
    expect(cardId).toBe('c1');
    expect(result.status).toBe('breached');
    expect(result.count).toBe(3);
    expect(result.pwHash).toBe(pwHash);
  });

  it('discards the result when the password changed while in flight', async () => {
    const onResult = jest.fn();
    const onSkipped = jest.fn();
    const checkImpl = async () => ({ status: 'clean' as const });

    enqueueHibpChecks([{ cardId: 'c1', password: 'old', pwHash: pwHashFor('old') }], {
      checkImpl,
      intervalMs: 0,
      isStillCurrent: () => false,
      onResult,
      onSkipped,
    } as HibpRunOptions);

    await until(() => onSkipped.mock.calls.length === 1);
    expect(onResult).not.toHaveBeenCalled();
    expect(onSkipped).toHaveBeenCalledWith('c1');
  });

  it('de-duplicates identical queued entries for the same card+password', async () => {
    const calls: string[] = [];
    let released = false;
    const checkImpl = async (password: string) => {
      calls.push(password);
      await new Promise((r) => setTimeout(r, 10));
      released = true;
      return { status: 'clean' as const };
    };
    const onResult = jest.fn();

    const pwHash = pwHashFor('pw');
    enqueueHibpChecks([{ cardId: 'c1', password: 'pw', pwHash }], {
      checkImpl,
      intervalMs: 0,
      isStillCurrent: () => true,
      onResult,
    } as HibpRunOptions);
    enqueueHibpChecks([{ cardId: 'c1', password: 'pw', pwHash }], {
      checkImpl,
      intervalMs: 0,
      isStillCurrent: () => true,
      onResult,
    } as HibpRunOptions);

    await until(() => released && onResult.mock.calls.length === 1);
    expect(calls).toHaveLength(1);
  });

  it('replaces a queued entry when the card password changed again before running', async () => {
    const calls: string[] = [];
    const onResult = jest.fn();
    const checkImpl = async (password: string) => {
      calls.push(password);
      return { status: 'clean' as const };
    };

    const opts = {
      checkImpl,
      intervalMs: 20,
      isStillCurrent: () => true,
      onResult,
    } as HibpRunOptions;
    // 'card-1' is in flight; 'card-2:b-first' is queued.
    enqueueHibpChecks(
      [
        { cardId: 'card-1', password: 'AAA', pwHash: pwHashFor('AAA') },
        { cardId: 'card-2', password: 'b-first', pwHash: pwHashFor('b-first') },
      ],
      opts
    );
    // A newer password for card-2 arrives before the queued entry ran.
    enqueueHibpChecks(
      [{ cardId: 'card-2', password: 'b-second', pwHash: pwHashFor('b-second') }],
      opts
    );

    await until(() => onResult.mock.calls.length === 2);
    expect(calls).toEqual(['AAA', 'b-second']);
  });

  it('serializes checks and reports busy ids via the subscription', async () => {
    const onResult = jest.fn();
    const idsSeen: string[][] = [];
    const unsub = subscribeHibpBusy((ids) => idsSeen.push(ids));

    let active = 0;
    let maxActive = 0;
    const checkImpl = async (password: string) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((r) => setTimeout(r, 5));
      active -= 1;
      return { status: 'clean' as const };
    };
    const opts = {
      checkImpl,
      intervalMs: 0,
      isStillCurrent: () => true,
      onResult,
    } as HibpRunOptions;
    const pwHash = (pw: string) => pwHashFor(pw);
    enqueueHibpChecks(
      [
        { cardId: 'c1', password: 'a', pwHash: pwHash('a') },
        { cardId: 'c2', password: 'b', pwHash: pwHash('b') },
      ],
      opts
    );

    await until(() => onResult.mock.calls.length === 2);
    // Only one request is ever live: the second cannot start before the first ends.
    expect(maxActive).toBe(1);
    expect(idsSeen.length).toBeGreaterThan(0);
    unsub();
  });
});

describe('tracked bulk runs (progress + stop)', () => {
  beforeEach(() => clearHibpQueue());

  it('reports live progress and an aggregated final summary', async () => {
    const onResult = jest.fn();
    const implByPassword: Record<string, HibpResult> = {
      a: { status: 'clean' },
      b: { status: 'breached', count: 2 },
      c: { status: 'error', reason: 'timeout' },
    };
    const checkImpl = async (password: string) => implByPassword[password];
    const seen: HibpRunProgress[] = [];
    const unsub = subscribeHibpProgress((p) => seen.push(p));
    seen.length = 0; // drop the initial idle snapshot

    enqueueHibpChecks(
      [
        { cardId: 'c1', password: 'a', pwHash: pwHashFor('a') },
        { cardId: 'c2', password: 'b', pwHash: pwHashFor('b') },
        { cardId: 'c3', password: 'c', pwHash: pwHashFor('c') },
      ],
      {
        checkImpl,
        intervalMs: 0,
        isStillCurrent: () => true,
        onResult,
        trackProgress: true,
      } as HibpRunOptions
    );

    await until(() => onResult.mock.calls.length === 3);
    const first = seen.find((p) => p.active);
    expect(first).toBeDefined();
    expect(first!.total).toBe(3);
    expect(first!.done).toBe(0);

    const last = seen[seen.length - 1];
    expect(last.active).toBe(false);
    expect(last.total).toBe(3);
    expect(last.done).toBe(3);
    expect(last.clean).toBe(1);
    expect(last.breached).toBe(1);
    expect(last.errors).toBe(1);
    unsub();
  });

  it('counts a skipped entry (password changed mid-flight) as processed', async () => {
    const onResult = jest.fn();
    const seen: HibpRunProgress[] = [];
    const unsub = subscribeHibpProgress((p) => seen.push(p));
    seen.length = 0;

    enqueueHibpChecks(
      [
        { cardId: 'c1', password: 'a', pwHash: pwHashFor('a') },
        { cardId: 'c2', password: 'b', pwHash: pwHashFor('b') },
      ],
      {
        checkImpl: async (password: string) =>
          password === 'a'
            ? { status: 'clean' as const }
            : { status: 'breached' as const, count: 1 },
        intervalMs: 0,
        isStillCurrent: (cardId) => cardId !== 'c2',
        onResult,
        trackProgress: true,
      } as HibpRunOptions
    );

    await until(() => seen.some((p) => p.done === 2));
    const last = seen[seen.length - 1];
    expect(last.active).toBe(false);
    expect(last.done).toBe(2);
    expect(last.clean).toBe(1);
    expect(last.breached).toBe(0);
    unsub();
  });

  it('shrinks the batch when a queued entry is replaced before running', async () => {
    const onResult = jest.fn();
    let releaseFirst = false;
    const checkImpl = async (password: string) => {
      if (password === 'AAA') {
        while (!releaseFirst) await new Promise((r) => setTimeout(r, 1));
      }
      return { status: 'clean' as const };
    };
    const seen: HibpRunProgress[] = [];
    const unsub = subscribeHibpProgress((p) => seen.push(p));
    seen.length = 0;

    const tracked = {
      checkImpl,
      intervalMs: 0,
      isStillCurrent: () => true,
      onResult,
      trackProgress: true,
    } as HibpRunOptions;
    enqueueHibpChecks(
      [
        { cardId: 'card-1', password: 'AAA', pwHash: pwHashFor('AAA') },
        { cardId: 'card-2', password: 'b-first', pwHash: pwHashFor('b-first') },
      ],
      tracked
    );
    // A newer, untracked password for card-2 arrives before its entry ran,
    // mimicking a save-time auto-check landing mid-bulk-run.
    enqueueHibpChecks([{ cardId: 'card-2', password: 'b-second', pwHash: pwHashFor('b-second') }], {
      ...tracked,
      trackProgress: false,
    });

    await until(() => seen.some((p) => p.active && p.total === 1));
    releaseFirst = true;
    await until(() => onResult.mock.calls.length === 2);

    const last = seen[seen.length - 1];
    expect(last.active).toBe(false);
    expect(last.total).toBe(1);
    expect(last.done).toBe(1);
    expect(last.clean).toBe(1);
    unsub();
  });

  it('stop discards queued entries and idles progress without a finish summary', async () => {
    const onResult = jest.fn();
    const checkImpl = async () => {
      await new Promise((r) => setTimeout(r, 25));
      return { status: 'clean' as const };
    };
    const seen: HibpRunProgress[] = [];
    const unsub = subscribeHibpProgress((p) => seen.push(p));
    seen.length = 0;

    const entries = Array.from({ length: 10 }, (_, i) => ({
      cardId: `c${i}`,
      password: `p${i}`,
      pwHash: pwHashFor(`p${i}`),
    }));
    enqueueHibpChecks(entries, {
      checkImpl,
      intervalMs: 2,
      isStillCurrent: () => true,
      onResult,
      trackProgress: true,
    } as HibpRunOptions);

    // Let the first entry complete, then stop the rest.
    await until(() => seen.some((p) => p.active && p.done === 1));
    clearHibpQueue();
    const finishedAtStop = onResult.mock.calls.length;
    await new Promise((r) => setTimeout(r, 100));

    // At most the single in-flight check may finish after the stop.
    expect(onResult.mock.calls.length).toBeLessThanOrEqual(finishedAtStop + 1);
    // A stopped report with the partial counts is emitted before idle.
    const stopped = seen.find((p) => p.stopped === true);
    expect(stopped).toBeDefined();
    expect(stopped!.total).toBe(10);
    expect(stopped!.done).toBeGreaterThanOrEqual(1);
    expect(stopped!.active).toBe(false);
    const last = seen[seen.length - 1];
    // Idle with zero totals right after the stopped report.
    expect(last.active).toBe(false);
    expect(last.total).toBe(0);
    expect(last.done).toBe(0);
    unsub();
  });
});

describe('HIBP re-check cooldown', () => {
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = Date.now();
  const hash = pwHashFor('secret');
  const isoAgo = (ms: number) => new Date(NOW - ms).toISOString();
  const cleanResult = (at: string, pw = hash): HibpCheckResult => ({
    status: 'clean',
    checkedAt: at,
    pwHash: pw,
  });
  const breachedResult = (at: string, count: number, pw = hash): HibpCheckResult => ({
    status: 'breached',
    count,
    checkedAt: at,
    pwHash: pw,
  });
  const errorResult = (at: string, pw = hash): HibpCheckResult => ({
    status: 'error',
    reason: 'timeout',
    checkedAt: at,
    pwHash: pw,
  });

  it('allows a check when no stored result references the hash', () => {
    const db = makeDb();
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(false);
    expect(lastFreshCheckForHash(db.cards, hash, NOW)).toBeNull();
    expect(hibpCooldownDaysRemaining(db.cards, hash, NOW)).toBe(0);
  });

  it('throttles while a clean result is inside the window', () => {
    const db = makeDb({ cards: [makeCard({ id: 'c1', hibp: cleanResult(isoAgo(2 * DAY)) })] });
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(true);
    expect(hibpCooldownDaysRemaining(db.cards, hash, NOW)).toBe(5);
  });

  it('throttles from a breached result too', () => {
    const db = makeDb({
      cards: [makeCard({ id: 'c1', hibp: breachedResult(isoAgo(1 * DAY), 3) })],
    });
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(true);
  });

  it('never throttles on error results — retries are allowed', () => {
    const db = makeDb({
      cards: [makeCard({ id: 'c1', hibp: errorResult(isoAgo(5 * 60 * 1000)) })],
    });
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(false);
    expect(hibpCooldownDaysRemaining(db.cards, hash, NOW)).toBe(0);
  });

  it('counting-only results with no checkedAt never throttle', () => {
    const db = makeDb({ cards: [makeCard({ id: 'c1', passwordList: ['secret'] })] });
    db.cards[0].hibp = { status: 'clean', checkedAt: '', pwHash: hash };
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(false);
  });

  it('throttles across cards holding the same password', () => {
    const db = makeDb({
      cards: [
        makeCard({ id: 'c1', hibp: cleanResult(isoAgo(1 * DAY)) }),
        makeCard({ id: 'c2', passwordList: ['secret'] }),
      ],
    });
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(true);
  });

  it('allows re-check once the window has fully elapsed', () => {
    const db = makeDb({
      cards: [makeCard({ id: 'c1', hibp: cleanResult(isoAgo(HIBP_RECHECK_COOLDOWN_MS + 1)) })],
    });
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(false);
  });

  it('counts an exactly-at-window result as still fresh', () => {
    const db = makeDb({
      cards: [makeCard({ id: 'c1', hibp: cleanResult(isoAgo(HIBP_RECHECK_COOLDOWN_MS)) })],
    });
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(true);
    expect(hibpCooldownDaysRemaining(db.cards, hash, NOW)).toBe(1);
  });

  it('uses the most recent result among duplicates across cards', () => {
    const db = makeDb({
      cards: [
        makeCard({ id: 'c1', hibp: breachedResult(isoAgo(6 * DAY), 2) }),
        makeCard({ id: 'c2', hibp: breachedResult(isoAgo(2 * DAY), 5) }),
      ],
    });
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(true);
    expect(hibpCooldownDaysRemaining(db.cards, hash, NOW)).toBe(5);
  });

  it('rounds remaining days up and floors at 1', () => {
    const db = makeDb({
      cards: [makeCard({ id: 'c1', hibp: cleanResult(isoAgo(HIBP_RECHECK_COOLDOWN_MS - 1)) })],
    });
    expect(hibpCooldownDaysRemaining(db.cards, hash, NOW)).toBe(1);
  });

  it('only treats a result as fresh when it targets the same hash', () => {
    const db = makeDb({
      cards: [makeCard({ id: 'c1', hibp: cleanResult(isoAgo(1 * DAY), 'd'.repeat(64)) })],
    });
    expect(isHibpCheckThrottled(db.cards, hash, NOW)).toBe(false);
    expect(isHibpCheckThrottled(db.cards, 'd'.repeat(64), NOW)).toBe(true);
  });

  it('does not auto-check a saved password that another card checked recently', () => {
    const db = makeDb({
      settings: { ...makeDb().settings, enableHibpCheck: true },
      cards: [
        makeCard({ id: 'c1', hibp: cleanResult(isoAgo(1 * DAY)) }),
        makeCard({ id: 'c2', hibpAuthorized: true }),
      ],
    });
    expect(shouldAutoCheckHibp(db.cards[1], db)).toBe(false);
  });

  it('still auto-checks when the only fresh result is expired', () => {
    const db = makeDb({
      settings: { ...makeDb().settings, enableHibpCheck: true },
      cards: [
        makeCard({ id: 'c1', hibp: cleanResult(isoAgo(HIBP_RECHECK_COOLDOWN_MS + 1)) }),
        makeCard({ id: 'c2', hibpAuthorized: true }),
      ],
    });
    expect(shouldAutoCheckHibp(db.cards[1], db)).toBe(true);
  });
});
