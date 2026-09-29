import { PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';
import { ensureWifiSsidPermission, getWifiSsidPermissionStatus } from './wifiSsidPermission';
import { suppressAutoLogout } from './autoLogoutGuard';

jest.mock('./autoLogoutGuard', () => ({
  suppressAutoLogout: jest.fn(),
}));

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
}));

describe('ensureWifiSsidPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, 'OS', 'ios');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue('17.0');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns granted when already granted', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    });
    await expect(ensureWifiSsidPermission()).resolves.toBe('granted');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(suppressAutoLogout).toHaveBeenCalled();
  });

  it('requests permission when undetermined', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
    });
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    });
    await expect(ensureWifiSsidPermission()).resolves.toBe('granted');
    expect(Location.requestForegroundPermissionsAsync).toHaveBeenCalled();
  });

  it('returns blocked when cannot ask again', async () => {
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: 'denied',
    });
    await expect(ensureWifiSsidPermission()).resolves.toBe('blocked');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });
});

describe('Android 13 nearby Wi-Fi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.spyOn(Platform, 'Version', 'get').mockReturnValue(33);
    jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
    jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('does not call expo-location when nearby Wi-Fi is granted', async () => {
    (PermissionsAndroid.check as jest.Mock).mockResolvedValue(true);
    await expect(getWifiSsidPermissionStatus()).resolves.toBe('granted');
    await expect(ensureWifiSsidPermission()).resolves.toBe('granted');
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
    expect(PermissionsAndroid.request).not.toHaveBeenCalled();
  });

  it('requests nearby Wi-Fi when not granted', async () => {
    await expect(ensureWifiSsidPermission()).resolves.toBe('granted');
    expect(PermissionsAndroid.request).toHaveBeenCalledWith(
      'android.permission.NEARBY_WIFI_DEVICES'
    );
    expect(Location.requestForegroundPermissionsAsync).not.toHaveBeenCalled();
  });

  it('returns blocked on never-ask-again', async () => {
    (PermissionsAndroid.request as jest.Mock).mockResolvedValue(
      PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN
    );
    await expect(ensureWifiSsidPermission()).resolves.toBe('blocked');
  });
});
