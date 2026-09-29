/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { copySecretToClipboard, WEB_CLIPBOARD_CLEAR_MS } from './webUtils';

describe('copySecretToClipboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    const store = { value: '' };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: vi.fn(async (t: string) => {
          store.value = t;
        }),
        readText: vi.fn(async () => store.value),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('clears the clipboard after the default window when unchanged', async () => {
    await copySecretToClipboard('secret-value');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('secret-value');
    await vi.advanceTimersByTimeAsync(WEB_CLIPBOARD_CLEAR_MS);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('');
  });

  it('does not clear when clipboard content changed', async () => {
    await copySecretToClipboard('secret-value');
    (navigator.clipboard.readText as ReturnType<typeof vi.fn>).mockResolvedValue('user-paste');
    await vi.advanceTimersByTimeAsync(WEB_CLIPBOARD_CLEAR_MS);
    const writes = (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mock.calls.map(
      (c) => c[0]
    );
    expect(writes).toEqual(['secret-value']);
  });
});
