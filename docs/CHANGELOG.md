# Changelog

All notable changes to PKEY are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed
- Android XChaCha uses a real HChaCha20 (never `ChaChaEngine` + 16-byte IV); KDF and AEAD KATs are independent so an XChaCha failure cannot disable Argon2id
- Password unlock no longer re-runs Argon2id in JavaScript after a native derive (or after a failed native open); production never falls back to JS 64 MiB
- Tapping a native OS notification no longer crashes the in-app overlay (`cardBg` of undefined); overlay errors are isolated from the vault UI
- OS notification `data` is string-only (Android extras); tap routing opens Security (browser) or Settings (screenshot)
- Browser-synced alerts no longer put an IP in the lock-screen body; reconnects after provider remount no longer re-spam the tray
- Vault lock stops LAN web access immediately (port + keep-alive) without forgetting the last on/off choice; resume cannot restart `:7392` while locked
- Android web access stays up when the phone is locked or PKEY is minimized (FG keep-alive); background auto-lock is skipped until web access is turned off or PKEY is locked on purpose
- Instant app auto-lock also locks on resume if the OS only sent `inactive` (quick Home/switch); share sheets, Face ID, and permission overlays still do not lock

### Security
- Password unlock is native-first: one Argon2id per attempt (Android BouncyCastle; iOS phc-winner-argon2); KDF vs AEAD gates split; Android AEAD must match noble; fail-closed if native KDF is down
- Device-migration `pairingSecret` is stored in SecureStore (device-bound), not AsyncStorage; leftover secrets in pending-migration meta are migrated on read
- Mobile `1M` auto-logout uses wall-clock elapsed time on resume (JS timers freeze while backgrounded); `INSTANT` records `inactive` and re-checks on resume so a missed `background` event still locks
- Tests cover session root key, vault file I/O, biometric bundle (no master password on disk), TLS SAN rotation policy, and native PBKDF2 self-test gate
- Decrypted vault JSON is structurally parsed (`parseEncryptedDatabaseJson`) instead of `JSON.parse as T`; LAN migration `/info`, `/auth`, `/status` use the same pattern; settings/auth/UI/card analysis no longer use `any` for locale, theme, prompts, or settings values

### Changed
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
