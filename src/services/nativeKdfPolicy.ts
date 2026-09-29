/**
 * Production never runs Argon2id 64 MiB in JS. Tests / explicit DEV flag may.
 */

export class NativeKdfUnavailableError extends Error {
  readonly code = 'NATIVE_KDF_UNAVAILABLE' as const;

  constructor(message = 'Native Argon2id KDF is unavailable') {
    super(message);
    this.name = 'NativeKdfUnavailableError';
  }
}

export function isNativeKdfUnavailableError(err: unknown): err is NativeKdfUnavailableError {
  if (err instanceof NativeKdfUnavailableError) return true;
  if (!err || typeof err !== 'object') return false;
  return (err as { code?: unknown }).code === 'NATIVE_KDF_UNAVAILABLE';
}

/**
 * JS Argon2 is allowed in Jest, or when `PKEY_ALLOW_JS_ARGON2=1` (DEV only).
 * Release builds must fail-closed on password unlock if native KDF is down.
 */
export function isJsArgon2FallbackAllowed(): boolean {
  if (typeof process !== 'undefined') {
    if (process.env.NODE_ENV === 'test') return true;
    if (process.env.PKEY_ALLOW_JS_ARGON2 === '1' && typeof __DEV__ !== 'undefined' && __DEV__) {
      return true;
    }
  }
  return false;
}

export const JS_ARGON2_PRODUCTION_MEM_KIB = 65_536;

/**
 * Refuses a JS Argon2id invocation at production memory outside the allow-list.
 * Callers must not use the result for unlock if this throws.
 */
export function assertJsArgon2Allowed(memoryKiB: number): void {
  if (isJsArgon2FallbackAllowed()) return;
  console.error('[kdf] refused JS Argon2id outside allow-list (no secrets logged)', {
    m: memoryKiB,
  });
  throw new NativeKdfUnavailableError();
}
