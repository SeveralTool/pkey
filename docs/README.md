# Documentation Index

Auditor-facing documentation for the public source snapshot. Maintainer playbooks (store, EAS, lab checklists, agent protocols) live only in the private development repository.

PKEY is a local-first Expo React Native password manager with a shared `@pkey/core` domain library and an embedded Solid.js web client. UI is bilingual (**ESP** / **ING**). License: **audit-only / source-available** (see [LICENSE](../LICENSE)). Maintained solely by SeveralTool — external code contributions are not accepted.

## Structure

```text
docs/
├── README.md                         This index
├── GETTING_STARTED.md                Audit clone / local run (not production)
├── CONTRIBUTING.md                   Project policy (no external contributions)
├── SECURITY.md                       Vulnerability reporting & transparency
├── THREAT_MODEL.md                   Threat model (LAN, local, root/forensic)
├── SUPPLY_CHAIN.md                   SBOM / SLSA / crypto pins
├── AUTOFILL.md                       Android autofill + domain matching
├── CODE_OF_CONDUCT.md                Standards for public interaction
├── CHANGELOG.md                      Notable changes
├── PERFORMANCE.md                    Performance measurement
├── MOBILE_APP.md                     Expo app layer (`src/`)
├── CORE_PACKAGE.md                   `@pkey/core`
├── WEB_CLIENT.md                     Solid.js LAN web vault
├── NATIVE_MODULE_WEB_ACCESS.md       Android FG module
├── SCRIPTS.md                        Build & validation scripts
├── templates/procedures/             User help articles (mirrors `src/constants/procedures`)
└── legal/                            Privacy, Terms, notices
```

## Start here

| Document | Topic |
|----------|-------|
| [GETTING_STARTED.md](./GETTING_STARTED.md) | Audit clone / local run (not a product install) |
| [../README.md](../README.md) | Product overview, official app, license |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Technical architecture |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | Project policy — no external contributions |
| [SECURITY.md](./SECURITY.md) | Report vulnerabilities; audit & privacy posture |
| [THREAT_MODEL.md](./THREAT_MODEL.md) | LAN, local, root/forensic threat model |
| [AUTOFILL.md](./AUTOFILL.md) | Android autofill service + domain match |
| [legal/README.md](./legal/README.md) | Store / distribution legal templates |

## Technical reference

| Document | Topic |
|----------|-------|
| [MOBILE_APP.md](./MOBILE_APP.md) | Mobile app (`src/`) |
| [CORE_PACKAGE.md](./CORE_PACKAGE.md) | Shared `@pkey/core` |
| [WEB_CLIENT.md](./WEB_CLIENT.md) | Embedded LAN web vault |
| [NATIVE_MODULE_WEB_ACCESS.md](./NATIVE_MODULE_WEB_ACCESS.md) | `pkey-web-access` |
| [SCRIPTS.md](./SCRIPTS.md) | Build / fixture / OTP scripts |
| [PERFORMANCE.md](./PERFORMANCE.md) | Performance guidance |

## Policy & history

| Document | Topic |
|----------|-------|
| [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md) | Standards for issues / public interaction |
| [CHANGELOG.md](./CHANGELOG.md) | Keep a Changelog |

## Legal

| Document | Purpose |
|----------|---------|
| [Privacy Policy](./legal/PRIVACY_POLICY.md) | App users (stores) |
| [Terms of Service](./legal/TERMS_OF_SERVICE.md) | EULA |
| [Official app & source](./legal/OFFICIAL_APP.md) | Ownership / canonical repo |
| [Third-party notices](./legal/THIRD_PARTY_NOTICES.md) | OSS attributions |

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
