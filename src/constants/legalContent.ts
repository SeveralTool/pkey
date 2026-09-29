/**
 * Canonical in-app legal document bodies (English).
 * Privacy, terms, and official-app texts must not include dates or names of
 * people, companies, or entities. Third-party notices and the source license
 * retain copyright lines that those licenses require.
 * Keep in sync with docs/legal/*.md after attorney review.
 */
import { OFFICIAL_REPO_URL } from './legalContact';

export type LegalDocumentId =
  'privacy' | 'terms' | 'third_party' | 'official_app' | 'source_license';

export const LEGAL_DOCUMENT_IDS: LegalDocumentId[] = [
  'privacy',
  'terms',
  'official_app',
  'third_party',
  'source_license',
];

const PRIVACY_POLICY = `Privacy policy of this application

This text describes how the application handles information. It is not a contract with a person or organization identified by name. It applies to the application version shown in Settings.

SUMMARY

This is a local-first password manager. The encrypted vault lives on the device. The application does not operate a vault cloud and does not receive the master password, decrypted vault contents, or decryption keys during normal use.

1. WHAT IS NOT COLLECTED

The application does not intentionally collect, store, or sell:
• Master passwords or vault secrets (passwords, seed phrases, OTP secrets, secure notes)
• Decrypted vault contents
• Biometric templates (fingerprint or face data held by the operating system)
• A centralized account profile tied to the vault

2. WHAT STAYS ON THE DEVICE

The application stores data locally, including:
• Encrypted vault database
• Cryptographic keys and salts (platform secure storage where available)
• App settings
• A stable per-install identifier for local-network pairing
• Migration certificates between the user's own devices
• Optional biometric unlock material (the operating system verifies biometrics; templates are not sent off the device)

The master password is not recoverable if it is lost.

3. PERMISSIONS AND FEATURES

Camera — Only when a scan is started (pairing or migration). Processing stays on the device.

Local network — Optional web access, migration, or sync between devices the user controls. Vault traffic on this path is not routed to a publisher vault server.

Location — Optional. Requested only when a scan of the Wi-Fi name is started on LAN web access. On Android 13+ the platform permission is nearby Wi-Fi devices, not location. Coordinates are not collected or sent.

Notifications — Optional on-device alerts.

Internet — Used when opening links, importing files the user selects, fetching site icons if that option is enabled (the site host name is sent to external icon hosts), and an optional breach check that sends only a short prefix of a password hash (not the password and not the full hash). Those network options are off by default.

Clipboard — Secrets copied on the device may sit on the clipboard briefly and are cleared by the application after a short delay. Clipboard contents are not collected by the publisher.

Autofill — On Android, when the user chooses this application as the system autofill service, the system may ask it to fill login fields in other apps only for that purpose while the vault is unlocked.

4. CONTACT

If a message is sent through the support channel on the store listing, the publisher receives what was written. Do not send the master password or vault exports.

5. THIRD-PARTY SERVICES (UNNAMED)

• Application stores of the operating system
• Site-icon hosts, if remote icon lookup is enabled (the host name of a saved site is sent)
• An optional public breach-prefix service (short hash prefix only)
• Operating-system secure storage and biometrics

6. ADVERTISING AND ANALYTICS

This version does not include third-party advertising or analytics SDKs.

7. CHILDREN

This application is not directed at children. It is not intended for people under 13. The publisher does not knowingly collect personal information from children under 13.

8. RIGHTS AND DELETION

Vault data stays on the device. To delete it, uninstall the application or erase the application data. The publisher cannot delete a vault it does not host.

9. SECURITY

The vault is encrypted on the device (password-based key derivation and authenticated encryption). No system is infallible.

10. CHANGES

If this text changes, it is updated inside the application together with a new application version.`;

const TERMS_OF_SERVICE = `Terms of use

By installing or using the application, these terms are accepted. If they are not accepted, do not use the application. They apply to the application version shown in Settings.

CAPACITY

By accepting these terms, the user represents that they have legal capacity to contract, or that a person with that capacity has authorized this use.

LICENSE

A limited, non-exclusive, non-transferable license is granted to install and use the application on devices the user owns or controls, for personal or internal password-management needs. This does not include a right to redistribute the application or to present a modified copy as the official application.

RESTRICTIONS

It is not permitted to: circumvent security controls; rent, sublicense, sell, or redistribute the application; modify the application or its published source and republish it (including unofficial store listings); or use the application to violate the law.

THE VAULT

The encrypted vault is stored on the device. Nobody in the distribution channel can recover the master password. The user is responsible for backups, device security, and the local network if web access or migration is enabled. Lost master passwords cannot be recovered.

UPDATES

Updates may be provided through the store. Some updates may be required for continued use.

THIRD-PARTY SOFTWARE

The application includes open-source components. See Third-Party Notices in Settings. Those notices reproduce copyright lines that third-party licenses require.

PRIVACY

The Privacy Policy in Settings describes how the application handles information.

AS PROVIDED

The application is provided “as is”. To the extent permitted by law, there is no warranty of availability or that data will never be lost (including device failure, user error, or loss of the master password).

CRYPTOGRAPHY AND EXPORT

The application uses encryption. Applicable export and sanctions rules must be respected.

END

Use may stop at any time by uninstalling the application.`;

