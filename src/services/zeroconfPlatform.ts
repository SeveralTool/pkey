/**
 * @fileoverview Shared react-native-zeroconf bootstrap for mDNS features.
 */

import { NativeModules } from 'react-native';

let ZeroconfClass: any = null;
let nativeChecked = false;
let nativeAvailable = false;

const isNativeZeroconfLinked = (): boolean => {
  if (!nativeChecked) {
    nativeAvailable = !!NativeModules.RNZeroconf;
    nativeChecked = true;
  }
  return nativeAvailable;
};

/** Lazily requires the JS Zeroconf class, or `null` if the package is missing. */
export const getZeroconfClass = () => {
  if (ZeroconfClass) return ZeroconfClass;
  try {
    const mod = require('react-native-zeroconf');
    ZeroconfClass = mod.default || mod;
  } catch {
    ZeroconfClass = null;
  }
  return ZeroconfClass;
};

/** True only when JS module AND native RNZeroconf module are both present. */
export const isZeroconfAvailable = (): boolean => {
  return !!getZeroconfClass() && isNativeZeroconfLinked();
};

/** Creates a Zeroconf instance, or `null` when mDNS is unavailable. */
export const createZeroconfInstance = (): any | null => {
  if (!isZeroconfAvailable()) return null;
  const Z = getZeroconfClass();
  if (!Z) return null;
  try {
    const instance = new Z();
    return instance || null;
  } catch {
    return null;
  }
};

/** Stops browse/publish on a Zeroconf instance (ignores errors). */
export const stopZeroconfInstance = (zeroconf: any): void => {
  if (!zeroconf) return;
  try {
    zeroconf.stop();
    zeroconf.removeDeviceListeners?.();
    zeroconf.removeAllListeners?.();
  } catch {
    /* ignore */
  }
};
