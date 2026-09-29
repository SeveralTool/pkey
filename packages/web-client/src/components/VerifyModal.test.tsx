import { describe, it, expect } from 'vitest';
import { render } from '@solidjs/testing-library';
import { createRoot } from 'solid-js';
import { VerifyModal } from './VerifyModal';
import { verifyAction, cancelVerify, state } from '../state/appStore';

describe('VerifyModal security', () => {
  it('starts with empty password field on each open', async () => {
    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        verifyAction(() => {});
        const { container, unmount } = render(() => <VerifyModal />);
        const input = container.querySelector('input[type="password"]') as HTMLInputElement;
        expect(input?.value).toBe('');
        cancelVerify();
        unmount();
        dispose();
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      createRoot((dispose) => {
        verifyAction(() => {});
        const { container, unmount } = render(() => <VerifyModal />);
        const input = container.querySelector('input[type="password"]') as HTMLInputElement;
        expect(input?.value).toBe('');
        expect(input?.getAttribute('autocomplete')).toBe('off');
        cancelVerify();
        unmount();
        dispose();
        resolve();
      });
    });

    expect(state.showVerify).toBe(false);
  });
});
