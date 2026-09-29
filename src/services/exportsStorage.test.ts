const mockGetFreeDiskStorageAsync = jest.fn();
const mockWriteAsStringAsync = jest.fn();
const mockGetInfoAsync = jest.fn();
const mockMakeDirectoryAsync = jest.fn();
const mockReadDirectoryAsync = jest.fn();
const mockDeleteAsync = jest.fn();

jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///docs/',
  cacheDirectory: 'file:///cache/',
  EncodingType: { UTF8: 'utf8', Base64: 'base64' },
  getFreeDiskStorageAsync: (...args: unknown[]) => mockGetFreeDiskStorageAsync(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWriteAsStringAsync(...args),
  getInfoAsync: (...args: unknown[]) => mockGetInfoAsync(...args),
  makeDirectoryAsync: (...args: unknown[]) => mockMakeDirectoryAsync(...args),
  readDirectoryAsync: (...args: unknown[]) => mockReadDirectoryAsync(...args),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
}));

jest.mock('expo-sharing', () => ({
  isAvailableAsync: jest.fn(async () => true),
  shareAsync: jest.fn(async () => undefined),
}));

const mockBeginExternalUiSession = jest.fn();
const mockEndExternalUiSession = jest.fn(async () => undefined);
jest.mock('../utils/autoLogoutGuard', () => ({
  suppressAutoLogout: jest.fn(),
  beginExternalUiSession: (...args: unknown[]) => mockBeginExternalUiSession(...args),
  endExternalUiSession: (...args: unknown[]) => mockEndExternalUiSession(...args),
}));

import {
  assertEnoughDiskSpace,
  buildExportFilename,
  deleteOldestExportFile,
  EXPORT_DISK_HEADROOM_BYTES,
  EXPORT_MAX_FILES,
  ExportError,
  formatExportBytes,
  formatExportTimestamp,
  isNoSpaceError,
  listExportFiles,
  parseExportFilename,
  purgeEphemeralExports,
  purgePlaintextExports,
  shareExportFile,
  writeEphemeralExportFile,
  writeExportFile,
} from './exportsStorage';

describe('exportsStorage naming', () => {
  const fixed = new Date(2026, 6, 31, 18, 6, 45); // local Jul 31 2026 18:06:45

  it('formats local timestamp', () => {
    const { date, time } = formatExportTimestamp(fixed);
    expect(date).toBe('20260731');
    expect(time).toBe('180645');
  });

  it('builds pkey-YYYYMMDD-HHmmss.ext without format in the stem', () => {
    expect(buildExportFilename('json', fixed)).toBe('pkey-20260731-180645.json');
    expect(buildExportFilename('csv', fixed)).toBe('pkey-20260731-180645.csv');
    expect(buildExportFilename('pkey', fixed)).toBe('pkey-20260731-180645.pkey');
  });

  it('adds collision suffix before extension', () => {
    expect(buildExportFilename('json', fixed, 2)).toBe('pkey-20260731-180645-2.json');
  });

  it('parses valid names and rejects junk', () => {
    expect(parseExportFilename('pkey-20260731-180645.json')).toEqual({
      date: '20260731',
      time: '180645',
      suffix: undefined,
      ext: 'json',
    });
    expect(parseExportFilename('pkey-20260731-180645-3.pkey')?.suffix).toBe(3);
    expect(parseExportFilename('pkey-json-20260731-180645.json')).toBeNull();
    expect(parseExportFilename('random.txt')).toBeNull();
  });
});

describe('formatExportBytes', () => {
  it('formats common sizes', () => {
    expect(formatExportBytes(0)).toBe('');
    expect(formatExportBytes(512)).toBe('512 B');
    expect(formatExportBytes(2048)).toBe('2.0 KB');
    expect(formatExportBytes(2 * 1024 * 1024)).toBe('2.0 MB');
  });
});

describe('isNoSpaceError', () => {
  it('detects ENOSPC-like messages', () => {
    expect(isNoSpaceError(new Error('ENOSPC: no space left'))).toBe(true);
    expect(isNoSpaceError(new Error('Disk full'))).toBe(true);
    expect(isNoSpaceError(new Error('permission denied'))).toBe(false);
  });
});

describe('assertEnoughDiskSpace', () => {
  beforeEach(() => {
    mockGetFreeDiskStorageAsync.mockReset();
  });

  it('throws no_space when free is below payload + headroom', async () => {
    mockGetFreeDiskStorageAsync.mockResolvedValue(EXPORT_DISK_HEADROOM_BYTES);
    await expect(assertEnoughDiskSpace(1)).rejects.toMatchObject({ code: 'no_space' });
  });

  it('passes when free covers payload and headroom', async () => {
    mockGetFreeDiskStorageAsync.mockResolvedValue(EXPORT_DISK_HEADROOM_BYTES + 100);
    await expect(assertEnoughDiskSpace(50)).resolves.toBeUndefined();
  });

  it('skips when free space API fails', async () => {
    mockGetFreeDiskStorageAsync.mockRejectedValue(new Error('unsupported'));
    await expect(assertEnoughDiskSpace(999_999_999)).resolves.toBeUndefined();
  });
});

