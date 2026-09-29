# Documentation Index

Central index for PKEY project documentation. All active docs live in this folder (flat files) plus `legal/`. Obsolete engineering notes are in [`../archive/`](../archive/).

PKEY is a local-first Expo React Native password manager with a shared `@pkey/core` domain library and an embedded Solid.js web client. UI is bilingual (**ESP** / **ING**). License: **audit-only / source-available** (see [LICENSE](../LICENSE)). Maintained solely by SeveralTool — external code contributions are not accepted.

## Structure

```text
docs/
├── README.md                         This index
├── GETTING_STARTED.md                Clone / audit run / public vs private repos
├── DEPLOYMENT.md                     Android / iOS / PWA / EAS / SHA-256
├── DEPLOY_CHECKLIST.md               Google Play launch tracker (living checklist)
├── store/PLAY_LISTING.md             Play Store listing copy + screenshot recipe
├── CONTRIBUTING.md                   Project policy (no external contributions)
├── SECURITY.md                       Vulnerability reporting & transparency
├── THREAT_MODEL.md                   Threat model (LAN, local, root/forensic)
├── SECURITY_REMEDIATION.md           Finding → fix matrix (living)
├── SUPPLY_CHAIN.md                   SBOM / SLSA / crypto pins
├── SECURITY_HARDENING_VALIDATION.md  Hardening lab checklist
├── MIGRATION_TLS_VALIDATION.md       Peer TLS checks
├── evidence/                         Manifest snapshots / lab notes
├── AUTOFILL.md                       Android autofill + domain matching
├── CODE_OF_CONDUCT.md                Standards for public interaction
├── A11Y_MANUAL_CHECKLIST.md          Manual VoiceOver / TalkBack / keyboard passes
├── CHANGELOG.md                      Notable changes
├── PERFORMANCE.md                    Performance measurement
├── MOBILE_APP.md                     Expo app layer (`src/`)
├── CORE_PACKAGE.md                   `@pkey/core`
├── WEB_CLIENT.md                     Solid.js LAN web vault
├── NATIVE_MODULE_WEB_ACCESS.md       Android FG module
├── SCRIPTS.md                        Build & validation scripts
├── ANDROID_DEBUG_APK.md              Sideload / debug APK notes
├── templates/procedures/             User help articles (mobile; mirrors `src/constants/procedures`)
└── legal/                            Privacy, Terms, notices
```

Root [`archive/`](../archive/) holds historical design notes (not active product docs).

## Start here

| Document | Topic |
|----------|-------|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Clone, install, audit run, public vs private repos |
| [../README.md](../README.md) | Prerequisites, install, first run |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Builds, EAS, APK/AAB, verification hashes |
| [DEPLOY_CHECKLIST.md](./DEPLOY_CHECKLIST.md) | Google Play launch tracker — mark items as they close |
| [store/PLAY_LISTING.md](./store/PLAY_LISTING.md) | Play Store title, descriptions, graphics, screenshots |
| [legal/PLAY_CONSOLE.md](./legal/PLAY_CONSOLE.md) | Data safety / IARC / permission answers for Console |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Project policy — no external contributions |
| [SECURITY.md](./SECURITY.md) | Report vulnerabilities; audit & privacy posture |
| [THREAT_MODEL.md](./THREAT_MODEL.md) | LAN, local, root/forensic threat model |
| [SECURITY_REMEDIATION.md](./SECURITY_REMEDIATION.md) | Audit finding → fix matrix |
| [SECURITY_HARDENING_VALIDATION.md](./SECURITY_HARDENING_VALIDATION.md) | Hardening lab checklist |
| [AUTOFILL.md](./AUTOFILL.md) | Android autofill service + domain match |
| [legal/README.md](./legal/README.md) | Store / distribution legal templates |

## Technical reference

| Document | Topic |
|----------|-------|
| [MOBILE_APP.md](./MOBILE_APP.md) | Mobile app (`src/`) |
| [CORE_PACKAGE.md](./CORE_PACKAGE.md) | Shared `@pkey/core` |
| [WEB_CLIENT.md](./WEB_CLIENT.md) | Embedded LAN web vault |
| [WEB_MDNS_VALIDATION.md](./WEB_MDNS_VALIDATION.md) | Lab checklist for `.local` / Windows |
| [NATIVE_MODULE_WEB_ACCESS.md](./NATIVE_MODULE_WEB_ACCESS.md) | `pkey-web-access` |
| [SCRIPTS.md](./SCRIPTS.md) | Build / fixture / OTP scripts |
| [PERFORMANCE.md](./PERFORMANCE.md) | Performance guidance |
| [ANDROID_DEBUG_APK.md](./ANDROID_DEBUG_APK.md) | Sideload / debug APK notes |

## Policy & history

| Document | Topic |
|----------|-------|
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | Standards for issues / public interaction |
| [CHANGELOG.md](./CHANGELOG.md) | Keep a Changelog |
| [../archive/README.md](../archive/README.md) | Obsolete engineering archives |

## Legal

| Document | Purpose |
|----------|---------|
| [Privacy Policy](./legal/PRIVACY_POLICY.md) | App users (stores) |
| [Terms of Service](./legal/TERMS_OF_SERVICE.md) | EULA |
| [Official app & source](./legal/OFFICIAL_APP.md) | Ownership / canonical repo |
| [Third-party notices](./legal/THIRD_PARTY_NOTICES.md) | OSS attributions |
| [Play Console answers](./legal/PLAY_CONSOLE.md) | Data safety, IARC, permissions |

## Environment variables

Documented at project level in [`.env.example`](../.env.example):

| Variable | Purpose |
|----------|---------|
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Optional Android SDK for native builds |
| `CI` | Playwright / CI |

No cloud API keys — the vault runs fully on-device.

## How to test locally

```bash
npm test
npm run test:core
npm run test:web
npm run test:e2e
```
