import { InteractionManager } from 'react-native';

/**
 * Wait until the OS biometric dialog has fully dismissed and the activity
 * layout has settled — otherwise the password sheet mounts under the keyboard
 * and renders as a clipped gray strip.
 */
export const waitForPostBiometricUi = (ms = 350): Promise<void> =>
  new Promise((resolve) => {
    InteractionManager.runAfterInteractions(() => {
      setTimeout(resolve, ms);
    });
  });