describe('writeExportFile error mapping', () => {
  beforeEach(() => {
    mockGetInfoAsync.mockReset();
    mockMakeDirectoryAsync.mockReset();
    mockWriteAsStringAsync.mockReset();
    mockReadDirectoryAsync.mockReset();
    mockReadDirectoryAsync.mockResolvedValue([]);
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (String(uri).endsWith('/exports/')) {
        return { exists: true, isDirectory: true };
      }
      return { exists: false };
    });
  });

  it('maps OS no-space errors to ExportError no_space', async () => {
    mockWriteAsStringAsync.mockRejectedValue(new Error('ENOSPC'));
    await expect(writeExportFile('csv', 'a,b\n')).rejects.toBeInstanceOf(ExportError);
    await expect(writeExportFile('csv', 'a,b\n')).rejects.toMatchObject({ code: 'no_space' });
  });

  it('maps other write failures to write_failed', async () => {
    mockWriteAsStringAsync.mockRejectedValue(new Error('EPERM'));
    await expect(writeExportFile('json', '{}')).rejects.toMatchObject({ code: 'write_failed' });
  });
});

describe('writeExportFile limit cap', () => {
  const fullList = Array.from(
    { length: EXPORT_MAX_FILES },
    (_, i) => `pkey-20260731-${String(180001 + i).padStart(6, '0')}.json`
  );

  let present: string[];

  beforeEach(() => {
    present = [];
    mockGetInfoAsync.mockReset();
    mockMakeDirectoryAsync.mockReset();
    mockWriteAsStringAsync.mockReset();
    mockReadDirectoryAsync.mockReset();
    mockReadDirectoryAsync.mockImplementation(async () => present);
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (String(uri).endsWith('/exports/')) {
        return { exists: true, isDirectory: true };
      }
      const name = String(uri).split('/').pop() ?? '';
      return present.includes(name)
        ? { exists: true, isDirectory: false, size: 10, modificationTime: 100 }
        : { exists: false };
    });
  });

  it('blocks a new export when the device already has 10 files', async () => {
    present = fullList;
    await expect(writeExportFile('pkey', 'enc')).rejects.toMatchObject({ code: 'limit' });
  });

  it('does not write anything when blocked by the cap', async () => {
    present = fullList;
    await writeExportFile('pkey', 'enc').catch(() => undefined);
    expect(mockWriteAsStringAsync).not.toHaveBeenCalled();
  });

  it('allows a new export when below the cap', async () => {
    present = fullList.slice(0, EXPORT_MAX_FILES - 1);
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    const written = await writeExportFile('json', '{}');
    expect(written.filename).toMatch(/^pkey-(.*)\.json$/);
    expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);
  });

  it('counts every extension towards the same cap', async () => {
    present = [...fullList.slice(0, 8), 'pkey-20260731-181100.csv', 'pkey-20260731-181200.pkey'];
    await expect(writeExportFile('pkey', 'enc')).rejects.toMatchObject({ code: 'limit' });
  });
});

describe('deleteOldestExportFile', () => {
  beforeEach(() => {
    mockGetInfoAsync.mockReset();
    mockMakeDirectoryAsync.mockReset();
    mockWriteAsStringAsync.mockReset();
    mockReadDirectoryAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (String(uri).endsWith('/exports/')) {
        return { exists: true, isDirectory: true };
      }
      return { exists: true, isDirectory: false, size: 10, modificationTime: 100 };
    });
  });

  it('removes the oldest file and returns it', async () => {
    mockReadDirectoryAsync.mockResolvedValue([
      'pkey-20260731-180001.json',
      'pkey-20260730-090000.csv',
    ]);
    const removed = await deleteOldestExportFile();
    expect(removed?.filename).toBe('pkey-20260730-090000.csv');
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///docs/exports/pkey-20260730-090000.csv', {
      idempotent: true,
    });
  });

  it('resolves to null when there are no exports', async () => {
    mockReadDirectoryAsync.mockResolvedValue([]);
    await expect(deleteOldestExportFile()).resolves.toBeNull();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });
});

