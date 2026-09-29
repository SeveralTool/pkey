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
| `storeUnlockBundle(json, prompt)` | AES-GCM wrap inside Keystore / Keychain; shows a biometric prompt (write is opt-in). |
| `loadUnlockBundle(prompt)` | Decrypt only via `BiometricPrompt.CryptoObject` / Keychain `LAContext`. |
| `clearUnlockBundle()` | Deletes ciphertext + key alias. |
| `isHardwareBacked()` | `strongbox` \| `tee` \| `keychain` \| `none`. |
| `detectCompromisedDevice()` | su/Magisk/test-keys (Android); Cydia / sandbox escape (iOS). |
| `storeDeviceSecret` / `loadDeviceSecret` | 128-bit device binding secret, same user-auth key class. |

JS `expo-secure-store` remains a documented fallback if this module is missing (Expo Go).
