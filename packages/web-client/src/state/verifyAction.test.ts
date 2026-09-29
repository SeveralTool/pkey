import { describe, expect, it } from 'vitest';
import { cancelVerify, state, verifyAction } from './appStore';

describe('verifyAction phone confirm', () => {
  it('opens the password modal when the phone-confirm setting is off', () => {
    verifyAction(() => {});
    expect(state.showVerify).toBe(true);
    expect(state.showPhoneConfirm).toBe(false);
    cancelVerify();
    expect(state.showVerify).toBe(false);
  });

  it('falls back to the password modal when a confirm action is requested without a live socket', () => {
    verifyAction(() => {}, { action: 'copy', cardId: 'card-1' });
    expect(state.showPhoneConfirm).toBe(false);
    expect(state.showVerify).toBe(true);
    cancelVerify();
  });
});
