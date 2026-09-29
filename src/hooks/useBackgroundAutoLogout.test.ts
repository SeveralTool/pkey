/**
 * @fileoverview Background auto-lock: INSTANT on background + resume, 1M via wall-clock.
 */
import { act, renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { useBackgroundAutoLogout } from './useBackgroundAutoLogout';
import { AUTO_LOGOUT_1M_MS, INSTANT_RESUME_GRACE_MS } from '../utils/autoLogoutPolicy';
import { setAndroidWebAccessKeepAlive } from '../utils/webAccessLock';
import {
  beginExternalUiSession,
  endExternalUiSession,
  isExternalUiSession,
  suppressAutoLogout,
} from '../utils/autoLogoutGuard';

describe('useBackgroundAutoLogout', () => {
  const listeners = new Set<(state: AppStateStatus) => void>();
  let currentState: AppStateStatus = 'active';

  const emit = (next: AppStateStatus): void => {
    currentState = next;
    act(() => {
      listeners.forEach((cb) => cb(next));
    });
  };

  beforeEach(() => {
    listeners.clear();
    currentState = 'active';
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
      listeners.add(handler);
      const sub: NativeEventSubscription = {
        remove: () => {
          listeners.delete(handler);
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

  afterEach(async () => {
    setAndroidWebAccessKeepAlive(false);
    let guard = 0;
    while (isExternalUiSession() && guard < 5) {
      guard += 1;
      await endExternalUiSession(() => 'active');
    }
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('locks on resume after 1M even if the JS timer never fires', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    const onLogout = jest.fn();

    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: '1M', onLogout }));

    emit('background');
    expect(onLogout).not.toHaveBeenCalled();

    jest.setSystemTime(1_000_000 + AUTO_LOGOUT_1M_MS + 10_000);
    emit('active');
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not lock on resume before 1M elapses', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    const onLogout = jest.fn();

    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: '1M', onLogout }));

    emit('background');
    jest.setSystemTime(1_000_000 + AUTO_LOGOUT_1M_MS - 1);
    emit('active');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('does not treat inactive as leave for 1M', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    const onLogout = jest.fn();

    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: '1M', onLogout }));

    emit('inactive');
    jest.setSystemTime(1_000_000 + AUTO_LOGOUT_1M_MS + 10_000);
    emit('active');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('locks immediately on background when set to INSTANT', () => {
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: 'INSTANT', onLogout }));
    emit('background');
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not double-lock INSTANT when background is followed by resume', () => {
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: 'INSTANT', onLogout }));
    emit('inactive');
    emit('background');
    expect(onLogout).toHaveBeenCalledTimes(1);
    emit('active');
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('locks INSTANT on resume after inactive when background never fired', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: 'INSTANT', onLogout }));

    emit('inactive');
    expect(onLogout).not.toHaveBeenCalled();

    jest.setSystemTime(1_000_000 + INSTANT_RESUME_GRACE_MS);
    emit('active');
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it('does not lock INSTANT on a short inactive overlay blip', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: 'INSTANT', onLogout }));

    emit('inactive');
    jest.setSystemTime(1_000_000 + INSTANT_RESUME_GRACE_MS - 1);
    emit('active');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('does not lock INSTANT on resume during a share/OS-auth session', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: 'INSTANT', onLogout }));

    beginExternalUiSession();
    emit('inactive');
    emit('background');
    jest.setSystemTime(1_000_000 + INSTANT_RESUME_GRACE_MS + 5_000);
    emit('active');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('does not lock INSTANT on resume while auto-logout is suppressed', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: 'INSTANT', onLogout }));

    suppressAutoLogout(60_000);
    emit('inactive');
    jest.setSystemTime(1_000_000 + 5_000);
    emit('active');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('does not install a listener when auto-logout is NEVER', () => {
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: 'NEVER', onLogout }));
    expect(AppState.addEventListener).not.toHaveBeenCalled();
    emit('background');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('does not lock on background while Android web-access keep-alive is on', () => {
    setAndroidWebAccessKeepAlive(true);
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: 'INSTANT', onLogout }));
    emit('background');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('does not lock INSTANT on inactive resume while Android web-access keep-alive is on', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    setAndroidWebAccessKeepAlive(true);
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: 'INSTANT', onLogout }));
    emit('inactive');
    jest.setSystemTime(1_000_000 + INSTANT_RESUME_GRACE_MS + 5_000);
    emit('active');
    expect(onLogout).not.toHaveBeenCalled();
  });

  it('does not lock on 1M resume while Android web-access keep-alive is on', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1_000_000);
    setAndroidWebAccessKeepAlive(true);
    const onLogout = jest.fn();
    renderHook(() => useBackgroundAutoLogout({ isLogged: true, autoLogout: '1M', onLogout }));
    emit('background');
    jest.setSystemTime(1_000_000 + AUTO_LOGOUT_1M_MS + 10_000);
    emit('active');
    expect(onLogout).not.toHaveBeenCalled();
  });
});
