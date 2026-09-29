/**
 * @fileoverview Unit tests for secureClipboard: auto-clear window, sensitive flag,
 * and no-clobber behaviour when the user copies something else mid-timer.
 */

// jest.mock() is hoisted above the imports; the factory MUST NOT close over
// non-`mock`-prefixed outer vars. We keep the implementation inline and grab
// handles to the mocks afterwards via `require('expo-clipboard')`.
jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(async () => true),
  getStringAsync: jest.fn(async () => ''),
}));

import * as Clipboard from 'expo-clipboard';
import {
  copySecret,
  copyPublic,
  flushSecureClipboard,
  resetSecureClipboardForTests,
  CLIPBOARD_CLEAR_MS,
} from './secureClipboard';

const mockSetStringAsync = Clipboard.setStringAsync as unknown as jest.Mock;
const mockGetStringAsync = Clipboard.getStringAsync as unknown as jest.Mock;

// Use `setImmediate`-backed microtask flush; setImmediate is left real by
// `jest.useFakeTimers({ doNotFake: ['setImmediate'] })` below so the
// awaited resolved-Promises inside `copySecret` still run.
const flushPromises = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'queueMicrotask'] });
  mockSetStringAsync.mockClear();
  mockSetStringAsync.mockImplementation(async () => true);
  mockGetStringAsync.mockReset();
  mockGetStringAsync.mockImplementation(async () => '');
  resetSecureClipboardForTests();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('secureClipboard', () => {
  it('copies with sensitive:true and schedules auto-clear at 30s', async () => {
    mockGetStringAsync.mockImplementation(async () => 'super-secret');
    await copySecret('super-secret');
    expect(mockSetStringAsync).toHaveBeenCalledWith('super-secret', { sensitive: true });

    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flushPromises();

    expect(mockSetStringAsync).toHaveBeenLastCalledWith('', { sensitive: true });
  });

  it('does NOT clobber when the user already replaced clipboard content', async () => {
    await copySecret('super-secret');
    mockSetStringAsync.mockClear();
    mockGetStringAsync.mockImplementation(async () => 'user-typed-something');

    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flushPromises();

    expect(mockSetStringAsync).not.toHaveBeenCalledWith('', { sensitive: true });
  });

  it('a fresh copy cancels the previous auto-clear timer', async () => {
    mockGetStringAsync.mockImplementation(async () => 'first');
    await copySecret('first');

    jest.advanceTimersByTime(10_000);
    mockGetStringAsync.mockImplementation(async () => 'second');
    await copySecret('second');

    // Advance past the original 30s window from the first copy — should NOT clear yet.
    jest.advanceTimersByTime(20_000);
    await flushPromises();
    // Only the two setStringAsync writes so far (first + second), no empty-string clear.
    expect(mockSetStringAsync).toHaveBeenCalledTimes(2);

    // Now advance the *new* 30s window from the second copy.
    jest.advanceTimersByTime(10_000);
    await flushPromises();
    expect(mockSetStringAsync).toHaveBeenLastCalledWith('', { sensitive: true });
  });

  it('ignores empty strings', async () => {
    await copySecret('');
    expect(mockSetStringAsync).not.toHaveBeenCalled();
  });

  it('copyPublic uses expo-clipboard without sensitive flag or auto-clear', async () => {
    await copyPublic('com.example.app');
    expect(mockSetStringAsync).toHaveBeenCalledWith('com.example.app');

    mockSetStringAsync.mockClear();
    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flushPromises();
    expect(mockSetStringAsync).not.toHaveBeenCalled();
  });

  it('flushSecureClipboard clears content synchronously and cancels timer', async () => {
    mockGetStringAsync.mockImplementation(async () => 'secret');
    await copySecret('secret');
    mockSetStringAsync.mockClear();

    await flushSecureClipboard();
    expect(mockSetStringAsync).toHaveBeenCalledWith('', { sensitive: true });

    jest.advanceTimersByTime(CLIPBOARD_CLEAR_MS);
    await flushPromises();
    // Only one clear from the flush; the timer was cancelled.
    expect(mockSetStringAsync).toHaveBeenCalledTimes(1);
  });
});
