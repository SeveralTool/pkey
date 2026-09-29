/**
 * @fileoverview Runtime detection for native OS notification support.
 */
import { Platform } from 'react-native';
import { isRunningInExpoGo } from 'expo';

/**
 * Expo Go (SDK 53+) cannot use expo-notifications on Android without throwing.
 * Development/production builds support local OS notifications.
 */
export const canUseNativeOsNotifications = (): boolean => {
  if (Platform.OS === 'web') return false;
  if (isRunningInExpoGo()) return false;
  return Platform.OS === 'android' || Platform.OS === 'ios';
};
