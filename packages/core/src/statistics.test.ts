import { describe, it, expect } from 'vitest';
import { computeStatistics, passwordStrengthScore } from './statistics';
import { sha256 } from './crypto/index';
import type { PasswordCard } from '../types';

const card = (id: string, pass: string, overrides: Partial<PasswordCard> = {}): PasswordCard => ({
  id,
  type: 'PASSWORD',
  title: id,
  icon: { type: 'icon', value: 'key' },
  username: 'u',
  passwordList: [pass],
  link: 'https://example.com',
  notes: '',
  creation_date: '2024-01-01T00:00:00.000Z',
  last_update: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

describe('passwordStrengthScore', () => {
  it('scores empty as 0', () => {
    expect(passwordStrengthScore('')).toBe(0);
  });

  it('rewards length and charset variety', () => {
    expect(passwordStrengthScore('abcdefghijkl')).toBeGreaterThanOrEqual(2);
    expect(passwordStrengthScore('Abcdefghijkl1!')).toBeGreaterThanOrEqual(4);
  });
});

describe('computeStatistics', () => {
  it('counts totals and duplicates', () => {
    const stats = computeStatistics([card('1', 'same'), card('2', 'same'), card('3', 'other')]);
    expect(stats.totalCards).toBe(3);
    expect(stats.duplicatedCount).toBe(2);
    expect(stats.duplicatedCardIds).toEqual(expect.arrayContaining(['1', '2']));
    expect(stats.uniqueUsers).toBe(1);
  });

  it('breaks down by type and OTP coverage', () => {
    const stats = computeStatistics([
      card('1', 'StrongPass1!', { otpSecret: 'JBSWY3DPEHPK3PXP' }),
      card('2', 'StrongPass2!', { otpSecret: '' }),
      {
        ...card('3', ''),
        type: 'SECRET_PHRASE',
        passwordList: ['word1', 'word2'],
      },
    ]);
    expect(stats.passwordCount).toBe(2);
    expect(stats.secretPhraseCount).toBe(1);
    expect(stats.noteCount).toBe(0);
    expect(stats.withOtpCount).toBe(1);
    expect(stats.withoutOtpCount).toBe(1);
    expect(stats.otpCoveragePercent).toBe(50);
  });

  it('counts notes and reused usernames', () => {
    const stats = computeStatistics([
      card('1', 'a', { username: 'same@x.com' }),
      card('2', 'b', { username: 'same@x.com' }),
      {
        ...card('3', ''),
        type: 'NOTE',
        username: '',
        notes: 'hello',
        passwordList: [''],
      },
    ]);
    expect(stats.noteCount).toBe(1);
    expect(stats.reusedUsernameCount).toBe(2);
    expect(stats.reusedUsernameCardIds).toEqual(expect.arrayContaining(['1', '2']));
  });

  it('tracks data gaps and tags', () => {
    const stats = computeStatistics([
      card('1', '', { username: '', link: '', tags: [] }),
      card('2', 'ok', { tags: ['Work', 'work', 'personal'] }),
    ]);
    expect(stats.emptyUsernameCount).toBe(1);
    expect(stats.emptyPasswordCount).toBe(1);
    expect(stats.emptyLinkCount).toBe(1);
    expect(stats.untaggedCount).toBe(1);
    expect(stats.uniqueTagCount).toBe(2);
  });

  it('finds oldest and newest updated cards', () => {
    const stats = computeStatistics([
      card('old', 'a', { title: 'Old', last_update: '2020-01-01T00:00:00.000Z' }),
      card('new', 'b', { title: 'New', last_update: '2025-06-01T00:00:00.000Z' }),
    ]);
    expect(stats.oldestUpdated?.id).toBe('old');
    expect(stats.newestUpdated?.id).toBe('new');
  });

  it('counts stale cards and tombstones', () => {
    const now = Date.parse('2025-01-01T00:00:00.000Z');
    const stats = computeStatistics(
      [
        card('stale', 'a', { last_update: '2024-01-01T00:00:00.000Z' }),
        card('fresh', 'b', { last_update: '2024-12-01T00:00:00.000Z' }),
      ],
      { now, tombstones: [{ id: 'gone', deletedAt: '2024-11-01T00:00:00.000Z' }] }
    );
    expect(stats.staleCount).toBe(1);
    expect(stats.staleCardIds).toEqual(['stale']);
    expect(stats.tombstoneCount).toBe(1);
  });

  it('uses custom isWeakPassword and computes health score', () => {
    const stats = computeStatistics(
      [card('1', 'weak'), card('2', 'StrongPass1!'), card('3', 'StrongPass1!')],
      { isWeakPassword: (pw) => pw === 'weak' }
    );
    expect(stats.weakCount).toBe(1);
    expect(stats.weakCardIds).toEqual(['1']);
    expect(stats.duplicatedCount).toBe(2);
    expect(stats.healthScore).toBeLessThan(100);
    expect(stats.healthScore).toBeGreaterThanOrEqual(0);
  });

  it('returns full health for empty vault', () => {
    expect(computeStatistics([]).healthScore).toBe(100);
    expect(computeStatistics([]).otpCoveragePercent).toBe(100);
  });

  it('counts HIBP-checked passwords only while the result matches', () => {
    const pw = 'current-pass-123';
    const stats = computeStatistics([
      card('checked', pw, {
        hibp: { status: 'clean', checkedAt: '2026-01-01T00:00:00.000Z', pwHash: sha256(pw) },
      }),
      card('breached', pw, {
        hibp: {
          status: 'breached',
          count: 7,
          checkedAt: '2026-01-01T00:00:00.000Z',
          pwHash: sha256(pw),
        },
      }),
      // Stale result for an older password: the card is NOT counted as checked.
      card('stale', 'changed-pass', {
        hibp: {
          status: 'clean',
          checkedAt: '2026-01-01T00:00:00.000Z',
          pwHash: sha256('old-pass'),
        },
      }),
      card('empty', ''),
    ]);
    expect(stats.hibpCheckedCount).toBe(2);
    expect(stats.hibpCheckedCardIds).toEqual(expect.arrayContaining(['checked', 'breached']));
    expect(stats.hibpBreachedCount).toBe(1);
    expect(stats.hibpBreachedCardIds).toEqual(['breached']);
  });
});
