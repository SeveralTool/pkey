# Changelog

All notable changes to PKEY are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- Android autofill keeps the session across the system unbind that happens before the user confirms, cancels an in-flight biometric prompt on lock instead of filling an empty password, and still wipes the cache when the React context is already gone
- Swiping PKEY away stops the Android web-access notification. A killed process no longer restarts that service without the JS server
- Device-bound vaults without a local secret now ask for the recovery kit on login/import and re-seal it into hardware (`DeviceSecretRequiredError`)
- Enabling or disabling the device secret writes the vault first and rolls the session back if that write fails
- `replaceUnlockCredentials` keeps the biometric bundle on Keystore/Keychain instead of silently falling back to SecureStore
- Headless auto-backup flushes a pending vault write and rejects a truncated envelope before copying a snapshot
- Android 1-minute auto-backup keeps copying after leaving PKEY (silent foreground service) instead of waiting until the app is opened again
- Vault file writes are atomic (`.tmp` + `moveAsync`) so a crash mid-save cannot leave a half-written `.pkey`
- Device-migration TLS pinning awaits `getPeerCertificate()` and hashes a 32-hex SHA-256, instead of hashing a Promise
- PWA `vault_fork` / `replaceVault` is single-shot: the source cannot replace the vault again after the first success
- Android 13+ hides the Wi-Fi SSID reveal (location is capped at API 32; the OS redacts `WifiInfo.getSSID()` without it)
- Switching dashboard tabs parks an in-flight fling, so the list offset does not jump ahead when you return
- Android XChaCha uses a real HChaCha20 (never `ChaChaEngine` + 16-byte IV); KDF and AEAD KATs are independent so an XChaCha failure cannot disable Argon2id
- Password unlock no longer re-runs Argon2id in JavaScript after a native derive (or after a failed native open); production never falls back to JS 64 MiB
- Tapping a native OS notification no longer crashes the in-app overlay (`cardBg` of undefined); overlay errors are isolated from the vault UI
- OS notification `data` is string-only (Android extras); tap routing opens Security (browser) or Settings (screenshot)
- Browser-synced alerts no longer put an IP in the lock-screen body; reconnects after provider remount no longer re-spam the tray
- Vault lock stops LAN web access immediately (port + keep-alive) without forgetting the last on/off choice; resume cannot restart `:7392` while locked
- Android web access stays up when the phone is locked or PKEY is minimized (FG keep-alive); background auto-lock is skipped until web access is turned off or PKEY is locked on purpose
- Instant app auto-lock also locks on resume if the OS only sent `inactive` (quick Home/switch); share sheets, Face ID, and permission overlays still do not lock

### Security
- Device migration aborts when the TLS peer certificate is missing or does not match the declared fingerprint. The wipe on port 7394 pins the sender certificate from the encrypted auth body. A staged 16-character pairing secret is not reused
- Logout after migration drops the session root key, SecretStore, autofill, clipboard, and LAN web access. Reset and sender wipe suspend an in-flight automatic backup so it cannot announce a copy of a vault that was just deleted
- A compromised device no longer receives a new fast-unlock bundle in SecureStore. Logout still keeps an existing bundle; reset and migration delete it
- Enabling the device secret no longer deletes that secret after the mixed vault file has already been committed
- Android autofill matches an exact package, an exact host, or a registrable domain with a small multi-label suffix list. A title or a shared public suffix (`paypal.evil.com`, `foo.github.io` vs `bar.github.io`) no longer offers the login. A leftover plaintext cache migrates without loading its passwords
- Device-secret Keystore/Keychain key is not invalidated by biometric re-enrollment (Android `setInvalidatedByBiometricEnrollment(false)`, iOS `.biometryAny`); the fast-unlock bundle still is
- LAN sync rejects protocol v1; a client that sends `spakeShare` is bound to v3; reply wire follows the strongest envelope demonstrated
- Password unlock is native-first: one Argon2id per attempt (Android BouncyCastle; iOS phc-winner-argon2); KDF vs AEAD gates split; Android AEAD must match noble; fail-closed if native KDF is down
- Device-migration `pairingSecret` is stored in SecureStore (device-bound), not AsyncStorage; leftover secrets in pending-migration meta are migrated on read
- Mobile `1M` auto-logout uses wall-clock elapsed time on resume (JS timers freeze while backgrounded); `INSTANT` records `inactive` and re-checks on resume so a missed `background` event still locks
- Tests cover session root key, vault file I/O, biometric bundle (no master password on disk), TLS SAN rotation policy, and native PBKDF2 self-test gate
- Decrypted vault JSON is structurally parsed (`parseEncryptedDatabaseJson`) instead of `JSON.parse as T`; LAN migration `/info`, `/auth`, `/status` use the same pattern; settings/auth/UI/card analysis no longer use `any` for locale, theme, prompts, or settings values

