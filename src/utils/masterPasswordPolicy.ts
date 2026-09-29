/**
 * @fileoverview Master-password length/strength policy for vault creation.
 */
import { getZxcvbn } from './lazyZxcvbn';

export type MasterPasswordRejectReason = 'length' | 'weak';

/**
 * Minimum acceptable length. Raised from 10 → 12 after audit finding M9:
 * 10-char passphrases with a decent structure barely resist a 2-3 GPU rig
 * offline attack against PBKDF2. 12 chars plus zxcvbn score 4 keeps offline
 * brute force cost-prohibitive without a 14-char floor that deters users.
 */
export const MIN_MASTER_PASSWORD_LENGTH = 12;

/**
 * Minimum zxcvbn score required (0-4). Score 4 == "no practical crack in
 * < 1 century assuming 10^10 guesses/s". This rejects `Correct-horse-battery`
 * style sentences that Wikipedia already indexed.
 */
export const MIN_MASTER_PASSWORD_ZXCVBN_SCORE = 4;

/**
 * Evaluates whether a candidate master password meets minimum policy.
 *
 * Accepts length ≥ {@link MIN_MASTER_PASSWORD_LENGTH} AND zxcvbn score
 * ≥ {@link MIN_MASTER_PASSWORD_ZXCVBN_SCORE}. Both conditions must hold —
 * length alone is not sufficient (e.g. `aaaaaaaaaaaaaa`), and a strong short
 * password gives an attacker too small a search space to brute-force offline
 * once they have the encrypted vault file.
 */
export function evaluateMasterPasswordStrength(password: string): {
  ok: boolean;
  reason?: MasterPasswordRejectReason;
  score: number;
} {
  const score = password ? getZxcvbn()(password).score : 0;
  if (password.length < MIN_MASTER_PASSWORD_LENGTH) {
    return { ok: false, reason: 'length', score };
  }
  if (score < MIN_MASTER_PASSWORD_ZXCVBN_SCORE) {
    return { ok: false, reason: 'weak', score };
  }
  return { ok: true, score };
}

/**
 * Maps zxcvbn score to a localized strength label for UI feedback.
 */
export function masterPasswordStrengthLabel(
  password: string,
  t: { tag_very_weak: string; tag_weak: string; tag_secure: string; tag_strong: string }
): { label: string; score: number } {
  if (!password) return { label: t.tag_very_weak, score: 0 };
  const { score } = getZxcvbn()(password);
  if (score <= 0) return { label: t.tag_very_weak, score };
  if (score === 1) return { label: t.tag_weak, score };
  if (score === 2) return { label: t.tag_secure, score };
  return { label: t.tag_strong, score };
}
