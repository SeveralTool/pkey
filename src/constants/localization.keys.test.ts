/**
 * @fileoverview ESP and ING localization dictionaries must expose the same keys.
 */
import { LOCALE_DICT } from './localization';

describe('LOCALE_DICT key parity', () => {
  it('keeps ESP and ING keys aligned', () => {
    expect(Object.keys(LOCALE_DICT.ESP).sort()).toEqual(Object.keys(LOCALE_DICT.ING).sort());
  });
});
