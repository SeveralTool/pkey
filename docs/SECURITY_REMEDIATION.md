# Security remediation matrix

Living traceability for the 2026 local-first audit. Status values: `open` · `in_progress` · `done` · `accepted-risk` · `external`.

| ID | Correction | Phase | Standard | Evidence | Status |
|----|------------|-------|----------|----------|--------|
| H1 | Wipe vault state on lock; native `dropKey` | F1+F4 | MASVS-STORAGE / RESILIENCE | `AuthContext.handleLogout`, `pkey-crypto` | done |
| H2 | `pkey-vault-keys` hardware-bound bundle | F2 | MASVS-AUTH, NIST 800-63B | `modules/pkey-vault-keys` | done |
| H3 | SPAKE2 protocol v3 + SAS 6 digits + strict offline | F5 | ASVS V2/V6, MASVS-NETWORK | `packages/core/src/sync/spake2.ts`, `buildSyncAuthProof`, `ChallengeStore.verifySpake2` | done |
| H4 | Argon2id + XChaCha20-Poly1305 envelope v4 + device secret | F4 | RFC 9106, RFC 8439 | `packages/core/src/crypto/envelopeV4.ts`, `rfc9106.kat.test.ts`, `pkey-crypto` `selfTestKdfKat`/`selfTestAeadKat`, `src/services/nativeVault.ts` | done |
| M1 | SecretStore on mobile | F1 | MASVS-STORAGE | `src/services/vaultSecrets.ts` | done |
| M2 | PBKDF2 cache not keyed by SHA-256(password) | F1 | MASVS-CRYPTO | `packages/core/src/crypto/index.ts` | done |
| M3 | Exponential unlock throttle | F1 | NIST 800-63B throttling | `src/services/unlockThrottle.ts` | done |
| M4 | Autofill biometric dataset + native wipe | F3 | MASVS-STORAGE | `modules/pkey-autofill` | done |
| M5 | Foreground idle lock | F1 | MASVS-AUTH-2 | `src/hooks/useForegroundIdleLock.ts` | done |
| M6 | Document NSC cleartext; strict offline; SPAKE2 | F3/F5 | MASVS-NETWORK | plugin comment + settings | done |
| M7 | `disableDeviceFallback` on vault unlock | F2 | MASVS-AUTH-3 | `src/services/biometrics.ts` | done |
| M8 | `allowBackup=false` + data extraction rules | F3 | MASVS-STORAGE-8 | `plugins/with-backup-rules` | done |
| M9 | Plaintext export re-auth + encrypted export | F3 | MASVS-STORAGE-5 | `src/services/backup.ts` | done |
| M10 | Native root/jailbreak detection (best-effort) | F3 | MASVS-RESILIENCE-1 | `pkey-vault-keys` | done |
| L1 | `hkdfExpand` length > 32 throws | F4 | RFC 5869 | `packages/core/src/crypto/index.ts` | done |
| L2 | Constant-time legacy unsalted compare | F4 | MASVS-CRYPTO | `src/services/crypto.ts` | done |
| L3 | Migration cert RSA-3072, 2 years | F5 | NIST 800-57 | `src/services/tlsCredentials.ts` | done |
| I1 | Argon2 + SBOM/SLSA docs + pentest scope | F4/F6/F7 | RFC 9106, SLSA | CI + this file | done / external |
| I2 | Restore hardening / TLS validation docs | F0 | — | this tree | done |
| I3 | Password policy 12 / zxcvbn 4 locked in CI | F0 | NIST 800-63B | `masterPasswordPolicy.test.ts` | done |

## MASVS L2 self-assessment (summary)

| Control | Verdict | Evidence |
|---------|---------|----------|
| STORAGE | Partial → L2 for vault ciphertext, backups, autofill session cache | v4 envelope, allowBackup=false, SecretStore, autofill wipe |
| CRYPTO | Meets L2 primitives for vault; wire CBC still in v2 grace; Android KDF/AEAD native after KAT | Argon2id RFC 9106 KAT, XChaCha20-Poly1305, HKDF, constant-time compares; JS hex dropped after native handle |
| AUTH | Meets L2 for vault unlock when hardware module is linked | CryptoObject / biometryCurrentSet, disableDeviceFallback, idle lock |
| NETWORK | Partial | SPAKE2 + SAS-6; HTTP shell accepted-risk; strict offline kill switch |
| PLATFORM | Partial | backup rules, FLAG_SECURE already present, root banner best-effort |
| CODE QUALITY | Partial | CI tests, SBOM, audit-ci; no SLSA provenance from EAS |
| RESILIENCE | Partial | throttle, wipe on lock, root detection dissuasive only |

FIPS 140-3, Hermes string zeroization, and malware on an unlocked device remain accepted platform limits ([THREAT_MODEL.md](./THREAT_MODEL.md)).

## External pentest (Fase 7)

Status: **external** — this repository cannot book a lab. Suggested scope for a third party:

1. Envelope v4 (Argon2id parameters, AAD, upgrade v1–v3→v4)
2. SPAKE2 handshake + SAS-6 MITM lab
3. Biometric bundle extraction on a rooted device (`pkey-vault-keys`)
4. Post-lock JS heap / `dropKey` native buffer
5. Autofill dataset authentication and BOOT_COMPLETED wipe
6. Backup / `adb backup` / data extraction rules
7. Device-secret recovery kit lockout and `.pkey` portability

Until an external report exists, Play Console must keep “no independent lab review”.

## Accepted platform limits

See [THREAT_MODEL.md](./THREAT_MODEL.md) “Out of scope”. Hermes string zeroization, FIPS 140-3, EAS bit-for-bit reproducibility, and malware on an *unlocked* device are documented accepted risks.
