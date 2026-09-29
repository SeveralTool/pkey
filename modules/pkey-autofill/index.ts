import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

export interface AutofillCacheEntry {
  id: string;
  title: string;
  username: string;
  password: string;
  /** Normalized hosts (e.g. github.com) and optional android package names. */
  domains: string[];
  packages: string[];
}

export interface PkeyAutofillModule {
  syncCache(entriesJson: string): Promise<void>;
  clearCache(): Promise<void>;
  openAutofillSettings(): Promise<void>;
  isAutofillSupported(): Promise<boolean>;
  isServiceEnabled(): Promise<boolean>;
}

let loaded: PkeyAutofillModule | null = null;

if (Platform.OS === 'android') {
  try {
    loaded = requireNativeModule<PkeyAutofillModule>('PkeyAutofill');
  } catch {
    loaded = null;
  }
}

/** Native module instance, or `null` when unavailable (iOS / Expo Go). */
export default loaded;
