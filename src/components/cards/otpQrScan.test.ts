import { processOtpBarcodeScan } from './otpQrScan';

describe('processOtpBarcodeScan', () => {
  it('returns valid for otpauth URI', () => {
    const result = processOtpBarcodeScan('otpauth://totp/Test?secret=JBSWY3DPEHPK3PXP');
    expect(result).toEqual({
      kind: 'valid',
      parsed: expect.objectContaining({ secret: 'JBSWY3DPEHPK3PXP' }),
    });
  });

  it('returns invalid for non-otpauth data', () => {
    expect(processOtpBarcodeScan('not-a-valid-uri')).toEqual({ kind: 'invalid' });
    expect(processOtpBarcodeScan('otpauth://totp/x?secret=INVALID0')).toEqual({ kind: 'invalid' });
  });
});
