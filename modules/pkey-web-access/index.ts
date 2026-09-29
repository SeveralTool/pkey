import { Platform } from 'react-native';
import { requireNativeModule, type EventSubscription } from 'expo-modules-core';

/**
 * Native bridge used to keep web access alive while the Expo app is
 * backgrounded (Android FG service with minimal required notification /
 * iOS UIBackgroundTask), plus Android process-level web-sync port reclaim.
 *
 * Product OS alerts for newly synced browsers are sent from JS
 * (`SyncContext`), not from this module's sticky/status path.
 */
export interface WebSyncPortReleaseResult {
  mapSize: number;
  serverCount: number;
  closedCount: number;
  closedIds: number[];
}

export interface PkeyWebAccessModule {
  /** Android: FG service (minimal OS-required noti). iOS: UIBackgroundTask only. */
  startForegroundService(title: string, body: string): Promise<void>;
  /** Stops the platform keep-alive helper. */
  stopForegroundService(): Promise<void>;
  /** Legacy no-op for status updates (product alerts are JS one-shots). */
  updateNotification(body: string): Promise<void>;
  /**
   * Closes orphan native listen sockets on [port] (Android).
   * iOS returns empty diagnostics (no-op reclaim).
   */
  releaseWebSyncPort(port: number): Promise<WebSyncPortReleaseResult>;
  addListener?(eventName: string, listener: () => void): EventSubscription;
}

let loaded: PkeyWebAccessModule | null = null;

try {
  loaded = requireNativeModule<PkeyWebAccessModule>('PkeyWebAccess');
} catch {
  loaded = null;
}

/** True when the native module is linked (Android or iOS dev/release build). */
export function isPkeyWebAccessAvailable(): boolean {
  return loaded != null;
}

/** Platform that owns the keep-alive implementation, if any. */
export function getWebAccessKeepAlivePlatform(): 'android' | 'ios' | null {
  if (!loaded) return null;
  if (Platform.OS === 'android') return 'android';
  if (Platform.OS === 'ios') return 'ios';
  return null;
}

/**
 * iOS fires this when the UIBackgroundTask grace period is about to end.
 * No-op subscription on Android / when the module is missing.
 */
export function addBackgroundTimeExpiringListener(listener: () => void): EventSubscription | { remove: () => void } {
  if (!loaded?.addListener || Platform.OS !== 'ios') {
    return { remove: () => {} };
  }
  return loaded.addListener('onBackgroundTimeExpiring', listener);
}

/**
 * Native module instance, or `null` when unavailable (e.g. Expo Go).
 */
export default loaded;
