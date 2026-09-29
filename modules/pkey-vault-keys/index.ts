import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

export type HardwareBackedKind = 'strongbox' | 'tee' | 'keychain' | 'none';

export interface CompromisedDeviceReport {
  compromised: boolean;
  signals: string[];
}

export interface PkeyVaultKeysModule {
  storeUnlockBundle(json: string, promptTitle: string): Promise<void>;
  loadUnlockBundle(promptTitle: string): Promise<string | null>;
  clearUnlockBundle(): Promise<void>;
  hasUnlockBundle(): Promise<boolean>;
  isHardwareBacked(): Promise<HardwareBackedKind>;
  detectCompromisedDevice(): Promise<CompromisedDeviceReport>;
  storeDeviceSecret(hex: string, promptTitle: string): Promise<void>;
  loadDeviceSecret(promptTitle: string): Promise<string | null>;
  clearDeviceSecret(): Promise<void>;
  hasDeviceSecret(): Promise<boolean>;
}

let loaded: PkeyVaultKeysModule | null = null;

try {
  loaded = requireNativeModule<PkeyVaultKeysModule>('PkeyVaultKeys');
} catch {
  loaded = null;
}

export function isPkeyVaultKeysAvailable(): boolean {
  return loaded != null && (Platform.OS === 'android' || Platform.OS === 'ios');
}

export default loaded;
