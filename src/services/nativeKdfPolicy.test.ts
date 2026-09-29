import {
  assertJsArgon2Allowed,
  isJsArgon2FallbackAllowed,
  NativeKdfUnavailableError,
} from './nativeKdfPolicy';

describe('nativeKdfPolicy', () => {
  it('allows JS Argon2 under Jest', () => {
    expect(isJsArgon2FallbackAllowed()).toBe(true);
    expect(() => assertJsArgon2Allowed(65_536)).not.toThrow();
  });

  it('NativeKdfUnavailableError carries a stable code', () => {
    const err = new NativeKdfUnavailableError();
    expect(err.code).toBe('NATIVE_KDF_UNAVAILABLE');
    expect(err.name).toBe('NativeKdfUnavailableError');
  });
});
