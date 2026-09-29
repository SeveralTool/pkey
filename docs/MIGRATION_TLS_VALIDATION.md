# Migration TLS validation

Manual + code checks for peer vault transfer on ports **7393** / **7394**.

## Protocol

- Transport: TLS between phones.
- Pairing secret: 15 bytes (120 bits) Crockford Base32, shown as `XXXX-XXXX-XXXX-XXXX-XXXX-XXXX`. Historic 80-bit codes are accepted only during a grace window (see [SECURITY_REMEDIATION.md](./SECURITY_REMEDIATION.md) L3).
- Application frames: PSK + HKDF + authenticated encryption (`application/pkey-migration-v2+json`).
- Certificate: ECDSA P-256 preferred; RSA-3072 fallback. Validity **2 years**, regenerated when SANs change or the cert expires. Fingerprint is shown on both devices; the user must compare it.

## What to verify

1. Sender (unlocked vault) and receiver on the same trusted LAN, no client isolation.
2. Receiver shows the pairing code / QR. Sender scans or types it.
3. Both screens show the TLS certificate fingerprint. **Abort if they differ.**
4. Transfer completes. Receiver unlocks with the **same master password** (and recovery kit if device-secret is on).
5. Ciphertext on the wire is not a raw vault JSON (sniff with a lab proxy on a debug build only).

## Matrix

| Pair | Fingerprint match | Transfer | Unlock on receiver | Notes |
| --- | --- | --- | --- | --- |
| Android → Android | | | | |
| Android → iOS | | | | |
| iOS → Android | | | | |
| iOS → iOS | | | | |
| Mixed versions (grace pairing) | | | | 80-bit legacy |

## Pass / fail

- Fail if mDNS broadcasts the pairing secret.
- Fail if the cert lifetime is > 2 years on a newly generated credential.
- Fail if a fingerprint mismatch is ignored.
- Pass if an aborted pairing leaves no pending vault on the receiver.