### Changed
- Opening a key pushes a native editor inside the Cards tab. List rows stay collapsed; the form is split into disclosure sections so a tall card scrolls on its own screen
- Native alerts lead with the outcome (backup created, browser opened the vault, screenshot taken) and put the `.pkey` name or client in the body
- Dashboard tab selection lives in its own context (`useDashboardTabName` / `useSetDashboardTab`); inactive tabs freeze React renders
- Cards list, Stats/Security/Settings scroll padding, FAB, and bottom toasts reserve space from the native tab-bar inset helpers instead of magic `150` / `120` / `+72` constants.
- Split in-app notifications by layer: `NotificationProvider` in `src/context/`, overlay UI in `src/components/notifications/`, queue/OS helpers remain in `src/notifications/`
- Auth vault upgrade, screenshot policy, and debounced vault writes extracted from god-contexts; migration QR scanner split from `MigrationFlowScreen`
- Password generator is canonical in `@pkey/core`; mobile re-exports it
- Dashboard tabs / login actions have accessibility roles; crash copy is localized; PWA mounts a Solid `ErrorBoundary`
- Icon-only vault actions (FAB, copy/generate/delete, search/filter, stats chips, prompts) expose accessibility labels; context/hook public surfaces use `Readonly`
- Module READMEs describe the real tree (no stub-only pointers)
- Settings and web-access toggles update UI immediately (`setDb` before debounced disk write; web enable optimistic with busy spinner); rollback + alert if disk write or web server start fails
- Export/backup robustness: free-space indicator + low-space hint, disk precheck with typed errors (`no_space`, share, no vault), busy guard on export buttons, and leaner `.pkey` export via native Base64 read; help procedure `backup_export` with `HelpInfoButton`; biometric/password re-auth required before CSV/JSON/`.pkey` export
- Import-from-manager wizard restricts picker MIME types and validates files in `@pkey/core` (`validateImportInput`); rejects PDF/video/images and non-export extensions; hardened generic CSV detection; help procedures + CORE_PACKAGE docs updated
- Documentation restructured under `docs/` (flat + `legal/`); obsolete notes moved to root `archive/`
- Help procedures document the optional device-secret recovery kit (`backup_export`, `import_restore`, `device_migration`, `master_password`, `danger_zone`, new `device_secret`); Security switch opens that article
- Project license changed from Apache 2.0 to **audit-only** English source terms ([LICENSE](../LICENSE)); docs and package metadata aligned
- Legal docs simplified: official ownership + GitHub source; no trademark claims; no modify/republish
- Removed OS notifications for card deleted and sticky web-access **client-count** status (Android FG keep-alive notification is required by the OS; it now shows a short “LAN web access running in the background” body); removed in-app screenshot toast and save-success toast
- Removed the editable **web-access device name**: the mDNS `.local` URL now uses a fixed platform base name (`pkey-iphone` / `pkey-android`) plus the device-id suffix, eliminating the manual input surface (UI field, AsyncStorage persistence, i18n keys, and unit tests removed)

