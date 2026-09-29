import { PermissionsAndroid, Platform } from 'react-native';
import { suppressAutoLogout, QR_SCANNER_GRACE_MS } from './autoLogoutGuard';

export type WifiSsidPermissionStatus = 'granted' | 'denied' | 'blocked';

type LocationPermissionResult = {
  granted: boolean;
  canAskAgain: boolean;
};

type LocationApi = {
  getForegroundPermissionsAsync: () => Promise<LocationPermissionResult>;
  requestForegroundPermissionsAsync: () => Promise<LocationPermissionResult>;
};

let locationApi: LocationApi | null | undefined;

const NEARBY_WIFI_DEVICES = 'android.permission.NEARBY_WIFI_DEVICES';

/** Android 13+ can read SSID with nearby-Wi-Fi instead of location. */
export function usesNearbyWifiDevicesPermission(): boolean {
  return Platform.OS === 'android' && Number(Platform.Version) >= 33;
}

/**
 * Lazy-loads expo-location so a JS reload against an older native binary
 * does not crash the whole app (ExpoLocation is missing until a rebuild).
 */
function getLocationApi(): LocationApi | null {
  if (locationApi !== undefined) return locationApi;
  try {
    const loaded = require('expo-location') as LocationApi & { default?: LocationApi };
    const api = loaded.default ?? loaded;
    if (
      typeof api.getForegroundPermissionsAsync !== 'function' ||
      typeof api.requestForegroundPermissionsAsync !== 'function'
    ) {
      locationApi = null;
      return null;
    }
    locationApi = api;
    return locationApi;
  } catch (e) {
    console.warn('[wifiSsidPermission] expo-location native module unavailable:', e);
    locationApi = null;
    return null;
  }
}

function statusFromPermission(granted: boolean, canAskAgain: boolean): WifiSsidPermissionStatus {
  if (granted) return 'granted';
  if (!canAskAgain) return 'blocked';
  return 'denied';
}

function statusFromNearbyResult(result: string): WifiSsidPermissionStatus {
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

async function getNearbyWifiStatus(): Promise<WifiSsidPermissionStatus> {
  try {
    const granted = await PermissionsAndroid.check(NEARBY_WIFI_DEVICES);
    return granted ? 'granted' : 'denied';
  } catch (e) {
    console.warn('[wifiSsidPermission] NEARBY_WIFI_DEVICES check failed:', e);
    return 'denied';
  }
}

async function requestNearbyWifi(): Promise<WifiSsidPermissionStatus> {
  try {
    const result = await PermissionsAndroid.request(NEARBY_WIFI_DEVICES);
    return statusFromNearbyResult(result);
  } catch (e) {
    console.warn('[wifiSsidPermission] NEARBY_WIFI_DEVICES request failed:', e);
    return 'blocked';
  }
}

/** True when a native API can request the SSID permission on this binary. */
export function isWifiSsidNativeAvailable(): boolean {
  if (usesNearbyWifiDevicesPermission()) return true;
  return getLocationApi() != null;
}

/** Reads current SSID-related permission without prompting. */
export async function getWifiSsidPermissionStatus(): Promise<WifiSsidPermissionStatus> {
  if (usesNearbyWifiDevicesPermission()) {
    return getNearbyWifiStatus();
  }
  const Location = getLocationApi();
  if (!Location) return 'denied';
  try {
    const current = await Location.getForegroundPermissionsAsync();
    return statusFromPermission(current.granted, current.canAskAgain);
  } catch (e) {
    console.warn('[wifiSsidPermission] getForegroundPermissionsAsync failed:', e);
    return 'denied';
  }
}

/**
 * Requests the platform permission needed so NetInfo can expose the Wi-Fi SSID.
 * Android 13+: nearby Wi-Fi devices. Older Android / iOS: location-when-in-use.
 * Suppresses auto-logout while the OS permission sheet is visible.
 */
export async function ensureWifiSsidPermission(): Promise<WifiSsidPermissionStatus> {
  suppressAutoLogout(QR_SCANNER_GRACE_MS);

  if (usesNearbyWifiDevicesPermission()) {
    const current = await getNearbyWifiStatus();
    if (current === 'granted') return 'granted';
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
    const result = await requestNearbyWifi();
    suppressAutoLogout(QR_SCANNER_GRACE_MS);
    return result;
  }

  const Location = getLocationApi();
  if (!Location) return 'blocked';

  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.granted) return 'granted';
    if (!current.canAskAgain) return 'blocked';

    suppressAutoLogout(QR_SCANNER_GRACE_MS);
    const result = await Location.requestForegroundPermissionsAsync();
    suppressAutoLogout(QR_SCANNER_GRACE_MS);

    return statusFromPermission(result.granted, result.canAskAgain);
  } catch (e) {
    console.warn('[wifiSsidPermission] request failed (rebuild native client):', e);
    return 'blocked';
  }
}
