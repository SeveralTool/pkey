/**
 * @fileoverview Centralized utility for loading `react-native-tcp-socket`.
 *
 * This module ensures that `react-native-tcp-socket` is only loaded once
 * and its availability checked correctly across all dependent modules (e.g.,
 * `SyncServer` and `SyncWebServer`). It lazy-loads the module to allow
 * the app to run in Expo Go without crashing, disabling only the sync features.
 */

let TcpSocket: any = null;

/**
 * Lazily loads and returns the `react-native-tcp-socket` module.
 * Returns null if the module is not available (e.g., in Expo Go or if there's
 * a native linking issue).
 */
export const getNativeTcpSocket = () => {
  if (TcpSocket) return TcpSocket;
  try {
    const requiredModule = require('react-native-tcp-socket');
    TcpSocket = requiredModule.default || requiredModule;
    // console.log("NATIVE_TCP_SOCKET: Loaded", { typeOf: typeof TcpSocket, isTruthy: !!TcpSocket });
  } catch (e) {
    // console.log("NATIVE_TCP_SOCKET: Failed to load", { error: e.message });
    TcpSocket = null;
  }
  return TcpSocket;
};
