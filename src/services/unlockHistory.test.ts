import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getLastSuccessfulUnlock,
  getUnlockHistory,
  recordUnlockEvent,
} from './unlockHistory';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

describe('unlockHistory', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('persists successful unlock as last unlock and history', async () => {
    await recordUnlockEvent('password', true, '2026-01-01T00:00:00.000Z');
    await recordUnlockEvent('biometrics', false, '2026-01-02T00:00:00.000Z');

    const last = await getLastSuccessfulUnlock();
    expect(last).toEqual({
      at: '2026-01-01T00:00:00.000Z',
      method: 'password',
      ok: true,
    });

    const history = await getUnlockHistory();
    expect(history).toHaveLength(2);
    expect(history[0]?.ok).toBe(false);
    expect(history[1]?.method).toBe('password');
  });
});
