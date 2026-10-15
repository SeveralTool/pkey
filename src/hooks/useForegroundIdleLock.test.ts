/**
 * @fileoverview Foreground idle lock duration helper (audit M5).
 */
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import {
  foregroundIdleLockMs,
  noteForegroundActivity,
  useForegroundIdleLock,
} from './useForegroundIdleLock';
import { consumeSilentPwaHoldRelease, setPwaResponseHold } from '../utils/autoLogoutGuard';

describe('foregroundIdleLockMs', () => {
  it('returns 0 for NEVER and omitted', () => {
    expect(foregroundIdleLockMs('NEVER')).toBe(0);
    expect(foregroundIdleLockMs(undefined)).toBe(0);
  });

  it('maps 1 / 5 / 15 minute settings', () => {
    expect(foregroundIdleLockMs('1M')).toBe(60_000);
    expect(foregroundIdleLockMs('5M')).toBe(5 * 60_000);
    expect(foregroundIdleLockMs('15M')).toBe(15 * 60_000);
  });
});

describe('useForegroundIdleLock', () => {
  const listeners = new Set<(state: AppStateStatus) => void>();
  let currentState: AppStateStatus = 'active';
  let unmountHook: (() => void) | undefined;
  let currentStateDescriptor: PropertyDescriptor | undefined;

  const emit = (next: AppStateStatus): void => {
    currentState = next;
    act(() => {
      listeners.forEach((cb) => cb(next));
    });
  };

  beforeEach(() => {
    listeners.clear();
    currentState = 'active';
    setPwaResponseHold(false);
    consumeSilentPwaHoldRelease();
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    currentStateDescriptor = Object.getOwnPropertyDescriptor(AppState, 'currentState');
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      const changeHandler = handler as (state: AppStateStatus) => void;
      listeners.add(changeHandler);
      const sub: NativeEventSubscription = {
        remove: () => {
          listeners.delete(changeHandler);
        },
      };
      return sub;
    });
    Object.defineProperty(AppState, 'currentState', {
      configurable: true,
      get: () => currentState,
    });
    (AppState.addEventListener as jest.Mock).mockClear();
  });

  afterEach(() => {
    unmountHook?.();
    unmountHook = undefined;
    setPwaResponseHold(false);
    consumeSilentPwaHoldRelease();
    jest.useRealTimers();
    jest.restoreAllMocks();
    if (currentStateDescriptor) {
      Object.defineProperty(AppState, 'currentState', currentStateDescriptor);
    }
  });

  function mount(isLogged: boolean, onLogout: () => void): void {
    const rendered = renderHook(() =>
      useForegroundIdleLock({ isLogged, foregroundIdleLock: '1M', onLogout })
    );
    unmountHook = rendered.unmount;
  }

  it('logs out after one minute of foreground idle', () => {
    const onLogout = jest.fn();
    mount(true, onLogout);
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('restarts the idle timer when the user touches the UI', () => {
    const onLogout = jest.fn();
    mount(true, onLogout);
    act(() => {
      jest.advanceTimersByTime(50_000);
    });
    act(() => {
      noteForegroundActivity();
    });
    act(() => {
      jest.advanceTimersByTime(50_000);
    });
    expect(onLogout).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(10_000);
    });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not log out while a PWA prompt is in flight, then locks after the hold ends', () => {
    setPwaResponseHold(true);
    const onLogout = jest.fn();
    mount(true, onLogout);
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(onLogout).not.toHaveBeenCalled();
    setPwaResponseHold(false);
    act(() => {
      jest.advanceTimersByTime(59_999);
    });
    expect(onLogout).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not log out on resume during a PWA prompt even if idle already elapsed', () => {
    const onLogout = jest.fn();
    mount(true, onLogout);
    setPwaResponseHold(true);
    jest.setSystemTime(1_000_000 + 120_000);
    emit('active');
    expect(onLogout).not.toHaveBeenCalled();
    setPwaResponseHold(false);
    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('logs out on resume when idle elapsed and no PWA prompt is waiting', () => {
    const onLogout = jest.fn();
    mount(true, onLogout);
    jest.setSystemTime(1_000_000 + 60_000);
    emit('active');
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not arm a timer when the vault is locked', () => {
    const onLogout = jest.fn();
    mount(false, onLogout);
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(120_000);
    });
    expect(onLogout).not.toHaveBeenCalled();
  });
});
