/**
 * @fileoverview Notification share target for automatic `.pkey` backups.
 */
const mockResolve = jest.fn();
const mockListAuto = jest.fn();
const mockShare = jest.fn();

jest.mock('./exportsStorage', () => ({
  resolveListedExportFilename: (...args: unknown[]) => mockResolve(...args),
  listAutoBackupFiles: (...args: unknown[]) => mockListAuto(...args),
  shareExportFile: (...args: unknown[]) => mockShare(...args),
}));

import { AUTO_BACKUP_OPEN_TAB, shareAutoBackupFromNotification } from './autoBackupShare';

describe('shareAutoBackupFromNotification', () => {
  beforeEach(() => {
    mockResolve.mockReset();
    mockListAuto.mockReset();
    mockShare.mockReset();
    mockShare.mockResolvedValue(undefined);
  });

  it('shares the resolved file without asking for biometrics', async () => {
    mockResolve.mockResolvedValue('file:///docs/exports/pkey-auto-20261008-162400.pkey');
    await expect(shareAutoBackupFromNotification('pkey-auto-20261008-162400.pkey')).resolves.toBe(
      'shared'
    );
    expect(mockShare).toHaveBeenCalledWith(
      'file:///docs/exports/pkey-auto-20261008-162400.pkey',
      'pkey'
    );
    expect(mockListAuto).not.toHaveBeenCalled();
  });

  it('falls back to the newest automatic file when the named one is gone', async () => {
    mockResolve.mockResolvedValue(null);
    mockListAuto.mockResolvedValue([
      { uri: 'file:///docs/exports/pkey-auto-20261009-010000.pkey', filename: 'newer.pkey' },
    ]);
    await expect(shareAutoBackupFromNotification('pkey-auto-20261008-162400.pkey')).resolves.toBe(
      'shared'
    );
    expect(mockShare).toHaveBeenCalledWith(
      'file:///docs/exports/pkey-auto-20261009-010000.pkey',
      'pkey'
    );
  });

  it('does not share when no automatic file remains', async () => {
    mockResolve.mockResolvedValue(null);
    mockListAuto.mockResolvedValue([]);
    await expect(shareAutoBackupFromNotification('pkey-auto-20261008-162400.pkey')).resolves.toBe(
      'missing'
    );
    expect(mockShare).not.toHaveBeenCalled();
  });
});

describe('AUTO_BACKUP_OPEN_TAB', () => {
  it('opens the Security tab', () => {
    expect(AUTO_BACKUP_OPEN_TAB).toBe('security');
  });
});