const OFFICIAL_APP = `Official application and source

This notice identifies the official application and its canonical public source. It does not name a person or organization.

OFFICIAL APPLICATION

Only copies obtained through the store listing for this application, or other channels indicated in that listing, are official and supported.

SOURCE

The canonical public source is the repository linked from the store listing and from Build integrity in Settings. It is published for security audit and transparency. Rebuilt or republished copies from that source are not official and are not supported.

WHAT THIS MEANS

• The official application is maintained only through those channels; unsolicited external code contributions are not accepted.
• The published source may not be modified and redistributed as an application without permission from the publisher identified on the store listing.
• Factual references to the name PKEY are fine; an unofficial copy must not be presented as the official application.

UNOFFICIAL COPIES

If this application was installed from an unknown source, or rebuilt from the public source and redistributed, treat it as untrusted. Integrity and security cannot be guaranteed for unofficial copies.`;

const THIRD_PARTY_NOTICES = `Third-Party Notices

The copyright lines below are required by third-party licenses and are reproduced unchanged. This is a non-exhaustive summary of major components. A complete list may be regenerated from project dependencies before each release.

APPLICATION DEPENDENCIES (MOBILE)
• React / React Native — MIT — Meta Platforms, Inc.
• Expo — MIT — 650 Industries, Inc.
• crypto-es — MIT
• aes-js — MIT — Richard Moore
• zxcvbn — MIT — Dropbox, Inc.
• @react-native-async-storage/async-storage — MIT
• expo-secure-store / expo-local-authentication — MIT — 650 Industries, Inc.
• react-native-tcp-socket — MIT
• react-native-zeroconf — MIT
• selfsigned — MIT
• pako / fflate — MIT

WEB CLIENT (@pkey/web-client)
• Solid.js — MIT
• Vite — MIT

RUNTIME NETWORK SERVICES (USER-TRIGGERED)
When enabled by the user, the application or the local-network web client may request:
• Site icons from external hosts (the saved site host name is sent)
• An optional public breach-prefix lookup (a short password-hash prefix only; not the password)

These services are operated by third parties under their own terms.

MIT LICENSE (REPRESENTATIVE)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.`;

const SOURCE_LICENSE = `PKEY — Auditable Source Code License

Copyright (c) 2026 SeveralTool. All rights reserved.

This screen reproduces the source-code license. Copyright lines required by that license are kept as written.

OFFICIAL APPLICATION

PKEY is developed and owned by SeveralTool. The official public source code repository is:

${OFFICIAL_REPO_URL}

Only application builds distributed through channels authorized by SeveralTool are official. Rebuilt or republished copies from this source are not official and are not supported.

PURPOSE OF THIS REPOSITORY

Published for TRANSPARENCY and SECURITY AUDIT only.

1. WHAT YOU MAY DO

• READ and REVIEW the source code for security audit purposes.
• BUILD and RUN the software in a private, controlled environment solely for that audit.

2. WHAT YOU MAY NOT DO

Unless SeveralTool gives prior written permission, you may NOT:
• Use the software as your own product or in production.
• MODIFY the source code and redistribute, republish, or sublicense it.
• Distribute compiled binaries (APK, IPA, etc.) derived from this source.
• Present a modified or rebuilt copy as the official PKEY application.

3. CONTRIBUTIONS

External code contributions (including unsolicited pull requests) are NOT accepted. The official application is maintained solely by SeveralTool.

Security vulnerabilities must be reported privately as described in docs/SECURITY.md. Responsible disclosure does not grant any right to modify, redistribute, or claim authorship of the software.

4. NO WARRANTY

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND.

5. COPYRIGHT

Unauthorized copying, modification, or redistribution may violate applicable copyright law.`;

const BODIES: Record<LegalDocumentId, string> = {
  privacy: PRIVACY_POLICY,
  terms: TERMS_OF_SERVICE,
  official_app: OFFICIAL_APP,
  third_party: THIRD_PARTY_NOTICES,
  source_license: SOURCE_LICENSE,
};

/** Documents that must not include dates or names of people, companies, or entities. */
export const NAME_FREE_LEGAL_DOCUMENT_IDS: readonly LegalDocumentId[] = [
  'privacy',
  'terms',
  'official_app',
];

/** Returns the canonical English legal body for in-app display. */
export function getLegalDocumentBody(id: LegalDocumentId): string {
  return BODIES[id];
}
