import { describe, it, expect } from 'vitest';
import vectors from './__fixtures__/totp-vectors.json';
import {
  decodeBase32,
  generateHotp,
  generateTotp,
  generateTotpWithWindow,
  getTotpAtOffset,
  getRemainingSeconds,
  isValidBase32,
  normalizeSecret,
  parseOtpAuthUri,
} from './totp';

const SHA1_SECRET = vectors.sha1SecretBase32;

describe('normalizeSecret', () => {
  it('strips whitespace, hyphens and padding', () => {
    expect(normalizeSecret(' ab-cd= ')).toBe('ABCD');
    expect(normalizeSecret('jbswy3dp\n')).toBe('JBSWY3DP');
  });

  it('uppercases lowercase input', () => {
    expect(normalizeSecret('jbswy3dpehpk3pxp')).toBe('JBSWY3DPEHPK3PXP');
  });
});

describe('isValidBase32', () => {
  it('accepts valid secrets', () => {
    expect(isValidBase32('JBSWY3DPEHPK3PXP')).toBe(true);
    expect(isValidBase32('jbs wy3d')).toBe(true);
  });

  it('rejects empty and invalid characters', () => {
    expect(isValidBase32('')).toBe(false);
    expect(isValidBase32('   ')).toBe(false);
    expect(isValidBase32('ABC0')).toBe(false);
    expect(isValidBase32('ABC1')).toBe(false);
    expect(isValidBase32('ABC8')).toBe(false);
    expect(isValidBase32('ABC9')).toBe(false);
  });
});

describe('decodeBase32', () => {
  it('decodes to ASCII bytes for RFC test secret', () => {
    const bytes = decodeBase32(SHA1_SECRET);
    const hex = Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    expect(hex).toBe('3132333435363738393031323334353637383930');
  });

  it('handles spaces, hyphens and lowercase', () => {
    const spaced = decodeBase32('gezd gnbv-gy3t qojq');
    const plain = decodeBase32(SHA1_SECRET.slice(0, 16));
    expect(Array.from(spaced)).toEqual(Array.from(plain));
  });

  it('returns empty array for empty or all-invalid input', () => {
    expect(decodeBase32('')).toEqual(new Uint8Array(0));
    expect(decodeBase32('000111')).toEqual(new Uint8Array(0));
  });
});

describe('generateHotp — RFC 4226 Appendix D', () => {
  it.each(vectors.hotpSha1_6)('counter $counter → $code', ({ counter, code, digits }) => {
    const result = generateHotp(SHA1_SECRET, counter, {
      algorithm: 'SHA1',
      digits: (digits as 6 | 8 | undefined) ?? 6,
    });
    expect(result).toBe(code);
  });
});

describe('generateTotp — RFC 6238 Appendix B', () => {
  it.each(vectors.totpSha1_8)('SHA1 T=$timeSeconds → $code', ({ timeSeconds, code }) => {
    expect(
      generateTotp(SHA1_SECRET, {
        algorithm: 'SHA1',
        digits: 8,
        period: 30,
        timestamp: timeSeconds * 1000,
      })
    ).toBe(code);
  });

  it.each(vectors.totpSha256_8)('SHA256 T=$timeSeconds → $code', ({ timeSeconds, code }) => {
    expect(
      generateTotp(vectors.sha256SecretBase32, {
        algorithm: 'SHA256',
        digits: 8,
        period: 30,
        timestamp: timeSeconds * 1000,
      })
    ).toBe(code);
  });

  it.each(vectors.totpSha512_8)('SHA512 T=$timeSeconds → $code', ({ timeSeconds, code }) => {
    expect(
      generateTotp(vectors.sha512SecretBase32, {
        algorithm: 'SHA512',
        digits: 8,
        period: 30,
        timestamp: timeSeconds * 1000,
      })
    ).toBe(code);
  });

  it('returns empty string for missing secret', () => {
    expect(generateTotp('')).toBe('');
    expect(generateTotp(undefined as unknown as string)).toBe('');
  });

  it('pads to requested digit length', () => {
    expect(generateHotp(SHA1_SECRET, 1, { digits: 6 })).toHaveLength(6);
  });
});

