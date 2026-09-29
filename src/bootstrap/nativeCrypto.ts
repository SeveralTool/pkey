/**
 * Schedules the native Argon2id/AEAD known-answer test after the first frame.
 * Vault I/O awaits {@link ensureNativeVaultCryptoProbed} so the gate stays stable
 * even if unlock happens before this schedule runs.
 */
import { InteractionManager } from 'react-native';
import { ensureNativeVaultCryptoProbed } from '../services/nativeVault';

/**
 * Runs the native KAT once the login screen has had a chance to paint.
 *
 * @returns Cancels the scheduled probe if the root unmounts first.
 */
export function scheduleNativeCryptoProbe(): () => void {
  const task = InteractionManager.runAfterInteractions(() => {
    void ensureNativeVaultCryptoProbed();
  });
  return () => {
    task.cancel();
  };
}
