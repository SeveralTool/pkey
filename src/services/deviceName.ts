/**
 * @fileoverview Human-readable default device labels for mDNS and migration.
 */

import { Platform } from 'react-native';

/** Platform-based default label used when no custom device name is set. */
export const getDefaultDeviceName = (): string => {
  if (Platform.OS === 'ios') return 'PKEY iPhone';
  if (Platform.OS === 'android') return 'PKEY Android';
  return 'PKEY Device';
};
