import {
  buildCopySuccessMessage,
  getCardCopyPayload,
  hasCardCopyPayload,
  resolveSwipeAction,
  SWIPE_THRESHOLD,
} from './swipeActions';

describe('resolveSwipeAction', () => {
  it('returns none when below threshold', () => {
    expect(resolveSwipeAction(0)).toBe('none');
    expect(resolveSwipeAction(59)).toBe('none');
    expect(resolveSwipeAction(-59)).toBe('none');
  });

  it('returns copy when swiped right past threshold', () => {
    expect(resolveSwipeAction(60)).toBe('copy');
    expect(resolveSwipeAction(120)).toBe('copy');
  });

  it('returns delete when swiped left past threshold', () => {
    expect(resolveSwipeAction(-60)).toBe('delete');
    expect(resolveSwipeAction(-120)).toBe('delete');
  });

  it('respects custom threshold', () => {
    expect(resolveSwipeAction(50, 40)).toBe('copy');
    expect(resolveSwipeAction(-50, 40)).toBe('delete');
    expect(resolveSwipeAction(30, 40)).toBe('none');
  });
});

describe('getCardCopyPayload', () => {
  it('returns trimmed password for PASSWORD cards', () => {
    expect(getCardCopyPayload({ type: 'PASSWORD', passwordList: ['  secret123  '] })).toBe(
      'secret123'
    );
  });

  it('returns empty string for PASSWORD with no value', () => {
    expect(getCardCopyPayload({ type: 'PASSWORD', passwordList: [] })).toBe('');
    expect(getCardCopyPayload({ type: 'PASSWORD', passwordList: [''] })).toBe('');
    expect(getCardCopyPayload({ type: 'PASSWORD', passwordList: ['   '] })).toBe('');
  });

  it('joins non-empty words for SECRET_PHRASE cards', () => {
    expect(
      getCardCopyPayload({
        type: 'SECRET_PHRASE',
        passwordList: ['alpha', '', 'beta', '  '],
      })
    ).toBe('alpha beta');
  });

  it('returns empty string for SECRET_PHRASE with no words', () => {
    expect(getCardCopyPayload({ type: 'SECRET_PHRASE', passwordList: [] })).toBe('');
    expect(getCardCopyPayload({ type: 'SECRET_PHRASE', passwordList: ['', '  '] })).toBe('');
  });

  it('returns trimmed notes for NOTE cards', () => {
    expect(getCardCopyPayload({ type: 'NOTE', passwordList: [''], notes: '  secret note  ' })).toBe(
      'secret note'
    );
  });
});

describe('hasCardCopyPayload', () => {
  it('reflects whether payload is non-empty', () => {
    expect(hasCardCopyPayload({ type: 'PASSWORD', passwordList: ['x'] })).toBe(true);
    expect(hasCardCopyPayload({ type: 'PASSWORD', passwordList: [] })).toBe(false);
    expect(hasCardCopyPayload({ type: 'SECRET_PHRASE', passwordList: ['word'] })).toBe(true);
    expect(hasCardCopyPayload({ type: 'SECRET_PHRASE', passwordList: ['', ' '] })).toBe(false);
  });
});

describe('buildCopySuccessMessage', () => {
  const t = {
    notif_copy_success_message: 'The {label} of "{title}" is now in your clipboard',
    notif_copy_success_message_no_title: 'The {label} is now in your clipboard',
  };

  it('includes the card title when present', () => {
    expect(buildCopySuccessMessage(t, 'password', 'Gmail')).toBe(
      'The password of "Gmail" is now in your clipboard'
    );
  });

  it('omits the title when the card has none', () => {
    expect(buildCopySuccessMessage(t, 'password', '   ')).toBe(
      'The password is now in your clipboard'
    );
  });

  it('interpolates any label', () => {
    expect(buildCopySuccessMessage(t, 'OTP code', 'GitHub')).toBe(
      'The OTP code of "GitHub" is now in your clipboard'
    );
  });
});

describe('SWIPE_THRESHOLD', () => {
  it('is 60px', () => {
    expect(SWIPE_THRESHOLD).toBe(60);
  });
});
