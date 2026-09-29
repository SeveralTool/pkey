# `src/services`

Device-side services: crypto, encrypted vault I/O, biometrics, backups, LAN sync/web, and device migration.

Secrets (biometric unlock bundle, TLS private key, unlock throttle, **migration pairing secret**, **web-access host pairing secret**) go in `expo-secure-store`. The master password is never persisted; the session root key lives in memory (`sessionKey.ts`).

See **[docs/MOBILE_APP.md](../../docs/MOBILE_APP.md)** for ports, web sync, and migration.
