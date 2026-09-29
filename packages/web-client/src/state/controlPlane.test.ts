// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ACTION_CONFIRM_RESULT_TYPE, encryptControlWire, wrapControlInner } from '@pkey/core';
import {
  __handleMessageForTests,
  __setPhoneConfirmForTests,
  __setStateForTests,
  cancelVerify,
  state,
  wipeSession,
} from './appStore';

const HASH = 'ab'.repeat(32);
const TOKEN = 'session-token-abcdef';
const RID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('PWA encrypted control plane', () => {
  beforeEach(() => {
    __setStateForTests({
      connState: 'authenticated',
      authenticated: true,
      wasAuthenticated: true,
      passwordHash: HASH,
      wsToken: TOKEN,
      showPhoneConfirm: true,
      showVerify: false,
      verifyCallback: vi.fn(),
      verifyError: '',
    });
    __setPhoneConfirmForTests({ requestId: RID, action: 'delete', cardId: 'card-1' });
  });

  afterEach(async () => {
    cancelVerify();
    await wipeSession({ skipPersist: true });
  });

  it('does not run the callback when the encrypted result action does not match', () => {
    const cb = state.verifyCallback;
    const wire = encryptControlWire(
      ACTION_CONFIRM_RESULT_TYPE,
      wrapControlInner(TOKEN, {
        requestId: RID,
        action: 'copy',
        cardId: 'card-1',
        ok: true,
      }),
      HASH
    );
    __handleMessageForTests({ ...wire });
    expect(cb).not.toHaveBeenCalled();
    expect(state.showVerify).toBe(true);
    expect(state.showPhoneConfirm).toBe(false);
  });

  it('runs the callback when the encrypted result bind matches', () => {
    const cb = state.verifyCallback;
    const wire = encryptControlWire(
      ACTION_CONFIRM_RESULT_TYPE,
      wrapControlInner(TOKEN, {
        requestId: RID,
        action: 'delete',
        cardId: 'card-1',
        ok: true,
      }),
      HASH
    );
    __handleMessageForTests({ ...wire });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(state.showVerify).toBe(false);
  });

  it('ignores a plaintext post-auth error and does not demote a live session', () => {
    __handleMessageForTests({
      type: 'error',
      code: 'UNAUTHORIZED',
      error: 'Not authenticated',
    });
    expect(state.connState).toBe('authenticated');
    expect(state.authenticated).toBe(true);
  });
});
