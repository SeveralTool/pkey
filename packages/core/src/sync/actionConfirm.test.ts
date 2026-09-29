import { describe, expect, it } from 'vitest';
import {
  actionConfirmBindMatches,
  parseActionConfirmCancel,
  parseActionConfirmRequest,
  parseActionConfirmResult,
  shouldRequestPhoneConfirm,
} from './actionConfirm';
import {
  ACTION_CONFIRM_CANCEL_TYPE,
  ACTION_CONFIRM_REQUEST_TYPE,
  ACTION_CONFIRM_RESULT_TYPE,
} from './protocol';

const RID = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

describe('shouldRequestPhoneConfirm', () => {
  it('requires both the setting and a live connection', () => {
    expect(shouldRequestPhoneConfirm({ webConfirmOnPhone: true }, true)).toBe(true);
    expect(shouldRequestPhoneConfirm({ webConfirmOnPhone: true }, false)).toBe(false);
    expect(shouldRequestPhoneConfirm({ webConfirmOnPhone: false }, true)).toBe(false);
    expect(shouldRequestPhoneConfirm({}, true)).toBe(false);
    expect(shouldRequestPhoneConfirm(undefined, true)).toBe(false);
  });
});

describe('parseActionConfirmRequest', () => {
  it('accepts a well-formed request (typed or inner-only)', () => {
    expect(
      parseActionConfirmRequest({
        type: ACTION_CONFIRM_REQUEST_TYPE,
        requestId: RID,
        action: 'delete',
        cardId: 'card-1',
      })
    ).toEqual({
      requestId: RID,
      action: 'delete',
      cardId: 'card-1',
    });
    expect(parseActionConfirmRequest({ requestId: RID, action: 'copy' })).toEqual({
      requestId: RID,
      action: 'copy',
    });
  });

  it('rejects unknown actions, short ids, and injected types', () => {
    expect(
      parseActionConfirmRequest({
        type: ACTION_CONFIRM_REQUEST_TYPE,
        requestId: RID,
        action: 'wipe',
      })
    ).toBeNull();
    expect(
      parseActionConfirmRequest({
        type: ACTION_CONFIRM_REQUEST_TYPE,
        requestId: 'short',
        action: 'edit',
      })
    ).toBeNull();
    expect(
      parseActionConfirmRequest({
        type: ACTION_CONFIRM_RESULT_TYPE,
        requestId: RID,
        action: 'edit',
      })
    ).toBeNull();
  });
});

describe('parseActionConfirmResult', () => {
  it('accepts ok and typed deny reasons with bind fields', () => {
    expect(
      parseActionConfirmResult({
        requestId: 'abcd1234efgh5678',
        action: 'delete',
        cardId: 'card-1',
        ok: true,
      })
    ).toEqual({
      requestId: 'abcd1234efgh5678',
      action: 'delete',
      cardId: 'card-1',
      ok: true,
    });
    expect(
      parseActionConfirmResult({
        type: ACTION_CONFIRM_RESULT_TYPE,
        requestId: 'abcd1234efgh5678',
        action: 'copy',
        ok: false,
        reason: 'timeout',
      })
    ).toEqual({
      requestId: 'abcd1234efgh5678',
      action: 'copy',
      ok: false,
      reason: 'timeout',
    });
  });

  it('rejects missing action, non-boolean ok, and unknown reasons', () => {
    expect(
      parseActionConfirmResult({
        requestId: 'abcd1234efgh5678',
        ok: true,
      })
    ).toBeNull();
    expect(
      parseActionConfirmResult({
        requestId: 'abcd1234efgh5678',
        action: 'copy',
        ok: 'true',
      })
    ).toBeNull();
    expect(
      parseActionConfirmResult({
        requestId: 'abcd1234efgh5678',
        action: 'copy',
        ok: false,
        reason: 'nope',
      })
    ).toBeNull();
  });
});

describe('parseActionConfirmCancel', () => {
  it('returns the requestId for a cancel inner', () => {
    expect(
      parseActionConfirmCancel({
        type: ACTION_CONFIRM_CANCEL_TYPE,
        requestId: 'abcd1234efgh5678',
      })
    ).toBe('abcd1234efgh5678');
    expect(parseActionConfirmCancel({ requestId: 'abcd1234efgh5678' })).toBe('abcd1234efgh5678');
    expect(parseActionConfirmCancel({ type: ACTION_CONFIRM_REQUEST_TYPE })).toBeNull();
  });
});

describe('actionConfirmBindMatches', () => {
  const pending = { requestId: RID, action: 'delete' as const, cardId: 'card-1' };

  it('requires requestId, action, and cardId to match', () => {
    expect(
      actionConfirmBindMatches(pending, { requestId: RID, action: 'delete', cardId: 'card-1' })
    ).toBe(true);
    expect(
      actionConfirmBindMatches(pending, { requestId: RID, action: 'copy', cardId: 'card-1' })
    ).toBe(false);
    expect(actionConfirmBindMatches(pending, { requestId: RID, action: 'delete' })).toBe(false);
    expect(
      actionConfirmBindMatches(
        { requestId: RID, action: 'copy' },
        { requestId: RID, action: 'copy' }
      )
    ).toBe(true);
  });
});
