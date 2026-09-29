# Privacy policy of this application

This text describes how the application handles information. It is not a contract with a person or organization identified by name. It applies to the application version shown in Settings. Keep in sync with the in-app body in `src/constants/legalContent.ts`.

## Summary

This is a **local-first password manager**. The encrypted vault lives on the device. The application does not operate a vault cloud and does not receive the master password, decrypted vault contents, or decryption keys during normal use.

## 1. What is not collected

The application does not intentionally collect, store, or sell:

- Master passwords or vault secrets (passwords, seed phrases, OTP secrets, secure notes)
- Decrypted vault contents
- Biometric templates (fingerprint or face data held by the operating system)
- A centralized account profile tied to the vault

## 2. What stays on the device

The application stores data locally, including:

| Data | Purpose |
|------|---------|
| Encrypted vault database | Saved credentials and related metadata |
| Cryptographic keys and salts | Unlocking and protecting the vault (platform secure storage where available) |
| App settings | Language, theme, security preferences |
| Per-install identifier | Local-network pairing |
| Migration certificates | Transfer between the user's own devices |
| Optional biometric unlock material | Fast unlock; the operating system verifies biometrics; templates are not sent off the device |

The master password is not recoverable if it is lost.

## 3. Permissions and features

**Camera** — Only when a scan is started (pairing or migration). Processing stays on the device.

**Local network** — Optional web access, migration, or sync between devices the user controls. Vault traffic on this path is not routed to a publisher vault server.

**Location** — Optional. Requested only when a scan of the Wi-Fi name is started on LAN web access. On Android 13+ the platform permission is nearby Wi-Fi devices, not location. Coordinates are not collected or sent.

**Notifications** — Optional on-device alerts.

**Internet** — Used when opening links, importing files the user selects, fetching site icons if that option is enabled (the site host name is sent to external icon hosts), and an optional breach check that sends only a short prefix of a password hash (not the password and not the full hash). Those network options are off by default.

**Clipboard** — Secrets copied on the device may sit on the clipboard briefly and are cleared by the application after a short delay. Clipboard contents are not collected by the publisher.

**Autofill** — On Android, when the user chooses this application as the system autofill service, the system may ask it to fill login fields in other apps only for that purpose while the vault is unlocked.

## 4. Contact

If a message is sent through the support channel on the store listing, the publisher receives what was written. Do not send the master password or vault exports.

## 5. Third-party services (unnamed)

- Application stores of the operating system
- Site-icon hosts, if remote icon lookup is enabled (the host name of a saved site is sent)
- An optional public breach-prefix service (short hash prefix only)
- Operating-system secure storage and biometrics

## 6. Advertising and analytics

This version does not include third-party advertising or analytics SDKs.

## 7. Children

This application is not directed at children. It is not intended for people under 13. The publisher does not knowingly collect personal information from children under 13.

## 8. Rights and deletion

Vault data stays on the device. To delete it, uninstall the application or erase the application data. The publisher cannot delete a vault it does not host.

## 9. Security

The vault is encrypted on the device (password-based key derivation and authenticated encryption). No system is infallible.

## 10. Changes

If this text changes, it is updated inside the application together with a new application version.
