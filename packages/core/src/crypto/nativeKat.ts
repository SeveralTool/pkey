/**
 * Known-answer vectors shared by `@pkey/core` tests and native `pkey-crypto`.
 * Native Android/iOS must stay byte-identical to these; do not “fix” a mismatch
 * by changing the vector.
 */

/** RFC 9106 Appendix A.3 (Argon2id, version 0x13, secret+AD). */
export const RFC9106_ARGON2ID_EXPECTED =
  '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659';

/** Production-shaped Argon2id: P="password", S=16×0x02, t=3, m=32, p=1 (no secret/AD). */
export const ARGON2ID_PROD_PROBE =
  '5b83956135427d78c6e0bb6a9e1b4e6b051b031d7db2b5bac47a7b74aa727076';
export const ARGON2ID_PROD_PROBE_PASSWORD = 'password';
export const ARGON2ID_PROD_PROBE_SALT_HEX = '02'.repeat(16);

/** crypto-es `hkdfExpand("11".repeat(32), "pkey-auth-verify-v1")`. */
export const HKDF_AUTH_KAT = '8287d5f3969993b060e90dc5661f72d4775236e6cb3d0dfd5268895cb43a2313';
export const HKDF_AUTH_KAT_PRK_HEX = '11'.repeat(32);

/** draft-irtf-cfrg-xchacha-03 §2.2.1 HChaCha20. */
export const HCHACHA20_RFC_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
export const HCHACHA20_RFC_NONCE = '000000090000004a0000000031415927';
export const HCHACHA20_RFC_SUBKEY =
  '82413b4227b27bfed30e42508a877d73a0f9e4d58a74a853c12ec41326d348a4';

/** Noble `@noble/ciphers` XChaCha20-Poly1305 companion (AAD `pkey-v4`, PT `hello`). */
export const XCHACHA_KAT_KEY = '000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f';
export const XCHACHA_KAT_NONCE = '000102030405060708090a0b0c0d0e0f1011121314151617';
export const XCHACHA_KAT_AAD = 'pkey-v4';
export const XCHACHA_KAT_PLAINTEXT = 'hello';
export const XCHACHA_KAT_CIPHERTEXT = 'f6a76313ff3c6ad520371222c24115a88b28e1ab81';
