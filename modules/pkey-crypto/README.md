# pkey-crypto

Native Argon2id (RFC 9106) + XChaCha20-Poly1305 (XChaCha) and a zeroizable root-key holder.

## Why native

Hermes strings cannot be wiped. The root key lives in a native `ByteArray` / `Data` buffer. `dropKey` overwrites it with zeros (`fill(0)` / `resetBytes`). Password unlock must not run Argon2id 64 MiB in JavaScript.

## Caps and probes

`hotPathCaps()` reports what this binary **intends** to do. JS then probes KDF and AEAD **separately**:

| Platform | Caps | Native KDF | Native AEAD |
|----------|------|------------|-------------|
| Android | `{ kdf: true, aead: true }` | BouncyCastle Argon2id + HKDF | HChaCha20 + IETF ChaCha20-Poly1305 (must match noble) |
| iOS | `{ kdf: true, aead: false }` | phc-winner-argon2 + CryptoKit HMAC | JS `@pkey/core` after `exportKey` |

JS gates:

- `selfTestKdfKat()` (Argon2 RFC 9106 + production probe + HKDF). Independent of XChaCha.
- `selfTestAeadKat()` (HChaCha draft vector + noble XChaCha ciphertext). Independent of Argon2.
- `decryptVault` of the noble companion vector. This is the Expo JSON API, not only an in-process seal/open. A native-only roundtrip that does not match noble stays **off** (JS AEAD), so fallback cannot brick the vault.

`selfTestKat()` remains `kdf && aead` on Android and `kdf` on iOS. JS **must not** AND both capabilities on that single call: an XChaCha failure must not disable Argon2.

Native methods never throw on KAT failure; they return `false`. Production password unlock **fail-closes** if KDF is not ready (no silent JS 64 MiB). Biometric unlock does not derive.

## Android hot path

HChaCha20 is implemented in Kotlin. Do **not** initialize BouncyCastle `ChaChaEngine` with a 16-byte nonce (`ChaChaEngine` is original ChaCha, 8-byte IV). IETF `ChaCha20Poly1305` uses the 12-byte XChaCha nonce `0x00000000 || nonce[16..23]`.

After both KATs pass:

1. `deriveRootKey` → opaque handle. **At most once per unlock.**
2. `encryptVault` / `decryptVault` for v4 envelopes (AAD = canonical header JSON).
3. JS hex dropped from `sessionKey` while native AEAD is up.
4. `exportKey` for biometric persist, device-secret mix, and JS AEAD if AEAD is down.

If native wrap throws at runtime, JS XChaCha takes over without a second Argon2. Wrong password does not demote the AEAD gate.

BouncyCastle (`bcprov-jdk15to18`) — same artifact as the rest of the Android classpath. Pure Java, no `.so`, so the 16 KB page-size check is unaffected.

## iOS

`deriveRootKey` / `hkdfExpand` / `selfTestKdfKat` use vendored **phc-winner-argon2** C (static, `ARGON2_NO_THREADS`) plus CryptoKit HMAC-SHA256. `encryptVault` / `decryptVault` throw `E_USE_JS`; `selfTestAeadKat` is `false`. JS opens XChaCha after `exportKey`. Shipping libsodium/NDK is **gated on lab SLA** (flagship ≥1 s or mid-range ≥2 s after a single native derive) and `npm run check:16kb`.

## API

- `hotPathCaps() → { kdf, aead }`
- `deriveRootKey(password, saltHex, m, t, p) → handle`
- `importKey(keyHex) → handle`
- `exportKey(handle) → keyHex` (copy; does not drop)
- `hkdfExpand(handle, info) → hex` (single-block HKDF-Expand)
- `encryptVault(handle, plaintext, aad) → { nonce, ciphertext } JSON` (Android)
- `decryptVault(handle, envelope, aad) → plaintext` (Android)
- `dropKey(handle)`
- `selfTestKdfKat()` / `selfTestAeadKat()` / `selfTestKat()`
