/**
 * @fileoverview Master password must stay out of React context and disk.
 */
import { act, renderHook } from '@testing-library/react-native';
import {
  clearMasterPassword,
  getMasterPassword,
  setMasterPassword,
  subscribeMasterPassword,
  useMasterPasswordInput,
} from './masterPasswordVault';

afterEach(() => {
  clearMasterPassword();
});

describe('masterPasswordVault', () => {
  it('holds the value only in memory', () => {
    expect(getMasterPassword()).toBe('');
    setMasterPassword('hunter2');
    expect(getMasterPassword()).toBe('hunter2');
    clearMasterPassword();
    expect(getMasterPassword()).toBe('');
  });

  it('notifies subscribers on change and not on identical writes', () => {
    const fn = jest.fn();
    const unsub = subscribeMasterPassword(fn);
    setMasterPassword('a');
    setMasterPassword('a');
    setMasterPassword('b');
    expect(fn).toHaveBeenCalledTimes(2);
    unsub();
    setMasterPassword('c');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('useMasterPasswordInput mirrors the vault and can clear on unmount', () => {
    const { result, unmount } = renderHook(() => useMasterPasswordInput({ clearOnUnmount: true }));
    expect(result.current[0]).toBe('');

    act(() => {
      result.current[1]('secret');
    });
    expect(result.current[0]).toBe('secret');
    expect(getMasterPassword()).toBe('secret');

    unmount();
    expect(getMasterPassword()).toBe('');
  });
});
