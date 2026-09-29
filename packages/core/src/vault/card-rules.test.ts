import { describe, it, expect } from 'vitest';
import {
  canChangeCardType,
  applyCardTypeChange,
  isPersistedCardTypeFrozen,
} from './card-rules';

describe('canChangeCardType', () => {
  it('blocks PASSWORD cards that already have a saved password', () => {
    expect(canChangeCardType({ type: 'PASSWORD', passwordList: ['secret'] })).toBe(false);
  });

  it('blocks SECRET_PHRASE cards that already have seed words', () => {
    expect(canChangeCardType({ type: 'SECRET_PHRASE', passwordList: ['alpha', 'bravo'] })).toBe(
      false
    );
  });

  it('blocks NOTE cards that already have a note body', () => {
    expect(canChangeCardType({ type: 'NOTE', passwordList: [''], notes: 'memo' })).toBe(false);
  });

  it('blocks cards flagged as having secrets even without plaintext', () => {
    expect(
      canChangeCardType({ type: 'SECRET_PHRASE', passwordList: [], _hasSecret: true })
    ).toBe(false);
  });

  it('allows empty PASSWORD, seed, and note drafts', () => {
    expect(canChangeCardType({ type: 'PASSWORD', passwordList: [''] })).toBe(true);
    expect(canChangeCardType({ type: 'PASSWORD', passwordList: [] })).toBe(true);
    expect(canChangeCardType({ type: 'SECRET_PHRASE', passwordList: ['', ''] })).toBe(true);
    expect(canChangeCardType({ type: 'NOTE', passwordList: [''], notes: '' })).toBe(true);
  });
});

describe('isPersistedCardTypeFrozen', () => {
  const created = '2026-01-01T00:00:00.000Z';

  it('allows a create-draft whose timestamps still match', () => {
    expect(
      isPersistedCardTypeFrozen({
        type: 'PASSWORD',
        passwordList: [''],
        creation_date: created,
        last_update: created,
      })
    ).toBe(false);
  });

  it('freezes a card after the first editor save (timestamps diverge)', () => {
    expect(
      isPersistedCardTypeFrozen({
        type: 'SECRET_PHRASE',
        passwordList: [''],
        creation_date: created,
        last_update: '2026-01-02T00:00:00.000Z',
      })
    ).toBe(true);
  });

  it('freezes a filled seed even if timestamps still match', () => {
    expect(
      isPersistedCardTypeFrozen({
        type: 'SECRET_PHRASE',
        passwordList: ['alpha'],
        creation_date: created,
        last_update: created,
      })
    ).toBe(true);
  });
});

describe('applyCardTypeChange', () => {
  it('returns null when a filled PASSWORD would change type', () => {
    expect(
      applyCardTypeChange({ type: 'PASSWORD', passwordList: ['pw'], otpSecret: 'OTP' }, 'NOTE')
    ).toBeNull();
  });

  it('returns null when a filled SECRET_PHRASE would change type', () => {
    expect(
      applyCardTypeChange(
        { type: 'SECRET_PHRASE', passwordList: ['alpha', 'bravo'], otpSecret: '' },
        'PASSWORD'
      )
    ).toBeNull();
  });

  it('keeps the first value when converting an empty-password card to PASSWORD', () => {
    const next = applyCardTypeChange(
      { type: 'SECRET_PHRASE', passwordList: [''], otpSecret: '' },
      'PASSWORD'
    );
    expect(next).toEqual({ type: 'PASSWORD', passwordList: [''], otpSecret: '' });
  });

  it('resets seed words when converting from a filled list', () => {
    const next = applyCardTypeChange(
      { type: 'NOTE', passwordList: [''], otpSecret: '' },
      'SECRET_PHRASE'
    );
    expect(next?.passwordList).toEqual(['']);
  });

  it('clears secrets when converting an empty seed draft to NOTE', () => {
    const next = applyCardTypeChange(
      { type: 'SECRET_PHRASE', passwordList: [''], otpSecret: '' },
      'NOTE'
    );
    expect(next).toEqual({ type: 'NOTE', passwordList: [''], otpSecret: '' });
  });
});
