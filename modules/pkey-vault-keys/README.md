# pkey-vault-keys

Hardware-bound storage for the biometric unlock bundle and optional device secret.

## Threat model this module covers

- An attacker who dumps app files or a backup **cannot** unwrap the fast-unlock blob without user biometric verification inside the TEE / Secure Enclave.
- Changing enrolled biometrics invalidates the Keystore / Keychain item (`setInvalidatedByBiometricEnrollment` / `biometryCurrentSet`).
- Vault unlock never accepts the device PIN as a stand-in (`BIOMETRIC_STRONG` / `LAPolicy.deviceOwnerAuthenticationWithBiometrics`).
- Root / jailbreak checks are **best-effort deterrence**, not a security boundary.

## API

| Method | Notes |
|--------|--------|
| `storeUnlockBundle(json, prompt)` | AES-GCM wrap inside Keystore / Keychain. **Android prompts BIOMETRIC_STRONG on write** (the key only works inside an authenticated `CryptoObject`); **iOS `SecItemAdd` does not prompt**, and the prompt string is unused. The item is still created with `biometryCurrentSet`. Rejects `E_USER_CANCELED` when the user dismisses the Android prompt. Enabling the device secret prompts **twice** on Android: the device-secret alias, then this bundle alias. iOS shows a separate LocalAuthentication dialog in Security that is not passed into `SecItemAdd`. |
| `loadUnlockBundle(prompt)` | Decrypt only via `BiometricPrompt.CryptoObject` / Keychain `LAContext`. Invalidated by an enrollment change (`setInvalidatedByBiometricEnrollment` / `biometryCurrentSet`). |
| `clearUnlockBundle()` | Deletes ciphertext + key alias. |
| `isHardwareBacked()` | `strongbox` \| `tee` \| `keychain` \| `none`. Android inspects the **bundle** key only (`SECURITY_LEVEL_STRONGBOX`, else `isInsideSecureHardware`). `none` also means that key does not exist yet. iOS always returns `keychain`: a platform label, not a Secure Enclave check (`kSecAttrTokenID` is not set). No screen reads this value. |
| `detectCompromisedDevice()` | su/Magisk/test-keys (Android); Cydia / sandbox escape (iOS). |
| `storeDeviceSecret` / `loadDeviceSecret` | 128-bit device binding secret. User-auth (biometric) on read like the bundle, but **not** invalidated by an enrollment change: the secret must survive adding or removing a fingerprint, otherwise the vault on this phone would need the recovery kit. `storeDeviceSecret` recreates the Android key alias, so re-enabling the secret (or restoring it from the recovery kit at login) migrates keys created by older builds to this policy. |

JS `expo-secure-store` (`pkey_unlock_bundle_v2`, `requireAuthentication: false`) is the fallback when this module is missing or `storeUnlockBundle` fails for a reason other than user cancel. A compromised device does not get that fallback: `persistUnlockCredentials` returns false and writes nothing. `replaceUnlockCredentials` still prefers this module. Logout leaves the bundle in place; reset and migration call `clearUnlockBundle`. Any same-UID `getItemAsync` of the SecureStore item decrypts it without a `CryptoObject`.
