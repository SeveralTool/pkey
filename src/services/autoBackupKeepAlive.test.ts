/**
 * @fileoverview Android 1-minute keep-alive follows the device switch.
 */
import { Platform } from 'react-native';

const mockLoadPrefs = jest.fn();
const mockStart = jest.fn();
const mockStop = jest.fn();

jest.mock('./autoBackupPrefs', () => ({
  loadAutoBackupPrefs: (...args: unknown[]) => mockLoadPrefs(...args),
}));

jest.mock('../utils/publicUiPrefs', () => ({
  getCachedPublicUiPrefs: () => ({ language: 'ESP', theme: 'DARK' }),
}));

jest.mock('pkey-web-access', () => ({
  __esModule: true,
  default: {
    startBackupKeepAlive: (...args: unknown[]) => mockStart(...args),
    stopBackupKeepAlive: (...args: unknown[]) => mockStop(...args),
  },
}));

import { resetAutoBackupKeepAliveForTests, syncAutoBackupKeepAlive } from './autoBackupKeepAlive';

describe('syncAutoBackupKeepAlive', () => {
  const originalOs = Platform.OS;

  beforeEach(() => {
    mockLoadPrefs.mockReset();
    mockStart.mockReset();
    mockStop.mockReset();
    mockStart.mockResolvedValue(undefined);
    mockStop.mockResolvedValue(undefined);
    resetAutoBackupKeepAliveForTests();
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'android' });
  });

  afterAll(() => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => originalOs });
  });

  it('starts the foreground keep-alive for an enabled 1-minute interval', async () => {
    mockLoadPrefs.mockResolvedValue({ enabled: true, interval: '1M' });
    await syncAutoBackupKeepAlive();
    expect(mockStart).toHaveBeenCalledWith(
      'Respaldo cada 1 minuto',
      'PKEY sigue guardando una copia cifrada en Seguridad, sección de respaldos.'
    );
    expect(mockStop).not.toHaveBeenCalled();
  });

  it('stops the keep-alive for 24 h, 7 d, and a disabled switch', async () => {
    mockLoadPrefs.mockResolvedValue({ enabled: true, interval: '24H' });
    await syncAutoBackupKeepAlive();
    mockLoadPrefs.mockResolvedValue({ enabled: true, interval: '7D' });
    await syncAutoBackupKeepAlive();
    mockLoadPrefs.mockResolvedValue({ enabled: false, interval: '1M' });
    await syncAutoBackupKeepAlive();
    expect(mockStart).not.toHaveBeenCalled();
    expect(mockStop).toHaveBeenCalledTimes(3);
  });

  it('does nothing on iOS', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, get: () => 'ios' });
    await syncAutoBackupKeepAlive();
    expect(mockLoadPrefs).not.toHaveBeenCalled();
    expect(mockStart).not.toHaveBeenCalled();
  });
});
