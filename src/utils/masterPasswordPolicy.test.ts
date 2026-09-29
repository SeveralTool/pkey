/**
 * @fileoverview Regression lock for master-password policy (audit I3 / M9).
 *
 * CI must fail if MIN_MASTER_PASSWORD_LENGTH drops below 12 or the zxcvbn
 * floor drops below 4. Do not weaken these constants to "fix" UX.
 */
import {
  evaluateMasterPasswordStrength,
  MIN_MASTER_PASSWORD_LENGTH,
  MIN_MASTER_PASSWORD_ZXCVBN_SCORE,
} from './masterPasswordPolicy';

describe('master password policy (I3)', () => {
  it('keeps the audited length floor', () => {
    expect(MIN_MASTER_PASSWORD_LENGTH).toBe(12);
  });

  it('keeps the audited zxcvbn floor', () => {
    expect(MIN_MASTER_PASSWORD_ZXCVBN_SCORE).toBe(4);
  });

  it('rejects passwords shorter than the floor', () => {
    const r = evaluateMasterPasswordStrength('Short1!aB');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('length');
  });

  it('rejects long but weak passwords', () => {
    const r = evaluateMasterPasswordStrength('aaaaaaaaaaaa');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('weak');
  });
});
