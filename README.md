# PKEY

[![CI](https://github.com/SeveralTool/pkey/actions/workflows/ci.yml/badge.svg)](https://github.com/SeveralTool/pkey/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Audit%20Only-red.svg)](./LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.31-brightgreen.svg)](./package.json)
[![Expo SDK](https://img.shields.io/badge/Expo-SDK%2056-000.svg)](https://expo.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)

**PKEY** is a **local-first password manager**: your vault is encrypted on device, never uploaded to a vendor cloud. Unlock with a master password (and optional biometrics), manage cards with OTP/TOTP, import from popular managers, open the vault in a browser on your LAN (`http://…:7392`), and migrate vaults between phones over TLS.

<p align="center">
  <img src="assets/logo/PKEY.png" alt="PKEY logo" width="160" />
</p>

> Demo / screenshots: see [`assets/logo/`](assets/logo/) for brand art. Replace this section with device screenshots or a GIF when available.

## Features

- **Local-first vault** — AES-encrypted database on device; master key derived with PBKDF2 (600,000 iterations on current vaults). Optional internet features (site icons, breach check) are off by default.
- **Bilingual UI** — Spanish (ESP) and English (ING)
- **Cards** — passwords, seed phrases, notes, tags, icons, TOTP/HOTP
- **Import** — Bitwarden, 1Password, Dashlane, NordPass, Keeper, Chrome, Firefox, LastPass, Enpass, generic CSV
- **LAN web access** — HTTP browser vault served from the phone (Solid.js; trusted Wi‑Fi; E2E sync)
- **Device migration** — encrypted peer-to-peer transfer with pairing
- **Monorepo** — shared `@pkey/core`, Expo mobile app, embedded web client

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | **22** (LTS; matches CI) |
| npm | 10+ (workspaces) |
| Expo / Android Studio | For device or emulator builds |
| Git | Latest |

Optional: `ANDROID_HOME` / `ANDROID_SDK_ROOT` for APK builds (see [`.env.example`](.env.example)).

## Installation

```bash
git clone https://github.com/SeveralTool/pkey.git
cd pkey
npm ci
```

> Packages are marked `"private": true` — they are **not** published to npm. The source is published for **security audit only**; see [LICENSE](LICENSE).

### Development (Expo)

```bash
# Rebuild shared packages + embed PWA into the mobile app
npm run prebuild:mobile

# Start Expo (dev client)
npm start
```

Then press `a` for Android, or scan the QR code with a development build.

### Web client (standalone)

```bash
npm run build:core
npm run dev:web
```

### Debug APK

```bash
# Requires Android SDK
npm run build:apk
# Output: builds/android/pkey-debug.apk
```

## Basic usage

1. Create a vault with a strong master password (it cannot be recovered if lost).
2. Add cards, tags, and OTP secrets as needed.
3. Optionally enable biometrics and auto-lock in **Settings**.
4. Enable **Web access** to open the vault from a browser on the same Wi-Fi.
5. Export a local backup before wiping or migrating devices.

## Advanced usage

| Workflow | Docs / commands |
|----------|-----------------|
| Import third-party exports | [docs/CORE_PACKAGE.md](docs/CORE_PACKAGE.md#importers) |
| Embed PWA into mobile | `npm run embed:pwa` — [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) |
| Core purity (no RN in `@pkey/core`) | `npm run check:core-purity` |
| OTP validation vs otplib | `npm run validate:otp` |
| Architecture & security notes | [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) · [docs/README.md](docs/README.md) |

## Project structure

```text
pkey/
├── App.tsx                 # Expo entry shell
├── src/                    # Mobile app (screens, services, context)
├── packages/
│   ├── core/               # @pkey/core — crypto, vault, sync, importers
│   └── web-client/         # Solid + Vite PWA
├── modules/
│   └── pkey-web-access/    # Android foreground service Expo module
├── scripts/                # APK, embed PWA, fixtures, OTP checks
├── docs/                   # Active documentation (+ legal/)
├── archive/                # Obsolete engineering notes
├── assets/                 # Icons, splash, brand
└── .github/workflows/      # CI
```

Docs: [Getting started](docs/GETTING_STARTED.md) · [Architecture](docs/ARCHITECTURE.md) · [Deployment](docs/DEPLOYMENT.md) · [Index](docs/README.md)

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Expo dev client |
| `npm run lint` | ESLint (expo) |
| `npm run format` / `format:check` | Prettier |
| `npm test` | Jest (mobile) |
| `npm run test:core` | Vitest (`@pkey/core`) |
| `npm run test:web` | Vitest (web-client) |
| `npm run test:e2e` | Playwright smoke |
| `npm run prebuild:mobile` | build core + web + embed PWA |
| `npm run build:apk` | Debug APK |
| `npm run legal:notices` | Generate third-party license report |
| `npm run legal:site` | Build GitHub Pages HTML from `docs/legal/` |
| `npm run sync:public` | Copy a clean tree into the public clone (no history) |

## Project policy

PKEY is **source-available** for security audit and transparency. It is maintained solely by **SeveralTool**; **external code contributions are not accepted**. See **[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)**.

- Audit setup: **[docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)**
- Security reports (private): **[docs/SECURITY.md](docs/SECURITY.md)**
- Public interaction: **[docs/CODE_OF_CONDUCT.md](docs/CODE_OF_CONDUCT.md)**

## License

**Audit-only / source-available** — published for security transparency and audit. See [LICENSE](LICENSE) and [NOTICE](NOTICE).

You may read and review the source for security purposes. Production use, modification, distribution, and derivative works are not permitted except as described in LICENSE. Official builds are distributed through SeveralTool-authorized channels (e.g. App Store, Google Play).

## Legal (app distribution)

Draft templates for App Store / Play Store (have a lawyer review before publishing):

| Document | Purpose |
|----------|---------|
| [Privacy Policy](docs/legal/PRIVACY_POLICY.md) | Required by Apple and Google |
| [Terms of Service](docs/legal/TERMS_OF_SERVICE.md) | EULA for app users |
| [Official app & source](docs/legal/OFFICIAL_APP.md) | Ownership and canonical GitHub repo |
| [Third-party notices](docs/legal/THIRD_PARTY_NOTICES.md) | OSS attributions |

See [docs/legal/README.md](docs/legal/README.md) for the store-submission checklist.

## Acknowledgments

- Built with [Expo](https://expo.dev), [React Native](https://reactnative.dev), [Solid.js](https://www.solidjs.com/), and [Vite](https://vitejs.dev/)
- Crypto primitives via battle-tested libraries (`crypto-es`, platform secure stores)

---

**Disclaimer:** PKEY stores secrets only on your devices. You are responsible for backups and for keeping your master password safe. Lost master passwords cannot be recovered.