describe('writeEphemeralExportFile', () => {
  const fullList = Array.from(
    { length: EXPORT_MAX_FILES },
    (_, i) => `pkey-20260731-${String(180001 + i).padStart(6, '0')}.pkey`
  );

  let docsPresent: string[];
  let cachePresent: string[];

  beforeEach(() => {
    docsPresent = [];
    cachePresent = [];
    mockGetInfoAsync.mockReset();
    mockMakeDirectoryAsync.mockReset();
    mockWriteAsStringAsync.mockReset();
    mockReadDirectoryAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockWriteAsStringAsync.mockResolvedValue(undefined);
    mockReadDirectoryAsync.mockImplementation(async (uri: string) => {
      if (String(uri).includes('/export-tmp/')) return cachePresent;
      return docsPresent;
    });
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      const path = String(uri);
      if (path.endsWith('/exports/') || path.endsWith('/export-tmp/')) {
        return { exists: true, isDirectory: true };
      }
      const name = path.split('/').pop() ?? '';
      const inCache = path.includes('/export-tmp/');
      const present = inCache ? cachePresent : docsPresent;
      return present.includes(name)
        ? { exists: true, isDirectory: false, size: 10, modificationTime: 100 }
        : { exists: false };
    });
  });

  it('writes to cacheDirectory, not Documents/exports', async () => {
    const written = await writeEphemeralExportFile('csv', 'a,b\n');
    expect(written.uri).toMatch(/^file:\/\/\/cache\/export-tmp\/pkey-.*\.csv$/);
    expect(mockWriteAsStringAsync).toHaveBeenCalledTimes(1);
    expect(String(mockWriteAsStringAsync.mock.calls[0][0])).toContain('/cache/export-tmp/');
    expect(String(mockWriteAsStringAsync.mock.calls[0][0])).not.toContain('/docs/exports/');
  });

  it('does not count toward the persistent export cap', async () => {
    docsPresent = fullList;
    await expect(writeEphemeralExportFile('json', '{}')).resolves.toMatchObject({
      filename: expect.stringMatching(/^pkey-.*\.json$/),
    });
  });

  it('does not appear in listExportFiles', async () => {
    docsPresent = ['pkey-20260731-180001.pkey'];
    cachePresent = ['pkey-20260731-180002.csv'];
    const listed = await listExportFiles();
    expect(listed.map((f) => f.filename)).toEqual(['pkey-20260731-180001.pkey']);
  });
});

describe('purgePlaintextExports', () => {
  let present: string[];

  beforeEach(() => {
    present = [];
    mockGetInfoAsync.mockReset();
    mockMakeDirectoryAsync.mockReset();
    mockReadDirectoryAsync.mockReset();
    mockDeleteAsync.mockReset();
    mockReadDirectoryAsync.mockImplementation(async () => present);
    mockGetInfoAsync.mockImplementation(async (uri: string) => {
      if (String(uri).endsWith('/exports/')) {
        return { exists: true, isDirectory: true };
      }
      const name = String(uri).split('/').pop() ?? '';
      return present.includes(name)
        ? { exists: true, isDirectory: false, size: 10, modificationTime: 100 }
        : { exists: false };
    });
    mockDeleteAsync.mockImplementation(async (uri: string) => {
      const name = String(uri).split('/').pop() ?? '';
      present = present.filter((n) => n !== name);
    });
  });

  it('deletes csv/json leftovers and keeps .pkey', async () => {
    present = [
      'pkey-20260731-180001.pkey',
      'pkey-20260731-180002.csv',
      'pkey-20260731-180003.json',
    ];
    await purgePlaintextExports();
    expect(present).toEqual(['pkey-20260731-180001.pkey']);
    expect(mockDeleteAsync).toHaveBeenCalledTimes(2);
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///docs/exports/pkey-20260731-180002.csv', {
      idempotent: true,
    });
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///docs/exports/pkey-20260731-180003.json', {
      idempotent: true,
    });
  });
});

describe('purgeEphemeralExports', () => {
  beforeEach(() => {
    mockGetInfoAsync.mockReset();
    mockDeleteAsync.mockReset();
  });

  it('removes the cache export-tmp directory when it exists', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: true, isDirectory: true });
    await purgeEphemeralExports();
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/export-tmp/', { idempotent: true });
  });

  it('is a no-op when the cache folder is missing', async () => {
    mockGetInfoAsync.mockResolvedValue({ exists: false });
    await purgeEphemeralExports();
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });
});

describe('shareExportFile', () => {
  beforeEach(() => {
    mockBeginExternalUiSession.mockClear();
    mockEndExternalUiSession.mockClear();
    mockEndExternalUiSession.mockResolvedValue(undefined);
  });

  it('opens an external UI session around the share sheet', async () => {
    await shareExportFile('file:///cache/export-tmp/pkey-20260731-180645.json', 'json');
    expect(mockBeginExternalUiSession).toHaveBeenCalledTimes(1);
    expect(mockEndExternalUiSession).toHaveBeenCalledTimes(1);
  });

  it('ends the session even when share fails', async () => {
    const Sharing = require('expo-sharing') as {
      shareAsync: jest.Mock;
    };
    Sharing.shareAsync.mockRejectedValueOnce(new Error('cancelled'));
    await expect(
      shareExportFile('file:///cache/export-tmp/pkey-20260731-180645.json', 'json')
    ).rejects.toMatchObject({ code: 'share_unavailable' });
    expect(mockEndExternalUiSession).toHaveBeenCalledTimes(1);
  });
});
