/**
 * @jest-environment node
 */
import {
  registerSyncUndo,
  consumeSyncUndo,
  peekPendingUndoToken,
  clearSyncUndo,
  applySyncUndoToCards,
  SYNC_UNDO_TTL_MS,
} from './syncUndo';
import type { SyncPreMergeSnapshot } from './syncServerCore';
import type { PasswordCard } from '@pkey/core';

// Minimal PasswordCard shape — tests only care about identity + a field.
const makeCard = (id: string, title: string): PasswordCard =>
  ({
    id,
    title,
    type: 'password',
    last_update: '2026-01-01T00:00:00.000Z',
  } as unknown as PasswordCard);

const makeSnapshot = (cards: PasswordCard[]): SyncPreMergeSnapshot => ({
  capturedAt: '2026-01-01T00:00:00.000Z',
  cardsById: Object.fromEntries(cards.map((c) => [c.id, c])),
});

beforeEach(() => {
  jest.useFakeTimers();
  clearSyncUndo();
});

afterEach(() => {
  jest.useRealTimers();
  clearSyncUndo();
});

describe('syncUndo', () => {
  it('registers a token and lets callers consume it exactly once', () => {
    const snapshot = makeSnapshot([makeCard('a', 'Alpha')]);
    const token = registerSyncUndo(snapshot, 1);

    expect(token).toMatch(/^[a-f0-9]{24}$/);
    expect(peekPendingUndoToken()).toBe(token);

    const restored = consumeSyncUndo(token);
    expect(restored).not.toBeNull();
    expect(restored?.cardsById.a).toBeDefined();

    // Second call must return null (already consumed).
    expect(consumeSyncUndo(token)).toBeNull();
    expect(peekPendingUndoToken()).toBeNull();
  });

  it('supersedes the previous entry when a new merge happens', () => {
    const t1 = registerSyncUndo(makeSnapshot([makeCard('a', 'A1')]), 1);
    const t2 = registerSyncUndo(makeSnapshot([makeCard('b', 'B1')]), 1);

    expect(t1).not.toBe(t2);
    expect(consumeSyncUndo(t1)).toBeNull();
    expect(consumeSyncUndo(t2)).not.toBeNull();
  });

  it('expires the token after SYNC_UNDO_TTL_MS', () => {
    const token = registerSyncUndo(makeSnapshot([makeCard('a', 'A')]), 1);

    jest.advanceTimersByTime(SYNC_UNDO_TTL_MS + 1000);
    expect(consumeSyncUndo(token)).toBeNull();
    expect(peekPendingUndoToken()).toBeNull();
  });

  it('applySyncUndoToCards replaces merged cards with pre-merge versions', () => {
    const preMerge = makeCard('a', 'PRE');
    const mergedA = makeCard('a', 'POST');
    const unrelated = makeCard('b', 'B');
    const result = applySyncUndoToCards([mergedA, unrelated], { a: preMerge });

    expect(result).toEqual([preMerge, unrelated]);
  });

  it('applySyncUndoToCards resurrects cards deleted after the merge', () => {
    const preMerge = makeCard('a', 'PRE');
    const result = applySyncUndoToCards([], { a: preMerge });

    expect(result).toEqual([preMerge]);
  });

  it('clearSyncUndo cancels the pending token and its expiry', () => {
    const token = registerSyncUndo(makeSnapshot([makeCard('a', 'A')]), 1);
    clearSyncUndo();

    expect(peekPendingUndoToken()).toBeNull();
    expect(consumeSyncUndo(token)).toBeNull();
  });
});