describe('generateTotpWithWindow', () => {
  const ts = 59 * 30 * 1000;

  it('returns three distinct codes for window=1', () => {
    const codes = generateTotpWithWindow(SHA1_SECRET, 1, {
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      timestamp: ts,
    });
    expect(codes).toHaveLength(3);
    expect(new Set(codes).size).toBe(3);
  });

  it('getTotpAtOffset returns center code at offset 0', () => {
    const direct = generateTotp(SHA1_SECRET, {
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      timestamp: ts,
    });
    expect(
      getTotpAtOffset(SHA1_SECRET, 0, 1, {
        algorithm: 'SHA1',
        digits: 8,
        period: 30,
        timestamp: ts,
      })
    ).toBe(direct);
  });

  it('getTotpAtOffset returns adjacent period codes', () => {
    const prev = getTotpAtOffset(SHA1_SECRET, -1, 1, {
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      timestamp: ts,
    });
    const next = getTotpAtOffset(SHA1_SECRET, 1, 1, {
      algorithm: 'SHA1',
      digits: 8,
      period: 30,
      timestamp: ts,
    });
    expect(prev).toHaveLength(8);
    expect(next).toHaveLength(8);
    expect(prev).not.toBe(next);
  });
});

describe('parseOtpAuthUri', () => {
  it('parses standard totp URI', () => {
    const parsed = parseOtpAuthUri(
      'otpauth://totp/Issuer:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Issuer&algorithm=SHA1&digits=6&period=30'
    );
    expect(parsed?.secret).toBe('JBSWY3DPEHPK3PXP');
    expect(parsed?.issuer).toBe('Issuer');
    expect(parsed?.account).toBe('user@example.com');
    expect(parsed?.digits).toBe(6);
    expect(parsed?.period).toBe(30);
  });

  it('parses Google-style URI with issuer in path', () => {
    const parsed = parseOtpAuthUri(
      'otpauth://totp/Google:user@gmail.com?secret=JBSWY3DPEHPK3PXP&issuer=Google'
    );
    expect(parsed?.issuer).toBe('Google');
    expect(parsed?.account).toBe('user@gmail.com');
  });

  it('parses Microsoft-style URI with SHA256 and 8 digits', () => {
    const parsed = parseOtpAuthUri(
      'otpauth://totp/Microsoft:user@outlook.com?secret=JBSWY3DPEHPK3PXP&algorithm=SHA256&digits=8&period=60'
    );
    expect(parsed?.algorithm).toBe('SHA256');
    expect(parsed?.digits).toBe(8);
    expect(parsed?.period).toBe(60);
  });

  it('normalizes secret with spaces in URI', () => {
    const parsed = parseOtpAuthUri('otpauth://totp/Test?secret=jbsw y3dp');
    expect(parsed?.secret).toBe('JBSWY3DP');
  });

  it('defaults invalid algorithm to SHA1', () => {
    const parsed = parseOtpAuthUri('otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP&algorithm=MD5');
    expect(parsed?.algorithm).toBe('SHA1');
  });

  it('parses hotp URI', () => {
    const parsed = parseOtpAuthUri('otpauth://hotp/Test?secret=JBSWY3DPEHPK3PXP');
    expect(parsed?.secret).toBe('JBSWY3DPEHPK3PXP');
  });

  it('returns null for invalid URI or secret', () => {
    expect(parseOtpAuthUri('not-a-uri')).toBeNull();
    expect(parseOtpAuthUri('otpauth://totp/test')).toBeNull();
    expect(parseOtpAuthUri('otpauth://totp/test?secret=INVALID0')).toBeNull();
  });
});

describe('getRemainingSeconds', () => {
  it('returns exact remaining seconds', () => {
    expect(getRemainingSeconds(30, 45_000)).toBe(15);
    expect(getRemainingSeconds(30, 30_000)).toBe(30);
    expect(getRemainingSeconds(30, 0)).toBe(30);
  });
});