### Added
- Dashboard uses native tab screens plus a **floating glass pill** (`DashboardFloatingTabBar`): Liquid Glass on iOS 26+, blur on older iOS, translucent capsule on Android. Login and global overlays stay outside React Navigation. `UIContext.currentTab` still drives Stats chips, OS notification routing, and SyncContext.
- **Opt-in breached-password check** via Have I Been Pwned k-anonymity range API (`services/hibpCheck.ts` + `hibpOrchestrator.ts`): `enableHibpCheck` toggle in Settings; global “Check all passwords” (queued, rate-limited); per-card status (`hibp` state: `none`/`checking`/`notAvailable`/`verified`/`breached`) with “Verify” / “Check” actions and auto-check on save of a newly authorized password; batch result infographics; `@pkey/core` HIBP tag (`hibp` badge) synced to PWA; SHA-1 prefix hashing, no raw password leaves the device; new **HIBP vault stats** (checked / breached counts) on the mobile Stats tab and PWA Stats panel with tap-through card filters
- iOS web-access keep-alive in `pkey-web-access` (`UIBackgroundTask`), screen keep-awake while foregrounded, and auto-restart of `:7392` when returning to the app
- OS alert when a **new browser** authenticates to LAN web sync, with a native **Block** action (biometrics or master password); in-app alert with the same action while the app is foregrounded (auto-dismiss after 10s)
- Inline **Saved** tick on the card save button (replaces per-save sync toast)
- Mobile **help procedures**: `HelpInfoButton` + `HelpProcedureModal` on Stats (vault health) and Security (migration, backup/export, import/restore, danger zone); bilingual copy in `src/constants/procedures/` with markdown mirrors under `docs/templates/procedures/`
- Optional **group cards by site** setting (`groupCardsByLink`): mobile Settings switch; list groups credentials sharing a normalized host (Bitwarden-style host match); PWA follows the synced setting (no toggle)
- Short threat model (`docs/THREAT_MODEL.md`); LAN web documented as HTTP + E2E (no installable PWA)
- Field-aware sync merge + overwrite toasts; web outbox coalesces via `mergeCardFields`
- Export CSV / generic JSON (plaintext) alongside `.pkey`
- Android autofill module (`pkey-autofill`) + `matchLoginCandidates` domain ranking
- Secure note card type (`NOTE`), short password `history[]`, audit stats (notes / reused usernames)
- Public project docs: root README, `docs/` (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, architecture, deployment), LICENSE/NOTICE, `.env.example`
- Package/module README stubs pointing at `docs/` for full technical reference
- GitHub issue/PR templates and CI `format:check` (Prettier)
- TOTP (RFC 6238) support: optional `otpSecret` on password cards with copy-OTP UI (mobile + web)
- OTP input validation (Base32 + `otpauth://` URI), time-window offset controls, and QR scan error feedback on mobile
- RFC 4226/6238 test vectors and `validate:otp` cross-check script (otplib) in CI (non-blocking)
- Card tags with normalized storage (`trim`, lowercase, sorted) and search filtering
- Import from Bitwarden JSON, 1Password `.1pif` (zip), Dashlane CSV, and generic CSV with manual column mapping
- `@pkey/core` sync delta module (`fingerprintCard`, `buildSyncIndex`, `computeOutgoingDelta`)
- Web client Stats and Settings panels with settings sync push
- Theme `AUTO` following `prefers-color-scheme` on web
- Gzip compression helpers for migration/sync payloads (`compressPayload` / `decompressPayload`)
- GitHub Actions CI: lint, core purity check, unit tests, build, Playwright smoke, axe a11y
- Typedoc for critical `@pkey/core` APIs (crypto, sync, TOTP)
- MigrationHandler extracted for testable chunk assembly logic
- QR scan for OTP setup on mobile (`expo-camera`) — Sprint 4 backlog item

### Changed
- `PasswordCard` type unified via `@pkey/core` (includes `otpSecret`, `tags`, OTP metadata)
- `useStatistics` delegates to `computeStatistics` in core
- PBKDF2 fast-unlock cache audited across login/import/logout paths

### Security
- `otpSecret` excluded from `DisplayCard` / `sanitizeCardForDisplay`
- Core package CI gate blocks `react-native` / `expo-*` imports in `packages/core`
