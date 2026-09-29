import { processOtpInput } from './otpInput';

describe('processOtpInput', () => {
  it('parses a valid otpauth URI', () => {
    const result = processOtpInput(
      'otpauth://totp/Issuer:user@example.com?secret=JBSWY3DPEHPK3PXP&issuer=Issuer&digits=6&period=30'
    );
    expect(result).toEqual({
      kind: 'uri',
      secret: 'JBSWY3DPEHPK3PXP',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
  });

  it('returns invalid_uri for malformed otpauth', () => {
    expect(processOtpInput('otpauth://totp/test')).toEqual({ kind: 'invalid_uri' });
    expect(processOtpInput('otpauth://totp/x?secret=INVALID0')).toEqual({ kind: 'invalid_uri' });
  });

  it('normalizes manual Base32 secret', () => {
    expect(processOtpInput('jbsw y3dp')).toEqual({ kind: 'secret', secret: 'JBSWY3DP' });
  });

  it('returns invalid_secret for non-Base32 input', () => {
    expect(processOtpInput('hello-world!')).toEqual({ kind: 'invalid_secret' });
    expect(processOtpInput('ABC0')).toEqual({ kind: 'invalid_secret' });
  });

  it('returns empty secret for blank input', () => {
    expect(processOtpInput('   ')).toEqual({ kind: 'secret', secret: '' });
  });
});
