/**
 * @fileoverview Which editor section opens, and when the stack may push.
 */
import {
  adjustOpenSections,
  cardsListCoveredAfter,
  initialCardEditorSection,
  isCardReadyToOpen,
  sectionsAfterTypeChange,
  shouldFreezeCardsList,
  toggleEditorSection,
} from './cardsStack';

const blank = {
  type: 'PASSWORD' as const,
  title: '',
  username: '',
  passwordList: [''],
  notes: '',
};

describe('initialCardEditorSection', () => {
  it('starts a new key on the account section', () => {
    expect(initialCardEditorSection(blank)).toBe('account');
  });

  it('starts an existing password on the secret', () => {
    expect(initialCardEditorSection({ ...blank, title: 'Mail', passwordList: ['x'] })).toBe(
      'secret'
    );
  });

  it('starts a note on its text', () => {
    expect(initialCardEditorSection({ ...blank, type: 'NOTE', title: 'Memo', notes: 'hi' })).toBe(
      'notes'
    );
  });
});

describe('isCardReadyToOpen', () => {
  it('waits until the id is in the vault', () => {
    expect(isCardReadyToOpen(null, ['a'])).toBe(false);
    expect(isCardReadyToOpen('b', ['a'])).toBe(false);
    expect(isCardReadyToOpen('a', ['a'])).toBe(true);
  });
});

describe('shouldFreezeCardsList', () => {
  it('keeps the list painted while the push is still running', () => {
    expect(shouldFreezeCardsList(true, false, false)).toBe(false);
  });

  it('suspends only after the editor has covered a revealed list', () => {
    expect(shouldFreezeCardsList(true, false, true)).toBe(true);
    expect(shouldFreezeCardsList(true, true, true)).toBe(false);
    expect(shouldFreezeCardsList(false, false, true)).toBe(false);
  });
});

describe('cardsListCoveredAfter', () => {
  it('does not cover the list when the push starts', () => {
    expect(cardsListCoveredAfter('start', true)).toBeNull();
  });

  it('covers the list when the push finishes', () => {
    expect(cardsListCoveredAfter('end', true)).toBe(true);
  });

  it('uncovers the list as soon as it starts coming back', () => {
    expect(cardsListCoveredAfter('start', false)).toBe(false);
    expect(cardsListCoveredAfter('end', false)).toBe(false);
  });
});

describe('toggleEditorSection', () => {
  it('keeps a single section open when auto-collapse is on', () => {
    const open = new Set(['account' as const]);
    const next = toggleEditorSection(open, 'secret', true);
    expect([...next]).toEqual(['secret']);
    expect([...toggleEditorSection(next, 'secret', true)]).toEqual([]);
  });

  it('lets several sections stay open when auto-collapse is off', () => {
    const open = toggleEditorSection(new Set(['account']), 'notes', false);
    expect(open.has('account')).toBe(true);
    expect(open.has('notes')).toBe(true);
    expect(toggleEditorSection(open, 'account', false).has('account')).toBe(false);
  });
});

describe('sectionsAfterTypeChange', () => {
  it('moves a note off the secret section', () => {
    const next = sectionsAfterTypeChange(new Set(['secret', 'notes']), 'NOTE');
    expect(next?.has('secret')).toBe(false);
    expect(next?.has('notes')).toBe(true);
  });

  it('leaves a password untouched', () => {
    expect(sectionsAfterTypeChange(new Set(['otp', 'secret']), 'PASSWORD')).toBeNull();
  });
});

describe('adjustOpenSections', () => {
  it('folds extra sections when auto-collapse turns on', () => {
    const next = adjustOpenSections(new Set(['account', 'notes']), 'PASSWORD', true);
    expect([...(next ?? [])]).toEqual(['account']);
  });
});
