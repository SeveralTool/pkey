/**
 * @fileoverview Platform keep-alive helpers for the LAN web sync server.
 *
 * Android: sticky foreground service via `pkey-web-access` (OS requires an
 * ongoing notification while the service runs — kept minimal/silent).
 * iOS: UIBackgroundTask only (no sticky local notification).
 * Product OS alerts for new browser syncs are fired from SyncContext, not here.
 */
import { AppState, Platform } from 'react-native';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import PkeyWebAccess, {
  addBackgroundTimeExpiringListener,
  getWebAccessKeepAlivePlatform,
} from 'pkey-web-access';
import { getLocale, type LocaleStrings } from '../constants/localization';

const KEEP_AWAKE_TAG = 'pkey-web-access';

const nativeModule = PkeyWebAccess as {
  startForegroundService?: (title: string, body: string) => Promise<void>;
  stopForegroundService?: () => Promise<void>;
} | null;

let cachedLabels: Pick<LocaleStrings, 'web_fg_service_minimal_title' | 'web_fg_service_minimal_body'> | null =
  null;

/** Caches localized strings for the Android-required FG service notification. */
export const setWebForegroundLabels = (language?: string): void => {
  const t = getLocale(language);
  cachedLabels = {
    web_fg_service_minimal_title: t.web_fg_service_minimal_title,
    web_fg_service_minimal_body: t.web_fg_service_minimal_body,
  };
};

async function setKeepAwake(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await activateKeepAwakeAsync(KEEP_AWAKE_TAG);
    } else {
      await deactivateKeepAwake(KEEP_AWAKE_TAG);
    }
  } catch {
    // Keep-awake is best-effort (web / Expo Go / unsupported).
  }
}

/**
 * Starts platform keep-alive for web access.
 * Android: FG service (minimal ongoing notification required by the OS).
 * iOS: background task only — no sticky notification.
 * No Expo sticky fallback.
 */
export const startWebForegroundService = async (_clientCount = 0): Promise<void> => {
  const labels = cachedLabels ?? getLocale();
  await setKeepAwake(true);

  if (Platform.OS === 'android' && nativeModule?.startForegroundService) {
    await nativeModule.startForegroundService(
      labels.web_fg_service_minimal_title,
      labels.web_fg_service_minimal_body
    );
  } else if (Platform.OS === 'ios' && nativeModule?.startForegroundService) {
    // iOS path starts UIBackgroundTask; title/body unused (no local notification).
    await nativeModule.startForegroundService(
      labels.web_fg_service_minimal_title,
      labels.web_fg_service_minimal_body
    );
  }
};

/** @deprecated Client-count status notifications removed — no-op. */
export const updateWebForegroundNotification = async (_clientCount: number): Promise<void> => {
  // Intentionally empty: product OS alerts fire only when a browser newly syncs.
};

/** Stops the native keep-alive helper. */
export const stopWebForegroundService = async (): Promise<void> => {
  await setKeepAwake(false);

  if (nativeModule?.stopForegroundService) {
    await nativeModule.stopForegroundService();
  }
};

/**
 * Re-assert keep-alive when the app backgrounds with web access enabled.
 * Android renews the FG service; iOS renews the UIBackgroundTask.
 */
export const bindWebForegroundAppState = (
  webEnabled: boolean,
  _getClientCount: () => number = () => 0
): (() => void) => {
  if (Platform.OS !== 'android' && Platform.OS !== 'ios') {
    return () => {};
  }

  const sub = AppState.addEventListener('change', (state: string) => {
    if (!webEnabled) return;
    if (state === 'background' || state === 'inactive') {
      startWebForegroundService().catch(() => {});
    }
  });

  const expireSub = addBackgroundTimeExpiringListener(() => {
    console.info('[WebForegroundService] iOS background grace period expiring');
  });

  return () => {
    sub.remove();
    expireSub.remove();
  };
};

/**
 * True when a native keep-alive path is linked (Android FG service or iOS
 * background-task module).
 */
export const isNativeForegroundServiceAvailable = (): boolean =>
  getWebAccessKeepAlivePlatform() != null;

/** Which keep-alive UX string to show in the web-access card. */
export type WebKeepAliveMode = 'android-native' | 'android-fallback' | 'ios-native' | 'none';

export const getWebKeepAliveMode = (): WebKeepAliveMode => {
  const platform = getWebAccessKeepAlivePlatform();
  if (platform === 'android') return 'android-native';
  if (platform === 'ios' || Platform.OS === 'ios') return 'ios-native';
  // Fallback sticky notifications were removed — no android-fallback mode.
  return 'none';
};
