# Security hardening validation

Living checklist for the remediations in [SECURITY_REMEDIATION.md](./SECURITY_REMEDIATION.md). Fill the **Lab** column on a physical device. Automated tests cover the rest.

| Control | Finding | Automated | Lab | Notes |
|---------|---------|-----------|-----|-------|
| Logout wipes in-memory vault | H1 | Jest (`AuthContext` / secret store) | Heap dump post-lock | JS strings are not zeroizable (Hermes) |
| SecretStore on mobile | M1 | Jest | Confirm reveal still works | Display cards must not carry `passwordList` |
| PBKDF2 cache not keyed by SHA-256(password) | M2 | Vitest core | — | Process HMAC key |
| Foreground idle lock | M5 | Jest hook | Leave app idle 1/5/15 min | Independent of background `autoLogout` |
| Exponential unlock throttle | M3 | Jest `unlockThrottle` | — | Offline defense is still the KDF |
| Hardware-bound biometric bundle | H2 | Module tests | Rooted device extract | `pkey-vault-keys` |
| No device-PIN fallback on vault unlock | M7 | Jest wrapper | Confirm PIN cannot unlock vault | Secondary actions may still allow PIN |
| `allowBackup=false` + data extraction rules | M8 | Manifest snapshot | `adb backup` | [evidence/ANDROID_MANIFEST_SNAPSHOT.md](./evidence/ANDROID_MANIFEST_SNAPSHOT.md) |
| Autofill biometric per dataset + native wipe | M4 | JVM tests | Fill a login | `BOOT_COMPLETED` must clear cache |
| Plaintext export re-auth + encrypted option | M9 | Jest | Share CSV | |
| Root/jailbreak banner (best-effort) | M10 | Unit | Emulator with Magisk | Not a security boundary |
| Argon2id envelope v4 + XChaCha20-Poly1305 | H4 | KAT RFC 9106 + noble XChaCha | Unlock time on low-end | Native `pkey-crypto` (Android BC KDF+AEAD; iOS argon2 C + JS AEAD); 0 JS 64 MiB in production |
| Device secret opt-in | H4 | Jest | `.pkey` on second device | Recovery kit required |
| `hkdfExpand` refuses length > 32 | L1 | Vitest | — | |
| Legacy unsalted compare is constant-time | L2 | Jest | — | |
| SPAKE2 password login + SAS 6 digits | H3 | Vitest + Playwright | MITM lab | Protocol v3 |
| Migration cert ECDSA P-256 / RSA-3072, 2 years | L3 | Jest TLS helper | Inspect PEM | |
| Strict offline profile | H3/M6 | Jest settings | `netstat` with profile on | |
| SBOM + SHA-256 of AAB | I1 | CI | — | [DEPLOYMENT.md](./DEPLOYMENT.md) |

## Pass / fail

- Fail if any **Automated** row lacks a green CI job on `main`.
- Fail if biometric unlock succeeds without a TEE/Keychain prompt on a production build.
- Pass if JS Argon2 (PWA / Jest m=32) and native Argon2 (mobile) match the RFC 9106 KATs byte-for-byte.
- Fail if production password unlock runs Argon2id 64 MiB in JS (Hermes).
