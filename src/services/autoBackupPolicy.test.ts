/**
 * @fileoverview Pure auto-backup policy: interval, fingerprints, and force.
 */
import {
  AUTO_BACKUP_INTERVAL_MS,
  AUTO_BACKUP_MIN_INTERVAL_MS,
  autoBackupIntervalMs,
  decideAutoBackup,
  isAutoBackupInterval,
  nativeBackgroundIntervalMinutes,
  OS_BACKGROUND_TASK_MIN_MINUTES,
  wantsOneMinuteProcessKeepAlive,
} from './autoBackupPolicy';

const fp = { size: 100, mtime: 10 };
const other = { size: 101, mtime: 10 };
const now = 2_000_000_000_000;

function decide(
  patch: Partial<Parameters<typeof decideAutoBackup>[0]>
): ReturnType<typeof decideAutoBackup> {
  return decideAutoBackup({
    enabled: true,
    hasVault: true,
    now,
    lastSnapshotAt: now - AUTO_BACKUP_MIN_INTERVAL_MS,
    storedFingerprint: fp,
    currentFingerprint: other,
    minIntervalMs: AUTO_BACKUP_MIN_INTERVAL_MS,
    force: false,
    ...patch,
  });
}

describe('autoBackupIntervalMs', () => {
  it('maps 1M, 24H, and 7D to wall-clock gaps', () => {
    expect(autoBackupIntervalMs('1M')).toBe(60_000);
    expect(autoBackupIntervalMs('24H')).toBe(AUTO_BACKUP_INTERVAL_MS['24H']);
    expect(autoBackupIntervalMs('7D')).toBe(7 * AUTO_BACKUP_INTERVAL_MS['24H']);
    expect(isAutoBackupInterval('24H')).toBe(true);
    expect(isAutoBackupInterval('12H')).toBe(false);
  });
});

describe('wantsOneMinuteProcessKeepAlive', () => {
  it('holds the process only for an enabled 1-minute interval', () => {
    expect(wantsOneMinuteProcessKeepAlive(true, '1M')).toBe(true);
    expect(wantsOneMinuteProcessKeepAlive(false, '1M')).toBe(false);
    expect(wantsOneMinuteProcessKeepAlive(true, '24H')).toBe(false);
    expect(wantsOneMinuteProcessKeepAlive(true, '7D')).toBe(false);
  });
});

describe('nativeBackgroundIntervalMinutes', () => {
  it('clamps 1 minute to the OS floor and keeps 24 h and 7 d', () => {
    expect(nativeBackgroundIntervalMinutes('1M')).toBe(OS_BACKGROUND_TASK_MIN_MINUTES);
    expect(nativeBackgroundIntervalMinutes('24H')).toBe(24 * 60);
    expect(nativeBackgroundIntervalMinutes('7D')).toBe(7 * 24 * 60);
  });
});

describe('decideAutoBackup', () => {
  it('skips as disabled even when force is true', () => {
    expect(decide({ enabled: false, force: true })).toEqual({
      action: 'skip',
      reason: 'disabled',
    });
  });

  it('skips when there is no vault file', () => {
    expect(decide({ hasVault: false, lastSnapshotAt: null })).toEqual({
      action: 'skip',
      reason: 'no-vault',
    });
  });

  it('snapshots the first time lastSnapshotAt is null', () => {
    expect(
      decide({ lastSnapshotAt: null, currentFingerprint: fp, storedFingerprint: null })
    ).toEqual({ action: 'snapshot' });
  });

  it('snapshots when force is set even if the fingerprint is unchanged', () => {
    expect(decide({ force: true, currentFingerprint: fp, storedFingerprint: fp })).toEqual({
      action: 'snapshot',
    });
  });

  it('skips as unchanged when fingerprints match inside the 24 h window', () => {
    expect(
      decide({
        currentFingerprint: fp,
        storedFingerprint: fp,
        lastSnapshotAt: now - 60_000,
      })
    ).toEqual({ action: 'skip', reason: 'unchanged' });
  });

  it('snapshots when the interval elapsed even if the fingerprint is unchanged', () => {
    expect(
      decide({
        currentFingerprint: fp,
        storedFingerprint: fp,
        lastSnapshotAt: now - AUTO_BACKUP_MIN_INTERVAL_MS - 1,
      })
    ).toEqual({ action: 'snapshot' });
  });

  it('skips as interval when the fingerprint changed 23 h 59 min ago', () => {
    expect(
      decide({
        lastSnapshotAt: now - (AUTO_BACKUP_MIN_INTERVAL_MS - 60_000),
      })
    ).toEqual({ action: 'skip', reason: 'interval' });
  });

  it('snapshots when the fingerprint changed at exactly 24 h', () => {
    expect(decide({ lastSnapshotAt: now - AUTO_BACKUP_MIN_INTERVAL_MS })).toEqual({
      action: 'snapshot',
    });
  });

  it('snapshots when the fingerprint changed after 24 h', () => {
    expect(decide({ lastSnapshotAt: now - AUTO_BACKUP_MIN_INTERVAL_MS - 1 })).toEqual({
      action: 'snapshot',
    });
  });

  it('does not snapshot when now is NaN', () => {
    expect(decide({ now: Number.NaN })).toEqual({ action: 'skip', reason: 'interval' });
  });

  it('does not snapshot when lastSnapshotAt is negative', () => {
    expect(decide({ lastSnapshotAt: -1 })).toEqual({ action: 'skip', reason: 'interval' });
  });

  it('honours a 1 minute interval at the exact boundary', () => {
    expect(
      decide({
        minIntervalMs: 60_000,
        lastSnapshotAt: now - 59_000,
      })
    ).toEqual({ action: 'skip', reason: 'interval' });
    expect(
      decide({
        minIntervalMs: 60_000,
        lastSnapshotAt: now - 60_000,
      })
    ).toEqual({ action: 'snapshot' });
  });

  it('honours a 7 day interval', () => {
    const week = 7 * 24 * 60 * 60 * 1000;
    expect(
      decide({
        minIntervalMs: week,
        lastSnapshotAt: now - week + 1,
      })
    ).toEqual({ action: 'skip', reason: 'interval' });
    expect(
      decide({
        minIntervalMs: week,
        lastSnapshotAt: now - week,
      })
    ).toEqual({ action: 'snapshot' });
  });
});
