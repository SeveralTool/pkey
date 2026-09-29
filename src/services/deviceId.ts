/**
 * @fileoverview Stable per-install device identifier for mDNS uniqueness.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecureRandomHex } from '../utils/secureRandom';

/** AsyncStorage key for the stable per-install device id. */
export const SK_DEVICE_ID = '@pkey/sync_device_id';

/** Returns the existing install id or creates and persists a new one. */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await AsyncStorage.getItem(SK_DEVICE_ID);
  if (existing) return existing;
  const id = getSecureRandomHex(16);
  await AsyncStorage.setItem(SK_DEVICE_ID, id);
  return id;
}
