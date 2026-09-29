import { Platform } from 'react-native';
import { requireNativeModule } from 'expo-modules-core';

export interface PkeyCryptoModule {
  deriveRootKey(
    password: string,
    saltHex: string,
    memoryKiB: number,
    timeCost: number,
    parallelism: number
  ): Promise<string>;
  importKey(keyHex: string): Promise<string>;
  exportKey(handle: string): Promise<string>;
  hkdfExpand(handle: string, info: string): Promise<string>;
  encryptVault(handle: string, plaintextUtf8: string, aadUtf8: string): Promise<string>;
  decryptVault(handle: string, envelopeJson: string, aadUtf8: string): Promise<string | null>;
  dropKey(handle: string): Promise<void>;
  selfTestKdfKat(): Promise<boolean>;
  selfTestAeadKat(): Promise<boolean>;
  selfTestKat(): Promise<boolean>;
  hotPathCaps(): Promise<{ kdf: boolean; aead: boolean }> | { kdf: boolean; aead: boolean };
}

let loaded: PkeyCryptoModule | null = null;

try {
  loaded = requireNativeModule<PkeyCryptoModule>('PkeyCrypto');
} catch {
  loaded = null;
}

export function isPkeyCryptoAvailable(): boolean {
  return loaded != null && (Platform.OS === 'android' || Platform.OS === 'ios');
}

export default loaded;
