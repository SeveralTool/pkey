import { Camera } from 'expo-camera';
import { ensureOtpCameraPermission } from './otpCameraPermission';
import { suppressAutoLogout } from './autoLogoutGuard';

jest.mock('./autoLogoutGuard', () => ({
  suppressAutoLogout: jest.fn(),
}));

jest.mock('expo-camera', () => ({
  Camera: {
    getCameraPermissionsAsync: jest.fn(),
    requestCameraPermissionsAsync: jest.fn(),
  },
}));

describe('ensureOtpCameraPermission', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns granted when already granted', async () => {
    (Camera.getCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    });
    await expect(ensureOtpCameraPermission()).resolves.toBe('granted');
    expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled();
    expect(suppressAutoLogout).toHaveBeenCalled();
  });

  it('requests permission when undetermined', async () => {
    (Camera.getCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: true,
      status: 'undetermined',
    });
    (Camera.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: true,
      canAskAgain: true,
      status: 'granted',
    });
    await expect(ensureOtpCameraPermission()).resolves.toBe('granted');
    expect(Camera.requestCameraPermissionsAsync).toHaveBeenCalled();
  });

  it('returns blocked when cannot ask again', async () => {
    (Camera.getCameraPermissionsAsync as jest.Mock).mockResolvedValue({
      granted: false,
      canAskAgain: false,
      status: 'denied',
    });
    await expect(ensureOtpCameraPermission()).resolves.toBe('blocked');
    expect(Camera.requestCameraPermissionsAsync).not.toHaveBeenCalled();
  });
});
