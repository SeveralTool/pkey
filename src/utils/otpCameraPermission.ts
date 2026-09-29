import { Camera } from 'expo-camera';
import { suppressAutoLogout, QR_SCANNER_GRACE_MS } from './autoLogoutGuard';

export type OtpCameraPermissionStatus = 'granted' | 'denied' | 'blocked';

/** Ensures camera access for OTP QR scan; suppresses auto-logout during OS permission UI. */
export async function ensureOtpCameraPermission(): Promise<OtpCameraPermissionStatus> {
  suppressAutoLogout(QR_SCANNER_GRACE_MS);

  const current = await Camera.getCameraPermissionsAsync();
  if (current.granted) return 'granted';
  if (!current.canAskAgain) return 'blocked';

  suppressAutoLogout(QR_SCANNER_GRACE_MS);
  const result = await Camera.requestCameraPermissionsAsync();
  suppressAutoLogout(QR_SCANNER_GRACE_MS);

  if (result.granted) return 'granted';
  if (!result.canAskAgain) return 'blocked';
  return 'denied';
}
